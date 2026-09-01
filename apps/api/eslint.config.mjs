import next from "eslint-config-next";

/** @type {import('eslint').Linter.Config[]} */
const config = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "public/**",
      "_legacy_services/**",
    ],
  },
  ...(Array.isArray(next) ? next : next.default ?? []),
];

export default config;
