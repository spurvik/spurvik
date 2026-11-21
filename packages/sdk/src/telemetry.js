import { SpurvikTelemetryBufferError } from "./errors.js";
import { nodeProcess, unrefTimer } from "./runtime.js";
function isPromise(value) {
    return typeof value?.then === "function";
}
const exitQueues = new Set();
let exitListenerInstalled = false;
/** Queues the process-exit hook still retains. Idle empty queues are omitted. */
export function exitHookQueueCount() {
    return exitQueues.size;
}
function installExitListener() {
    const proc = nodeProcess();
    if (!proc || exitListenerInstalled)
        return;
    exitListenerInstalled = true;
    proc.on("beforeExit", () => {
        for (const queue of exitQueues)
            queue.flushOnceOnExit();
    });
}
/**
 * Non-blocking queue for tiers that allow loss.
 * `high_annex3` uses a durable buffer and does not drop. A failed durable
 * write rejects `enqueue` so the caller can see the gap instead of losing it.
 */
export class TelemetryQueue {
    options;
    buffer = [];
    droppedCount = 0;
    timer = null;
    working = Promise.resolve();
    stopped = false;
    exitHooked = false;
    exitFlushStarted = false;
    flushDepth = 0;
    flushDeadline = 0;
    /**
     * True while a flush's deadline still applies. A failed flush keeps it so
     * exit does not open a second window for the same batch. A new event
     * queued after that flush has returned clears it. An event queued while
     * the flush is still running sets `queuedDuringFlush` and clears it when
     * that flush finishes with events still waiting.
     */
    budgetActive = false;
    /** An event arrived with a flush in flight. Cleared when that flush unwinds. */
    queuedDuringFlush = false;
    flushTimeoutMs;
    durable;
    opening = null;
    instanceId = crypto.randomUUID();
    nextSeq = 1;
    constructor(options) {
        this.options = options;
        this.flushTimeoutMs = options.flushTimeoutMs ?? 8_000;
        this.durable = options.durable ?? null;
        if (this.durable) {
            this.instanceId = this.durable.instanceId;
            this.nextSeq = this.durable.allocateSeq();
        }
        if (options.strict && !options.durable && !options.openDurable && !nodeProcess()) {
            throw new SpurvikTelemetryBufferError("high_annex3 telemetry needs a durable buffer. Pass telemetry.durableBuffer or run on Node, where an on-disk buffer is opened automatically.");
        }
    }
    get dropped() {
        return this.droppedCount;
    }
    get size() {
        return this.buffer.length;
    }
    get strict() {
        return this.options.strict === true;
    }
    enqueue(event) {
        if (this.stopped)
            return Promise.resolve();
        if (!this.options.strict && !this.options.durable && !this.options.openDurable) {
            this.pushMemory(this.stamp(event));
            return Promise.resolve();
        }
        const run = this.working.then(() => this.enqueueDurable(event));
        this.working = run.then(() => undefined, () => undefined);
        return run;
    }
    async flush() {
        // A second caller joins the in-flight attempt and keeps its deadline.
        // Overwriting it is what stretched one awaited flush past the limit.
        if (this.flushDepth === 0)
            this.openDeadline();
        await this.runFlush();
    }
    async shutdown() {
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
    bindProcessHooks() {
        if (!nodeProcess() || this.exitHooked)
            return;
        this.exitHooked = true;
        installExitListener();
        this.retainForExit();
    }
    retainForExit() {
        if (!this.exitHooked || this.stopped)
            return;
        if (this.buffer.length === 0 && this.flushDepth === 0)
            return;
        exitQueues.add(this);
    }
    async releaseIfIdle() {
        if (!this.exitHooked)
            return;
        if (this.stopped) {
            exitQueues.delete(this);
            return;
        }
        if (this.flushDepth > 0 || this.buffer.length > 0 || this.opening)
            return;
        if (this.durable) {
            const peeked = this.durable.peek(1);
            const pending = isPromise(peeked) ? await peeked : peeked;
            if (this.stopped) {
                exitQueues.delete(this);
                return;
            }
            if (this.flushDepth > 0 || this.buffer.length > 0 || pending.length > 0)
                return;
        }
        exitQueues.delete(this);
        this.exitFlushStarted = false;
    }
    flushOnceOnExit() {
        if (this.stopped || this.exitFlushStarted)
            return;
        this.exitFlushStarted = true;
        // No new event after a failed flush: keep the time left, which is none
        // once the deadline has passed. A new event, including one queued while
        // the flush was still running, clears the budget first, so this opens a
        // fresh deadline for that later batch.
        if (!this.budgetActive)
            this.openDeadline();
        void this.runFlush();
    }
    openDeadline() {
        this.flushDeadline = Date.now() + this.flushTimeoutMs;
        this.budgetActive = true;
    }
    releaseBudget() {
        this.budgetActive = false;
    }
    /** A new event after a finished failed flush is not part of that attempt. */
    releaseSpentBudget() {
        if (this.flushDepth === 0 && this.budgetActive)
            this.releaseBudget();
    }
    /** A new event during an in-flight flush belongs to the next attempt. */
    markQueuedDuringFlush() {
        if (this.flushDepth > 0)
            this.queuedDuringFlush = true;
    }
    async runFlush() {
        this.disarm();
        this.flushDepth += 1;
        this.retainForExit();
        try {
            const run = this.working.then(() => this.drain());
            this.working = run.then(() => undefined, () => undefined);
            await run;
        }
        finally {
            this.flushDepth -= 1;
            // Nested flushes, including an interval flush that started while this
            // one was still sending, share the flag until the outermost one returns.
            if (this.flushDepth === 0) {
                if (this.queuedDuringFlush && this.buffer.length > 0)
                    this.releaseBudget();
                this.queuedDuringFlush = false;
            }
            await this.releaseIfIdle();
        }
    }
    stamp(event) {
        const clientSeq = event.clientSeq ?? this.nextSeq;
        if (event.clientSeq === undefined)
            this.nextSeq = clientSeq + 1;
        return {
            ...event,
            clientInstanceId: event.clientInstanceId ?? this.instanceId,
            clientSeq,
        };
    }
    pushMemory(event) {
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
    async enqueueDurable(event) {
        const durable = await this.ensureDurable();
        const stamped = this.stamp(event);
        try {
            const pending = durable.append([stamped]);
            if (isPromise(pending))
                await pending;
        }
        catch (error) {
            if (stamped.clientSeq !== undefined)
                this.nextSeq = Math.min(this.nextSeq, stamped.clientSeq);
            throw new SpurvikTelemetryBufferError(error instanceof Error ? error.message : "The durable telemetry buffer did not accept the event.");
        }
        if (this.buffer.length >= this.options.maxSize)
            this.buffer.shift();
        this.buffer.push(stamped);
        this.releaseSpentBudget();
        this.markQueuedDuringFlush();
        this.retainForExit();
        this.arm();
    }
    async ensureDurable() {
        if (this.durable)
            return this.durable;
        if (!this.opening) {
            const open = this.options.openDurable;
            if (!open) {
                throw new SpurvikTelemetryBufferError("A durable telemetry buffer is required and none is configured.");
            }
            this.opening = open().then((buffer) => {
                this.durable = buffer;
                this.instanceId = buffer.instanceId === "pending" ? this.instanceId : buffer.instanceId;
                const allocated = buffer.allocateSeq();
                if (allocated > 1)
                    this.nextSeq = allocated;
                return buffer;
            });
        }
        return this.opening;
    }
    arm() {
        if (this.timer || this.stopped)
            return;
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.flush();
        }, this.options.flushIntervalMs);
        unrefTimer(this.timer);
    }
    disarm() {
        if (!this.timer)
            return;
        clearTimeout(this.timer);
        this.timer = null;
    }
    async drain() {
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
                if (isPromise(acked))
                    await acked;
                const sent = new Set(batch.map((event) => event.eventId));
                this.buffer = this.buffer.filter((event) => !sent.has(event.eventId));
            }
            catch (error) {
                this.options.onError?.(error);
                return;
            }
        }
    }
    async drainMemory() {
        while (this.buffer.length > 0) {
            const batch = this.buffer.splice(0, this.options.maxBatch);
            try {
                await this.sendWithRetry(batch);
            }
            catch (error) {
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
    async sendWithRetry(batch) {
        let lastError;
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
            }
            catch (error) {
                const reason = controller.signal.reason;
                lastError = controller.signal.aborted && isTimeoutError(reason) ? reason : error;
                if (attempt === this.options.maxRetries || this.flushDeadline - Date.now() <= 0)
                    break;
                const backoff = Math.min(8_000, 200 * 2 ** attempt);
                const wait = Math.min(backoff, this.flushDeadline - Date.now());
                if (wait <= 0)
                    break;
                await this.options.sleep(wait);
            }
            finally {
                clearTimeout(timer);
            }
        }
        throw lastError instanceof Error ? lastError : new Error("Telemetry delivery failed.");
    }
}
function flushTimeoutError() {
    return new DOMException("The telemetry flush timed out.", "TimeoutError");
}
function isTimeoutError(error) {
    return error instanceof DOMException && error.name === "TimeoutError";
}
