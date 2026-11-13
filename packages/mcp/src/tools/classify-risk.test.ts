import { describe, expect, it, vi } from "vitest";
import { classifyAiActRisk, RISK_DOMAINS, SCOPE_NOTE, type ClassifyRiskInput, type ClassifyRiskResult } from "./classify-risk.js";

function classify(input: ClassifyRiskInput): ClassifyRiskResult {
  const outcome = classifyAiActRisk(input);
  if (!outcome.ok) throw new Error(`expected ok, got ${outcome.error}: ${outcome.message}`);
  return outcome.result;
}

function articles(result: ClassifyRiskResult): string[] {
  return result.obligations.map((obligation) => obligation.article);
}

describe("classifyAiActRisk tiers", () => {
  it.each([
    ["A social scoring system that ranks citizens by trustworthiness for public services", "social_scoring"],
    ["Real-time facial recognition in public streets for the police", "realtime_remote_biometric_identification"],
    ["Emotion recognition of employees during video calls to rate engagement", "emotion_recognition_work_education"],
    ["We use mass scraping of facial images from social media to build a face search database", "untargeted_face_scraping"],
    ["Predict which individuals are likely to commit a crime from their profile", "predictive_policing_profiling"],
    ["Infer sexual orientation from facial photos with biometric analysis", "biometric_categorisation_sensitive"],
    ["An app with subliminal audio cues that push shoppers to buy", "subliminal_manipulation"],
    ["A toy that exploits the vulnerability of children to drive in-app purchases", "exploiting_vulnerabilities"],
  ])("maps %j to prohibited_art5", (useCase, practice) => {
    const result = classify({ useCase });
    expect(result.tier).toBe("prohibited_art5");
    expect(result.prohibitedPractices.map((entry) => entry.id)).toContain(practice);
    expect(result.annexIiiArea).toBeNull();
    expect(articles(result)).toEqual(["Art. 5"]);
    expect(result.recommendedSpurvikControls[0]?.tool).toBeNull();
  });

  it("prohibited wins over an explicit Annex III domain and transparency flags", () => {
    const result = classify({
      useCase: "Social scoring of tenants",
      domain: "essential_services_credit",
      interactsWithHumans: true,
      makesAutomatedDecisionsAboutPeople: true,
    });
    expect(result.tier).toBe("prohibited_art5");
  });

  it.each([
    ["AI CV screening that shortlists job applicants", "employment_hr"],
    ["Credit scoring model for consumer loan approval", "essential_services_credit"],
    ["Automated grading of student exams", "education"],
    ["Triage of visa applications at the border agency", "migration_border"],
    ["Safety component in the control system of the electricity grid", "critical_infrastructure"],
    ["Facial recognition to identify visitors in a stadium", "biometrics"],
    ["Assist judges with legal research for court rulings", "justice_democracy"],
    ["Police risk assessment of suspects", "law_enforcement"],
  ])("infers Annex III from %j", (useCase, area) => {
    const result = classify({ useCase });
    expect(result.tier).toBe("high_risk_annex_iii");
    expect(result.annexIiiArea).toBe(area);
    expect(result.domainSource).toBe("useCase_keywords");
    expect(result.annexIiiPoint).toMatch(/^Annex III point [1-8] /);
    expect(articles(result)).toEqual(expect.arrayContaining(["Art. 11 + Annex IV", "Art. 12", "Art. 14"]));
    expect(result.obligations.find((obligation) => obligation.article === "Art. 12")?.appliesFrom).toBe("2027-12-02");
  });

  it("an explicit Annex III domain is high-risk by default", () => {
    const result = classify({ useCase: "Ranks loan applicants", domain: "essential_services_credit" });
    expect(result.tier).toBe("high_risk_annex_iii");
    expect(result.domainSource).toBe("input");
    expect(result.signals.makesAutomatedDecisionsAboutPeople).toEqual({ value: true, source: "useCase_keywords" });
    expect(result.recommendedSpurvikControls.map((control) => control.tool)).toEqual(
      expect.arrayContaining(["spurvik_setup_snippet", "spurvik_find_unwrapped_calls"]),
    );
    expect(result.recommendedSpurvikControls.find((control) => control.article === "Art. 11")?.plan).toBe("team");
    expect(result.reviewFlags.join(" ")).toMatch(/Article 6\(3\)/);
  });

  it("an explicit 'no decisions about people' opts a person-facing Annex III area out, with a review flag", () => {
    const result = classify({
      useCase: "FAQ chatbot on the university website",
      domain: "education",
      makesAutomatedDecisionsAboutPeople: false,
    });
    expect(result.tier).toBe("limited_transparency_art50");
    expect(result.annexIiiArea).toBe("education");
    expect(result.reviewFlags.join(" ")).toMatch(/Annex III point 3/);
    expect(articles(result)).toEqual(["Art. 50(1)"]);
  });

  it("critical infrastructure and biometrics stay high-risk without decisions about people", () => {
    expect(classify({ useCase: "Grid load balancing", domain: "critical_infrastructure", makesAutomatedDecisionsAboutPeople: false }).tier).toBe(
      "high_risk_annex_iii",
    );
    const biometric = classify({ useCase: "Remote biometric identification at airports", domain: "biometrics", makesAutomatedDecisionsAboutPeople: false });
    expect(biometric.tier).toBe("high_risk_annex_iii");
    expect(articles(biometric)).toContain("Art. 50(3)");
    expect(biometric.reviewFlags.join(" ")).toMatch(/Biometric verification/);
  });

  it("high-risk also lists Article 50 duties", () => {
    const result = classify({ useCase: "Recruiting chatbot that screens candidates", interactsWithHumans: true });
    expect(result.tier).toBe("high_risk_annex_iii");
    expect(articles(result)).toEqual(expect.arrayContaining(["Art. 50(1)", "Art. 12"]));
  });

  it.each([
    ["Customer support chatbot on our web shop", { interacts: true, synthetic: false }],
    ["Text-to-image generator for marketing banners", { interacts: false, synthetic: true }],
    ["Generates product descriptions for our catalogue", { interacts: false, synthetic: true }],
  ])("maps %j to limited_transparency_art50", (useCase, expected) => {
    const result = classify({ useCase });
    expect(result.tier).toBe("limited_transparency_art50");
    expect(result.signals.interactsWithHumans.value).toBe(expected.interacts);
    expect(result.signals.generatesSyntheticMedia.value).toBe(expected.synthetic);
    expect(result.obligations.every((obligation) => obligation.appliesFrom === "2026-08-02")).toBe(true);
  });

  it("maps deepfake generation to Art. 50(2) and 50(4)", () => {
    const result = classify({ useCase: "Deepfake video generator for satire" });
    expect(result.tier).toBe("limited_transparency_art50");
    expect(articles(result)).toEqual(expect.arrayContaining(["Art. 50(2)", "Art. 50(4)"]));
  });

  it("maps a plain internal tool to minimal_risk", () => {
    const result = classify({ useCase: "Spam filter for our internal ticket queue" });
    expect(result.tier).toBe("minimal_risk");
    expect(result.obligations).toEqual([]);
    expect(result.recommendedSpurvikControls[0]?.tool).toBe("spurvik_generate_art50_badge");
  });

  it("explicit flags override keyword inference", () => {
    const result = classify({ useCase: "Customer support chatbot", interactsWithHumans: false, generatesSyntheticMedia: false });
    expect(result.signals.interactsWithHumans).toEqual({ value: false, source: "input" });
    expect(result.tier).toBe("minimal_risk");
    const flagged = classify({ useCase: "Internal analytics", generatesSyntheticMedia: true });
    expect(flagged.tier).toBe("limited_transparency_art50");
    expect(articles(flagged)).toEqual(["Art. 50(2)"]);
  });
});

