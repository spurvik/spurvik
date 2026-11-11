import { WorkspacePathError, validateWorkspaceRoot } from "./root.js";
import { serverVersion } from "./server.js";
import { formatScanReport, scanForUnwrappedCalls } from "./tools/find-unwrapped.js";
import { markingHooksText } from "./tools/marking-hooks.js";
import { FRAMEWORKS, RUNTIMES, setupSnippet, type Framework, type Runtime } from "./tools/setup-snippet.js";

export interface CliIo {
  stdout: (chunk: string) => void;
  stderr: (chunk: string) => void;
  cwd: () => string;
}

const DEFAULT_IO: CliIo = {
  stdout: (chunk) => process.stdout.write(chunk),
  stderr: (chunk) => process.stderr.write(chunk),
  cwd: () => process.cwd(),
};

const HELP_TEXT = `spurvik-mcp-server — Local stdio MCP server & CLI scanner for Spurvik (MIT)

Usage:
  spurvik-mcp-server --root <dir>                   Start stdio MCP server (Claude Code, Cursor, VS Code)
  spurvik-mcp-server check [dir] [--ci] [--json]    Scan a project for unwrapped AI model calls (0 network)
  spurvik-mcp-server snippet <framework> [runtime]  Print a ready-to-paste withSpurvik() setup snippet
  spurvik-mcp-server marking-hooks [surface]        Print Art. 50(2) marking-hook notes (text | media | both)
  spurvik-mcp-server --version | -v                 Print version
  spurvik-mcp-server --help | -h                    Print this help

Frameworks: ${FRAMEWORKS.join(", ")}
Runtimes:   ${RUNTIMES.join(", ")}

Hosted EU (fra1) console & zero-cookie interactive sandbox:
  Sandbox: https://console.spurvik.com/sandbox
  Pro (€19/mo excl. VAT · B2B): https://console.spurvik.com/?upgrade=pro
`;

function isFrameworkArg(value: string): value is Framework {
  return (FRAMEWORKS as readonly string[]).includes(value);
}

function isRuntimeArg(value: string): value is Runtime {
  return (RUNTIMES as readonly string[]).includes(value);
}

/**
 * Handles direct CLI invocations (`check`, `snippet`, `marking-hooks`, `--help`, `--version`).
 * Returns `null` when invoked in MCP stdio mode (`--root <dir>` without CLI subcommands).
 */
export function tryRunCli(argv: readonly string[], io: CliIo = DEFAULT_IO): number | null {
  const args = argv.slice(2);
  const first = args[0];

  if (first === "--help" || first === "-h" || first === "help") {
    io.stdout(HELP_TEXT);
    return 0;
  }

  if (first === "--version" || first === "-v" || first === "version") {
    io.stdout(`${serverVersion()}\n`);
    return 0;
  }

  if (first === "check") {
    const rest = args.slice(1);
    let ciMode = false;
    let jsonMode = false;
    let targetDir: string | undefined;

    for (let i = 0; i < rest.length; i += 1) {
      const arg = rest[i]!;
      if (arg === "--ci" || arg === "--fail-on-unwrapped") {
        ciMode = true;
      } else if (arg === "--json") {
        jsonMode = true;
      } else if (arg === "--root") {
        const next = rest[i + 1];
        if (!next || next.startsWith("-")) {
          io.stderr("Missing directory after --root.\n");
          return 2;
        }
        targetDir = next;
        i += 1;
      } else if (arg.startsWith("--root=")) {
        targetDir = arg.slice("--root=".length);
      } else if (arg.startsWith("-")) {
        io.stderr(`Unknown flag for check: ${arg}\n`);
        return 2;
      } else if (!targetDir) {
        targetDir = arg;
      } else {
        io.stderr(`Unexpected extra argument for check: ${arg}\n`);
        return 2;
      }
    }

    let root: string;
    try {
      root = validateWorkspaceRoot(targetDir ?? io.cwd());
    } catch (err) {
      const message = err instanceof WorkspacePathError || err instanceof Error ? err.message : "Invalid project directory.";
      io.stderr(`${message}\n`);
      return 2;
    }

    const report = scanForUnwrappedCalls(root, ".");
    if (jsonMode) {
      io.stdout(
        `${JSON.stringify(
          {
            status: report.findings.length === 0 && !report.partial ? "clean" : report.findings.length > 0 ? "unwrapped_calls_found" : "partial_scan",
            filesScanned: report.filesScanned,
            unwrappedCount: report.findings.length,
            findings: report.findings,
            partial: report.partial,
            truncated: report.truncated,
            timedOut: report.timedOut,
            depthLimited: report.depthLimited,
            sandboxUrl: "https://console.spurvik.com/sandbox",
            proUpgradeUrl: "https://console.spurvik.com/?upgrade=pro",
          },
          null,
          2,
        )}\n`,
      );
    } else {
      io.stdout(formatScanReport(report));
      io.stdout(
        [
          "",
          "Next steps:",
          "- Wrap model clients with `withSpurvik(client, config)` (`npm i spurvik`)",
          "- Test in the interactive 2x2 browser sandbox (0 login): https://console.spurvik.com/sandbox",
          "- Hosted EU (fra1) HMAC vault, 9-channel ask_human() queue & DPO summary (€19/mo excl. VAT · B2B): https://console.spurvik.com/?upgrade=pro",
          "",
        ].join("\n"),
      );
    }

    if (ciMode && (report.findings.length > 0 || report.partial)) {
      return 1;
    }
    return 0;
  }

  if (first === "snippet") {
    const fw = args[1];
    const rt = args[2] ?? "node";
    if (!fw || !isFrameworkArg(fw)) {
      io.stderr(`Choose a framework from: ${FRAMEWORKS.join(", ")}.\n`);
      return 2;
    }
    if (!isRuntimeArg(rt)) {
      io.stderr(`Choose a runtime from: ${RUNTIMES.join(", ")}.\n`);
      return 2;
    }
    io.stdout(`${setupSnippet(fw, rt)}\n`);
    return 0;
  }

  if (first === "marking-hooks") {
    const surface = args[1] ?? "both";
    if (surface !== "text" && surface !== "media" && surface !== "both") {
      io.stderr("Choose a surface from: text, media, both.\n");
      return 2;
    }
    io.stdout(`${markingHooksText(surface)}\n`);
    return 0;
  }

  return null;
}
