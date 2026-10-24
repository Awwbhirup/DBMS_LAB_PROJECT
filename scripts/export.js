// Writes the readable copy of both databases into data/ without starting the
// server. The server already does this after every change; this script is for
// refreshing it by hand, for example right after RESET_DATA.bat.
//
//   node scripts/export.js

import "dotenv/config";
import pg from "pg";
import { MongoClient } from "mongodb";
import { writeSnapshot, DATA_DIR } from "../server/snapshot.js";

const env = process.env;
pg.types.setTypeParser(1082, (v) => v);

const client = new pg.Client({ host: env.PGHOST, port: Number(env.PGPORT), database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD });
await client.connect();
const mongo = new MongoClient(env.MONGO_URL, { serverSelectionTimeoutMS: 3000 });
const collection = async () => {
  await mongo.connect();
  return mongo.db(env.MONGO_DB).collection("drug_interactions");
};

const written = await writeSnapshot(client, collection);
for (const [name, rows] of Object.entries(written)) console.log(name.padEnd(20), rows);
console.log("written to", DATA_DIR);

await client.end();
await mongo.close().catch(() => {});
