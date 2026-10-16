import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:2028",
    channel: process.env.DR_TEST_BROWSER,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build && npm run dev",
    url: "http://127.0.0.1:2028/api/health",
    reuseExistingServer: process.env.DR_TEST_REUSE === "1",
    env: { DR_PORT: "2028", DR_DATA_DIR: "data/e2e" },
    timeout: 120000,
  },
});
