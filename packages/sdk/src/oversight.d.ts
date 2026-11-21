import type { OversightStateWire } from "@spurvik/core";
import type { ResolvedSpurvikConfig } from "./config.js";
import type { ControlPlaneClient } from "./transport.js";
/**
 * Last-known human stop state. Inference enforcement uses this cache so a
 * model call does not wait on the control plane after the first refresh.
 */
export declare class OversightCache {
    private readonly transport;
    private readonly config;
    private projectHalted;
    private readonly actions;
    private fetchedAt;
    private timer;
    private pushAbort;
    /** Halt checks the caller is waiting on. They share one request. */
    private referenced;
    /** Background poll. A second tick must not start another GET. */
    private background;
    private backgroundAbort;
    constructor(transport: ControlPlaneClient, config: ResolvedSpurvikConfig);
    isHalted(actionName?: string): boolean;
    noteLocal(actionName: string | null, halted: boolean): void;
    refresh(actionName?: string): Promise<OversightStateWire>;
    private load;
    private apply;
    invalidate(): void;
    ensureFresh(actionName?: string): Promise<void>;
    assertNotHalted(actionName?: string): Promise<void>;
    startBackgroundRefresh(): void;
    startPushInvalidation(): void;
    stop(): void;
    /**
     * Best-effort poll. On Node the GET is unref'd, so a server that never
     * answers does not keep the process alive. `config.fetch` is not used for
     * that request: a fetch socket stays referenced for the whole timeout.
     * Halt checks the caller awaits still go through `config.fetch`.
     */
    private refreshInBackground;
    private readPush;
    /**
     * Node's fetch socket keeps the process alive for as long as the body is
     * open, and that socket cannot be unref'd. This request uses `node:http`
     * so a short-lived process can exit while the stream is up. It therefore
     * does not go through `config.fetch`. Halt checks, telemetry, and this
     * stream off Node still use `config.fetch`. `shutdown()` aborts `signal`.
     * Headers that never arrive are dropped after the request timeout.
     */
    private readPushNode;
    /**
     * One JSON GET that does not pin the event loop. The timeout timer is
     * unref'd as well, so neither the socket nor the deadline keeps a short
     * process running.
     */
    private readUnrefJson;
}
