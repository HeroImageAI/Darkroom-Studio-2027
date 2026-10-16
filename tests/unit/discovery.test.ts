import { it, expect, vi, afterEach } from "vitest";
import { discoverDesktop } from "../../apps/api/src/discovery.js";
afterEach(() => vi.unstubAllGlobals());
it("finds a matching Desktop installation within bounded local candidates", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(url);
      const matches = url.includes(":8190/");
      return {
        ok: true,
        json: async () => ({
          system: {
            argv: [
              "--extra-model-paths-config",
              `instance-model-paths/${matches ? "expected" : "other"}.yaml`,
            ],
          },
        }),
      };
    }),
  );
  const found = await discoverDesktop("http://127.0.0.1:8188", "expected");
  expect(found.url).toBe("http://127.0.0.1:8190");
  expect(calls).toHaveLength(11);
  expect(
    calls.every(
      (url) =>
        /^http:\/\/127\.0\.0\.1:819?\d\//.test(url) ||
        url.includes(":8188/") ||
        url.includes(":8189/"),
    ),
  ).toBe(true);
});
it("does not accept another installation just because a port responds", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        system: { argv: ["instance-model-paths/unrelated.yaml"] },
      }),
    })),
  );
  const found = await discoverDesktop("http://127.0.0.1:8188", "expected");
  expect(found.stats.system.argv[0]).toContain("unrelated");
  expect(found.stats.system.argv[0]).not.toContain("expected");
});