describe("classifyAiActRisk output contract", () => {
  it("returns the fixed links, prices and a single scope note", () => {
    const result = classify({ useCase: "Customer support chatbot" });
    expect(result.interactiveClassifierUrl).toBe("https://console.spurvik.com/risk-check");
    expect(result.upgradeUrls.pro.url).toBe("https://console.spurvik.com/signup?plan=pro");
    expect(result.upgradeUrls.pro.price).toMatch(/^€19\/mo/);
    expect(result.upgradeUrls.team.url).toBe("https://console.spurvik.com/signup?plan=team");
    expect(result.upgradeUrls.team.price).toMatch(/^€79\/mo/);
    expect(result.upgradeUrls.team.includes).toMatch(/Annex IV/);
    expect(result.upgradeUrls.concierge.url).toBe("https://console.spurvik.com/signup?plan=concierge");
    expect(result.upgradeUrls.concierge.price).toMatch(/^€199 once/);
    expect(result.upgradeUrls.concierge.includes).toMatch(/24h/);
    expect(result.scopeNote).toBe("Engineering mapping aid; not legal advice.");
    expect(SCOPE_NOTE).toBe(result.scopeNote);
    expect(JSON.stringify(result).match(/legal advice/g)?.length).toBeLessThanOrEqual(2);
  });

  it("never echoes the use-case text", () => {
    const secretish = "Chatbot for ACME internal project Bluebird with jane.doe@example.com";
    const result = classify({ useCase: secretish });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("Bluebird");
    expect(serialized).not.toContain("jane.doe@example.com");
  });

  it("is deterministic and makes no network call", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const input: ClassifyRiskInput = { useCase: "Credit scoring for loan approval", interactsWithHumans: true };
    expect(classify(input)).toEqual(classify(input));
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("accepts every documented domain", () => {
    for (const domain of RISK_DOMAINS) {
      expect(classifyAiActRisk({ useCase: "Customer support chatbot", domain }).ok).toBe(true);
    }
  });

  it.each([
    [{}, "invalid_use_case"],
    [{ useCase: "" }, "invalid_use_case"],
    [{ useCase: "   " }, "invalid_use_case"],
    [{ useCase: "x".repeat(4001) }, "invalid_use_case"],
    [{ useCase: "chatbot", domain: "healthcare" }, "invalid_domain"],
    [{ useCase: "chatbot", interactsWithHumans: "yes" }, "invalid_flag"],
    [null, "invalid_input"],
  ])("rejects invalid input %j", (input, error) => {
    const outcome = classifyAiActRisk(input);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error).toBe(error);
  });
});
