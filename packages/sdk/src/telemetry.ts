import type { TelemetryIngestEvent } from "@spurvik/core";
import type { DurableTelemetryBuffer } from "./buffer.js";
import { SpurvikTelemetryBufferError } from "./errors.js";
import { nodeProcess, unrefTimer } from "./runtime.js";

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

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>)?.then === "function";
}

const exitQueues = new Set<TelemetryQueue>();
let exitListenerInstalled = false;

/** Queues the process-exit hook still retains. Idle empty queues are omitted. */
export function exitHookQueueCount(): number {
  return exitQueues.size;
}

function installExitListener(): void {
  const proc = nodeProcess();
  if (!proc || exitListenerInstalled) return;
  exitListenerInstalled = true;
  proc.on("beforeExit", () => {
    for (const queue of exitQueues) queue.flushOnceOnExit();
  });
}

/**
 * Non-blocking queue for tiers that allow loss.
 * `high_annex3` uses a durable buffer and does not drop. A failed durable
 * write rejects `enqueue` so the caller can see the gap instead of losing it.
 */
export class TelemetryQueue {
  private buffer: TelemetryIngestEvent[] = [];
  private droppedCount = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private working: Promise<void> = Promise.resolve();
  private stopped = false;
  private exitHooked = false;
  private exitFlushStarted = false;
  private flushDepth = 0;
  private flushDeadline = 0;
  /**
   * True while a flush's deadline still applies. A failed flush keeps it so
   * exit does not open a second window for the same batch. A new event
   * queued after that flush has returned clears it. An event queued while
   * the flush is still running sets `queuedDuringFlush` and clears it when
   * that flush finishes with events still waiting.
   */
  private budgetActive = false;
  /** An event arrived with a flush in flight. Cleared when that flush unwinds. */
  private queuedDuringFlush = false;
  private readonly flushTimeoutMs: number;
  private durable: DurableTelemetryBuffer | null;
  private opening: Promise<DurableTelemetryBuffer> | null = null;
  private instanceId: string = crypto.randomUUID();
  private nextSeq = 1;

  constructor(private readonly options: TelemetryQueueOptions) {
    this.flushTimeoutMs = options.flushTimeoutMs ?? 8_000;
    this.durable = options.durable ?? null;
    if (this.durable) {
      this.instanceId = this.durable.instanceId;
      this.nextSeq = this.durable.allocateSeq();
    }
    if (options.strict && !options.durable && !options.openDurable && !nodeProcess()) {
      throw new SpurvikTelemetryBufferError(
        "high_annex3 telemetry needs a durable buffer. Pass telemetry.durableBuffer or run on Node, where an on-disk buffer is opened automatically.",
      );
    }
  }

  get dropped(): number {
    return this.droppedCount;
  }

  get size(): number {
    return this.buffer.length;
  }

  get strict(): boolean {
    return this.options.strict === true;
  }

  enqueue(event: TelemetryIngestEvent): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (!this.options.strict && !this.options.durable && !this.options.openDurable) {
      this.pushMemory(this.stamp(event));
      return Promise.resolve();
    }
    const run = this.working.then(() => this.enqueueDurable(event));
    this.working = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async flush(): Promise<void> {
    // A second caller joins the in-flight attempt and keeps its deadline.
    // Overwriting it is what stretched one awaited flush past the limit.
    if (this.flushDepth === 0) this.openDeadline();
    await this.runFlush();
  }

  async shutdown(): Promise<void> {
    this.stopped = true;
    exitQueues.delete(this);
    this.disarm();
    await this.flush();
  }

  /**
   * Join the single process-exit listener.
   * Each queue still flushes at most once on exit. A second pass would retry
   * a failed send forever, because the batch is put back and the retry timer
   * keeps the process alive. Extra clients must not add extra listeners.
   * An empty idle queue is not retained, so a client the caller has dropped
   * can be collected.
   */
  bindProcessHooks(): void {
    if (!nodeProcess() || this.exitHooked) return;
    this.exitHooked = true;
    installExitListener();
    this.retainForExit();
  }

  private retainForExit(): void {
    if (!this.exitHooked || this.stopped) return;
    if (this.buffer.length === 0 && this.flushDepth === 0) return;
    exitQueues.add(this);
  }

  private async releaseIfIdle(): Promise<void> {
    if (!this.exitHooked) return;
    if (this.stopped) {
      exitQueues.delete(this);
      return;
    }
    if (this.flushDepth > 0 || this.buffer.length > 0 || this.opening) return;
    if (this.durable) {
      const peeked = this.durable.peek(1);
      const pending = isPromise(peeked) ? await peeked : peeked;
      if (this.stopped) {
        exitQueues.delete(this);
        return;
      }
      if (this.flushDepth > 0 || this.buffer.length > 0 || pending.length > 0) return;
    }
    exitQueues.delete(this);
    this.exitFlushStarted = false;
  }

  flushOnceOnExit(): void {
    if (this.stopped || this.exitFlushStarted) return;
    this.exitFlushStarted = true;
    // No new event after a failed flush: keep the time left, which is none
    // once the deadline has passed. A new event, including one queued while
    // the flush was still running, clears the budget first, so this opens a
    // fresh deadline for that later batch.
    if (!this.budgetActive) this.openDeadline();
    void this.runFlush();
  }

  private openDeadline(): void {
    this.flushDeadline = Date.now() + this.flushTimeoutMs;
    this.budgetActive = true;
  }

  private releaseBudget(): void {
    this.budgetActive = false;
  }

  /** A new event after a finished failed flush is not part of that attempt. */
  private releaseSpentBudget(): void {
    if (this.flushDepth === 0 && this.budgetActive) this.releaseBudget();
  }

