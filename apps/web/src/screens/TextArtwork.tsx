import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
export function TextArtwork({
  text,
  fontFamily,
  fontSize,
  fill,
  selected,
}: {
  text: string;
  fontFamily: string;
  fontSize: number;
  fill: string;
  selected: boolean;
}) {
  const [outline, setOutline] = useState<{
      path: string;
      width: number;
      height: number;
    }>(),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setOutline(undefined);
    setError("");
    const timer = setTimeout(() => {
      void api<{ path: string; width: number; height: number }>(
        "/text-outline",
        {
          method: "POST",
          body: JSON.stringify({ text, fontFamily, fontSize }),
        },
      )
        .then((r) => {
          if (live) setOutline(r);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, fontFamily, fontSize]);
  return (
    <g
      aria-label={
        error ? "Text unavailable: " + error : "Editable text: " + text
      }
    >
      {outline ? (
        <>
          <path d={outline.path} fill={fill} />
          <rect
            width={Math.max(1, outline.width)}
            height={outline.height}
            fill="transparent"
            stroke={selected ? "var(--crimson)" : "none"}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </>
      ) : (
        <text fontSize="14" fill="var(--text-secondary)">
          {error
            ? "Text unavailable · choose supported font/text"
            : "Preparing text…"}
        </text>
      )}
    </g>
  );
}
