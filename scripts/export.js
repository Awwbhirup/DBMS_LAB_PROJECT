import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { MongoClient } from "mongodb";

const env = process.env;
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "export");
fs.mkdirSync(out, { recursive: true });

pg.types.setTypeParser(1082, (v) => v);
const client = new pg.Client({ host: env.PGHOST, port: Number(env.PGPORT), database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD });
await client.connect();

const queries = {
  "1 prescriptions": "SELECT * FROM prescriptions ORDER BY prescription_id DESC",
  "2 prescription_items": "SELECT i.*, m.name AS medicine FROM prescription_items i JOIN medicines m USING (medicine_id) ORDER BY prescription_id DESC, item_id",
  "3 dispensing_events": "SELECT e.event_id, e.event_timestamp, e.event_type, m.name AS medicine, b.batch_number, e.quantity_changed, e.prescription_id, u.name AS performed_by FROM dispensing_events e JOIN medicines m USING (medicine_id) JOIN batches b USING (batch_id) JOIN users u ON u.user_id = e.performed_by ORDER BY e.event_id DESC",
  "4 batches_in_stock": "SELECT b.*, m.name AS medicine FROM batches b JOIN medicines m USING (medicine_id) WHERE b.quantity > 0 ORDER BY m.name, b.expiry_date",
  "5 stock_by_medicine": "SELECT * FROM v_stock ORDER BY name",
  "6 medicines": "SELECT * FROM medicines ORDER BY medicine_id",
  "7 users": "SELECT * FROM users ORDER BY user_id"
};

const cell = (v) => {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

for (const [name, sql] of Object.entries(queries)) {
  const r = await client.query(sql);
  const lines = [r.fields.map((f) => f.name).join(",")].concat(r.rows.map((row) => r.fields.map((f) => cell(row[f.name])).join(",")));
  try {
    fs.writeFileSync(path.join(out, name + ".csv"), lines.join("\r\n") + "\r\n");
    console.log(name, r.rowCount);
  } catch (e) {
    console.log(name, "skipped: file is open in another program, close it and run again");
  }
}
await client.end();

const mongo = new MongoClient(env.MONGO_URL, { serverSelectionTimeoutMS: 3000 });
await mongo.connect();
const docs = await mongo.db(env.MONGO_DB).collection("drug_interactions").find({}, { projection: { _id: 0 } }).toArray();
fs.writeFileSync(path.join(out, "8 drug_interactions (MongoDB).json"), JSON.stringify(docs, null, 2));
console.log("8 drug_interactions", docs.length);
await mongo.close();
console.log(out);
