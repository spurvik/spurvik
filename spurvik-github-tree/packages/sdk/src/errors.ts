import type { HitlRecordWire } from "@spurvik/core";

export class SpurvikError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpurvikError";
  }
}

export class SpurvikConfigError extends SpurvikError {
  constructor(message: string) {
    super(message);
    this.name = "SpurvikConfigError";
  }
}

export class SpurvikApiError extends SpurvikError {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SpurvikApiError";
  }
}

/** A human stop is engaged for the project or for one action. */
export class SpurvikHaltedError extends SpurvikError {
  constructor(readonly actionName?: string) {
    super(
      actionName
        ? `Action "${actionName}" is halted.`
        : "This project is halted.",
    );
    this.name = "SpurvikHaltedError";
  }
}

/**
 * The halt check did not finish before its timeout.
 * The provider request is not sent.
 */
export class SpurvikOversightTimeoutError extends SpurvikHaltedError {
  constructor() {
    super();
    this.message = "The halt check timed out before the control plane answered. The call was not sent.";
    this.name = "SpurvikOversightTimeoutError";
  }
}

/** A high-risk telemetry event was not accepted by the durable buffer. */
export class SpurvikTelemetryBufferError extends SpurvikError {
  constructor(message: string) {
    super(message);
    this.name = "SpurvikTelemetryBufferError";
  }
}

export class SpurvikHitlTimeoutError extends SpurvikError {
  constructor(readonly approvalId: string) {
    super(`No human decision was recorded for approval ${approvalId} before the wait ended.`);
    this.name = "SpurvikHitlTimeoutError";
  }
}

/** A human reviewer rejected the queued action. The record is the queue row. */
export class SpurvikHitlRejectedError extends SpurvikError {
  constructor(readonly record: HitlRecordWire) {
    super(`Human approval for "${record.actionName}" was rejected.`);
    this.name = "SpurvikHitlRejectedError";
  }
}
