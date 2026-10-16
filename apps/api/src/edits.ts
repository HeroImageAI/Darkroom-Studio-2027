import { randomUUID } from "node:crypto";
import type { Store } from "./store.js";
import { Conflict } from "./store.js";
import type { ComfyClient } from "./comfy.js";
import {
  editRequestSchema,
  type EditRequest,
} from "../../../packages/contracts/src/edit.js";
import type { Snapshot } from "../../../packages/document/src/schema.js";
import { prepareEdit } from "./edit-render.js";
import { assertEditReady } from "../../../packages/routing/src/edit-policy.js";
import { chooseRoute } from "../../../packages/routing/src/policy.js";
import { workflows } from "./workflow.js";
import { readiness } from "./readiness.js";
export interface EditRow {
  jobId: string;
  documentId: string;
  baseRevisionId: string;
  requestJson: string;
  snapshotJson: string;
  sourceAssetId: string;
  maskAssetId: string;
  disposition: string;
  acceptedDocumentId: string | null;
  versionId: string | null;
  idempotencyKey: string;
  createdAt: string;
  rawAssetId: string | null;
}
export const editRow = (store: Store, jobId: string) =>
  store.db
    .prepare("SELECT * FROM edit_requests WHERE jobId=?")
    .get(jobId) as unknown as EditRow | undefined;
