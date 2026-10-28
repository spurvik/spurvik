import type { CSSProperties } from "react";
import { euIconSvg, type EuIconMark, type EuIconTone } from "./eu-icons.js";

const keys = {
  basic: { black: "basicBlack", white: "basicWhite" },
  generated: { black: "generatedBlack", white: "generatedWhite" },
  modified: { black: "modifiedBlack", white: "modifiedWhite" },
} as const;

/**
 * Official EU icon (basic, fully AI-generated, or partially AI-modified).
 * The icon is optional. It does not by itself meet Article 50.
 */
export function EuMark({
  mark,
  tone = "black",
  height = 28,
}: {
  mark: EuIconMark;
  tone?: EuIconTone;
  height?: number;
}) {
  const svg = euIconSvg[keys[mark][tone]];
  const wide = mark !== "basic";
  const style: CSSProperties = {
    height,
    width: wide ? Math.round(height * 2.15) : height,
    display: "block",
    flex: "0 0 auto",
  };
  return <span style={style} dangerouslySetInnerHTML={{ __html: svg }} />;
}
