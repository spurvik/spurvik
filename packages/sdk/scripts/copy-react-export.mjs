import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const sdkRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const reactDist = join(sdkRoot, "..", "react", "dist");
const outDir = join(sdkRoot, "dist");
const pairs = [
  ["index.js", "react.js"],
  ["index.cjs", "react.cjs"],
  ["index.d.ts", "react.d.ts"],
  ["index.d.ts", "react.d.cts"],
  ["index.js.map", "react.js.map"],
  ["index.cjs.map", "react.cjs.map"],
  ["index.d.ts.map", "react.d.ts.map"],
];

if (!existsSync(join(reactDist, "index.js"))) {
  throw new Error("Build packages/react before packages/sdk. Missing packages/react/dist/index.js.");
}
mkdirSync(outDir, { recursive: true });
for (const [from, to] of pairs) {
  const source = join(reactDist, from);
  if (existsSync(source)) copyFileSync(source, join(outDir, to));
}
