import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import type { OversightStateWire } from "@spurvik/core";
import type { ResolvedSpurvikConfig } from "./config.js";
import { SpurvikApiError, SpurvikHaltedError, SpurvikOversightTimeoutError } from "./errors.js";
import { nodeProcess, unrefTimer } from "./runtime.js";
import type { ControlPlaneClient } from "./transport.js";

/**
 * Last-known human stop state. Inference enforcement uses this cache so a
 * model call does not wait on the control plane after the first refresh.
 */
export class OversightCache {
  private projectHalted = false;
  private readonly actions = new Map<string, boolean>();
  private fetchedAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pushAbort: AbortController | null = null;
  /** Halt checks the caller is waiting on. They share one request. */
  private referenced: Promise<OversightStateWire> | null = null;
  /** Background poll. A second tick must not start another GET. */
  private background: Promise<void> | null = null;
  private backgroundAbort: AbortController | null = null;

  constructor(
    private readonly transport: ControlPlaneClient,
    private readonly config: ResolvedSpurvikConfig,
  ) {}

  isHalted(actionName?: string): boolean {
    if (this.projectHalted) return true;
    if (actionName && this.actions.get(actionName) === true) return true;
    return false;
  }

  noteLocal(actionName: string | null, halted: boolean): void {
    if (actionName) this.actions.set(actionName, halted);
    else this.projectHalted = halted;
    this.fetchedAt = Date.now();
  }

  async refresh(actionName?: string): Promise<OversightStateWire> {
    if (!actionName && this.referenced) return this.referenced;
    const run = this.load(actionName);
    if (!actionName) {
      this.referenced = run;
      // `finally` re-rejects. Swallow that copy so a handled halt timeout
      // does not also surface as an unhandled rejection.
      void run.finally(() => {
        if (this.referenced === run) this.referenced = null;
      }).catch(() => undefined);
    }
    return run;
  }

