import { createApp } from "../apps/api/src/app.js";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { mkdirSync, writeFileSync } from "node:fs";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
const client = new ComfyClient(config.comfyUrl, config.instance);
const q = await client.queue();
if (q.queue_running.length || q.queue_pending.length)
  throw Error("Engine busy; rerun when idle");
const { app, store } = await createApp({
  dataDir: "data/live-api-foundation",
  comfy: client,
});
const headers = { host: "127.0.0.1:2027" };
const token = (await app.inject({ url: "/api/session", headers })).json().token;
const project = store.createProject("Foundation API validation");
const response = await app.inject({
  url: "/api/jobs",
  method: "POST",
  headers: { ...headers, "x-darkroom-token": token },
  payload: {
    projectId: project.id,
    idempotencyKey: randomUUID(),
    intent: {
      prompt:
        "A single red ceramic sphere resting on a charcoal cube, studio photograph, black background, white rim light, no text, no logo.",
      width: 512,
      height: 512,
      seed: 2027,
      model: "Klein",
    },
  },
});
if (response.statusCode !== 202) {
  await app.close();
  throw Error(response.body);
}
const id = response.json().id;
const start = Date.now();
console.log("Queued through API " + id);
while (Date.now() - start < 120000) {
  const job = store.job(id)!;
  if (job.state === "succeeded") {
    const asset = store.asset(job.resultId!)!;
    mkdirSync("data/live-api-foundation/evidence", { recursive: true });
    writeFileSync(
      "data/live-api-foundation/evidence/output.png",
      store.assetBytes(asset.id),
    );
    const report = {
      id,
      elapsedMs: Date.now() - start,
      state: job.state,
      output: asset,
      events: store.events(0).map((e) => ({
        sequence: e.sequence,
        type: e.type,
        payload: JSON.parse(String(e.payload)),
      })),
      provenance: JSON.parse(job.provenance!),
    };
    writeFileSync(
      "data/live-api-foundation/evidence/run.json",
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        id,
        state: job.state,
        elapsedMs: report.elapsedMs,
        outputHash: asset.hash,
        eventCount: report.events.length,
      }),
    );
    await app.close();
    process.exit(0);
  }
  if (["failed", "interrupted", "uncertain"].includes(job.state)) {
    await app.close();
    throw Error(job.error ?? job.state);
  }
  await delay(500);
}
await app.close();
throw Error("Timed out; inspect preserved job context");
