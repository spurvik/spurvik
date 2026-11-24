import { DIRECTORY_FIELD, FIND_DESCRIPTION, PATH_OUTSIDE, PATH_TRAVERSAL } from "../copy.js";
import { WorkspacePathError } from "../root.js";
export { DIRECTORY_FIELD, FIND_DESCRIPTION, PATH_OUTSIDE, PATH_TRAVERSAL, WorkspacePathError };
export declare const DEFAULT_MAX_FILES = 4000;
export declare const DEFAULT_MAX_FINDINGS = 200;
export declare const MAX_FILE_BYTES: number;
export declare const MAX_DEPTH = 32;
export declare const SCAN_BUDGET_MS = 20000;
export interface UnwrappedFinding {
    file: string;
    line: number;
    call: string;
}
export interface ScanReport {
    directory: string;
    filesScanned: number;
    findings: UnwrappedFinding[];
    truncated: boolean;
    timedOut: boolean;
    depthLimited: boolean;
    /** True when the time, depth, or count limit stopped the scan. */
    partial: boolean;
    depthLimit: number;
    skippedOutside: number;
    skippedLarge: number;
    skippedHardLinks: number;
}
export interface ScanOptions {
    maxFiles?: number;
    maxFindings?: number;
    maxDepth?: number;
    maxFileBytes?: number;
    deadlineMs?: number;
    now?: () => number;
    readFile?: (file: string) => string;
    realpath?: (file: string) => string;
}
export interface MatchControl {
    shouldStop?: () => boolean;
    stopped?: {
        value: boolean;
    };
    /** Test builds read this. One count per character or stack step the matcher takes. */
    steps?: {
        count: number;
    };
}
/** NFC then lower case, so `NODE_MODULES` and `.ENV` compare the same way. */
export declare function normalizePathName(name: string): string;
/**
 * NFKC, drop Unicode Default_Ignorable_Code_Point characters, then strip leading and trailing whitespace.
 * Trailing dots are removed. A run of leading dots is collapsed to one so `.env` stays a dotfile.
 */
export declare function normalizeScanSegment(name: string): string;
export declare function isExcludedDirName(name: string): boolean;
export declare function isSensitiveBase(name: string, platform?: NodeJS.Platform): boolean;
export declare function isExcludedRealPath(root: string, real: string): boolean;
/**
 * One forward pass. Bracket depth is a stack plus an anonymous-brace counter.
 * The deadline is checked at least every 4 KB and every 256 tokens.
 * Line numbers start at 1 and count every newline, including comments and strings.
 * The walk reads .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, and .cts. It does not read .md or .mdc.
 */
export declare function findUnwrappedInSource(source: string, control?: MatchControl): Array<{
    line: number;
    call: string;
}>;
/**
 * Heuristic Python (.py) unwrapped AI client scanner matching hosted /api/mcp.
 * Clears findings when the file already imports or calls spurvik_guard helpers.
 */
export declare function findUnwrappedPythonInSource(source: string, pathHint?: string, control?: MatchControl): Array<{
    line: number;
    call: string;
}>;
/** Resolve a user directory and reject traversal, sensitive names, and paths outside `workspaceRoot`. */
export declare function resolveScanDirectory(workspaceRoot: string, requested: string): string;
export declare function scanForUnwrappedCalls(workspaceRoot: string, directory: string, options?: ScanOptions): ScanReport;
export declare function formatScanReport(report: ScanReport): string;
export declare function scanWorkspace(workspaceRoot: string, directory: string): string;
