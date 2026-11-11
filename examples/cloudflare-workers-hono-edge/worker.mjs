/**
 * Cloudflare Workers / Hono / Supabase Edge Reference Handler (`worker.mjs`)
 *
 * Demonstrates four production patterns in Web-Standard Fetch runtimes:
 * 1. `KvTelemetryBuffer` backed by Workers KV / Upstash KV so batches survive isolate eviction.
 * 2. `withSpurvik(client, config)` + `ctx.waitUntil(ai._spurvik.flush())` with 0 raw prompt bytes persisted.
 * 3. Upstream provider watermark pass-through (`x-watermark` header preservation) + Art. 50(1) AI notice field.
 * 4. Stateless signed Art. 14 human-oversight callback verification (`GET /api/spurvik/callback`) with nonce replay guard.
 */

export function createEdgeWorker({
  withSpurvik,
  provenanceOf,
  KvTelemetryBuffer,
  createSignedApprovalLinks,
  verifyChannelApprovalToken,
  kvStore,
  modelClient,
  upstreamHeaders = {},
  config,
}) {
  const seenNonces = new Set();
  const buffer = new KvTelemetryBuffer(kvStore, "spurvik:edge:telemetry:v1");
  const ai = withSpurvik(modelClient, {
    ...config,
    buffer,
  });

  return {
    ai,
    createRefundApprovalLinks(gateId, actionSummary) {
      return createSignedApprovalLinks(
        {
          gateId,
          actionName: "stripe.refunds.create",
          summary: actionSummary,
          callbackBaseUrl: `${config.publicOrigin}/api/spurvik/callback`,
        },
        config.signingSecret,
      );
    },
    async fetch(request, ctx = { waitUntil() {} }) {
      const url = new URL(request.url);

      if (request.method === "GET" && url.pathname === "/api/spurvik/callback") {
        const gateId = url.searchParams.get("gateId") ?? "";
        const decision = url.searchParams.get("decision") ?? "";
        const actionHmac = url.searchParams.get("hmac") ?? "";
        const issuedAtUnix = Number(url.searchParams.get("ts") ?? "");
        const nonce = url.searchParams.get("nonce") ?? "";
        const signature = url.searchParams.get("sig") ?? "";

        if ((decision !== "approved" && decision !== "rejected") || !nonce) {
          return Response.json({ ok: false, reason: "invalid_parameters" }, { status: 400 });
        }

        const valid = verifyChannelApprovalToken({
          gateId,
          actionHmac,
          decision,
          issuedAtUnix,
          signature,
          nonce,
          signingSecret: config.signingSecret,
        });
        if (!valid) {
          return Response.json({ ok: false, reason: "invalid_signature" }, { status: 400 });
        }
        if (seenNonces.has(nonce)) {
          return Response.json({ ok: false, reason: "replayed_nonce" }, { status: 409 });
        }
        seenNonces.add(nonce);
        return Response.json({
          ok: true,
          gateId,
          decision,
          verifiedAt: new Date().toISOString(),
        });
      }

      if (request.method === "POST" && url.pathname === "/api/chat") {
        const body = await request.json();
        const userMessage = typeof body?.message === "string" ? body.message : "";
        const completion = await ai.chat.completions.create({
          model: "grok-3-mini",
          messages: [{ role: "user", content: userMessage }],
        });
        const receipt = provenanceOf(completion);
        ctx.waitUntil(ai._spurvik.flush());

        const headers = new Headers({
          "content-type": "application/json; charset=utf-8",
          "x-spurvik-disclosure": "AI-generated response (EU AI Act Art. 50(1) notice)",
        });
        if (upstreamHeaders["x-watermark"]) {
          headers.set("x-watermark", String(upstreamHeaders["x-watermark"]));
        }

        return new Response(
          JSON.stringify({
            reply: completion.choices?.[0]?.message?.content ?? "",
            aiDisclosure: {
              notice: "You are interacting with an AI system.",
              upstreamWatermarkHeaderPreserved: Boolean(upstreamHeaders["x-watermark"]),
            },
            provenance: receipt
              ? {
                  eventId: receipt.eventId,
                  signature: receipt.signature,
                  inputHash: receipt.inputHash,
                  outputHash: receipt.outputHash,
                }
              : null,
          }),
          { status: 200, headers },
        );
      }

      return Response.json({ error: "Not found" }, { status: 404 });
    },
  };
}
