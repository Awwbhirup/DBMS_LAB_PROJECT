import React, { useEffect, useState } from "react";
import { api, fmtTime } from "./api.js";

export default function Audit() {
  const [events, setEvents] = useState([]);
  const [top, setTop] = useState([]);
  const [meds, setMeds] = useState([]);
  const [medicine, setMedicine] = useState("");
  const [type, setType] = useState("");

  useEffect(() => {
    api("/inventory").then(setMeds);
    api("/reports/top-week").then(setTop);
  }, []);

  useEffect(() => {
    const q = new URLSearchParams();
    if (medicine) q.set("medicine_id", medicine);
    if (type) q.set("type", type);
    q.set("limit", 150);
    api("/events?" + q).then(setEvents);
  }, [medicine, type]);

  const max = Math.max(1, ...top.map((t) => t.units_dispensed));

  return (
    <div className="two">
      <section className="card">
        <div className="head">
          <h3>dispensing_events</h3>
          <div className="filters">
            <select value={medicine} onChange={(e) => setMedicine(e.target.value)}>
              <option value="">All medicines</option>
              {meds.map((m) => (
                <option key={m.medicine_id} value={m.medicine_id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All events</option>
              <option>DISPENSE</option>
              <option>RECEIPT</option>
              <option>ADJUSTMENT</option>
            </select>
          </div>
        </div>
        <p className="muted small">
          Append-only. Filtering by medicine reads the index (medicine_id, event_timestamp DESC), most recent first.
        </p>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>When</th>
              <th>Type</th>
              <th>Medicine</th>
              <th>Batch</th>
              <th>Change</th>
              <th>Rx</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.event_id}>
                <td className="muted">{e.event_id}</td>
                <td>{fmtTime(e.event_timestamp)}</td>
                <td>
                  <span className={"et " + e.event_type.toLowerCase()}>{e.event_type}</span>
                </td>
                <td>{e.medicine}</td>
                <td>{e.batch_number}</td>
                <td className={e.quantity_changed < 0 ? "neg" : "pos"}>{e.quantity_changed > 0 ? "+" + e.quantity_changed : e.quantity_changed}</td>
                <td className="muted">{e.prescription_id ? "#" + e.prescription_id : ""}</td>
                <td>{e.performed_by}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card">
        <h3>Most dispensed this week</h3>
        <p className="muted small">The view v_top_week, a time-window scan on the event_timestamp index.</p>
        <div className="bars">
          {top.map((t) => (
            <div key={t.medicine_id} className="bar">
              <span>{t.name}</span>
              <i style={{ width: (100 * t.units_dispensed) / max + "%" }} />
              <b>{t.units_dispensed}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
