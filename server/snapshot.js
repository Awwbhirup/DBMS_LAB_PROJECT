// Writes a readable copy of both databases into the project's data/ folder.
// PostgreSQL and MongoDB keep their real data in their own binary files,
// so this is what you open to see what the app has stored.
//
//   data/postgresql/<table>.csv          one file per table, every row
//   data/mongodb/drug_interactions.json  every interaction document
//
// The copy is refreshed after every change made through the app.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DATA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "data");

const TABLES = {
  users: "user_id",
  medicines: "medicine_id",
  batches: "batch_id",
  prescriptions: "prescription_id",
  prescription_items: "item_id",
  dispensing_events: "event_id"
};

function cell(v) {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// the file may be open in Excel; skip it this time instead of failing
function save(file, text) {
  try {
    fs.writeFileSync(file, text);
    return true;
  } catch {
    return false;
  }
}

export async function writeSnapshot(db, getCollection) {
  const pgDir = path.join(DATA_DIR, "postgresql");
  const mongoDir = path.join(DATA_DIR, "mongodb");
  fs.mkdirSync(pgDir, { recursive: true });
  fs.mkdirSync(mongoDir, { recursive: true });
  const written = {};

  for (const [table, key] of Object.entries(TABLES)) {
    const r = await db.query(`SELECT * FROM ${table} ORDER BY ${key}`);
    const lines = [r.fields.map((f) => f.name).join(",")];
    for (const row of r.rows) lines.push(r.fields.map((f) => cell(row[f.name])).join(","));
    if (save(path.join(pgDir, table + ".csv"), lines.join("\r\n") + "\r\n")) written[table] = r.rowCount;
  }

  // if MongoDB is down, leave the last good copy in place
  try {
    const col = await getCollection();
    const docs = await col.find({}).sort({ drug_a: 1, drug_b: 1 }).toArray();
    if (save(path.join(mongoDir, "drug_interactions.json"), JSON.stringify(docs, null, 2) + "\n")) written.drug_interactions = docs.length;
  } catch {
    written.drug_interactions = "skipped, MongoDB unreachable";
  }
  return written;
}

// Several writes can land within a few milliseconds (a dispense touching two
// batches, the race demo), so wait briefly and write once.
let timer = null;
export function scheduleSnapshot(db, getCollection) {
  clearTimeout(timer);
  timer = setTimeout(() => {
    writeSnapshot(db, getCollection).catch((e) => console.error("data snapshot failed:", e.message));
  }, 400);
}
