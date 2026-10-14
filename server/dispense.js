import { pool, findInteractions, SafetyUnavailable } from "./db.js";

export class DispenseError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const FEFO_SQL = `SELECT batch_id, batch_number, expiry_date, quantity
FROM batches
WHERE medicine_id = $1 AND quantity > 0 AND expiry_date > current_date
  AND batch_id <> ALL($2::int[])
ORDER BY expiry_date, batch_id
LIMIT 1
FOR UPDATE`;

export function fefoPlan(batches, quantity) {
  const plan = [];
  let left = quantity;
  for (const b of batches) {
    if (left <= 0) break;
    if (b.quantity <= 0 || b.expired) continue;
    const take = Math.min(b.quantity, left);
    plan.push({ batch_id: b.batch_id, batch_number: b.batch_number, expiry_date: b.expiry_date, take });
    left -= take;
  }
  return { plan, short_by: Math.max(left, 0) };
}

async function prescriptionContext(db, prescriptionId, medicineId) {
  const rx = await db.query(
    `SELECT pi.medicine_id, m.name, m.generic_name, p.quantity_prescribed, p.quantity_dispensed
     FROM prescription_items pi
     JOIN medicines m ON m.medicine_id = pi.medicine_id
     JOIN v_prescription_progress p ON p.prescription_id = pi.prescription_id AND p.medicine_id = pi.medicine_id
     WHERE pi.prescription_id = $1
     ORDER BY m.name`,
    [prescriptionId]
  );
  if (!rx.rowCount) throw new DispenseError(404, "no_prescription", "Prescription not found");
  const item = rx.rows.find((r) => r.medicine_id === medicineId);
  if (!item) throw new DispenseError(422, "not_on_prescription", "This medicine is not on the prescription");
  return { items: rx.rows, item };
}

function classify(found, generic) {
  const order = { contraindicated: 3, high: 2, moderate: 1, low: 0 };
  const list = found
    .map((d) => ({ ...d, _id: String(d._id), involves_this: d.drug_a === generic || d.drug_b === generic }))
    .sort((a, b) => b.involves_this - a.involves_this || order[b.severity] - order[a.severity]);
  const blocking = list.filter((d) => d.involves_this && d.severity === "contraindicated");
  const needsAck = list.filter((d) => d.involves_this && d.severity !== "contraindicated" && d.severity !== "low");
  return { list, blocking, needsAck };
}

export async function preview({ prescription_id, medicine_id, quantity }) {
  const med = await pool.query("SELECT * FROM medicines WHERE medicine_id = $1", [medicine_id]);
  if (!med.rowCount) throw new DispenseError(404, "no_medicine", "Medicine not found");
  const medicine = med.rows[0];
  const batches = await pool.query(
    `SELECT batch_id, batch_number, expiry_date, quantity, received_date,
            expiry_date <= current_date AS expired,
            expiry_date - current_date AS days_left
     FROM batches
     WHERE medicine_id = $1 AND quantity > 0
     ORDER BY expiry_date, batch_id`,
    [medicine_id]
  );
  const { plan, short_by } = fefoPlan(batches.rows, quantity);
  let rx = null;
  let generics = [medicine.generic_name];
  if (prescription_id) {
    rx = await prescriptionContext(pool, prescription_id, medicine_id);
    generics = rx.items.map((i) => i.generic_name);
  }
  let safety;
  try {
    const r = await findInteractions(generics);
    const c = classify(r.found, medicine.generic_name);
    safety = { status: "ok", pairs_checked: r.pairs_checked, ms: r.ms, interactions: c.list, blocking: c.blocking.length > 0, needs_ack: c.needsAck.map((d) => d._id) };
  } catch (e) {
    if (!(e instanceof SafetyUnavailable)) throw e;
    safety = { status: "unavailable", message: e.message };
  }
  return {
    medicine,
    batches: batches.rows,
    plan,
    short_by,
    prescription: rx && { items: rx.items, remaining: rx.item.quantity_prescribed - rx.item.quantity_dispensed },
    safety
  };
}

