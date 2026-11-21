import { REVIEWER_HEADER } from "@spurvik/core";
import { SpurvikApiError } from "./errors.js";
export class ControlPlaneClient {
    config;
    constructor(config) {
        this.config = config;
    }
    post(path, body, options) {
        return this.request("POST", path, body, options);
    }
    get(path) {
        return this.request("GET", path);
    }
    async request(method, path, body, options) {
        const timeout = AbortSignal.timeout(this.config.telemetry.requestTimeoutMs);
        const response = await this.config.fetch(`${this.config.baseUrl}${path}`, {
            method,
            signal: options?.signal ? AbortSignal.any([timeout, options.signal]) : timeout,
            headers: {
                authorization: `Bearer ${this.config.apiKey}`,
                accept: "application/json",
                ...(options?.reviewer && this.config.reviewerToken
                    ? { [REVIEWER_HEADER]: this.config.reviewerToken }
                    : {}),
                ...(body === undefined ? {} : { "content-type": "application/json" }),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        const payload = (await response.json().catch(() => null));
        if (!response.ok) {
            throw new SpurvikApiError(response.status, payload?.error?.code ?? "request_failed", payload?.error?.message ?? response.statusText);
        }
        if (!payload || !("data" in payload)) {
            throw new SpurvikApiError(response.status, "invalid_response", "Control plane response had no data.");
        }
        return payload.data;
    }
}
