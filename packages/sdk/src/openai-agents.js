import { SpurvikClient, provenanceOf } from "./client.js";
import { SpurvikHitlRejectedError, SpurvikHitlTimeoutError } from "./errors.js";
export { provenanceOf };
const RECEIPT_KEY = "spurvik";
/**
 * Wrap one Agents SDK `Model`.
 *
 * `getResponse` and `getStreamedResponse` are the model calls
 * (`@openai/agents` 0.21 `Model`). A tracing processor does not run before
 * those calls, so this wrapper does. The constructor throws when `apiKey`
 * or `signingSecret` is missing. It does not read the environment.
 *
 * The input fingerprint includes system instructions, string input,
 * `input_text`, `output_text`, and `reasoning_text` (including a reasoning
 * item's `rawContent`). It skips `function_call_result`, `function_call`,
 * `hosted_tool_call`, and `tool_search_call`, so tool results and tool-call
 * arguments are not included. The output fingerprint is assistant
 * `output_text` only. The control-plane body stores keyed fingerprints,
 * not the prompt or the output text. A marking hook runs only when
 * `config.marking` sets one. This wrapper does not mark content.
 */
export function withSpurvikModel(model, config, options) {
    return new WrappedAgentsModel(model, new SpurvikClient(config), options?.modelId);
}
/**
 * Wrap a `ModelProvider`. Every `getModel` result shares one client, so
 * `flush()` sends the batch for each model this provider returned.
 */
export function withSpurvikModelProvider(provider, config, options) {
    const client = new SpurvikClient(config);
    const fallback = options?.defaultModelId?.trim() ? options.defaultModelId.trim() : undefined;
    return {
        async getModel(modelName) {
            const inner = await provider.getModel(modelName);
            const named = modelName?.trim();
            return new WrappedAgentsModel(inner, client, named ? named : fallback);
        },
        flush: () => client.flush(),
        resolveInterruptions: (interruptions, options) => resolveAgentInterruptions(interruptions, client, options),
    };
}
/**
 * `needsApproval` callback for an Agents SDK tool.
 * A `SpurvikConfig` is turned into a client immediately, so a missing key throws at setup.
 * The callback checks the halt state, then returns true, or the `when` predicate when one was set.
 */
export function createSpurvikNeedsApproval(configOrClient, options) {
    const client = configOrClient instanceof SpurvikClient ? configOrClient : new SpurvikClient(configOrClient);
    return async (_runContext, input, callId) => {
        if (options?.signal?.aborted)
            throw new SpurvikHitlTimeoutError("aborted");
        await client.assertNotHalted(options?.actionName);
        if (options?.signal?.aborted)
            throw new SpurvikHitlTimeoutError("aborted");
        if (options?.when)
            return Boolean(await options.when(input, callId));
        return true;
    };
}
/**
 * Map Agents `RunResult.interruptions` onto the human-oversight queue.
 * The first interruption for each `callId` is sent. Later copies are listed in `skippedDuplicateCallIds`.
 * Only an approved row calls `state.approve`. An overridden or rejected row calls `state.reject`.
 * Overridden means do not continue. That reject call includes a message that the decision was overridden.
 */
