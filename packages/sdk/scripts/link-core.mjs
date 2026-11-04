import { mkdirSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sdkRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const coreRoot = resolve(sdkRoot, "../core");
const linkPath = join(sdkRoot, "node_modules", "@spurvik", "core");
mkdirSync(dirname(linkPath), { recursive: true });

function alreadyLinked() {
  try {
    return realpathSync(linkPath) === realpathSync(coreRoot);
  } catch {
    return false;
  }
}

if (!alreadyLinked()) {
  rmSync(linkPath, { recursive: true, force: true });
  symlinkSync(coreRoot, linkPath, "dir");
}
