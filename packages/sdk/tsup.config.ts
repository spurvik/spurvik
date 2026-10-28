import { defineConfig } from "tsup";

const outDir = process.env.SPURVIK_SDK_DIST ?? "dist";

export default defineConfig({
  entry: ["src/index.ts", "src/ai.ts", "src/mastra.ts", "src/openai-agents.ts", "src/langgraph.ts"],
  external: ["@ai-sdk/provider", "@openai/agents", "ai"],
  format: ["esm", "cjs"],
  outDir,
  dts: true,
  clean: true,
  sourcemap: true,
  splitting: true,
  target: "es2022",
  platform: "neutral",
  noExternal: ["@spurvik/core"],
});
