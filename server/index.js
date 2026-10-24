// Express API for the pharmacy system. Every route lives in this file; the
// dispense transaction itself is in dispense.js and the database connections
// are in db.js. The built React app (web/dist) is served from here as well,
// so the whole system runs on one port.

import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, ownerPool, interactionsCollection, mongoOutage, setMongoOutage } from "./db.js";
import { preview, confirm, DispenseError } from "./dispense.js";
import { writeSnapshot, scheduleSnapshot } from "./snapshot.js";

const app = express();
app.use(cors());
app.use(express.json());

// lets async route handlers pass their errors to the error handler at the bottom
const wrap = (fn) => (req, res, next) => fn(req, res).catch(next);
const int = (v) => (v === undefined || v === null || v === "" ? null : Number.parseInt(v, 10));

// refresh the readable copy in data/ after anything is written
const dataChanged = () => scheduleSnapshot(pool, interactionsCollection);

// ---------- status and lookups ----------

app.get("/api/health", wrap(async (req, res) => {
  const out = { postgres: "down", mongo: "down", mongo_outage_simulated: mongoOutage() };
  try {
    const r = await pool.query("SELECT version() AS v, now() AS at");
    out.postgres = "ok";
    out.postgres_version = r.rows[0].v.split(",")[0];
  } catch (e) {
    out.postgres_error = e.message;
  }
  try {
    const col = await interactionsCollection();
    out.interactions = await col.estimatedDocumentCount();
    out.mongo = "ok";
  } catch (e) {
    out.mongo_error = "unreachable";
  }
  res.json(out);
}));

app.get("/api/users", wrap(async (req, res) => {
  res.json((await pool.query("SELECT * FROM users ORDER BY user_id")).rows);
}));

// search by brand or generic name, prefix match first
app.get("/api/medicines", wrap(async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const r = await pool.query(
    `SELECT m.*, s.usable_stock, s.next_expiry, s.live_batches
     FROM medicines m JOIN v_stock s ON s.medicine_id = m.medicine_id
     WHERE $1 = '' OR lower(m.name) LIKE $1 || '%' OR lower(m.generic_name) LIKE $1 || '%' OR lower(m.name) LIKE '%' || $1 || '%'
     ORDER BY m.name
     LIMIT 20`,
    [q]
  );
  res.json(r.rows);
}));

// ---------- prescriptions ----------

