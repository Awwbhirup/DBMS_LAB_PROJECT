import "dotenv/config";
import pg from "pg";
import { MongoClient } from "mongodb";

const env = process.env;

pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(20, (v) => Number(v));

export const pool = new pg.Pool({
  host: env.PGHOST,
  port: Number(env.PGPORT),
  database: env.PGDATABASE,
  user: env.PGUSER,
  password: env.PGPASSWORD,
  max: 12
});

export const ownerPool = new pg.Pool({
  host: env.PGHOST,
  port: Number(env.PGPORT),
  database: env.PGDATABASE,
  user: env.PGOWNER_USER,
  password: env.PGOWNER_PASSWORD,
  max: 2
});

for (const p of [pool, ownerPool]) p.on("error", () => {});

const DEAD_URL = "mongodb://127.0.0.1:1";
let mongo = null;
let outage = false;

export function mongoOutage() {
  return outage;
}

export async function setMongoOutage(on) {
  outage = on;
  if (mongo) {
    await mongo.close().catch(() => {});
    mongo = null;
  }
}

export async function interactionsCollection() {
  if (!mongo) {
    mongo = new MongoClient(outage ? DEAD_URL : env.MONGO_URL, {
      serverSelectionTimeoutMS: 1500,
      connectTimeoutMS: 1500
    });
    try {
      await mongo.connect();
    } catch (e) {
      mongo = null;
      throw e;
    }
  }
  return mongo.db(env.MONGO_DB).collection("drug_interactions");
}

export class SafetyUnavailable extends Error {
  constructor(cause) {
    super("Interaction check could not be completed: MongoDB unreachable");
    this.cause = cause;
  }
}

export async function findInteractions(genericNames) {
  const names = [...new Set(genericNames)].sort((a, b) => a.localeCompare(b));
  const pairs = [];
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) pairs.push({ drug_a: names[i], drug_b: names[j] });
  }
  if (!pairs.length) return { pairs_checked: 0, found: [], ms: 0 };
  const t = performance.now();
  let col;
  try {
    col = await interactionsCollection();
    const found = await col.find({ $or: pairs }, { projection: { added_at: 0 } }).toArray();
    return { pairs_checked: pairs.length, found, ms: Math.round((performance.now() - t) * 10) / 10 };
  } catch (e) {
    await setMongoOutage(outage);
    throw new SafetyUnavailable(e);
  }
}
