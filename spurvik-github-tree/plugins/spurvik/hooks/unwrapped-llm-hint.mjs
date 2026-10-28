import { lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename } from "node:path";

const CODE_EXT = /\.(?:tsx?|jsx?|mjs|cjs|py)$/;
const MAX_FILE_BYTES = 512 * 1024;
const CLIENT = /new OpenAI\b|new Anthropic\b|new GoogleGenAI\b|openai\.chat\b|openai\.responses\b|anthropic\.messages\b|\.generateContent\b|wrapLanguageModel\b|StateGraph\b|@langchain\/langgraph/;

function isEnvSegment(part) {
  const lower = part.toLowerCase();
  return lower === ".env" || lower.startsWith(".env.");
}

function envNamed(filePath) {
  return String(filePath)
    .split(/[/\\]/)
    .some(isEnvSegment);
}

function inspectable(filePath) {
  const name = basename(String(filePath));
  return CODE_EXT.test(name) || isEnvSegment(name);
}

function special(info) {
  return info.isFIFO() || info.isSocket() || info.isCharacterDevice() || info.isBlockDevice();
}

function hint(filePath) {
  const text =
    `Spurvik hint: ${filePath} looks like a model client without withSpurvik, spurvikMiddleware, or withSpurvikLangGraph. ` +
    "/spurvik:wrap shows the setup in this repository. An Art. 50 notice is a separate UI choice. " +
    "Art. 12 record-keeping and Art. 14 human oversight are for high-risk AI systems.";
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext: text,
      },
    })}\n`,
  );
}

function main() {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return;
  }
  const raw = input?.tool_input?.file_path || input?.tool_input?.path || "";
  if (typeof raw !== "string" || raw.length === 0) return;

  try {
    const listed = lstatSync(raw);
    if (special(listed)) return;
    const resolved = realpathSync(raw);
    if (!inspectable(raw) && !inspectable(resolved)) return;
    if (envNamed(raw) || envNamed(resolved)) return;
    const info = statSync(resolved);
    if (special(info) || !info.isFile() || info.size > MAX_FILE_BYTES) return;
    const source = readFileSync(resolved, "utf8");
    if (!CLIENT.test(source)) return;
    if (source.includes("StateGraph") && !source.includes("withSpurvikLangGraph")) {
      hint(raw);
      return;
    }
    if (
      source.includes("withSpurvik") ||
      source.includes("spurvikMiddleware") ||
      source.includes("spurvikInterrupt") ||
      source.includes("resolveLangGraphInterrupts")
    ) {
      return;
    }
    hint(raw);
  } catch {
    return;
  }
}

main();
