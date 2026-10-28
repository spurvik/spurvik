"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { disclosureCopy } from "./locales.js";

export type SignatureCheck = "matches" | "mismatch" | "unchecked";

export interface AIDisclosureDetailsProps {
  locale?: string;
  riskTier?: "minimal" | "limited_art50" | "high_annex3";
  modelSummary?: string;
  provenance?: {
    timestamp?: string;
    modelId?: string;
    /** Result of a signature check. "matches" is not a legal determination. */
    signature?: SignatureCheck;
  };
  className?: string;
}

/**
 * Supplementary dialog. The disclosure label stays visible without opening this.
 */
export function AIDisclosureDetails({
  locale = "en",
  riskTier,
  modelSummary,
  provenance,
  className,
}: AIDisclosureDetailsProps) {
  const copy = disclosureCopy(locale);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>("button, a[href], input, textarea, select, [tabindex]:not([tabindex='-1'])")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      (previouslyFocused ?? buttonRef.current)?.focus();
    };
  }, [open]);

  const tier =
    riskTier === "high_annex3" ? copy.tierHigh : riskTier === "limited_art50" ? copy.tierLimited : riskTier === "minimal" ? copy.tierMinimal : null;
  const signature =
    provenance?.signature === "matches"
      ? copy.signatureMatches
      : provenance?.signature === "mismatch"
        ? copy.signatureMismatch
        : copy.signatureUnchecked;

  return (
    <span className={className} lang={locale}>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        style={buttonStyle}
      >
        {copy.moreInfo}
      </button>
      {open ? (
        <div style={backdropStyle} onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            style={dialogStyle}
          >
            <h2 id={titleId} style={{ margin: 0, fontSize: 18 }}>
              {copy.dialogTitle}
            </h2>
            <dl style={{ display: "grid", gap: 10, margin: "14px 0" }}>
              {tier ? <Detail term={copy.riskTier} value={tier} /> : null}
              {modelSummary ? <Detail term={copy.modelSummary} value={modelSummary} /> : null}
              <Detail
                term={copy.provenance}
                value={[signature, provenance?.modelId, provenance?.timestamp].filter(Boolean).join(" · ")}
              />
            </dl>
            <p style={{ margin: "0 0 14px", color: "#3f3f3f", fontSize: 14, lineHeight: 1.5 }}>{copy.humanReadable}</p>
            <p style={{ margin: "0 0 14px", color: "#3f3f3f", fontSize: 14, lineHeight: 1.5 }}>{copy.notLegalAdvice}</p>
            <button ref={closeRef} type="button" onClick={() => setOpen(false)} style={buttonStyle}>
              {copy.close}
            </button>
          </div>
        </div>
      ) : null}
    </span>
  );
}

function Detail({ term, value }: { term: string; value: string }) {
  return (
    <div>
      <dt style={{ fontSize: 12, fontWeight: 650, letterSpacing: "0.04em", textTransform: "uppercase" }}>{term}</dt>
      <dd style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>{value}</dd>
    </div>
  );
}

const buttonStyle: CSSProperties = {
  minHeight: 32,
  minWidth: 32,
  border: "1px solid #1d1d1b",
  borderRadius: 999,
  padding: "6px 12px",
  background: "#ffffff",
  color: "#1d1d1b",
  font: "14px/1.4 ui-sans-serif, system-ui, sans-serif",
  cursor: "pointer",
};

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(20, 18, 16, 0.46)",
  display: "grid",
  placeItems: "center",
  padding: 16,
  zIndex: 40,
};

const dialogStyle: CSSProperties = {
  width: "min(32rem, 100%)",
  maxHeight: "min(80vh, 40rem)",
  overflow: "auto",
  background: "#ffffff",
  color: "#1d1d1b",
  borderRadius: 16,
  padding: 20,
  boxShadow: "0 16px 50px rgba(0,0,0,0.18)",
};
