import * as fs from "node:fs";
import path from "node:path";
import {
  DIRECTORY_FIELD,
  FIND_DESCRIPTION,
  PATH_EMPTY,
  PATH_EXCLUDED,
  PATH_INVALID,
  PATH_MISSING,
  PATH_NOT_DIRECTORY,
  PATH_OUTSIDE,
  PATH_SENSITIVE,
  PATH_TRAVERSAL,
  SCAN_COUNT_LIMIT,
  SCAN_DEPTH_LIMIT,
  SCAN_TIME_LIMIT,
} from "../copy.js";
import { validateWorkspaceRoot, WorkspacePathError } from "../root.js";

export { DIRECTORY_FIELD, FIND_DESCRIPTION, PATH_OUTSIDE, PATH_TRAVERSAL, WorkspacePathError };

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"]);
const EXCLUDED_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next"]);
export const DEFAULT_MAX_FILES = 4_000;
export const DEFAULT_MAX_FINDINGS = 200;
export const MAX_FILE_BYTES = 512 * 1024;
export const MAX_DEPTH = 32;
export const SCAN_BUDGET_MS = 20_000;
const DEADLINE_BYTES = 4_096;
const DEADLINE_TOKENS = 256;

const CALL_CHAINS: ReadonlyArray<{ ids: readonly string[]; label: string }> = [
  { ids: ["chat", "completions", "create"], label: "chat.completions.create" },
  { ids: ["chat", "completions", "parse"], label: "chat.completions.parse" },
  { ids: ["chat", "completions", "stream"], label: "chat.completions.stream" },
  { ids: ["responses", "create"], label: "responses.create" },
  { ids: ["responses", "parse"], label: "responses.parse" },
  { ids: ["responses", "stream"], label: "responses.stream" },
  { ids: ["messages", "create"], label: "messages.create" },
  { ids: ["messages", "parse"], label: "messages.parse" },
  { ids: ["messages", "stream"], label: "messages.stream" },
  { ids: ["models", "generateContentStream"], label: "models.generateContentStream" },
  { ids: ["models", "generateContent"], label: "models.generateContent" },
  { ids: ["sendMessageStream"], label: "sendMessageStream" },
  { ids: ["sendMessage"], label: "sendMessage" },
];

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
  stopped?: { value: boolean };
  /** Test builds read this. One count per character or stack step the matcher takes. */
  steps?: { count: number };
}

interface RecentTok {
  kind: "id" | "op";
  value: string;
}

interface FnFrame {
  name: string;
  anonAtPush: number;
  returnsClient: boolean;
  returnsMiddleware: boolean;
  parent: FnFrame | null;
}

interface ParenFrame {
  kind: "gen" | "wrap" | "plain";
  callee: string;
  line: number;
  assignTo: string | null;
  arrowName: string | null;
  fnName: string | null;
  recentMark: number;
  sawMiddleware: boolean;
  modelWrapped: boolean;
  modelDone: boolean;
  sawModelKey: boolean;
  expectValue: boolean;
  pendingWrap: boolean;
  reportsTo: ParenFrame | null;
}

/** NFC then lower case, so `NODE_MODULES` and `.ENV` compare the same way. */
export function normalizePathName(name: string): string {
  return name.normalize("NFC").toLowerCase();
}

const DEFAULT_IGNORABLE = /\p{Default_Ignorable_Code_Point}/gu;

/**
 * NFKC, drop Unicode Default_Ignorable_Code_Point characters, then strip leading and trailing whitespace.
 * Trailing dots are removed. A run of leading dots is collapsed to one so `.env` stays a dotfile.
 */
export function normalizeScanSegment(name: string): string {
  let value = name.normalize("NFKC").replace(DEFAULT_IGNORABLE, "");
  value = value.replace(/^[\s]+|[\s]+$/gu, "");
  value = value.replace(/\.+$/u, "");
  value = value.replace(/^[\s]+|[\s]+$/gu, "");
  return value.replace(/^\.+/, ".");
}

