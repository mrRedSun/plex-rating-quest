import eslint from "@eslint/js";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import typescriptEslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist/**", "coverage/**", "node_modules/**", "*.config.{ts,mjs}"]),
  eslint.configs.recommended,
  jsxA11y.flatConfigs.strict,
  reactHooks.configs.flat["recommended-latest"],
  ...typescriptEslint.configs.strictTypeChecked,
  ...typescriptEslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.browser,
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
    files: ["tests/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/explicit-function-return-type": "off" },
  },
  {
    files: ["scripts/**/*.mjs"],
    ...typescriptEslint.configs.disableTypeChecked,
    languageOptions: { globals: globals.node, parserOptions: { projectService: false } },
    rules: { ...typescriptEslint.configs.disableTypeChecked.rules, "@typescript-eslint/explicit-function-return-type": "off", "no-console": "error" },
  },
]);
