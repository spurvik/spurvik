"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import { sendDisclosureBeacon, watchDisclosureVisibility, type DisclosureBeaconOptions } from "./beacon.js";
import { EuMark } from "./eu-mark.js";
import type { EuIconMark, EuIconTone } from "./eu-icons.js";
import { disclosureCopy } from "./locales.js";

export type DisclosureNotice = "interaction" | "generated" | "deepfake" | "public-interest" | "emotion-biometric";

export interface AIDisclosureLabelProps {
  /** Article 50(1), 50(2), 50(3), or an Article 50(4) variant. */
  notice?: DisclosureNotice;
  /** `inline` is the pill. The wording stays on screen either way. */
  presentation?: "block" | "inline";
  /** BCP 47 language. Built-in codes cover the 24 EU languages. */
  locale?: string;
  systemName?: string;
  /**
   * EU icon. Defaults to the basic mark when set to true.
   * The icon is optional and does not by itself meet Article 50.
   */
  euIcon?: boolean | { mark?: EuIconMark; tone?: EuIconTone };
  className?: string;
  style?: CSSProperties;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
  /** Optional prefix. The Article 50(1) disclosure sentence stays in the label. */
  brandName?: string;
  /**
   * Optional notice telemetry. Omit it, or omit `consent`, and nothing is stored.
   * Set `consent: true` only after the site operator's consent tool allows it.
   * The operator obtains consent. A server-side log of the page that was served
   * does not use this prop.
   */
  beacon?: Omit<DisclosureBeaconOptions, "noticeKind">;
  /**
   * When true (the default), render a small "Art. 50 · Spurvik" link to
   * https://spurvik.com after the disclosure text. The disclosure text stays
   * first in the DOM and reading order. The link has no query parameters, and
   * the component does not set cookies or make a network call for it.
   * Set `false` to omit the link and keep the previous markup. Removing the
   * link is a Pro (€19/mo) and Team (€79/mo) option under the plan terms.
   * This component does not check the plan; the console handles that.
   */
  attribution?: boolean;
}

const noticeKind = {
  interaction: "interaction",
  generated: "generated",
  deepfake: "deepfake",
  "public-interest": "public_interest_text",
  "emotion-biometric": "emotion_biometric",
} as const;

/**
 * Always-visible AI disclosure. The words are in the page without a click.
 * This supports transparency work. It is not a conformity finding and it is
 * not, by itself, Article 50(2) machine-readable marking.
 */
export function AIDisclosureLabel({
  notice = "interaction",
  presentation = "block",
  locale = "en",
  systemName,
  euIcon = false,
  className,
  style,
  accentColor,
  backgroundColor,
  textColor,
  borderColor,
  brandName,
  beacon,
  attribution = true,
}: AIDisclosureLabelProps) {
  const copy = disclosureCopy(locale);
  const ref = useRef<HTMLElement>(null);
  const noteId = useId();
  const icon = resolveIcon(notice, euIcon);

  useEffect(() => {
    const node = ref.current;
    if (!node || !beacon?.endpoint || !beacon.apiKey) return;
    return watchDisclosureVisibility(node, () => {
      sendDisclosureBeacon({ ...beacon, noticeKind: noticeKind[notice] });
    });
  }, [beacon, notice]);

  const headline = withBrand(
    brandName,
    notice === "interaction"
      ? systemName
        ? `${systemName}. ${copy.interaction}`
        : copy.interaction
      : notice === "generated"
        ? copy.generated
        : notice === "deepfake"
          ? copy.deepfake
          : notice === "emotion-biometric"
            ? copy.emotionBiometric
            : copy.publicInterest,
  );

  const detail =
    presentation === "block"
      ? notice === "generated"
        ? copy.generatedDetail
        : notice === "interaction"
          ? null
          : null
      : null;

  const inline = presentation === "inline";
  const computedStyle = labelStyle({
    inline,
    style,
    accentColor,
    backgroundColor,
    textColor,
    borderColor,
  });

  return (
    <aside
      ref={ref}
      role="note"
      lang={locale}
      aria-describedby={noteId}
      data-aegis-disclosure={notice}
      className={className}
      style={computedStyle}
    >
      {icon ? <EuMark mark={icon.mark} tone={icon.tone} height={inline ? 22 : 32} /> : null}
      <span style={{ display: "flex", minWidth: 0, flexDirection: "column", gap: 2 }}>
        <strong style={{ fontWeight: 650 }}>{headline}</strong>
        {detail ? <span>{detail}</span> : null}
        {inline ? (
          <span id={noteId} style={visuallyHidden}>
            {copy.humanReadable}
          </span>
        ) : (
          <span id={noteId} style={{ color: textColor && !isTransparentColor(textColor) ? textColor : "#3f3f3f", fontSize: 13 }}>
            {copy.humanReadable}
          </span>
        )}
        {attribution ? (
          <>
            <style>{ATTRIBUTION_FOCUS_CSS}</style>
            <a
              href={ATTRIBUTION_HREF}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={ATTRIBUTION_ARIA_LABEL}
              data-spurvik-attribution=""
              style={attributionLinkStyle}
            >
              {ATTRIBUTION_TEXT}
            </a>
          </>
        ) : null}
      </span>
    </aside>
  );
}

