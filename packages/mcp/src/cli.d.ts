export interface CliIo {
    stdout: (chunk: string) => void;
    stderr: (chunk: string) => void;
    cwd: () => string;
}
/**
 * Handles direct CLI invocations (`check`, `snippet`, `marking-hooks`, `--help`, `--version`).
 * Returns `null` when invoked in MCP stdio mode (`--root <dir>` without CLI subcommands).
 */
export declare function tryRunCli(argv: readonly string[], io?: CliIo): number | null;
