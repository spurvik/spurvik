"use client";

import { AIDisclosureLabel } from "./ai-disclosure-label.js";

/**
 * Article 50(1) interaction notice. Prefer `AIDisclosureLabel` for the other variants.
 * Kept so existing imports keep working.
 */
export interface AiDisclosureProps {
  systemName: string;
  purpose?: string;
  jurisdiction?: string;
  className?: string;
  locale?: string;
  onShown?: (info: { systemName: string; jurisdiction: string }) => void;
}

export function AiDisclosure({ systemName, purpose, jurisdiction = "EU", className, locale = "en" }: AiDisclosureProps) {
  return (
    <div className={className}>
      <AIDisclosureLabel notice="interaction" locale={locale} systemName={systemName} />
      {purpose ? (
        <p style={{ margin: "8px 0 0", font: "14px/1.5 ui-sans-serif, system-ui, sans-serif", color: "#3f3f3f" }}>
          {purpose}
        </p>
      ) : null}
      <span data-jurisdiction={jurisdiction} hidden />
    </div>
  );
}
