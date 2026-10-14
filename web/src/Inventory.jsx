import React, { useEffect, useState } from "react";
import { api, fmtDate } from "./api.js";

export default function Inventory({ userId }) {
  const [stock, setStock] = useState([]);
  const [near, setNear] = useState([]);
  const [sel, setSel] = useState(null);
  const [batches, setBatches] = useState([]);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({ batch_number: "", expiry_date: "", quantity: 50 });
  const [msg, setMsg] = useState(null);

  const load = () => {
    api("/inventory").then(setStock);
    api("/inventory/near-expiry").then(setNear);
  };
  useEffect(load, []);
  useEffect(() => {
    if (sel) api(`/medicines/${sel.medicine_id}/batches`).then(setBatches);
  }, [sel]);

  const receive = async (e) => {
    e.preventDefault();
    try {
      const b = await api("/batches", { method: "POST", body: { ...form, medicine_id: sel.medicine_id, user_id: userId } });
      setMsg({ ok: true, text: `Batch ${b.batch_number} received: ${b.quantity} units. A RECEIPT event was written in the same transaction.` });
      setForm({ batch_number: "", expiry_date: "", quantity: 50 });
      api(`/medicines/${sel.medicine_id}/batches`).then(setBatches);
      load();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  const rows = stock.filter((s) => !filter || (s.name + s.generic_name).toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="two">
      <section className="card">
        <div className="head">
          <h3>Stock by medicine</h3>
          <input placeholder="Filter" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <p className="muted small">From the view v_stock. Expired units are counted apart and never offered for dispensing.</p>
        <table>
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Usable</th>
              <th>Expired</th>
              <th>Next expiry</th>
              <th>Batches</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.medicine_id} className={"click" + (sel?.medicine_id === s.medicine_id ? " sel" : "")} onClick={() => { setSel(s); setMsg(null); }}>
                <td>{s.name}</td>
                <td className={s.usable_stock < 40 ? "low" : ""}>{s.usable_stock}</td>
                <td className={s.expired_stock > 0 ? "warnc" : "muted"}>{s.expired_stock}</td>
                <td>{fmtDate(s.next_expiry)}</td>
                <td>{s.live_batches}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="stack">
        {sel ? (
          <section className="card">
            <h3>{sel.name}</h3>
            <table>
              <thead>
                <tr>
                  <th>Batch</th>
                  <th>Expiry</th>
                  <th>Qty</th>
                  <th>Received</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.batch_id} className={b.expired ? "expired" : b.quantity === 0 ? "muted" : ""}>
                    <td>{b.batch_number}</td>
                    <td>{fmtDate(b.expiry_date)}</td>
                    <td>{b.quantity}</td>
                    <td>{fmtDate(b.received_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <form className="receive" onSubmit={receive}>
              <h4>Receive a batch</h4>
              <input required placeholder="Batch number" value={form.batch_number} onChange={(e) => setForm({ ...form, batch_number: e.target.value })} />
              <input required type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} />
              <input required type="number" min="1" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              <button className="primary">Receive</button>
            </form>
            {msg && <p className={msg.ok ? "okbox" : "errbox"}>{msg.text}</p>}
          </section>
        ) : (
          <section className="card">
            <p className="empty">Select a medicine to see its batches and receive stock.</p>
          </section>
        )}
        <section className="card">
          <h3>Expiring within 60 days</h3>
          <table>
            <thead>
              <tr>
                <th>Batch</th>
                <th>Medicine</th>
                <th>Expiry</th>
                <th>Qty</th>
              </tr>
            </thead>
            <tbody>
              {near.map((b) => (
                <tr key={b.batch_id} className={b.days_left <= 0 ? "expired" : ""}>
                  <td>{b.batch_number}</td>
                  <td>{b.name}</td>
                  <td>{b.days_left <= 0 ? "expired" : b.days_left + " d"}</td>
                  <td>{b.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
