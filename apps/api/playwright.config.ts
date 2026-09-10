import { defineConfig } from "@playwright/test";

/**
 * Admin-console E2E config. Boots a dedicated dev server on :3100 (separate
 * from the normal :3000 dev port so this suite never collides with a running
 * `pnpm dev`) against whatever DATABASE_URL/REDIS_URL the root `.env`
 * currently points at — point that at a disposable dev DB before running
 * `pnpm test:e2e`, the same way the Vitest integration suite requires one.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "dotenv -e ../../.env -- next dev --port 3100",
    url: "http://localhost:3100/admin/login",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
