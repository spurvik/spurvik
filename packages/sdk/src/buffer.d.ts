import type { TelemetryIngestEvent } from "@spurvik/core";
/**
 * Durable holding area for telemetry that has not been acknowledged.
 * `append` must resolve only after the events can survive a process restart.
 * Prompt text is never stored here; events are fingerprints and metadata.
 */
export interface DurableTelemetryBuffer {
    readonly instanceId: string;
    allocateSeq(): number;
    append(events: TelemetryIngestEvent[]): void | Promise<void>;
    peek(limit: number): TelemetryIngestEvent[] | Promise<TelemetryIngestEvent[]>;
    ack(eventIds: readonly string[]): void | Promise<void>;
    size(): number | Promise<number>;
}
/** In-memory buffer. Useful for tests and for a caller-supplied KV adapter's unit stand-in. */
export declare class MemoryTelemetryBuffer implements DurableTelemetryBuffer {
    readonly instanceId: string;
    private nextSeq;
    private events;
    constructor(instanceId?: `${string}-${string}-${string}-${string}-${string}`);
    allocateSeq(): number;
    append(events: TelemetryIngestEvent[]): void;
    peek(limit: number): TelemetryIngestEvent[];
    ack(eventIds: readonly string[]): void;
    size(): number;
}
export interface TelemetryKvStore {
    get(key: string): string | null | Promise<string | null>;
    set(key: string, value: string): void | Promise<void>;
}
/**
 * Pluggable key-value buffer. One key holds the unacknowledged events and the
 * sequence cursor, so a restart continues the same client sequence.
 */
export declare class KvTelemetryBuffer implements DurableTelemetryBuffer {
    private readonly kv;
    private readonly key;
    private loaded;
    constructor(kv: TelemetryKvStore, key?: string);
    /** Previous default key. Read once when the new key is empty. */
    private readonly legacyKey;
    get instanceId(): string;
    allocateSeq(): number;
    append(events: TelemetryIngestEvent[]): Promise<void>;
    peek(limit: number): Promise<TelemetryIngestEvent[]>;
    ack(eventIds: readonly string[]): Promise<void>;
    size(): Promise<number>;
    private read;
}
