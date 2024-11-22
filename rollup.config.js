import json from "@rollup/plugin-json";
import typescript from "@rollup/plugin-typescript";
import pkg from "./package.json" with { type: "json" };
import resolve from "@rollup/plugin-node-resolve";
import commonJS from "@rollup/plugin-commonjs";

export default {
  input: "src/index.ts",
  plugins: [
    json(),
    resolve(),
    commonJS(),
    typescript({ tsconfig: "./tsconfig.json" }),
  ],
  output: [
    { file: pkg.main, format: "cjs", exports: "default" },
    { file: pkg.module, format: "esm", exports: "default" },
  ],
  // external: [
  //   ...Object.keys(pkg.dependencies || {}),
  //   ...Object.keys(pkg.peerDependencies || {}),
  //   "crypto",
  // ],
};
