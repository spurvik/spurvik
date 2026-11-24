import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type CheckImageC2paDeps } from "./tools/check-image-c2pa-url.js";
import { type ScanLiveUrlDeps } from "./tools/scan-live-url.js";
/** Version advertised on initialize. Reads the package next to the built entry, otherwise MCP_VERSION. */
export declare function serverVersion(): string;
export interface ServerOptions {
    /** Test hook for spurvik_scan_live_url and spurvik_batch_scan_domains. Defaults to globalThis.fetch with an 8 s timeout. */
    scan?: ScanLiveUrlDeps;
    /** Test hook for spurvik_check_image_c2pa_url. Defaults to globalThis.fetch with a 15 s timeout. */
    c2pa?: CheckImageC2paDeps;
}
/**
 * Stdio MCP server with 10 tools. Tools are read-only; only spurvik_scan_live_url, spurvik_batch_scan_domains and
 * spurvik_check_image_c2pa_url call the network (console.spurvik.com).
 */
export declare function createServer(workspaceRoot: string, options?: ServerOptions): McpServer;
