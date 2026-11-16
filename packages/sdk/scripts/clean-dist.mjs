import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// tsup builds both configs in tsup.config.ts in parallel, so a per-config `clean` would delete the
// other config's output (dist/cli.js). Clean once here, before tsup starts.
const sdkRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
rmSync(join(sdkRoot, process.env.SPURVIK_SDK_DIST ?? "dist"), { recursive: true, force: true });