app.get("/api/prescriptions", wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT p.*, count(pi.item_id) AS items,
            sum(pr.quantity_dispensed) >= sum(pr.quantity_prescribed) AS complete
     FROM prescriptions p
     JOIN prescription_items pi ON pi.prescription_id = p.prescription_id
     JOIN v_prescription_progress pr ON pr.prescription_id = pi.prescription_id AND pr.medicine_id = pi.medicine_id
     GROUP BY p.prescription_id
     ORDER BY p.issued_date DESC, p.prescription_id`
  );
  res.json(r.rows);
}));

// one prescription with each line's prescribed, dispensed and in-stock quantity
app.get("/api/prescriptions/:id", wrap(async (req, res) => {
  const p = await pool.query("SELECT * FROM prescriptions WHERE prescription_id = $1", [int(req.params.id)]);
  if (!p.rowCount) return res.status(404).json({ error: "Prescription not found" });
  const items = await pool.query(
    `SELECT pi.item_id, m.medicine_id, m.name, m.generic_name, m.strength, m.form,
            pr.quantity_prescribed, pr.quantity_dispensed, s.usable_stock
     FROM prescription_items pi
     JOIN medicines m ON m.medicine_id = pi.medicine_id
     JOIN v_prescription_progress pr ON pr.prescription_id = pi.prescription_id AND pr.medicine_id = pi.medicine_id
     JOIN v_stock s ON s.medicine_id = m.medicine_id
     WHERE pi.prescription_id = $1
     ORDER BY m.name`,
    [int(req.params.id)]
  );
  res.json({ ...p.rows[0], items: items.rows });
}));

// header and all lines go in one transaction: a bad line (blank name, unknown
// medicine) rolls the whole prescription back
app.post("/api/prescriptions", wrap(async (req, res) => {
  const b = req.body;
  const items = Array.isArray(b.items) ? b.items.filter((i) => int(i.medicine_id) && int(i.quantity)) : [];
  if (!items.length) return res.status(422).json({ error: "Add at least one medicine" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const p = await client.query(
      `INSERT INTO prescriptions (patient_name, patient_age, doctor_name)
       VALUES ($1, $2, $3) RETURNING *`,
      [String(b.patient_name || "").trim(), int(b.patient_age), String(b.doctor_name || "").trim()]
    );
    const id = p.rows[0].prescription_id;
    for (const i of items) {
      await client.query(
        "INSERT INTO prescription_items (prescription_id, medicine_id, quantity_prescribed) VALUES ($1, $2, $3)",
        [id, int(i.medicine_id), int(i.quantity)]
      );
    }
    await client.query("COMMIT");
    dataChanged();
    res.status(201).json({ ...p.rows[0], items: items.length });
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}));

// ---------- dispensing ----------

// phase 1: FEFO plan and interaction check, nothing locked or written
app.post("/api/dispense/preview", wrap(async (req, res) => {
  const b = req.body;
  res.json(await preview({ prescription_id: int(b.prescription_id), medicine_id: int(b.medicine_id), quantity: int(b.quantity) || 1 }));
}));

// phase 2: the transaction. Every step is recorded with its time so the
// screen can show what the database did, whether it committed or not.
app.post("/api/dispense/confirm", wrap(async (req, res) => {
  const b = req.body;
  const steps = [];
  const t0 = performance.now();
  const trace = (step, data) => steps.push({ t: Math.round(performance.now() - t0), step, ...(data ? { data } : {}) });
  try {
    const out = await confirm(
      {
        prescription_id: int(b.prescription_id),
        medicine_id: int(b.medicine_id),
        quantity: int(b.quantity),
        user_id: int(b.user_id) || 1,
        acknowledged: Array.isArray(b.acknowledged) ? b.acknowledged : []
      },
      { trace }
    );
    dataChanged();
    res.json({ ...out, steps });
  } catch (e) {
    if (e instanceof DispenseError) e.extra = { ...e.extra, steps };
    throw e;
  }
}));

// ---------- inventory ----------

app.get("/api/inventory", wrap(async (req, res) => {
  res.json((await pool.query("SELECT * FROM v_stock ORDER BY name")).rows);
}));

app.get("/api/inventory/near-expiry", wrap(async (req, res) => {
  res.json((await pool.query("SELECT * FROM v_near_expiry")).rows);
}));

// live batches plus anything received in the last year, so expired lots still show
app.get("/api/medicines/:id/batches", wrap(async (req, res) => {
  const r = await pool.query(
    `SELECT batch_id, batch_number, expiry_date, quantity, received_date,
            expiry_date <= current_date AS expired, expiry_date - current_date AS days_left
     FROM batches WHERE medicine_id = $1 AND (quantity > 0 OR received_date > current_date - 365)
     ORDER BY expiry_date, batch_id`,
    [int(req.params.id)]
  );
  res.json(r.rows);
}));

// receiving stock: the batch and its RECEIPT row in the audit log commit together
app.post("/api/batches", wrap(async (req, res) => {
  const b = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ins = await client.query(
      `INSERT INTO batches (medicine_id, batch_number, expiry_date, quantity)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [int(b.medicine_id), String(b.batch_number || "").trim().toUpperCase(), b.expiry_date, int(b.quantity)]
    );
    const batch = ins.rows[0];
    await client.query(
      `INSERT INTO dispensing_events (medicine_id, batch_id, event_type, quantity_changed, performed_by)
       VALUES ($1, $2, 'RECEIPT', $3, $4)`,
      [batch.medicine_id, batch.batch_id, batch.quantity, int(b.user_id) || 4]
    );
    await client.query("COMMIT");
    dataChanged();
    res.status(201).json(batch);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}));

// ---------- audit log and reports ----------

