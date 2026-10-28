interface NodeProcessLike {
  on(event: string, listener: () => void): void;
}

/** Node's `process`, when this bundle is not running on the edge. */
export function nodeProcess(): NodeProcessLike | undefined {
  const candidate = (globalThis as { process?: NodeProcessLike }).process;
  if (!candidate || typeof candidate.on !== "function") return undefined;
  return candidate;
}

/** Allow the event loop to exit while a flush timer is armed. No-op in browsers. */
export function unrefTimer(timer: unknown): void {
  if (typeof timer !== "object" || timer === null || !("unref" in timer)) return;
  const unref = (timer as { unref?: unknown }).unref;
  if (typeof unref === "function") unref.call(timer);
}
