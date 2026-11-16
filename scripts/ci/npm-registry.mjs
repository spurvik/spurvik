import { execFileSync } from "node:child_process";

/**
 * True when name@version is on the npm registry, false on E404. Any other failure (network, auth) throws,
 * so a gate that depends on this answer never passes by accident.
 */
export function isPublishedOnNpm(name, version) {
  try {
    const out = execFileSync("npm", ["view", `${name}@${version}`, "version", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
    return out !== "" && JSON.parse(out) === version;
  } catch (error) {
    if (/\bE404\b/.test(`${error.stdout ?? ""}${error.stderr ?? ""}`)) return false;
    throw error;
  }
}

/** The `latest` dist-tag version of a package on the npm registry. */
export function latestOnNpm(name) {
  return JSON.parse(
    execFileSync("npm", ["view", name, "version", "--json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(),
  );
}
