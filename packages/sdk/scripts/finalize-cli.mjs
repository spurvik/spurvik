import { chmodSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Check that tsup emitted the CLI with its shebang, then make it executable for the package `bin`.
const sdkRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const cli = join(sdkRoot, process.env.SPURVIK_SDK_DIST ?? "dist", "cli.js");
if (!existsSync(cli)) {
  throw new Error(`Missing ${cli}. Re-run npm run build in packages/sdk.`);
}
const head = readFileSync(cli, "utf8").slice(0, 64);
if (!head.startsWith("#!/usr/bin/env node\n")) {
  throw new Error(`${cli} must start with the #!/usr/bin/env node banner.`);
}
chmodSync(cli, 0o755);
