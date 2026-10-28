import { createHash } from "node:crypto";
import { mkdirSync, openSync, writeSync, fsyncSync, closeSync, existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TelemetryIngestEvent } from "@spurvik/core";
import type { DurableTelemetryBuffer } from "./buffer.js";

interface CursorFile {
  instanceId: string;
  nextSeq: number;
}

/**
 * On-disk JSONL buffer. `append` returns only after fsync.
 * The cursor file keeps the client sequence across restarts so a gap is
 * visible on the ledger if events are lost rather than quietly renumbered.
 */
export class FileTelemetryBuffer implements DurableTelemetryBuffer {
  readonly instanceId: string;
  private nextSeq: number;
  private readonly file: string;
  private readonly cursorPath: string;

  constructor(directory: string) {
    mkdirSync(directory, { recursive: true });
    this.file = join(directory, "pending.jsonl");
    this.cursorPath = join(directory, "cursor.json");
    const cursor = readCursor(this.cursorPath);
    this.instanceId = cursor.instanceId;
    this.nextSeq = cursor.nextSeq;
  }

  allocateSeq(): number {
    return this.nextSeq;
  }

  append(events: TelemetryIngestEvent[]): void {
    if (events.length === 0) return;
    const payload = events.map((event) => JSON.stringify(event)).join("\n") + "\n";
    const fd = openSync(this.file, "a");
    try {
      writeSync(fd, payload);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    for (const event of events) {
      if (event.clientSeq && event.clientSeq >= this.nextSeq) this.nextSeq = event.clientSeq + 1;
    }
    writeFileSync(this.cursorPath, JSON.stringify({ instanceId: this.instanceId, nextSeq: this.nextSeq }));
  }

  peek(limit: number): TelemetryIngestEvent[] {
    if (!existsSync(this.file)) return [];
    const events: TelemetryIngestEvent[] = [];
    for (const line of readFileSync(this.file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      events.push(JSON.parse(line) as TelemetryIngestEvent);
      if (events.length >= limit) break;
    }
    return events;
  }

  ack(eventIds: readonly string[]): void {
    if (!existsSync(this.file)) return;
    const drop = new Set(eventIds);
    const kept = readFileSync(this.file, "utf8")
      .split("\n")
      .filter((line) => {
        if (!line.trim()) return false;
        const event = JSON.parse(line) as TelemetryIngestEvent;
        return !drop.has(event.eventId);
      });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, kept.length > 0 ? `${kept.join("\n")}\n` : "");
    renameSync(tmp, this.file);
  }

  size(): number {
    return this.peek(Number.MAX_SAFE_INTEGER).length;
  }
}

export function fileTelemetryDirectory(apiKey: string): string {
  const id = createHash("sha256").update(apiKey).digest("hex").slice(0, 24);
  const next = join(tmpdir(), "spurvik-telemetry", id);
  const legacy = join(tmpdir(), "aegisai-telemetry", id);
  if (!existsSync(join(next, "cursor.json")) && existsSync(join(legacy, "cursor.json"))) return legacy;
  return next;
}

export function openFileTelemetryBuffer(apiKey: string): FileTelemetryBuffer {
  return new FileTelemetryBuffer(fileTelemetryDirectory(apiKey));
}

function readCursor(file: string): CursorFile {
  if (existsSync(file)) {
    const parsed = JSON.parse(readFileSync(file, "utf8")) as CursorFile;
    if (parsed.instanceId && parsed.nextSeq) return parsed;
  }
  const created = { instanceId: crypto.randomUUID(), nextSeq: 1 };
  writeFileSync(file, JSON.stringify(created));
  return created;
}
