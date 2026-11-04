import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const sourcePath = join(root, "packages/n8n-nodes-spurvik/src/index.ts");
const manifestPath = join(root, "packages/n8n-nodes-spurvik/package.json");
const workflowPath = join(here, "spurvik-eu-ai-act-guard.workflow.json");
const makePath = join(here, "make-http-module.json");
const readmePath = join(here, "README.md");
const envPath = join(here, ".env.example");

const DISCLAIMER =
  "Spurvik logs AI calls with HMAC receipts and offers disclosure, marking and human-oversight hooks; it does not make anyone compliant, and this is not legal advice.";

const BANNED = [
  [/compliance-ready/i, "compliance-ready"],
  [/\bcompliant\b/i, "compliant"],
  [/\bverified\b/i, "verified"],
  [/\bverifiable\b/i, "verifiable"],
  [/\bcertified\b/i, "certified"],
  [/tamper-proof/i, "tamper-proof"],
  [/tamper-evident/i, "tamper-evident"],
  [/zero-pii/i, "Zero-PII"],
  [/pii-free/i, "PII-free"],
  [/zero-knowledge/i, "zero-knowledge"],
  [/\bsovereign\b/i, "sovereign"],
  [/\bproves?\b/i, "prove/proves"],
  [/\bguarantee\b/i, "guarantee"],
  [/\bofficial\b/i, "official"],
  [/audit-ready/i, "audit-ready"],
  [/\bcryptographic\b/i, "cryptographic"],
  [/non-repudiation/i, "non-repudiation"],
  [/\bimmutable\b/i, "immutable"],
  [/automatic compliance/i, "automatic compliance"],
  [/full compliance/i, "full compliance"],
  [/1-click/i, "1-click"],
  [/1-line/i, "1-line"],
  [/2-line/i, "2-line"],
  [/pre-release/i, "pre-release"],
  [/\bapache\b/i, "Apache"],
  [/aegis-ai/i, "aegis-ai"],
  [/copenhagen/i, "Copenhagen"],
  [/\d+\s*minutes/i, "time claim in minutes"],
  [/npx\s+spurvik\b/i, "npx spurvik"],
  [/@spurvik\//, "@spurvik/"],
];

function fail(message) {
  console.error(`fail: ${message}`);
  process.exitCode = 1;
}

function extractDescription(source) {
  const marker = "export const SpurvikN8nNodeDescription = ";
  const at = source.indexOf(marker);
  if (at < 0) {
    fail("SpurvikN8nNodeDescription is missing from the package source");
    return null;
  }
  const start = source.indexOf("{", at);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        const literal = source.slice(start, i + 1);
        return Function(`"use strict"; return (${literal});`)();
      }
    }
  }
  fail("SpurvikN8nNodeDescription object did not close");
  return null;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  const sorted = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) sorted[key] = canonicalize(value[key]);
  }
  return sorted;
}

function walk(value, visit) {
  visit(value);
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) walk(child, visit);
}

const source = readFileSync(sourcePath, "utf8");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const description = extractDescription(source);
const workflow = JSON.parse(readFileSync(workflowPath, "utf8"));
const makeDoc = JSON.parse(readFileSync(makePath, "utf8"));