function hasAlternateDataMark(name: string): boolean {
  return name.includes(":") && !/^[A-Za-z]:$/.test(name);
}

export function isExcludedDirName(name: string): boolean {
  return EXCLUDED_DIRS.has(normalizePathName(normalizeScanSegment(name)));
}

export function isSensitiveBase(name: string, platform: NodeJS.Platform = process.platform): boolean {
  if (hasAlternateDataMark(name)) return true;
  const base = normalizePathName(normalizeScanSegment(name));
  if (platform === "win32" && /~\d/.test(base)) return true;
  return (
    base === ".env" ||
    base.startsWith(".env.") ||
    base === ".npmrc" ||
    base.endsWith(".pem") ||
    base.endsWith(".key") ||
    base.startsWith("id_rsa") ||
    base === ".ssh" ||
    base === ".aws"
  );
}

function pathSegments(value: string): string[] {
  return value.split(/[\\/]+/).filter((segment) => segment.length > 0);
}

/** Segments of `real` that sit strictly inside `root`. Ancestors of the workspace are ignored. */
function segmentsBelowRoot(root: string, real: string): string[] {
  const relative = path.relative(root, real);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return [];
  return pathSegments(relative);
}

/**
 * Relative link text is checked in full, so `../.env/a.ts` is not followed.
 * An absolute target uses only the segments below `root`, same as a resolved path.
 */
function linkTextIsSensitive(target: string, root?: string): boolean {
  if (root && path.isAbsolute(target)) return pathHasSensitiveSegment(root, target);
  return pathSegments(target).some((segment) => isSensitiveBase(segment));
}

function pathHasSensitiveSegment(root: string, real: string): boolean {
  return segmentsBelowRoot(root, real).some((segment) => isSensitiveBase(segment));
}

