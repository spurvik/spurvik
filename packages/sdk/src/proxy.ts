import type { SpurvikClient } from "./client.js";
import {
  applyMarkedText,
  extractDelta,
  extractOutput,
  isAsyncIterable,
  isProviderStreamMethod,
  modelFromResponse,
  readRequest,
  requestRecord,
  shouldIntercept,
  withOwnerDefaults,
  type RequestView,
} from "./extract.js";

export function wrapClient<T extends object>(client: T, spurvik: SpurvikClient): T & {
  _spurvik: SpurvikClient;
  /** @deprecated Use `_spurvik`. Removed in the next release. */
  _aegis: SpurvikClient;
} {
  return wrapValue(client, spurvik, [], true) as T & { _spurvik: SpurvikClient; _aegis: SpurvikClient };
}

function wrapValue(value: unknown, spurvik: SpurvikClient, path: string[], isRoot: boolean): unknown {
  if (typeof value === "function") {
    return wrapFunction(value as (...args: unknown[]) => unknown, undefined, spurvik, path);
  }
  if (!value || typeof value !== "object") return value;
  return new Proxy(value, {
    get(target, prop, receiver) {
      if (isRoot && (prop === "_spurvik" || prop === "_aegis")) return spurvik;
      if (typeof prop !== "string") return Reflect.get(target, prop, receiver);
      const next = Reflect.get(target, prop, receiver);
      const nextPath = [...path, prop];
      if (typeof next === "function") {
        return wrapFunction(next as (...args: unknown[]) => unknown, target, spurvik, nextPath);
      }
      if (next && typeof next === "object") return wrapValue(next, spurvik, nextPath, false);
      return next;
    },
  });
}

function wrapFunction(
  fn: (...args: unknown[]) => unknown,
  owner: unknown,
  spurvik: SpurvikClient,
  path: string[],
): (...args: unknown[]) => unknown {
  const bound = owner === undefined ? fn : (fn.bind(owner) as (...args: unknown[]) => unknown);
  if (!shouldIntercept(path)) {
    return (...args: unknown[]) => wrapSession(bound(...args), spurvik, path);
  }
  return (...args: unknown[]) => {
    const viewed = withOwnerDefaults(owner, readRequest(args));
    const request = isProviderStreamMethod(path) ? { ...viewed, stream: true } : viewed;
    const started = performance.now();
    const invoke = () => dispatchCall(bound, args, path, spurvik, request, started);
    if (!spurvik.enforcesHaltOnInference) return invoke();
    // The provider method is not called until the halt check resolves, so a
    // stop lands before the network request. The value returned to the caller
    // still matches the non-halt path: an API-promise shape, or a synchronous
    // event stream for `.stream()`.
    if (isSyncEventStream(path)) return gateEventStream(spurvik, invoke, path);
    return gateApiCall(spurvik, invoke);
  };
}

function dispatchCall(
  fn: (...args: unknown[]) => unknown,
  args: unknown[],
  path: string[],
  spurvik: SpurvikClient,
  request: RequestView,
  started: number,
): unknown {
  const returned = fn(...args);
  if (isAsyncIterable(returned) && !isThenable(returned)) {
    return wrapStream(returned, spurvik, path, request, requestRecord(args), started);
  }
  return trackReturned(returned, (resolved) => finishReturned(resolved, args, path, spurvik, request, started));
}

async function finishReturned(
  resolved: unknown,
  args: unknown[],
  path: string[],
  spurvik: SpurvikClient,
  request: RequestView,
  started: number,
): Promise<unknown> {
  if ((request.stream || isProviderStreamMethod(path)) && isAsyncIterable(resolved)) {
    return wrapStream(resolved, spurvik, path, request, requestRecord(args), started);
  }
  const output = extractOutput(resolved);
  const provenance = await spurvik.finishCall({
    path,
    request,
    requestBody: requestRecord(args),
    response: resolved,
    output,
    modelVersion: modelFromResponse(resolved) ?? request.model,
    latencyMs: Math.max(0, Math.round(performance.now() - started)),
  });
  if (provenance.markedOutput && spurvik.applyMarkedTextToContent) {
    applyMarkedText(resolved, provenance.markedOutput);
  }
  return attachProvenance(resolved, provenance);
}

