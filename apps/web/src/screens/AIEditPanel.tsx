import { useEffect, useRef, useState } from "react";
import {
  editTasks,
  type EditRequest,
} from "../../../../packages/contracts/src/edit.js";
import type { Job } from "../../../../packages/contracts/src/index.js";
import { api } from "../lib/api.js";
import { Button } from "../components/Controls.js";
type Entry = {
  jobId: string;
  documentId: string;
  sourceAssetId: string;
  maskAssetId: string;
  disposition: string;
  acceptedDocumentId: string | null;
  request: EditRequest;
  job: Job;
};
export function AIEditPanel({
  documentId,
  hasSelection,
  prepare,
  onApplied,
  onPreview,
}: {
  documentId: string;
  hasSelection: boolean;
  prepare: () => Promise<{ documentId: string; expectedRevision: string }>;
  onApplied: (id: string) => Promise<void>;
  onPreview: (assetId: string | undefined) => void;
}) {
  const [instruction, setInstruction] = useState(
    () => localStorage.getItem("darkroom.aiBrief." + documentId) ?? "",
  );
  const [task, setTask] = useState<EditRequest["task"]>("Instruct");
  const [area, setArea] = useState<EditRequest["area"]>("selection");
  const [expand, setExpand] = useState({
    left: 0,
    right: 0,
    top: 128,
    bottom: 0,
  });
  const [entries, setEntries] = useState<Entry[]>([]),
    [selected, setSelected] = useState("");
  const [enabled, setEnabled] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [compare, setCompare] = useState(false),
    [showRegion, setShowRegion] = useState(false);
  const pending = useRef<EditRequest | undefined>(undefined);
  async function refresh() {
    const list = await api<Entry[]>("/documents/" + documentId + "/edits");
    setEntries(list);
    setSelected((id) => id || list[0]?.jobId || "");
    return list;
  }
  useEffect(() => {
    let live = true;
    void api<{ tasks: string[] }>("/edit-capabilities")
      .then((v) => {
        if (live) setEnabled(v.tasks);
      })
      .catch(() => {});
    try {
      pending.current =
        JSON.parse(
          localStorage.getItem("darkroom.aiPending." + documentId) ?? "null",
        ) ?? undefined;
    } catch {
      /* Invalid browser request is not submitted. */
    }
    const update = () => void refresh().catch(() => {});
    update();
    const timer = setInterval(update, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [documentId]);
  const entry = entries.find((e) => e.jobId === selected) ?? entries[0];
  useEffect(() => {
    if (entry?.job.resultId && entry.disposition === "candidate")
      onPreview(entry.job.resultId);
  }, [entry?.jobId, entry?.job.resultId]);
  async function apply() {
    setBusy(true);
    setError("");
    try {
      if (!pending.current) {
        const base = await prepare();
        pending.current = {
          ...base,
          instruction,
          task,
          area: task === "Instruct" && !hasSelection ? "whole" : area,
          seed: crypto.getRandomValues(new Uint32Array(1))[0]!,
          idempotencyKey: crypto.randomUUID(),
          ...(task === "Expand" ? { expand } : {}),
        };
        localStorage.setItem(
          "darkroom.aiPending." + documentId,
          JSON.stringify(pending.current),
        );
      }
      const r = await api<{ jobId: string }>("/edits", {
        method: "POST",
        body: JSON.stringify(pending.current),
      });
      pending.current = undefined;
      localStorage.removeItem("darkroom.aiPending." + documentId);
      setSelected(r.jobId);
      await refresh();
      setCompare(false);
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
        "/edits/" + entry.jobId + "/review",
        { method: "POST", body: JSON.stringify({ action }) },
      );
      await refresh();
      if (r.acceptedDocumentId) await onApplied(r.acceptedDocumentId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ai-edit" aria-label="AI instruction">
      <h2>Describe the change</h2>
      <p className="muted">
        Select an area on the canvas, then tell Darkroom what you want. Results
        wait for your review.
      </p>
      <Button
        disabled={busy || !hasSelection || !enabled.includes("Instruct")}
        onClick={() => {
          setTask("Instruct");
          setArea("outside");
          setInstruction(
            "Make this composition look like one coherent professional photograph. Harmonise the lighting, colour, contact shadows and joins around the selected subject. Keep the selected product, lettering and design exactly unchanged. Turn rough guidance paint into natural lighting or shadow; do not add objects or text.",
          );
        }}
      >
        Harmonise composite
      </Button>
      <p className="muted">
        For a composite, select the product or branding to keep unchanged, then
        harmonise its surroundings. Use a close lasso so unwanted background or
        rough paint is not kept with the subject. Review edges and shadows
        before accepting.
      </p>
      <label>
        Action
        <select
          aria-label="AI edit action"
          value={task}
          onChange={(e) => {
            setTask(e.target.value as EditRequest["task"]);
            setArea(e.target.value === "Background" ? "outside" : "selection");
          }}
        >
          {editTasks.map((t) => (
            <option key={t} value={t}>
              {t}
              {!enabled.includes(t) ? " · not validated" : ""}
            </option>
          ))}
        </select>
      </label>
      {task !== "Expand" && hasSelection && (
        <label>
          Area
          <select
            aria-label="AI edit area"
            value={area}
            onChange={(e) => setArea(e.target.value as EditRequest["area"])}
          >
            <option value="selection">Inside selection</option>
            <option value="outside">Outside selection</option>
            {task === "Instruct" && <option value="whole">Whole image</option>}
          </select>
        </label>
      )}
      {task !== "Expand" && (
        <p className="muted">
          {hasSelection
            ? area === "outside"
              ? "The selected area stays protected."
              : "Pixels outside the selection stay protected."
            : task === "Instruct"
              ? "No selection: this changes the whole image."
              : "Select an area before applying this action."}
        </p>
      )}
      {task === "Expand" && (
        <fieldset>
          <legend>Add canvas space (pixels)</legend>
          {(["left", "right", "top", "bottom"] as const).map((k) => (
            <label key={k}>
              {k}
              <input
                aria-label={"Expand " + k}
                type="number"
                min="0"
                max="512"
                value={expand[k]}
                onChange={(e) =>
                  setExpand({ ...expand, [k]: Number(e.target.value) })
                }
              />
            </label>
          ))}
        </fieldset>
      )}
      <label>
        Instruction
        <textarea
          aria-label="AI edit instruction"
          value={instruction}
          maxLength={8000}
          rows={4}
          onChange={(e) => {
            setInstruction(e.target.value);
            localStorage.setItem(
              "darkroom.aiBrief." + documentId,
              e.target.value,
            );
          }}
          placeholder="Make the selected fabric navy. Keep its texture and folds."
        />
      </label>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      <Button
        primary
        disabled={
          busy ||
          (!pending.current &&
            (!instruction.trim() ||
              !enabled.includes(task) ||
              (task !== "Instruct" && task !== "Expand" && !hasSelection)))
        }
        onClick={() => void apply()}
      >
        {pending.current ? "Retry same request" : "Apply change"}
      </Button>
      {pending.current && (
        <Button
          disabled={busy}
          onClick={() => {
            pending.current = undefined;
            localStorage.removeItem("darkroom.aiPending." + documentId);
            setError(
              "Request abandoned locally. Check the history before starting another edit.",
            );
          }}
        >
          Start a different request
        </Button>
      )}
      {entries.length > 0 && (
        <>
          <label>
            Previous changes
            <select
              aria-label="Previous AI edits"
              value={entry?.jobId ?? ""}
              onChange={(e) => {
                setSelected(e.target.value);
                setCompare(false);
              }}
            >
              {entries.map((e) => (
                <option key={e.jobId} value={e.jobId}>
                  {e.request.task} · {e.job.state} ·{" "}
                  {e.request.instruction.slice(0, 40)}
                </option>
              ))}
            </select>
          </label>
          {entry && (
            <>
              <p>{entry.request.instruction}</p>
              <p role="status">
                {entry.job.state === "succeeded"
                  ? "Ready for review · " + entry.disposition
                  : entry.job.state}
              </p>
              {entry.job.error && <p role="alert">{entry.job.error}</p>}
              <Button onClick={() => setShowRegion((v) => !v)}>
                {showRegion ? "Hide edit region" : "Show edit region"}
              </Button>
              {showRegion && (
                <figure>
                  <img
                    src={"/api/assets/" + entry.maskAssetId}
                    alt="Allowed edit region: white changes, black protected"
                  />
                  <figcaption>
                    White may change. Black stays protected.
                  </figcaption>
                </figure>
              )}
              {entry.job.resultId && (
                <>
                  <Button
                    onClick={() => {
                      setCompare((v) => !v);
                      onPreview(
                        compare ? entry.job.resultId! : entry.sourceAssetId,
                      );
                    }}
                  >
                    {compare ? "Show result" : "Compare with before"}
                  </Button>
                  <figure>
                    <img
                      src={
                        "/api/assets/" +
                        (compare ? entry.sourceAssetId : entry.job.resultId)
                      }
                      alt={compare ? "Before AI edit" : "Proposed AI edit"}
                    />
                    <figcaption>
                      {compare
                        ? "Before"
                        : "Proposed result · review before accepting"}
                    </figcaption>
                  </figure>
                  <div className="ai-review-actions">
                    <Button
                      primary
                      disabled={busy || entry.disposition === "accepted"}
                      onClick={() => void review("accept")}
                    >
                      Accept edit
                    </Button>
                    <Button
                      disabled={busy || entry.disposition === "accepted"}
                      onClick={() => void review("keep-version")}
                    >
                      Keep as separate version
                    </Button>
                    <Button
                      disabled={
                        busy ||
                        entry.disposition === "accepted" ||
                        entry.disposition === "rejected"
                      }
                      onClick={() => void review("reject")}
                    >
                      Reject edit
                    </Button>
                  </div>
                </>
              )}
              <Button
                disabled={busy}
                onClick={() => {
                  setTask(entry.request.task);
                  setInstruction(entry.request.instruction);
                  setArea(entry.request.area);
                  if (entry.request.expand) setExpand(entry.request.expand);
                  setError(
                    "Brief loaded. Apply creates a new result against the current saved master.",
                  );
                }}
              >
                Use this instruction
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}
