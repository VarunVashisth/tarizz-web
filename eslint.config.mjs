import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/static-components": "off",
      "@next/next/no-location-assign-relative-destination": "off",
      "@next/next/no-img-element": "off"
    }
  },
  globalIgnores([".next/**", "build/**", "node_modules/**", "next-env.d.ts"])
]);
