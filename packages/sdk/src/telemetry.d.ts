import type { TelemetryIngestEvent } from "@spurvik/core";
import type { DurableTelemetryBuffer } from "./buffer.js";
export interface TelemetryQueueOptions {
    maxSize: number;
    maxBatch: number;
    flushIntervalMs: number;
    maxRetries: number;
    /** Total time one flush may spend sending and retrying. Default 8 seconds. */
    flushTimeoutMs?: number;
    send: (events: TelemetryIngestEvent[], signal: AbortSignal) => Promise<void>;
    sleep: (ms: number) => Promise<void>;
    onError?: ((error: unknown) => void) | undefined;
    /**
     * When set, events are persisted before they count as accepted.
     * A full memory window must not delete them.
     */
    durable?: DurableTelemetryBuffer;
    /**
     * High-risk projects. Refuses to drop. Requires `durable` or a Node file buffer.
     */
    strict?: boolean;
    openDurable?: () => Promise<DurableTelemetryBuffer>;
}
/** Queues the process-exit hook still retains. Idle empty queues are omitted. */
export declare function exitHookQueueCount(): number;
/**
 * Non-blocking queue for tiers that allow loss.
 * `high_annex3` uses a durable buffer and does not drop. A failed durable
 * write rejects `enqueue` so the caller can see the gap instead of losing it.
 */
export declare class TelemetryQueue {
    private readonly options;
    private buffer;
    private droppedCount;
    private timer;
    private working;
    private stopped;
    private exitHooked;
    private exitFlushStarted;
    private flushDepth;
    private flushDeadline;
    /**
     * True while a flush's deadline still applies. A failed flush keeps it so
     * exit does not open a second window for the same batch. A new event
     * queued after that flush has returned clears it. An event queued while
     * the flush is still running sets `queuedDuringFlush` and clears it when
     * that flush finishes with events still waiting.
     */
    private budgetActive;
    /** An event arrived with a flush in flight. Cleared when that flush unwinds. */
    private queuedDuringFlush;
    private readonly flushTimeoutMs;
    private durable;
    private opening;
    private instanceId;
    private nextSeq;
    constructor(options: TelemetryQueueOptions);
    get dropped(): number;
    get size(): number;
    get strict(): boolean;
    enqueue(event: TelemetryIngestEvent): Promise<void>;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
    /**
     * Join the single process-exit listener.
     * Each queue still flushes at most once on exit. A second pass would retry
     * a failed send forever, because the batch is put back and the retry timer
     * keeps the process alive. Extra clients must not add extra listeners.
     * An empty idle queue is not retained, so a client the caller has dropped
     * can be collected.
     */
    bindProcessHooks(): void;
    private retainForExit;
    private releaseIfIdle;
    flushOnceOnExit(): void;
    private openDeadline;
    private releaseBudget;
    /** A new event after a finished failed flush is not part of that attempt. */
    private releaseSpentBudget;
    /** A new event during an in-flight flush belongs to the next attempt. */
    private markQueuedDuringFlush;
    private runFlush;
    private stamp;
    private pushMemory;
    private enqueueDurable;
    private ensureDurable;
    private arm;
    private disarm;
    private drain;
    private drainMemory;
    private sendWithRetry;
}