export async function confirm(input, opts = {}) {
  const { prescription_id, medicine_id, quantity, user_id, acknowledged = [] } = input;
  const trace = opts.trace || (() => {});
  const holdMs = opts.holdMs || 0;
  if (!Number.isInteger(quantity) || quantity <= 0) throw new DispenseError(422, "bad_quantity", "Quantity must be a positive whole number");
  const client = await pool.connect();
  const taken = [];
  try {
    await client.query("BEGIN");
    trace("BEGIN");
    if (prescription_id) {
      await client.query(
        "SELECT item_id FROM prescription_items WHERE prescription_id = $1 AND medicine_id = $2 FOR UPDATE",
        [prescription_id, medicine_id]
      );
      trace("locked prescription item");
    }
    let left = quantity;
    const seen = [];
    while (left > 0) {
      trace("SELECT ... FOR UPDATE (FEFO)", { excluding: [...seen] });
      const r = await client.query(FEFO_SQL, [medicine_id, seen]);
      if (!r.rowCount) {
        throw new DispenseError(409, "insufficient_stock", `Not enough unexpired stock: short by ${left}`, { short_by: left });
      }
      const b = r.rows[0];
      trace("lock acquired", { batch: b.batch_number, quantity: b.quantity });
      const take = Math.min(b.quantity, left);
      taken.push({ batch_id: b.batch_id, batch_number: b.batch_number, expiry_date: b.expiry_date, before: b.quantity, take });
      seen.push(b.batch_id);
      left -= take;
    }
    if (holdMs) {
      trace(`holding the lock for ${holdMs} ms`);
      await new Promise((res) => setTimeout(res, holdMs));
    }
    const med = await client.query("SELECT generic_name FROM medicines WHERE medicine_id = $1", [medicine_id]);
    const generic = med.rows[0].generic_name;
    let generics = [generic];
    if (prescription_id) {
      const rx = await prescriptionContext(client, prescription_id, medicine_id);
      const remaining = rx.item.quantity_prescribed - rx.item.quantity_dispensed;
      if (quantity > remaining) {
        throw new DispenseError(409, "over_prescription", `Only ${remaining} left to dispense on this prescription`, { remaining });
      }
      generics = rx.items.map((i) => i.generic_name);
    }
    trace("MongoDB interaction check");
    let check;
    try {
      check = await findInteractions(generics);
    } catch (e) {
      if (e instanceof SafetyUnavailable) {
        throw new DispenseError(503, "safety_unavailable", "MongoDB unreachable: dispense blocked and rolled back");
      }
      throw e;
    }
    const c = classify(check.found, generic);
    trace("interactions", { found: check.found.length, ms: check.ms });
    if (c.blocking.length) {
      throw new DispenseError(409, "contraindicated", "Contraindicated combination: dispense refused", { interactions: c.blocking });
    }
    const missing = c.needsAck.filter((d) => !acknowledged.includes(d._id));
    if (missing.length) {
      throw new DispenseError(409, "needs_acknowledgement", "Interaction warning must be acknowledged", { interactions: missing });
    }
    const events = [];
    for (const t of taken) {
      await client.query("UPDATE batches SET quantity = quantity - $1 WHERE batch_id = $2", [t.take, t.batch_id]);
      trace("UPDATE batches", { batch: t.batch_number, from: t.before, to: t.before - t.take });
      const ev = await client.query(
        `INSERT INTO dispensing_events (medicine_id, batch_id, prescription_id, event_type, quantity_changed, performed_by)
         VALUES ($1, $2, $3, 'DISPENSE', $4, $5)
         RETURNING event_id, event_timestamp`,
        [medicine_id, t.batch_id, prescription_id || null, -t.take, user_id]
      );
      events.push(ev.rows[0]);
      trace("INSERT INTO dispensing_events", { event_id: ev.rows[0].event_id });
    }
    await client.query("COMMIT");
    trace("COMMIT");
    return { ok: true, taken, events, interactions: c.list };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    trace("ROLLBACK", { reason: e.code || e.message });
    throw e;
  } finally {
    client.release();
  }
}