  /** A new event during an in-flight flush belongs to the next attempt. */
  private markQueuedDuringFlush(): void {
    if (this.flushDepth > 0) this.queuedDuringFlush = true;
  }

  private async runFlush(): Promise<void> {
    this.disarm();
    this.flushDepth += 1;
    this.retainForExit();
    try {
      const run = this.working.then(() => this.drain());
      this.working = run.then(
        () => undefined,
        () => undefined,
      );
      await run;
    } finally {
      this.flushDepth -= 1;
      // Nested flushes, including an interval flush that started while this
      // one was still sending, share the flag until the outermost one returns.
      if (this.flushDepth === 0) {
        if (this.queuedDuringFlush && this.buffer.length > 0) this.releaseBudget();
        this.queuedDuringFlush = false;
      }
      await this.releaseIfIdle();
    }
  }

  private stamp(event: TelemetryIngestEvent): TelemetryIngestEvent {
    const clientSeq = event.clientSeq ?? this.nextSeq;
    if (event.clientSeq === undefined) this.nextSeq = clientSeq + 1;
    return {
      ...event,
      clientInstanceId: event.clientInstanceId ?? this.instanceId,
      clientSeq,
    };
  }

  private pushMemory(event: TelemetryIngestEvent): void {
    this.releaseSpentBudget();
    this.markQueuedDuringFlush();
    if (this.buffer.length >= this.options.maxSize) {
      this.buffer.shift();
      this.droppedCount += 1;
    }
    this.buffer.push(event);
    this.retainForExit();
    if (this.buffer.length >= this.options.maxBatch) {
      void this.flush();
      return;
    }
    this.arm();
  }

  private async enqueueDurable(event: TelemetryIngestEvent): Promise<void> {
    const durable = await this.ensureDurable();
    const stamped = this.stamp(event);
    try {
      const pending = durable.append([stamped]);
      if (isPromise(pending)) await pending;
    } catch (error) {
      if (stamped.clientSeq !== undefined) this.nextSeq = Math.min(this.nextSeq, stamped.clientSeq);
      throw new SpurvikTelemetryBufferError(
        error instanceof Error ? error.message : "The durable telemetry buffer did not accept the event.",
      );
    }
    if (this.buffer.length >= this.options.maxSize) this.buffer.shift();
    this.buffer.push(stamped);
    this.releaseSpentBudget();
    this.markQueuedDuringFlush();
    this.retainForExit();
    this.arm();
  }

  private async ensureDurable(): Promise<DurableTelemetryBuffer> {
    if (this.durable) return this.durable;
    if (!this.opening) {
      const open = this.options.openDurable;
      if (!open) {
        throw new SpurvikTelemetryBufferError("A durable telemetry buffer is required and none is configured.");
      }
      this.opening = open().then((buffer) => {
        this.durable = buffer;
        this.instanceId = buffer.instanceId === "pending" ? this.instanceId : buffer.instanceId;
        const allocated = buffer.allocateSeq();
        if (allocated > 1) this.nextSeq = allocated;
        return buffer;
      });
    }
    return this.opening;
  }

  private arm(): void {
    if (this.timer || this.stopped) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, this.options.flushIntervalMs);
    unrefTimer(this.timer);
  }

  private disarm(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }

  private async drain(): Promise<void> {
    const durable = this.durable;
    if (!durable) {
      await this.drainMemory();
      return;
    }
    for (;;) {
      const peeked = durable.peek(this.options.maxBatch);
      const batch = isPromise(peeked) ? await peeked : peeked;
      if (batch.length === 0) {
        this.releaseBudget();
        return;
      }
      try {
        await this.sendWithRetry(batch);
        const acked = durable.ack(batch.map((event) => event.eventId));
        if (isPromise(acked)) await acked;
        const sent = new Set(batch.map((event) => event.eventId));
        this.buffer = this.buffer.filter((event) => !sent.has(event.eventId));
      } catch (error) {
        this.options.onError?.(error);
        return;
      }
    }
  }

  private async drainMemory(): Promise<void> {
    while (this.buffer.length > 0) {
      const batch = this.buffer.splice(0, this.options.maxBatch);
      try {
        await this.sendWithRetry(batch);
      } catch (error) {
        const room = Math.max(0, this.options.maxSize - this.buffer.length);
        const kept = batch.slice(0, room);
        this.droppedCount += batch.length - kept.length;
        this.buffer = [...kept, ...this.buffer].slice(0, this.options.maxSize);
        this.options.onError?.(error);
        return;
      }
    }
    this.releaseBudget();
  }

  private async sendWithRetry(batch: TelemetryIngestEvent[]): Promise<void> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this.options.maxRetries; attempt += 1) {
      const remaining = this.flushDeadline - Date.now();
      if (remaining <= 0) {
        lastError = isTimeoutError(lastError) ? lastError : flushTimeoutError();
        break;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => {
        controller.abort(flushTimeoutError());
      }, remaining);
      try {
        await this.options.send(batch, controller.signal);
        return;
      } catch (error) {
        const reason = controller.signal.reason;
        lastError = controller.signal.aborted && isTimeoutError(reason) ? reason : error;
        if (attempt === this.options.maxRetries || this.flushDeadline - Date.now() <= 0) break;
        const backoff = Math.min(8_000, 200 * 2 ** attempt);
        const wait = Math.min(backoff, this.flushDeadline - Date.now());
        if (wait <= 0) break;
        await this.options.sleep(wait);
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Telemetry delivery failed.");
  }
}

function flushTimeoutError(): DOMException {
  return new DOMException("The telemetry flush timed out.", "TimeoutError");
}

function isTimeoutError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === "TimeoutError";
}
