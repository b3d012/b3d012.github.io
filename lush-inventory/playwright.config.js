import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: false,
  use: { ...devices["iPad (gen 7)"], baseURL: "http://127.0.0.1:4173" },
  webServer: {
    command: "python3 -m http.server 4173 -d ..",
    url: "http://127.0.0.1:4173/lush-inventory/",
    reuseExistingServer: true,
  },
});
