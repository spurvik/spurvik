import { applyMarkedText, extractDelta, extractOutput, isAsyncIterable, isProviderStreamMethod, modelFromResponse, readRequest, requestRecord, shouldIntercept, withOwnerDefaults, } from "./extract.js";
export function wrapClient(client, spurvik) {
    return wrapValue(client, spurvik, [], true);
}
function wrapValue(value, spurvik, path, isRoot) {
    if (typeof value === "function") {
        return wrapFunction(value, undefined, spurvik, path);
    }
    if (!value || typeof value !== "object")
        return value;
    return new Proxy(value, {
        get(target, prop, receiver) {
            if (isRoot && (prop === "_spurvik" || prop === "_aegis"))
                return spurvik;
            if (typeof prop !== "string")
                return Reflect.get(target, prop, receiver);
            const next = Reflect.get(target, prop, receiver);
            const nextPath = [...path, prop];
            if (typeof next === "function") {
                return wrapFunction(next, target, spurvik, nextPath);
            }
            if (next && typeof next === "object")
                return wrapValue(next, spurvik, nextPath, false);
            return next;
        },
    });
}
function wrapFunction(fn, owner, spurvik, path) {
    const bound = owner === undefined ? fn : fn.bind(owner);
    if (!shouldIntercept(path)) {
        return (...args) => wrapSession(bound(...args), spurvik, path);
    }
    return (...args) => {
        const viewed = withOwnerDefaults(owner, readRequest(args));
        const request = isProviderStreamMethod(path) ? { ...viewed, stream: true } : viewed;
        const started = performance.now();
        const invoke = () => dispatchCall(bound, args, path, spurvik, request, started);
        if (!spurvik.enforcesHaltOnInference)
            return invoke();
        // The provider method is not called until the halt check resolves, so a
        // stop lands before the network request. The value returned to the caller
        // still matches the non-halt path: an API-promise shape, or a synchronous
        // event stream for `.stream()`.
        if (isSyncEventStream(path))
            return gateEventStream(spurvik, invoke, path);
        return gateApiCall(spurvik, invoke);
    };
}
function dispatchCall(fn, args, path, spurvik, request, started) {
    const returned = fn(...args);
    if (isAsyncIterable(returned) && !isThenable(returned)) {
        return wrapStream(returned, spurvik, path, request, requestRecord(args), started);
    }
    return trackReturned(returned, (resolved) => finishReturned(resolved, args, path, spurvik, request, started));
}
async function finishReturned(resolved, args, path, spurvik, request, started) {
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
const FINAL_READERS = ["finalResponse", "finalChatCompletion", "finalMessage", "finalText", "finalContent"];
function wrapStream(source, spurvik, path, request, requestBody, started) {
    let resolveProvenance;
    let rejectProvenance;
    const provenance = new Promise((resolve, reject) => {
        resolveProvenance = resolve;
        rejectProvenance = reject;
    });
    void provenance.catch(() => undefined);
    const pieces = [];
    let lastChunk = null;
    let finalText;
    let finalValue = null;
    let finishing;
    const noteChunk = (chunk) => {
        lastChunk = chunk;
        const delta = extractDelta(chunk);
        if (delta)
            pieces.push(delta);
    };
    const noteFinal = (value) => {
        if (finalText !== undefined)
            return;
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
    const fail = (error) => {
        if (!finishing) {
            finishing = Promise.reject(error);
            void finishing.catch(() => undefined);
            rejectProvenance(error);
        }
        return finishing;
    };
    const finalize = () => {
        if (finishing)
            return finishing;
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
            }
            catch (error) {
                rejectProvenance(error);
                throw error;
            }
        })();
        return finishing;
    };
    const captureFinal = async (target) => {
        if (finalText !== undefined)
            return;
        const record = target;
        for (const name of FINAL_READERS) {
            const reader = record[name];
            if (typeof reader !== "function")
                continue;
            try {
                noteFinal(await reader.call(target));
                if (finalText !== undefined)
                    return;
            }
            catch {
                // The helper rejects when the stream produced no message.
            }
        }
    };
    if (isEventSource(source)) {
        const listen = (event, handler) => {
            try {
                source.on(event, handler);
            }
            catch {
                // Some emitters reject unknown event names. The iterator path still records.
            }
        };
        for (const event of ["finalChatCompletion", "finalMessage", "finalResponse", "finalContent", "finalText"]) {
            listen(event, (payload) => {
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
                }
                catch {
                    // fail() rejects the shared provenance promise. That promise already has a catch.
                }
            })();
        });
    }
    const iterator = async function* () {
        let failed = false;
        try {
            for await (const chunk of source) {
                noteChunk(chunk);
                yield chunk;
            }
            await finalize();
        }
        catch (error) {
            failed = true;
            await fail(error);
            throw error;
        }
        finally {
            if (!failed)
                await finalize();
        }
    };
    return new Proxy(source, {
        get(target, prop, receiver) {
            if (prop === "_spurvik_provenance" || prop === "_aegis_provenance")
                return provenance;
            if (prop === Symbol.asyncIterator)
                return () => iterator();
            // Getters such as Anthropic's `currentMessage` use private fields.
            // The proxy must not be the receiver, or the getter throws.
            const value = Reflect.get(target, prop, target);
            if (typeof value !== "function")
                return value;
            if (prop === "on" || prop === "once" || prop === "off") {
                return (event, listener) => {
                    value.call(target, event, listener);
                    return receiver;
                };
            }
            if (prop === "done") {
                return async (...methodArgs) => {
                    const result = await value.apply(target, methodArgs);
                    await captureFinal(target);
                    await finalize();
                    return result;
                };
            }
            if (typeof prop === "string" && FINAL_READERS.includes(prop)) {
                return async (...methodArgs) => {
                    const result = await value.apply(target, methodArgs);
                    noteFinal(result);
                    await finalize();
                    return result;
                };
            }
            return value.bind(target);
        },
        has(target, prop) {
            // provenanceOf uses `in`. Without this trap that check looks at the raw stream.
            if (prop === "_spurvik_provenance" || prop === "_aegis_provenance")
                return true;
            return Reflect.has(target, prop);
        },
    });
}
function attachProvenance(result, provenance) {
    if (!result || typeof result !== "object")
        return result;
    try {
        for (const key of ["_spurvik_provenance", "_aegis_provenance"]) {
            Object.defineProperty(result, key, {
                value: provenance,
                enumerable: true,
                configurable: true,
                writable: true,
            });
        }
        return result;
    }
    catch {
        return new Proxy(result, {
            get(target, prop, receiver) {
                if (prop === "_spurvik_provenance" || prop === "_aegis_provenance")
                    return provenance;
                return Reflect.get(target, prop, receiver);
            },
        });
    }
}
function trackReturned(returned, transform) {
    const helpers = responseHelpers(returned);
    if (!helpers)
        return Promise.resolve(returned).then(transform);
    let inner;
    const apply = (value) => {
        if (!inner) {
            inner = Promise.resolve(transform(value));
            void inner.catch(() => undefined);
        }
        return inner;
    };
    let adopted;
    const start = () => {
        if (!adopted)
            adopted = Promise.resolve(returned).then((value) => apply(value));
        return adopted;
    };
    return {
        then(onFulfilled, onRejected) {
            return start().then(onFulfilled, onRejected);
        },
        catch(onRejected) {
            return start().catch(onRejected);
        },
        finally(onFinally) {
            return start().finally(onFinally);
        },
        ...(helpers.withResponse
            ? {
                async withResponse(...args) {
                    const wrapped = await helpers.withResponse(...args);
                    return { ...wrapped, data: await apply(wrapped.data) };
                },
            }
            : {}),
        ...(helpers.asResponse
            ? {
                asResponse(...args) {
                    return helpers.asResponse(...args);
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
function box(value) {
    return new Promise((resolve) => {
        resolve({ current: value });
    });
}
function afterHalt(spurvik, invoke) {
    return spurvik.beforeInference().then(() => box(invoke()));
}
function gateApiCall(spurvik, invoke) {
    let ready;
    const begin = () => {
        if (!ready)
            ready = afterHalt(spurvik, invoke);
        return ready;
    };
    const settled = () => begin().then((boxed) => Promise.resolve(boxed.current));
    return {
        then(onFulfilled, onRejected) {
            return settled().then(onFulfilled, onRejected);
        },
        catch(onRejected) {
            return settled().catch(onRejected);
        },
        finally(onFinally) {
            return settled().finally(onFinally ?? undefined);
        },
        async withResponse(...args) {
            const helpers = responseHelpers((await begin()).current);
            if (!helpers?.withResponse) {
                throw new TypeError("This call does not expose withResponse().");
            }
            return helpers.withResponse(...args);
        },
        async asResponse(...args) {
            const helpers = responseHelpers((await begin()).current);
            if (!helpers?.asResponse) {
                throw new TypeError("This call does not expose asResponse().");
            }
            return helpers.asResponse(...args);
        },
    };
}
const BASE_STREAM_PROMISES = new Set(["done", "emitted"]);
const NO_EXTRAS = new Set();
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
/**
 * Members the real helper exposes. The facade must not invent the rest:
 * a missing `toReadableStream()` would otherwise yield an empty stream.
 */
function streamShape(path) {
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
function gateEventStream(spurvik, invoke, path) {
    const shape = streamShape(path);
    const local = [];
    let real;
    let opened = false;
    let ended = false;
    let errored = false;
    let aborted = false;
    let failed = false;
    let catching = false;
    let cancelled = false;
    let cancelError;
    let ready;
    let resolveReady;
    let rejectReady;
    const remember = (event) => {
        const matched = local.filter((item) => item.event === event);
        for (let index = local.length - 1; index >= 0; index -= 1) {
            const item = local[index];
            if (item && item.event === event && item.once)
                local.splice(index, 1);
        }
        return matched.map((item) => item.listener);
    };
    const failClosed = (error) => {
        if (failed || opened)
            return;
        failed = true;
        errored = true;
        const errorListeners = remember("error");
        for (const listener of errorListeners)
            listener(error);
        if (!catching && errorListeners.length === 0) {
            void Promise.reject(error);
        }
        ended = true;
        for (const listener of remember("end"))
            listener();
    };
    const begin = () => {
        if (!ready) {
            ready = new Promise((resolve, reject) => {
                resolveReady = resolve;
                rejectReady = reject;
            });
            // `abort()` rejects this immediately. The halt check may settle later.
            void ready.catch(() => undefined);
            const openedStream = afterHalt(spurvik, () => {
                if (cancelled)
                    throw cancelError;
                const stream = invoke();
                if (!stream || typeof stream !== "object") {
                    throw new TypeError("Expected a provider stream.");
                }
                real = stream;
                opened = true;
                return stream;
            }).then(() => {
                if (cancelled)
                    throw cancelError;
                for (const item of local.splice(0)) {
                    callListener(real, { method: item.once ? "once" : "on", event: item.event, listener: item.listener });
                }
                return real;
            }, (error) => {
                if (cancelled)
                    throw cancelError;
                throw error;
            });
            void openedStream.then((stream) => {
                if (cancelled)
                    return;
                resolveReady?.(stream);
            }, (error) => {
                // Abort already failed the stream. Swallow the late halt result.
                if (cancelled)
                    return;
                failClosed(error);
                rejectReady?.(error);
            });
        }
        return ready;
    };
    const callWhenReady = (prop, methodArgs) => {
        catching = true;
        return begin().then((stream) => {
            const value = stream[prop];
            if (typeof value !== "function")
                return value;
            return value.apply(stream, methodArgs);
        });
    };
    const facade = new Proxy(Object.create(null), {
        get(_target, prop, receiver) {
            if (prop === "then")
                return undefined;
            if (prop === "_spurvik_provenance" || prop === "_aegis_provenance") {
                return begin().then((stream) => stream[prop]);
            }
            if (prop === Symbol.asyncIterator) {
                return async function* () {
                    catching = true;
                    yield* (await begin());
                };
            }
            if (opened && real && prop !== "on" && prop !== "once" && prop !== "off") {
                return Reflect.get(real, prop);
            }
            if (prop === "on" || prop === "once") {
                return (event, listener) => {
                    const name = String(event);
                    if (opened && real)
                        callListener(real, { method: prop, event, listener });
                    else
                        local.push({ event: name, listener, once: prop === "once" });
                    return receiver;
                };
            }
            if (prop === "off") {
                return (event, listener) => {
                    if (opened && real)
                        callListener(real, { method: "off", event, listener });
                    else {
                        const index = local.findIndex((item) => item.event === String(event) && item.listener === listener);
                        if (index >= 0)
                            local.splice(index, 1);
                    }
                    return receiver;
                };
            }
            if (prop === "toReadableStream") {
                if (!shape.readable)
                    return undefined;
                // Mark the halt rejection handled before failClosed can reject a
                // second, uncaught promise. The reader still observes the error.
                return () => bridgeReadable(begin, () => {
                    catching = true;
                });
            }
            if (prop === "ended")
                return ended;
            if (prop === "errored")
                return errored;
            if (prop === "aborted")
                return aborted;
            if (typeof prop === "string" && shape.getters.has(prop))
                return undefined;
            if (typeof prop === "string" && (BASE_STREAM_PROMISES.has(prop) || shape.methods.has(prop))) {
                return (...methodArgs) => callWhenReady(prop, methodArgs);
            }
            if (prop === "abort") {
                return () => {
                    if (opened && real) {
                        const abort = real.abort;
                        if (typeof abort === "function")
                            abort.call(real);
                        return;
                    }
                    if (cancelled)
                        return;
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
            if (prop === "_spurvik_provenance" || prop === "_aegis_provenance")
                return true;
            if (opened && real)
                return Reflect.has(real, prop);
            if (prop === "toReadableStream")
                return shape.readable;
            if (typeof prop === "string" && shape.getters.has(prop))
                return true;
            return (prop === "on" ||
                prop === "once" ||
                prop === "off" ||
                prop === "abort" ||
                prop === "ended" ||
                prop === "errored" ||
                prop === "aborted" ||
                (typeof prop === "string" && (BASE_STREAM_PROMISES.has(prop) || shape.methods.has(prop))));
        },
    });
    void begin();
    return facade;
}
function bridgeReadable(begin, markHandled) {
    markHandled();
    const pending = begin();
    return new ReadableStream({
        async start(controller) {
            try {
                const stream = await pending;
                const toReadable = stream.toReadableStream;
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
            }
            catch (error) {
                controller.error(error);
            }
        },
    });
}
function callListener(stream, call) {
    const method = stream[call.method];
    if (typeof method !== "function")
        return;
    method.call(stream, call.event, call.listener);
}
/** `chat.completions.stream`, `responses.stream`, and `messages.stream` are synchronous. */
function isSyncEventStream(path) {
    return path[path.length - 1] === "stream";
}
function responseHelpers(value) {
    if (!value || typeof value !== "object")
        return undefined;
    const record = value;
    if (typeof record.withResponse !== "function" && typeof record.asResponse !== "function")
        return undefined;
    return {
        ...(typeof record.withResponse === "function" ? { withResponse: record.withResponse.bind(value) } : {}),
        ...(typeof record.asResponse === "function" ? { asResponse: record.asResponse.bind(value) } : {}),
    };
}
function isThenable(value) {
    return typeof value === "object" && value !== null && typeof value.then === "function";
}
function isSession(value) {
    if (!value || typeof value !== "object")
        return false;
    const record = value;
    return typeof record.sendMessage === "function" || typeof record.sendMessageStream === "function";
}
function wrapSession(value, spurvik, path) {
    if (isSession(value))
        return wrapValue(value, spurvik, path, false);
    if (isThenable(value)) {
        return Promise.resolve(value).then((resolved) => (isSession(resolved) ? wrapValue(resolved, spurvik, path, false) : resolved));
    }
    return value;
}
function isEventSource(value) {
    return typeof value.on === "function";
}