export async function resolveAgentInterruptions(interruptions, configOrClient, options) {
    const client = configOrClient instanceof SpurvikClient ? configOrClient : new SpurvikClient(configOrClient);
    const seen = new Set();
    const skippedDuplicateCallIds = [];
    const decisions = [];
    for (let index = 0; index < interruptions.length; index += 1) {
        const item = interruptions[index];
        const callId = interruptionCallId(item, index);
        if (seen.has(callId)) {
            skippedDuplicateCallIds.push(callId);
            continue;
        }
        seen.add(callId);
        const actionName = interruptionActionName(item, options?.defaultActionName);
        await client.assertNotHalted(actionName);
        const payload = approvalPayload(callId, actionName, interruptionArguments(item));
        try {
            const approval = await client.requireHumanApproval(actionName, payload, {
                timeoutMs: options?.timeoutMs,
                pollIntervalMs: options?.pollIntervalMs,
                signal: options?.signal,
            });
            if (approval.status === "approved") {
                options?.state?.approve(item);
                decisions.push({
                    callId,
                    actionName,
                    approved: true,
                    status: approval.status,
                    approval,
                    interruption: item,
                });
                continue;
            }
            options?.state?.reject(item);
            decisions.push({
                callId,
                actionName,
                approved: false,
                status: approval.status,
                approval,
                interruption: item,
            });
        }
        catch (error) {
            if (!(error instanceof SpurvikHitlRejectedError))
                throw error;
            if (error.record.status === "overridden") {
                options?.state?.reject(item, { message: "The decision was overridden." });
            }
            else {
                options?.state?.reject(item);
            }
            decisions.push({
                callId,
                actionName,
                approved: false,
                status: error.record.status,
                approval: error.record,
                interruption: item,
            });
            if (options?.throwOnReject === true)
                throw error;
        }
    }
    return {
        decisions,
        allApproved: decisions.every((decision) => decision.approved),
        skippedDuplicateCallIds,
    };
}
function interruptionCallId(item, index) {
    const candidates = [item.callId, item.rawItem?.callId, item.id, item.rawItem?.id];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.length > 0)
            return candidate;
    }
    return `call_${index}`;
}
function interruptionActionName(item, fallback) {
    const candidates = [item.name, item.toolName, item.rawItem?.name, fallback];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim().length > 0)
            return candidate.trim();
    }
    return "openai_agent_tool";
}
function interruptionArguments(item) {
    if (item.arguments !== undefined)
        return item.arguments;
    return item.rawItem?.arguments;
}
function approvalPayload(callId, actionName, rawArgs) {
    return { callId, toolName: actionName, argumentKeys: argumentKeyList(rawArgs) };
}
function argumentKeyList(rawArgs) {
    const parsed = typeof rawArgs === "string" ? parseJsonArguments(rawArgs) : rawArgs;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return [];
    return Object.keys(parsed)
        .filter((key) => key.trim().length > 0)
        .sort();
}
function parseJsonArguments(raw) {
    const trimmed = raw.trim();
    if (!trimmed)
        return undefined;
    try {
        return JSON.parse(trimmed);
    }
    catch {
        return undefined;
    }
}
/**
 * Read the HMAC receipt stored on an Agents SDK model response.
 * This does not check the signature. Use `verifyProvenanceSignature` for that.
 * A match shows the signed fields still match the HMAC-SHA-256 signature made with your signing secret. It does not show that a notice was shown, that output is marked, or that your system meets the Act.
 */
