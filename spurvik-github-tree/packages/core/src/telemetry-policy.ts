import { readSpurvikEnv } from "./env.js";

let warned = false;

/**
 * Vendor telemetry is off.
 * `SPURVIK_TELEMETRY=off` is the guarantee. Any other value is ignored.
 * There is no vendor sink and no switch that turns one on.
 */
export function vendorTelemetryMode(): "off" {
  const value = readSpurvikEnv("TELEMETRY");
  if (value && value.toLowerCase() !== "off" && !warned) {
    warned = true;
    console.warn(
      `SPURVIK_TELEMETRY=${value} is ignored. Vendor telemetry stays off. There is no third-party sink to enable.`,
    );
  }
  return "off";
}
