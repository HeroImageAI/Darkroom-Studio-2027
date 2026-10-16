import { setTimeout as delay } from "node:timers/promises";
import {
  bind,
  preflight,
  byTitle,
} from "../../../packages/workflows/src/bind.js";
import { chooseRoute } from "../../../packages/routing/src/policy.js";
import { graph, workflows, workflowById } from "./workflow.js";
import { readiness } from "./readiness.js";
import { intentSchema } from "../../../packages/contracts/src/index.js";
import { graphHash } from "../../../packages/workflows/src/bind.js";
import sharp from "sharp";
import { editRow } from "./edits.js";
import { protectEdit } from "./edit-render.js";
import {
  assertEditReady,
  editSignature,
} from "../../../packages/routing/src/edit-policy.js";
import type { Store } from "./store.js";
import type { ComfyClient } from "./comfy.js";
import { randomUUID } from "node:crypto";
import { finishRow, executeFinish, collectFinish } from "./finish-jobs.js";
export class Worker {
  private owner = randomUUID();
  private ownsLease = false;
  private heartbeat: NodeJS.Timeout | undefined;
  private stopped = false;
  private busy = false;
  private socket: WebSocket | undefined;
  constructor(
    readonly store: Store,
    readonly client: ComfyClient,
  ) {}
  async recover() {
    const active = this.store
      .jobs()
      .filter(
        (j) =>
          !["succeeded", "failed", "cancelled", "interrupted"].includes(
            j.state,
          ),
      );
    if (active.some((j) => !["queued", "validating"].includes(j.state))) {
      const inspection = await this.client.inspect();
      if (!inspection.status.verified) return;
    }
    for (const j of this.store
      .jobs()
      .filter(
        (j) =>
          !["succeeded", "failed", "cancelled", "interrupted"].includes(
            j.state,
          ),
      )) {
      if (j.state === "queued" || j.state === "validating") {
        this.store.updateJob(j.id, "queued");
        continue;
      }
      if (!j.promptId) {
        try {
          const q = await this.client.queue();
          const history = await this.client.json("/history?max_items=50");
          const pending = [...q.queue_running, ...q.queue_pending].find(
            (p: any[]) => p[3]?.darkroomStudioJobId === j.id,
          );
          const completed = Object.entries(history).find(
            ([, h]: [string, any]) =>
              h.prompt?.[3]?.darkroomStudioJobId === j.id,
          );
          const recoveredId = pending?.[1] ?? completed?.[0];
          if (recoveredId) {
            this.store.updateJob(j.id, "running", { promptId: recoveredId });
            continue;
          }
          this.store.updateJob(j.id, "interrupted", {
            error:
              "Submission acknowledgement could not be recovered from the verified engine history and queue. Settings are preserved; no automatic retry was made.",
          });
          continue;
        } catch {
          /* Retain uncertain state while offline. */
        }
        this.store.updateJob(j.id, "uncertain", {
          error:
            "Submission acknowledgement was lost; inspect engine history before retrying",
        });
        continue;
      }
      try {
        const history = await this.client.history(j.promptId);
        if (history?.status?.status_str === "error") {
          this.store.updateJob(j.id, "failed", {
            error: "Engine execution failed",
          });
          continue;
        }
        if (history?.status?.completed) {
          try {
            await this.collect(j.id, history);
          } catch (e) {
            this.store.updateJob(j.id, "failed", {
              error: (e as Error).message,
            });
          }
          continue;
        }
        const started = this.store.jobStartedAt(j.id);
        if (
          started &&
          Date.now() - Date.parse(String(started)) > 10 * 60 * 1000
        ) {
          this.store.updateJob(j.id, "interrupted", {
            error:
              "This job has exceeded the recovery deadline. The engine may still be running; inspect before retrying.",
          });
          continue;
        }
        const q = await this.client.queue();
        if (
          [...q.queue_running, ...q.queue_pending].some(
            (p: unknown[]) => p[1] === j.promptId,
          )
        ) {
          this.store.updateJob(j.id, "running");
          continue;
        }
        this.store.updateJob(j.id, "interrupted", {
          error: "Engine no longer has this job. Settings are preserved.",
        });
      } catch {
        /* Engine offline: retain context for reconciliation on next tick. */
      }
    }
  }
  async start() {
    this.ownsLease = this.store.lease(this.owner);
    if (this.ownsLease) await this.recover();
    this.heartbeat = setInterval(() => {
      if (this.ownsLease && !this.store.lease(this.owner)) {
        this.ownsLease = false;
        this.stopped = true;
      }
    }, 5000);
    void this.loop();
  }
  private async loop() {
    while (!this.stopped) {
      try {
        await this.tick();
      } catch {
        /* Jobs record their own errors; retry connection without killing service. */
      }
      await delay(1000);
    }
  }
  async tick() {
    if (this.busy || this.stopped) return;
    if (!this.ownsLease) {
      this.ownsLease = this.store.lease(this.owner);
      if (!this.ownsLease) return;
      await this.recover();
    }
    this.busy = true;
    try {
      const existing = this.store
        .jobs()
        .find((j) =>
          ["running", "collecting", "submitting", "uncertain"].includes(
            j.state,
          ),
        );
      if (existing) {
        await this.recover();
        return;
      }
      const job = this.store.jobs().find((j) => j.state === "queued");
      if (!job) return;
      let submitted = false;
      try {
        this.store.updateJob(job.id, "validating");
        const inspection = await this.client.inspect();
        if (!inspection.status.verified)
          throw Error(
            inspection.status.reason ?? "Verified Desktop engine required",
          );
        if (finishRow(this.store, job.id)) {
          await executeFinish(
            this.store,
            this.client,
            job.id,
            inspection,
            () => this.stopped,
          );
          return;
        }
        const edit = editRow(this.store, job.id);
        const editRoute = edit
          ? assertEditReady(
              JSON.parse(edit.requestJson).task,
              inspection.status.fingerprint,
            )
          : undefined;
        job.intent = intentSchema.parse(job.intent);
        this.store.validateReferences(job.projectId, job.intent.references);
        const ready = new Set(
          readiness(inspection.status, inspection.info)
            .filter((w) => w.ready)
            .map((w) => w.id),
        );
        const route = chooseRoute(
          job.intent,
          workflows.map((w) => w.manifest),
          ready,
        );
        const { manifest, graph } = workflowById(route.workflow.id);
        const q = await this.client.queue();
        if (q.queue_running.length || q.queue_pending.length) {
          this.store.updateJob(job.id, "queued");
          return;
        }
        const values: Record<string, string | number> = {
          prompt: job.intent.prompt,
          width: job.intent.width,
          height: job.intent.height,
          seed: job.intent.seed,
          steps: manifest.qualitySteps?.[job.intent.quality] ?? 4,
        };
        for (let i = 0; i < job.intent.references.length; i++)
          values["reference" + (i + 1)] = await this.client.uploadReference(
            this.store.assetBytes(job.intent.references[i]!),
          );
        const compiled = bind(graph, manifest, values);
        const currentInfo = job.intent.references.length
          ? await this.client.json("/object_info")
          : inspection.info;
        preflight(
          compiled,
          { ...manifest, graphSha256: graphHash(compiled) },
          currentInfo,
          new Set(
            Object.entries(values)
              .filter(([key]) => key.startsWith("reference"))
              .map(([, value]) => String(value)),
          ),
        );
        const provenance = JSON.stringify({
          edit: edit
            ? {
                request: JSON.parse(edit.requestJson),
                baseRevisionId: edit.baseRevisionId,
                sourceAssetId: edit.sourceAssetId,
                maskAssetId: edit.maskAssetId,
                sourceHash: this.store.asset(edit.sourceAssetId)!.hash,
                maskHash: this.store.asset(edit.maskAssetId)!.hash,
                route: editRoute,
                implementationSha256: editSignature(),
                compositorVersion: 2,
              }
            : undefined,
          intent: job.intent,
          workflowId: manifest.id,
          workflowVersion: manifest.version,
          graphHash: manifest.graphSha256,
          graph: compiled,
          executionHash: graphHash(compiled),
          engine: inspection.status,
          route,
          submittedAt: new Date().toISOString(),
        });
        this.store.updateJob(job.id, "submitting", { provenance });
        this.socket = this.client.progress((event) => {
          const e = event as {
            type: string;
            data: { prompt_id?: string; value?: number; max?: number };
          };
          const current = this.store.job(job.id);
          if (
            current?.promptId &&
            e.data?.prompt_id === current.promptId &&
            e.type === "progress"
          )
            this.store.event(job.id, "progress", e.data);
        });
        submitted = true;
        const promptId = await this.client.submit(compiled, job.id);
        this.store.updateJob(job.id, "running", { promptId });
        const deadline = Date.now() + 10 * 60 * 1000;
        while (!this.stopped && Date.now() < deadline) {
          const history = await this.client.history(promptId);
          if (history?.status?.status_str === "error")
            throw Error("Engine execution failed");
          if (history?.status?.completed) {
            await this.collect(job.id, history);
            return;
          }
          await delay(1000);
        }
        if (!this.stopped)
          this.store.updateJob(job.id, "interrupted", {
            error:
              "Job exceeded 10 minute foundation deadline; engine may still be running. Inspect before retry.",
          });
      } catch (e) {
        const current = this.store.job(job.id);
        this.store.updateJob(
          job.id,
          submitted && !current?.promptId
            ? "uncertain"
            : submitted
              ? "interrupted"
              : "failed",
          { error: (e as Error).message },
        );
      } finally {
        this.socket?.close();
        this.socket = undefined;
      }
    } finally {
      this.busy = false;
    }
  }
  private async collect(jobId: string, history: any) {
    if (finishRow(this.store, jobId))
      return collectFinish(this.store, this.client, jobId, history);
    const job = this.store.job(jobId)!;
    const recorded = job.provenance ? JSON.parse(job.provenance) : {};
    const [outputId] = byTitle(recorded.graph ?? graph, "DR_OUTPUT");
    const images = history.outputs?.[outputId]?.images;
    if (!Array.isArray(images) || images.length !== 1)
      throw Error("Expected exactly one output image");
    this.store.updateJob(jobId, "collecting");
    const bytes = await this.client.image(images[0]);
    const metadata = await sharp(bytes).metadata();
    if (
      metadata.width !== job.intent.width ||
      metadata.height !== job.intent.height
    )
      throw Error("Output dimensions do not match request");
    const edit = editRow(this.store, jobId);
    let resultBytes = bytes;
    if (edit) {
      if (recorded.edit?.implementationSha256 !== editSignature())
        throw Error(
          "Edit renderer changed while this job was running. The source is preserved; retry after reviewing the current version.",
        );
      const raw = await this.store.internalAsset(
        bytes,
        "Uncomposited AI proposal.png",
        job.projectId,
      );
      this.store.db
        .prepare("UPDATE edit_requests SET rawAssetId=? WHERE jobId=?")
        .run(raw.id, jobId);
      resultBytes = await protectEdit(
        this.store.assetBytes(edit.sourceAssetId),
        this.store.assetBytes(edit.maskAssetId),
        bytes,
        JSON.parse(edit.requestJson).task !== "Background",
        JSON.parse(edit.requestJson).task !== "Expand",
      );
    }
    const asset = await this.store.importAsset(
      resultBytes,
      "Variation " + ((job.variationIndex ?? 0) + 1) + ".png",
      job.projectId,
      "generated",
    );
    if (
      !edit &&
      (asset.width !== job.intent.width || asset.height !== job.intent.height)
    )
      throw Error("Output dimensions do not match request");
    this.store.completeJob(jobId, asset.id);
  }
  async stop() {
    this.stopped = true;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.socket?.close();
    while (this.busy) await delay(50);
    this.store.releaseLease(this.owner);
  }
}
