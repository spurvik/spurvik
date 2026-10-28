import { existsSync, realpathSync } from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import path from "node:path";
import {
  MISSING_ROOT,
  ROOT_MISSING_DIR,
  ROOT_NOT_ALLOWED,
  ROOT_NOT_PROJECT,
} from "./copy.js";

export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspacePathError";
  }
}

/** These block the directory and everything under it. */
const DESCENDANT_DIRS = ["/etc", "/usr", "/var", "/proc", "/sys", "/dev", "/bin", "/lib", "/opt", "/root"];

/**
 * Exact-match refusals. Compared after NFC, device-prefix stripping, slash folding, and lowercasing.
 * Bare drive roots such as `C:\` and `D:\` are refused separately. Subfolders such as `/tmp/proj` are not in this set.
 */
const EXACT_DIRS = [
  "/tmp",
  "/home",
  "/mnt",
  "/srv",
  "/run",
  "/boot",
  "/media",
  "/private",
  "/private/tmp",
  "/volumes",
  "/users",
  "c:/users",
];

/** Everything under these directories is refused. `/private/tmp/<proj>` stays allowed. */
const PRIVATE_TREES = ["/private/etc", "/private/var"];

/** `C:\Windows` and everything under it, including `C:\Windows\System32`. */
const WINDOWS_TREE = ["c:/windows"];

/** A `\\?\` or `\\.\` remainder that is a drive path, such as `C:` or `C:\proj`. */
const PLAIN_DRIVE = /^[A-Za-z]:(?:\/.*)?$/;

/**
 * `/home/<user>`, `/Users/<user>`, `C:\Users\<user>`, and WSL `/mnt/<drive>/Users/<user>`.
 * The user segment is group 1.
 */
const HOME_TREE = /^(?:\/home|\/users|[a-z]:\/users|\/mnt\/[a-z]\/users)\/([^/]+)(\/.*)?$/;

/**
 * NFC, fold slashes, collapse `.` and `..`, drop a trailing slash except `/`, then lower case.
 * A `\\?\` or `\\.\` prefix is removed only when the remainder is a plain drive path.
 * Other device and namespace forms are left in place so the root check can refuse them.
 */
export function comparablePath(input: string): string {
  let value = input.normalize("NFC").replaceAll("\\", "/");
  const prefix = value.toLowerCase();
  if (prefix.startsWith("//?/") || prefix.startsWith("//./")) {
    const rest = value.slice(4);
    if (PLAIN_DRIVE.test(rest)) value = rest;
  }
  value = collapseDotSegments(value);
  if (value.length > 1 && value.endsWith("/")) value = value.slice(0, -1);
  return value.toLowerCase();
}

/**
 * Drop `.` and collapse `..` before the root check. `//server` stays a UNC path.
 * A drive prefix, when present, stays in front.
 */
function collapseDotSegments(value: string): string {
  const unc = value.startsWith("//") && !value.startsWith("///");
  const drive = /^[A-Za-z]:/.exec(value)?.[0] ?? "";
  const body = drive ? value.slice(drive.length) : value;
  const absolute = unc || drive.length > 0 || body.startsWith("/");
  const stack: string[] = [];
  for (const part of body.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length > 0) stack.pop();
      else if (!absolute) stack.push("..");
      continue;
    }
    stack.push(part);
  }
  if (unc) return stack.length > 0 ? `//${stack.join("/")}` : "//";
  if (drive) return stack.length > 0 ? `${drive}/${stack.join("/")}` : drive;
  if (body.startsWith("/")) return `/${stack.join("/")}`;
  return stack.join("/") || ".";
}

/** `\\.\UNC\`, `\\.\pipe\`, `\\?\GLOBALROOT\`, and any other `\\.\` or `\\?\` path that is not a drive. */
function isNonDriveDevicePath(input: string): boolean {
  const value = input.normalize("NFC").replaceAll("\\", "/");
  const prefix = value.toLowerCase();
  if (!prefix.startsWith("//?/") && !prefix.startsWith("//./")) return false;
  return !PLAIN_DRIVE.test(value.slice(4));
}

