import { useEffect, useRef, useState } from "react";
import { BrandingHandoff } from "./BrandingHandoff.js";
import type {
  ExportRecord,
  ExportRequest,
} from "../../../../packages/contracts/src/finish.js";
import { api } from "../lib/api.js";
import { Button } from "../components/Controls.js";
import { AIFinishPanel } from "./AIFinishPanel.js";
import { ArtworkPanel } from "./ArtworkPanel.js";
import type { Point } from "../../../../packages/document/src/edit.js";

export function FinishPanel({
  documentId,
  width,
  height,
  hasSelection,
  prepare,
  onCrop,
  onApplied,
  onPreview,
  artworkCorners,
  onArtworkCorners,
  onMarkArtwork,
}: {
  documentId: string;
  width: number;
  height: number;
  hasSelection: boolean;
  prepare: () => Promise<{ documentId: string; expectedRevision: string }>;
  onCrop: () => void;
  onApplied: (id: string) => Promise<void>;
  onPreview: (id: string | undefined) => void;
  artworkCorners: Point[];
  onArtworkCorners: (points: Point[]) => void;
  onMarkArtwork: () => void;
}) {
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [transparent, setTransparent] = useState(true),
    [background, setBackground] = useState("#ffffff");
  const [size, setSize] = useState("1"),
    [w, setW] = useState(width),
    [h, setH] = useState(height);
  const [quality, setQuality] = useState(95),
    [density, setDensity] = useState(300);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [records, setRecords] = useState<ExportRecord[]>([]);
  const pending = useRef<ExportRequest | undefined>(undefined);
  const outputW = size === "custom" ? w : Math.round(width * Number(size));
  const outputH = size === "custom" ? h : Math.round(height * Number(size));
  useEffect(() => {
    let live = true;
    setRecords([]);
    pending.current = undefined;
    void api<ExportRecord[]>(`/documents/${documentId}/exports`)
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
  async function run(retry = false) {
    setBusy(true);
    setError("");
    try {
      if (!retry || !pending.current)
        pending.current = {
          ...(await prepare()),
          idempotencyKey: crypto.randomUUID(),
          format,
          width: outputW,
          height: outputH,
          transparent: format === "png" && transparent,
          background,
          quality,
          density,
        };
      const record = await api<ExportRecord>("/exports", {
        method: "POST",
        body: JSON.stringify(pending.current),
      });
      pending.current = undefined;
      setRecords((r) => [record, ...r.filter((v) => v.id !== record.id)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="finish-panel">
      <summary>Finish &amp; export</summary>
      <p>Prepare a delivery copy from the saved master.</p>
      <Button onClick={onCrop}>Crop on canvas</Button>
      <AIFinishPanel
        hasSelection={hasSelection}
        documentId={documentId}
        width={width}
        height={height}
        prepare={prepare}
        onApplied={onApplied}
        onPreview={onPreview}
      />
      <BrandingHandoff documentId={documentId} prepare={prepare} />
      <ArtworkPanel
        documentId={documentId}
        width={width}
        height={height}
        corners={artworkCorners}
        onCorners={onArtworkCorners}
        onMark={onMarkArtwork}
        prepare={prepare}
        onApplied={onApplied}
        onPreview={onPreview}
      />
      <h3>Export a delivery copy</h3>
      <label>
        File format
        <select
          aria-label="Export format"
          value={format}
          onChange={(e) => setFormat(e.target.value as "png" | "jpeg")}
        >
          <option value="png">PNG · lossless</option>
          <option value="jpeg">JPEG · photo</option>
        </select>
      </label>
      <label>
        Output size
        <select
          aria-label="Export size"
          value={size}
          onChange={(e) => {
            setSize(e.target.value);
            setW(width);
            setH(height);
          }}
        >
          <option value="1">Original size</option>
          <option value="2">2× size</option>
          <option value="4">4× size</option>
          <option value="custom">Custom · Advanced</option>
        </select>
      </label>
      {size === "custom" && (
        <div className="finish-dimensions">
          <label>
            Width
            <input
              aria-label="Export width"
              type="number"
              min="1"
              max="16384"
              value={w}
              onChange={(e) => setW(Number(e.target.value))}
            />
          </label>
          <label>
            Height
            <input
              aria-label="Export height"
              type="number"
              min="1"
              max="16384"
              value={h}
              onChange={(e) => setH(Number(e.target.value))}
            />
          </label>
        </div>
      )}
      <p>
        {outputW} × {outputH} px{size !== "1" && " · smooth resize"}
      </p>
      {size === "custom" && (
        <p>
          Custom width and height resize the image to those dimensions. Match
          the original ratio to avoid stretching.
        </p>
      )}
      {format === "png" && (
        <label>
          <input
            type="checkbox"
            checked={transparent}
            onChange={(e) => setTransparent(e.target.checked)}
          />{" "}
          Preserve transparency
        </label>
      )}
      {(format === "jpeg" || !transparent) && (
        <label>
          Background
          <input
            aria-label="Export background"
            type="color"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
          />
        </label>
      )}
      <p>
        PNG preserves existing transparent areas. Use a layer mask to hide a
        background.
      </p>
      <details>
        <summary>Advanced delivery settings</summary>
        <label>
          Print density
          <input
            aria-label="Export density"
            type="number"
            min="72"
            max="600"
            value={density}
            onChange={(e) => setDensity(Number(e.target.value))}
          />
        </label>
        {format === "jpeg" && (
          <label>
            JPEG quality
            <input
              aria-label="JPEG quality"
              type="number"
              min="1"
              max="100"
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </label>
        )}
        <p>
          sRGB colour profile · maximum 40 million pixels. Density changes print
          metadata, not pixel dimensions.
        </p>
      </details>
      <Button
        primary
        disabled={
          busy || outputW * outputH > 40000000 || outputW < 1 || outputH < 1
        }
        onClick={() => void run()}
      >
        {busy ? "Preparing export…" : "Prepare export"}
      </Button>
      {error && <p role="alert">{error}</p>}
      {error && pending.current && (
        <Button disabled={busy} onClick={() => void run(true)}>
          Retry this export
        </Button>
      )}
      {records.length > 0 && (
        <>
          <h3>Delivery copies</h3>
          <ul>
            {records.map((r) => (
              <li key={r.id}>
                <a href={`/api/exports/${r.id}/download`} download={r.filename}>
                  {r.width} × {r.height} · {r.format.toUpperCase()}
                  {r.transparent ? " · alpha" : ""}
                </a>
                <small>{new Date(r.createdAt).toLocaleString()}</small>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
