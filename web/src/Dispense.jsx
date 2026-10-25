// Dispense screen: pick a prescription line or search a medicine, see the
// FEFO batch plan and interaction warnings (preview), then Confirm.
// Confirm calls /api/dispense/confirm and shows every step of the
// transaction, whether it committed or rolled back.

import React, { useEffect, useRef, useState } from "react";
import { api, fmtDate } from "./api.js";
import NewPrescription from "./NewPrescription.jsx";

const SEV_LABEL = { contraindicated: "Contraindicated", high: "High severity", moderate: "Moderate severity", low: "Low severity" };
const SKIP = new Set(["_id", "drug_a", "drug_b", "severity", "effect", "recommendation", "source", "added_at", "involves_this"]);

// fields a document has beyond the required ones (mechanism, monitoring, ...)
function extraFields(doc) {
  return Object.entries(doc).filter(([k]) => !SKIP.has(k));
}

function show(v) {
  if (Array.isArray(v)) return v.join(", ");
  if (v && typeof v === "object") return Object.values(v).join(": ");
  if (v === true) return "yes";
  return String(v);
}

// one interaction card; high and moderate ones need the acknowledge box ticked
function Warning({ doc, acked, onAck, needsAck }) {
  return (
    <div className={"warn sev-" + doc.severity + (doc.involves_this ? "" : " other")}>
      <div className="warn-head">
        <span className="tri">!</span>
        <div>
          <b>
            {doc.drug_a} + {doc.drug_b}
          </b>
          <span className="sev">{SEV_LABEL[doc.severity]}</span>
        </div>
      </div>
      <dl>
        <dt>Potential risk</dt>
        <dd>{doc.effect}</dd>
        <dt>Recommendation</dt>
        <dd>{doc.recommendation}</dd>
        {extraFields(doc).map(([k, v]) => (
          <React.Fragment key={k}>
            <dt>{k.replace(/_/g, " ")}</dt>
            <dd>{show(v)}</dd>
          </React.Fragment>
        ))}
      </dl>
      {needsAck && (
        <label className="ack">
          <input type="checkbox" checked={acked} onChange={(e) => onAck(e.target.checked)} /> I have reviewed this warning
        </label>
      )}
    </div>
  );
}

// the transaction trace returned by the server, with times in ms
function Steps({ steps }) {
  if (!steps?.length) return null;
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={i} className={s.step === "COMMIT" ? "ok" : s.step === "ROLLBACK" ? "bad" : ""}>
          <code>{String(s.t).padStart(4, " ")} ms</code> {s.step}
          {s.data && <span className="muted"> {Object.entries(s.data).map(([k, v]) => `${k}=${Array.isArray(v) ? "[" + v.join(",") + "]" : v}`).join("  ")}</span>}
        </li>
      ))}
    </ol>
  );
}

