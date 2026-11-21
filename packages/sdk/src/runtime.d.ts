interface NodeProcessLike {
    on(event: string, listener: () => void): void;
}
/** Node's `process`, when this bundle is not running on the edge. */
export declare function nodeProcess(): NodeProcessLike | undefined;
/** Allow the event loop to exit while a flush timer is armed. No-op in browsers. */
export declare function unrefTimer(timer: unknown): void;
export {};
