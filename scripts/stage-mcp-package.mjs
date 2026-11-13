import { createRequire } from "node:module";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  cpSync,
} from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const packageRoot = join(repoRoot, "packages/mcp");
const staging = join(packageRoot, ".release");
const workspacePkg = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const version = workspacePkg.version;
const mcpName = workspacePkg.mcpName;

if (typeof version !== "string" || !version) {
  throw new Error("packages/mcp/package.json is missing version.");
}
if (mcpName !== "io.github.spurvik/spurvik-mcp-server") {
  throw new Error(
    `packages/mcp/package.json mcpName must be "io.github.spurvik/spurvik-mcp-server" (the server.json name). Got ${JSON.stringify(mcpName)}.`,
  );
}

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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function insideNodeModules(dir) {
  return dir.split(sep).includes("node_modules");
}

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

function bundledThirdParty(metafile) {
  const packages = new Map();
  const inputs = metafile && metafile.inputs ? Object.keys(metafile.inputs) : [];
  for (const input of inputs) {
    const normalized = input.split("\\").join("/");
    if (!normalized.includes("/node_modules/") && !normalized.startsWith("node_modules/")) continue;
    const found = nearestNamedPackage(absoluteInput(input));
    if (!found) return { error: `Bundled input has no package name: ${input}\n` };
    if (!packages.has(found.name)) packages.set(found.name, found.root);
  }
  return {
    packages: new Map(
      [...packages.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
    ),
  };
}

function licenseBody(pkgRoot) {
  for (const name of ["LICENSE", "LICENSE.md", "LICENSE.txt"]) {
    const file = join(pkgRoot, name);
    if (existsSync(file)) return readFileSync(file, "utf8").trim();
  }
  return null;
}

function buildNotices(metafiles) {
  const packages = new Map();
  for (const metafile of metafiles) {
    const collected = bundledThirdParty(metafile);
    if (collected.error) throw new Error(collected.error.trim());
    for (const [name, root] of collected.packages) {
      if (!packages.has(name)) packages.set(name, root);
    }
  }
  if (packages.size === 0) throw new Error("The bundle metafile did not include any third-party packages.");
  const blocks = [
    "Third-party notices for spurvik-mcp-server",
    "",
    "The texts below are the LICENSE files installed with the third-party packages bundled into this server. Each text is copied as installed.",
    "",
  ];
  for (const [name, pkgRoot] of new Map(
    [...packages.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0)),
  )) {
    const body = licenseBody(pkgRoot);
    if (!body) throw new Error(`No LICENSE file for bundled package ${name} in ${pkgRoot}`);
    let ver = "";
    try {
      const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
      if (typeof pkg.version === "string") ver = pkg.version;
    } catch {
      ver = "";
    }
    blocks.push(name);
    if (ver) blocks.push(`Version ${ver}`);
    blocks.push("");
    blocks.push(body);
    blocks.push("");
  }
  return blocks.join("\n").trim() + "\n";
}

const spurvikPlugin = {
  name: "spurvik-workspace",
  setup(build) {
    build.onResolve({ filter: /^@spurvik\// }, (args) => {
      const path = workspace[args.path];
      if (!path) return { errors: [{ text: `This bundle does not include ${args.path}` }] };
      return { path };
    });
  },
};

async function bundle(entry, outfile, { banner } = {}) {
  const result = await esbuild.build({
    absWorkingDir: repoRoot,
    entryPoints: [entry],
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
    banner: banner ? { js: banner } : undefined,
    plugins: [spurvikPlugin],
  });
  if (result.warnings.length > 0) {
    throw new Error(`Bundle warnings: ${result.warnings.length}`);
  }
  const built = readFileSync(outfile);
  if (built.includes(0)) throw new Error(`The bundle contains a NUL byte: ${outfile}`);
  if (built.includes(repoRoot)) throw new Error(`The bundle contains an absolute path from this checkout: ${outfile}`);
  return result.metafile;
}

rmSync(staging, { recursive: true, force: true });
mkdirSync(join(staging, "dist"), { recursive: true });

