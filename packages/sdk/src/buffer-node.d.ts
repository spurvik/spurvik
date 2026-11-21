import type { TelemetryIngestEvent } from "@spurvik/core";
import type { DurableTelemetryBuffer } from "./buffer.js";
/**
 * On-disk JSONL buffer. `append` returns only after fsync.
 * The cursor file keeps the client sequence across restarts so a gap is
 * visible on the ledger if events are lost rather than quietly renumbered.
 */
export declare class FileTelemetryBuffer implements DurableTelemetryBuffer {
    readonly instanceId: string;
    private nextSeq;
    private readonly file;
    private readonly cursorPath;
    constructor(directory: string);
    allocateSeq(): number;
    append(events: TelemetryIngestEvent[]): void;
    peek(limit: number): TelemetryIngestEvent[];
    ack(eventIds: readonly string[]): void;
    size(): number;
}
export declare function fileTelemetryDirectory(apiKey: string): string;
export declare function openFileTelemetryBuffer(apiKey: string): FileTelemetryBuffer;
