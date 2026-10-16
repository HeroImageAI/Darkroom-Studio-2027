// Opt-in end-to-end Create validation using owned synthetic references; no mocks.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../apps/api/src/app.js";
import { ComfyClient } from "../apps/api/src/comfy.js";
import { config } from "../apps/api/src/config.js";
const client = new ComfyClient(config.comfyUrl, config.instance);
const queue = await client.queue();
if (queue.queue_running.length || queue.queue_pending.length)
  throw Error("Engine is busy; rerun when idle");
const { app, store } = await createApp({
  dataDir: "data/create-live",
  comfy: client,
  port: 2032,
});
const project = store.createProject("Create validation · reference product");
const originals = [];
for (let i = 1; i <= 3; i++) {
  const bytes = readFileSync("data/create-qa/reference-" + i + ".png");
  originals.push(
    await store.importAsset(bytes, "Reference " + i + ".png", project.id),
  );
}
const headers = { host: "127.0.0.1:2032" };
const token = (await app.inject({ url: "/api/session", headers })).json().token;
const request = {
  projectId: project.id,
  idempotencyKey: randomUUID(),
  variations: 4,
  intent: {
    prompt:
      "Create a professional product photograph of the exact bottle in image 1. Preserve its black cylindrical body, cap, cream label and the exact word NOIR. One bottle only. Use image 2 for the navy background colour and image 3 only as a left-side lighting guide. Keep the whole bottle visible. Do not redesign the product.",
    width: 768,
    height: 768,
    quality: "Draft",
    model: "Auto",
    seed: 2027,
    references: originals.map((a) => a.id),
  },
};
const submit = () =>
  app.inject({
    url: "/api/create",
    method: "POST",
    headers: { ...headers, "x-darkroom-token": token },
    payload: request,
  });
const response = await submit();
if (response.statusCode !== 202) {
  await app.close();
  throw Error(response.body);
}
const id = response.json().id;
console.log("Live Create batch " + id + " (four serial variations)");
const start = Date.now();
let prior = "";
while (Date.now() - start < 6 * 60 * 1000) {
  const batch = store.batch(id);
  const states = batch.jobs.map((j) => j.state).join(",");
  if (states !== prior) {
    console.log(states);
    prior = states;
  }
  if (
    batch.jobs.some((j) =>
      ["failed", "interrupted", "uncertain"].includes(j.state),
    )
  ) {
    await app.close();
    throw Error(
      JSON.stringify(
        batch.jobs.map((j) => ({ state: j.state, error: j.error })),
      ),
    );
  }
  if (batch.jobs.every((j) => j.state === "succeeded")) {
    const replay = await submit();
    if (replay.json().id !== id || store.batch(id).jobs.length !== 4)
      throw Error("Idempotency failed");
    const c = batch.candidates[0]!;
    const review = await app.inject({
      url: "/api/candidates/" + c.id + "/review",
      method: "POST",
      headers: { ...headers, "x-darkroom-token": token },
      payload: { action: "keep-version" },
    });
    if (review.statusCode !== 200 || !review.json().versionId)
      throw Error("Version storage failed");
    for (let i = 0; i < originals.length; i++)
      if (
        !store
          .assetBytes(originals[i]!.id)
          .equals(readFileSync("data/create-qa/reference-" + (i + 1) + ".png"))
      )
        throw Error("Reference original changed");
    mkdirSync("data/create-live/evidence", { recursive: true });
    for (const candidate of batch.candidates)
      writeFileSync(
        "data/create-live/evidence/variation-" +
          (candidate.variationIndex + 1) +
          ".png",
        store.assetBytes(candidate.assetId),
      );
    const report = {
      batch: store.batch(id),
      elapsedMs: Date.now() - start,
      referenceIntegrity: true,
      idempotencyReplay: true,
      versionStored: true,
      routes: batch.jobs.map((j) => {
        const p = JSON.parse(store.job(j.id)!.provenance!);
        return {
          id: p.workflowId,
          reason: p.route.reason,
          evidence: p.route.evidenceId,
        };
      }),
      visualAssessment: "PENDING",
    };
    writeFileSync(
      "data/create-live/evidence/run.json",
      JSON.stringify(report, null, 2),
    );
    console.log(
      JSON.stringify({
        id,
        elapsedMs: report.elapsedMs,
        candidates: batch.candidates.length,
        referenceIntegrity: true,
        idempotencyReplay: true,
        versionStored: true,
        routes: report.routes,
      }),
    );
    await app.close();
    process.exit(0);
  }
  await delay(1000);
}
await app.close();
throw Error("Live Create exceeded deadline; inspect retained job state");
