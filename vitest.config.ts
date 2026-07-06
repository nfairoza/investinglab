import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Unit tests only (P5). Node environment; @/ alias mirrors tsconfig paths.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
});
