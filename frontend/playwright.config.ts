import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:5186", channel: "msedge", headless: true },
  projects: [
    { name: "report", testIgnore: "preview.spec.ts" },
    {
      name: "preview",
      testMatch: "preview.spec.ts",
      use: { baseURL: "http://127.0.0.1:5188" },
    },
  ],
  webServer: {
    command: "npm run dev -- --port 5188",
    url: "http://127.0.0.1:5188",
    reuseExistingServer: true,
  },
});
