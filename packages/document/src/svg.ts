import { SaxesParser } from "saxes";
export const xmlEscape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const paint =
  /^(#[a-f0-9]{3,4}|#[a-f0-9]{6}|#[a-f0-9]{8}|none|transparent|black|white|red|green|blue)$/i;
export function safePaint(value: string) {
  if (!paint.test(value)) throw Error("Use a simple hex colour or none");
  return value;
}
const common = new Set([
  "fill",
  "stroke",
  "stroke-width",
  "fill-rule",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "transform",
]);
const geometry: Record<string, string[]> = {
  g: [],
  path: ["d"],
  rect: ["x", "y", "width", "height", "rx", "ry"],
  ellipse: ["cx", "cy", "rx", "ry"],
  circle: ["cx", "cy", "r"],
  polygon: ["points"],
  polyline: ["points"],
  line: ["x1", "y1", "x2", "y2"],
};
const numeric = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
export function sanitizeSvg(input: string) {
  if (input.length > 256000 || /<!|<\?/.test(input))
    throw Error(
      "Use a static SVG without declarations, scripts, linked images or fonts",
    );
  const parser = new SaxesParser({ xmlns: false });
  let depth = 0,
    count = 0,
    rootSeen = false,
    body = "",
    width = 0,
    height = 0,
    viewBox = "";
  parser.on("error", (e) => {
    throw e;
  });
  parser.on("opentag", (node) => {
    if (++count > 5000 || ++depth > 30) throw Error("SVG is too complex");
    const attrs = node.attributes as Record<string, string>;
    if (depth === 1) {
      if (rootSeen || node.name !== "svg")
        throw Error("Choose an SVG document");
      rootSeen = true;
      for (const name of Object.keys(attrs))
        if (!["xmlns", "width", "height", "viewBox", ...common].includes(name))
          throw Error("Unsupported SVG attribute: " + name);
      if (attrs.xmlns && attrs.xmlns !== "http://www.w3.org/2000/svg")
        throw Error("Invalid SVG namespace");
      const vb = attrs.viewBox?.trim().split(/[ ,]+/).map(Number);
      if (
        vb &&
        (vb.length !== 4 ||
          vb.some((v) => !Number.isFinite(v)) ||
          vb[2]! <= 0 ||
          vb[3]! <= 0)
      )
        throw Error("Invalid SVG viewBox");
      const dimension = (
        v: string | undefined,
        fallback: number | undefined,
      ) => {
        if (v && !/^\d+(?:\.\d+)?(?:px)?$/.test(v))
          throw Error("SVG dimensions must be pixels");
        return v ? Number(v.replace(/px$/, "")) : (fallback ?? 0);
      };
      width = dimension(attrs.width, vb?.[2]);
      height = dimension(attrs.height, vb?.[3]);
      if (
        width < 1 ||
        height < 1 ||
        width > 4096 ||
        height > 4096 ||
        width * height > 16000000
      )
        throw Error(
          "SVG logo supports up to 4096 pixels per side and 16 million pixels",
        );
      viewBox = vb?.join(" ") ?? `0 0 ${width} ${height}`;
      const inherited = Object.fromEntries(
        Object.entries(attrs).filter(([k]) => common.has(k)),
      );
      body += `<g${attributes(inherited, new Set())}>`;
    } else {
      const allowed = geometry[node.name];
      if (!allowed)
        throw Error(
          "Unsupported SVG element: " +
            node.name +
            ". Outline text and simplify artwork before importing.",
        );
      body += `<${node.name}${attributes(attrs, new Set(allowed))}>`;
    }
  });
  function attributes(attrs: Record<string, string>, allowed: Set<string>) {
    return Object.entries(attrs)
      .map(([k, v]) => {
        if (!common.has(k) && !allowed.has(k))
          throw Error("Unsupported SVG attribute: " + k);
        if (k === "fill" || k === "stroke") safePaint(v);
        else if (k === "d") {
          if (
            v.length > 100000 ||
            !/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]*$/.test(v)
          )
            throw Error("Invalid SVG path");
        } else if (k === "points") {
          if (!/^[0-9eE+.,\s-]*$/.test(v)) throw Error("Invalid SVG points");
        } else if (k === "transform") {
          if (
            !/^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([0-9eE+.,\s-]+\)\s*)+$/.test(
              v,
            )
          )
            throw Error("Invalid SVG transform");
        } else if (k === "fill-rule") {
          if (!["nonzero", "evenodd"].includes(v))
            throw Error("Invalid fill rule");
        } else if (k === "stroke-linecap") {
          if (!["butt", "round", "square"].includes(v))
            throw Error("Invalid line cap");
        } else if (k === "stroke-linejoin") {
          if (!["miter", "round", "bevel"].includes(v))
            throw Error("Invalid line join");
        } else if (
          !numeric.test(v) ||
          !Number.isFinite(Number(v)) ||
          Math.abs(Number(v)) > 32768
        )
          throw Error("Invalid SVG number");
        return ` ${k}="${xmlEscape(v)}"`;
      })
      .join("");
  }
  parser.on("closetag", (node) => {
    body += depth === 1 ? "</g>" : `</${node.name}>`;
    depth--;
  });
  parser.on("text", (s) => {
    if (s.trim()) throw Error("SVG text must be outlined before import");
  });
  parser.write(input).close();
  if (!rootSeen || depth) throw Error("Invalid SVG document");
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${body}</svg>`,
    width,
    height,
  };
}
