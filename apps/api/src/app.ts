import Fastify from "fastify";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import type { ServerResponse } from "node:http";
import { z, ZodError } from "zod";
import { intentSchema } from "../../../packages/contracts/src/index.js";
import { snapshotSchema } from "../../../packages/document/src/schema.js";
import { preflight } from "../../../packages/workflows/src/bind.js";
import { chooseRoute } from "../../../packages/routing/src/policy.js";
import { Store, Conflict } from "./store.js";
import { ComfyClient } from "./comfy.js";
import { Worker } from "./worker.js";
import { config } from "./config.js";
import { graph, manifest } from "./workflow.js";
export async function createApp(
  options: {
    dataDir?: string;
    comfy?: ComfyClient;
    worker?: boolean;
    port?: number;
  } = {},
) {
  const port = options.port ?? config.port;
  const app = Fastify({ bodyLimit: 32 * 1024 * 1024, logger: false });
  const store = new Store(options.dataDir ?? config.dataDir);
  const comfy =
    options.comfy ?? new ComfyClient(config.comfyUrl, config.instance);
  const worker = new Worker(store, comfy);
  const token = randomBytes(32).toString("hex");
  const hosts = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
  ]);
  app.addHook("onRequest", async (req, reply) => {
    if (
      !hosts.has(req.headers.host ?? "") ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return reply.code(403).send({ error: "Local workspace access only" });
    if (req.headers.origin && !hosts.has(new URL(req.headers.origin).host))
      return reply.code(403).send({ error: "Origin rejected" });
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers["x-darkroom-token"] !== token
    )
      return reply
        .code(403)
        .send({ error: "Workspace session token required" });
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("Cache-Control", "no-store");
  });
  app.setErrorHandler((error, req, reply) => {
    const e = error as Error & { statusCode?: number };
    const status =
      e instanceof Conflict
        ? 409
        : e instanceof ZodError
          ? 400
          : (e.statusCode ?? 400);
    reply.code(status).send({
      error:
        e instanceof ZodError
          ? e.issues.map((i) => i.message).join("; ")
          : status >= 500
            ? "Local service failed; your sources are preserved."
            : e.message,
    });
  });
  await app.register(multipart, {
    limits: { fileSize: 30 * 1024 * 1024, files: 1, fields: 1 },
  });
  app.get("/api/session", () => ({ token }));
  app.get("/api/health", () => ({
    ok: true,
    storage: "sqlite",
    reconciliation: store.reconcile(),
  }));
  app.get("/api/setup", async () => {
    const inspection = await comfy.inspect();
    let workflowReady = false;
    let reason = "Engine not verified";
    if (inspection.status.verified)
      try {
        preflight(graph, manifest, inspection.info);
        workflowReady =
          manifest.enabled &&
          !!manifest.validationEvidenceId &&
          manifest.validationFingerprint === inspection.status.fingerprint;
        reason = workflowReady
          ? "Foundation workflow ready"
          : "Installed; visual validation required";
      } catch (e) {
        reason = (e as Error).message;
      }
    return {
      engine: inspection.status,
      workflow: { id: manifest.id, ready: workflowReady, reason },
      phase: 1,
    };
  });
  app.get("/api/projects", () => store.projects());
  app.post("/api/projects", async (req, reply) =>
    reply.code(201).send(
      store.createProject(
        z
          .object({ name: z.string().trim().min(1).max(120) })
          .strict()
          .parse(req.body).name,
      ),
    ),
  );
  app.get<{ Params: { id: string } }>("/api/projects/:id/assets", async (req) =>
    store.assets(req.params.id),
  );
  app.post<{ Querystring: { projectId: string } }>(
    "/api/assets",
    async (req, reply) => {
      const projectId = z.string().uuid().parse(req.query.projectId);
      const file = await req.file();
      if (!file) throw Error("Choose an image");
      const bytes = await file.toBuffer();
      if (file.file.truncated) throw Error("Image exceeds 30 MB");
      const asset = await store.importAsset(bytes, file.filename, projectId);
      return reply.code(201).send(asset);
    },
  );
  app.get<{ Params: { id: string } }>("/api/assets/:id", async (req, reply) => {
    const asset = store.asset(req.params.id);
    if (!asset) return reply.code(404).send({ error: "Asset not found" });
    return reply.type(asset.mime).send(store.assetBytes(asset.id));
  });
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/documents",
    async (req) => store.documents(req.params.id),
  );
  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/documents",
    async (req, reply) => {
      const body = z
        .object({ assetId: z.string().uuid() })
        .strict()
        .parse(req.body);
      return reply
        .code(201)
        .send(store.createDocument(req.params.id, body.assetId));
    },
  );
  app.get<{ Params: { id: string } }>(
    "/api/documents/:id",
    async (req, reply) => {
      const d = store.document(req.params.id);
      return d ?? reply.code(404).send({ error: "Document not found" });
    },
  );
  app.patch<{ Params: { id: string } }>("/api/documents/:id", async (req) => {
    const body = z
      .object({ expectedRevision: z.string().uuid(), snapshot: snapshotSchema })
      .strict()
      .parse(req.body);
    return store.saveDocument(
      req.params.id,
      body.expectedRevision,
      body.snapshot,
    );
  });
  app.post<{ Params: { id: string } }>(
    "/api/documents/:id/versions",
    async (req) =>
      store.version(
        req.params.id,
        z.object({ name: z.string().trim().min(1).max(120) }).parse(req.body)
          .name,
      ),
  );
  app.get("/api/jobs", () => store.jobs().map(({ provenance, ...job }) => job));
  app.get<{ Params: { id: string } }>("/api/jobs/:id", async (req, reply) => {
    const j = store.job(req.params.id);
    return j ?? reply.code(404).send({ error: "Job not found" });
  });
  app.post("/api/jobs", async (req, reply) => {
    const b = z
      .object({
        projectId: z.string().uuid(),
        intent: intentSchema,
        idempotencyKey: z.string().uuid(),
      })
      .strict()
      .parse(req.body);
    const inspection = await comfy.inspect();
    if (!inspection.status.verified)
      throw Error(inspection.status.reason ?? "Desktop engine not verified");
    preflight(graph, manifest, inspection.info);
    chooseRoute(
      b.intent,
      [manifest],
      new Set(
        manifest.validationFingerprint === inspection.status.fingerprint
          ? [manifest.id]
          : [],
      ),
    );
    const queued = store
      .jobs()
      .filter((j) => ["queued", "validating"].includes(j.state));
    if (queued.length >= 8) throw Error("Queue full; wait for a job to finish");
    return reply
      .code(202)
      .send(store.enqueue(b.projectId, b.intent, b.idempotencyKey));
  });
  app.post<{ Params: { id: string } }>("/api/jobs/:id/cancel", async (req) => {
    const j = store.job(req.params.id);
    if (!j) throw Error("Job not found");
    if (j.state !== "queued")
      throw new Conflict(
        "Only queued jobs can be cancelled without interrupting other ComfyUI users",
      );
    store.updateJob(j.id, "cancelled");
    return store.job(j.id);
  });
  const streams = new Set<NodeJS.Timeout>();
  const responses = new Set<ServerResponse>();
  app.get("/api/events", async (req, reply) => {
    reply.hijack();
    responses.add(reply.raw);
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Content-Type-Options": "nosniff",
    });
    let sequence = Number(req.headers["last-event-id"] ?? 0);
    if (!Number.isSafeInteger(sequence) || sequence < 0) sequence = 0;
    const send = () => {
      for (const event of store.events(sequence)) {
        sequence = Number(event.sequence);
        reply.raw.write(
          `id: ${sequence}\nevent: update\ndata: ${JSON.stringify(event)}\n\n`,
        );
      }
      reply.raw.write(": heartbeat\n\n");
    };
    send();
    const timer = setInterval(send, 1000);
    streams.add(timer);
    req.raw.on("close", () => {
      clearInterval(timer);
      streams.delete(timer);
      responses.delete(reply.raw);
    });
  });
  const webRoot = resolve("dist/web");
  if (existsSync(webRoot)) await app.register(staticPlugin, { root: webRoot });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith("/api/"))
      return reply.code(404).send({ error: "Endpoint not found" });
    if (existsSync(webRoot)) return reply.sendFile("index.html");
    return reply.code(503).send("Build the interface with npm run build.");
  });
  app.addHook("preClose", async () => {
    for (const t of streams) clearInterval(t);
    for (const response of responses) response.end();
    await worker.stop();
  });
  app.addHook("onClose", async () => {
    store.close();
  });
  if (options.worker !== false) await worker.start();
  return { app, store, worker };
}
