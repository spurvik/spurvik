# @spurvik/sdk

## 0.1.1 — 2026-10-24

This note is 0.1.1. The package version stays 1.0.1. That is intended.

`releaseKillSwitch` takes an optional reason: `{ reason?: string; actionName?: string }`. A call with no argument still works. When the reason is missing or blank, the client sends `Released via SDK (no reason given)` before the request. The control plane does not fill that in. Pass a reason when you have one.

`engageKillSwitch` sends `Halted via SDK (no reason given)` when its reason is missing or blank. The control plane refuses a halt that arrives with no reason. A reason you type is still sent as you typed it, aside from surrounding whitespace.

Both calls also send `reasonSource`. It is `caller` when you passed a reason, and `sdk_default` when the client substituted the sentence above. The value is client-asserted. The server does not verify it. The control plane stores it on the halt or release row. Console writes store NULL. A raw API call that omits the field stores NULL.

`withSpurvikMastra` now returns `model` as a function. Pass that function as Mastra `Agent`'s `model`. It is not the language model object. Mastra calls the function while it resolves the model. A halt throws `SpurvikHaltedError` from `agent.stream` and `agent.generate`.

`@openai/agents` is an optional peer. Install it for the Agents SDK. The adapter does not check for it.

The OpenAI Agents input fingerprint includes `reasoning_text` and a reasoning item's `rawContent`. It skips tool items (`function_call`, `function_call_result`, `hosted_tool_call`, and `tool_search_call`). A fingerprint can differ from 1.0.1 for the same input.

A halt response sets `previousReason` to null. A release response sets `reason` to the release reason and `previousReason` to the halt reason that was in effect. The `oversight.changed` webhook posts that response. A later read keeps the halt reason on the control row and sets `previousReason` to null.

A release response `reason` is the reason just recorded. The halt reason that was in effect is `previousReason`. The stored halt reason on the project stays where it was.