// filtering by medicine uses idx_events_medicine_time
app.get("/api/events", wrap(async (req, res) => {
  const medicine = int(req.query.medicine_id);
  const type = req.query.type ? String(req.query.type).toUpperCase() : null;
  const limit = Math.min(int(req.query.limit) || 100, 500);
  const r = await pool.query(
    `SELECT e.event_id, e.event_type, e.quantity_changed, e.event_timestamp, e.prescription_id,
            m.medicine_id, m.name AS medicine, b.batch_number, u.name AS performed_by
     FROM dispensing_events e
     JOIN medicines m ON m.medicine_id = e.medicine_id
     JOIN batches b ON b.batch_id = e.batch_id
     JOIN users u ON u.user_id = e.performed_by
     WHERE ($1::int IS NULL OR e.medicine_id = $1)
       AND ($2::text IS NULL OR e.event_type = $2)
     ORDER BY e.event_timestamp DESC
     LIMIT $3`,
    [medicine, type, limit]
  );
  res.json(r.rows);
}));

app.get("/api/reports/top-week", wrap(async (req, res) => {
  res.json((await pool.query("SELECT * FROM v_top_week LIMIT 10")).rows);
}));

// ---------- drug interactions (MongoDB) ----------

app.get("/api/interactions", wrap(async (req, res) => {
  const col = await interactionsCollection();
  const drug = req.query.drug ? String(req.query.drug) : null;
  const filter = drug ? { $or: [{ drug_a: drug }, { drug_b: drug }] } : {};
  const docs = await col.find(filter).sort({ drug_a: 1, drug_b: 1 }).toArray();
  res.json(docs);
}));

// any extra fields are accepted; the collection validator only insists on
// drug_a, drug_b and severity. The pair is stored in alphabetical order so
// the unique index sees Warfarin/Aspirin and Aspirin/Warfarin as the same pair.
app.post("/api/interactions", wrap(async (req, res) => {
  const doc = { ...req.body };
  delete doc._id;
  if (typeof doc.drug_a === "string" && typeof doc.drug_b === "string") {
    const [a, b] = [doc.drug_a.trim(), doc.drug_b.trim()].sort((x, y) => x.localeCompare(y));
    doc.drug_a = a;
    doc.drug_b = b;
  }
  doc.source = doc.source || "added in app";
  doc.added_at = new Date();
  const col = await interactionsCollection();
  try {
    const r = await col.insertOne(doc);
    dataChanged();
    res.status(201).json({ ...doc, _id: r.insertedId });
  } catch (e) {
    if (e.code === 121) return res.status(422).json({ error: "Rejected by the collection validator: drug_a, drug_b and a valid severity are required", detail: e.errInfo });
    if (e.code === 11000) return res.status(409).json({ error: "An interaction for this pair already exists" });
    throw e;
  }
}));

// ---------- "Under the hood" demonstrations ----------

// Two pharmacists, one unit. The earliest Cetirizine batch is first set to 1
// (logged as an ADJUSTMENT), then A locks it and holds the lock while B asks
// for the same unit 250 ms later.
app.post("/api/demo/race", wrap(async (req, res) => {
  const medicineId = int(req.body.medicine_id) || 42;
  const holdMs = Math.min(int(req.body.hold_ms) || 2000, 5000);
  const prep = await pool.connect();
  let first;
  try {
    await prep.query("BEGIN");
    const r = await prep.query(
      `SELECT batch_id, batch_number, quantity FROM batches
       WHERE medicine_id = $1 AND quantity > 0 AND expiry_date > current_date
       ORDER BY expiry_date, batch_id LIMIT 1 FOR UPDATE`,
      [medicineId]
    );
    if (!r.rowCount) throw new DispenseError(409, "no_stock", "No stock to race on");
    first = r.rows[0];
    if (first.quantity !== 1) {
      await prep.query("UPDATE batches SET quantity = 1 WHERE batch_id = $1", [first.batch_id]);
      await prep.query(
        `INSERT INTO dispensing_events (medicine_id, batch_id, event_type, quantity_changed, performed_by)
         VALUES ($1, $2, 'ADJUSTMENT', $3, 4)`,
        [medicineId, first.batch_id, 1 - first.quantity]
      );
    }
    await prep.query("COMMIT");
  } catch (e) {
    await prep.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    prep.release();
  }
  const t0 = performance.now();
  const lines = [];
  const tracer = (who) => (step, data) => lines.push({ t: Math.round(performance.now() - t0), who, step, ...(data ? { data } : {}) });
  const run = (who, user, delay, hold) =>
    new Promise((r) => setTimeout(r, delay)).then(() =>
      confirm({ medicine_id: medicineId, quantity: 1, user_id: user }, { trace: tracer(who), holdMs: hold })
        .then((out) => ({ who, ok: true, taken: out.taken }))
        .catch((e) => ({ who, ok: false, error: e.message }))
    );
  const results = await Promise.all([run("A", 1, 0, holdMs), run("B", 2, 250, 0)]);
  dataChanged();
  const after = await pool.query(
    `SELECT batch_number, expiry_date, quantity FROM batches
     WHERE medicine_id = $1 AND expiry_date > current_date AND (quantity > 0 OR batch_id = $2)
     ORDER BY expiry_date, batch_id LIMIT 3`,
    [medicineId, first.batch_id]
  );
  res.json({ medicine_id: medicineId, contested_batch: first.batch_number, hold_ms: holdMs, timeline: lines.sort((a, b) => a.t - b.t), results, after: after.rows });
}));

