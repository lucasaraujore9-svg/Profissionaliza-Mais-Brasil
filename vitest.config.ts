import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  test: {
    environment: "node",
    // QA-009: inclui .test.tsx além de .test.ts para que o primeiro teste de
    // componente não seja silenciosamente ignorado (falso verde).
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` é um marker do runtime Next; no node do vitest vira no-op
      // para permitir unit-testar funções puras de módulos server-only.
      "server-only": fileURLToPath(new URL("./src/test/empty-module.ts", import.meta.url)),
    },
  },
})
