import type { RiskTier } from "./types.js";
/**
 * Commercial plan for an organisation. It chooses the default log-retention
 * period. It is not a risk classification.
 *
 * - `free` and `developer`: 30 days
 * - `pro` and `team`: 90 days
 * - `business`: 12 months. This is the plan between Team and Enterprise.
 * - `enterprise`: a per-project period, in days
 *
 * `free` and `pro` are accepted alongside the original four values.
 */
export declare const ORGANIZATION_PLANS: readonly ["developer", "team", "business", "enterprise", "free", "pro"];
export type OrganizationPlan = (typeof ORGANIZATION_PLANS)[number];
/** Articles 19 and 26(6): high-risk logs are kept at least six months unless another law says otherwise. */
export declare const HIGH_ANNEX3_RETENTION_FLOOR_MONTHS = 6;
export declare function isOrganizationPlan(value: string): value is OrganizationPlan;
export declare function organizationPlanLabel(plan: OrganizationPlan): string;
/**
 * Model-call events accepted in one UTC calendar month.
 * Enterprise is not listed: a null project quota means no cap, and a number is that project's cap.
 */
export declare const MONTHLY_EVENT_QUOTA: {
    readonly free: 10000;
    readonly developer: 10000;
    readonly pro: 250000;
    readonly team: 2000000;
    readonly business: 2000000;
};
/** Team, Business, and Enterprise may stream telemetry to a webhook. Free, Developer, and Pro may not. */
export declare function planStreamsTelemetryExport(plan: OrganizationPlan): boolean;
/**
 * Monthly cap for a plan.
 * Enterprise uses `customQuota`. Null means no cap. Any other plan ignores `customQuota`.
 */
export declare function monthlyEventQuota(plan: OrganizationPlan, customQuota: number | null): number | null;
/** First instant of the UTC month that contains `now`. */
export declare function utcMonthStart(now: Date): Date;
/** First instant of the next UTC month. The monthly counter starts over then. */
export declare function utcMonthReset(now: Date): Date;
export interface MonthlyQuotaAssessment {
    plan: OrganizationPlan;
    /** Null when the project has no monthly cap. */
    quota: number | null;
    used: number;
    /** Null when the project has no monthly cap. */
    remaining: number | null;
    resetAt: string;
    exceeded: boolean;
}
/**
 * Compare stored usage with the plan cap.
 * With no `incoming`, `exceeded` is true when `used` is at or over a finite cap.
 * With `incoming`, `exceeded` is true when `used + incoming` is above that cap, so a batch cannot cross it.
 */
export declare function assessMonthlyQuota(input: {
    plan: OrganizationPlan;
    customQuota: number | null;
    used: number;
    now: Date;
    incoming?: number;
}): MonthlyQuotaAssessment;
export interface RetentionSpan {
    unit: "days" | "months";
    amount: number;
}
export interface EffectiveLogRetention {
    span: RetentionSpan;
    cutoff: Date;
    label: string;
    /** True when the Annex III floor replaced a shorter plan or enterprise period. */
    floorApplied: boolean;
    planLabel: string;
    planDefaultLabel: string;
}
export declare function planDefaultSpan(plan: OrganizationPlan, configuredDays: number | null): RetentionSpan;
export declare function retentionSpanLabel(span: RetentionSpan): string;
/**
 * UTC calendar subtraction that never rolls the day forward.
 * 31 March minus one month is 28 February, or 29 February in a leap year.
 * Keeping the shorter day means the period is at least the requested number of months.
 */
export declare function subtractUtcMonths(from: Date, months: number): Date;
export declare function subtractUtcDays(from: Date, days: number): Date;
export declare function spanCutoff(now: Date, span: RetentionSpan): Date;
/**
 * Period a project actually keeps logs for.
 * `high_annex3` cannot go below six months unless `otherLawOverride` is set.
 */
export declare function effectiveLogRetention(input: {
    plan: OrganizationPlan;
    /**
     * Null does not apply the six-month floor.
     * The control plane passes `high_annex3` when the stored tier is unconfirmed, so that floor still applies.
     */
    riskTier: RiskTier | null;
    configuredDays: number | null;
    otherLawOverride: boolean;
    now: Date;
}): EffectiveLogRetention;
