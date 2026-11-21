/** Node's `process`, when this bundle is not running on the edge. */
export function nodeProcess() {
    const candidate = globalThis.process;
    if (!candidate || typeof candidate.on !== "function")
        return undefined;
    return candidate;
}
/** Allow the event loop to exit while a flush timer is armed. No-op in browsers. */
export function unrefTimer(timer) {
    if (typeof timer !== "object" || timer === null || !("unref" in timer))
        return;
    const unref = timer.unref;
    if (typeof unref === "function")
        unref.call(timer);
}