if (description) {
  const propertyNames = description.properties.map((property) => property.name);
  const expectedType = `${manifest.name}.${description.name}`;
  const spurvikNodes = workflow.nodes.filter((node) => String(node.type).endsWith(description.name));
  if (spurvikNodes.length === 0) fail(`workflow has no node whose type ends with ${description.name}`);

  const optionProperty = description.properties.find((property) => property.type === "options" && property.name === "operation");
  const optionValues = new Set((optionProperty?.options ?? []).map((option) => option.value));
  const seenOperations = new Set();

  for (const node of spurvikNodes) {
    if (node.type !== expectedType) fail(`${node.name} type is ${node.type}, source expects ${expectedType}`);
    if (node.typeVersion !== description.version) {
      fail(`${node.name} typeVersion ${node.typeVersion} does not match descriptor version ${description.version}`);
    }
    if (node.credentials) fail(`${node.name} sets credentials, and the descriptor has none`);
    const keys = Object.keys(node.parameters ?? {});
    for (const key of keys) {
      if (!propertyNames.includes(key)) fail(`${node.name} parameter ${key} is not on the descriptor`);
    }
    for (const property of description.properties) {
      if (property.required && (node.parameters?.[property.name] === undefined || node.parameters[property.name] === "")) {
        fail(`${node.name} is missing required parameter ${property.name}`);
      }
    }
    const operation = node.parameters?.operation;
    if (!optionValues.has(operation)) fail(`${node.name} operation ${operation} is not a descriptor option`);
    seenOperations.add(operation);
    if (typeof node.parameters.systemName !== "string") fail(`${node.name} systemName is not a string`);
  }

  for (const value of optionValues) {
    if (!seenOperations.has(value)) fail(`workflow never sets operation ${value}`);
  }

  if (!source.includes("export async function executeSpurvikWorkflowStep")) {
    fail("executeSpurvikWorkflowStep is missing from the package source");
  }
  if (/\bclass\s+\w+/.test(source) || /async execute\(/.test(source)) {
    fail("package source now has a class or execute method; re-check the guide before treating the node as unloadable");
  }

  console.log(
    `ok n8n workflow: ${spurvikNodes.length} nodes of type ${expectedType}, parameters [${propertyNames.join(", ")}], operations [${[...seenOperations].join(", ")}]`,
  );
}

const httpModules = [];
walk(makeDoc, (value) => {
  if (value && typeof value === "object" && value.module === "http:ActionSendData") httpModules.push(value);
});
if (httpModules.length < 1) fail("Make JSON has no http:ActionSendData module");
if (makeDoc.nodeCallsSpurvikHttp !== false) fail("Make JSON must record that the n8n helper does not call Spurvik HTTP");
if (makeDoc.makeComLoadsN8nCommunityNodes !== false) fail("Make JSON must record that Make.com does not load n8n community nodes");

const hitlModule = httpModules.find((mod) => String(mod.mapper?.url).endsWith("/api/v1/hitl"));
if (!hitlModule) fail("Make JSON is missing POST /api/v1/hitl settings");
const hitlBody = JSON.parse(hitlModule.mapper.data);
if (typeof hitlBody.payloadSummary !== "string") fail("HITL body is missing payloadSummary");
const summary = JSON.parse(hitlBody.payloadSummary);
if (summary.schema !== "spurvik.payload_summary.v1") fail("payloadSummary schema is not spurvik.payload_summary.v1");
if (hitlBody.payloadSummary !== canonicalJson(summary)) fail("payloadSummary is not canonical JSON");
if ("inputHmac" in hitlBody || "rawPromptBytes" in hitlBody) {
  fail("HITL sample uses keys the SDK create-body does not have");
}

const telemetryModule = httpModules.find((mod) => String(mod.mapper?.url).includes("/api/v1/telemetry"));
if (!telemetryModule) fail("Make JSON is missing POST /api/v1/telemetry settings");
const telemetryBody = JSON.parse(telemetryModule.mapper.data);
const event = telemetryBody.events?.[0];
for (const key of [
  "eventId",
  "timestamp",
  "modelProvider",
  "modelVersion",
  "inputHash",
  "outputHash",
  "contentHashMode",
  "latencyMs",
  "temperature",
  "contentMarkingApplied",
  "markingHookId",
  "hitlStatus",
]) {
  if (!event || !(key in event)) fail(`telemetry sample is missing ${key}`);
}

console.log(`ok make json: parsed, ${httpModules.length} HTTP modules`);

const texts = [readmePath, envPath, workflowPath, makePath].map((path) => ({
  path,
  text: readFileSync(path, "utf8"),
}));
if (!texts[0].text.includes(DISCLAIMER)) fail("README is missing the HMAC receipts sentence");

for (const file of texts) {
  const stripped = file.text.split(DISCLAIMER).join("");
  for (const [pattern, label] of BANNED) {
    if (pattern.test(stripped)) fail(`${file.path} contains banned wording (${label})`);
  }
  if (/spurvik_live_[A-Za-z0-9_-]{32,}/.test(file.text)) fail(`${file.path} contains a long live-key shape`);
  if (/hooks\.slack\.com/.test(file.text)) fail(`${file.path} contains a Slack webhook host`);
}

const distJs = join(root, "packages/n8n-nodes-spurvik/dist/index.js");
console.log("gaps:");
console.log(`- dist entry ${existsSync(distJs) ? "exists" : "missing"}: packages/n8n-nodes-spurvik/dist/index.js`);
console.log(`- manifest credentials: ${JSON.stringify(manifest.n8n?.credentials ?? null)}`);
console.log(`- manifest scripts: ${JSON.stringify(manifest.scripts ?? null)}`);
console.log(`- manifest dependencies: ${JSON.stringify(manifest.dependencies ?? null)}`);
console.log("- source exports a description object and executeSpurvikWorkflowStep; no node class");

if (process.exitCode) {
  console.error("validation failed");
} else {
  console.log("validation passed");
}
