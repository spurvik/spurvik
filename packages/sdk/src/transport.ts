import { REVIEWER_HEADER } from "@spurvik/core";
import type { ResolvedSpurvikConfig } from "./config.js";
import { SpurvikApiError } from "./errors.js";

export class ControlPlaneClient {
  constructor(private readonly config: ResolvedSpurvikConfig) {}

  post<T>(path: string, body: unknown, options?: { reviewer?: boolean; signal?: AbortSignal }): Promise<T> {
    return this.request<T>("POST", path, body, options);
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: { reviewer?: boolean; signal?: AbortSignal },
  ): Promise<T> {
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
    const payload = (await response.json().catch(() => null)) as {
      data?: T;
      error?: { code?: string; message?: string };
    } | null;
    if (!response.ok) {
      throw new SpurvikApiError(
        response.status,
        payload?.error?.code ?? "request_failed",
        payload?.error?.message ?? response.statusText,
      );
    }
    if (!payload || !("data" in payload)) {
      throw new SpurvikApiError(response.status, "invalid_response", "Control plane response had no data.");
    }
    return payload.data as T;
  }
}
