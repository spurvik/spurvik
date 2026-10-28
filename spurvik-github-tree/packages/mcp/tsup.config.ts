import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/tools-api.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: false,
  target: "es2022",
  platform: "node",
  skipNodeModulesBundle: true,
});
