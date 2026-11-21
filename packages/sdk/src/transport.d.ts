import type { ResolvedSpurvikConfig } from "./config.js";
export declare class ControlPlaneClient {
    private readonly config;
    constructor(config: ResolvedSpurvikConfig);
    post<T>(path: string, body: unknown, options?: {
        reviewer?: boolean;
        signal?: AbortSignal;
    }): Promise<T>;
    get<T>(path: string): Promise<T>;
    private request;
}
