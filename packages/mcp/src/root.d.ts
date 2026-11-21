export declare class WorkspacePathError extends Error {
    constructor(message: string);
}
/**
 * NFC, fold slashes, collapse `.` and `..`, drop a trailing slash except `/`, then lower case.
 * A `\\?\` or `\\.\` prefix is removed only when the remainder is a plain drive path.
 * Other device and namespace forms are left in place so the root check can refuse them.
 */
export declare function comparablePath(input: string): string;
/**
 * A real platform temp directory: `/tmp`, `/var/tmp`, macOS `/<xx>/<hash>/T`
 * under `/var/folders` or `/private/var/folders`, or `%LOCALAPPDATA%\Temp`.
 */
export declare function isPlatformTempLocation(comparable: string): boolean;
/**
 * `/`, this user's home, a dot-folder directly under that home, another user's home,
 * AppData directly under a home, non-drive `\\?\` and `\\.\` paths, UNC paths,
 * and the system blocklist. Those refusals run before the temp allowance.
 * The allowance never lifts them. It only lifts `/var/folders`, `/private/var/folders`,
 * and `AppData\Local\Temp` for a subfolder of a real platform temp directory.
 * The temp directory itself stays refused.
 */
export declare function isForbiddenRoot(real: string): boolean;
export declare function hasProjectMarker(real: string): boolean;
/** Real path of a project root. Refuses a missing, forbidden, or unmarked directory. */
export declare function validateWorkspaceRoot(requested: string): string;
/** `--root` wins. Otherwise `SPURVIK_MCP_ROOT`. Missing and blank values are refused. */
export declare function resolveConfiguredRoot(argv: readonly string[], env: NodeJS.ProcessEnv): string;