const EXPLAIN_TARGET = `SELECT * FROM batches
WHERE medicine_id = $1 AND quantity > 0 AND expiry_date > current_date
ORDER BY expiry_date
LIMIT 1`;

async function explain(client, medicineId) {
  const r = await client.query("EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) " + EXPLAIN_TARGET, [medicineId]);
  const text = r.rows.map((x) => x["QUERY PLAN"]).join("\n");
  const ms = Number((text.match(/Execution Time: ([\d.]+) ms/) || [])[1]);
  return { plan: text, execution_ms: ms };
}

// The FEFO query twice: normally, then with index scans switched off for this
// transaction only (SET LOCAL), so the second plan has to scan the whole table.
app.get("/api/demo/explain", wrap(async (req, res) => {
  const medicineId = int(req.query.medicine_id) || 1;
  const client = await pool.connect();
  try {
    const sizes = await client.query(
      "SELECT count(*) AS total, count(*) FILTER (WHERE quantity > 0) AS live FROM batches"
    );
    await client.query("BEGIN");
    const indexed = await explain(client, medicineId);
    await client.query("SET LOCAL enable_indexscan = off");
    await client.query("SET LOCAL enable_bitmapscan = off");
    await client.query("SET LOCAL enable_indexonlyscan = off");
    const scan = await explain(client, medicineId);
    await client.query("ROLLBACK");
    res.json({ query: EXPLAIN_TARGET, batches: sizes.rows[0], with_index: indexed, without_index: scan });
  } finally {
    client.release();
  }
}));

// The same UPDATE on the audit log as both roles. pharmacy_app has no UPDATE
// privilege; pharmacy_owner has it but is stopped by the trigger.
app.post("/api/demo/tamper", wrap(async (req, res) => {
  const sql = "UPDATE dispensing_events SET quantity_changed = -1 WHERE event_id = (SELECT max(event_id) FROM dispensing_events)";
  const attempt = async (who, p) => {
    try {
      await p.query(sql);
      return { who, blocked: false };
    } catch (e) {
      return { who, blocked: true, code: e.code, error: e.message };
    }
  };
  res.json({ sql, attempts: [await attempt("pharmacy_app (the API's role)", pool), await attempt("pharmacy_owner (owns the table)", ownerPool)] });
}));

// simulated MongoDB outage: see setMongoOutage in db.js
app.post("/api/demo/mongo", wrap(async (req, res) => {
  await setMongoOutage(Boolean(req.body.down));
  res.json({ mongo_outage_simulated: mongoOutage() });
}));

// ---------- front end and errors ----------

const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web/dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api).*/, (req, res) => res.sendFile(path.join(dist, "index.html")));
}

// PostgreSQL error codes turned into readable HTTP errors:
// 23505 unique, 23514 check, 23503 foreign key, 23502 not null, 22007/22P02 bad input
app.use((err, req, res, next) => {
  if (err instanceof DispenseError) return res.status(err.status).json({ error: err.message, code: err.code, ...err.extra });
  if (err.code === "23505") return res.status(409).json({ error: "Duplicate: " + err.detail });
  if (err.code === "23514" || err.code === "23503" || err.code === "22007" || err.code === "22P02" || err.code === "23502") {
    return res.status(422).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: err.message });
});

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`pharmacy api on http://localhost:${port}`);
  writeSnapshot(pool, interactionsCollection)
    .then(() => console.log("readable copy of the data written to data/"))
    .catch((e) => console.error("data snapshot failed:", e.message));
});
