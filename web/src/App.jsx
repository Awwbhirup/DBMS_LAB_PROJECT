import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import Dispense from "./Dispense.jsx";
import Inventory from "./Inventory.jsx";
import Audit from "./Audit.jsx";
import Interactions from "./Interactions.jsx";
import Lab from "./Lab.jsx";

const TABS = [
  ["dispense", "Dispense"],
  ["inventory", "Inventory"],
  ["audit", "Audit log"],
  ["interactions", "Interactions"],
  ["lab", "Under the hood"]
];

function Dot({ state, label }) {
  return (
    <span className={"health " + (state === "ok" ? "up" : "down")} title={label + ": " + state}>
      <i />
      {label}
    </span>
  );
}

export default function App() {
  const [tab, setTab] = useState(() => location.hash.slice(1) || "dispense");
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState(1);
  const [health, setHealth] = useState({});

  useEffect(() => {
    api("/users").then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    const poll = () => api("/health").then(setHealth).catch(() => setHealth({ postgres: "down", mongo: "down" }));
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    location.hash = tab;
  }, [tab]);

  useEffect(() => {
    const onHash = () => {
      const k = location.hash.slice(1);
      if (TABS.some(([t]) => t === k)) setTab(k);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const today = new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const user = users.find((u) => u.user_id === userId);

  return (
    <div className="shell">
      <header className="top">
        <div className="brand">
          <span className="mark">Rx</span>
          <div>
            <b>Pharmacy Dispensing</b>
            <small>PostgreSQL transactional core + MongoDB safety layer</small>
          </div>
        </div>
        <nav>
          {TABS.map(([k, label]) => (
            <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </nav>
        <div className="meta">
          <Dot state={health.postgres} label="PostgreSQL" />
          <Dot state={health.mongo} label="MongoDB" />
          <span className="sep">Date: {today}</span>
          <label className="sep">
            User:{" "}
            <select value={userId} onChange={(e) => setUserId(Number(e.target.value))}>
              {users.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <main>
        {tab === "dispense" && <Dispense userId={userId} userName={user?.name} />}
        {tab === "inventory" && <Inventory userId={userId} />}
        {tab === "audit" && <Audit />}
        {tab === "interactions" && <Interactions />}
        {tab === "lab" && <Lab health={health} />}
      </main>
    </div>
  );
}
