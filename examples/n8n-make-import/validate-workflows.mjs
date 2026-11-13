import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const nodeSourcePath = join(root, "packages/n8n-nodes-spurvik/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.ts");
const builtNodePath = join(
  root,
  "packages/n8n-nodes-spurvik/dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js",
);
const workflowSourcePath = join(root, "packages/n8n-nodes-spurvik/workflow.ts");
const manifestPath = join(root, "packages/n8n-nodes-spurvik/package.json");
const workflowPath = join(here, "spurvik-eu-ai-act-guard.workflow.json");
const makePath = join(here, "make-http-module.json");
const readmePath = join(here, "README.md");
const envPath = join(here, ".env.example");

const DISCLAIMER =
  "Spurvik logs AI calls with HMAC receipts and offers disclosure, marking and human-oversight hooks. It is designed to support that work and not legal advice.";

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
  const marker = "export const SpurvikN8nNodeDescription";
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

/** n8n displayOptions show/hide check: a value set on the node wins, else the descriptor default. */
function shownFor(entry, parameters, properties) {
  const valueOf = (key) => {
    const dependency = properties.find((property) => property.name === key);
    return parameters && Object.prototype.hasOwnProperty.call(parameters, key) ? parameters[key] : dependency?.default;
  };
  for (const [key, allowed] of Object.entries(entry?.displayOptions?.show ?? {})) {
    if (!allowed.map(String).includes(String(valueOf(key)))) return false;
  }
  for (const [key, hidden] of Object.entries(entry?.displayOptions?.hide ?? {})) {
    if (hidden.map(String).includes(String(valueOf(key)))) return false;
  }
  return true;
}

function walk(value, visit) {
  visit(value);
  if (!value || typeof value !== "object") return;
  for (const child of Object.values(value)) walk(child, visit);
}

const nodeSource = readFileSync(nodeSourcePath, "utf8");
const workflowSource = readFileSync(workflowSourcePath, "utf8");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

