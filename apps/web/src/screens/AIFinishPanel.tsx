import { useEffect, useRef, useState } from "react";
import type { FinishRequest } from "../../../../packages/contracts/src/finish.js";
import type { Job } from "../../../../packages/contracts/src/index.js";
import { api } from "../lib/api.js";
import { Button } from "../components/Controls.js";
type Entry = {
  jobId: string;
  sourceAssetId: string;
  disposition: string;
  acceptedDocumentId: string | null;
  request: FinishRequest;
  job: Job;
};
export function AIFinishPanel({
  documentId,
  width,
  height,
  hasSelection,
  prepare,
  onApplied,
  onPreview,
}: {
  documentId: string;
  width: number;
  height: number;
  hasSelection: boolean;
  prepare: () => Promise<{ documentId: string; expectedRevision: string }>;
  onApplied: (id: string) => Promise<void>;
  onPreview: (id: string | undefined) => void;
}) {
  const [tasks, setTasks] = useState<string[]>([]),
    [task, setTask] = useState<FinishRequest["task"]>("Remove background"),
    [scale, setScale] = useState("2"),
    [custom, setCustom] = useState(width * 2);
  const [entries, setEntries] = useState<Entry[]>([]),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [limits, setLimits] = useState("");
  const pending = useRef<FinishRequest | undefined>(undefined),
    key = "darkroom.finishPending." + documentId;
  const outputWidth =
    task === "Upscale"
      ? scale === "custom"
        ? custom
        : width * Number(scale)
      : width;
  const outputHeight =
    task === "Upscale" ? Math.round((outputWidth * height) / width) : height;
  const entry = entries.find((e) => e.jobId === selected) ?? entries[0];
  async function refresh() {
    const list = await api<Entry[]>(`/documents/${documentId}/finish`);
    setEntries(list);
    setSelected((id) => id || list[0]?.jobId || "");
  }
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    try {
      pending.current =
        JSON.parse(localStorage.getItem(key) ?? "null") ?? undefined;
    } catch {
      pending.current = undefined;
    }
    void api<{ tasks: string[]; limits: string }>("/finish-capabilities")
      .then((r) => {
        if (live) {
          setTasks(r.tasks);
          setLimits(r.limits);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    async function poll() {
      try {
        const r = await api<Entry[]>(`/documents/${documentId}/finish`);
        if (live) {
          setEntries(r);
          setSelected((id) => id || r[0]?.jobId || "");
        }
      } catch (e) {
        if (live) setError((e as Error).message);
      }
      if (live) timer = setTimeout(poll, 2000);
    }
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [documentId]);
  async function run(retry = false) {
    setBusy(true);
    setError("");
    try {
      if (!retry || !pending.current) {
        pending.current = {
          ...(await prepare()),
          idempotencyKey: crypto.randomUUID(),
          task,
          width: outputWidth,
          height: outputHeight,
        };
        localStorage.setItem(key, JSON.stringify(pending.current));
      }
      const row = await api<{ jobId: string }>("/finish", {
        method: "POST",
        body: JSON.stringify(pending.current),
      });
      pending.current = undefined;
      localStorage.removeItem(key);
      setSelected(row.jobId);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function review(action: "accept" | "keep-version" | "reject") {
    if (!entry) return;
    setBusy(true);
    setError("");
    try {
      if (action === "accept") await prepare();
      const r = await api<{ acceptedDocumentId: string | null }>(
        `/finish/${entry.jobId}/review`,
        { method: "POST", body: JSON.stringify({ action }) },
      );
      if (r.acceptedDocumentId) await onApplied(r.acceptedDocumentId);
      else onPreview(undefined);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ai-finish" aria-label="AI finishing">
      <h3>Local finishing</h3>
      <label>
        Action
        <select
          aria-label="Finish action"
          value={task}
          onChange={(e) => setTask(e.target.value as FinishRequest["task"])}
        >
          {["Remove background", "Upscale", "Restore"].map((t) => (
            <option key={t} disabled={!tasks.includes(t)}>
              {t}
            </option>
          ))}
        </select>
      </label>
      {task === "Upscale" && (
        <>
          <label>
            AI upscale
            <select
              aria-label="AI upscale size"
              value={scale}
              onChange={(e) => setScale(e.target.value)}
            >
              <option value="2">2×</option>
              <option value="4">4×</option>
              <option value="custom">Custom · Advanced</option>
            </select>
          </label>
          {scale === "custom" && (
            <label>
              Target width
              <input
                aria-label="AI upscale width"
                type="number"
                min={width}
                max="2048"
                value={custom}
                onChange={(e) => setCustom(Number(e.target.value))}
              />
            </label>
          )}
        </>
      )}
      <p>
        {outputWidth} × {outputHeight} px ·{" "}
        {task === "Remove background"
          ? "BiRefNet mask; original colours preserved"
          : "SeedVR2; review lettering and identity"}
      </p>
      <p>{limits}</p>
      {task === "Restore" && (
        <p>
          {hasSelection
            ? "Selected details stay unchanged. Restore repairs the surrounding image at the original size."
            : "Select lettering, a logo or details to keep unchanged, then run Restore."}
        </p>
      )}
      <Button
        disabled={
          busy ||
          !tasks.includes(task) ||
          (task === "Restore" &&
            (!hasSelection || outputWidth > 1024 || outputHeight > 1024)) ||
          outputWidth > 2048 ||
          outputHeight > 2048 ||
          outputWidth < 256 ||
          outputHeight < 256 ||
          outputWidth * outputHeight > 4194304
        }
        onClick={() => void run()}
      >
        {busy ? "Preparing…" : "Run finishing"}
      </Button>
      {pending.current && (
        <Button disabled={busy} onClick={() => void run(true)}>
          Retry finishing request
        </Button>
      )}
      {entries.length > 0 && (
        <>
          <label>
            Finish results
            <select
              aria-label="Finish results"
              value={entry?.jobId ?? ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {entries.map((e) => (
                <option key={e.jobId} value={e.jobId}>
                  {e.request.task} · {e.job.state} · {e.disposition}
                </option>
              ))}
            </select>
          </label>
          {entry && (
            <>
              <p role="status">
                {entry.job.state} · {entry.disposition}
              </p>
              {entry.job.error && <p role="alert">{entry.job.error}</p>}
              {entry.job.resultId && (
                <>
                  <div className="finish-compare">
                    <figure>
                      <img
                        src={`/api/assets/${entry.sourceAssetId}`}
                        alt="Before finishing"
                      />
                      <figcaption>Before</figcaption>
                    </figure>
                    <figure>
                      <img
                        src={`/api/assets/${entry.job.resultId}`}
                        alt="Proposed finished image"
                      />
                      <figcaption>Finished proposal</figcaption>
                    </figure>
                  </div>
                  <Button onClick={() => onPreview(entry.job.resultId!)}>
                    View result on canvas
                  </Button>
                  {entry.disposition === "candidate" && (
                    <div className="ai-review-actions">
                      <Button
                        primary
                        disabled={busy}
                        onClick={() => void review("accept")}
                      >
                        Accept finish
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => void review("keep-version")}
                      >
                        Keep as separate master
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={() => void review("reject")}
                      >
                        Reject finish
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