const FINAL_READERS = ["finalResponse", "finalChatCompletion", "finalMessage", "finalText", "finalContent"] as const;

function wrapStream(
  source: AsyncIterable<unknown>,
  spurvik: SpurvikClient,
  path: string[],
  request: RequestView,
  requestBody: unknown,
  started: number,
): AsyncIterable<unknown> {
  let resolveProvenance!: (value: unknown) => void;
  let rejectProvenance!: (reason: unknown) => void;
  const provenance = new Promise((resolve, reject) => {
    resolveProvenance = resolve;
    rejectProvenance = reject;
  });
  void provenance.catch(() => undefined);

  const pieces: string[] = [];
  let lastChunk: unknown = null;
  let finalText: string | null | undefined;
  let finalValue: unknown = null;
  let finishing: Promise<void> | undefined;

  const noteChunk = (chunk: unknown): void => {
    lastChunk = chunk;
    const delta = extractDelta(chunk);
    if (delta) pieces.push(delta);
  };

  const noteFinal = (value: unknown): void => {
    if (finalText !== undefined) return;
    if (typeof value === "string") {
      finalText = value;
      finalValue = value;
      return;
    }
    const output = extractOutput(value);
    if (output !== null) {
      finalText = output;
      finalValue = value;
    }
  };

  const fail = (error: unknown): Promise<void> => {
    if (!finishing) {
      finishing = Promise.reject(error);
      void finishing.catch(() => undefined);
      rejectProvenance(error);
    }
    return finishing;
  };

  const finalize = (): Promise<void> => {
    if (finishing) return finishing;
    const output = finalText !== undefined ? finalText : pieces.length > 0 ? pieces.join("") : null;
    const response = finalValue ?? lastChunk;
    finishing = (async () => {
      try {
        const record = await spurvik.finishCall({
          path,
          request,
          requestBody,
          response,
          output,
          modelVersion: modelFromResponse(response) ?? request.model,
          latencyMs: Math.max(0, Math.round(performance.now() - started)),
        });
        resolveProvenance(record);
      } catch (error) {
        rejectProvenance(error);
        throw error;
      }
    })();
    return finishing;
  };

  const captureFinal = async (target: object): Promise<void> => {
    if (finalText !== undefined) return;
    const record = target as Record<string, unknown>;
    for (const name of FINAL_READERS) {
      const reader = record[name];
      if (typeof reader !== "function") continue;
      try {
        noteFinal(await (reader as () => Promise<unknown>).call(target));
        if (finalText !== undefined) return;
      } catch {
        // The helper rejects when the stream produced no message.
      }
    }
  };

  if (isEventSource(source)) {
    const listen = (event: string, handler: (...args: unknown[]) => void): void => {
      try {
        source.on(event, handler);
      } catch {
        // Some emitters reject unknown event names. The iterator path still records.
      }
    };
    for (const event of ["finalChatCompletion", "finalMessage", "finalResponse", "finalContent", "finalText"]) {
      listen(event, (payload: unknown) => {
        noteFinal(payload);
      });
    }
    listen("end", () => {
      void (async () => {
        try {
          if (source.errored || source.aborted) {
            await fail(new Error("The provider stream ended before a response was recorded."));
            return;
          }
          await captureFinal(source);
          await finalize();
        } catch {
          // fail() rejects the shared provenance promise. That promise already has a catch.
        }
      })();
    });
  }

  const iterator = async function* (): AsyncGenerator<unknown> {
    let failed = false;
    try {
      for await (const chunk of source) {
        noteChunk(chunk);
        yield chunk;
      }
      await finalize();
    } catch (error) {
      failed = true;
      await fail(error);
      throw error;
    } finally {
      if (!failed) await finalize();
    }
  };

  return new Proxy(source as object, {
    get(target, prop, receiver) {
      if (prop === "_spurvik_provenance" || prop === "_aegis_provenance") return provenance;
      if (prop === Symbol.asyncIterator) return () => iterator();
      // Getters such as Anthropic's `currentMessage` use private fields.
      // The proxy must not be the receiver, or the getter throws.
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      if (prop === "on" || prop === "once" || prop === "off") {
        return (event: unknown, listener: unknown) => {
          (value as (event: unknown, listener: unknown) => unknown).call(target, event, listener);
          return receiver;
        };
      }
      if (prop === "done") {
        return async (...methodArgs: unknown[]) => {
          const result = await (value as (...args: unknown[]) => Promise<unknown>).apply(target, methodArgs);
          await captureFinal(target);
          await finalize();
          return result;
        };
      }
      if (typeof prop === "string" && (FINAL_READERS as readonly string[]).includes(prop)) {
        return async (...methodArgs: unknown[]) => {
          const result = await (value as (...args: unknown[]) => Promise<unknown>).apply(target, methodArgs);
          noteFinal(result);
          await finalize();
          return result;
        };
      }
      return (value as (...args: unknown[]) => unknown).bind(target);
    },
    has(target, prop) {
      // provenanceOf uses `in`. Without this trap that check looks at the raw stream.
      if (prop === "_spurvik_provenance" || prop === "_aegis_provenance") return true;
      return Reflect.has(target, prop);
    },
  }) as AsyncIterable<unknown>;
}

