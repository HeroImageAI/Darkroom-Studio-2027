import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { Button } from "../components/Controls.js";
type Record = {
  id: string;
  filename: string;
  format: "svg" | "darkroom";
  rasterImages: number;
};
type Request = {
  documentId: string;
  expectedRevision: string;
  format: "svg" | "darkroom";
  idempotencyKey: string;
};
export function BrandingHandoff({
  documentId,
  prepare,
}: {
  documentId: string;
  prepare: () => Promise<{ documentId: string; expectedRevision: string }>;
}) {
  const [records, setRecords] = useState<Record[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const pending = useRef<Request | undefined>(undefined);
  useEffect(() => {
    let live = true;
    pending.current = undefined;
    setRecords([]);
    void api<Record[]>(`/documents/${documentId}/handoffs`)
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
  async function run(format: "svg" | "darkroom", retry = false) {
    setBusy(true);
    setError("");
    try {
      if (!retry)
        pending.current = {
          ...(await prepare()),
          format,
          idempotencyKey: crypto.randomUUID(),
        };
      const r = await api<Record>("/handoffs", {
        method: "POST",
        body: JSON.stringify(pending.current),
      });
      pending.current = undefined;
      setRecords((list) => [r, ...list.filter((v) => v.id !== r.id)]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Artwork &amp; project handoff</summary>
      <p>
        SVG keeps shapes and unmasked SVG logos as vectors; text becomes exact
        outlines. Photos and paint remain embedded raster images. Masked logos
        use their raster preview.
      </p>
      <Button disabled={busy} onClick={() => void run("svg")}>
        Prepare SVG artwork
      </Button>
      <p>
        Project copy keeps the current editable master, original images and
        hidden layers. Earlier revisions and export history are not included.
        Maximum 30 MB.
      </p>
      <Button disabled={busy} onClick={() => void run("darkroom")}>
        Prepare Darkroom project
      </Button>
      {busy && <p role="status">Preparing handoff…</p>}
      {error && <p role="alert">{error}</p>}
      {error && pending.current && (
        <Button
          disabled={busy}
          onClick={() => void run(pending.current!.format, true)}
        >
          Retry handoff
        </Button>
      )}
      <ul>
        {records.map((r) => (
          <li key={r.id}>
            <a href={`/api/handoffs/${r.id}/download`} download={r.filename}>
              {r.format === "svg"
                ? `SVG artwork · ${r.rasterImages} embedded raster image${r.rasterImages === 1 ? "" : "s"}`
                : "Editable Darkroom project"}
            </a>
          </li>
        ))}
      </ul>
    </details>
  );
}
