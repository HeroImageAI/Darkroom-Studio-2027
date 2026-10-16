export async function discoverDesktop(origin: string, instance: string) {
  const read = async (url: string) => {
    const r = await fetch(url + "/system_stats", {
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) throw Error("Engine unavailable");
    return { url, stats: await r.json() };
  };
  const matches = (s: any) =>
    !!instance &&
    s.system?.argv?.some(
      (a: string) =>
        a.includes("instance-model-paths") && a.includes(instance + ".yaml"),
    );
  let primary;
  try {
    primary = await read(origin);
    if (matches(primary.stats) || !instance) return primary;
  } catch {}
  // Bounded local probes only. A responsive unrelated engine is never selected by port alone.
  const candidates = await Promise.allSettled(
    Array.from({ length: 11 }, (_, i) => `http://127.0.0.1:${8188 + i}`)
      .filter((u) => u !== origin)
      .map(read),
  );
  for (const candidate of candidates)
    if (candidate.status === "fulfilled" && matches(candidate.value.stats))
      return candidate.value;
  if (primary) return primary;
  throw Error(
    "No matching ComfyUI Desktop instance on configured origin or ports 8188–8198",
  );
}
