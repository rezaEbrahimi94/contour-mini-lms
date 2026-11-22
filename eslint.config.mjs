import next from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const config = [
  {
    // Build output, and files written by generators (npm run db:types,
    // npm run contracts). Generated files are checked for drift instead.
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "test-results/**",
      "playwright-report/**",
      "lib/database.types.ts",
      "features/consultations/api.d.ts",
    ],
  },
  ...next,
  ...nextTypescript,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // A rule can only be relaxed here, where the reason is written down.
    // Comments in source files cannot switch a rule off.
    linterOptions: {
      noInlineConfig: true,
      reportUnusedDisableDirectives: "error",
    },
    rules: {
      // `value as T` is allowed only when T is wider than the value's type.
      "@typescript-eslint/no-unsafe-type-assertion": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      // node:test collects the promise its test() returns; awaiting it at the
      // top level would run test files one case at a time for no benefit.
      "@typescript-eslint/no-floating-promises": [
        "error",
        {
          allowForKnownSafeCalls: [
            { from: "package", package: "node:test", name: "test" },
          ],
        },
      ],
      // Numbers and booleans print unambiguously in messages and URLs.
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true, allowBoolean: true },
      ],
    },
  },
];

export default config;
