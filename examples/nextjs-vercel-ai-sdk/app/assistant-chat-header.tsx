"use client";

import { AIDisclosureLabel } from "spurvik/react";

/**
 * Visible Article 50(1) interaction notice.
 * The words stay on the page without a click.
 * This label is not Article 50(2) machine-readable marking.
 */
export function AssistantChatHeader({ locale = "en" }: { locale?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <AIDisclosureLabel notice="interaction" presentation="inline" locale={locale} euIcon />
    </div>
  );
}