function attachProvenance<T>(result: T, provenance: unknown): T {
  if (!result || typeof result !== "object") return result;
  try {
    for (const key of ["_spurvik_provenance", "_aegis_provenance"] as const) {
      Object.defineProperty(result, key, {
        value: provenance,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return result;
  } catch {
    return new Proxy(result as object, {
      get(target, prop, receiver) {
        if (prop === "_spurvik_provenance" || prop === "_aegis_provenance") return provenance;
        return Reflect.get(target, prop, receiver);
      },
    }) as T;
  }
}

interface ResponseHelpers {
  withResponse?: (...args: unknown[]) => Promise<Record<string, unknown> & { data: unknown }>;
  asResponse?: (...args: unknown[]) => Promise<Response>;
}

function trackReturned(returned: unknown, transform: (value: unknown) => Promise<unknown> | unknown): unknown {
  const helpers = responseHelpers(returned);
  if (!helpers) return Promise.resolve(returned).then(transform);

  let inner: Promise<unknown> | undefined;
  const apply = (value: unknown): Promise<unknown> => {
    if (!inner) {
      inner = Promise.resolve(transform(value));
      void inner.catch(() => undefined);
    }
    return inner;
  };
  let adopted: Promise<unknown> | undefined;
  const start = (): Promise<unknown> => {
    if (!adopted) adopted = Promise.resolve(returned).then((value) => apply(value));
    return adopted;
  };

  return {
    then(
      onFulfilled?: ((value: unknown) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) {
      return start().then(onFulfilled, onRejected);
    },
    catch(onRejected?: ((reason: unknown) => unknown) | null) {
      return start().catch(onRejected);
    },
    finally(onFinally?: (() => void) | null) {
      return start().finally(onFinally);
    },
    ...(helpers.withResponse
      ? {
          async withResponse(...args: unknown[]) {
            const wrapped = await helpers.withResponse!(...args);
            return { ...wrapped, data: await apply(wrapped.data) };
          },
        }
      : {}),
    ...(helpers.asResponse
      ? {
          asResponse(...args: unknown[]) {
            return helpers.asResponse!(...args);
          },
        }
      : {}),
  };
}

/**
 * Keep a thenable from being adopted by `Promise.resolve` or `.then`.
 * OpenAI and Anthropic return API promises. Awaiting a promise that adopted
 * one of those would drop `withResponse` and `asResponse`.
 */
function box<T>(value: T): Promise<{ current: T }> {
  return new Promise((resolve) => {
    resolve({ current: value });
  });
}

function afterHalt(spurvik: SpurvikClient, invoke: () => unknown): Promise<{ current: unknown }> {
  return spurvik.beforeInference().then(() => box(invoke()));
}

function gateApiCall(spurvik: SpurvikClient, invoke: () => unknown): unknown {
  let ready: Promise<{ current: unknown }> | undefined;
  const begin = (): Promise<{ current: unknown }> => {
    if (!ready) ready = afterHalt(spurvik, invoke);
    return ready;
  };
  const settled = () => begin().then((boxed) => Promise.resolve(boxed.current));

  return {
    then(
      onFulfilled?: ((value: unknown) => unknown) | null,
      onRejected?: ((reason: unknown) => unknown) | null,
    ) {
      return settled().then(onFulfilled, onRejected);
    },
    catch(onRejected?: ((reason: unknown) => unknown) | null) {
      return settled().catch(onRejected);
    },
    finally(onFinally?: (() => void) | null) {
      return settled().finally(onFinally ?? undefined);
    },
    async withResponse(...args: unknown[]) {
      const helpers = responseHelpers((await begin()).current);
      if (!helpers?.withResponse) {
        throw new TypeError("This call does not expose withResponse().");
      }
      return helpers.withResponse(...args);
    },
    async asResponse(...args: unknown[]) {
      const helpers = responseHelpers((await begin()).current);
      if (!helpers?.asResponse) {
        throw new TypeError("This call does not expose asResponse().");
      }
      return helpers.asResponse(...args);
    },
  };
}

interface QueuedListener {
  method: "on" | "once" | "off";
  event: unknown;
  listener: (...args: unknown[]) => void;
}

const BASE_STREAM_PROMISES = new Set(["done", "emitted"]);
const NO_EXTRAS = new Set<string>();
const CHAT_STREAM_METHODS = new Set([
  "finalChatCompletion",
  "finalContent",
  "finalFunctionToolCall",
  "finalFunctionToolCallResult",
  "finalMessage",
  "totalUsage",
]);
const MESSAGE_STREAM_GETTERS = new Set(["currentMessage", "messages"]);
const MESSAGE_STREAM_METHODS = new Set(["finalMessage", "finalText", "withResponse"]);
const RESPONSE_STREAM_METHODS = new Set(["finalResponse"]);

interface StreamShape {
  /** The SDK stream has `toReadableStream()`. Responses streams do not. */
  readable: boolean;
  getters: ReadonlySet<string>;
  methods: ReadonlySet<string>;
}

/**
 * Members the real helper exposes. The facade must not invent the rest:
 * a missing `toReadableStream()` would otherwise yield an empty stream.
 */
function streamShape(path: readonly string[]): StreamShape {
  const full = path.join(".");
  if (full.endsWith("chat.completions.stream")) {
    return { readable: true, getters: NO_EXTRAS, methods: CHAT_STREAM_METHODS };
  }
  if (full === "messages.stream" || full.endsWith(".messages.stream")) {
    return { readable: true, getters: MESSAGE_STREAM_GETTERS, methods: MESSAGE_STREAM_METHODS };
  }
  if (full.endsWith("responses.stream")) {
    return { readable: false, getters: NO_EXTRAS, methods: RESPONSE_STREAM_METHODS };
  }
  return { readable: false, getters: NO_EXTRAS, methods: NO_EXTRAS };
}

/**
 * `.stream()` helpers return an event stream before their HTTP call, which
 * itself starts on a later turn. This facade keeps that shape while the halt
 * check is in flight: getters stay values, and `toReadableStream()` stays a
 * synchronous ReadableStream. Listeners registered before the check finishes
 * are attached before the provider stream starts emitting. A stop emits
 * `error` and then `end` to those listeners and never calls the provider.
 */
function gateEventStream(spurvik: SpurvikClient, invoke: () => unknown, path: readonly string[]): unknown {
  const shape = streamShape(path);
  const local: Array<{ event: string; listener: (...args: unknown[]) => void; once: boolean }> = [];
  let real: object | undefined;
  let opened = false;
  let ended = false;
  let errored = false;
  let aborted = false;
  let failed = false;
  let catching = false;
  let cancelled = false;
  let cancelError: unknown;
  let ready: Promise<object> | undefined;
  let resolveReady: ((stream: object) => void) | undefined;
  let rejectReady: ((error: unknown) => void) | undefined;

  const remember = (event: string): Array<(...args: unknown[]) => void> => {
    const matched = local.filter((item) => item.event === event);
    for (let index = local.length - 1; index >= 0; index -= 1) {
      const item = local[index];
      if (item && item.event === event && item.once) local.splice(index, 1);
    }
    return matched.map((item) => item.listener);
  };

  const failClosed = (error: unknown): void => {
    if (failed || opened) return;
    failed = true;
    errored = true;
    const errorListeners = remember("error");
    for (const listener of errorListeners) listener(error);
    if (!catching && errorListeners.length === 0) {
      void Promise.reject(error);
    }
    ended = true;
    for (const listener of remember("end")) listener();
  };

  const begin = (): Promise<object> => {
    if (!ready) {
      ready = new Promise<object>((resolve, reject) => {
        resolveReady = resolve;
        rejectReady = reject;
      });
      // `abort()` rejects this immediately. The halt check may settle later.
      void ready.catch(() => undefined);
      const openedStream = afterHalt(spurvik, () => {
        if (cancelled) throw cancelError;
        const stream = invoke();
        if (!stream || typeof stream !== "object") {
          throw new TypeError("Expected a provider stream.");
        }
        real = stream;
        opened = true;
        return stream;
      }).then(
        () => {
          if (cancelled) throw cancelError;
          for (const item of local.splice(0)) {
            callListener(real as object, { method: item.once ? "once" : "on", event: item.event, listener: item.listener });
          }
          return real as object;
        },
        (error: unknown) => {
          if (cancelled) throw cancelError;
          throw error;
        },
      );
      void openedStream.then(
        (stream) => {
          if (cancelled) return;
          resolveReady?.(stream);
        },
        (error: unknown) => {
          // Abort already failed the stream. Swallow the late halt result.
          if (cancelled) return;
          failClosed(error);
          rejectReady?.(error);
        },
      );
    }
    return ready;
  };

  const callWhenReady = (prop: PropertyKey, methodArgs: unknown[]): Promise<unknown> => {
    catching = true;
    return begin().then((stream) => {
      const value = (stream as Record<PropertyKey, unknown>)[prop];
      if (typeof value !== "function") return value;
      return (value as (...args: unknown[]) => unknown).apply(stream, methodArgs);
    });
  };

  const facade = new Proxy(Object.create(null) as object, {
    get(_target, prop, receiver) {
      if (prop === "then") return undefined;
      if (prop === "_spurvik_provenance" || prop === "_aegis_provenance") {
        return begin().then((stream) => (stream as Record<PropertyKey, unknown>)[prop]);
      }
      if (prop === Symbol.asyncIterator) {
        return async function* () {
          catching = true;
          yield* (await begin()) as AsyncIterable<unknown>;
        };
      }
      if (opened && real && prop !== "on" && prop !== "once" && prop !== "off") {
        return Reflect.get(real, prop);
      }
      if (prop === "on" || prop === "once") {
        return (event: unknown, listener: (...args: unknown[]) => void) => {
          const name = String(event);
          if (opened && real) callListener(real, { method: prop, event, listener });
          else local.push({ event: name, listener, once: prop === "once" });
          return receiver;
        };
      }
      if (prop === "off") {
        return (event: unknown, listener: (...args: unknown[]) => void) => {
          if (opened && real) callListener(real, { method: "off", event, listener });
          else {
            const index = local.findIndex((item) => item.event === String(event) && item.listener === listener);
            if (index >= 0) local.splice(index, 1);
          }
          return receiver;
        };
      }
      if (prop === "toReadableStream") {
        if (!shape.readable) return undefined;
        // Mark the halt rejection handled before failClosed can reject a
        // second, uncaught promise. The reader still observes the error.
        return () => bridgeReadable(begin, () => {
          catching = true;
        });
      }
      if (prop === "ended") return ended;
      if (prop === "errored") return errored;
      if (prop === "aborted") return aborted;
      if (typeof prop === "string" && shape.getters.has(prop)) return undefined;
      if (typeof prop === "string" && (BASE_STREAM_PROMISES.has(prop) || shape.methods.has(prop))) {
        return (...methodArgs: unknown[]) => callWhenReady(prop, methodArgs);
      }
      if (prop === "abort") {
        return () => {
          if (opened && real) {
            const abort = (real as { abort?: () => void }).abort;
            if (typeof abort === "function") abort.call(real);
            return;
          }
          if (cancelled) return;
          cancelled = true;
          catching = true;
          aborted = true;
          cancelError = new DOMException("The stream was aborted.", "AbortError");
          failClosed(cancelError);
          rejectReady?.(cancelError);
        };
      }
      return undefined;
    },
    has(_target, prop) {
      if (prop === "_spurvik_provenance" || prop === "_aegis_provenance") return true;
      if (opened && real) return Reflect.has(real, prop);
      if (prop === "toReadableStream") return shape.readable;
      if (typeof prop === "string" && shape.getters.has(prop)) return true;
      return (
        prop === "on" ||
        prop === "once" ||
        prop === "off" ||
        prop === "abort" ||
        prop === "ended" ||
        prop === "errored" ||
        prop === "aborted" ||
        (typeof prop === "string" && (BASE_STREAM_PROMISES.has(prop) || shape.methods.has(prop)))
      );
    },
  });

  void begin();
  return facade;
}

function bridgeReadable(begin: () => Promise<object>, markHandled: () => void): ReadableStream<Uint8Array> {
  markHandled();
  const pending = begin();
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        const stream = await pending;
        const toReadable = (stream as { toReadableStream?: () => ReadableStream<Uint8Array> }).toReadableStream;
        if (typeof toReadable !== "function") {
          controller.error(new TypeError("This stream has no toReadableStream()."));
          return;
        }
        const reader = toReadable.call(stream).getReader();
        for (;;) {
          const next = await reader.read();
          if (next.done) {
            controller.close();
            return;
          }
          controller.enqueue(next.value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

function callListener(stream: object, call: QueuedListener): void {
  const method = (stream as Record<PropertyKey, unknown>)[call.method];
  if (typeof method !== "function") return;
  (method as (event: unknown, listener: unknown) => unknown).call(stream, call.event, call.listener);
}

/** `chat.completions.stream`, `responses.stream`, and `messages.stream` are synchronous. */
function isSyncEventStream(path: readonly string[]): boolean {
  return path[path.length - 1] === "stream";
}

function responseHelpers(value: unknown): ResponseHelpers | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as ResponseHelpers;
  if (typeof record.withResponse !== "function" && typeof record.asResponse !== "function") return undefined;
  return {
    ...(typeof record.withResponse === "function" ? { withResponse: record.withResponse.bind(value) } : {}),
    ...(typeof record.asResponse === "function" ? { asResponse: record.asResponse.bind(value) } : {}),
  };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

function isSession(value: unknown): value is object {
  if (!value || typeof value !== "object") return false;
  const record = value as { sendMessage?: unknown; sendMessageStream?: unknown };
  return typeof record.sendMessage === "function" || typeof record.sendMessageStream === "function";
}

function wrapSession(value: unknown, spurvik: SpurvikClient, path: string[]): unknown {
  if (isSession(value)) return wrapValue(value, spurvik, path, false);
  if (isThenable(value)) {
    return Promise.resolve(value).then((resolved) => (isSession(resolved) ? wrapValue(resolved, spurvik, path, false) : resolved));
  }
  return value;
}

function isEventSource(value: object): value is {
  on: (event: string, listener: (...args: unknown[]) => void) => unknown;
  errored?: boolean;
  aborted?: boolean;
} {
  return typeof (value as { on?: unknown }).on === "function";
}
