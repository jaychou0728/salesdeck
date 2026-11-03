import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  use: { baseURL: "http://127.0.0.1:5173", trace: "on-first-retry" },
  webServer: [
    { command: "pnpm --filter @salespilot/server dev", port: 3000, reuseExistingServer: true, env: { DEMO_MODE: "true", LLM_PROVIDER: "mock" } },
    { command: "pnpm --filter @salespilot/web dev", port: 5173, reuseExistingServer: true },
  ],
});
