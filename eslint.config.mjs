import eslint from "@eslint/js";
import typescriptEslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  globalIgnores([".next/**", "dist/**", "build/**", "coverage/**", "next-env.d.ts", "examples/**", "db/**", "drizzle/**", "worker/**", "app/chatgpt-auth.ts", "*.config.{ts,mjs}"]),
  eslint.configs.recommended,
  ...nextVitals,
  ...nextTs,
  ...typescriptEslint.configs.strictTypeChecked,
  ...typescriptEslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "@typescript-eslint/explicit-function-return-type": ["error", { allowExpressions: true }],
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-condition": "error",
      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/strict-boolean-expressions": ["error", { allowNullableBoolean: false }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/unbound-method": "off",
      "@next/next/no-img-element": "off",
      eqeqeq: ["error", "always"],
      "no-alert": "error",
      "no-console": "error",
      "no-duplicate-imports": "error",
      "no-implicit-coercion": "error",
      "no-restricted-syntax": ["error", { selector: "TSEnumDeclaration", message: "Prefer literal unions over enums." }],
      "prefer-const": "error",
    },
  },
  {
    files: ["tests/**/*.{ts,tsx}", "vitest.config.ts"],
    rules: { "@typescript-eslint/explicit-function-return-type": "off" },
  },
]);
