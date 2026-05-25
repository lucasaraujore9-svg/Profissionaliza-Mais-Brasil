import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Permite `_unused` em args/vars como convenção explícita de "intencional".
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Observabilidade: bane `console.*` em libs server e handlers de API —
  // exigir `contextLogger()` (Pino com redact). Há exceções pontuais
  // marcadas com eslint-disable-next-line em redis*.ts/env.ts (edge runtime
  // que não pode importar Pino).
  {
    files: ["src/lib/**/*.ts", "src/app/api/**/*.ts"],
    ignores: [
      // Logger client é browser-only e usa console intencionalmente.
      "src/lib/logger-client.ts",
    ],
    rules: {
      "no-console": "error",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
