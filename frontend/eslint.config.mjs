import { FlatCompat } from "@eslint/eslintrc";
import path from "node:path";
import { fileURLToPath } from "node:url";
import unusedImports from "eslint-plugin-unused-imports";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  {
    ignores: [
      "e2e/**",
      "src/types/api.ts",
      "src/api/**",
      "public/**",
      "public/sw.js",
      ".next/**",
      ".next-dev/**",
      "node_modules/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "off", // handled by unused-imports below
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unsafe-function-type": "warn",
      "react/no-unescaped-entities": "warn",
      "react/display-name": "off",
      "react-hooks/exhaustive-deps": "warn",
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],
    },
  },
];

export default eslintConfig;
