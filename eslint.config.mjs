import eslint from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    ".output/**",
    ".wxt/**",
    "worker/.wrangler/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  eslint.configs.recommended,
  tseslint.configs.recommended,
);
