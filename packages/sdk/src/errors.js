export class SpurvikError extends Error {
    constructor(message) {
        super(message);
        this.name = "SpurvikError";
    }
}
export class SpurvikConfigError extends SpurvikError {
    constructor(message) {
        super(message);
        this.name = "SpurvikConfigError";
    }
}
export class SpurvikApiError extends SpurvikError {
    status;
    code;
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
        this.name = "SpurvikApiError";
    }
}
/** A human stop is engaged for the project or for one action. */
export class SpurvikHaltedError extends SpurvikError {
    actionName;
    constructor(actionName) {
        super(actionName
            ? `Action "${actionName}" is halted.`
            : "This project is halted.");
        this.actionName = actionName;
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
    constructor(message) {
        super(message);
        this.name = "SpurvikTelemetryBufferError";
    }
}
export class SpurvikHitlTimeoutError extends SpurvikError {
    approvalId;
    constructor(approvalId) {
        super(`No human decision was recorded for approval ${approvalId} before the wait ended.`);
        this.approvalId = approvalId;
        this.name = "SpurvikHitlTimeoutError";
    }
}
/**
 * The queued action may not continue: a human reviewer rejected or overrode it,
 * or the queue returned another status that is not "approved". Read `record.status`.
 */
export class SpurvikHitlRejectedError extends SpurvikError {
    record;
    constructor(record) {
        const status = String(record.status);
        const outcome = status === "overridden" || status === "rejected"
            ? `was ${status}`
            : `was not approved (status "${status}")`;
        super(`Human approval for "${record.actionName}" ${outcome}.`);
        this.record = record;
        this.name = "SpurvikHitlRejectedError";
    }
}
