import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(relPath) {
  return JSON.parse(readFileSync(join(root, relPath), "utf8"));
}

function assertNonEmptyFile(relPath) {
  const full = join(root, relPath);
  assert.equal(existsSync(full), true, `Missing required build artifact: ${relPath}`);
  const size = statSync(full).size;
  assert.equal(size > 0, true, `Empty build artifact: ${relPath}`);
}

export function verifyReleaseIntegrity() {
  const sdkPkg = readJson("packages/sdk/package.json");
  const spurvikPkg = readJson("packages/spurvik/package.json");
  const n8nPkg = readJson("packages/n8n-nodes-spurvik/package.json");

  assert.equal(
    sdkPkg.version,
    spurvikPkg.version,
    `Version mismatch: packages/sdk (${sdkPkg.version}) !== packages/spurvik (${spurvikPkg.version})`,
  );
  assert.deepEqual(
    sdkPkg.exports,
    spurvikPkg.exports,
    "Exports mismatch between packages/sdk/package.json and packages/spurvik/package.json",
  );

  for (const pkgDir of ["packages/sdk", "packages/spurvik"]) {
    for (const [subpath, targets] of Object.entries(sdkPkg.exports)) {
      for (const [condition, relTarget] of Object.entries(targets)) {
        const cleanRel = String(relTarget).replace(/^\.\//, "");
        assertNonEmptyFile(`${pkgDir}/${cleanRel}`);
        if (condition === "types" && cleanRel.endsWith(".d.ts")) {
          const dcts = cleanRel.replace(/\.d\.ts$/, ".d.cts");
          assertNonEmptyFile(`${pkgDir}/${dcts}`);
        }
      }
      void subpath;
    }
  }

  for (const relNode of n8nPkg.n8n?.nodes ?? []) {
    assertNonEmptyFile(`packages/n8n-nodes-spurvik/${relNode}`);
  }
  for (const relCred of n8nPkg.n8n?.credentials ?? []) {
    assertNonEmptyFile(`packages/n8n-nodes-spurvik/${relCred}`);
  }
  assertNonEmptyFile("packages/n8n-nodes-spurvik/dist/nodes/SpurvikEuAiActGuard/spurvik.svg");

  const loadedNode = require(
    join(root, "packages/n8n-nodes-spurvik/dist/nodes/SpurvikEuAiActGuard/SpurvikEuAiActGuard.node.js"),
  );
  assert.equal(typeof loadedNode.SpurvikEuAiActGuard, "function", "SpurvikEuAiActGuard class export missing");
  assert.equal(
    typeof loadedNode.SpurvikEuAiActGuard.prototype.execute,
    "function",
    "SpurvikEuAiActGuard.prototype.execute missing",
  );

  const loadedCred = require(
    join(root, "packages/n8n-nodes-spurvik/dist/credentials/SpurvikApi.credentials.js"),
  );
  assert.equal(typeof loadedCred.SpurvikApi, "function", "SpurvikApi credential class export missing");

  console.log(
    `verify-release-integrity: OK (spurvik@${spurvikPkg.version}, spurvik-sdk@${sdkPkg.version}, n8n-nodes-spurvik@${n8nPkg.version})`,
  );
}

verifyReleaseIntegrity();
