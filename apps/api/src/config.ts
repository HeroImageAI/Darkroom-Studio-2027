import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
export function desktopIdentity() {
  if (process.env.DR_COMFY_INSTANCE) return process.env.DR_COMFY_INSTANCE;
  try {
    const installs = JSON.parse(
      readFileSync(
        join(process.env.APPDATA ?? "", "Comfy Desktop", "installations.json"),
        "utf8",
      ),
    ) as { id: string; status: string; sourceId: string }[];
    return (
      installs.find(
        (i) => i.status === "installed" && i.sourceId === "standalone",
      )?.id ?? ""
    );
  } catch {
    return "";
  }
}
export function loopbackUrl(raw: string) {
  const u = new URL(raw);
  if (
    u.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname) ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw Error("Use a loopback HTTP ComfyUI origin");
  return u.origin;
}
export const config = {
  port: Number(process.env.DR_PORT ?? 2027),
  dataDir: resolve(process.env.DR_DATA_DIR ?? "data"),
  comfyUrl: loopbackUrl(process.env.DR_COMFY_URL ?? "http://127.0.0.1:8188"),
  instance: desktopIdentity(),
};
