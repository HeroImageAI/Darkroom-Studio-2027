import { migrate } from "./migrate.js";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdirSync,
  writeFileSync,
  renameSync,
  readFileSync,
  readdirSync,
  existsSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import type {
  Asset,
  Project,
  Job,
  Intent,
  JobState,
  IntentInput,
  CreateRequest,
  Candidate,
} from "../../../packages/contracts/src/index.js";
import { intentSchema } from "../../../packages/contracts/src/index.js";
import {
  snapshotSchema,
  initialSnapshot,
  type Snapshot,
} from "../../../packages/document/src/schema.js";
export class Conflict extends Error {}
const now = () => new Date().toISOString();
export class Store {
  readonly db: DatabaseSync;
  constructor(readonly root: string) {
    for (const p of ["assets", "documents", "tmp", "backups"])
      mkdirSync(join(root, p), { recursive: true });
    this.db = new DatabaseSync(join(root, "studio.sqlite"));
    this.db.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    migrate(this.db, root);
  }
  transaction<T>(fn: () => T): T {
    if (this.db.isTransaction) return fn();
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  projects() {
    return this.db
      .prepare("SELECT * FROM projects ORDER BY createdAt DESC")
      .all() as unknown as Project[];
  }
  createProject(name: string) {
    const p = { id: randomUUID(), name, createdAt: now() };
    this.db
      .prepare("INSERT INTO projects VALUES(?,?,?)")
      .run(p.id, p.name, p.createdAt);
    return p;
  }
  project(id: string) {
    return this.db
      .prepare("SELECT * FROM projects WHERE id=?")
      .get(id) as unknown as Project | undefined;
  }
  private atomic(relative: string, bytes: Buffer) {
    const temp = join(this.root, "tmp", randomUUID());
    const descriptor = openSync(temp, "wx");
    try {
      writeFileSync(descriptor, bytes);
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temp, join(this.root, relative));
  }
  async importAsset(
    bytes: Buffer,
    name: string,
    projectId: string,
    origin: "import" | "generated" = "import",
  ) {
    if (!this.project(projectId)) throw Error("Project not found");
    if (bytes.length > 30 * 1024 * 1024) throw Error("Image exceeds 30 MB");
    const image = sharp(bytes, {
      limitInputPixels: 40_000_000,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (
      !["png", "jpeg", "webp"].includes(metadata.format ?? "") ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages && metadata.pages > 1)
    )
      throw Error("Use a still PNG, JPEG or WebP image");
    // Decode fully before accepting bytes; metadata alone does not validate a truncated file.
    await image.stats();
    const hash = createHash("sha256").update(bytes).digest("hex");
    const path = join("assets", hash + "." + metadata.format);
    if (!existsSync(join(this.root, path))) this.atomic(path, bytes);
    const asset: Asset = {
      id: randomUUID(),
      hash,
      name: name.slice(0, 200),
      mime: "image/" + metadata.format,
      width:
        (metadata.orientation ?? 1) >= 5 ? metadata.height : metadata.width,
      height:
        (metadata.orientation ?? 1) >= 5 ? metadata.width : metadata.height,
      alpha: metadata.hasAlpha ?? false,
      origin,
      createdAt: now(),
    };
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO assets VALUES(?,?,?,?,?,?,?,?,?,?)")
        .run(
          asset.id,
          hash,
          path,
          asset.name,
          asset.mime,
          asset.width,
          asset.height,
          Number(asset.alpha),
          origin,
          asset.createdAt,
        );
      this.db
        .prepare("INSERT INTO project_assets VALUES(?,?,?)")
        .run(projectId, asset.id, origin === "import" ? "original" : "result");
    });
    return asset;
  }
  async internalAsset(bytes: Buffer, name: string, projectId: string) {
    const asset = await this.importAsset(bytes, name, projectId, "generated");
    this.db
      .prepare(
        "UPDATE project_assets SET role='internal' WHERE projectId=? AND assetId=?",
      )
      .run(projectId, asset.id);
    return asset;
  }
  asset(id: string) {
    const row = this.db
      .prepare("SELECT * FROM assets WHERE id=?")
      .get(id) as unknown as (Asset & { path: string }) | undefined;
    return row ? { ...row, alpha: !!row.alpha } : undefined;
  }
  assetBytes(id: string) {
    const a = this.asset(id);
    if (!a) throw Error("Asset not found");
    return readFileSync(join(this.root, a.path));
  }
  assets(projectId: string) {
    return this.db
      .prepare(
        "SELECT a.* FROM assets a JOIN project_assets p ON a.id=p.assetId WHERE p.projectId=? AND p.role!='internal' ORDER BY a.createdAt DESC",
      )
      .all(projectId)
      .map((r) => ({ ...r, alpha: !!r.alpha })) as unknown as Asset[];
  }
  documents(projectId: string) {
    return this.db
      .prepare("SELECT * FROM documents WHERE projectId=?")
      .all(projectId);
  }
  createDocument(projectId: string, assetId: string) {
    const a = this.asset(assetId);
    if (
      !a ||
      !this.db
        .prepare("SELECT 1 FROM project_assets WHERE projectId=? AND assetId=?")
        .get(projectId, assetId)
    )
      throw Error("Asset not in this project");
    const id = randomUUID();
    const snapshot = initialSnapshot(id, a, randomUUID());
    return this.transaction(() => {
      this.db
        .prepare("INSERT INTO documents VALUES(?,?,?,NULL)")
        .run(id, projectId, assetId);
      return this.writeRevision(id, null, snapshot);
    });
  }
  document(id: string) {
    const d = this.db.prepare("SELECT * FROM documents WHERE id=?").get(id) as
      | {
          id: string;
          projectId: string;
          originalAssetId: string;
          currentRevisionId: string;
        }
      | undefined;
    if (!d) return undefined;
    const r = this.db
      .prepare("SELECT * FROM revisions WHERE id=?")
      .get(d.currentRevisionId!);
    if (!r) throw Error("Missing document revision");
    const bytes = readFileSync(join(this.root, String(r.path)));
    if (createHash("sha256").update(bytes).digest("hex") !== r.hash)
      throw Error("Document revision integrity failure");
    return {
      ...d,
      snapshot: snapshotSchema.parse(JSON.parse(bytes.toString())),
    };
  }
  private writeRevision(id: string, parent: string | null, snapshot: Snapshot) {
    const doc = snapshotSchema.parse(snapshot);
    if (doc.id !== id) throw Error("Document ID mismatch");
    const projectId = this.db
      .prepare("SELECT projectId FROM documents WHERE id=?")
      .get(id)?.projectId;
    const assets = [
      ...new Set([
        ...(doc.selectionMaskAssetId ? [doc.selectionMaskAssetId] : []),
        ...doc.layers.flatMap((l) =>
          "assetId" in l
            ? [l.assetId, ...(l.maskAssetId ? [l.maskAssetId] : [])]
            : [],
        ),
      ]),
    ];
    for (const a of assets)
      if (
        !this.db
          .prepare(
            "SELECT 1 FROM project_assets WHERE projectId=? AND assetId=?",
          )
          .get(projectId!, a)
      )
        throw Error("Layer references an asset outside this project");
    const revisionId = randomUUID();
    const path = join("documents", revisionId + ".json");
    const bytes = Buffer.from(JSON.stringify(doc));
    this.atomic(path, bytes);
    this.db
      .prepare("INSERT INTO revisions VALUES(?,?,?,?,?,?)")
      .run(
        revisionId,
        id,
        parent,
        path,
        createHash("sha256").update(bytes).digest("hex"),
        now(),
      );
    for (const a of assets)
      this.db
        .prepare("INSERT INTO revision_assets VALUES(?,?)")
        .run(revisionId, a);
    this.db
      .prepare("UPDATE documents SET currentRevisionId=? WHERE id=?")
      .run(revisionId, id);
    return this.document(id)!;
  }
  saveDocument(id: string, expectedRevision: string, snapshot: Snapshot) {
    return this.transaction(() => {
      const d = this.db
        .prepare("SELECT currentRevisionId FROM documents WHERE id=?")
        .get(id);
      if (!d) throw Error("Document not found");
      if (d.currentRevisionId !== expectedRevision)
        throw new Conflict("Document changed; reload before saving");
      return this.writeRevision(id, expectedRevision, snapshot);
    });
  }
  version(id: string, name: string, expectedRevision?: string) {
    return this.transaction(() => {
      const doc = this.document(id);
      if (!doc) throw Error("Document not found");
      if (expectedRevision && doc.currentRevisionId !== expectedRevision)
        throw new Conflict("Document changed; reload before saving a version");
      const v = {
        id: randomUUID(),
        documentId: id,
        revisionId: String(doc.currentRevisionId),
        name,
        createdAt: now(),
      };
      this.db
        .prepare("INSERT INTO versions VALUES(?,?,?,?,?)")
        .run(v.id, id, v.revisionId, name, v.createdAt);
      return v;
    });
  }
  jobs() {
    return this.db
      .prepare("SELECT * FROM jobs ORDER BY createdAt")
      .all()
      .map((r) => ({
        ...r,
        intent: JSON.parse(String(r.intent)),
      })) as unknown as Job[];
  }
  job(id: string) {
    return this.jobs().find((j) => j.id === id);
  }
  jobStartedAt(id: string) {
    return this.db
      .prepare(
        "SELECT MIN(createdAt) AS started FROM events WHERE jobId=? AND type='state' AND json_extract(payload,'$.state')='running'",
      )
      .get(id)?.started;
  }
  enqueue(projectId: string, input: IntentInput, key: string) {
    const intent = intentSchema.parse(input);
    const old = this.db
      .prepare("SELECT * FROM jobs WHERE idempotencyKey=?")
      .get(key);
    if (old) {
      if (old.projectId !== projectId || old.intent !== JSON.stringify(intent))
        throw new Conflict("Idempotency key used for a different request");
      return this.job(String(old.id))!;
    }
    const id = randomUUID();
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO jobs(id,projectId,intent,state,promptId,error,resultId,createdAt,provenance,idempotencyKey) VALUES(?,?,?,'queued',NULL,NULL,NULL,?,NULL,?)",
        )
        .run(id, projectId, JSON.stringify(intent), now(), key);
      this.event(id, "state", { state: "queued" });
    });
    return this.job(id)!;
  }
  updateJob(
    id: string,
    state: JobState,
    fields: {
      promptId?: string;
      error?: string;
      resultId?: string;
      provenance?: string;
    } = {},
  ) {
    const j = this.job(id);
    if (!j) throw Error("Job not found");
    this.transaction(() => {
      this.db
        .prepare(
          "UPDATE jobs SET state=?,promptId=?,error=?,resultId=?,provenance=? WHERE id=?",
        )
        .run(
          state,
          fields.promptId ?? j.promptId,
          fields.error ?? j.error,
          fields.resultId ?? j.resultId,
          fields.provenance ?? j.provenance,
          id,
        );
      this.event(id, "state", { state, ...fields });
    });
  }
  event(jobId: string, type: string, payload: unknown) {
    this.db
      .prepare(
        "INSERT INTO events(jobId,type,payload,createdAt) VALUES(?,?,?,?)",
      )
      .run(jobId, type, JSON.stringify(payload), now());
  }
  validateReferences(projectId: string, references: string[]) {
    for (const id of references)
      if (
        !this.db
          .prepare(
            "SELECT 1 FROM project_assets WHERE projectId=? AND assetId=?",
          )
          .get(projectId, id)
      )
        throw Error("Reference image does not belong to this project");
  }
  batchForKey(key: string) {
    return this.db
      .prepare("SELECT id FROM create_batches WHERE idempotencyKey=?")
      .get(key)?.id;
  }
  createBatch(request: CreateRequest) {
    const json = JSON.stringify(request);
    const existing = this.db
      .prepare("SELECT * FROM create_batches WHERE idempotencyKey=?")
      .get(request.idempotencyKey);
    if (existing) {
      if (existing.requestJson !== json)
        throw new Conflict("Idempotency key used for a different request");
      return this.batch(String(existing.id));
    }
    if (!this.project(request.projectId)) throw Error("Project not found");
    this.validateReferences(request.projectId, request.intent.references);
    if (
      this.jobs().filter((j) =>
        [
          "queued",
          "validating",
          "running",
          "submitting",
          "collecting",
          "uncertain",
        ].includes(j.state),
      ).length +
        request.variations >
      8
    )
      throw Error("Queue full; wait for current work to finish");
    return this.transaction(() => {
      const id = randomUUID();
      this.db
        .prepare("INSERT INTO create_batches VALUES(?,?,?,?,?)")
        .run(id, request.projectId, json, request.idempotencyKey, now());
      for (let i = 0; i < request.variations; i++) {
        const job = this.enqueue(
          request.projectId,
          { ...request.intent, seed: (request.intent.seed + i) % 2 ** 32 },
          randomUUID(),
        );
        this.db
          .prepare("UPDATE jobs SET batchId=?,variationIndex=? WHERE id=?")
          .run(id, i, job.id);
      }
      return this.batch(id);
    });
  }
  batch(id: string) {
    const b = this.db
      .prepare("SELECT * FROM create_batches WHERE id=?")
      .get(id);
    if (!b) throw Error("Creation not found");
    const jobs = this.jobs()
      .filter((j) => j.batchId === id)
      .map(({ provenance, ...j }) => {
        const latest = this.db
          .prepare(
            "SELECT payload FROM events WHERE jobId=? AND type='progress' ORDER BY sequence DESC LIMIT 1",
          )
          .get(j.id);
        return {
          ...j,
          progress: latest ? JSON.parse(String(latest.payload)) : null,
        };
      });
    return {
      id,
      projectId: String(b.projectId),
      request: JSON.parse(String(b.requestJson)) as CreateRequest,
      createdAt: String(b.createdAt),
      jobs,
      candidates: this.candidates().filter((c) =>
        jobs.some((j) => j.id === c.jobId),
      ),
    };
  }
  batches(projectId: string) {
    return this.db
      .prepare(
        "SELECT id FROM create_batches WHERE projectId=? ORDER BY createdAt DESC",
      )
      .all(projectId)
      .map((b) => this.batch(String(b.id)));
  }
  candidates() {
    return this.db
      .prepare("SELECT * FROM candidates")
      .all() as unknown as Candidate[];
  }
  completeJob(jobId: string, assetId: string) {
    return this.transaction(() => {
      const job = this.job(jobId)!;
      const old = this.candidates().find((c) => c.jobId === jobId);
      if (!old)
        this.db
          .prepare(
            "INSERT INTO candidates VALUES(?,?,?,?,'candidate',NULL,NULL)",
          )
          .run(randomUUID(), jobId, assetId, job.variationIndex ?? 0);
      this.updateJob(jobId, "succeeded", { resultId: old?.assetId ?? assetId });
    });
  }
  review(
    id: string,
    action: "accept" | "keep-version" | "send-to-edit" | "reject",
  ) {
    return this.transaction(() => {
      const c = this.candidates().find((c) => c.id === id);
      if (!c) throw Error("Candidate not found");
      if (
        this.db
          .prepare(
            "SELECT 1 FROM edit_requests WHERE jobId=? UNION ALL SELECT 1 FROM finish_requests WHERE jobId=?",
          )
          .get(c.jobId, c.jobId)
      )
        throw Error(
          "Review AI edits and Finish results from their source master.",
        );
      if (action === "reject") {
        this.db
          .prepare("UPDATE candidates SET disposition='rejected' WHERE id=?")
          .run(id);
        return this.candidates().find((v) => v.id === id)!;
      }
      let documentId = c.documentId,
        versionId = c.versionId;
      if (!documentId) {
        const job = this.job(c.jobId)!;
        const doc = this.createDocument(job.projectId, c.assetId);
        documentId = doc.id;
        versionId = this.version(
          doc.id,
          "Generated variation " + (c.variationIndex + 1),
        ).id;
      }
      this.db
        .prepare(
          "UPDATE candidates SET disposition='accepted',documentId=?,versionId=? WHERE id=?",
        )
        .run(documentId, versionId, id);
      return this.candidates().find((v) => v.id === id)!;
    });
  }
  events(after: number) {
    return this.db
      .prepare(
        "SELECT * FROM events WHERE sequence>? ORDER BY sequence LIMIT 200",
      )
      .all(after);
  }
  reconcile() {
    const referenced = new Set(
      [
        ...this.db.prepare("SELECT path FROM assets").all(),
        ...this.db.prepare("SELECT path FROM revisions").all(),
      ].map((r) => String(r.path)),
    );
    const missing = [...referenced].filter(
      (p) => !existsSync(join(this.root, p)),
    );
    const orphaned = ["assets", "documents", "tmp"]
      .flatMap((dir) =>
        readdirSync(join(this.root, dir)).map((f) => join(dir, f)),
      )
      .filter((p) => !referenced.has(p));
    return { missing, orphaned };
  }
  close() {
    this.db.close();
  }
  lease(owner: string, ttlMs = 30000) {
    return this.transaction(() => {
      const lease = this.db
        .prepare("SELECT * FROM worker_leases WHERE id=1")
        .get();
      if (
        lease &&
        lease.owner !== owner &&
        Number(lease.expiresAt) > Date.now()
      )
        return false;
      this.db
        .prepare(
          "INSERT INTO worker_leases VALUES(1,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expiresAt=excluded.expiresAt",
        )
        .run(owner, Date.now() + ttlMs);
      return true;
    });
  }
  releaseLease(owner: string) {
    this.db
      .prepare("DELETE FROM worker_leases WHERE id=1 AND owner=?")
      .run(owner);
  }
}
