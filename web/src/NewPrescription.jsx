import React, { useEffect, useState } from "react";
import { api } from "./api.js";

export default function NewPrescription({ onCreated, onClose }) {
  const [meds, setMeds] = useState([]);
  const [form, setForm] = useState({ patient_name: "", patient_age: "", doctor_name: "" });
  const [lines, setLines] = useState([{ medicine_id: "", quantity: 10 }]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api("/inventory").then(setMeds);
  }, []);

  const setLine = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const save = async (e) => {
    e.preventDefault();
    setErr(null);
    try {
      const p = await api("/prescriptions", { method: "POST", body: { ...form, items: lines } });
      onCreated(p);
    } catch (x) {
      setErr(x.message);
    }
  };

  return (
    <form className="card newrx" onSubmit={save}>
      <div className="head">
        <h3>New prescription</h3>
        <button type="button" className="link" onClick={onClose}>Close</button>
      </div>
      <div className="grid3">
        <label>
          Patient name
          <input value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} />
        </label>
        <label>
          Age
          <input type="number" value={form.patient_age} onChange={(e) => setForm({ ...form, patient_age: e.target.value })} />
        </label>
        <label>
          Doctor
          <input value={form.doctor_name} onChange={(e) => setForm({ ...form, doctor_name: e.target.value })} />
        </label>
      </div>
      {lines.map((l, i) => (
        <div key={i} className="line">
          <select value={l.medicine_id} onChange={(e) => setLine(i, "medicine_id", e.target.value)}>
            <option value="">Choose a medicine</option>
            {meds.map((m) => (
              <option key={m.medicine_id} value={m.medicine_id}>
                {m.name}
              </option>
            ))}
          </select>
          <input type="number" min="1" value={l.quantity} onChange={(e) => setLine(i, "quantity", e.target.value)} />
          {lines.length > 1 && (
            <button type="button" className="link" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button>
          )}
        </div>
      ))}
      <div className="row">
        <button type="button" onClick={() => setLines([...lines, { medicine_id: "", quantity: 10 }])}>+ Add medicine</button>
        <button className="primary">Save prescription</button>
        <span className="muted small">One transaction: INSERT into prescriptions, then one INSERT per line into prescription_items.</span>
      </div>
      {err && <p className="errbox">{err}</p>}
    </form>
  );
}