function homeUser(comparable: string): string | undefined {
  return comparable.match(HOME_TREE)?.[1];
}

function accountHomes(): string[] {
  const homes: string[] = [];
  const seen = new Set<string>();
  const add = (value: string | undefined) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    homes.push(value);
  };
  add(homedir());
  try {
    add(userInfo().homedir);
  } catch {
    // No passwd entry. homedir() above still applies.
  }
  return homes;
}

function accountUsername(): string | undefined {
  try {
    const name = userInfo().username.trim().toLowerCase();
    return name || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Homes from `os.homedir()` and `os.userInfo().homedir`, plus each real path.
 * `HOME` alone is not the account home: a project under `/home/<you>` stays
 * allowed when `HOME` points somewhere else.
 */
function homeKeys(): string[] {
  const keys = new Set<string>();
  for (const raw of accountHomes()) {
    keys.add(comparablePath(raw));
    try {
      keys.add(comparablePath(realpathSync(raw)));
    } catch {
      // Home may be missing. The raw value above still applies.
    }
  }
  return [...keys];
}

/** The process account only. The Windows profile name is not one of these users. */
function accountUsers(): Set<string> {
  const users = new Set<string>();
  const username = accountUsername();
  if (username) users.add(username);
  for (const home of homeKeys()) {
    const user = homeUser(home);
    if (user) users.add(user);
  }
  return users;
}

/** `/mnt/<drive>/Users/<name>`, and `C:\Users\<name>` only when this process is Windows. */
function windowsProfileApplies(comparable: string): boolean {
  if (/^\/mnt\/[a-z]\/users\/[^/]+(?:\/|$)/.test(comparable)) return true;
  return process.platform === "win32" && /^[a-z]:\/users\/[^/]+(?:\/|$)/.test(comparable);
}

/**
 * A Windows profile name from `USERPROFILE` or `LOCALAPPDATA`, when one of those is set.
 * A Linux process usually has neither, so a WSL path is matched to the process user only.
 */
function windowsProfileUser(): string | undefined {
  const profile = process.env.USERPROFILE?.trim();
  if (profile) {
    const user = comparablePath(profile).match(/^(?:[a-z]:\/users|\/mnt\/[a-z]\/users)\/([^/]+)(?:\/|$)/)?.[1];
    if (user && user !== "public") return user;
  }
  const local = process.env.LOCALAPPDATA?.trim();
  if (!local) return undefined;
  const comparable = comparablePath(local);
  if (!comparable.endsWith("/appdata/local")) return undefined;
  const user = comparable.match(/^(?:[a-z]:\/users|\/mnt\/[a-z]\/users)\/([^/]+)\/appdata\/local$/)?.[1];
  if (!user || user === "public") return undefined;
  return user;
}

/** Another user's home and everything under it. This user's `~/code` stays allowed. */
function isOtherUserHome(comparable: string): boolean {
  const user = homeUser(comparable);
  if (!user) return false;
  // `Public` is a shared Windows folder, not another person's home.
  if (user === "public" && /^\/mnt\/[a-z]\/users\/public(?:\/|$)/.test(comparable)) return false;
  const users = accountUsers();
  if (windowsProfileApplies(comparable)) {
    const windows = windowsProfileUser();
    if (windows) users.add(windows);
  }
  return !users.has(user);
}

/** `os.homedir()`, the account home, and the Windows profile home when that name applies. */
function dotHomeKeys(): string[] {
  const keys = new Set<string>(homeKeys());
  const name = windowsProfileUser();
  if (!name) return [...keys];
  for (const letter of "abcdefghijklmnopqrstuvwxyz") {
    keys.add(`/mnt/${letter}/users/${name}`);
    if (process.platform === "win32") keys.add(`${letter}:/users/${name}`);
  }
  return [...keys];
}

function isOwnHomeOrDot(comparable: string): boolean {
  for (const home of dotHomeKeys()) {
    if (!home || home === "/") continue;
    if (comparable === home) return true;
    const prefix = `${home}/`;
    if (!comparable.startsWith(prefix)) continue;
    const first = comparable.slice(prefix.length).split("/")[0] ?? "";
    if (first.startsWith(".")) return true;
  }
  return false;
}

/** `AppData` directly under a home (`C:\Users\<x>\AppData`, `~/AppData`), including its contents. */
function isAppDataUnderHome(comparable: string): boolean {
  if (/^(?:\/home|\/users|[a-z]:\/users|\/mnt\/[a-z]\/users)\/[^/]+\/appdata(?:\/|$)/.test(comparable)) return true;
  for (const home of homeKeys()) {
    if (!home || home === "/") continue;
    if (comparable === `${home}/appdata` || comparable.startsWith(`${home}/appdata/`)) return true;
  }
  return false;
}

function isSystemTree(comparable: string): boolean {
  for (const dir of [...WINDOWS_TREE, ...PRIVATE_TREES, ...DESCENDANT_DIRS]) {
    if (comparable === dir || comparable.startsWith(`${dir}/`)) return true;
  }
  return false;
}

/** macOS temp lives under `/var` and `/private/var`. Only those two shapes may be lifted. */
function isVarFoldersPath(comparable: string): boolean {
  return comparable === "/var/folders" || comparable.startsWith("/var/folders/");
}

function isPrivateVarFoldersPath(comparable: string): boolean {
  return comparable === "/private/var/folders" || comparable.startsWith("/private/var/folders/");
}

/** `AppData\Local\Temp` is the Windows temp rule the allowance may lift. Other AppData stays refused. */
function isWindowsLocalTempPath(comparable: string): boolean {
  return /^(?:\/home|\/users|[a-z]:\/users|\/mnt\/[a-z]\/users)\/[^/]+\/appdata\/local\/temp(?:\/|$)/.test(comparable);
}

function localAppDataTemp(): string | undefined {
  const local = process.env.LOCALAPPDATA?.trim();
  if (!local) return undefined;
  const base = comparablePath(local);
  if (!base || base === "/") return undefined;
  return `${base}/temp`;
}

/** macOS temp is only `/var/folders/<xx>/<hash>/T` or the `/private/var/folders` form of that. */
const MACOS_TEMP = /^\/(?:private\/)?var\/folders\/[^/]+\/[^/]+\/t$/;

/**
 * A real platform temp directory: `/tmp`, `/var/tmp`, macOS `/<xx>/<hash>/T`
 * under `/var/folders` or `/private/var/folders`, or `%LOCALAPPDATA%\Temp`.
 */
export function isPlatformTempLocation(comparable: string): boolean {
  if (!comparable || comparable === "/") return false;
  if (comparable === "/tmp" || comparable === "/var/tmp" || comparable === "/private/tmp") return true;
  if (MACOS_TEMP.test(comparable)) return true;
  if (isWindowsLocalTempPath(comparable) && /\/appdata\/local\/temp$/.test(comparable)) return true;
  const fromEnv = localAppDataTemp();
  return fromEnv !== undefined && comparable === fromEnv;
}

/** Raw `os.tmpdir()` and its real path. A missing directory keeps the raw path. */
function tmpdirCandidates(): string[] {
  const raw = tmpdir();
  if (!raw) return [];
  const keys = new Set<string>();
  const rawKey = comparablePath(raw);
  if (rawKey && rawKey !== "/") keys.add(rawKey);
  try {
    const resolved = comparablePath(realpathSync(raw));
    if (resolved && resolved !== "/") keys.add(resolved);
  } catch {
    // Not on disk. The raw value above still applies.
  }
  return [...keys];
}

/**
 * Roots the temp allowance may use. Empty when `os.tmpdir()` is missing or does not
 * resolve to a platform temp directory, so a nonexistent path or `TMPDIR=/etc` grants nothing.
 */
function qualifiedTempRoots(): string[] {
  const raw = tmpdir();
  if (!raw) return [];
  let resolved: string;
  try {
    resolved = realpathSync(raw);
  } catch {
    return [];
  }
  const resolvedKey = comparablePath(resolved);
  if (!resolvedKey || !isPlatformTempLocation(resolvedKey)) return [];
  const keys = new Set<string>([resolvedKey]);
  const rawKey = comparablePath(raw);
  if (rawKey && rawKey !== "/" && isPlatformTempLocation(rawKey)) keys.add(rawKey);
  return [...keys];
}

function isBareTmpdir(comparable: string): boolean {
  return tmpdirCandidates().includes(comparable);
}

function isUnderQualifiedTemp(comparable: string): boolean {
  for (const root of qualifiedTempRoots()) {
    if (comparable.startsWith(`${root}/`)) return true;
  }
  return false;
}

/**
 * A strict subfolder of a real platform temp directory, and only where the block
 * is `/var/folders`, `/private/var/folders`, or `AppData\Local\Temp`.
 */
function tempAllowanceApplies(comparable: string): boolean {
  if (isBareTmpdir(comparable) || !isUnderQualifiedTemp(comparable)) return false;
  return isVarFoldersPath(comparable) || isPrivateVarFoldersPath(comparable) || isWindowsLocalTempPath(comparable);
}

/**
 * `/`, this user's home, a dot-folder directly under that home, another user's home,
 * AppData directly under a home, non-drive `\\?\` and `\\.\` paths, UNC paths,
 * and the system blocklist. Those refusals run before the temp allowance.
 * The allowance never lifts them. It only lifts `/var/folders`, `/private/var/folders`,
 * and `AppData\Local\Temp` for a subfolder of a real platform temp directory.
 * The temp directory itself stays refused.
 */
export function isForbiddenRoot(real: string): boolean {
  if (isNonDriveDevicePath(real)) return true;
  const comparable = comparablePath(real);
  if (comparable === "/" || comparable === "") return true;
  if (/^[a-z]:$/.test(comparable)) return true;
  if (comparable.startsWith("//") && comparable !== "//") return true;
  if (EXACT_DIRS.includes(comparable)) return true;
  if (isBareTmpdir(comparable)) return true;
  if (isOtherUserHome(comparable)) return true;
  if (isOwnHomeOrDot(comparable)) return true;
  if (isSystemTree(comparable)) {
    if (tempAllowanceApplies(comparable)) return false;
    return true;
  }
  if (isAppDataUnderHome(comparable)) {
    if (tempAllowanceApplies(comparable)) return false;
    return true;
  }
  return false;
}

export function hasProjectMarker(real: string): boolean {
  return (
    existsSync(path.join(real, "package.json")) ||
    existsSync(path.join(real, ".git")) ||
    existsSync(path.join(real, "pnpm-workspace.yaml"))
  );
}

/** Real path of a project root. Refuses a missing, forbidden, or unmarked directory. */
export function validateWorkspaceRoot(requested: string): string {
  const trimmed = requested.trim();
  if (!trimmed || trimmed.includes("\0")) throw new WorkspacePathError(ROOT_MISSING_DIR);
  if (isForbiddenRoot(trimmed)) throw new WorkspacePathError(ROOT_NOT_ALLOWED);
  let real: string;
  try {
    real = realpathSync(trimmed);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new WorkspacePathError(ROOT_MISSING_DIR);
    throw new WorkspacePathError(ROOT_MISSING_DIR);
  }
  if (isForbiddenRoot(real)) throw new WorkspacePathError(ROOT_NOT_ALLOWED);
  if (!hasProjectMarker(real)) throw new WorkspacePathError(ROOT_NOT_PROJECT);
  return real;
}

function rootFromArgv(argv: readonly string[]): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") {
      const value = argv[index + 1];
      return value && !value.startsWith("--") ? value : "";
    }
    if (arg?.startsWith("--root=")) return arg.slice("--root=".length);
  }
  return undefined;
}

/** `--root` wins. Otherwise `SPURVIK_MCP_ROOT`. Missing and blank values are refused. */
export function resolveConfiguredRoot(argv: readonly string[], env: NodeJS.ProcessEnv): string {
  const fromArg = rootFromArgv(argv);
  const requested = fromArg !== undefined ? fromArg : env.SPURVIK_MCP_ROOT;
  if (typeof requested !== "string" || !requested.trim()) throw new WorkspacePathError(MISSING_ROOT);
  return validateWorkspaceRoot(requested);
}
