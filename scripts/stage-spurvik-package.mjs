import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sdk = join(root, "packages", "sdk");
const dest = join(root, "packages", "spurvik");
if (
  !existsSync(join(sdk, "dist", "index.js")) ||
  !existsSync(join(sdk, "dist", "react.js")) ||
  !existsSync(join(sdk, "dist", "cli.js"))
) {
  throw new Error("Build packages/sdk (including the react export and the cli) before staging packages/spurvik.");
}
rmSync(join(dest, "dist"), { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(sdk, "dist"), join(dest, "dist"), { recursive: true });
cpSync(join(sdk, "README.md"), join(dest, "README.md"));
cpSync(join(sdk, "LICENSE"), join(dest, "LICENSE"));
// `bin` target for `npx spurvik`.
chmodSync(join(dest, "dist", "cli.js"), 0o755);
console.log("Staged packages/spurvik from the spurvik-sdk build. spurvik-sdk does not depend on spurvik.");
