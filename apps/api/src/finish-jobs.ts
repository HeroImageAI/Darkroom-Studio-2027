import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  finishRequestSchema,
  type FinishRequest,
} from "../../../packages/contracts/src/finish.js";
import type { Snapshot } from "../../../packages/document/src/schema.js";
import { graphHash } from "../../../packages/workflows/src/bind.js";
import { Conflict, type Store } from "./store.js";
import type { ComfyClient } from "./comfy.js";
import { renderMaster } from "./edit-render.js";
import {
  finishGraph,
  finishInput,
  finishOutput,
  preflightFinish,
} from "./finish-workflows.js";
import { assertFinishReady, finishSignature } from "./finish-readiness.js";
type Row = {
  jobId: string;
  documentId: string;
  baseRevisionId: string;
  sourceAssetId: string;
  snapshotJson: string;
  requestJson: string;
  disposition: string;
  acceptedDocumentId: string | null;
  versionId: string | null;
  idempotencyKey: string;
  createdAt: string;
};
export const finishRow = (store: Store, id: string) =>
  store.db
    .prepare("SELECT * FROM finish_requests WHERE jobId=?")
    .get(id) as unknown as Row | undefined;
export const finishHistory = (store: Store, id: string) =>
  store.db
    .prepare(
      "SELECT jobId FROM finish_requests WHERE documentId=? ORDER BY createdAt DESC,rowid DESC",
    )
    .all(id)
    .map((r) => {
      const row = finishRow(store, String(r.jobId))!;
      return {
        ...row,
        request: JSON.parse(row.requestJson),
        job: store.job(row.jobId),
      };
    });
