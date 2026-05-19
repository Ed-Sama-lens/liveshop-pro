import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Generated / vendor / coverage output — never lint these.
    // All gitignored already; lint should match gitignore policy.
    "coverage/**",
    "src/generated/**",
    "playwright-report/**",
    "test-results/**",
    "node_modules/**",
    ".vercel/**",
  ]),
]);

export default eslintConfig;
