// Builds both databases from scratch. Running it again wipes everything and
// starts over, which is what RESET_DATA.bat does.
//
//   node scripts/setup.js            both databases
//   node scripts/setup.js postgres   only PostgreSQL
//   node scripts/setup.js mongo      only MongoDB

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { MongoClient } from "mongodb";
import interactions from "../mongo/interactions.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;
// quoting for names and values that cannot be passed as $1 parameters
const ident = (s) => '"' + s.replace(/"/g, '""') + '"';
const lit = (s) => "'" + s.replace(/'/g, "''") + "'";

function log(msg) {
  console.log(new Date().toISOString().slice(11, 19) + "  " + msg);
}

async function connect(database, user, password) {
  const c = new pg.Client({ host: env.PGHOST, port: Number(env.PGPORT), database, user, password });
  await c.connect();
  return c;
}

async function setupPostgres() {
  // as the superuser: create the two roles and a fresh database owned by pharmacy_owner
  const su = await connect("postgres", env.PG_SUPERUSER, env.PG_SUPERPASS);
  for (const [role, pw] of [[env.PGOWNER_USER, env.PGOWNER_PASSWORD], [env.PGUSER, env.PGPASSWORD]]) {
    const exists = await su.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [role]);
    const verb = exists.rowCount ? "ALTER" : "CREATE";
    await su.query(`${verb} ROLE ${ident(role)} LOGIN PASSWORD ${lit(pw)}`);
  }
  await su.query(`DROP DATABASE IF EXISTS ${ident(env.PGDATABASE)} WITH (FORCE)`);
  await su.query(`CREATE DATABASE ${ident(env.PGDATABASE)} OWNER ${ident(env.PGOWNER_USER)}`);
  await su.end();
  log("postgres: database " + env.PGDATABASE + " created");

  // as the owner: run sql/01..05 in order, so the owner owns every object
  const owner = await connect(env.PGDATABASE, env.PGOWNER_USER, env.PGOWNER_PASSWORD);
  await owner.query("REVOKE ALL ON SCHEMA public FROM PUBLIC");
  const files = fs.readdirSync(path.join(root, "sql")).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    const t = Date.now();
    await owner.query(fs.readFileSync(path.join(root, "sql", f), "utf8"));
    log(`postgres: ${f} (${Date.now() - t} ms)`);
  }
  // the API's role gets only what it needs; note there is no UPDATE or DELETE
  // on dispensing_events, which is half of what keeps the audit log append-only
  const app = ident(env.PGUSER);
  await owner.query(`GRANT USAGE ON SCHEMA public TO ${app}`);
  await owner.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${app}`);
  await owner.query(`GRANT INSERT, UPDATE ON batches, prescriptions, prescription_items TO ${app}`);
  await owner.query(`GRANT INSERT ON dispensing_events TO ${app}`);
  await owner.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO ${app}`);
  const counts = await owner.query(`
    SELECT (SELECT count(*) FROM medicines) AS medicines,
           (SELECT count(*) FROM batches WHERE quantity > 0) AS live_batches,
           (SELECT count(*) FROM batches) AS all_batches,
           (SELECT count(*) FROM prescriptions) AS prescriptions,
           (SELECT count(*) FROM dispensing_events) AS events`);
  log("postgres: " + JSON.stringify(counts.rows[0]));
  await owner.end();
}

// store every pair in alphabetical order (drug_a < drug_b)
function normalise(doc) {
  const [a, b] = [doc.drug_a, doc.drug_b].sort((x, y) => x.localeCompare(y));
  return { ...doc, drug_a: a, drug_b: b };
}

async function setupMongo() {
  const client = new MongoClient(env.MONGO_URL, { serverSelectionTimeoutMS: 4000 });
  await client.connect();
  const db = client.db(env.MONGO_DB);
  await db.dropDatabase();
  // the validator only requires drug_a, drug_b and severity; any other field is allowed
  await db.createCollection("drug_interactions", {
    validator: {
      $jsonSchema: {
        bsonType: "object",
        required: ["drug_a", "drug_b", "severity"],
        properties: {
          drug_a: { bsonType: "string" },
          drug_b: { bsonType: "string" },
          severity: { enum: ["low", "moderate", "high", "contraindicated"] }
        }
      }
    }
  });
  // one document per pair, found with one index lookup
  const col = db.collection("drug_interactions");
  await col.createIndex({ drug_a: 1, drug_b: 1 }, { unique: true, name: "pair" });
  const docs = interactions.map(normalise).map((d) => ({ ...d, source: d.source ?? "curated", added_at: new Date() }));
  await col.insertMany(docs);
  log(`mongo: ${docs.length} interaction documents, index on (drug_a, drug_b)`);
  await client.close();
}

const only = process.argv[2];
try {
  if (only !== "mongo") await setupPostgres();
  if (only !== "postgres") await setupMongo();
  log("done");
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
