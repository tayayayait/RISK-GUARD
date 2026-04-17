import { afterEach, describe, expect, it, vi } from "vitest";
import { validateLawFitForActions } from "../../supabase/functions/_shared/law-fit-validation.ts";
import * as incidentAnchorNormalizer from "../../supabase/functions/_shared/incident-anchor-normalizer.ts";

const baseInput = {
  taskName: "Facade maintenance",
  taskDescription: "Workers inspect an elevated platform and handle fall-risk controls during the shift.",
  analysisScenario: "A worker may slip near an open edge, so same-day and pre-resume checks are required.",
  profile: {
    industry: "construction",
    workLocation: "elevated scaffold zone",
    equipment: ["harness", "guardrail"],
    hazards: [
      { name: "fall hazard", type: "fall", weight: 35 },
      { name: "fire hazard", type: "explosion/fire", weight: 30 },
    ],
  },
};

describe("law fit validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("falls back to rule-based status when AI key is missing", async () => {
    const result = await validateLawFitForActions({
      ...baseInput,
      actionItems: [
        {
          id: "a1",
          stage: "immediate",
          actionText: "Immediately isolate the edge zone and stop access.",
          articleNumbers: ["제10조"],
          lawName: "Safety Standards Rules",
          legalRequirement: "Unauthorized access to fall-risk areas must be blocked immediately.",
        },
        {
          id: "a2",
          stage: "same_day",
          actionText: "Complete same-day log.",
          articleNumbers: [],
          lawName: "Safety Standards Rules",
          legalRequirement: "The check result must be documented.",
        },
      ],
    });

    expect(result.a1).toBeTruthy();
    expect(result.a1.status).toMatch(/verified|review_required/);
    expect(result.a1.score).toBeGreaterThanOrEqual(0);
    expect(result.a2.status).toBe("unknown");
    expect(result.a2.score).toBe(0);
    expect(result.a2.reason.length).toBeGreaterThan(0);
  });

  it("builds incident anchors once per request for multiple action items", async () => {
    const anchorSpy = vi.spyOn(incidentAnchorNormalizer, "buildIncidentAnchorSet");

    await validateLawFitForActions({
      ...baseInput,
      actionItems: [
        {
          id: "a1",
          stage: "immediate",
          actionText: "Immediately isolate the edge zone and stop access.",
          articleNumbers: ["Art 10"],
          lawName: "Safety Standards Rules",
          legalRequirement: "Unauthorized access to fall-risk areas must be blocked immediately.",
        },
        {
          id: "a2",
          stage: "same_day",
          actionText: "Verify guardrail condition and record the result today.",
          articleNumbers: ["Art 11"],
          lawName: "Safety Standards Rules",
          legalRequirement: "Same-day inspection records must be completed.",
        },
        {
          id: "a3",
          stage: "pre_resume",
          actionText: "Before restart, verify access control and emergency route condition.",
          articleNumbers: ["Art 12"],
          lawName: "Safety Standards Rules",
          legalRequirement: "Pre-resume checks must be confirmed before restart.",
        },
      ],
    });

    expect(anchorSpy).toHaveBeenCalledTimes(1);
  });

  it("does not force operational mismatch when incident operational anchors are unavailable", async () => {
    vi.spyOn(incidentAnchorNormalizer, "buildIncidentAnchorSet").mockReturnValue({
      accident_type: new Set(["type:fall"]),
      hazard_factor: new Set(["factor:fall"]),
      work_action: new Set<string>(),
      equipment: new Set<string>(),
      place: new Set<string>(),
    });

    const result = await validateLawFitForActions({
      ...baseInput,
      actionItems: [
        {
          id: "a1",
          stage: "same_day",
          actionText: "Complete same-day fall risk check and record results.",
          articleNumbers: ["Art 20"],
          lawName: "Safety Standards Rules",
          legalRequirement: "In fall-risk areas, same-day inspection and recording are required.",
        },
      ],
    });

    expect(result.a1).toBeTruthy();
    expect(result.a1.lawFitGateFailureCode).toBeUndefined();
    expect(result.a1.status).toMatch(/verified|review_required/);
  });

  it("merges valid AI response with fallback", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      results: [
                        { id: "a1", status: "review_required", score: 41, reason: "Link quality is moderate." },
                        { id: "a2", status: "verified", score: 88, reason: "Stage and legal requirement are aligned." },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await validateLawFitForActions({
      ...baseInput,
      geminiApiKey: "test-key",
      geminiModel: "gemini-2.0-flash",
      actionItems: [
        {
          id: "a1",
          stage: "same_day",
          actionText: "Complete same-day fall-risk PPE inspection log.",
          articleNumbers: ["제7조"],
          lawName: "Safety Standards Rules",
          legalRequirement: "In fall-risk zones, verify PPE use and record the check on the same day.",
        },
        {
          id: "a2",
          stage: "pre_resume",
          actionText: "Before restart, verify emergency exit access and fall controls.",
          articleNumbers: ["제101조"],
          lawName: "Safety Standards Rules",
          legalRequirement: "Pre-resume checks in fall-risk areas must be completed before restart.",
        },
      ],
    });

    expect(result.a1.status).toMatch(/verified|review_required/);
    expect(result.a1.score).toBeGreaterThanOrEqual(41);
    expect(result.a1.lawFitGateFailureCode).toBeUndefined();
    expect(result.a2.status).toBe("verified");
    expect(result.a2.score).toBeGreaterThanOrEqual(55);
  });

  it("keeps fallback result when AI payload is invalid", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: "not-json" }] } }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await validateLawFitForActions({
      ...baseInput,
      geminiApiKey: "test-key",
      actionItems: [
        {
          id: "a1",
          stage: "immediate",
          actionText: "Immediately cut ignition sources and block access.",
          articleNumbers: ["제24조"],
          lawName: "Safety Standards Rules",
          legalRequirement: "Ignition sources must be cut immediately.",
        },
      ],
    });

    expect(result.a1).toBeTruthy();
    expect(result.a1.reason.length).toBeGreaterThan(0);
    expect(result.a1.status).toMatch(/verified|review_required|unknown/);
  });

  it("recognizes synonym-like incident anchors without forcing mismatch gate", async () => {
    const result = await validateLawFitForActions({
      taskName: "Tank internal maintenance",
      taskDescription: "Measure residual flammable vapor concentration in a confined space and ventilate before restart.",
      analysisScenario: "Restart requires gas concentration check due to explosion and asphyxiation risk.",
      profile: {
        industry: "chemical",
        workLocation: "storage tank interior",
        equipment: ["gas detector", "blower"],
        hazards: [
          { name: "flammable vapor explosion", type: "explosion/fire", weight: 35 },
          { name: "asphyxiation", type: "asphyxiation", weight: 30 },
        ],
      },
      actionItems: [
        {
          id: "a1",
          stage: "pre_resume",
          actionText: "Before re-start, verify vapor concentration with a detector and keep forced ventilation active.",
          articleNumbers: ["제100조"],
          lawName: "Safety Standards Rules",
          legalRequirement: "Before resuming work, hazardous gas measurement and ventilation state must be verified.",
        },
      ],
    });

    expect(result.a1).toBeTruthy();
    expect(result.a1.lawFitGateFailureCode).toBeUndefined();
    expect(result.a1.status).toMatch(/verified|review_required/);
  });

  it("keeps INCIDENT_ANCHOR_MISMATCH even when AI returns verified", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      results: [
                        { id: "a1", status: "verified", score: 95, reason: "Looks fully aligned." },
                      ],
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const result = await validateLawFitForActions({
      taskName: "Tank solvent cleaning",
      taskDescription: "Confined-space solvent vapor exposure risk exists during cleaning.",
      analysisScenario: "Gas leak and chemical vapor can trigger asphyxiation and explosion hazards.",
      profile: {
        industry: "chemical",
        workLocation: "storage tank interior",
        equipment: ["gas detector", "respirator"],
        hazards: [{ name: "chemical exposure", type: "chemical exposure", weight: 35 }],
      },
      geminiApiKey: "test-key",
      geminiModel: "gemini-2.0-flash",
      actionItems: [
        {
          id: "a1",
          stage: "immediate",
          actionText: "Inspect guardrail installation on an elevated platform and perform fall-protection checks.",
          articleNumbers: ["제13조"],
          lawName: "Safety Standards Rules",
          legalRequirement: "Guardrails are required in fall-risk elevated zones.",
        },
      ],
    });

    expect(result.a1.status).toBe("review_required");
    expect(result.a1.lawFitGateFailureCode).toBe("INCIDENT_ANCHOR_MISMATCH");
    expect(result.a1.score).toBeLessThanOrEqual(54);
  });
});
