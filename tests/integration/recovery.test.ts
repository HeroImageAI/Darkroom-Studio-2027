import { beforeEach, afterEach, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Store } from "../../apps/api/src/store.js";
import { Worker } from "../../apps/api/src/worker.js";
import { ComfyClient } from "../../apps/api/src/comfy.js";
import { manifest } from "../../apps/api/src/workflow.js";
let root: string;
let store: Store;
beforeEach(() => {
  mkdirSync("data/tests", { recursive: true });
  root = mkdtempSync(join("data/tests", "recovery-"));
  store = new Store(root);
});
afterEach(() => {
  store.close();
  rmSync(root, { recursive: true, force: true });
});
class Fake extends ComfyClient {
  override async inspect() {
    return {
      status: { connected: true, verified: true, url: this.url, models: {} },
      info: {},
    };
  }
  historyResult: any;
  queueResult = { queue_running: [] as any[], queue_pending: [] as any[] };
  submitted = 0;
  constructor() {
    super("http://127.0.0.1:8188", "test");
  }
  override async history() {
    return this.historyResult;
  }
  override async queue() {
    return this.queueResult;
  }
  override async json() {
    return {};
  }
  override async submit() {
    this.submitted++;
    return "never-duplicate";
  }
  override async image() {
    return sharp({
      create: { width: 512, height: 512, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
  }
}
function job() {
  return store.enqueue(
    store.createProject("Recovery").id,
    {
      prompt: "one red sphere",
      width: 512,
      height: 512,
      seed: 1,
      model: "Klein",
    },
    randomUUID(),
  );
}
it("reconciles a lost engine job without resubmitting it", async () => {
  const j = job();
  store.updateJob(j.id, "running", { promptId: "lost" });
  const fake = new Fake();
  await new Worker(store, fake).recover();
  expect(store.job(j.id)?.state).toBe("interrupted");
  expect(fake.submitted).toBe(0);
});
it("retains running engine context after app restart", async () => {
  const j = job();
  store.updateJob(j.id, "running", { promptId: "still-running" });
  const fake = new Fake();
  fake.queueResult.queue_running = [[1, "still-running", {}, {}]];
  await new Worker(store, fake).recover();
  expect(store.job(j.id)?.state).toBe("running");
  expect(fake.submitted).toBe(0);
});
it("imports a completed result exactly once during recovery", async () => {
  const j = job();
  store.updateJob(j.id, "running", { promptId: "complete" });
  const fake = new Fake();
  fake.historyResult = {
    status: { completed: true, status_str: "success" },
    outputs: {
      output: {
        images: [{ filename: "result.png", subfolder: "", type: "output" }],
      },
    },
  };
  const worker = new Worker(store, fake);
  await worker.recover();
  await worker.recover();
  expect(store.job(j.id)?.state).toBe("succeeded");
  expect(store.assets(j.projectId)).toHaveLength(1);
  expect(fake.submitted).toBe(0);
});
it("does not retry a submission with unknown acknowledgement", async () => {
  const j = job();
  store.updateJob(j.id, "submitting");
  const fake = new Fake();
  fake.json = async () => {
    throw Error("offline");
  };
  await new Worker(store, fake).recover();
  expect(store.job(j.id)?.state).toBe("uncertain");
  expect(fake.submitted).toBe(0);
});
it("recovers an unknown acknowledgement through the owned queue tag", async () => {
  const j = job();
  store.updateJob(j.id, "submitting");
  const fake = new Fake();
  fake.queueResult.queue_pending = [
    [1, "recovered", {}, { darkroomStudioJobId: j.id }],
  ];
  await new Worker(store, fake).recover();
  expect(store.job(j.id)?.promptId).toBe("recovered");
  expect(fake.submitted).toBe(0);
});
it("records an engine-reported failure instead of collecting it", async () => {
  const j = job();
  store.updateJob(j.id, "running", { promptId: "failed" });
  const fake = new Fake();
  fake.historyResult = { status: { completed: true, status_str: "error" } };
  await new Worker(store, fake).recover();
  expect(store.job(j.id)?.state).toBe("failed");
});
it("preserves context while the Desktop identity cannot be verified", async () => {
  const j = job();
  store.updateJob(j.id, "running", { promptId: "retained" });
  const fake = new Fake();
  fake.inspect = async () => ({
    status: { connected: false, verified: false, url: fake.url, models: {} },
    info: {},
  });
  await new Worker(store, fake).recover();
  expect(store.job(j.id)?.state).toBe("running");
  expect(fake.submitted).toBe(0);
});
it("releases an unacknowledged job only after a verified history/queue check", async () => {
  const j = job();
  store.updateJob(j.id, "submitting");
  const fake = new Fake();
  await new Worker(store, fake).recover();
  expect(store.job(j.id)?.state).toBe("interrupted");
  expect(fake.submitted).toBe(0);
});
it("detects a stalled recovered job without globally interrupting the engine", async () => {
  const j = job();
  store.updateJob(j.id, "running", { promptId: "stalled" });
  store.db
    .prepare("UPDATE events SET createdAt=? WHERE jobId=?")
    .run(new Date(Date.now() - 11 * 60 * 1000).toISOString(), j.id);
  const fake = new Fake();
  fake.queueResult.queue_running = [[1, "stalled", {}, {}]];
  await new Worker(store, fake).recover();
  expect(store.job(j.id)?.state).toBe("interrupted");
  expect(fake.submitted).toBe(0);
});
