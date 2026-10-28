"use client";

import { AIDisclosureLabel, type AIDisclosureLabelProps } from "./ai-disclosure-label.js";

export type AIArticle50Section3NoticeProps = Omit<AIDisclosureLabelProps, "notice">;

/**
 * Article 50(3) notice for emotion recognition or biometric categorisation.
 * The sentence is in the page without a click. This supports the transparency
 * duty. It is not a finding that the notice is sufficient, and it is not legal advice.
 */
export function AIArticle50Section3Notice(props: AIArticle50Section3NoticeProps) {
  return <AIDisclosureLabel {...props} notice="emotion-biometric" />;
}
