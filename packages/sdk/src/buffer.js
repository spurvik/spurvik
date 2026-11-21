/** In-memory buffer. Useful for tests and for a caller-supplied KV adapter's unit stand-in. */
export class MemoryTelemetryBuffer {
    instanceId;
    nextSeq = 1;
    events = [];
    constructor(instanceId = crypto.randomUUID()) {
        this.instanceId = instanceId;
    }
    allocateSeq() {
        return this.nextSeq;
    }
    append(events) {
        this.events.push(...events);
        for (const event of events) {
            if (event.clientSeq && event.clientSeq >= this.nextSeq)
                this.nextSeq = event.clientSeq + 1;
        }
    }
    peek(limit) {
        return this.events.slice(0, limit);
    }
    ack(eventIds) {
        const drop = new Set(eventIds);
        this.events = this.events.filter((event) => !drop.has(event.eventId));
    }
    size() {
        return this.events.length;
    }
}
/**
 * Pluggable key-value buffer. One key holds the unacknowledged events and the
 * sequence cursor, so a restart continues the same client sequence.
 */
export class KvTelemetryBuffer {
    kv;
    key;
    loaded = null;
    constructor(kv, key = "spurvik:telemetry") {
        this.kv = kv;
        this.key = key;
    }
    /** Previous default key. Read once when the new key is empty. */
    legacyKey = "aegis:telemetry";
    get instanceId() {
        return this.loaded?.instanceId ?? "pending";
    }
    allocateSeq() {
        return this.loaded?.nextSeq ?? 1;
    }
    async append(events) {
        const state = await this.read();
        state.events.push(...events);
        for (const event of events) {
            if (event.clientSeq && event.clientSeq >= state.nextSeq)
                state.nextSeq = event.clientSeq + 1;
        }
        await this.kv.set(this.key, JSON.stringify(state));
        this.loaded = state;
    }
    async peek(limit) {
        const state = await this.read();
        return state.events.slice(0, limit);
    }
    async ack(eventIds) {
        const state = await this.read();
        const drop = new Set(eventIds);
        state.events = state.events.filter((event) => !drop.has(event.eventId));
        await this.kv.set(this.key, JSON.stringify(state));
        this.loaded = state;
    }
    async size() {
        const state = await this.read();
        return state.events.length;
    }
    async read() {
        if (this.loaded)
            return this.loaded;
        const raw = (await this.kv.get(this.key)) ?? (this.key === "spurvik:telemetry" ? await this.kv.get(this.legacyKey) : null);
        if (!raw) {
            this.loaded = { instanceId: crypto.randomUUID(), nextSeq: 1, events: [] };
            await this.kv.set(this.key, JSON.stringify(this.loaded));
            return this.loaded;
        }
        this.loaded = JSON.parse(raw);
        return this.loaded;
    }
}
