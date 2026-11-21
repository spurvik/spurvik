import type { RiskTier } from "./tools/classify-risk.js";
export declare function setupNextSteps(rawDomain?: string, rawLocale?: string): string;
export declare const SETUP_NEXT_STEPS: string;
export declare const FIND_NEXT_STEPS: string;
export declare const RECEIPT_NEXT_STEPS: string;
export declare const MARKING_NEXT_STEPS: string;
/** Risk-tier links. None for a prohibited practice: Spurvik offers no setup for it. */
export declare function classifyNextSteps(tier: RiskTier, rawSiteDomain?: string, rawLocale?: string): string | null;
/** Badge links. Done-For-You gets `&appUrl=` only when systemName is a public hostname. */
export declare function badgeNextSteps(systemName: string | undefined): string;
