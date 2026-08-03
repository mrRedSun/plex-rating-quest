import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    execArgv: ["--no-experimental-webstorage"],
    environmentOptions: {
      jsdom: { url: "https://plex-rating-quest.test/" },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["lib/quest.ts"],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 75 },
    },
  },
});
