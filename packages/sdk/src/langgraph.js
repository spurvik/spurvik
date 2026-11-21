import { SpurvikClient, provenanceOf, } from "./client.js";
import { SpurvikConfigError, SpurvikHitlRejectedError } from "./errors.js";
export { provenanceOf };
const SKIPPED_MESSAGE_KINDS = new Set(["tool", "function", "function_call_result"]);
/**
 * Wrap a compiled LangGraph.
 * The constructor checks `apiKey` and `signingSecret` immediately.
 * `invoke` and `stream` run the halt check before the graph when enforcement is on.
 * A state with a non-empty `__interrupt__` array is recorded with finish reason `"interrupted"`.
 */
export function withSpurvikLangGraph(graph, config, options) {
    const client = new SpurvikClient(config);
    const modelId = options?.modelId?.trim() ? options.modelId.trim() : "langgraph";
    return {
        async invoke(input, callOptions) {
            await client.beforeInference();
            const started = performance.now();
            const result = await graph.invoke(input, callOptions);
            const provenance = await recordGraph(client, {
                input,
                output: result,
                started,
                stream: false,
                modelId,
                interrupted: hasInterrupt(result),
            });
            applyMarked(result, provenance, client.applyMarkedTextToContent);
            attachProvenance(result, provenance);
            return result;
        },
        async stream(input, callOptions) {
            await client.beforeInference();
            if (!graph.stream) {
                throw new SpurvikConfigError("This graph does not expose stream().");
            }
            const started = performance.now();
            const inner = await graph.stream(input, callOptions);
            const pending = deferred();
            pending.promise.catch(() => undefined);
            const iterable = {
                async *[Symbol.asyncIterator]() {
                    const pieces = [];
                    let last;
                    let failed = false;
                    let completed = false;
                    try {
                        for await (const chunk of inner) {
                            last = chunk;
                            if (typeof chunk === "string")
                                pieces.push(chunk);
                            yield chunk;
                        }
                        completed = true;
                    }
                    catch (error) {
                        failed = true;
                        pending.reject(error);
                        throw error;
                    }
                    finally {
                        if (!failed) {
                            try {
                                const provenance = await recordGraph(client, {
                                    input,
                                    output: streamOutput(pieces, last),
                                    started,
                                    stream: true,
                                    modelId,
                                    interrupted: !completed || hasInterrupt(last),
                                });
                                applyMarked(last, provenance, client.applyMarkedTextToContent);
                                attachProvenance(last, provenance);
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
            attachProvenance(iterable, pending.promise);
            return iterable;
        },
        flush: () => client.flush(),
        resolveInterrupts: (interrupts, interruptOptions) => resolveLangGraphInterrupts(interrupts, client, interruptOptions),
    };
}
/**
 * Pause a graph node on the human-oversight queue.
 * When `request.interrupt` returns a resume value that already has `approved`, `status`, and `approvalId`, that value is used.
 * A rejection or an overridden decision returns a `command` ready for `new Command(decision.command)` unless `throwOnReject` is set.
 * Only `approved` sets `approved`. Overridden means do not continue.
 */
export async function spurvikInterrupt(request, configOrClient, options) {
    const client = clientFrom(configOrClient);
    const actionName = request.actionName.trim() || options?.defaultActionName || "langgraph_interrupt";
    await client.assertNotHalted(actionName);
    if (request.interrupt) {
        const resumed = await request.interrupt({
            kind: "spurvik_langgraph_interrupt",
            actionName,
            callId: request.callId ?? null,
        });
        const resume = asResumeValue(resumed);
        if (resume)
            return decisionFromResume(actionName, request.callId ?? resume.callId ?? null, resume);
    }
    const payload = request.payload ?? {};
    try {
        const approval = await client.requireHumanApproval(actionName, payload, {
            timeoutMs: options?.timeoutMs,
            pollIntervalMs: options?.pollIntervalMs,
            signal: options?.signal,
        });
        if (approval.status !== "approved") {
            if (options?.throwOnReject === true)
                throw new SpurvikHitlRejectedError(approval);
            const stopped = resumeValue(false, approval.status, approval, actionName, request.callId ?? null);
            return {
                approved: false,
                status: approval.status,
                actionName,
                callId: request.callId ?? null,
                approval,
                resume: stopped,
                command: { resume: stopped },
            };
        }
        const resume = resumeValue(true, approval.status, approval, actionName, request.callId ?? null);
        return {
            approved: true,
            status: approval.status,
            actionName,
            callId: request.callId ?? null,
            approval,
            resume,
            command: { resume },
        };
    }
    catch (error) {
        if (!(error instanceof SpurvikHitlRejectedError))
            throw error;
        if (options?.throwOnReject === true)
            throw error;
        const status = error.record.status === "overridden" ? "overridden" : "rejected";
        const resume = resumeValue(false, status, error.record, actionName, request.callId ?? null);
        return {
            approved: false,
            status,
            actionName,
            callId: request.callId ?? null,
            approval: error.record,
            resume,
            command: { resume },
        };
    }
}
/**
 * Resolve LangGraph `__interrupt__` items.
 * The first item for each id is sent to the queue. Later copies are listed in `skippedDuplicateIds`.
 * One interrupt returns `{ resume }` for that decision. Several return `{ resume: resumeById }`.
 */
export async function resolveLangGraphInterrupts(interrupts, configOrClient, options) {
    const client = clientFrom(configOrClient);
    const items = normalizeInterrupts(interrupts);
    const seen = new Set();
    const skippedDuplicateIds = [];
    const decisions = [];
    const resumeById = {};
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const id = interruptId(item, index);
        if (seen.has(id)) {
            skippedDuplicateIds.push(id);
            continue;
        }
        seen.add(id);
        const actionName = interruptActionName(item, options?.defaultActionName);
        const decision = await spurvikInterrupt({
            actionName,
            callId: id,
            payload: interruptPayload(item, id, actionName),
        }, client, options);
        decisions.push(decision);
        resumeById[id] = decision.resume;
    }
    const command = decisions.length === 1 && decisions[0]
        ? { resume: decisions[0].resume }
        : { resume: resumeById };
    return {
        decisions,
        allApproved: decisions.every((decision) => decision.approved),
        skippedDuplicateIds,
        resumeById,
        command,
    };
}
/** Read a settled receipt stored on a graph state. A pending stream promise is not returned. */
export function provenanceFromLangGraphState(state) {
    const found = provenanceOf(state);
    if (!found || found instanceof Promise)
        return undefined;
    return found;
}
function clientFrom(configOrClient) {
    return configOrClient instanceof SpurvikClient ? configOrClient : new SpurvikClient(configOrClient);
}
async function recordGraph(client, input) {
    return client.finishCall({
        path: ["langgraph", input.stream ? "stream" : "invoke"],
        request: {
            prompt: textFromInput(input.input),
            model: input.modelId,
            temperature: null,
            stream: input.stream,
        },
        requestBody: input.input,
        response: input.output,
        output: textFromOutput(input.output),
        modelVersion: input.modelId,
        latencyMs: Math.max(0, Math.round(performance.now() - input.started)),
        ...(input.interrupted ? { finishReason: "interrupted" } : {}),
    });
}
function hasInterrupt(result) {
    if (!result || typeof result !== "object")
        return false;
    const interrupts = result.__interrupt__;
    return Array.isArray(interrupts) && interrupts.length > 0;
}
function textFromInput(input) {
    if (typeof input === "string")
        return input.length > 0 ? input : null;
    if (!input || typeof input !== "object")
        return null;
    const record = input;
    const parts = [];
    if (Array.isArray(record.messages)) {
        for (const message of record.messages)
            collectMessageText(message, parts);
    }
    else if (typeof record.prompt === "string" && record.prompt) {
        parts.push(record.prompt);
    }
    else if (typeof record.input === "string" && record.input) {
        parts.push(record.input);
    }
    return parts.length > 0 ? parts.join("\n") : null;
}
function collectMessageText(message, parts) {
    if (typeof message === "string") {
        if (message)
            parts.push(message);
        return;
    }
    if (Array.isArray(message)) {
        const role = typeof message[0] === "string" ? message[0] : "";
        if (SKIPPED_MESSAGE_KINDS.has(role))
            return;
        if (typeof message[1] === "string" && message[1])
            parts.push(message[1]);
        return;
    }
    if (!message || typeof message !== "object")
        return;
    const record = message;
    const role = typeof record.role === "string" ? record.role : "";
    const type = typeof record.type === "string" ? record.type : "";
    if (SKIPPED_MESSAGE_KINDS.has(role) || SKIPPED_MESSAGE_KINDS.has(type))
        return;
    pushContent(record.content, parts);
}
function pushContent(content, parts) {
    if (typeof content === "string") {
        if (content)
            parts.push(content);
        return;
    }
    if (!Array.isArray(content))
        return;
    for (const part of content) {
        if (typeof part === "string") {
            if (part)
                parts.push(part);
            continue;
        }
        if (!part || typeof part !== "object")
            continue;
        const text = part.text;
        if (typeof text === "string" && text)
            parts.push(text);
    }
}
function normalizeInterrupts(interrupts) {
    if (Array.isArray(interrupts))
        return [...interrupts];
    return [interrupts];
}
function streamOutput(pieces, last) {
    if (pieces.length > 0)
        return pieces.join("");
    if (isLangGraphTuple(last))
        return textFromLangGraphTuple(last);
    return last;
}
function isLangGraphTuple(chunk) {
    return Array.isArray(chunk) && chunk.length >= 2 && typeof chunk[0] === "string";
}
function textFromLangGraphTuple(chunk) {
    if (!isLangGraphTuple(chunk))
        return null;
    const mode = chunk[0];
    const payload = chunk[1];
    if (mode === "messages")
        return textFromMessagesPayload(payload);
    if (mode === "updates")
        return textFromUpdatesPayload(payload);
    if (mode === "values")
        return textFromOutput(payload);
    return null;
}
function textFromMessagesPayload(payload) {
    if (Array.isArray(payload))
        return contentText(payload[0]);
    return contentText(payload);
}
function textFromUpdatesPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload))
        return null;
    let found = null;
    for (const node of Object.values(payload)) {
        if (!node || typeof node !== "object")
            continue;
        const text = textFromOutput(node) ?? contentText(node);
        if (text)
            found = text;
    }
    return found;
}
function contentText(message) {
    if (typeof message === "string")
        return message.length > 0 ? message : null;
    if (!message || typeof message !== "object" || Array.isArray(message))
        return null;
    const record = message;
    const role = typeof record.role === "string" ? record.role : "";
    const type = typeof record.type === "string" ? record.type : "";
    if (SKIPPED_MESSAGE_KINDS.has(role) || SKIPPED_MESSAGE_KINDS.has(type))
        return null;
    if (typeof record.content === "string" && record.content)
        return record.content;
    return null;
}
function textFromOutput(result) {
    if (typeof result === "string")
        return result.length > 0 ? result : null;
    if (!result || typeof result !== "object")
        return null;
    const record = result;
    if (typeof record.output === "string" && record.output)
        return record.output;
    if (!Array.isArray(record.messages))
        return null;
    for (let index = record.messages.length - 1; index >= 0; index -= 1) {
        const text = assistantText(record.messages[index]);
        if (text)
            return text;
    }
    return null;
}
function assistantText(message) {
    if (!message || typeof message !== "object")
        return null;
    if (Array.isArray(message)) {
        const role = message[0];
        if (role !== "assistant" && role !== "ai")
            return null;
        return typeof message[1] === "string" && message[1] ? message[1] : null;
    }
    const record = message;
    const role = typeof record.role === "string" ? record.role : "";
    const type = typeof record.type === "string" ? record.type : "";
    if (role !== "assistant" && role !== "ai" && type !== "assistant" && type !== "ai")
        return null;
    if (typeof record.content === "string" && record.content)
        return record.content;
    return null;
}
function applyMarked(result, provenance, apply) {
    if (!apply || provenance.markedOutput === undefined || !result || typeof result !== "object")
        return;
    const marked = provenance.markedOutput;
    const record = result;
    if (typeof record.output === "string") {
        record.output = marked;
        return;
    }
    if (!Array.isArray(record.messages))
        return;
    for (let index = record.messages.length - 1; index >= 0; index -= 1) {
        const message = record.messages[index];
        if (!message || typeof message !== "object" || Array.isArray(message))
            continue;
        const item = message;
        const role = typeof item.role === "string" ? item.role : "";
        const type = typeof item.type === "string" ? item.type : "";
        if (role !== "assistant" && role !== "ai" && type !== "assistant" && type !== "ai")
            continue;
        if (typeof item.content !== "string")
            continue;
        item.content = marked;
        return;
    }
}
function attachProvenance(target, provenance) {
    if (!target || typeof target !== "object")
        return;
    Object.defineProperty(target, "_spurvik_provenance", {
        value: provenance,
        enumerable: true,
        configurable: true,
        writable: true,
    });
}
function asResumeValue(value) {
    if (!value || typeof value !== "object")
        return undefined;
    const record = value;
    if (typeof record.approved !== "boolean")
        return undefined;
    if (typeof record.status !== "string" || record.status.length === 0)
        return undefined;
    if (typeof record.approvalId !== "string" || record.approvalId.length === 0)
        return undefined;
    const status = record.status;
    return {
        approved: record.approved === true && status === "approved",
        status,
        approvalId: record.approvalId,
        ...(record.actionName ? { actionName: record.actionName } : {}),
        ...(record.callId !== undefined ? { callId: record.callId } : {}),
        ...(record.approval ? { approval: record.approval } : {}),
    };
}
function decisionFromResume(actionName, callId, resume) {
    const approved = resume.approved === true && resume.status === "approved";
    const settled = approved === resume.approved ? resume : { ...resume, approved };
    return {
        approved,
        status: resume.status,
        actionName: resume.actionName ?? actionName,
        callId,
        ...(resume.approval ? { approval: resume.approval } : {}),
        resume: settled,
        command: { resume: settled },
    };
}
function resumeValue(approved, status, approval, actionName, callId) {
    return {
        approved,
        status,
        approvalId: approval.id,
        actionName,
        callId,
        approval,
    };
}
function interruptId(item, index) {
    const candidates = [item.callId, item.value?.callId, item.id, item.value?.id];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.length > 0)
            return candidate;
    }
    return `interrupt_${index}`;
}
function interruptActionName(item, fallback) {
    const candidates = [item.actionName, item.value?.actionName, fallback];
    for (const candidate of candidates) {
        if (typeof candidate === "string" && candidate.trim().length > 0)
            return candidate.trim();
    }
    return "langgraph_interrupt";
}
function interruptPayload(item, callId, actionName) {
    const raw = item.value?.payload;
    if (raw && typeof raw === "object" && !Array.isArray(raw))
        return { ...raw, callId, actionName };
    return { callId, actionName };
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
