import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["tests/*.test.js"] } },
      { test: { name: "samples", include: ["tests/samples/*.test.js"] } },
    ],
  },
});
