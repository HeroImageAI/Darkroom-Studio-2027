import { useEffect, useRef, useState } from "react";
import type {
  ArtworkRecord,
  ArtworkRequest,
} from "../../../../packages/contracts/src/artwork.js";
import type { Point } from "../../../../packages/document/src/edit.js";
import { api } from "../lib/api.js";
import { Button } from "../components/Controls.js";
const names = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"];
export function ArtworkPanel({
  documentId,
  width,
  height,
  hasSelection,
  corners,
  onCorners,
  onMark,
  prepare,
  onApplied,
  onPreview,
}: {
  documentId: string;
  width: number;
  height: number;
  hasSelection: boolean;
  corners: Point[];
  onCorners: (points: Point[]) => void;
  onMark: () => void;
  prepare: () => Promise<{ documentId: string; expectedRevision: string }>;
  onApplied: (id: string) => Promise<void>;
  onPreview: (id: string | undefined) => void;
}) {
  const [w, setW] = useState(width),
    [h, setH] = useState(height);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [records, setRecords] = useState<ArtworkRecord[]>([]);
  const [keepSelection, setKeepSelection] = useState(false);
  useEffect(() => {
    if (!hasSelection) setKeepSelection(false);
  }, [hasSelection]);
  const [selectedId, setSelectedId] = useState("");
  const selectedRecord = records.find((r) => r.id === selectedId) ?? records[0];
  const pending = useRef<ArtworkRequest | undefined>(undefined);
  const customSize = useRef(false);
  useEffect(() => {
    let live = true;
    void api<ArtworkRecord[]>(`/documents/${documentId}/artwork`)
      .then((r) => {
        if (live) setRecords(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [documentId]);
  useEffect(() => {
    if (customSize.current || corners.length !== 4) return;
    const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
    const ew =
      (length(corners[0]!, corners[1]!) + length(corners[2]!, corners[3]!)) /
        2 +
      1;
    const eh =
      (length(corners[1]!, corners[2]!) + length(corners[3]!, corners[0]!)) /
        2 +
      1;
    const scale = Math.min(
      1,
      8192 / ew,
      8192 / eh,
      Math.sqrt(16_000_000 / (ew * eh)),
    );
    setW(Math.max(2, Math.floor(ew * scale)));
    setH(Math.max(2, Math.floor(eh * scale)));
  }, [corners]);
  async function preview(retry = false) {
    setBusy(true);
    setError("");
    try {
      if (!retry || !pending.current)
        pending.current = {
          ...(await prepare()),
          corners: corners.map((p) => ({ ...p })),
          width: w,
          height: h,
          ...(keepSelection ? { useSelection: true } : {}),
          idempotencyKey: crypto.randomUUID(),
        };
      const result = await api<ArtworkRecord>("/artwork", {
        method: "POST",
        body: JSON.stringify(pending.current),
      });
      pending.current = undefined;
      setRecords((r) => [result, ...r.filter((v) => v.id !== result.id)]);
      setSelectedId(result.id);
      onPreview(result.assetId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function review(record: ArtworkRecord, action: "save-copy" | "reject") {
    setBusy(true);
    setError("");
    try {
      const result = await api<ArtworkRecord>(`/artwork/${record.id}/review`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      setRecords((r) => r.map((v) => (v.id === result.id ? result : v)));
      onPreview(undefined);
      if (result.savedDocumentId) await onApplied(result.savedDocumentId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="artwork-panel">
      <summary>Straighten artwork</summary>
      <p>
        For flat artwork photographed at an angle. Mark its four corners
        clockwise, starting at the top-left. Drag a marker to refine it.
      </p>
      <Button
        disabled={busy}
        onClick={() => {
          onCorners([]);
          customSize.current = false;
          onPreview(undefined);
          onMark();
        }}
      >
        Mark four corners
      </Button>
      <Button
        disabled={busy}
        onClick={() => {
          onCorners([
            { x: 0, y: 0 },
            { x: width - 1, y: 0 },
            { x: width - 1, y: height - 1 },
            { x: 0, y: height - 1 },
          ]);
          onPreview(undefined);
          onMark();
        }}
      >
        Use image corners
      </Button>
      <p role="status">
        {corners.length < 4
          ? `${corners.length}/4 corners marked${corners.length ? ` · next: ${names[corners.length]}` : ""}`
          : "Four corners marked"}
      </p>
      {corners.length > 0 && (
        <Button disabled={busy} onClick={() => onCorners(corners.slice(0, -1))}>
          Undo last corner
        </Button>
      )}
      <details>
        <summary>Corner coordinates</summary>
        <p>
          Use image corners above to start with the keyboard, then adjust these
          coordinates.
        </p>
        {corners.map((p, i) => (
          <fieldset key={i} disabled={busy}>
            <legend>
              {i + 1}. {names[i]}
            </legend>
            {(["x", "y"] as const).map((axis) => (
              <label key={axis}>
                {axis.toUpperCase()}
                <input
                  aria-label={`${names[i]} ${axis}`}
                  type="number"
                  min="0"
                  max={axis === "x" ? width - 1 : height - 1}
                  step="0.01"
                  value={p[axis]}
                  onChange={(e) =>
                    onCorners(
                      corners.map((v, j) =>
                        i === j ? { ...v, [axis]: Number(e.target.value) } : v,
                      ),
                    )
                  }
                />
              </label>
            ))}
          </fieldset>
        ))}
      </details>
      <p>
        Set the intended width and height to keep the design's proportions. The
        starting size is an estimate from the marked edges.
      </p>
      <label>
        Artwork width
        <input
          aria-label="Artwork width"
          type="number"
          min="2"
          max="8192"
          value={w}
          disabled={busy}
          onChange={(e) => {
            customSize.current = true;
            setW(Number(e.target.value));
          }}
        />
      </label>
      <label>
        Artwork height
        <input
          aria-label="Artwork height"
          type="number"
          min="2"
          max="8192"
          value={h}
          disabled={busy}
          onChange={(e) => {
            customSize.current = true;
            setH(Number(e.target.value));
          }}
        />
      </label>
      <label>
        <input
          type="checkbox"
          aria-label="Keep selected artwork only"
          disabled={busy || !hasSelection}
          checked={keepSelection}
          onChange={(e) => setKeepSelection(e.target.checked)}
        />
        Keep selected artwork only
      </label>
      <p>
        {hasSelection
          ? "Uses the visible selection to make the surrounding image transparent."
          : "Select the artwork on the canvas first to isolate it from the surrounding image."}
      </p>
      <Button
        primary
        disabled={
          busy ||
          corners.length !== 4 ||
          w < 2 ||
          h < 2 ||
          w > 8192 ||
          h > 8192 ||
          w * h > 16_000_000
        }
        onClick={() => void preview()}
      >
        Preview artwork
      </Button>
      <p>
        The preview keeps the photographed pixels and existing transparency. It
        does not redraw lettering, remove fabric folds or turn the image into
        vectors.
      </p>
      {error && (
        <div role="alert">
          <p>{error}</p>
          {pending.current && (
            <Button disabled={busy} onClick={() => void preview(true)}>
              Retry preview
            </Button>
          )}
        </div>
      )}
      {records.length > 1 && (
        <label>
          Previous artwork previews
          <select
            aria-label="Previous artwork previews"
            value={selectedRecord?.id ?? ""}
            disabled={busy}
            onChange={(e) => {
              setSelectedId(e.target.value);
              onPreview(undefined);
            }}
          >
            {records.map((r) => (
              <option key={r.id} value={r.id}>
                {r.width} × {r.height} ·{" "}
                {r.disposition === "candidate"
                  ? "ready"
                  : r.disposition === "saved"
                    ? "copy saved"
                    : "rejected"}{" "}
                · {new Date(r.createdAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      )}
      {(selectedRecord ? [selectedRecord] : []).map((record) => (
        <div className="artwork-candidate" key={record.id}>
          <p>
            {record.width} × {record.height} ·{" "}
            {record.selectionMaskHash
              ? "isolated raster artwork"
              : "raster artwork"}{" "}
            ·{" "}
            {record.disposition === "candidate"
              ? "ready to review"
              : record.disposition === "saved"
                ? "copy saved"
                : "rejected"}
          </p>
          <Button disabled={busy} onClick={() => onPreview(record.assetId)}>
            View artwork preview
          </Button>
          {record.disposition === "candidate" && (
            <>
              <Button
                primary
                disabled={busy}
                onClick={() => void review(record, "save-copy")}
              >
                Save as new master
              </Button>
              <Button
                disabled={busy}
                onClick={() => void review(record, "reject")}
              >
                Reject preview
              </Button>
            </>
          )}
          {record.savedDocumentId && (
            <Button
              disabled={busy}
              onClick={() => void onApplied(record.savedDocumentId!)}
            >
              Open artwork copy
            </Button>
          )}
        </div>
      ))}
    </details>
  );
}
