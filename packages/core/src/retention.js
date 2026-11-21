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
export const ORGANIZATION_PLANS = ["developer", "team", "business", "enterprise", "free", "pro"];
/** Articles 19 and 26(6): high-risk logs are kept at least six months unless another law says otherwise. */
export const HIGH_ANNEX3_RETENTION_FLOOR_MONTHS = 6;
export function isOrganizationPlan(value) {
    return ORGANIZATION_PLANS.includes(value);
}
export function organizationPlanLabel(plan) {
    switch (plan) {
        case "free":
            return "Free";
        case "developer":
            return "Developer";
        case "pro":
            return "Pro";
        case "team":
            return "Team";
        case "business":
            return "Business";
        case "enterprise":
            return "Enterprise";
    }
}
/**
 * Model-call events accepted in one UTC calendar month.
 * Enterprise is not listed: a null project quota means no cap, and a number is that project's cap.
 */
export const MONTHLY_EVENT_QUOTA = {
    free: 10_000,
    developer: 10_000,
    pro: 250_000,
    team: 2_000_000,
    business: 2_000_000,
};
/** Team, Business, and Enterprise may stream telemetry to a webhook. Free, Developer, and Pro may not. */
export function planStreamsTelemetryExport(plan) {
    switch (plan) {
        case "team":
        case "business":
        case "enterprise":
            return true;
        case "free":
        case "developer":
        case "pro":
            return false;
    }
}
/**
 * Monthly cap for a plan.
 * Enterprise uses `customQuota`. Null means no cap. Any other plan ignores `customQuota`.
 */
export function monthlyEventQuota(plan, customQuota) {
    if (plan === "enterprise") {
        if (customQuota == null)
            return null;
        if (!Number.isInteger(customQuota) || customQuota < 0)
            return 0;
        return customQuota;
    }
    switch (plan) {
        case "free":
            return MONTHLY_EVENT_QUOTA.free;
        case "developer":
            return MONTHLY_EVENT_QUOTA.developer;
        case "pro":
            return MONTHLY_EVENT_QUOTA.pro;
        case "team":
            return MONTHLY_EVENT_QUOTA.team;
        case "business":
            return MONTHLY_EVENT_QUOTA.business;
    }
}
/** First instant of the UTC month that contains `now`. */
export function utcMonthStart(now) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
/** First instant of the next UTC month. The monthly counter starts over then. */
export function utcMonthReset(now) {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
/**
 * Compare stored usage with the plan cap.
 * With no `incoming`, `exceeded` is true when `used` is at or over a finite cap.
 * With `incoming`, `exceeded` is true when `used + incoming` is above that cap, so a batch cannot cross it.
 */
export function assessMonthlyQuota(input) {
    const quota = monthlyEventQuota(input.plan, input.customQuota);
    const used = Number.isFinite(input.used) ? Math.max(0, Math.floor(input.used)) : 0;
    const incoming = input.incoming === undefined ? null : Math.max(0, Math.floor(input.incoming));
    const remaining = quota === null ? null : Math.max(0, quota - used);
    const exceeded = quota !== null && (incoming === null ? used >= quota : used + incoming > quota);
    return {
        plan: input.plan,
        quota,
        used,
        remaining,
        resetAt: utcMonthReset(input.now).toISOString(),
        exceeded,
    };
}
export function planDefaultSpan(plan, configuredDays) {
    switch (plan) {
        case "free":
        case "developer":
            return { unit: "days", amount: 30 };
        case "pro":
        case "team":
            return { unit: "days", amount: 90 };
        case "business":
            return { unit: "months", amount: 12 };
        case "enterprise":
            return { unit: "days", amount: configuredDays ?? 365 };
    }
}
export function retentionSpanLabel(span) {
    if (span.unit === "months")
        return span.amount === 1 ? "1 month" : `${span.amount} months`;
    return span.amount === 1 ? "1 day" : `${span.amount} days`;
}
/**
 * UTC calendar subtraction that never rolls the day forward.
 * 31 March minus one month is 28 February, or 29 February in a leap year.
 * Keeping the shorter day means the period is at least the requested number of months.
 */
export function subtractUtcMonths(from, months) {
    const monthIndex = from.getUTCMonth() - months;
    const year = from.getUTCFullYear();
    const day = from.getUTCDate();
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, monthIndex, Math.min(day, lastDay), from.getUTCHours(), from.getUTCMinutes(), from.getUTCSeconds(), from.getUTCMilliseconds()));
}
export function subtractUtcDays(from, days) {
    return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}
export function spanCutoff(now, span) {
    return span.unit === "months" ? subtractUtcMonths(now, span.amount) : subtractUtcDays(now, span.amount);
}
/**
 * Period a project actually keeps logs for.
 * `high_annex3` cannot go below six months unless `otherLawOverride` is set.
 */
export function effectiveLogRetention(input) {
    const requested = planDefaultSpan(input.plan, input.configuredDays);
    const floor = { unit: "months", amount: HIGH_ANNEX3_RETENTION_FLOOR_MONTHS };
    let span = requested;
    let floorApplied = false;
    if (input.riskTier === "high_annex3" && !input.otherLawOverride) {
        const requestedCutoff = spanCutoff(input.now, requested);
        const floorCutoff = spanCutoff(input.now, floor);
        if (requestedCutoff.getTime() > floorCutoff.getTime()) {
            span = floor;
            floorApplied = true;
        }
    }
    return {
        span,
        cutoff: spanCutoff(input.now, span),
        label: retentionSpanLabel(span),
        floorApplied,
        planLabel: organizationPlanLabel(input.plan),
        planDefaultLabel: retentionSpanLabel(requested),
    };
}
