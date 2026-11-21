import type { SpurvikClient } from "./client.js";
export declare function wrapClient<T extends object>(client: T, spurvik: SpurvikClient): T & {
    _spurvik: SpurvikClient;
    /** @deprecated Use `_spurvik`. Removed in the next release. */
    _aegis: SpurvikClient;
};
