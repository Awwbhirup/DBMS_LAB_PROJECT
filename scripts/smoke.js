const BASE = process.env.BASE || "http://localhost:4000/api";
let failed = 0;

async function call(path, body) {
  const res = await fetch(BASE + path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
}

function check(name, cond, detail) {
  console.log((cond ? "PASS " : "FAIL ") + name + (detail ? "  " + detail : ""));
  if (!cond) failed++;
}

const health = await call("/health");
check("health: both databases up", health.data.postgres === "ok" && health.data.mongo === "ok", JSON.stringify(health.data));

const pv = await call("/dispense/preview", { prescription_id: 1, medicine_id: 1, quantity: 10 });
const aspWarf = pv.data.safety.interactions.find((d) => d.drug_a === "Aspirin" && d.drug_b === "Warfarin");
check("preview: Aspirin + Warfarin warning found", !!aspWarf && pv.data.safety.needs_ack.includes(aspWarf._id));
check("preview: FEFO picks earliest unexpired batch", pv.data.plan[0].batch_id === pv.data.batches.find((b) => !b.expired).batch_id);
check("preview: expired batch listed but never planned", pv.data.batches.some((b) => b.expired) && !pv.data.plan.some((p) => pv.data.batches.find((b) => b.batch_id === p.batch_id).expired));

const noAck = await call("/dispense/confirm", { prescription_id: 1, medicine_id: 1, quantity: 10, user_id: 1 });
check("confirm without acknowledging: 409 + ROLLBACK", noAck.status === 409 && noAck.data.steps.at(-1).step === "ROLLBACK", noAck.data.error);

const before = pv.data.batches.find((b) => b.batch_id === pv.data.plan[0].batch_id).quantity;
const ok = await call("/dispense/confirm", { prescription_id: 1, medicine_id: 1, quantity: 10, user_id: 1, acknowledged: [aspWarf._id] });
check("confirm with acknowledgement: COMMIT", ok.status === 200 && ok.data.steps.at(-1).step === "COMMIT", ok.data.error);
const pv2 = await call("/dispense/preview", { prescription_id: 1, medicine_id: 1, quantity: 1 });
const after = pv2.data.batches.find((b) => b.batch_id === pv.data.plan[0].batch_id)?.quantity ?? 0;
check("stock went down by exactly 10", before - after === 10, `${before} -> ${after}`);

const over = await call("/dispense/confirm", { prescription_id: 1, medicine_id: 1, quantity: 1, user_id: 1, acknowledged: [aspWarf._id] });
check("over-prescription refused", over.status === 409 && over.data.code === "over_prescription", over.data.error);

const contra = await call("/dispense/confirm", { prescription_id: 4, medicine_id: 13, quantity: 1, user_id: 1 });
check("contraindicated Sildenafil + Isosorbide refused", contra.status === 409 && contra.data.code === "contraindicated", contra.data.error);

const big = await call("/dispense/preview", { medicine_id: 44, quantity: 1 });
const firstQty = big.data.plan[0] ? big.data.batches.find((b) => b.batch_id === big.data.plan[0].batch_id).quantity : 0;
const span = await call("/dispense/confirm", { medicine_id: 44, quantity: firstQty + 5, user_id: 2 });
check("request larger than one batch spans two batches", span.status === 200 && span.data.taken.length === 2 && span.data.events.length === 2, span.data.taken?.map((t) => t.batch_number + ":" + t.take).join(" "));

const tooMuch = await call("/dispense/confirm", { medicine_id: 44, quantity: 100000, user_id: 2 });
check("insufficient stock: 409 + ROLLBACK", tooMuch.status === 409 && tooMuch.data.code === "insufficient_stock");

const race = await call("/demo/race", { medicine_id: 42, hold_ms: 1200 });
const [a, b] = race.data.results;
check(
  "race: both succeed, B waits then takes the next batch",
  a.ok && b.ok && a.taken[0].batch_number === race.data.contested_batch && b.taken[0].batch_number !== race.data.contested_batch,
  `A ${a.taken?.[0]?.batch_number}  B ${b.taken?.[0]?.batch_number}`
);
const bLock = race.data.timeline.find((l) => l.who === "B" && l.step === "lock acquired");
const aCommit = race.data.timeline.find((l) => l.who === "A" && l.step === "COMMIT");
check("race: B's lock only after A's COMMIT", bLock && aCommit && bLock.t >= aCommit.t, `A commit ${aCommit?.t} ms, B lock ${bLock?.t} ms`);

await call("/demo/mongo", { down: true });
const outage = await call("/dispense/confirm", { prescription_id: 2, medicine_id: 42, quantity: 1, user_id: 1 });
check("MongoDB down: 503 + ROLLBACK", outage.status === 503 && outage.data.steps.at(-1).step === "ROLLBACK", outage.data.error);
await call("/demo/mongo", { down: false });
const back = await call("/dispense/confirm", { prescription_id: 2, medicine_id: 42, quantity: 1, user_id: 1 });
check("MongoDB back: same dispense commits", back.status === 200, back.data.error);

const ex = await call("/demo/explain?medicine_id=1");
check("EXPLAIN uses idx_batches_fefo", /idx_batches_fefo/.test(ex.data.with_index.plan), `${ex.data.with_index.execution_ms} ms vs ${ex.data.without_index.execution_ms} ms`);
check("EXPLAIN without index is a Seq Scan", /Seq Scan/.test(ex.data.without_index.plan));

const t = await call("/demo/tamper", {});
check("audit UPDATE refused for the app role (privilege)", t.data.attempts[0].blocked && t.data.attempts[0].code === "42501");
check("audit UPDATE refused for the owner (trigger)", t.data.attempts[1].blocked && /append-only/.test(t.data.attempts[1].error));

const bad = await call("/interactions", { drug_a: "X", severity: "huge" });
check("Mongo validator rejects a document without the floor fields", bad.status === 422);

const recv = await call("/batches", { medicine_id: 3, batch_number: "SMOKE" + Date.now() % 100000, expiry_date: "2030-01-31", quantity: 25, user_id: 4 });
check("receive batch writes batch + RECEIPT", recv.status === 201);
const expiredRecv = await call("/batches", { medicine_id: 3, batch_number: "BAD1", expiry_date: "2000-01-01", quantity: 5, user_id: 4 });
check("CHECK constraint rejects a batch expiring before receipt", expiredRecv.status === 422);

const rx = await call("/prescriptions", { patient_name: "Smoke Test", patient_age: 30, doctor_name: "Dr. Test", items: [{ medicine_id: 1, quantity: 5 }, { medicine_id: 2, quantity: 5 }] });
check("new prescription inserted with two lines", rx.status === 201 && rx.data.items === 2);
const blank = await call("/prescriptions", { patient_name: "  ", doctor_name: "Dr. Test", items: [{ medicine_id: 1, quantity: 5 }] });
check("CHECK constraint rejects a blank patient name, nothing half-written", blank.status === 422);

console.log(failed ? `\n${failed} FAILED` : "\nALL PASSED");
process.exit(failed ? 1 : 0);
