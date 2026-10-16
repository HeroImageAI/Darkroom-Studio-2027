import { useEffect, useRef, useState } from "react";
import {
  aspectDimensions,
  dimensions,
  type Asset,
  type Candidate,
  type Intent,
  type Job,
  type CreateRequest,
} from "../../../../packages/contracts/src/index.js";
import { api } from "../lib/api.js";
import { Button, Panel } from "../components/Controls.js";
type Batch = {
  id: string;
  request: CreateRequest;
  createdAt: string;
  jobs: (Job & { progress?: { value: number; max: number } | null })[];
  candidates: Candidate[];
};
type Props = {
  projectId: string;
  assets: Asset[];
  references: string[];
  onReferences: (ids: string[]) => void;
  prompt: string;
  onPrompt: (text: string) => void;
  onImport: () => void;
  onEdit: (assetId: string, documentId: string) => Promise<void>;
  onSetup: () => void;
};
export function CreateWorkspace(p: Props) {
  const [aspect, setAspect] = useState<keyof typeof aspectDimensions>("Square");
  const [quality, setQuality] = useState<"Draft" | "Final">("Draft");
  const [variations, setVariations] = useState(1);
  const [model, setModel] = useState<"Auto" | "Klein" | "Qwen">("Auto");
  const [custom, setCustom] = useState(false);
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [seed, setSeed] = useState("");
  const [saved, setSaved] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [batchId, setBatchId] = useState("");
  const [candidateId, setCandidateId] = useState("");
  const [compare, setCompare] = useState("");
  const [comparing, setComparing] = useState(false);
  const requestRef = useRef<{
    key: string;
    body: string;
    signature: string;
  } | null>(null);
  const [w, h] = custom ? [width, height] : dimensions(aspect, quality);
  const refresh = async () => {
    if (p.projectId)
      setBatches(await api<Batch[]>("/projects/" + p.projectId + "/create"));
  };
  useEffect(() => {
    if (!p.projectId) return;
    let alive = true;
    setError("");
    setBatches([]);
    setBatchId("");
    setCandidateId("");
    setComparing(false);
    void api<Batch[]>("/projects/" + p.projectId + "/create")
      .then((v) => {
        if (alive) setBatches(v);
      })
      .catch((e) => setError(e.message));
    const events = new EventSource("/api/events");
    let timer: ReturnType<typeof setTimeout> | undefined;
    events.addEventListener("update", () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void refresh().catch((e) => setError(e.message));
      }, 150);
    });
    return () => {
      alive = false;
      events.close();
      clearTimeout(timer);
    };
  }, [p.projectId]);
  const batch = batches.find((b) => b.id === batchId) ?? batches[0];
  const candidates = batch?.candidates ?? [];
  const candidate =
    candidates.find((c) => c.id === candidateId) ?? candidates[0];
  const alternatives = [
    ...(batch?.request.intent.references ?? []).map((id, i) => ({
      value: id,
      label: "Reference " + (i + 1),
    })),
    ...candidates
      .filter((c) => c.id !== candidate?.id)
      .map((c) => ({
        value: c.assetId,
        label: "Variation " + (c.variationIndex + 1),
      })),
  ];
  const compareAsset =
    alternatives.find((a) => a.value === compare)?.value ??
    alternatives[0]?.value;
  async function generate(retry?: Intent) {
    setPending(true);
    setError("");
    setNotice("");
    try {
      const intent: Intent = retry
        ? { ...retry, seed: crypto.getRandomValues(new Uint32Array(1))[0]! }
        : {
            prompt: p.prompt,
            width: w!,
            height: h!,
            seed:
              seed === ""
                ? crypto.getRandomValues(new Uint32Array(1))[0]!
                : Number(seed),
            model,
            quality,
            references: p.references,
          };
      const signature = JSON.stringify({
        projectId: p.projectId,
        intent: {
          ...intent,
          seed: retry ? "retry-" + batch?.id : seed || "random",
        },
        variations: retry ? (batch?.request.variations ?? 1) : variations,
      });
      if (requestRef.current?.signature !== signature)
        requestRef.current = {
          body: JSON.stringify({
            projectId: p.projectId,
            intent,
            variations: retry ? (batch?.request.variations ?? 1) : variations,
          }),
          key: crypto.randomUUID(),
          signature,
        };
      const body = requestRef.current.body;
      const result = await api<Batch>("/create", {
        method: "POST",
        body: JSON.stringify({
          ...JSON.parse(body),
          idempotencyKey: requestRef.current!.key,
        }),
      });
      requestRef.current = null;
      setBatchId(result.id);
      setCandidateId("");
      setComparing(false);
      await refresh();
      setNotice(
        "Creating " +
          result.request.variations +
          " variation" +
          (result.request.variations === 1 ? "" : "s") +
          ". You can keep working while they render.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function review(
    action: "accept" | "keep-version" | "send-to-edit" | "reject",
  ) {
    if (!candidate) return;
    setPending(true);
    setError("");
    try {
      const result = await api<Candidate>(
        "/candidates/" + candidate.id + "/review",
        { method: "POST", body: JSON.stringify({ action }) },
      );
      await refresh();
      if (action === "send-to-edit")
        await p.onEdit(result.assetId, result.documentId!);
      else
        setNotice(
          action === "reject"
            ? "Candidate rejected. Its image is retained."
            : "Version saved. Your source and other candidates are preserved.",
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <div className="hero">
        <div className="eyebrow">LOCAL AI. YOUR CREATIVE DIRECTION.</div>
        <h1>
          What do you want
          <br />
          to <span>create?</span>
        </h1>
        <p>Start with an idea. Add a reference. Find your next direction.</p>
        <svg className="exposure" viewBox="0 0 600 240" aria-hidden="true">
          <defs>
            <linearGradient id="light">
              <stop stopColor="var(--deep-crimson)" stopOpacity="0" />
              <stop offset=".6" stopColor="var(--crimson)" />
              <stop
                offset="1"
                stopColor="var(--deep-crimson)"
                stopOpacity="0"
              />
            </linearGradient>
          </defs>
          <path d="M-20 225 C140 250 130 70 290 100 S440 230 630 30" />
          <path d="M-20 235 C145 255 150 90 300 115 S460 210 640 48" />
        </svg>
      </div>
      {error && (
        <div role="alert" className="message error">
          <span>{error}</span>
          <Button onClick={p.onSetup}>Check local setup</Button>
        </div>
      )}
      {notice && (
        <div className="message" role="status">
          {notice}
        </div>
      )}
      <Panel className="composer">
        <div className="section-heading">
          <label htmlFor="brief" className="field-label">
            YOUR CREATIVE BRIEF
          </label>
          <Button
            className="quiet"
            onClick={() => {
              try {
                localStorage.setItem("darkroom.brief", p.prompt);
                setSaved(true);
                setNotice("Brief saved on this browser.");
              } catch {
                setError(
                  "Browser storage is full; copy the brief before closing.",
                );
              }
            }}
          >
            {saved ? "Save brief" : "Save brief · unsaved"}
          </Button>
        </div>
        <textarea
          id="brief"
          value={p.prompt}
          onChange={(e) => {
            p.onPrompt(e.target.value);
            setSaved(false);
          }}
          placeholder="A sculptural perfume bottle on dark stone, soft edge lighting…"
        />
        {p.references.length > 0 && (
          <div className="reference-strip" aria-label="Reference images">
            {p.references.map((id, i) => (
              <div className="reference" key={id}>
                <img src={"/api/assets/" + id} alt={"Reference " + (i + 1)} />
                <span>{i + 1}</span>
                <button
                  aria-label={"Remove reference " + (i + 1)}
                  onClick={() =>
                    p.onReferences(p.references.filter((v) => v !== id))
                  }
                >
                  ×
                </button>
                {i > 0 && (
                  <button
                    className="ref-move"
                    aria-label={"Move reference " + (i + 1) + " earlier"}
                    onClick={() => {
                      const ids = [...p.references];
                      [ids[i - 1], ids[i]] = [ids[i]!, ids[i - 1]!];
                      p.onReferences(ids);
                    }}
                  >
                    ←
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        <div className="composer-actions">
          <Button onClick={p.onImport} disabled={p.references.length >= 3}>
            ＋ Import an image
          </Button>
          <span>{p.references.length}/3 references · drop or paste images</span>
          <Button
            primary
            disabled={pending || !p.projectId || !p.prompt.trim()}
            onClick={() => void generate()}
          >
            {pending ? "Preparing…" : "Generate ↗"}
          </Button>
        </div>
      </Panel>
      <div className="create-controls">
        <label>
          Aspect
          <select
            aria-label="Aspect"
            value={aspect}
            onChange={(e) => {
              setAspect(e.target.value as typeof aspect);
              setCustom(false);
            }}
          >
            {Object.keys(aspectDimensions).map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </label>
        <label>
          Quality
          <select
            aria-label="Quality"
            value={quality}
            onChange={(e) => setQuality(e.target.value as typeof quality)}
          >
            <option>Draft</option>
            <option>Final</option>
          </select>
        </label>
        <label>
          Variations
          <select
            aria-label="Variations"
            value={variations}
            onChange={(e) => setVariations(Number(e.target.value))}
          >
            {[1, 2, 3, 4].map((n) => (
              <option key={n}>{n}</option>
            ))}
          </select>
        </label>
        <span className="muted">
          {w} × {h}
        </span>
        <details className="advanced">
          <summary>Advanced</summary>
          <div>
            <label>
              Model
              <select
                aria-label="Model"
                value={model}
                onChange={(e) => setModel(e.target.value as typeof model)}
              >
                <option>Auto</option>
                <option>Klein</option>
                <option>Qwen</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={custom}
                onChange={(e) => setCustom(e.target.checked)}
              />{" "}
              Custom dimensions
            </label>
            {custom && (
              <>
                <label>
                  Width
                  <input
                    type="number"
                    value={width}
                    min={256}
                    max={1536}
                    step={16}
                    onChange={(e) => setWidth(Number(e.target.value))}
                  />
                </label>
                <label>
                  Height
                  <input
                    type="number"
                    value={height}
                    min={256}
                    max={1536}
                    step={16}
                    onChange={(e) => setHeight(Number(e.target.value))}
                  />
                </label>
                <small>Multiples of 16; up to 1,572,864 pixels.</small>
              </>
            )}
            <label>
              Seed
              <input
                aria-label="Seed"
                type="number"
                placeholder="Random"
                value={seed}
                min={0}
                max={2 ** 32 - 1}
                onChange={(e) => setSeed(e.target.value)}
              />
            </label>
            <p>
              Draft uses smaller presets. Final uses larger presets and more
              Qwen refinement steps. Prompt wording is preserved exactly.
            </p>
          </div>
        </details>
      </div>
      {batches.length > 0 && (
        <section className="results" aria-label="Create results">
          <div className="section-heading">
            <h2>Your directions</h2>
            <label className="muted">
              Creation
              <select
                aria-label="Creation history"
                value={batch?.id ?? ""}
                onChange={(e) => {
                  setBatchId(e.target.value);
                  setCandidateId("");
                  setComparing(false);
                }}
              >
                {batches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {new Date(b.createdAt).toLocaleTimeString()} ·{" "}
                    {b.request.intent.prompt.slice(0, 40)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="job-list">
            {batch?.jobs.map((j) => (
              <div key={j.id}>
                <span>
                  Variation {(j.variationIndex ?? 0) + 1} ·{" "}
                  {j.state === "succeeded"
                    ? "Ready to review"
                    : j.state === "queued"
                      ? "Waiting"
                      : j.state}
                </span>
                {![
                  "succeeded",
                  "failed",
                  "cancelled",
                  "interrupted",
                  "uncertain",
                ].includes(j.state) && (
                  <progress
                    aria-label={
                      "Variation " + ((j.variationIndex ?? 0) + 1) + " progress"
                    }
                    max={j.progress?.max ?? 100}
                    value={j.progress?.value}
                  />
                )}{" "}
                {j.state === "queued" && (
                  <Button
                    className="quiet"
                    onClick={async () => {
                      try {
                        await api("/jobs/" + j.id + "/cancel", {
                          method: "POST",
                        });
                        await refresh();
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Cancel queued variation
                  </Button>
                )}
                {j.error && <small className="error-text">{j.error}</small>}
              </div>
            ))}
          </div>
          {candidate && (
            <>
              <div
                className={
                  "result-stage " +
                  (comparing && compareAsset ? "comparing" : "")
                }
              >
                {comparing && compareAsset && (
                  <figure>
                    <img
                      src={"/api/assets/" + compareAsset}
                      alt={
                        alternatives.find((a) => a.value === compareAsset)
                          ?.label ?? "Comparison image"
                      }
                    />
                    <figcaption>
                      {
                        alternatives.find((a) => a.value === compareAsset)
                          ?.label
                      }
                    </figcaption>
                  </figure>
                )}
                <figure>
                  <img
                    src={"/api/assets/" + candidate.assetId}
                    alt={
                      "Generated variation " + (candidate.variationIndex + 1)
                    }
                  />
                  <figcaption>
                    Variation {candidate.variationIndex + 1} ·{" "}
                    {candidate.disposition}
                  </figcaption>
                </figure>
              </div>
              <div className="candidate-strip">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    aria-label={"Review variation " + (c.variationIndex + 1)}
                    aria-pressed={candidate.id === c.id}
                    onClick={() => setCandidateId(c.id)}
                  >
                    <img src={"/api/assets/" + c.assetId} alt="" />
                    <span>
                      {c.variationIndex + 1} · {c.disposition}
                    </span>
                  </button>
                ))}
              </div>
              <div className="review-actions">
                <Button
                  primary
                  disabled={pending}
                  onClick={() => void review("accept")}
                >
                  {candidate.disposition === "accepted" ? "Accepted" : "Accept"}
                </Button>
                <Button
                  disabled={pending}
                  onClick={() => void review("send-to-edit")}
                >
                  Send to Edit ↗
                </Button>
                <Button
                  disabled={pending}
                  onClick={() => void review("keep-version")}
                >
                  Keep as version
                </Button>
                <Button
                  disabled={!alternatives.length}
                  onClick={() => setComparing((v) => !v)}
                >
                  {comparing ? "Close comparison" : "Compare"}
                </Button>
                {comparing && (
                  <select
                    aria-label="Compare with"
                    value={compareAsset}
                    onChange={(e) => setCompare(e.target.value)}
                  >
                    {alternatives.map((a) => (
                      <option key={a.value} value={a.value}>
                        {a.label}
                      </option>
                    ))}
                  </select>
                )}
                <Button
                  className="quiet"
                  onClick={() => void review("reject")}
                  disabled={pending}
                >
                  Reject
                </Button>
              </div>
            </>
          )}
          <div className="section-heading">
            <Button
              onClick={() => void generate(batch!.request.intent)}
              disabled={pending}
            >
              Retry this brief
            </Button>
            <details className="request-details">
              <summary>Saved brief & settings</summary>
              <p>{batch?.request.intent.prompt}</p>
              <small>
                {batch?.request.intent.quality} · {batch?.request.intent.width}{" "}
                × {batch?.request.intent.height} · {batch?.request.intent.model}{" "}
                · seed {batch?.request.intent.seed}
              </small>
            </details>
          </div>
        </section>
      )}
    </>
  );
}
