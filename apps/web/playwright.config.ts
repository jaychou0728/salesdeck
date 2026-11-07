import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5174", trace: "on-first-retry" },
  webServer: [
    {
      command: "pnpm --filter @salespilot/server dev",
      port: 3101,
      reuseExistingServer: false,
      env: { PORT: "3101", DATABASE_URL: "./data/e2e.db", DEMO_MODE: "true", LLM_PROVIDER: "mock" },
    },
    {
      command: "pnpm --filter @salespilot/web dev",
      port: 5174,
      reuseExistingServer: false,
      env: { VITE_API_TARGET: "http://127.0.0.1:3101", VITE_PORT: "5174" },
    },
  ],
});