export function provenanceFromAgentsResponse(response) {
    const data = response?.providerData;
    if (!data)
        return undefined;
    return receiptFromBag(data[RECEIPT_KEY]);
}
class WrappedAgentsModel {
    inner;
    client;
    supportsPromptModelSelection;
    modelId;
    constructor(inner, client, modelId) {
        this.inner = inner;
        this.client = client;
        this.supportsPromptModelSelection = inner.supportsPromptModelSelection ?? false;
        const trimmed = modelId?.trim();
        this.modelId = trimmed ? trimmed : "unknown";
    }
    flush() {
        return this.client.flush();
    }
    resolveInterruptions(interruptions, options) {
        return resolveAgentInterruptions(interruptions, this.client, options);
    }
    getRetryAdvice(args) {
        return this.inner.getRetryAdvice?.(args);
    }
    async getResponse(request) {
        await this.client.beforeInference();
        const started = performance.now();
        const response = await this.inner.getResponse(request);
        const provenance = await this.record(request, response, textFromOutput(response.output), started, false, agentsFinishReason(response));
        return withReceipt(response, provenance, this.client.applyMarkedTextToContent);
    }
    getStreamedResponse(request) {
        const client = this.client;
        const inner = this.inner;
        const pending = deferred();
        pending.promise.catch(() => undefined);
        let recorded = false;
        let failed = false;
        const started = performance.now();
        const gate = client.beforeInference();
        void gate.catch((error) => {
            failed = true;
            pending.reject(error);
        });
        const record = this.record.bind(this);
        const iterable = {
            async *[Symbol.asyncIterator]() {
                const pieces = [];
                try {
                    await gate;
                    for await (const event of inner.getStreamedResponse(request)) {
                        if (event.type === "output_text_delta")
                            pieces.push(event.delta);
                        const kind = event.type;
                        if (kind === "response_done" || kind === "response_completed") {
                            const response = asModelResponse(event.response);
                            const provenance = await record(request, response, outputText(response, pieces), started, true, agentsFinishReason(response));
                            recorded = true;
                            pending.resolve(provenance);
                            if (response) {
                                const stamped = withReceipt(response, provenance, client.applyMarkedTextToContent);
                                // The completed-response event requires `id`. ModelResponse does not
                                // declare it, so keep the original response and add the receipt fields.
                                const rawResponse = event.response ?? {};
                                const done = {
                                    ...rawResponse,
                                    output: stamped.output,
                                    providerData: stamped.providerData,
                                };
                                Object.defineProperty(done, "_spurvik_provenance", {
                                    value: provenance,
                                    enumerable: true,
                                    configurable: true,
                                    writable: true,
                                });
                                yield { ...event, response: done };
                            }
                            else {
                                yield event;
                            }
                            continue;
                        }
                        yield event;
                    }
                }
                catch (error) {
                    failed = true;
                    if (!recorded)
                        pending.reject(error);
                    throw error;
                }
                finally {
                    if (!recorded && !failed) {
                        try {
                            const provenance = await record(request, undefined, pieces.length > 0 ? pieces.join("") : null, started, true);
                            recorded = true;
                            pending.resolve(provenance);
                        }
                        catch (error) {
                            pending.reject(error);
                            throw error;
                        }
                    }
                }
            },
        };
        Object.defineProperty(iterable, "_spurvik_provenance", {
            value: pending.promise,
            enumerable: true,
            configurable: true,
            writable: true,
        });
        return iterable;
    }
    record(request, response, output, started, stream, finishReason) {
        return this.client.finishCall({
            path: agentsPath(this.modelId, stream),
            request: {
                prompt: textFromRequest(request),
                model: this.modelId,
                temperature: typeof request.modelSettings.temperature === "number" ? request.modelSettings.temperature : null,
                stream,
            },
            requestBody: { modelSettings: request.modelSettings },
            response,
            output,
            modelVersion: this.modelId,
            latencyMs: Math.max(0, Math.round(performance.now() - started)),
            ...(finishReason ? { finishReason } : {}),
        });
    }
}
function agentsPath(modelId, stream) {
    const id = modelId.toLowerCase();
    if (id.includes("claude"))
        return ["messages", stream ? "stream" : "create"];
    if (id.includes("gemini"))
        return [stream ? "generateContentStream" : "generateContent"];
    if (id.includes("mistral") || id.includes("codestral") || id.includes("pixtral")) {
        return ["chat", stream ? "stream" : "complete"];
    }
    if (id.startsWith("gpt-") || id.startsWith("chatgpt") || /^(o1|o3|o4)/.test(id)) {
        return ["responses", stream ? "stream" : "create"];
    }
    return ["agents", stream ? "getStreamedResponse" : "getResponse"];
}
function textFromRequest(request) {
    const parts = [];
    if (request.systemInstructions)
        parts.push(request.systemInstructions);
    if (typeof request.input === "string") {
        if (request.input)
            parts.push(request.input);
    }
    else {
        for (const item of request.input)
            collectMessageText(item, parts);
    }
    return parts.length > 0 ? parts.join("\n") : null;
}
function textFromOutput(output) {
    const parts = [];
    for (const item of output)
        collectOutputText(item, parts);
    return parts.length > 0 ? parts.join("") : null;
}
function outputText(response, deltas) {
    if (response) {
        const text = textFromOutput(response.output);
        if (text !== null)
            return text;
    }
    return deltas.length > 0 ? deltas.join("") : null;
}
const SKIPPED_INPUT_TYPES = new Set([
    "function_call",
    "function_call_result",
    "hosted_tool_call",
    "tool_search_call",
]);
function collectMessageText(item, parts) {
    if (!item || typeof item !== "object")
        return;
    const record = item;
    if (typeof record.type === "string" && SKIPPED_INPUT_TYPES.has(record.type))
        return;
    if (typeof record.content === "string") {
        if (record.content)
            parts.push(record.content);
    }
    else {
        collectInputParts(record.content, parts);
    }
    collectInputParts(record.rawContent, parts);
}
function collectInputParts(value, parts) {
    if (!Array.isArray(value))
        return;
    for (const part of value) {
        if (!part || typeof part !== "object")
            continue;
        const content = part;
        if ((content.type === "input_text" || content.type === "output_text" || content.type === "reasoning_text") &&
            typeof content.text === "string") {
            parts.push(content.text);
        }
    }
}
function collectOutputText(item, parts) {
    if (!item || typeof item !== "object")
        return;
    const record = item;
    if (record.type === "function_call" || record.type === "hosted_tool_call" || record.type === "tool_search_call") {
        return;
    }
    if (!Array.isArray(record.content))
        return;
    for (const part of record.content) {
        if (!part || typeof part !== "object")
            continue;
        const content = part;
        if (content.type === "output_text" && typeof content.text === "string")
            parts.push(content.text);
    }
}
function agentsFinishReason(response) {
    if (!response)
        return null;
    const bag = response;
    if (bag.status === "incomplete" || bag.status === "interrupted")
        return "interrupted";
    if (bag.incomplete_details != null && bag.incomplete_details !== false)
        return "interrupted";
    return null;
}
function asModelResponse(value) {
    if (!value || typeof value !== "object")
        return undefined;
    const record = value;
    if (!Array.isArray(record.output) || !record.usage || typeof record.usage !== "object")
        return undefined;
    return value;
}
function applyMarkedOutput(response, marked) {
    let replaced = false;
    const output = response.output.map((item) => {
        if (replaced || !("role" in item) || item.role !== "assistant" || !Array.isArray(item.content))
            return item;
        const content = item.content.map((part) => {
            if (replaced || part.type !== "output_text")
                return part;
            replaced = true;
            return { ...part, text: marked };
        });
        return { ...item, content };
    });
    return { ...response, output: output };
}
function withReceipt(response, provenance, apply) {
    const next = apply && provenance.markedOutput !== undefined
        ? applyMarkedOutput(response, provenance.markedOutput)
        : { ...response, output: [...response.output] };
    const { markedOutput, ...record } = provenance;
    const finishReason = provenance.finishReason;
    const spurvik = {
        record: JSON.parse(JSON.stringify(record)),
        ...(typeof finishReason === "string" ? { finishReason, interrupted: finishReason === "interrupted" } : {}),
    };
    if (markedOutput !== undefined)
        spurvik.markedOutput = markedOutput;
    next.providerData = {
        ...(response.providerData ?? {}),
        [RECEIPT_KEY]: spurvik,
    };
    Object.defineProperty(next, "_spurvik_provenance", {
        value: provenance,
        enumerable: true,
        configurable: true,
        writable: true,
    });
    return next;
}
function receiptFromBag(value) {
    if (!value || typeof value !== "object" || Array.isArray(value))
        return undefined;
    const spurvik = value;
    if (!spurvik.record || typeof spurvik.record !== "object" || Array.isArray(spurvik.record))
        return undefined;
    const receipt = {
        ...spurvik.record,
        ...(typeof spurvik.markedOutput === "string" ? { markedOutput: spurvik.markedOutput } : {}),
    };
    if (typeof spurvik.finishReason === "string") {
        Object.defineProperty(receipt, "finishReason", {
            value: spurvik.finishReason,
            enumerable: false,
            configurable: true,
            writable: true,
        });
        Object.defineProperty(receipt, "interrupted", {
            value: spurvik.finishReason === "interrupted",
            enumerable: false,
            configurable: true,
            writable: true,
        });
    }
    return receipt;
}
function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}
