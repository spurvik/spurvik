import type { HitlRecordWire } from "@spurvik/core";
export declare class SpurvikError extends Error {
    constructor(message: string);
}
export declare class SpurvikConfigError extends SpurvikError {
    constructor(message: string);
}
export declare class SpurvikApiError extends SpurvikError {
    readonly status: number;
    readonly code: string;
    constructor(status: number, code: string, message: string);
}
/** A human stop is engaged for the project or for one action. */
export declare class SpurvikHaltedError extends SpurvikError {
    readonly actionName?: string | undefined;
    constructor(actionName?: string | undefined);
}
/**
 * The halt check did not finish before its timeout.
 * The provider request is not sent.
 */
export declare class SpurvikOversightTimeoutError extends SpurvikHaltedError {
    constructor();
}
/** A high-risk telemetry event was not accepted by the durable buffer. */
export declare class SpurvikTelemetryBufferError extends SpurvikError {
    constructor(message: string);
}
export declare class SpurvikHitlTimeoutError extends SpurvikError {
    readonly approvalId: string;
    constructor(approvalId: string);
}
/**
 * The queued action may not continue: a human reviewer rejected or overrode it,
 * or the queue returned another status that is not "approved". Read `record.status`.
 */
export declare class SpurvikHitlRejectedError extends SpurvikError {
    readonly record: HitlRecordWire;
    constructor(record: HitlRecordWire);
}
