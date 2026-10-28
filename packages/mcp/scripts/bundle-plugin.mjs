import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, "..");
const repoRoot = join(packageRoot, "..", "..");
const committed = join(repoRoot, "plugins/spurvik/bin/spurvik-mcp.mjs");
const noticesPath = join(repoRoot, "plugins/spurvik/THIRD-PARTY-NOTICES.txt");
const check = process.argv.includes("--check");

const require = createRequire(join(packageRoot, "package.json"));
const esbuild = require("esbuild");

const workspace = {
  "@spurvik/core": join(repoRoot, "packages/core/src/index.ts"),
  "@spurvik/sdk": join(repoRoot, "packages/sdk/src/index.ts"),
  "@spurvik/sdk/ai": join(repoRoot, "packages/sdk/src/ai.ts"),
  "@spurvik/sdk/mastra": join(repoRoot, "packages/sdk/src/mastra.ts"),
  "@spurvik/sdk/openai-agents": join(repoRoot, "packages/sdk/src/openai-agents.ts"),
  "@spurvik/sdk/langgraph": join(repoRoot, "packages/sdk/src/langgraph.ts"),
};

const outfile = check ? join(tmpdir(), `spurvik-mcp-check-${process.pid}.mjs`) : committed;
mkdirSync(dirname(outfile), { recursive: true });

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function insideNodeModules(dir) {
  const parts = dir.split(sep);
  return parts.includes("node_modules");
}

/** Nearest installed package.json that has a name, walking up from a bundled file. */
function nearestNamedPackage(filePath) {
  let dir = dirname(filePath);
  while (insideNodeModules(dir)) {
    const manifestPath = join(dir, "package.json");
    if (existsSync(manifestPath)) {
      let parsed = null;
      try {
        parsed = JSON.parse(readFileSync(manifestPath, "utf8"));
      } catch {
        parsed = null;
      }
      if (parsed && typeof parsed.name === "string" && parsed.name.length > 0) {
        return { name: parsed.name, root: dir };
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function absoluteInput(input) {
  if (input.startsWith("/") || /^[A-Za-z]:[\\/]/.test(input)) return input;
  return join(repoRoot, input);
}

/** Sorted map of bundled third-party package name to the installed package root. */
function bundledThirdParty(metafile) {
  const packages = new Map();
  const inputs = metafile && metafile.inputs ? Object.keys(metafile.inputs) : [];
  for (const input of inputs) {
    const normalized = input.split("\\").join("/");
    if (!normalized.includes("/node_modules/") && !normalized.startsWith("node_modules/")) continue;
    const found = nearestNamedPackage(absoluteInput(input));
    if (!found) {
      return { error: `Bundled input has no package name: ${input}\n` };
    }
    const previous = packages.get(found.name);
    if (!previous) packages.set(found.name, found.root);
  }
  return { packages: new Map([...packages.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))) };
}

function licenseBody(pkgRoot) {
  for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
    const file = join(pkgRoot, name);
    if (existsSync(file)) return readFileSync(file, "utf8").trim();
  }
  return null;
}

function noticeHeaders(notice) {
  const lines = notice.split(/\r?\n/);
  const headers = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const line = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    if (line.length > 0 && /^Version\s+\S+/.test(next)) headers.push(line);
  }
  return headers;
}

function noticeProblems(metafile) {
  const collected = bundledThirdParty(metafile);
  if (collected.error) return collected.error;
  const packages = collected.packages;
  if (!packages || packages.size === 0) return "The bundle metafile did not include any third-party packages.\n";
  if (!existsSync(noticesPath)) return "plugins/spurvik/THIRD-PARTY-NOTICES.txt is missing.\n";
  const notice = readFileSync(noticesPath, "utf8");
  const missingHeaders = [];
  for (const name of packages.keys()) {
    if (!new RegExp(`^${escapeRegExp(name)}$`, "m").test(notice)) missingHeaders.push(name);
  }
  const extraHeaders = noticeHeaders(notice).filter((header) => !packages.has(header));
  const missingLicenses = [];
  for (const [name, pkgRoot] of packages) {
    const body = licenseBody(pkgRoot);
    if (!body) {
      missingLicenses.push(`${name} (no LICENSE file in ${pkgRoot})`);
      continue;
    }
    if (!notice.includes(body)) missingLicenses.push(`${name} (${pkgRoot})`);
  }
  if (missingHeaders.length === 0 && extraHeaders.length === 0 && missingLicenses.length === 0) return "";
  const lines = ["THIRD-PARTY-NOTICES.txt does not match the packages bundled into the plugin server."];
  if (missingHeaders.length > 0) lines.push(`Missing package headers: ${missingHeaders.join(", ")}`);
  if (extraHeaders.length > 0) lines.push(`Unexpected package headers: ${extraHeaders.join(", ")}`);
  if (missingLicenses.length > 0) lines.push(`Missing license text: ${missingLicenses.join(", ")}`);
  return `${lines.join("\n")}\n`;
}

const result = await esbuild.build({
  absWorkingDir: repoRoot,
  entryPoints: [join(packageRoot, "src/index.ts")],
  outfile,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  packages: "bundle",
  legalComments: "none",
  sourcemap: false,
  external: ["ai"],
  charset: "utf8",
  metafile: true,
  logLevel: "warning",
  banner: {
    js: "/* Local stdio server for the Spurvik Claude Code plugin (1.0.2, MIT). */\n",
  },
  plugins: [
    {
      name: "spurvik-workspace",
      setup(build) {
        build.onResolve({ filter: /^@spurvik\// }, (args) => {
          const path = workspace[args.path];
          if (!path) return { errors: [{ text: `This bundle does not include ${args.path}` }] };
          return { path };
        });
      },
    },
  ],
});

if (result.warnings.length > 0) {
  process.stderr.write(`Bundle warnings: ${result.warnings.length}\n`);
  process.exit(1);
}

const built = readFileSync(outfile);
if (built.includes(0)) {
  if (check) rmSync(outfile, { force: true });
  process.stderr.write("The bundle contains a NUL byte.\n");
  process.exit(1);
}
if (built.includes(repoRoot)) {
  if (check) rmSync(outfile, { force: true });
  process.stderr.write("The bundle contains an absolute path from this checkout.\n");
  process.exit(1);
}

const notices = noticeProblems(result.metafile);
if (notices) {
  if (check) rmSync(outfile, { force: true });
  process.stderr.write(notices);
  process.exit(1);
}

if (check) {
  const expected = readFileSync(committed);
  const same = createHash("sha256").update(built).digest("hex") === createHash("sha256").update(expected).digest("hex");
  rmSync(outfile, { force: true });
  if (!same) {
    process.stderr.write("plugins/spurvik/bin/spurvik-mcp.mjs does not match the bundle script.\n");
    process.exit(1);
  }
  process.stdout.write("plugin bundle matches\n");
} else {
  writeFileSync(committed, built);
  process.stdout.write(`${committed}\n`);
}
