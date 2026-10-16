import { useEffect, useRef, useState } from "react";
import type { Asset } from "../../../../packages/contracts/src/index.js";
import {
  snapshotSchema,
  type Snapshot,
} from "../../../../packages/document/src/schema.js";
import {
  cropDocument,
  historyCommit,
  localPoint,
  updateLayer,
  type Layer,
  type Point,
} from "../../../../packages/document/src/edit.js";
import { AIEditPanel } from "./AIEditPanel.js";
import { FinishPanel } from "./FinishPanel.js";
import { api } from "../lib/api.js";
import { Button } from "../components/Controls.js";
import "../styles/edit.css";
type Document = {
  id: string;
  projectId: string;
  originalAssetId: string;
  currentRevisionId: string;
  snapshot: Snapshot;
};
type Tool = "Move" | "Pan" | "Select" | "Lasso" | "Mask" | "Crop";
type Gesture = {
  start: Point;
  last: Point;
  before: Snapshot;
  layer?: Layer;
  points: Point[];
  pan: Point;
  client: Point;
};
export function EditWorkspace({
  projectId,
  asset,
  documentId,
  assets,
  onDocument,
  onImport,
  onRefresh,
}: {
  projectId: string;
  asset?: Asset;
  documentId: string | null;
  assets: Asset[];
  onDocument: (id: string) => void;
  onImport: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [record, setRecord] = useState<Document>();
  const [aiPreview, setAiPreview] = useState<string>();
  const [doc, setDoc] = useState<Snapshot>();
  const current = useRef<Snapshot | undefined>(undefined);
  const revision = useRef("");
  const saved = useRef("");
  const saving = useRef(false);
  const blocked = useRef(false);
  const gesture = useRef<Gesture | undefined>(undefined);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState("");
  const [tool, setTool] = useState<Tool>("Move");
  const [status, setStatus] = useState("Opening master…");
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [recovery, setRecovery] = useState<Snapshot>();
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [size, setSize] = useState(48);
  const [reveal, setReveal] = useState(false);
  const [crop, setCrop] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>();
  const [stroke, setStroke] = useState<Point[]>([]);
  const [versionName, setVersionName] = useState("");
  const [versionBusy, setVersionBusy] = useState(false);
  const [saveEpoch, setSaveEpoch] = useState(0);
  const svg = useRef<SVGSVGElement>(null);
  const key = "darkroom.master." + documentId;
  const chosen = doc?.layers.find((l) => l.id === selected);
  function display(next: Snapshot) {
    current.current = next;
    setDoc(next);
  }
  function commit(next: Snapshot) {
    const before = current.current;
    if (!before || blocked.current) return;
    const checked = snapshotSchema.safeParse(next);
    if (!checked.success) {
      setError(checked.error.issues[0]?.message ?? "Invalid edit");
      return;
    }
    setPast((p) => historyCommit(p, before, next));
    setFuture([]);
    display(next);
  }
  function changeLayer(change: Partial<Layer>) {
    if (current.current) commit(updateLayer(current.current, selected, change));
  }
  function undo() {
    if (blocked.current || !past.length || !current.current) return;
    const before = current.current;
    setFuture((f) => [before, ...f]);
    display(past[past.length - 1]!);
    setPast((p) => p.slice(0, -1));
  }
  function redo() {
    if (blocked.current || !future.length || !current.current) return;
    const before = current.current;
    setPast((p) => [...p, before]);
    display(future[0]!);
    setFuture((f) => f.slice(1));
  }
  useEffect(() => {
    let live = true;
    if (!documentId) {
      setDoc(undefined);
      current.current = undefined;
      return;
    }
    blocked.current = false;
    setConflict(false);
    setError("");
    setRecovery(undefined);
    setStatus("Opening master…");
    setDoc(undefined);
    current.current = undefined;
    void api<Document>("/documents/" + documentId)
      .then((d) => {
        if (!live) return;
        if (d.projectId !== projectId)
          throw Error("Master belongs to another project");
        setRecord(d);
        revision.current = d.currentRevisionId;
        saved.current = JSON.stringify(d.snapshot);
        display(d.snapshot);
        setSelected(d.snapshot.layers.at(-1)?.id ?? "");
        setPast([]);
        setFuture([]);
        setStatus("All changes saved");
        setZoom(1);
        setPan({ x: 0, y: 0 });
        setCrop(undefined);
        try {
          const draft = JSON.parse(localStorage.getItem(key) ?? "null");
          if (draft && JSON.stringify(draft.snapshot) !== saved.current) {
            const checked = snapshotSchema.parse(draft.snapshot);
            if (checked.id !== d.id) throw Error("Recovery document mismatch");
            setRecovery(checked);
            blocked.current = true;
            setConflict(draft.revision !== d.currentRevisionId);
            setStatus("Unsaved browser recovery available");
          }
        } catch {
          setError(
            "Browser recovery could not be read. The saved master is intact.",
          );
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [documentId, projectId]);
  async function save(): Promise<boolean> {
    if (
      !current.current ||
      !documentId ||
      blocked.current ||
      saving.current ||
      gesture.current
    )
      return false;
    const body = current.current,
      encoded = JSON.stringify(body);
    if (encoded === saved.current) return true;
    saving.current = true;
    setStatus("Saving…");
    try {
      const d = await api<Document>("/documents/" + documentId, {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: revision.current,
          snapshot: body,
        }),
      });
      revision.current = d.currentRevisionId;
      saved.current = encoded;
      setRecord(d);
      if (JSON.stringify(current.current) === encoded) {
        localStorage.removeItem(key);
        setStatus("All changes saved");
      } else {
        localStorage.setItem(
          key,
          JSON.stringify({
            revision: revision.current,
            snapshot: current.current,
          }),
        );
        setStatus("Unsaved changes");
        setSaveEpoch((n) => n + 1);
      }
      setError("");
      return true;
    } catch (e) {
      if ((e as Error).message.includes("Document changed")) {
        blocked.current = true;
        setConflict(true);
        setStatus("Save conflict · your changes are retained");
      } else setStatus("Not saved · retry available");
      setError((e as Error).message);
      return false;
    } finally {
      saving.current = false;
    }
  }
  useEffect(() => {
    if (!doc || blocked.current || gesture.current) return;
    if (JSON.stringify(doc) === saved.current) {
      localStorage.removeItem(key);
      setStatus("All changes saved");
      return;
    }
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ revision: revision.current, snapshot: doc }),
      );
    } catch {
      setError(
        "Browser recovery is full. Keep this window open until the local save succeeds.",
      );
    }
    setStatus("Unsaved changes");
    const timer = window.setTimeout(() => void save(), 650);
    return () => window.clearTimeout(timer);
  }, [doc, saveEpoch, documentId]);
  useEffect(() => {
    const leave = (e: BeforeUnloadEvent) => {
      if (current.current && JSON.stringify(current.current) !== saved.current)
        e.preventDefault();
    };
    window.addEventListener("beforeunload", leave);
    return () => window.removeEventListener("beforeunload", leave);
  }, []);
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      }
      if (e.key === "Escape") {
        if (gesture.current) display(gesture.current.before);
        gesture.current = undefined;
        setStroke([]);
        setCrop(undefined);
      }
      if (e.key.toLowerCase() === "v") setTool("Move");
      if (e.key.toLowerCase() === "h") setTool("Pan");
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  });
  async function prepareAI() {
    if (
      blocked.current ||
      !(await save()) ||
      JSON.stringify(current.current) !== saved.current
    )
      throw Error(
        "Save the current master before requesting or accepting an AI edit.",
      );
    return { documentId: documentId!, expectedRevision: revision.current };
  }
  async function adoptAI(id: string) {
    setAiPreview(undefined);
    await onRefresh();
    if (id !== documentId) {
      onDocument(id);
      return;
    }
    const d = await api<Document>("/documents/" + id);
    const before = current.current!;
    revision.current = d.currentRevisionId;
    saved.current = JSON.stringify(d.snapshot);
    setRecord(d);
    setPast((p) => historyCommit(p, before, d.snapshot));
    setFuture([]);
    display(d.snapshot);
    setSelected(d.snapshot.layers.at(-1)?.id ?? "");
    setStatus("All changes saved");
  }
  async function openMaster() {
    if (!asset) return;
    try {
      const d = await api<Document>("/projects/" + projectId + "/documents", {
        method: "POST",
        body: JSON.stringify({ assetId: asset.id }),
      });
      onDocument(d.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function point(e: React.PointerEvent): Point {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(
      matrix.inverse(),
    );
    return { x: p.x, y: p.y };
  }
  function down(e: React.PointerEvent<SVGSVGElement>) {
    if (!doc || blocked.current || e.button !== 0) return;
    const p = point(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    const hit = (e.target as Element)
      .closest("[data-layer]")
      ?.getAttribute("data-layer");
    const active =
      tool === "Move" && hit ? doc.layers.find((l) => l.id === hit) : chosen;
    if (tool === "Move" && active) setSelected(active.id);
    gesture.current = {
      start: p,
      last: p,
      before: doc,
      layer: active,
      points: [p],
      pan,
      client: { x: e.clientX, y: e.clientY },
    };
    if (tool === "Crop") setCrop(undefined);
    if (tool === "Mask" && chosen && !chosen.locked && "assetId" in chosen)
      setStroke([localPoint(p, chosen.transform)]);
  }
  function move(e: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) return;
    const p = point(e);
    g.last = p;
    if (tool === "Move" && g.layer && !g.layer.locked) {
      display(
        updateLayer(g.before, g.layer.id, {
          transform: {
            ...g.layer.transform,
            x: g.layer.transform.x + p.x - g.start.x,
            y: g.layer.transform.y + p.y - g.start.y,
          },
        }),
      );
    } else if (tool === "Pan") {
      setPan({
        x: g.pan.x + e.clientX - g.client.x,
        y: g.pan.y + e.clientY - g.client.y,
      });
    } else if (tool === "Crop")
      setCrop({
        x: Math.max(0, Math.min(p.x, g.start.x)),
        y: Math.max(0, Math.min(p.y, g.start.y)),
        width: Math.abs(p.x - g.start.x),
        height: Math.abs(p.y - g.start.y),
      });
    else if (tool === "Lasso" || tool === "Mask") {
      if (g.points.length < 2000) g.points.push(p);
      setStroke(
        tool === "Mask" && g.layer
          ? g.points.map((v) => localPoint(v, g.layer!.transform))
          : [...g.points],
      );
    } else if (tool === "Select")
      setStroke([
        g.start,
        { x: p.x, y: g.start.y },
        p,
        { x: g.start.x, y: p.y },
      ]);
  }
  function up(e: React.PointerEvent<SVGSVGElement>, cancelled = false) {
    const g = gesture.current;
    if (!g) return;
    gesture.current = undefined;
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (cancelled) {
      display(g.before);
      setStroke([]);
      setCrop(undefined);
      return;
    }
    if (tool === "Move" && current.current) {
      const next = current.current;
      display(g.before);
      commit(next);
    } else if (
      tool === "Mask" &&
      g.layer &&
      !g.layer.locked &&
      "assetId" in g.layer &&
      (g.layer.maskStrokes?.length ?? 0) < 500
    ) {
      commit(
        updateLayer(g.before, g.layer.id, {
          maskStrokes: [
            ...(g.layer.maskStrokes ?? []),
            {
              points: g.points.map((p) => localPoint(p, g.layer!.transform)),
              size,
              reveal,
            },
          ],
        } as Partial<Layer>),
      );
    } else if ((tool === "Select" || tool === "Lasso") && stroke.length >= 3)
      commit({ ...g.before, selection: stroke });
    setStroke([]);
  }
  async function recoverCopy() {
    if (!record || !current.current) return;
    try {
      const d = await api<Document>("/projects/" + projectId + "/documents", {
        method: "POST",
        body: JSON.stringify({ assetId: record.originalAssetId }),
      });
      await api("/documents/" + d.id, {
        method: "PATCH",
        body: JSON.stringify({
          expectedRevision: d.currentRevisionId,
          snapshot: { ...(recovery ?? current.current), id: d.id },
        }),
      });
      localStorage.removeItem(key);
      onDocument(d.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function reloadSaved() {
    try {
      const d = await api<Document>("/documents/" + documentId);
      revision.current = d.currentRevisionId;
      saved.current = JSON.stringify(d.snapshot);
      display(d.snapshot);
      setRecord(d);
      setPast([]);
      setFuture([]);
      setRecovery(undefined);
      setConflict(false);
      blocked.current = false;
      localStorage.removeItem(key);
      setError("");
      setStatus("All changes saved");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (!documentId)
    return (
      <section className="edit-start">
        <h1>Your workspace.</h1>
        {error && <p role="alert">{error}</p>}
        {asset ? (
          <>
            <img src={"/api/assets/" + asset.id} alt={asset.name} />
            <p>Original preserved. Start an editable master to make changes.</p>
            <Button primary onClick={() => void openMaster()}>
              Save initial master
            </Button>
          </>
        ) : (
          <>
            <h2>Start with an image</h2>
            <p>Drop, paste or open a file.</p>
            <Button primary onClick={onImport}>
              Open an image ↗
            </Button>
          </>
        )}
      </section>
    );
  if (!doc) return <p role="status">{error || status}</p>;
  const rasterAsset =
    chosen && "assetId" in chosen
      ? assets.find((a) => a.id === chosen.assetId)
      : undefined;
  const locked = !chosen || chosen.locked || blocked.current;
  const path = (ps: Point[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <section className="edit-workspace" aria-label="Image editor">
      <div className="edit-heading">
        <div>
          <span className="eyebrow">EDIT · ORIGINAL PRESERVED</span>
          <h1>Your working canvas.</h1>
        </div>
        <span role="status" className="save-state">
          {status}
        </span>
        <Button
          onClick={() => void save()}
          disabled={saving.current || blocked.current}
        >
          Save now
        </Button>
      </div>
      {error && (
        <p role="alert" className="message error">
          {error}
        </p>
      )}
      {(conflict || recovery) && (
        <div className="message" role="alert">
          <p>
            {conflict
              ? "Another window changed this master. Keep your changes as a separate master or load the saved copy."
              : "An unsaved browser draft is available."}
          </p>
          {recovery && !conflict && (
            <Button
              onClick={() => {
                const next = recovery;
                setRecovery(undefined);
                blocked.current = false;
                commit(next);
              }}
            >
              Restore draft
            </Button>
          )}
          <Button onClick={() => void recoverCopy()}>
            Keep changes as separate master
          </Button>
          <Button onClick={() => void reloadSaved()}>Load saved master</Button>
        </div>
      )}
      <div className="edit-toolbar" aria-label="Canvas tools">
        {(["Move", "Pan", "Select", "Lasso", "Mask", "Crop"] as Tool[]).map(
          (t) => (
            <Button
              key={t}
              aria-pressed={tool === t}
              onClick={() => {
                setTool(t);
                setCrop(undefined);
              }}
            >
              {t}
            </Button>
          ),
        )}
        <Button onClick={undo} disabled={!past.length || blocked.current}>
          Undo
        </Button>
        <Button onClick={redo} disabled={!future.length || blocked.current}>
          Redo
        </Button>
        <label>
          Zoom
          <select
            aria-label="Canvas zoom"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          >
            {[0.5, 1, 1.5, 2, 3].map((v) => (
              <option key={v} value={v}>
                {v === 1 ? "Fit" : v * 100 + "%"}
              </option>
            ))}
          </select>
        </label>
        <Button
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Fit canvas
        </Button>
      </div>
      <div className="edit-body">
        <aside className="edit-layers" aria-label="Layers">
          <h2>Layers</h2>
          <p className="muted">Top layer appears in front.</p>
          {[...doc.layers].reverse().map((l) => (
            <div
              className={"layer-row " + (selected === l.id ? "selected" : "")}
              key={l.id}
            >
              <button
                className="layer-name"
                aria-pressed={selected === l.id}
                onClick={() => setSelected(l.id)}
              >
                {l.name}
                {l.locked ? " · locked" : ""}
                {"maskStrokes" in l && l.maskStrokes?.length ? " · masked" : ""}
              </button>
              <label>
                <input
                  type="checkbox"
                  aria-label={"Show " + l.name}
                  checked={l.visible}
                  disabled={blocked.current}
                  onChange={(e) =>
                    commit({
                      ...doc,
                      layers: doc.layers.map((v) =>
                        v.id === l.id ? { ...v, visible: e.target.checked } : v,
                      ),
                    })
                  }
                />
                Visible
              </label>
              <label>
                <input
                  type="checkbox"
                  aria-label={"Lock " + l.name}
                  checked={l.locked}
                  disabled={blocked.current}
                  onChange={(e) =>
                    commit({
                      ...doc,
                      layers: doc.layers.map((v) =>
                        v.id === l.id ? { ...v, locked: e.target.checked } : v,
                      ),
                    })
                  }
                />
                Locked
              </label>
            </div>
          ))}
          <Button
            disabled={!chosen || blocked.current || doc.layers.length >= 100}
            onClick={() => {
              if (!chosen) return;
              const copy = {
                ...chosen,
                id: crypto.randomUUID(),
                name: chosen.name.slice(0, 180) + " copy",
                locked: false,
              };
              commit({ ...doc, layers: [...doc.layers, copy] });
              setSelected(copy.id);
            }}
          >
            Duplicate layer
          </Button>
          <Button
            disabled={locked}
            onClick={() => {
              commit({
                ...doc,
                layers: doc.layers.filter((l) => l.id !== selected),
              });
              setSelected("");
            }}
          >
            Remove layer
          </Button>
          {[-1, 1].map((direction) => (
            <Button
              key={direction}
              disabled={
                locked ||
                doc.layers.findIndex((l) => l.id === selected) + direction <
                  0 ||
                doc.layers.findIndex((l) => l.id === selected) + direction >=
                  doc.layers.length
              }
              onClick={() => {
                const list = [...doc.layers],
                  i = list.findIndex((l) => l.id === selected);
                [list[i], list[i + direction]] = [
                  list[i + direction]!,
                  list[i]!,
                ];
                commit({ ...doc, layers: list });
              }}
            >
              {direction === 1 ? "Bring forward" : "Send backward"}
            </Button>
          ))}
        </aside>
        <div className="edit-stage" data-testid="edit-stage">
          {aiPreview && (
            <div className="ai-canvas-review" aria-label="AI result review">
              <div>
                <strong>
                  AI result review · master unchanged until accepted
                </strong>
                <Button onClick={() => setAiPreview(undefined)}>
                  Back to editing
                </Button>
              </div>
              <img src={"/api/assets/" + aiPreview} alt="AI review on canvas" />
            </div>
          )}
          <div
            className="edit-paper"
            style={{
              width: `min(100cqw, calc(100cqh * ${doc.width / doc.height}))`,
              aspectRatio: `${doc.width}/${doc.height}`,
              transform: `translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
            }}
          >
            <svg
              ref={svg}
              role="img"
              aria-label="Editable image canvas"
              viewBox={`0 0 ${doc.width} ${doc.height}`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={(e) => up(e)}
              onPointerCancel={(e) => up(e, true)}
              style={{
                cursor:
                  tool === "Pan"
                    ? "grab"
                    : tool === "Move"
                      ? "move"
                      : "crosshair",
              }}
            >
              <defs>
                {doc.layers.map((l) => {
                  if (!("assetId" in l)) return null;
                  const a = assets.find((a) => a.id === l.assetId);
                  if (!a) return null;
                  const strokes = [
                    ...(l.maskStrokes ?? []),
                    ...(tool === "Mask" && l.id === selected && stroke.length
                      ? [{ points: stroke, size, reveal }]
                      : []),
                  ];
                  return (
                    <mask
                      key={l.id}
                      id={"mask-" + l.id}
                      maskUnits="userSpaceOnUse"
                      x="0"
                      y="0"
                      width={a.width}
                      height={a.height}
                      style={{ maskType: "luminance" }}
                    >
                      <rect width={a.width} height={a.height} fill="white" />
                      {l.maskAssetId && (
                        <image
                          href={"/api/assets/" + l.maskAssetId}
                          width={a.width}
                          height={a.height}
                          preserveAspectRatio="none"
                        />
                      )}
                      {strokes.map((s, i) =>
                        s.points.length === 1 ? (
                          <circle
                            key={i}
                            cx={s.points[0]!.x}
                            cy={s.points[0]!.y}
                            r={s.size / 2}
                            fill={s.reveal ? "white" : "black"}
                          />
                        ) : (
                          <polyline
                            key={i}
                            points={path(s.points)}
                            fill="none"
                            stroke={s.reveal ? "white" : "black"}
                            strokeWidth={s.size}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        ),
                      )}
                    </mask>
                  );
                })}
              </defs>
              {doc.layers
                .filter((l) => l.visible)
                .map((l) => {
                  const a =
                    "assetId" in l
                      ? assets.find((a) => a.id === l.assetId)
                      : undefined;
                  const t = l.transform;
                  return (
                    <g
                      key={l.id}
                      data-layer={l.id}
                      opacity={l.opacity}
                      transform={`translate(${t.x} ${t.y}) rotate(${t.rotation}) scale(${t.scaleX} ${t.scaleY})`}
                      onPointerDown={() => {
                        if (tool === "Move") setSelected(l.id);
                      }}
                    >
                      {a ? (
                        <image
                          href={"/api/assets/" + a.id}
                          width={a.width}
                          height={a.height}
                          preserveAspectRatio="none"
                          mask={`url(#mask-${l.id})`}
                        />
                      ) : l.type === "text" ? (
                        <text
                          fontFamily={l.fontFamily}
                          fontSize={l.fontSize}
                          fill={l.fill}
                        >
                          {l.text}
                        </text>
                      ) : l.type === "vector" ? (
                        l.shape === "rectangle" ? (
                          <rect
                            width={l.width}
                            height={l.height}
                            fill={l.fill}
                            stroke={l.stroke}
                            strokeWidth={l.strokeWidth}
                          />
                        ) : (
                          <ellipse
                            cx={l.width / 2}
                            cy={l.height / 2}
                            rx={l.width / 2}
                            ry={l.height / 2}
                            fill={l.fill}
                            stroke={l.stroke}
                            strokeWidth={l.strokeWidth}
                          />
                        )
                      ) : null}
                      {l.id === selected && a && (
                        <rect
                          width={a.width}
                          height={a.height}
                          fill="none"
                          stroke="var(--crimson)"
                          strokeWidth="2"
                          vectorEffect="non-scaling-stroke"
                          pointerEvents="none"
                        />
                      )}
                    </g>
                  );
                })}
              {doc.selection && (
                <polygon
                  points={path(doc.selection)}
                  className="selection-outline"
                />
              )}
              {(tool === "Select" || tool === "Lasso") && stroke.length > 1 && (
                <polyline points={path(stroke)} className="selection-outline" />
              )}
              {crop && <rect {...crop} className="crop-outline" />}
            </svg>
          </div>
        </div>
        <aside className="edit-properties" aria-label="Layer properties">
          <FinishPanel
            hasSelection={!!doc.selection}
            key={documentId}
            documentId={documentId}
            width={doc.width}
            height={doc.height}
            prepare={prepareAI}
            onCrop={() => setTool("Crop")}
            onApplied={adoptAI}
            onPreview={setAiPreview}
          />
          <AIEditPanel
            documentId={documentId}
            hasSelection={!!doc.selection}
            prepare={prepareAI}
            onApplied={adoptAI}
            onPreview={setAiPreview}
          />
          <h2>{chosen?.name ?? "Select a layer"}</h2>
          {chosen && (
            <>
              <label>
                Layer name
                <input
                  aria-label="Layer name"
                  value={chosen.name}
                  disabled={locked}
                  onChange={(e) =>
                    changeLayer({ name: e.target.value.slice(0, 200) })
                  }
                />
              </label>
              <label>
                Opacity
                <input
                  aria-label="Layer opacity"
                  type="range"
                  min="0"
                  max="100"
                  value={Math.round(chosen.opacity * 100)}
                  disabled={locked}
                  onChange={(e) =>
                    changeLayer({ opacity: Number(e.target.value) / 100 })
                  }
                />
                <output>{Math.round(chosen.opacity * 100)}%</output>
              </label>
              <fieldset disabled={locked}>
                <legend>Transform</legend>
                {(["x", "y", "scaleX", "scaleY", "rotation"] as const).map(
                  (k) => (
                    <label key={k}>
                      {
                        {
                          x: "X",
                          y: "Y",
                          scaleX: "Width scale",
                          scaleY: "Height scale",
                          rotation: "Rotation",
                        }[k]
                      }
                      <input
                        aria-label={k}
                        type="number"
                        step={k.startsWith("scale") ? "0.05" : "1"}
                        min={k.startsWith("scale") ? "0.01" : undefined}
                        value={chosen.transform[k]}
                        onChange={(e) => {
                          const n = Number(e.target.value);
                          if (
                            Number.isFinite(n) &&
                            (!k.startsWith("scale") || n > 0)
                          )
                            changeLayer({
                              transform: { ...chosen.transform, [k]: n },
                            });
                        }}
                      />
                    </label>
                  ),
                )}
              </fieldset>
              {rasterAsset && (
                <p className="muted">
                  {Math.round(rasterAsset.width * chosen.transform.scaleX)} ×{" "}
                  {Math.round(rasterAsset.height * chosen.transform.scaleY)} px
                </p>
              )}
              {chosen.locked && (
                <p className="muted">
                  Unlock this layer or duplicate it to edit.
                </p>
              )}
            </>
          )}
          {tool === "Mask" && (
            <fieldset disabled={locked}>
              <legend>Mask brush</legend>
              <p>Paint to hide. The original pixels stay intact.</p>
              <label>
                Brush size
                <input
                  aria-label="Mask brush size"
                  type="range"
                  min="1"
                  max="512"
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                />
                <output>{size} px</output>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={reveal}
                  onChange={(e) => setReveal(e.target.checked)}
                />
                Reveal instead of hide
              </label>
              <Button
                disabled={locked || !chosen || !("assetId" in chosen)}
                onClick={() =>
                  changeLayer({
                    maskStrokes: [],
                    maskAssetId: undefined,
                  } as Partial<Layer>)
                }
              >
                Clear mask
              </Button>
            </fieldset>
          )}
          {doc.selection && (
            <Button
              disabled={blocked.current}
              onClick={() => {
                const { selection: _, ...rest } = doc;
                commit(rest);
              }}
            >
              Clear selection
            </Button>
          )}
          {tool === "Crop" && (
            <>
              <p>
                Drag a crop rectangle on the canvas. Hidden areas remain in the
                layers.
              </p>
              <Button
                primary
                disabled={
                  !crop || crop.width < 1 || crop.height < 1 || blocked.current
                }
                onClick={() => {
                  commit(cropDocument(doc, crop!));
                  setCrop(undefined);
                  setTool("Move");
                }}
              >
                Apply crop
              </Button>
            </>
          )}
          <p className="muted">
            {doc.width} × {doc.height} · sRGB
          </p>
          <label>
            Version name
            <input
              aria-label="Edit version name"
              value={versionName}
              onChange={(e) => setVersionName(e.target.value)}
              maxLength={120}
            />
          </label>
          <Button
            disabled={!versionName.trim() || blocked.current || versionBusy}
            onClick={async () => {
              setVersionBusy(true);
              try {
                if (await save()) {
                  if (JSON.stringify(current.current) !== saved.current)
                    throw Error(
                      "Changes are still saving. Try keeping the version again.",
                    );
                  await api("/documents/" + documentId + "/versions", {
                    method: "POST",
                    body: JSON.stringify({
                      name: versionName.trim(),
                      expectedRevision: revision.current,
                    }),
                  });
                  setVersionName("");
                  setStatus("Named version saved");
                }
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setVersionBusy(false);
              }
            }}
          >
            Keep edit version
          </Button>
          <p className="muted">
            V Move · H Pan · Ctrl/⌘ Z Undo · Shift Ctrl/⌘ Z Redo · Ctrl/⌘ S Save
            · Esc cancel gesture
          </p>
        </aside>
      </div>
    </section>
  );
}
