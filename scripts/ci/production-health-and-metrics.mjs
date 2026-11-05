import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const ENDPOINTS = [
  "https://spurvik.com",
  "https://spurvik.com/docs",
  "https://spurvik.com/terms",
  "https://spurvik.com/privacy",
  "https://console.spurvik.com/sandbox",
  "https://console.spurvik.com/labels",
  "https://console.spurvik.com/signup?plan=pro",
  "https://console.spurvik.com/api/status",
];

const NPM_PACKAGES = [
  "spurvik",
  "spurvik-sdk",
  "spurvik-mcp-server",
  "n8n-nodes-spurvik",
];

async function checkEndpoint(url) {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    return {
      url,
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      latencyMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    return {
      url,
      ok: false,
      status: 0,
      latencyMs: Math.round(performance.now() - start),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function checkNpmPackage(pkg) {
  try {
    const [meta, week, day] = await Promise.all([
      fetch(`https://registry.npmjs.org/${pkg}/latest`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json()),
      fetch(`https://api.npmjs.org/downloads/point/last-week/${pkg}`, { signal: AbortSignal.timeout(5000) })
        .then((r) => r.json())
        .catch(() => ({})),
      fetch(`https://api.npmjs.org/downloads/point/last-day/${pkg}`, { signal: AbortSignal.timeout(5000) })
        .then((r) => r.json())
        .catch(() => ({})),
    ]);
    return {
      pkg,
      latest: meta.version ?? "unknown",
      downloadsWeek: week.downloads ?? 0,
      downloadsDay: day.downloads ?? 0,
    };
  } catch {
    return { pkg, latest: "unreachable", downloadsWeek: 0, downloadsDay: 0 };
  }
}

function getLocalGitInfo() {
  try {
    const sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    const subject = execFileSync("git", ["log", "-1", "--pretty=%s"], { cwd: root, encoding: "utf8" }).trim();
    return { sha, subject };
  } catch {
    return { sha: "unknown", subject: "" };
  }
}

async function main() {
  const [endpoints, npmStats] = await Promise.all([
    Promise.all(ENDPOINTS.map(checkEndpoint)),
    Promise.all(NPM_PACKAGES.map(checkNpmPackage)),
  ]);
  const git = getLocalGitInfo();
  const totalWeek = npmStats.reduce((sum, item) => sum + item.downloadsWeek, 0);
  const totalDay = npmStats.reduce((sum, item) => sum + item.downloadsDay, 0);

  console.log(`=== Spurvik Production Health & Traction Audit (${new Date().toISOString()}) ===`);
  console.log(`Git HEAD: ${git.sha} — ${git.subject}\n`);

  console.log("Production Endpoints:");
  let failedEndpoints = 0;
  for (const ep of endpoints) {
    const mark = ep.ok ? "✓" : "✗";
    if (!ep.ok) failedEndpoints += 1;
    console.log(`  ${mark} [${ep.status}] ${ep.url} (${ep.latencyMs}ms)`);
  }

  console.log(`\nnpm Packages (Total: ${totalWeek}/week · ${totalDay}/day):`);
  for (const item of npmStats) {
    console.log(`  • ${item.pkg}@${item.latest}: ${item.downloadsWeek}/week (${item.downloadsDay}/day)`);
  }

  if (failedEndpoints > 0) {
    console.error(`\nERROR: ${failedEndpoints} production endpoint(s) failed health check.`);
    process.exitCode = 1;
  }
}

main();