export default function Dispense({ userId, userName }) {
  const [rxList, setRxList] = useState([]);
  const [rxId, setRxId] = useState("");
  const [rx, setRx] = useState(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [medicineId, setMedicineId] = useState(null);
  const [qty, setQty] = useState(10);
  const [pv, setPv] = useState(null);
  const [acks, setAcks] = useState({});
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const searchRef = useRef();

  const loadRxList = () => api("/prescriptions").then(setRxList);
  useEffect(() => {
    loadRxList();
  }, []);

  useEffect(() => {
    setRx(null);
    if (rxId) api("/prescriptions/" + rxId).then(setRx);
  }, [rxId]);

  useEffect(() => {
    if (!query.trim()) return setResults([]);
    const t = setTimeout(() => api("/medicines?q=" + encodeURIComponent(query)).then(setResults), 150);
    return () => clearTimeout(t);
  }, [query]);

  const refreshPreview = () => {
    if (!medicineId) return setPv(null);
    api("/dispense/preview", { method: "POST", body: { prescription_id: rxId || null, medicine_id: medicineId, quantity: Number(qty) || 1 } })
      .then((d) => setPv(d))
      .catch((e) => setPv({ error: e.message }));
  };

  useEffect(refreshPreview, [medicineId, qty, rxId]);

  const pick = (id, defaultQty) => {
    setMedicineId(id);
    if (defaultQty) setQty(defaultQty);
    setQuery("");
    setResults([]);
    setAcks({});
    setOutcome(null);
  };

  const cancel = () => {
    setMedicineId(null);
    setPv(null);
    setAcks({});
    setOutcome({ kind: "cancel" });
  };

    // the server re-checks everything inside the transaction; the screen
    // rules are only there to save a round trip
  const confirm = async () => {
    setBusy(true);
    try {
      const out = await api("/dispense/confirm", {
        method: "POST",
        body: { prescription_id: rxId || null, medicine_id: medicineId, quantity: Number(qty), user_id: userId, acknowledged: Object.keys(acks).filter((k) => acks[k]) }
      });
      setOutcome({ kind: "ok", data: out });
      setAcks({});
      if (rxId) api("/prescriptions/" + rxId).then(setRx);
      loadRxList();
      refreshPreview();
    } catch (e) {
      setOutcome({ kind: "error", message: e.message, data: e.data });
      refreshPreview();
    } finally {
      setBusy(false);
    }
  };

  const med = pv?.medicine;
  const safety = pv?.safety;
  const planIds = new Map((pv?.plan || []).map((p) => [p.batch_id, p.take]));
  const fefoId = pv?.plan?.[0]?.batch_id;
  const mine = safety?.interactions?.filter((d) => d.involves_this) || [];
  const others = safety?.interactions?.filter((d) => !d.involves_this) || [];
  const unacked = (safety?.needs_ack || []).filter((id) => !acks[id]);
  const remaining = pv?.prescription?.remaining;
  const blockedReason = !pv || pv.error
    ? "Select a medicine"
    : safety?.status !== "ok"
    ? "Safety check unavailable"
    : safety.blocking
    ? "Contraindicated combination"
    : pv.short_by > 0
    ? `Short by ${pv.short_by} units`
    : remaining !== undefined && Number(qty) > remaining
    ? `Only ${remaining} left on this prescription`
    : unacked.length
    ? "Acknowledge the warning first"
    : null;

  return (
    <div className="dispense">
      {showNew && (
        <NewPrescription
          onClose={() => setShowNew(false)}
          onCreated={(p) => {
            setShowNew(false);
            loadRxList().then(() => setRxId(String(p.prescription_id)));
            setMedicineId(null);
            setOutcome(null);
          }}
        />
      )}
      <section className="card rx">
        <div className="row">
          <label>
            Prescription
            <select value={rxId} onChange={(e) => { setRxId(e.target.value); setMedicineId(null); setOutcome(null); }}>
              <option value="">Walk-in (no prescription)</option>
              {rxList.map((p) => (
                <option key={p.prescription_id} value={p.prescription_id}>
                  #{p.prescription_id} {p.patient_name}, {p.doctor_name}, {fmtDate(p.issued_date)}{p.complete ? " (complete)" : ""}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="newbtn" onClick={() => setShowNew(!showNew)}>+ New prescription</button>
          <div className="search">
            <span className="glass">&#9906;</span>
            <input ref={searchRef} placeholder="Search medicine" value={query} onChange={(e) => setQuery(e.target.value)} />
            {results.length > 0 && (
              <ul className="results">
                {results.map((m) => (
                  <li key={m.medicine_id} onClick={() => pick(m.medicine_id)}>
                    <b>{m.name}</b> <span className="muted">{m.generic_name}, stock {m.usable_stock}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {rx && (
          <table className="items">
            <thead>
              <tr>
                <th>On prescription #{rx.prescription_id} for {rx.patient_name}{rx.patient_age ? `, ${rx.patient_age} y` : ""}</th>
                <th>Prescribed</th>
                <th>Dispensed</th>
                <th>In stock</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rx.items.map((i) => {
                const left = i.quantity_prescribed - i.quantity_dispensed;
                return (
                  <tr key={i.item_id} className={i.medicine_id === medicineId ? "sel" : ""}>
                    <td>{i.name}</td>
                    <td>{i.quantity_prescribed}</td>
                    <td>{i.quantity_dispensed}</td>
                    <td>{i.usable_stock}</td>
                    <td>
                      {left > 0 ? (
                        <button className="link" onClick={() => pick(i.medicine_id, left)}>Dispense {left}</button>
                      ) : (
                        <span className="done">done</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <div className="split">
        <section className="card main">
          {!med && <p className="empty">Pick a prescription line or search a medicine to begin.</p>}
          {pv?.error && <p className="err">{pv.error}</p>}
          {med && (
            <>
              <div className="med">
                <div className="pill">&#10070;</div>
                <div>
                  <h2>{med.name}</h2>
                  <p className="muted">
                    Strength: {med.strength} | Form: {med.form} | Pack: {med.pack} | {med.manufacturer}
                  </p>
                  <label className="qty">
                    Requested quantity:{" "}
                    <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} /> {med.form.toLowerCase()}s
                    {remaining !== undefined && <span className="muted"> ({remaining} left on prescription)</span>}
                  </label>
                </div>
              </div>
              <table className="batches">
                <thead>
                  <tr>
                    <th />
                    <th>Batch ID</th>
                    <th>Expiry date</th>
                    <th>Quantity</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {pv.batches.map((b) => (
                    <tr key={b.batch_id} className={b.expired ? "expired" : planIds.has(b.batch_id) ? "picked" : ""}>
                      <td>{b.batch_id === fefoId ? "2606" : ""}</td>
                      <td>{b.batch_number}</td>
                      <td>{fmtDate(b.expiry_date)}{!b.expired && b.days_left <= 60 && <span className="soon"> {b.days_left} d</span>}</td>
                      <td>{b.quantity}</td>
                      <td>
                        {b.expired ? (
                          <span className="tag grey">Expired, never dispensed</span>
                        ) : b.batch_id === fefoId ? (
                          <span className="tag">FEFO selected{planIds.get(b.batch_id) < Number(qty) ? `, takes ${planIds.get(b.batch_id)}` : ""}</span>
                        ) : planIds.has(b.batch_id) ? (
                          <span className="tag">then takes {planIds.get(b.batch_id)}</span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="note">
                <span className="i">i</span> FEFO (First Expiry, First Out) batch is auto-selected. A larger request continues into the next batch by expiry, in the same transaction.
              </p>
            </>
          )}
        </section>

        <aside className="card side">
          {!safety && <p className="empty">Interaction check runs against every medicine on the prescription.</p>}
          {safety?.status === "unavailable" && (
            <div className="warn blocked">
              <div className="warn-head">
                <span className="tri">!</span>
                <b>Safety check unavailable</b>
              </div>
              <p>MongoDB could not be reached, so the interaction check cannot run. Dispensing is blocked rather than skipped.</p>
            </div>
          )}
          {safety?.status === "ok" && mine.length === 0 && (
            <div className="clear">
              <b>No interactions found</b>
              <p className="muted">
                {safety.pairs_checked} drug pair{safety.pairs_checked === 1 ? "" : "s"} checked in MongoDB in {safety.ms} ms.
              </p>
            </div>
          )}
          {mine.map((d) => (
            <Warning key={d._id} doc={d} needsAck={safety.needs_ack.includes(d._id)} acked={!!acks[d._id]} onAck={(v) => setAcks({ ...acks, [d._id]: v })} />
          ))}
          {others.length > 0 && <h4 className="others">Elsewhere on this prescription</h4>}
          {others.map((d) => (
            <Warning key={d._id} doc={d} />
          ))}
          {safety?.status === "ok" && mine.length > 0 && <p className="muted small">{safety.pairs_checked} pairs checked in {safety.ms} ms.</p>}
        </aside>
      </div>

      <footer className="card actions">
        <div className="outcome">
          {outcome?.kind === "ok" && (
            <div className="okbox">
              <b>Dispensed and committed.</b> {outcome.data.taken.map((t) => `${t.take} from ${t.batch_number}`).join(", ")}. Audit event{outcome.data.events.length > 1 ? "s" : ""}{" "}
              {outcome.data.events.map((e) => "#" + e.event_id).join(", ")} written in the same transaction by {userName}.
              <Steps steps={outcome.data.steps} />
            </div>
          )}
          {outcome?.kind === "error" && (
            <div className="errbox">
              <b>Rolled back.</b> {outcome.message}
              <Steps steps={outcome.data?.steps} />
            </div>
          )}
          {outcome?.kind === "cancel" && <div className="muted">Cancelled. Nothing was written.</div>}
          {!outcome && blockedReason && medicineId && <span className="muted">{blockedReason}</span>}
        </div>
        <button className="primary" disabled={!!blockedReason || busy} onClick={confirm}>
          {busy ? "Committing..." : "Confirm Dispense"}
        </button>
        <button onClick={cancel} disabled={busy}>Cancel</button>
      </footer>
    </div>
  );
}
