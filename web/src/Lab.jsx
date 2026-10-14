import React, { useState } from "react";
import { api, fmtDate } from "./api.js";

const FEFO_SQL = `BEGIN;
SELECT * FROM batches
WHERE medicine_id = $1 AND quantity > 0
  AND expiry_date > current_date
ORDER BY expiry_date
LIMIT 1
FOR UPDATE;
UPDATE batches SET quantity = quantity - $2 WHERE batch_id = $3;
INSERT INTO dispensing_events (...) VALUES (...);
COMMIT;`;

function Race() {
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setOut(null);
    try {
      setOut(await api("/demo/race", { method: "POST", body: { medicine_id: 42, hold_ms: 2000 } }));
    } catch (e) {
      setOut({ error: e.message });
    } finally {
      setBusy(false);
    }
  };
  const total = out?.timeline?.length ? out.timeline[out.timeline.length - 1].t : 1;
  return (
    <section className="card lab">
      <h3>1. Two pharmacists, the last unit</h3>
      <p className="muted small">
        The earliest batch of Cetirizine is set to exactly 1 unit (an ADJUSTMENT event). Pharmacist A locks it and holds the lock for 2 s; pharmacist B
        asks for the same unit 250 ms later. Real transactions, real row lock.
      </p>
      <pre className="sql">{FEFO_SQL}</pre>
      <button className="primary" disabled={busy} onClick={run}>{busy ? "Racing..." : "Run the race"}</button>
      {out?.error && <p className="errbox">{out.error}</p>}
      {out?.timeline && (
        <>
          <div className="lanes">
            {["A", "B"].map((who) => (
              <div key={who} className="lane">
                <b>Pharmacist {who}</b>
                <ol>
                  {out.timeline.filter((l) => l.who === who).map((l, i) => (
                    <li key={i} className={l.step === "COMMIT" ? "ok" : l.step === "ROLLBACK" ? "bad" : l.step === "lock acquired" ? "lock" : ""}>
                      <code>{String(l.t).padStart(5, " ")} ms</code> {l.step}
                      {l.data && <span className="muted"> {Object.entries(l.data).map(([k, v]) => `${k}=${Array.isArray(v) ? "[" + v.join(",") + "]" : v}`).join(" ")}</span>}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <div className="verdict">
            {out.results.map((r) => (
              <p key={r.who}>
                <b>{r.who}:</b> {r.ok ? `took ${r.taken.map((t) => `${t.take} from ${t.batch_number}`).join(", ")}` : r.error}
              </p>
            ))}
            <p>
              Contested batch <b>{out.contested_batch}</b>. B waited for A's COMMIT, then saw quantity 0 and moved to the next batch by expiry. Stock never double-counted.
            </p>
            <table>
              <thead>
                <tr><th>Batch</th><th>Expiry</th><th>Quantity now</th></tr>
              </thead>
              <tbody>
                {out.after.map((b) => (
                  <tr key={b.batch_number}><td>{b.batch_number}</td><td>{fmtDate(b.expiry_date)}</td><td>{b.quantity}</td></tr>
                ))}
              </tbody>
            </table>
            <p className="muted small">Total {total} ms.</p>
          </div>
        </>
      )}
    </section>
  );
}

function Outage({ health }) {
  const [out, setOut] = useState(null);
  const down = health?.mongo_outage_simulated;
  const toggle = async () => {
    await api("/demo/mongo", { method: "POST", body: { down: !down } });
    setOut(null);
  };
  const attempt = async () => {
    try {
      const r = await api("/dispense/confirm", { method: "POST", body: { prescription_id: 2, medicine_id: 42, quantity: 1, user_id: 1 } });
      setOut({ ok: true, r });
    } catch (e) {
      setOut({ ok: false, message: e.message, steps: e.data?.steps });
    }
  };
  const steps = out?.ok ? out.r.steps : out?.steps;
  return (
    <section className="card lab">
      <h3>2. MongoDB unreachable mid-dispense</h3>
      <p className="muted small">
        Cutting the safety layer points the API's MongoDB driver at a closed port, so every lookup times out exactly as it would if the server were down.
        The dispense below (1 Cetirizine on prescription #2) then has to choose: skip the check, or refuse.
      </p>
      <div className="row">
        <button className={down ? "danger" : ""} onClick={toggle}>{down ? "Restore MongoDB" : "Cut MongoDB"}</button>
        <button className="primary" onClick={attempt}>Attempt the dispense</button>
        <span className={"health " + (health?.mongo === "ok" ? "up" : "down")}><i />MongoDB {health?.mongo === "ok" ? "reachable" : "unreachable"}</span>
      </div>
      {out && (
        <div className={out.ok ? "okbox" : "errbox"}>
          <b>{out.ok ? "Committed" : "Blocked"}</b> {out.ok ? `${out.r.taken[0].take} from ${out.r.taken[0].batch_number}` : out.message}
          {steps && (
            <ol className="steps">
              {steps.map((s, i) => (
                <li key={i} className={s.step === "COMMIT" ? "ok" : s.step === "ROLLBACK" ? "bad" : ""}>
                  <code>{String(s.t).padStart(5, " ")} ms</code> {s.step}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}

function Explain() {
  const [out, setOut] = useState(null);
  const run = async () => setOut(await api("/demo/explain?medicine_id=1"));
  return (
    <section className="card lab">
      <h3>3. Why the FEFO query stays fast</h3>
      <p className="muted small">
        EXPLAIN ANALYZE of the FEFO query, first with the partial B-tree index on (medicine_id, expiry_date) WHERE quantity &gt; 0, then with index scans switched off for that one transaction.
      </p>
      <button className="primary" onClick={run}>Run EXPLAIN ANALYZE</button>
      {out && (
        <>
          <p>
            batches holds <b>{out.batches.total.toLocaleString()}</b> rows, of which <b>{out.batches.live}</b> have stock. The index only stores those.
          </p>
          <div className="lanes">
            <div className="lane">
              <b>With the index: {out.with_index.execution_ms} ms</b>
              <pre className="plan">{out.with_index.plan}</pre>
            </div>
            <div className="lane">
              <b>Without it: {out.without_index.execution_ms} ms</b>
              <pre className="plan">{out.without_index.plan}</pre>
            </div>
          </div>
          <p className="verdict">
            {Math.round(out.without_index.execution_ms / Math.max(out.with_index.execution_ms, 0.001))}x faster with the index.
          </p>
        </>
      )}
    </section>
  );
}

function Tamper() {
  const [out, setOut] = useState(null);
  const run = async () => setOut(await api("/demo/tamper", { method: "POST" }));
  return (
    <section className="card lab">
      <h3>4. Can the audit log be rewritten?</h3>
      <p className="muted small">Two attempts to edit the most recent audit row: once as the API's own role, once as the role that owns the table.</p>
      <button className="primary" onClick={run}>Try to edit the audit log</button>
      {out && (
        <>
          <pre className="sql">{out.sql};</pre>
          {out.attempts.map((a) => (
            <div key={a.who} className={a.blocked ? "errbox" : "okbox"}>
              <b>{a.who}:</b> {a.blocked ? `refused (${a.code}) ${a.error}` : "succeeded"}
            </div>
          ))}
          <p className="muted small">
            The API role was never granted UPDATE on dispensing_events. The owner has the privilege, so the BEFORE UPDATE trigger stops it instead.
          </p>
        </>
      )}
    </section>
  );
}

export default function Lab({ health }) {
  return (
    <div className="labgrid">
      <Race />
      <Outage health={health} />
      <Explain />
      <Tamper />
    </div>
  );
}
