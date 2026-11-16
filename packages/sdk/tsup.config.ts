import { defineConfig } from "tsup";

const outDir = process.env.SPURVIK_SDK_DIST ?? "dist";

export default defineConfig([
  {
    entry: ["src/index.ts", "src/ai.ts", "src/mastra.ts", "src/openai-agents.ts", "src/langgraph.ts", "src/channels.ts"],
    external: ["@ai-sdk/provider", "@openai/agents", "ai"],
    format: ["esm", "cjs"],
    outDir,
    dts: true,
    // scripts/clean-dist.mjs empties outDir before tsup; a clean here would race the cli config below.
    clean: false,
    sourcemap: false,
    splitting: true,
    target: "es2022",
    platform: "neutral",
    noExternal: ["@spurvik/core"],
  },
  {
    // `spurvik` / `spurvik-sdk` bin. Node-only and dependency-free; scripts/finalize-cli.mjs checks it and sets 0o755.
    entry: ["src/cli.ts"],
    format: ["esm"],
    outDir,
    platform: "node",
    target: "node20",
    dts: false,
    clean: false,
    splitting: false,
    sourcemap: false,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
