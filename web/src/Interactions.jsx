// Interactions screen: every MongoDB document, and a box to insert a new one.
// Extra fields are accepted; the collection validator rejects a document
// without drug_a, drug_b or a valid severity.

import React, { useEffect, useState } from "react";
import { api } from "./api.js";

const SAMPLE = `{
  "drug_a": "Ciprofloxacin",
  "drug_b": "Calcium Carbonate",
  "severity": "moderate",
  "effect": "Reduced absorption of ciprofloxacin",
  "recommendation": "Take ciprofloxacin 2 hours before or 6 hours after",
  "separate_by_hours": 6,
  "evidence_level": "B"
}`;

export default function Interactions() {
  const [docs, setDocs] = useState([]);
  const [drug, setDrug] = useState("");
  const [text, setText] = useState(SAMPLE);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);

  const load = () =>
    api("/interactions" + (drug ? "?drug=" + encodeURIComponent(drug) : ""))
      .then((d) => {
        setDocs(d);
        setError(null);
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, [drug]);

  const add = async () => {
    let doc;
    try {
      doc = JSON.parse(text);
    } catch {
      return setMsg({ ok: false, text: "Not valid JSON" });
    }
    try {
      const r = await api("/interactions", { method: "POST", body: doc });
      setMsg({ ok: true, text: `Inserted ${r.drug_a} + ${r.drug_b} with ${Object.keys(r).length - 1} fields. No ALTER TABLE, no migration.` });
      load();
    } catch (e) {
      setMsg({ ok: false, text: e.message });
    }
  };

  const keys = new Set();
  docs.forEach((d) => Object.keys(d).forEach((k) => keys.add(k)));

  return (
    <div className="two">
      <section className="card">
        <div className="head">
          <h3>drug_interactions</h3>
          <input placeholder="Filter by drug, e.g. Warfarin" value={drug} onChange={(e) => setDrug(e.target.value)} />
        </div>
        <p className="muted small">
          {docs.length} documents, {keys.size - 1} distinct field names across them. Compound index on (drug_a, drug_b); each pair stored once in alphabetical order.
        </p>
        {error && <p className="errbox">{error}</p>}
        <div className="docs">
          {docs.map((d) => (
            <pre key={d._id} className={"doc sev-" + d.severity}>
              {JSON.stringify(Object.fromEntries(Object.entries(d).filter(([k]) => k !== "_id" && k !== "added_at")), null, 2)}
            </pre>
          ))}
        </div>
      </section>
      <section className="card">
        <h3>Add an interaction</h3>
        <p className="muted small">
          Any extra field is accepted. The collection validator only insists on drug_a, drug_b and a severity of low, moderate, high or contraindicated.
        </p>
        <textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
        <button className="primary" onClick={add}>Insert document</button>
        {msg && <p className={msg.ok ? "okbox" : "errbox"}>{msg.text}</p>}
      </section>
    </div>
  );
}