export function editHistory(store: Store, documentId: string) {
  return store.db
    .prepare(
      "SELECT jobId FROM edit_requests WHERE documentId=? ORDER BY createdAt DESC",
    )
    .all(documentId)
    .map((r) => {
      const row = editRow(store, String(r.jobId))!;
      return {
        ...row,
        request: JSON.parse(row.requestJson),
        job: store.job(row.jobId),
      };
    });
}
export function editPrompt(request: EditRequest) {
  return `Edit image 1 according to the instruction below. Image 2 is ONLY an edit-region guide: white pixels may change, black pixels must remain unchanged. Return the complete edited image 1 at the same framing and dimensions. Do not draw the guide, mask, borders, captions or annotations. Preserve all other subjects, identities, product shapes, labels and visible text. ${request.task === "Expand" ? "The grey margins in image 1 are new canvas: continue the existing photograph into these margins naturally. Keep all original image content intact." : ""}\nAction: ${request.task}\nVerbatim user instruction:\n${request.instruction}`;
}
export async function submitEdit(
  store: Store,
  client: ComfyClient,
  input: EditRequest,
) {
  const request = editRequestSchema.parse(input),
    json = JSON.stringify(request);
  const existing = store.db
    .prepare(
      "SELECT jobId,requestJson FROM edit_requests WHERE idempotencyKey=?",
    )
    .get(request.idempotencyKey);
  if (existing) {
    if (existing.requestJson !== json)
      throw new Conflict("Idempotency key used for a different edit");
    return editRow(store, String(existing.jobId))!;
  }
  const doc = store.document(request.documentId);
  if (!doc) throw Error("Master not found");
  if (doc.currentRevisionId !== request.expectedRevision)
    throw new Conflict(
      "Document changed; save/reload the current master before editing.",
    );
  if (doc.snapshot.layers.length >= 100)
    throw Error("This master needs one free layer slot for the AI result.");
  const inspection = await client.inspect();
  if (!inspection.status.verified)
    throw Error(inspection.status.reason ?? "Verified local engine required");
  assertEditReady(request.task, inspection.status.fingerprint);
  const prepared = await prepareEdit(store, doc.snapshot, request);
  const ready = new Set(
    readiness(inspection.status, inspection.info)
      .filter((r) => r.ready)
      .map((r) => r.id),
  );
  const check = {
    prompt: editPrompt(request),
    width: prepared.engineWidth,
    height: prepared.engineHeight,
    seed: request.seed,
    quality: "Final" as const,
    model: "Qwen" as const,
    references: [randomUUID(), randomUUID()],
  };
  const route = chooseRoute(
    check,
    workflows.map((w) => w.manifest),
    ready,
  );
  if (route.workflow.id !== "create.qwen.2ref")
    throw Error("Validated edit graph unavailable");
  const source = await store.importAsset(
    prepared.source,
    "AI edit input.png",
    doc.projectId,
  );
  const mask = await store.importAsset(
    prepared.maskPng,
    "AI edit region.png",
    doc.projectId,
  );
  return store.transaction(() => {
    const again = store.db
      .prepare(
        "SELECT jobId,requestJson FROM edit_requests WHERE idempotencyKey=?",
      )
      .get(request.idempotencyKey);
    if (again) {
      if (again.requestJson !== json)
        throw new Conflict("Idempotency key used for a different edit");
      return editRow(store, String(again.jobId))!;
    }
    if (store.document(doc.id)!.currentRevisionId !== doc.currentRevisionId)
      throw new Conflict(
        "Document changed while preparing this edit. Save and try again.",
      );
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
      throw Error("Queue full. Wait for current work to finish.");
    const job = store.enqueue(
      doc.projectId,
      { ...check, references: [source.id, mask.id] },
      randomUUID(),
    );
    store.db
      .prepare(
        "INSERT INTO edit_requests(jobId,documentId,baseRevisionId,requestJson,snapshotJson,sourceAssetId,maskAssetId,idempotencyKey,createdAt) VALUES(?,?,?,?,?,?,?,?,?)",
      )
      .run(
        job.id,
        doc.id,
        doc.currentRevisionId,
        json,
        JSON.stringify(doc.snapshot),
        source.id,
        mask.id,
        request.idempotencyKey,
        new Date().toISOString(),
      );
    return editRow(store, job.id)!;
  });
}
export function reviewEdit(
  store: Store,
  jobId: string,
  action: "accept" | "keep-version" | "reject",
) {
  return store.transaction(() => {
    const row = editRow(store, jobId),
      job = store.job(jobId);
    if (!row || !job?.resultId || job.state !== "succeeded")
      throw Error("Edit result is not ready");
    if (row.acceptedDocumentId) {
      if (action === "reject")
        throw Error(
          "Accepted edit already has a saved master. Use Undo or the retained layers.",
        );
      return row;
    }
    if (action === "reject") {
      store.db
        .prepare(
          "UPDATE edit_requests SET disposition='rejected' WHERE jobId=?",
        )
        .run(jobId);
      return editRow(store, jobId)!;
    }
    const request = JSON.parse(row.requestJson) as EditRequest,
      base = JSON.parse(row.snapshotJson) as Snapshot;
    const original = store.document(row.documentId)!;
    if (
      action === "accept" &&
      original.currentRevisionId !== row.baseRevisionId
    )
      throw new Conflict(
        "The master changed while the edit ran. Keep this result as a separate version instead.",
      );
    const target =
      action === "accept"
        ? original
        : store.createDocument(original.projectId, original.originalAssetId);
    const asset = store.asset(job.resultId)!;
    const e = request.expand ?? { left: 0, top: 0 };
    const { selection: _, ...rest } = base;
    const snapshot: Snapshot = {
      ...rest,
      id: target.id,
      width: asset.width,
      height: asset.height,
      layers: [
        ...base.layers.map((l) => ({
          ...l,
          visible: false,
          transform: {
            ...l.transform,
            x: l.transform.x + e.left,
            y: l.transform.y + e.top,
          },
        })),
        {
          id: randomUUID(),
          name: request.task + " · AI result",
          type: "generated",
          assetId: asset.id,
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
    );
    const version = store.version(
      saved.id,
      request.task + " · " + request.instruction.slice(0, 90),
      saved.currentRevisionId,
    );
    store.db
      .prepare(
        "UPDATE edit_requests SET disposition='accepted',acceptedDocumentId=?,versionId=? WHERE jobId=?",
      )
      .run(saved.id, version.id, jobId);
    return editRow(store, jobId)!;
  });
}
