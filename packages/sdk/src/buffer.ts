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
export class MemoryTelemetryBuffer implements DurableTelemetryBuffer {
  readonly instanceId: string;
  private nextSeq = 1;
  private events: TelemetryIngestEvent[] = [];

  constructor(instanceId = crypto.randomUUID()) {
    this.instanceId = instanceId;
  }

  allocateSeq(): number {
    return this.nextSeq;
  }

  append(events: TelemetryIngestEvent[]): void {
    this.events.push(...events);
    for (const event of events) {
      if (event.clientSeq && event.clientSeq >= this.nextSeq) this.nextSeq = event.clientSeq + 1;
    }
  }

  peek(limit: number): TelemetryIngestEvent[] {
    return this.events.slice(0, limit);
  }

  ack(eventIds: readonly string[]): void {
    const drop = new Set(eventIds);
    this.events = this.events.filter((event) => !drop.has(event.eventId));
  }

  size(): number {
    return this.events.length;
  }
}

export interface TelemetryKvStore {
  get(key: string): string | null | Promise<string | null>;
  set(key: string, value: string): void | Promise<void>;
}

interface KvState {
  instanceId: string;
  nextSeq: number;
  events: TelemetryIngestEvent[];
}

/**
 * Pluggable key-value buffer. One key holds the unacknowledged events and the
 * sequence cursor, so a restart continues the same client sequence.
 */
export class KvTelemetryBuffer implements DurableTelemetryBuffer {
  private loaded: KvState | null = null;

  constructor(
    private readonly kv: TelemetryKvStore,
    private readonly key = "spurvik:telemetry",
  ) {}

  /** Previous default key. Read once when the new key is empty. */
  private readonly legacyKey = "aegis:telemetry";

  get instanceId(): string {
    return this.loaded?.instanceId ?? "pending";
  }

  allocateSeq(): number {
    return this.loaded?.nextSeq ?? 1;
  }

  async append(events: TelemetryIngestEvent[]): Promise<void> {
    const state = await this.read();
    state.events.push(...events);
    for (const event of events) {
      if (event.clientSeq && event.clientSeq >= state.nextSeq) state.nextSeq = event.clientSeq + 1;
    }
    await this.kv.set(this.key, JSON.stringify(state));
    this.loaded = state;
  }

  async peek(limit: number): Promise<TelemetryIngestEvent[]> {
    const state = await this.read();
    return state.events.slice(0, limit);
  }

  async ack(eventIds: readonly string[]): Promise<void> {
    const state = await this.read();
    const drop = new Set(eventIds);
    state.events = state.events.filter((event) => !drop.has(event.eventId));
    await this.kv.set(this.key, JSON.stringify(state));
    this.loaded = state;
  }

  async size(): Promise<number> {
    const state = await this.read();
    return state.events.length;
  }

  private async read(): Promise<KvState> {
    if (this.loaded) return this.loaded;
    const raw = (await this.kv.get(this.key)) ?? (this.key === "spurvik:telemetry" ? await this.kv.get(this.legacyKey) : null);
    if (!raw) {
      this.loaded = { instanceId: crypto.randomUUID(), nextSeq: 1, events: [] };
      await this.kv.set(this.key, JSON.stringify(this.loaded));
      return this.loaded;
    }
    this.loaded = JSON.parse(raw) as KvState;
    return this.loaded;
  }
}