function withBrand(brandName: string | undefined, text: string): string {
  const brand = brandName?.trim();
  if (!brand) return text;
  return `${brand}. ${text}`;
}

function labelStyle(input: {
  inline: boolean;
  style?: CSSProperties;
  accentColor?: string;
  backgroundColor?: string;
  textColor?: string;
  borderColor?: string;
}): CSSProperties {
  const branded: CSSProperties = {};
  if (input.backgroundColor) branded.background = input.backgroundColor;
  if (input.textColor && !isTransparentColor(input.textColor)) branded.color = input.textColor;
  if (input.borderColor) branded.borderColor = input.borderColor;
  if (input.accentColor) {
    if (!input.borderColor) branded.borderColor = input.accentColor;
    branded.boxShadow = `inset 3px 0 0 ${input.accentColor}`;
  }
  const custom = { ...input.style };
  if (isTransparentColor(custom.color)) delete custom.color;
  return {
    ...(input.inline ? pillStyle : blockStyle),
    ...branded,
    ...custom,
    display: "inline-flex",
    visibility: "visible",
    opacity: 1,
  };
}

function isTransparentColor(color: CSSProperties["color"]): boolean {
  return typeof color === "string" && color.trim().toLowerCase() === "transparent";
}

function resolveIcon(
  notice: DisclosureNotice,
  euIcon: AIDisclosureLabelProps["euIcon"],
): { mark: EuIconMark; tone: EuIconTone } | null {
  if (!euIcon) return null;
  if (euIcon === true) {
    return { mark: notice === "generated" ? "generated" : "basic", tone: "black" };
  }
  return { mark: euIcon.mark ?? (notice === "generated" ? "generated" : "basic"), tone: euIcon.tone ?? "black" };
}

const blockStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 12,
  maxWidth: "40rem",
  border: "1px solid #1d1d1b",
  borderRadius: 12,
  padding: "12px 14px",
  background: "#ffffff",
  color: "#1d1d1b",
  font: "15px/1.5 ui-sans-serif, system-ui, sans-serif",
};

const pillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  width: "fit-content",
  maxWidth: "100%",
  border: "1px solid #1d1d1b",
  borderRadius: 999,
  padding: "6px 12px",
  background: "#ffffff",
  color: "#1d1d1b",
  font: "14px/1.4 ui-sans-serif, system-ui, sans-serif",
};

const visuallyHidden: CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const ATTRIBUTION_HREF = "https://spurvik.com";
const ATTRIBUTION_TEXT = "Art. 50 · Spurvik";
const ATTRIBUTION_ARIA_LABEL = "About this AI disclosure label, by Spurvik (opens in a new tab)";

const ATTRIBUTION_FOCUS_CSS =
  "a[data-spurvik-attribution]:focus-visible{outline:2px solid currentColor;outline-offset:2px}";

const attributionLinkStyle: CSSProperties = {
  alignSelf: "flex-start",
  marginTop: 2,
  fontSize: 11,
  fontWeight: 500,
  lineHeight: 1.4,
  color: "inherit",
  opacity: 0.72,
  textDecoration: "underline",
  textUnderlineOffset: 2,
  outlineOffset: 2,
};