const indexMeta = await bundle(join(packageRoot, "src/index.ts"), join(staging, "dist/index.js"), {
  banner: "#!/usr/bin/env node\n",
});
chmodSync(join(staging, "dist/index.js"), 0o755);
const toolsMeta = await bundle(join(packageRoot, "src/tools-api.ts"), join(staging, "dist/tools-api.js"));

writeFileSync(join(staging, "dist/THIRD-PARTY-NOTICES.txt"), buildNotices([indexMeta, toolsMeta]));

const dtsIndex = join(packageRoot, "dist/index.d.ts");
const dtsTools = join(packageRoot, "dist/tools-api.d.ts");
if (!existsSync(dtsIndex) || !existsSync(dtsTools)) {
  throw new Error("Build packages/mcp (pnpm build / tsup) before staging, so dist/*.d.ts exist.");
}
cpSync(dtsIndex, join(staging, "dist/index.d.ts"));
cpSync(dtsTools, join(staging, "dist/tools-api.d.ts"));

cpSync(join(packageRoot, "LICENSE"), join(staging, "LICENSE"));

const readme = `# spurvik-mcp-server

Local stdio MCP server. Version ${version}. License: MIT. Copyright (c) 2026 EyeTea Solutions ApS (CVR 37093378).

\`\`\`bash
spurvik-mcp-server --root <project>
spurvik-mcp --root <project>
\`\`\`

On \`initialize\`, the server reports \`serverInfo.version\` \`${version}\`. It speaks MCP protocol \`2025-06-18\`, and \`2024-11-05\` when the client requests \`2024-11-05\`. \`@modelcontextprotocol/sdk\` 1.32.1 is bundled. Third-party licence text is in \`dist/THIRD-PARTY-NOTICES.txt\`.

From spurvik-mcp-server@1.0.4, the bundled SDK matches \`spurvik@1.0.8\`: an \`overridden\` human decision is treated as not approved. Continue only when the status is \`approved\`.

Tools: \`spurvik_setup_snippet\`, \`spurvik_find_unwrapped_calls\`, \`spurvik_explain_receipt\`, \`spurvik_marking_hooks\`, \`spurvik_scan_live_url\`, \`spurvik_classify_ai_act_risk\`, and \`spurvik_generate_art50_badge\`. Setup snippets cover OpenAI, Anthropic, Google GenAI, the Vercel AI SDK, Mastra, OpenAI Agents, and LangGraph. The tools are read-only. Six run locally and do not use the network. \`spurvik_scan_live_url\` sends one public URL to console.spurvik.com (8-second timeout) and returns \`offlineFallback: true\` with the report, sandbox and badge.js links when the service cannot be reached; localhost, private IPs and internal hosts are refused before any request.

\`spurvik_classify_ai_act_risk\` maps a use case to \`prohibited_art5\`, \`high_risk_annex_iii\`, \`limited_transparency_art50\` or \`minimal_risk\` (engineering mapping aid; not legal advice). \`spurvik_generate_art50_badge\` returns a one-line badge.js tag, a Next.js \`<Script>\`, and WordPress, Framer and shadcn/v0 assets in the 24 official EU languages.

Repository: https://github.com/spurvik/spurvik
Plugin tree: https://github.com/spurvik/spurvik/tree/main/plugins/spurvik
`;
writeFileSync(join(staging, "README.md"), readme);

const published = {
  name: "spurvik-mcp-server",
  version,
  mcpName,
  description: workspacePkg.description,
  license: "MIT",
  type: "module",
  main: "./dist/index.js",
  types: "./dist/index.d.ts",
  exports: {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    },
    "./tools": {
      types: "./dist/tools-api.d.ts",
      import: "./dist/tools-api.js",
    },
  },
  bin: {
    "spurvik-mcp-server": "./dist/index.js",
    "spurvik-mcp": "./dist/index.js",
  },
  files: ["dist", "LICENSE", "README.md"],
  engines: { node: ">=20" },
  publishConfig: { access: "public" },
  repository: {
    type: "git",
    url: "git+https://github.com/spurvik/spurvik.git",
    directory: "packages/mcp",
  },
  homepage: "https://spurvik.com",
};
writeFileSync(join(staging, "package.json"), `${JSON.stringify(published, null, 2)}\n`);

console.log(`Staged ${staging} as spurvik-mcp-server@${version} (mcpName ${mcpName}).`);