export function isExcludedRealPath(root: string, real: string): boolean {
  return segmentsBelowRoot(root, real).some((part) => isExcludedDirName(part));
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isIdentStart(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_" || ch === "$";
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || (ch >= "0" && ch <= "9");
}

function depthSentence(limit: number): string {
  if (limit === MAX_DEPTH) return SCAN_DEPTH_LIMIT;
  return `The scan stopped at its depth limit (${limit}). Some folders were not scanned.`;
}

/**
 * One forward pass. Bracket depth is a stack plus an anonymous-brace counter.
 * The deadline is checked at least every 4 KB and every 256 tokens.
 * Line numbers start at 1 and count every newline, including comments and strings.
 * The walk reads .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, and .cts. It does not read .md or .mdc.
 */
export function findUnwrappedInSource(
  source: string,
  control?: MatchControl,
): Array<{ line: number; call: string }> {
  const findings: Array<{ line: number; call: string }> = [];
  const seen = new Set<string>();
  const names = new Set<string>();
  const factories = new Set<string>();
  const middlewareNames = new Set<string>();
  const models = new Set<string>();
  const recent: RecentTok[] = [];
  const parens: ParenFrame[] = [];
  const fnStack: FnFrame[] = [];
  let anonDepth = 0;
  let line = 1;
  let index = 0;
  let steps = 0;
  const charge = (): void => {
    steps += 1;
  };
  let nextDeadlineCheck = 0;
  let tokensSinceCheck = 0;
  let stopped = false;
  let expectFnName = false;
  let fnName: string | null = null;
  let expectFnBrace: string | null = null;
  let arrowPending: string | null = null;
  let pendingLhs: string | null = null;
  let pendingCall: { lhs: string; kind: "withSpurvik" | "spurvikMiddleware" } | null = null;
  let pendingWrapAssign: string | null = null;
  let returnWait = false;
  let returnIdent: string | null = null;
  let lastClosedCall = "";
  let lastClosedArrowName: string | null = null;
  const stateGraphLines: number[] = [];
  const interruptLines: number[] = [];
  let sawLangGraphWrap = false;
  let sawInterruptWrap = false;
  const clientWrappers = new Set([
    "withSpurvik",
    "withSpurvikLangGraph",
    "withSpurvikModel",
    "withSpurvikModelProvider",
    "spurvikInterrupt",
    "resolveLangGraphInterrupts",
  ]);

  const add = (atLine: number, call: string) => {
    const key = `${atLine}:${call}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ line: atLine, call });
  };

  const budgetReached = (): boolean => {
    if (stopped) return true;
    if (index < nextDeadlineCheck && tokensSinceCheck < DEADLINE_TOKENS) return false;
    nextDeadlineCheck = index + DEADLINE_BYTES;
    tokensSinceCheck = 0;
    if (!control?.shouldStop?.()) return false;
    stopped = true;
    if (control.stopped) control.stopped.value = true;
    return true;
  };

  const tick = (): boolean => {
    tokensSinceCheck += 1;
    return budgetReached();
  };

  const pushRecent = (tok: RecentTok) => {
    recent.push(tok);
  };

  const topFn = (): FnFrame | undefined => fnStack[fnStack.length - 1];

  const markClient = () => {
    const fn = topFn();
    if (fn) fn.returnsClient = true;
  };

  const markMiddleware = () => {
    const fn = topFn();
    if (fn) fn.returnsMiddleware = true;
  };

  const popFn = (fn: FnFrame) => {
    if (fn.returnsClient) factories.add(fn.name);
    if (fn.returnsMiddleware) middlewareNames.add(fn.name);
    if (fn.parent) {
      if (fn.returnsClient) fn.parent.returnsClient = true;
      if (fn.returnsMiddleware) fn.parent.returnsMiddleware = true;
    }
  };

  const openBrace = (name: string | null) => {
    if (name) {
      fnStack.push({
        name,
        anonAtPush: anonDepth,
        returnsClient: false,
        returnsMiddleware: false,
        parent: topFn() ?? null,
      });
      return;
    }
    anonDepth += 1;
  };

  const closeBrace = () => {
    const top = topFn();
    if (top && anonDepth === top.anonAtPush) {
      fnStack.pop();
      popFn(top);
      return;
    }
    if (anonDepth > 0) anonDepth -= 1;
  };

  const noteMiddleware = (value: string) => {
    if (value !== "spurvikMiddleware" && !middlewareNames.has(value)) return;
    for (let cursor = parens.length - 1; cursor >= 0; cursor -= 1) {
      charge();
      const frame = parens[cursor];
      if (frame?.kind === "wrap") {
        frame.sawMiddleware = true;
        return;
      }
    }
  };

  const dotted = (): { idents: string[]; before: RecentTok | null } => {
    const idents: string[] = [];
    let cursor = recent.length - 1;
    while (cursor >= 0 && recent[cursor]?.kind === "id") {
      charge();
      const tok = recent[cursor];
      if (!tok) break;
      idents.push(tok.value);
      if (recent[cursor - 1]?.value !== ".") break;
      const next = cursor - 2;
      if (recent[next]?.kind !== "id") break;
      cursor = next;
    }
    idents.reverse();
    let beforeIndex = cursor - 1;
    if (recent[beforeIndex]?.value === ".") beforeIndex -= 1;
    return { idents, before: recent[beforeIndex] ?? null };
  };

  const receiverOf = (idents: string[], chainStart: number, before: RecentTok | null): { kind: "ident" | "call" | "other"; name: string } => {
    if (chainStart > 0) return { kind: "ident", name: idents[chainStart - 1] ?? "" };
    if (before?.value === ")") return { kind: "call", name: lastClosedCall };
    if (before?.kind === "id") return { kind: "ident", name: before.value };
    return { kind: "other", name: "" };
  };

  const assignmentNameBefore = (from: number): string | null => {
    let cursor = from;
    if (recent[cursor]?.value === "async") cursor -= 1;
    if (recent[cursor]?.value !== "=") return null;
    const name = recent[cursor - 1];
    const decl = recent[cursor - 2];
    if (name?.kind !== "id" || !decl) return null;
    if (decl.value !== "const" && decl.value !== "let" && decl.value !== "var") return null;
    return name.value;
  };

  const closeParen = (frame: ParenFrame) => {
    recent.length = frame.recentMark;
    pushRecent({ kind: "op", value: ")" });
    lastClosedCall = frame.callee;
    lastClosedArrowName = frame.arrowName;
    if (frame.fnName) expectFnBrace = frame.fnName;
    if (frame.kind === "wrap") {
      if (frame.sawMiddleware && frame.assignTo) models.add(frame.assignTo);
      if (frame.reportsTo && frame.sawMiddleware) frame.reportsTo.modelWrapped = true;
    }
    if (frame.kind === "gen" && !frame.modelWrapped) add(frame.line, frame.callee);
  };

  const openParen = (callee: string) => {
    const { idents, before } = dotted();
    let matched: { label: string; start: number } | null = null;
    if (callee !== "generateText" && callee !== "streamText") {
      for (const chain of CALL_CHAINS) {
        const start = idents.length - chain.ids.length;
        if (start < 0) continue;
        let same = true;
        for (let cursor = 0; cursor < chain.ids.length; cursor += 1) {
          if (idents[start + cursor] !== chain.ids[cursor]) same = false;
        }
        if (!same) continue;
        matched = { label: chain.label, start };
        break;
      }
    }
    const top = parens[parens.length - 1];
    const reportsTo = top?.kind === "gen" && top.pendingWrap && callee === "wrapLanguageModel" ? top : null;
    if (reportsTo) {
      reportsTo.pendingWrap = false;
      reportsTo.modelDone = true;
    }
    const assignTo = pendingWrapAssign && callee === "wrapLanguageModel" ? pendingWrapAssign : null;
    if (callee === "wrapLanguageModel") pendingWrapAssign = null;
    if (callee === "withSpurvikLangGraph") sawLangGraphWrap = true;
    if (callee === "spurvikInterrupt" || callee === "resolveLangGraphInterrupts") sawInterruptWrap = true;
    if (callee === "StateGraph") stateGraphLines.push(line);
    if (callee === "interrupt" && recent[recent.length - 2]?.value !== ".") interruptLines.push(line);
    if (pendingCall && pendingCall.kind === callee) {
      if (callee === "withSpurvik") names.add(pendingCall.lhs);
      else middlewareNames.add(pendingCall.lhs);
      pendingCall = null;
    } else if (callee !== "wrapLanguageModel") {
      pendingCall = null;
      pendingWrapAssign = null;
    }
    if (
      arrowPending &&
      (callee === "withSpurvik" ||
        callee === "spurvikMiddleware" ||
        callee === "withSpurvikMastra" ||
        clientWrappers.has(callee) ||
        factories.has(callee) ||
        names.has(callee))
    ) {
      const fn = topFn();
      if (callee === "spurvikMiddleware" || callee === "withSpurvikMastra" || middlewareNames.has(callee)) {
        if (fn && arrowPending) {
          // expression-bodied arrow is recorded when the name is known
        }
        middlewareNames.add(arrowPending);
        if (callee === "withSpurvikMastra") models.add(arrowPending);
      }
      if (callee === "withSpurvik" || clientWrappers.has(callee) || factories.has(callee) || names.has(callee)) {
        factories.add(arrowPending);
      }
      arrowPending = null;
    }
    if (returnIdent) {
      if (returnIdent === "withSpurvik" || factories.has(returnIdent) || names.has(returnIdent)) markClient();
      if (returnIdent === "spurvikMiddleware" || middlewareNames.has(returnIdent)) markMiddleware();
      returnIdent = null;
    }
    let kind: ParenFrame["kind"] = "plain";
    if ((callee === "generateText" || callee === "streamText") && recent[recent.length - 2]?.value !== ".") kind = "gen";
    else if (callee === "wrapLanguageModel" || reportsTo) kind = "wrap";
    const last = recent[recent.length - 1];
    let arrowName: string | null = null;
    if (last?.value === "=" || last?.value === "async") arrowName = assignmentNameBefore(recent.length - 1);
    const frame: ParenFrame = {
      kind,
      callee,
      line,
      assignTo,
      arrowName,
      fnName: fnName && callee === "" ? fnName : fnName && recent[recent.length - 1]?.value === fnName ? null : null,
      recentMark: recent.length,
      sawMiddleware: false,
      modelWrapped: false,
      modelDone: false,
      sawModelKey: false,
      expectValue: false,
      pendingWrap: false,
      reportsTo,
    };
    if (fnName && (last?.value === fnName || recent[recent.length - 1]?.value === fnName)) {
      frame.fnName = fnName;
      fnName = null;
    }
    parens.push(frame);
    if (matched) {
      const receiver = receiverOf(idents, matched.start, before);
      const wrapped =
        (receiver.kind === "call" && (receiver.name === "withSpurvik" || factories.has(receiver.name))) ||
        (receiver.kind === "ident" && names.has(receiver.name));
      if (!wrapped) add(line, matched.label);
    }
  };

  const takeIdent = (value: string) => {
    if (tick()) return;
    noteMiddleware(value);
    if (expectFnName) {
      fnName = value;
      expectFnName = false;
      pushRecent({ kind: "id", value });
      return;
    }
    if (returnWait && value === "await") {
      pushRecent({ kind: "id", value });
      return;
    }
    if (returnWait) {
      returnWait = false;
      if (names.has(value) || factories.has(value)) markClient();
      else if (middlewareNames.has(value)) markMiddleware();
      else returnIdent = value;
    }
    const gen = parens[parens.length - 1];
    if (gen?.kind === "gen" && !gen.modelDone) {
      if (gen.expectValue) {
        if (value === "wrapLanguageModel") gen.pendingWrap = true;
        else {
          gen.modelWrapped = models.has(value);
          gen.modelDone = true;
          gen.expectValue = false;
        }
      } else if (value === "model") gen.sawModelKey = true;
    }
    if (pendingLhs) {
      if (value === "withSpurvik" || value === "spurvikMiddleware") pendingCall = { lhs: pendingLhs, kind: value };
      else if (value === "wrapLanguageModel") pendingWrapAssign = pendingLhs;
      else if (value === "withSpurvikMastra") models.add(pendingLhs);
      else if (clientWrappers.has(value)) names.add(pendingLhs);
      else if (names.has(value) || factories.has(value)) names.add(pendingLhs);
      else if (middlewareNames.has(value)) middlewareNames.add(pendingLhs);
      pendingLhs = null;
    }
    if (value === "function") expectFnName = true;
    else if (value === "return") returnWait = true;
    pushRecent({ kind: "id", value });
  };

  const takeOp = (value: string) => {
    if (tick()) return;
    if (value === "{") {
      if (arrowPending) {
        openBrace(arrowPending);
        arrowPending = null;
      } else if (expectFnBrace) {
        openBrace(expectFnBrace);
        expectFnBrace = null;
      } else openBrace(null);
      return;
    }
    if (value === "}") {
      const gen = parens[parens.length - 1];
      if (gen?.kind === "gen" && gen.sawModelKey && !gen.expectValue && !gen.modelDone && !gen.pendingWrap) {
        gen.modelWrapped = models.has("model");
        gen.modelDone = true;
      }
      closeBrace();
      return;
    }
    if (value === "(") {
      const prev = recent[recent.length - 1];
      openParen(prev?.kind === "id" ? prev.value : "");
      return;
    }
    if (value === ")") {
      const frame = parens[parens.length - 1];
      if (frame) {
        parens.pop();
        closeParen(frame);
      }
      return;
    }
    if (value === ",") {
      const gen = parens[parens.length - 1];
      if (gen?.kind === "gen" && gen.sawModelKey && !gen.expectValue && !gen.modelDone && !gen.pendingWrap) {
        gen.modelWrapped = models.has("model");
        gen.modelDone = true;
      }
      returnIdent = null;
      return;
    }
    if (value === ":") {
      const gen = parens[parens.length - 1];
      if (gen?.kind === "gen" && gen.sawModelKey && !gen.modelDone) gen.expectValue = true;
      return;
    }
    if (value === "=>") {
      const last = recent[recent.length - 1];
      if (last?.value === ")") arrowPending = lastClosedArrowName;
      else if (last?.kind === "id") arrowPending = assignmentNameBefore(recent.length - 2);
      return;
    }
    if (value === "=") {
      const name = recent[recent.length - 1];
      pendingLhs = name?.kind === "id" ? name.value : null;
      pushRecent({ kind: "op", value });
      returnIdent = null;
      return;
    }
    if (value !== ".") returnIdent = null;
    if (value === ".") pushRecent({ kind: "op", value });
  };

  while (index < source.length) {
    charge();
    if (budgetReached()) break;
    const ch = source[index] ?? "";
    const next = source[index + 1];
    if (ch === "/" && next === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") {
        charge();
        index += 1;
      }
      continue;
    }
    if (ch === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        charge();
        if (source[index] === "\n") line += 1;
        index += 1;
      }
      index += index < source.length ? 2 : 0;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      index += 1;
      while (index < source.length) {
        charge();
        if (source[index] === "\\") {
          index += 1;
          if (source[index] === "\n") line += 1;
          if (index < source.length) index += 1;
          continue;
        }
        if (source[index] === "\n") line += 1;
        if (source[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (ch === "\n") {
      line += 1;
      index += 1;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\f") {
      index += 1;
      continue;
    }
    if (isIdentStart(ch)) {
      const start = index;
      index += 1;
      while (index < source.length && isIdentPart(source[index] ?? "")) {
        charge();
        index += 1;
      }
      takeIdent(source.slice(start, index));
      if (stopped) break;
      continue;
    }
    if (ch === "=" && (next === ">" || next === "=")) {
      index += 2;
      if (next === ">") takeOp("=>");
      if (stopped) break;
      continue;
    }
    if ((ch === "!" || ch === "<" || ch === ">") && next === "=") {
      index += 2;
      continue;
    }
    index += 1;
    takeOp(ch);
    if (stopped) break;
  }

  if (!stopped && !sawLangGraphWrap) {
    for (const at of stateGraphLines) add(at, "StateGraph");
  }
  if (!stopped && !sawInterruptWrap) {
    for (const at of interruptLines) add(at, "interrupt");
  }
  if (!stopped) {
    for (const frame of parens) {
      charge();
      if (frame.kind === "gen" && !frame.modelWrapped) add(frame.line, frame.callee);
      if (budgetReached()) break;
    }
  }
  if (control?.steps) control.steps.count += steps;
  findings.sort((left, right) => left.line - right.line || left.call.localeCompare(right.call));
  return findings;
}

function toPosix(relative: string): string {
  return relative.split(path.sep).join("/");
}

/** Resolve a user directory and reject traversal, sensitive names, and paths outside `workspaceRoot`. */
export function resolveScanDirectory(workspaceRoot: string, requested: string): string {
  const trimmed = requested.trim();
  if (!trimmed) throw new WorkspacePathError(PATH_EMPTY);
  if (trimmed.includes("\0")) throw new WorkspacePathError(PATH_INVALID);
  const segments = pathSegments(trimmed);
  if (segments.some((segment) => segment === "..")) throw new WorkspacePathError(PATH_TRAVERSAL);
  if (!path.isAbsolute(trimmed) && linkTextIsSensitive(trimmed)) throw new WorkspacePathError(PATH_SENSITIVE);
  let root: string;
  try {
    root = fs.realpathSync(workspaceRoot);
  } catch {
    throw new WorkspacePathError(PATH_INVALID);
  }
  const candidate = path.resolve(root, trimmed);
  let linkTarget: string | null = null;
  try {
    if (fs.lstatSync(candidate).isSymbolicLink()) linkTarget = fs.readlinkSync(candidate);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new WorkspacePathError(PATH_MISSING);
    throw new WorkspacePathError(PATH_INVALID);
  }
  if (linkTarget && linkTextIsSensitive(linkTarget, root)) throw new WorkspacePathError(PATH_SENSITIVE);
  let resolved: string;
  try {
    resolved = fs.realpathSync(candidate);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") throw new WorkspacePathError(PATH_MISSING);
    throw new WorkspacePathError(PATH_INVALID);
  }
  if (!isInside(root, resolved)) throw new WorkspacePathError(PATH_OUTSIDE);
  if (pathHasSensitiveSegment(root, resolved) || isExcludedRealPath(root, resolved)) {
    throw new WorkspacePathError(pathHasSensitiveSegment(root, resolved) ? PATH_SENSITIVE : PATH_EXCLUDED);
  }
  let info: fs.Stats;
  try {
    info = fs.statSync(resolved);
  } catch {
    throw new WorkspacePathError(PATH_INVALID);
  }
  if (!info.isDirectory()) throw new WorkspacePathError(PATH_NOT_DIRECTORY);
  return resolved;
}

export function scanForUnwrappedCalls(workspaceRoot: string, directory: string, options?: ScanOptions): ScanReport {
  const root = validateWorkspaceRoot(workspaceRoot);
  const resolved = resolveScanDirectory(root, directory);
  const maxFiles = options?.maxFiles ?? DEFAULT_MAX_FILES;
  const maxFindings = options?.maxFindings ?? DEFAULT_MAX_FINDINGS;
  const maxDepth = options?.maxDepth ?? MAX_DEPTH;
  const maxFileBytes = options?.maxFileBytes ?? MAX_FILE_BYTES;
  const budget = options?.deadlineMs ?? SCAN_BUDGET_MS;
  const now = options?.now ?? Date.now;
  const readFile = options?.readFile ?? ((file: string) => fs.readFileSync(file, "utf8"));
  const follow = options?.realpath ?? ((file: string) => fs.realpathSync(file));
  const started = now();
  const expired = () => now() - started >= budget;
  const findings: UnwrappedFinding[] = [];
  const seenDirs = new Set<string>();
  let filesScanned = 0;
  let truncated = false;
  let timedOut = false;
  let depthLimited = false;
  let skippedOutside = 0;
  let skippedLarge = 0;
  let skippedHardLinks = 0;
  const seenFiles = new Set<string>();

  const stopForTime = (): boolean => {
    if (!expired()) return false;
    timedOut = true;
    return true;
  };

  const walk = (dir: string, depth: number) => {
    if (truncated || timedOut) return;
    if (depth > maxDepth) {
      depthLimited = true;
      return;
    }
    if (stopForTime()) return;
    let realDir: string;
    try {
      realDir = follow(dir);
    } catch {
      skippedOutside += 1;
      return;
    }
    if (!isInside(root, realDir) || isExcludedRealPath(root, realDir) || pathHasSensitiveSegment(root, realDir)) {
      skippedOutside += 1;
      return;
    }
    if (seenDirs.has(realDir)) return;
    seenDirs.add(realDir);
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(realDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (truncated || timedOut) return;
      if (stopForTime()) return;
      if (entry.name === "." || entry.name === "..") continue;
      if (isSensitiveBase(entry.name)) continue;
      const full = path.join(realDir, entry.name);
      let linked = false;
      try {
        linked = fs.lstatSync(full).isSymbolicLink();
      } catch {
        continue;
      }
      if (linked) {
        try {
          if (linkTextIsSensitive(fs.readlinkSync(full), root)) continue;
        } catch {
          continue;
        }
      }
      let real: string;
      try {
        real = follow(full);
      } catch {
        continue;
      }
      if (!isInside(root, real)) {
        skippedOutside += 1;
        continue;
      }
      if (pathHasSensitiveSegment(root, real)) continue;
      if (isExcludedRealPath(root, real)) continue;
      let info: fs.Stats;
      try {
        info = fs.statSync(real);
      } catch {
        continue;
      }
      if (info.isDirectory()) {
        if (isExcludedDirName(entry.name) || isExcludedDirName(path.basename(real))) continue;
        if (depth + 1 > maxDepth) {
          depthLimited = true;
          continue;
        }
        walk(real, depth + 1);
        continue;
      }
      if (!info.isFile()) continue;
      if (info.nlink > 1) {
        skippedHardLinks += 1;
        continue;
      }
      if (entry.name.endsWith(".d.ts") || path.basename(real).endsWith(".d.ts")) continue;
      const extension = path.extname(entry.name) || path.extname(real);
      if (!SOURCE_EXT.has(extension)) continue;
      if (info.size > maxFileBytes) {
        skippedLarge += 1;
        continue;
      }
      const fileKey = `${info.dev}:${info.ino}`;
      if (seenFiles.has(fileKey)) continue;
      seenFiles.add(fileKey);
      if (filesScanned >= maxFiles) {
        truncated = true;
        return;
      }
      let text: string;
      try {
        text = readFile(real);
      } catch {
        continue;
      }
      if (text.includes("\0")) continue;
      filesScanned += 1;
      const relative = toPosix(path.relative(root, real));
      const found = findUnwrappedInSource(text, { shouldStop: stopForTime });
      for (const finding of found) {
        findings.push({ file: relative, line: finding.line, call: finding.call });
        if (findings.length >= maxFindings) {
          truncated = true;
          break;
        }
      }
      if (timedOut || truncated) return;
    }
  };

  walk(resolved, 0);
  findings.sort(
    (left, right) => left.file.localeCompare(right.file) || left.line - right.line || left.call.localeCompare(right.call),
  );
  const relativeDir = toPosix(path.relative(root, resolved)) || ".";
  const partial = truncated || timedOut || depthLimited;
  return {
    directory: relativeDir,
    filesScanned,
    findings,
    truncated,
    timedOut,
    depthLimited,
    partial,
    depthLimit: maxDepth,
    skippedOutside,
    skippedLarge,
    skippedHardLinks,
  };
}

export function formatScanReport(report: ScanReport): string {
  const lines = [
    "Heuristic scan of AI client calls. This can miss a wrapped call or report one that is already wrapped. It does not change files and it does not use the network. It reads .ts, .tsx, .js, .jsx, .mjs, .cjs, .mts, and .cts files, not .md or .mdc. Line numbers are 1-based and count every newline, including comments and strings.",
    "",
    `Directory: ${report.directory}`,
    `Files scanned: ${report.filesScanned}`,
    `Findings: ${report.findings.length}`,
  ];
  if (report.skippedOutside > 0) lines.push(`Skipped ${report.skippedOutside} paths that resolved outside the workspace.`);
  if (report.skippedLarge > 0) lines.push(`Skipped ${report.skippedLarge} files larger than 512 KB.`);
  if (report.skippedHardLinks > 0) lines.push(`Skipped ${report.skippedHardLinks} hard-linked files.`);
  if (report.timedOut) lines.push(SCAN_TIME_LIMIT);
  if (report.truncated) lines.push(SCAN_COUNT_LIMIT);
  if (report.depthLimited) lines.push(depthSentence(report.depthLimit));
  lines.push("");
  if (report.findings.length === 0) lines.push("No unwrapped calls found.");
  else for (const finding of report.findings) lines.push(`${finding.file}:${finding.line} ${finding.call}`);
  return `${lines.join("\n")}\n`;
}

export function scanWorkspace(workspaceRoot: string, directory: string): string {
  return formatScanReport(scanForUnwrappedCalls(workspaceRoot, directory));
}