export async function submitFinish(
  store: Store,
  client: ComfyClient,
  input: FinishRequest,
) {
  const r = finishRequestSchema.parse(input),
    json = JSON.stringify(r);
  function replay() {
    const row = store.db
      .prepare(
        "SELECT jobId,requestJson FROM finish_requests WHERE idempotencyKey=?",
      )
      .get(r.idempotencyKey);
    if (!row) return undefined;
    if (row.requestJson !== json)
      throw new Conflict("Finishing retry settings changed");
    return finishRow(store, String(row.jobId));
  }
  const old = replay();
  if (old) return old;
  const doc = store.document(r.documentId);
  if (!doc) throw Error("Master not found");
  if (doc.currentRevisionId !== r.expectedRevision)
    throw new Conflict("Save the current master before finishing");
  if (doc.snapshot.layers.length >= 100)
    throw Error("Finish needs a free layer slot");
  if (
    r.task === "Restore" &&
    !doc.snapshot.selection &&
    !doc.snapshot.selectionMaskAssetId
  )
    throw Error("Select the lettering or details to preserve before restoring");
  if (
    r.task !== "Upscale" &&
    (doc.snapshot.width !== r.width || doc.snapshot.height !== r.height)
  )
    throw Error("This action preserves the current canvas size");
  if (
    r.task === "Upscale" &&
    (r.width < doc.snapshot.width ||
      r.height < doc.snapshot.height ||
      Math.abs(r.width / r.height - doc.snapshot.width / doc.snapshot.height) >
        0.01)
  )
    throw Error(
      "Upscale must increase size and preserve the canvas aspect ratio",
    );
  const inspection = await client.inspect();
  if (!inspection.status.verified)
    throw Error("Verified local Desktop required");
  await assertFinishReady(r.task, inspection.info, inspection.status.version);
  const source = await store.internalAsset(
    await renderMaster(store, doc.snapshot),
    "Finish source.png",
    doc.projectId,
  );
  return store.transaction(() => {
    const again = replay();
    if (again) return again;
    if (store.document(doc.id)!.currentRevisionId !== r.expectedRevision)
      throw new Conflict("Master changed while preparing Finish");
    if (
      store
        .jobs()
        .filter(
          (j) =>
            !["succeeded", "failed", "cancelled", "interrupted"].includes(
              j.state,
            ),
        ).length >= 8
    )
      throw Error("Queue full; wait for current work");
    // Shared queue envelope; the separate typed finishing request owns output dimensions and routing.
    const job = store.enqueue(
      doc.projectId,
      {
        prompt: `Finish: ${r.task}`,
        width: 256,
        height: 256,
        seed: 42,
        model: "Auto",
        quality: "Final",
        references: [source.id],
      },
      randomUUID(),
    );
    store.db
      .prepare(
        "INSERT INTO finish_requests(jobId,documentId,baseRevisionId,sourceAssetId,snapshotJson,requestJson,idempotencyKey,createdAt) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        job.id,
        doc.id,
        r.expectedRevision,
        source.id,
        JSON.stringify(doc.snapshot),
        json,
        r.idempotencyKey,
        new Date().toISOString(),
      );
    return finishRow(store, job.id)!;
  });
}
export async function collectFinish(
  store: Store,
  client: ComfyClient,
  jobId: string,
  history: any,
) {
  const row = finishRow(store, jobId)!,
    job = store.job(jobId)!,
    r = finishRequestSchema.parse(JSON.parse(row.requestJson));
  const provenance = JSON.parse(job.provenance ?? "{}");
  if (provenance.finish?.implementationHash !== finishSignature())
    throw Error("Finish processing changed while running; source preserved");
  const images = history.outputs?.["99"]?.images;
  if (!Array.isArray(images) || images.length !== 1)
    throw Error("Expected one Finish output");
  store.updateJob(jobId, "collecting");
  const bytes = await finishOutput(
    store.assetBytes(row.sourceAssetId),
    await client.image(images[0]),
    r.task,
    r.width,
    r.height,
    (JSON.parse(row.snapshotJson) as Snapshot).selection,
    (JSON.parse(row.snapshotJson) as Snapshot).selectionMaskAssetId
      ? store.assetBytes(
          (JSON.parse(row.snapshotJson) as Snapshot).selectionMaskAssetId!,
        )
      : undefined,
  );
  const asset = await store.internalAsset(
    bytes,
    `${r.task} proposal.png`,
    job.projectId,
  );
  store.completeJob(jobId, asset.id);
}
export async function executeFinish(
  store: Store,
  client: ComfyClient,
  jobId: string,
  inspection: Awaited<ReturnType<ComfyClient["inspect"]>>,
  stopped: () => boolean,
) {
  const row = finishRow(store, jobId)!,
    r = finishRequestSchema.parse(JSON.parse(row.requestJson));
  const evidence = await assertFinishReady(
    r.task,
    inspection.info,
    inspection.status.version,
  );
  const q = await client.queue();
  if (q.queue_running.length || q.queue_pending.length) {
    store.updateJob(jobId, "queued");
    return;
  }
  const { engine } = await finishInput(
      store.assetBytes(row.sourceAssetId),
      r.task,
      r.width,
      r.height,
    ),
    image = await client.uploadReference(engine),
    graph = finishGraph(r.task, image);
  preflightFinish(graph, await client.json("/object_info"), image);
  const provenance = JSON.stringify({
    finish: {
      ...evidence,
      request: r,
      sourceAssetId: row.sourceAssetId,
      sourceHash: store.asset(row.sourceAssetId)!.hash,
      baseRevisionId: row.baseRevisionId,
    },
    graph,
    executionHash: graphHash(graph),
    engine: inspection.status,
    submittedAt: new Date().toISOString(),
  });
  store.updateJob(jobId, "submitting", { provenance });
  let promptId: string;
  try {
    promptId = await client.submit(graph, jobId);
  } catch (e) {
    store.updateJob(jobId, "uncertain", {
      error:
        "Finish submission acknowledgement lost; inspect history before retry",
    });
    return;
  }
  store.updateJob(jobId, "running", { promptId });
  const deadline = Date.now() + 600000;
  while (!stopped() && Date.now() < deadline) {
    let history;
    try {
      history = await client.history(promptId);
    } catch {
      return; /* Retain running state for shared worker recovery when the engine returns. */
    }
    if (history?.status?.status_str === "error") {
      store.updateJob(jobId, "failed", {
        error: "Local Finish workflow failed",
      });
      return;
    }
    if (history?.status?.completed) {
      try {
        await collectFinish(store, client, jobId, history);
      } catch (e) {
        store.updateJob(jobId, "failed", { error: (e as Error).message });
      }
      return;
    }
    await delay(1000);
  }
  if (!stopped())
    store.updateJob(jobId, "interrupted", {
      error:
        "Finish exceeded its recovery deadline; inspect engine before retry",
    });
}
export function reviewFinish(
  store: Store,
  jobId: string,
  action: "accept" | "keep-version" | "reject",
) {
  return store.transaction(() => {
    const row = finishRow(store, jobId),
      job = store.job(jobId);
    if (!row || job?.state !== "succeeded" || !job.resultId)
      throw Error("Finish result not ready");
    if (row.acceptedDocumentId) {
      if (action === "reject")
        throw Error("Result already saved; use retained layers or Undo");
      return row;
    }
    if (row.disposition === "rejected" && action !== "reject")
      throw Error("This result was rejected; run Finish again");
    if (action === "reject") {
      store.db
        .prepare(
          "UPDATE finish_requests SET disposition='rejected' WHERE jobId=?",
        )
        .run(jobId);
      store.db
        .prepare("UPDATE candidates SET disposition='rejected' WHERE jobId=?")
        .run(jobId);
      return finishRow(store, jobId)!;
    }
    const original = store.document(row.documentId)!,
      base = JSON.parse(row.snapshotJson) as Snapshot,
      r = finishRequestSchema.parse(JSON.parse(row.requestJson));
    if (
      action === "accept" &&
      original.currentRevisionId !== row.baseRevisionId
    )
      throw new Conflict(
        "Master changed; keep this Finish result as a separate master",
      );
    const target =
      action === "accept"
        ? original
        : store.createDocument(original.projectId, original.originalAssetId);
    const { selection: _, selectionMaskAssetId: _mask, ...rest } = base,
      sx = r.width / base.width,
      sy = r.height / base.height;
    const snapshot: Snapshot = {
      ...rest,
      id: target.id,
      width: r.width,
      height: r.height,
      layers: [
        ...base.layers.map((l) => ({
          ...l,
          visible: false,
          transform: {
            ...l.transform,
            x: l.transform.x * sx,
            y: l.transform.y * sy,
            scaleX: l.transform.scaleX * sx,
            scaleY: l.transform.scaleY * sy,
          },
        })),
        {
          id: randomUUID(),
          type: "generated",
          name: `${r.task} · Finish`,
          assetId: job.resultId,
          visible: true,
          locked: false,
          opacity: 1,
          transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
        },
      ],
    };
    const saved = store.saveDocument(
        target.id,
        target.currentRevisionId,
        snapshot,
      ),
      version = store.version(
        target.id,
        `${r.task} · Finish`,
        saved.currentRevisionId,
      );
    store.db
      .prepare(
        "UPDATE project_assets SET role='result' WHERE projectId=? AND assetId=?",
      )
      .run(original.projectId, job.resultId);
    store.db
      .prepare(
        "UPDATE finish_requests SET disposition='accepted',acceptedDocumentId=?,versionId=? WHERE jobId=?",
      )
      .run(target.id, version.id, jobId);
    store.db
      .prepare(
        "UPDATE candidates SET disposition='accepted',documentId=?,versionId=? WHERE jobId=?",
      )
      .run(target.id, version.id, jobId);
    return finishRow(store, jobId)!;
  });
}