function loadDescription() {
  if (!/export class SpurvikEuAiActGuard\b/.test(nodeSource)) {
    fail("node source does not export class SpurvikEuAiActGuard");
    return null;
  }
  if (!/async execute\(/.test(nodeSource)) {
    fail("SpurvikEuAiActGuard is missing execute()");
    return null;
  }
  if (existsSync(builtNodePath)) {
    const loaded = require(builtNodePath);
    const Ctor = loaded.SpurvikEuAiActGuard;
    if (typeof Ctor !== "function") {
      fail("built node file does not export class SpurvikEuAiActGuard");
      return null;
    }
    const description = new Ctor().description;
    if (!description) {
      fail("SpurvikEuAiActGuard.description is missing");
      return null;
    }
    console.log("ok class: loaded dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js");
    return description;
  }
  console.log("ok class: source nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.ts (dist node file is absent)");
  return extractDescription(nodeSource);
}

const description = loadDescription();
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
    const credentialSpec = (description.credentials ?? []).find((item) => item.name === "spurvikApi");
    if (!credentialSpec?.required) fail("descriptor is missing required credential spurvikApi");
    const credential = node.credentials?.spurvikApi;
    const credentialUsed = shownFor(credentialSpec, node.parameters, description.properties);
    if (!credentialUsed) {
      // scanDomain needs no credential: the descriptor hides spurvikApi for it.
      if (credential) fail(`${node.name} references spurvikApi, but operation ${node.parameters?.operation} uses no credential`);
    } else if (!credential || typeof credential.id !== "string" || !credential.id || typeof credential.name !== "string" || !credential.name) {
      fail(`${node.name} is missing a spurvikApi credential reference`);
    } else {
      const extra = Object.keys(credential).filter((key) => key !== "id" && key !== "name");
      if (extra.length) fail(`${node.name} credential reference has fields other than id and name (${extra.join(", ")})`);
      if (/secret|token|password|api[_-]?key/i.test(`${credential.id} ${credential.name}`)) {
        fail(`${node.name} credential reference looks like a secret`);
      }
    }
    const keys = Object.keys(node.parameters ?? {});
    for (const key of keys) {
      if (!propertyNames.includes(key)) fail(`${node.name} parameter ${key} is not on the descriptor`);
    }
    for (const property of description.properties) {
      if (!shownFor(property, node.parameters, description.properties)) continue;
      if (property.required && (node.parameters?.[property.name] === undefined || node.parameters[property.name] === "")) {
        fail(`${node.name} is missing required parameter ${property.name}`);
      }
    }
    const operation = node.parameters?.operation;
    if (!optionValues.has(operation)) fail(`${node.name} operation ${operation} is not a descriptor option`);
    seenOperations.add(operation);
    const systemNameProperty = description.properties.find((property) => property.name === "systemName");
    if (shownFor(systemNameProperty, node.parameters, description.properties) && typeof node.parameters.systemName !== "string") {
      fail(`${node.name} systemName is not a string`);
    }
    const operationFields = {
      art50_disclosure: ["outputField", "inputField"],
      art12_hmac_log: ["inputField"],
      art14_ask_human: ["channel", "callbackBaseUrl", "actionName", "actionSummary"],
      scanDomain: ["domainOrUrl"],
    };
    for (const name of operationFields[operation] ?? []) {
      if (node.parameters?.[name] === undefined || node.parameters[name] === "") {
        fail(`${node.name} is missing required parameter ${name}`);
      }
    }
  }

  for (const value of optionValues) {
    if (!seenOperations.has(value)) fail(`workflow never sets operation ${value}`);
  }

  if (!workflowSource.includes("export async function executeSpurvikWorkflowStep")) {
    fail("executeSpurvikWorkflowStep is missing from workflow.ts");
  }
  if (!manifest.n8n?.nodes?.includes("dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js")) {
    fail("package.json n8n.nodes does not list SpurvikEuAiActGuard.node.js");
  }
  if (!manifest.n8n?.credentials?.includes("dist/credentials/SpurvikApi.credentials.js")) {
    fail("package.json n8n.credentials does not list SpurvikApi.credentials.js");
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

if (/404|not published|not on npm|stops at the registry/i.test(texts[0].text)) {
  fail("README still says the npm package is missing or that install stops at the registry");
}
if (!texts[0].text.includes("spurvikApi")) fail("README does not mention the spurvikApi credential");
if (!texts[0].text.includes("outputField")) fail("README does not mention outputField");
if (!texts[0].text.includes("executeSpurvikN8nGuard")) fail("README does not mention executeSpurvikN8nGuard");
if (/leaves out `rawInputText`|raw prompt is not stored|isn't stored|is not stored/i.test(texts[0].text)) {
  fail("README still says the raw prompt is not stored");
}

function npmJson(args) {
  const raw = execFileSync("npm", args, {
    encoding: "utf8",
    timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(raw);
}

function inspectPublishedVersion(version, scratch) {
  const url = npmJson(["view", `n8n-nodes-spurvik@${version}`, "dist.tarball", "--json"]);
  const tarball = join(scratch, `n8n-nodes-spurvik-${version}.tgz`);
  execFileSync("curl", ["-fsSL", "-o", tarball, url], {
    timeout: 30000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const listing = execFileSync("tar", ["-tzf", tarball], { encoding: "utf8" });
  const hasDist = listing.split("\n").includes("package/dist/index.js");
  const dist = execFileSync("tar", ["-xOf", tarball, "package/dist/index.js"], { encoding: "utf8" });
  const packed = JSON.parse(execFileSync("tar", ["-xOf", tarball, "package/package.json"], { encoding: "utf8" }));
  const distPath = join(scratch, `dist-${version}.js`);
  writeFileSync(distPath, dist);
  const exported = require(distPath);
  const guard = exported.SpurvikEuAiActGuard;
  const guardDefined = /function executeSpurvikN8nGuard|executeSpurvikN8nGuard\s*=/.test(dist);
  console.log(`- ${version} dist/index.js: ${hasDist ? "present" : "absent"}`);
  console.log(`- ${version} exports: ${Object.keys(exported).join(", ") || "(none)"}`);
  console.log(`- ${version} export index: ${typeof exported.index}`);
  console.log(`- ${version} SpurvikEuAiActGuard.execute: ${typeof guard?.prototype?.execute}`);
  console.log(`- ${version} calls executeSpurvikN8nGuard: ${dist.includes("executeSpurvikN8nGuard")}`);
  console.log(`- ${version} executeSpurvikN8nGuard defined: ${guardDefined}`);
  console.log(`- ${version} output copies incoming item: ${dist.includes("...itemJson")}`);
  console.log(`- ${version} n8n.credentials: ${JSON.stringify(packed.n8n?.credentials ?? null)}`);
  console.log(`- ${version} n8n.nodes: ${JSON.stringify(packed.n8n?.nodes ?? null)}`);
}

console.log("published package:");
const scratch = mkdtempSync(join(tmpdir(), "n8n-nodes-spurvik-"));
try {
  const view = npmJson(["view", "n8n-nodes-spurvik", "version", "dist-tags", "versions", "--json"]);
  console.log(`- npm version: ${view.version}`);
  console.log(`- dist-tags: ${JSON.stringify(view["dist-tags"])}`);
  console.log(`- versions: ${JSON.stringify(view.versions)}`);
  if ((view.versions ?? []).includes("0.0.0-stage")) {
    console.log("- 0.0.0-stage is a placeholder");
  }
  for (const version of ["1.0.0", "1.0.1"]) {
    if ((view.versions ?? []).includes(version)) inspectPublishedVersion(version, scratch);
  }
  console.log("- n8n 2.46.4 load error when index is missing: require(...).index is not a constructor");
  console.log("- this repository's 1.0.2 node file is dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(`- npm inspect failed: ${message}`);
  console.log("- JSON checks do not depend on the registry");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

const distJs = join(root, "packages/n8n-nodes-spurvik/dist/index.js");
console.log("repo package:");
console.log(`- git tree dist/index.js: ${existsSync(distJs) ? "present" : "absent; n8n installs the npm tarball"}`);
console.log(`- manifest credentials: ${JSON.stringify(manifest.n8n?.credentials ?? null)}`);
console.log(`- manifest scripts: ${JSON.stringify(manifest.scripts ?? null)}`);
console.log(`- manifest dependencies: ${JSON.stringify(manifest.dependencies ?? null)}`);
console.log("- source exports class SpurvikEuAiActGuard with execute(), and executeSpurvikWorkflowStep");

if (process.exitCode) {
  console.error("validation failed");
} else {
  console.log("validation passed");
}