  private async load(actionName?: string): Promise<OversightStateWire> {
    const query = actionName ? `?actionName=${encodeURIComponent(actionName)}` : "";
    let state: OversightStateWire;
    try {
      state = await this.transport.get<OversightStateWire>(`/api/v1/oversight${query}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") throw new SpurvikOversightTimeoutError();
      throw error;
    }
    this.apply(state);
    return state;
  }

  private apply(state: OversightStateWire): void {
    this.projectHalted = state.projectHalted;
    if (state.actionName) this.actions.set(state.actionName, state.actionHalted);
    this.fetchedAt = Date.now();
  }

  invalidate(): void {
    this.fetchedAt = 0;
  }

  async ensureFresh(actionName?: string): Promise<void> {
    const windowMs = this.config.oversightCacheMs;
    const stale = windowMs === 0 || this.fetchedAt === 0 || Date.now() - this.fetchedAt > windowMs;
    if (stale) await this.refresh(actionName);
  }

  async assertNotHalted(actionName?: string): Promise<void> {
    await this.ensureFresh(actionName);
    if (this.isHalted(actionName)) throw new SpurvikHaltedError(actionName);
  }

  startBackgroundRefresh(): void {
    if (!this.config.enforceHaltOnInference || this.timer || this.config.oversightCacheMs === 0) return;
    const tick = (): void => {
      this.timer = setTimeout(tick, this.config.oversightCacheMs);
      unrefTimer(this.timer);
      if (this.referenced || this.background) return;
      const abort = new AbortController();
      this.backgroundAbort = abort;
      const run = this.refreshInBackground(abort.signal).finally(() => {
        if (this.background === run) {
          this.background = null;
          if (this.backgroundAbort === abort) this.backgroundAbort = null;
        }
      });
      this.background = run;
    };
    this.timer = setTimeout(tick, this.config.oversightCacheMs);
    unrefTimer(this.timer);
  }

  startPushInvalidation(): void {
    if (!this.config.oversightPushInvalidation || this.pushAbort) return;
    const abort = new AbortController();
    this.pushAbort = abort;
    void this.readPush(abort.signal);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.backgroundAbort?.abort();
    this.backgroundAbort = null;
    this.pushAbort?.abort();
    this.pushAbort = null;
  }

  /**
   * Best-effort poll. On Node the GET is unref'd, so a server that never
   * answers does not keep the process alive. `config.fetch` is not used for
   * that request: a fetch socket stays referenced for the whole timeout.
   * Halt checks the caller awaits still go through `config.fetch`.
   */
  private async refreshInBackground(signal: AbortSignal): Promise<void> {
    try {
      const state = nodeProcess()
        ? await this.readUnrefJson<OversightStateWire>("/api/v1/oversight", signal)
        : await this.load();
      if (signal.aborted) return;
      if (nodeProcess()) this.apply(state);
    } catch {
      // The next inference call reads the control plane itself.
    }
  }

  private async readPush(signal: AbortSignal): Promise<void> {
    try {
      if (nodeProcess()) {
        await this.readPushNode(signal);
        return;
      }
      const timeout = AbortSignal.timeout(this.config.telemetry.requestTimeoutMs);
      const response = await this.config.fetch(`${this.config.baseUrl}/api/v1/oversight/stream`, {
        headers: {
          authorization: `Bearer ${this.config.apiKey}`,
          accept: "text/event-stream",
        },
        signal: AbortSignal.any([signal, timeout]),
      });
      if (!response.body) return;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) return;
        buffer += decoder.decode(chunk.value, { stream: true });
        if (!buffer.includes("\n\n")) continue;
        buffer = "";
        this.invalidate();
        void this.refresh().catch(() => undefined);
      }
    } catch {
      // The stream is best-effort. Inference still refreshes on the cache window.
    }
  }

  /**
   * Node's fetch socket keeps the process alive for as long as the body is
   * open, and that socket cannot be unref'd. This request uses `node:http`
   * so a short-lived process can exit while the stream is up. It therefore
   * does not go through `config.fetch`. Halt checks, telemetry, and this
   * stream off Node still use `config.fetch`. `shutdown()` aborts `signal`.
   * Headers that never arrive are dropped after the request timeout.
   */
  private readPushNode(signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      let headersSeen = false;
      let headersTimer: ReturnType<typeof setTimeout> | undefined;
      const url = new URL(`${this.config.baseUrl}/api/v1/oversight/stream`);
      const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
      const req = transport(
        url,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            accept: "text/event-stream",
          },
          signal,
        },
        (res: IncomingMessage) => {
          headersSeen = true;
          if (headersTimer) clearTimeout(headersTimer);
          res.socket?.unref();
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            res.resume();
            resolve();
            return;
          }
          res.setEncoding("utf8");
          let buffer = "";
          res.on("data", (chunk: string) => {
            buffer += chunk;
            if (!buffer.includes("\n\n")) return;
            buffer = "";
            this.invalidate();
            void this.refresh().catch(() => undefined);
          });
          res.on("end", () => resolve());
          res.on("error", () => resolve());
        },
      );
      headersTimer = setTimeout(() => {
        if (!headersSeen) req.destroy();
      }, this.config.telemetry.requestTimeoutMs);
      unrefTimer(headersTimer);
      const unref = (req as { unref?: () => void }).unref;
      if (typeof unref === "function") unref.call(req);
      req.on("socket", (socket) => socket.unref());
      req.on("error", () => {
        if (headersTimer) clearTimeout(headersTimer);
        resolve();
      });
      req.on("close", () => {
        if (headersTimer) clearTimeout(headersTimer);
        resolve();
      });
      req.end();
    });
  }

  /**
   * One JSON GET that does not pin the event loop. The timeout timer is
   * unref'd as well, so neither the socket nor the deadline keeps a short
   * process running.
   */
  private readUnrefJson<T>(path: string, signal: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason instanceof Error ? signal.reason : new DOMException("The operation was aborted.", "AbortError"));
        return;
      }
      const url = new URL(`${this.config.baseUrl}${path}`);
      const transport = url.protocol === "https:" ? httpsRequest : httpRequest;
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (error: unknown, value?: T): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        signal.removeEventListener("abort", onAbort);
        if (error) reject(error);
        else resolve(value as T);
      };
      const onAbort = (): void => {
        req.destroy();
        const reason = signal.reason;
        finish(reason instanceof Error ? reason : new DOMException("The operation was aborted.", "AbortError"));
      };
      const req = transport(
        url,
        {
          method: "GET",
          headers: {
            authorization: `Bearer ${this.config.apiKey}`,
            accept: "application/json",
          },
        },
        (res) => {
          const status = res.statusCode ?? 0;
          if (status < 200 || status >= 300) {
            res.resume();
            finish(new SpurvikApiError(status, "request_failed", `Control plane responded ${status}.`));
            return;
          }
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer | string) => {
            chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
          });
          res.on("end", () => {
            try {
              const payload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { data?: T };
              if (!payload || !("data" in payload)) {
                finish(new Error("Control plane response had no data."));
                return;
              }
              finish(null, payload.data as T);
            } catch (error) {
              finish(error);
            }
          });
          res.on("error", (error) => finish(error));
        },
      );
      timer = setTimeout(() => {
        req.destroy();
        finish(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      }, this.config.telemetry.requestTimeoutMs);
      unrefTimer(timer);
      signal.addEventListener("abort", onAbort, { once: true });
      unrefClientRequest(req);
      req.on("error", (error) => finish(error));
      req.end();
    });
  }
}

function unrefClientRequest(req: { on(event: "socket", listener: (socket: { unref?: () => void }) => void): void }): void {
  const unref = (req as { unref?: () => void }).unref;
  if (typeof unref === "function") unref.call(req);
  req.on("socket", (socket) => {
    if (typeof socket.unref === "function") socket.unref();
  });
}
