import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateGeminiTextWithFallback } from "@/services/geminiTextModelFallback";
import {
  buildImageGenerationParts,
  buildScenarioImagePrompt,
  evaluateHazardVisibilityHeuristic,
  evaluateScenarioImageQuality,
  extractInlineGeneratedImage,
  getGeminiImageModelCandidates,
  normalizeAccidentTypeKey,
  parsePredictionScenarios,
  predictionService,
  PredictionRecognizedContext,
  PredictionScenario,
} from "@/services/predictionService";

vi.mock("@/services/geminiTextModelFallback", () => ({
  generateGeminiTextWithFallback: vi.fn(),
}));

function createScenario(overrides?: Partial<PredictionScenario>): PredictionScenario {
  return {
    id: "scenario-1",
    accidentType: "추락 사고",
    riskLocation: "상부 작업 발판",
    reason: "안전난간이 없어 균형을 잃을 수 있습니다.",
    immediateAction: "작업을 중지하고 안전난간을 설치합니다.",
    detail: "추락 위험이 높은 구간입니다.",
    ...overrides,
  };
}

function createRecognizedContext(overrides?: Partial<PredictionRecognizedContext>): PredictionRecognizedContext {
  return {
    canonicalEquipment: "manual crane",
    operationContext: "manual crane lifting/transport operation",
    hazardParts: ["chain", "hook", "lifting hook point"],
    sceneConstraints: [
      "chain block, chain, and lifting hook point should be clearly visible in one frame.",
      "avoid wide-angle distortion and keep equipment scale realistic.",
    ],
    confidence: "high",
    catalogEvidence: {
      primary: {
        id: "315",
        machineNameKorean: "manual crane",
        machineNameEnglish: "Manual crane",
        description: "Human-powered crane used to lift and move heavy materials.",
        score: 999,
      },
      alternatives: [],
    },
    ...overrides,
  };
}

function createInlineImageResponse(base64Data: string): Response {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: base64Data,
                },
              },
            ],
          },
        },
      ],
    }),
    text: async () => "",
  } as unknown as Response;
}

describe("predictionService helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_GEMINI_API_KEY", "test-api-key");
    vi.stubEnv("VITE_GEMINI_IMAGE_API_KEY", "test-image-api-key");
    vi.stubEnv("VITE_GEMINI_TEXT_MODEL", "gemini-test-text");
    vi.stubEnv("VITE_GEMINI_IMAGE_MODEL", "gemini-test-image");
  });

  it("uses gemini-3.1-flash-image-preview as default first candidate", () => {
    const candidates = getGeminiImageModelCandidates();
    expect(candidates[0]).toBe("gemini-3.1-flash-image-preview");
  });

  it("keeps configured model first and de-duplicates candidates", () => {
    const candidates = getGeminiImageModelCandidates("gemini-2.5-flash-image");
    expect(candidates[0]).toBe("gemini-2.5-flash-image");
    expect(candidates.filter((value) => value === "gemini-2.5-flash-image")).toHaveLength(1);
  });

  it("extracts inline image payload from generateContent response", () => {
    const payload = {
      candidates: [
        {
          content: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: "abcd1234",
                },
              },
            ],
          },
        },
      ],
    };

    expect(extractInlineGeneratedImage(payload)).toEqual({
      mimeType: "image/png",
      data: "abcd1234",
    });
  });

  it("returns null when generateContent response has no image part", () => {
    const payload = {
      candidates: [{ content: { parts: [{ text: "text-only response" }] } }],
    };

    expect(extractInlineGeneratedImage(payload)).toBeNull();
  });

  it("parses three scenarios from strict JSON response", () => {
    const raw = JSON.stringify({
      scenarios: [
        {
          accidentType: "추락 사고",
          riskLocation: "상부 발판",
          reason: "발판 가장자리에 보호난간이 없습니다.",
          immediateAction: "작업을 멈추고 안전난간을 설치합니다.",
          detail: "작업 시작 전 난간 고정 여부를 먼저 확인합니다.",
        },
        {
          accidentType: "끼임 사고",
          riskLocation: "프레스 작동부",
          reason: "자재가 가동부 틈으로 들어가고 있습니다.",
          immediateAction: "전원을 차단하고 인터록을 확인합니다.",
          detail: "정지 확인 전에 가동부 접근을 하지 않습니다.",
        },
        {
          accidentType: "감전 사고",
          riskLocation: "electrical panel",
          reason: "젖은 상태에서 금속 접촉이 발생할 수 있습니다.",
          immediateAction: "전원을 차단하고 절연 장비를 착용합니다.",
          detail: "절연 장갑 없이 접근하지 않습니다.",
        },
      ],
    });

    const scenarios = parsePredictionScenarios(raw, "factory operation");

    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].accidentType).toBe("추락 사고");
    expect(scenarios[1].riskLocation).toBe("프레스 작동부");
    expect(scenarios[2].immediateAction).toContain("전원");
  });

  it("parses fenced JSON response and guarantees scenario count", () => {
    const raw = `\`\`\`json
{
  "scenarios": [
    {
      "accidentType": "추락 사고",
      "riskLocation": "고소 작업대 주변",
      "reason": "작업대 흔들림으로 균형을 잃을 수 있습니다.",
      "immediateAction": "작업 중지 후 아웃리거를 재확인합니다."
    }
  ]
}
\`\`\``;

    const scenarios = parsePredictionScenarios(raw, "고소 작업");

    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].accidentType).toBe("추락 사고");
    expect(scenarios[0].detail.length).toBeGreaterThan(0);
  });

  it("fills missing fields with fallback and always returns three items", () => {
    const raw = JSON.stringify({
      scenarios: [
        {
          accidentType: "",
          riskLocation: "작업 통로",
        },
      ],
    });

    const scenarios = parsePredictionScenarios(raw, "설비 통로");

    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].accidentType.length).toBeGreaterThan(0);
    expect(scenarios[0].reason.length).toBeGreaterThan(0);
    expect(scenarios[0].immediateAction.length).toBeGreaterThan(0);
  });

  it("normalizes all 18 accident-type aliases (ko/en) to standard keys", () => {
    const cases: Array<{ text: string; expected: string }> = [
      { text: "끼임 위험", expected: "caughtIn" },
      { text: "pinch point exposure", expected: "pinch" },
      { text: "절단 사고", expected: "cutting" },
      { text: "laceration from sharp edge", expected: "laceration" },
      { text: "찔림 위험", expected: "puncture" },
      { text: "equipment collision path", expected: "collision" },
      { text: "부딪힘 위험", expected: "struckAgainst" },
      { text: "struck by flying object", expected: "struckBy" },
      { text: "낙하·비래 위험", expected: "fallingFlyingObject" },
      { text: "fall from height near platform", expected: "fallFromHeight" },
      { text: "넘어짐/미끄러짐 위험", expected: "slipTrip" },
      { text: "electric shock exposure", expected: "electricShock" },
      { text: "화상 위험", expected: "burn" },
      { text: "explosion hazard", expected: "explosion" },
      { text: "화재 확산", expected: "fire" },
      { text: "깔림 위험", expected: "buried" },
      { text: "압궤 위험", expected: "crushing" },
      { text: "붕괴 징후", expected: "collapse" },
    ];

    for (const testCase of cases) {
      expect(normalizeAccidentTypeKey([testCase.text])).toBe(testCase.expected);
    }
  });

  it("enforces mechanism diversity across three scenarios", () => {
    const raw = JSON.stringify({
      scenarios: [
        {
          accidentType: "끼임 사고",
          riskLocation: "프레스 작동부 간극",
          reason: "작업자 손이 간극으로 접근합니다.",
          immediateAction: "비상정지를 누릅니다.",
          detail: "가동 중 접근 금지 구간입니다.",
        },
        {
          accidentType: "끼임 사고",
          riskLocation: "프레스 작동부 간극",
          reason: "정비 중 오조작으로 가동될 수 있습니다.",
          immediateAction: "전원을 차단합니다.",
          detail: "협착 간극이 동일합니다.",
        },
        {
          accidentType: "끼임 사고",
          riskLocation: "프레스 작동부 간극",
          reason: "보호덮개 미설치 상태입니다.",
          immediateAction: "보호덮개 설치 후 재개합니다.",
          detail: "동일한 접점 반복입니다.",
        },
      ],
    });

    const scenarios = parsePredictionScenarios(raw, "press");
    const mechanismKeys = new Set(
      scenarios.map((scenario) =>
        normalizeAccidentTypeKey([scenario.accidentType, scenario.riskLocation, scenario.reason, scenario.detail]) ?? "unknown",
      ),
    );

    expect(scenarios).toHaveLength(3);
    expect(mechanismKeys.size).toBeGreaterThanOrEqual(2);
  });

  it("builds scenario image prompt with context anchors and secondary accident label", () => {
    const recognizedContext = createRecognizedContext({
      canonicalEquipment: "press",
      operationContext: "press inspection work",
      hazardParts: ["moving part", "infeed roller", "emergency stop zone"],
      sceneConstraints: ["Keep the press moving section visible near frame center."],
    });

    const prompt = buildScenarioImagePrompt({
      inputStr: "press equipment inspection",
      scenario: createScenario({
        accidentType: "caught-in accident",
        riskLocation: "press moving section",
      }),
      hasReferenceImage: true,
      recognizedContext,
    });

    expect(prompt).toContain("Generate one semi-realistic industrial safety training illustration.");
    expect(prompt).toContain("Use a text-free semi-realistic illustration style suitable for industrial safety education materials.");
    expect(prompt).toContain("Preserve realistic industrial scene grounding (equipment geometry, scale, lighting, and spatial layout) while rendering in a semi-realistic illustration style.");
    expect(prompt).not.toContain("Generate one photorealistic industrial safety near-miss image.");
    expect(prompt).not.toContain("Use documentary-style realism and natural lighting.");
    expect(prompt).toContain("Use the uploaded image ONLY as a reference for background environment and equipment characteristics.");
    expect(prompt).toContain("Primary interpretation priority (highest to lowest): clear depiction of plausible accident situation > site background/equipment style (from reference) > recognized context > risk point > accident label.");
    expect(prompt).toContain("Equipment and site anchor: press equipment inspection");
    expect(prompt).toContain("Recognized equipment: press");
    expect(prompt).toContain("Recognized operation context: press inspection work");
    expect(prompt).toContain("Risk point anchor: press moving section");
    expect(prompt).toContain("Secondary accident label: caught-in accident");
    expect(prompt).toContain("Immediate response cue:");
    expect(prompt).toContain("Hard constraints:");
    expect(prompt).toContain("=== PRE-INCIDENT SINGLE SCENE (MANDATORY) ===");
    expect(prompt).toContain("Use one continuous scene only. Do not split the frame into left/right, before/after, or any multi-panel format.");
    expect(prompt).toContain("Depict the unsafe condition and worker exposure build-up right before incident onset (1-2 seconds prior).");
    expect(prompt).toContain("Do not depict completed impact/contact state: no object already dropped to floor, no collision already completed, no worker already struck.");
    expect(prompt).not.toContain("For suspended-load/fall risks, keep load in air with unstable tilt or slipping signs, but not fully detached impact aftermath.");
    expect(prompt).toContain("Do not render the words BEFORE/AFTER or any other readable characters.");
    expect(prompt).toContain("=== IMMINENCE AND WORKER REACTION (MANDATORY) ===");
    expect(prompt).toContain("Freeze the split-second before incident onset; the scene should feel 1-2 seconds away from impact/contact.");
    expect(prompt).toContain("=== DISTANCE AND POSITION CLARITY (MANDATORY) ===");
    expect(prompt).toContain("=== SCENARIO SIGNAL LINKING (MANDATORY) ===");
    expect(prompt).toContain("=== SCALE AND PERSPECTIVE CONSISTENCY (MANDATORY) ===");
    expect(prompt).toContain("Enforce realistic anthropometric baseline: standing worker height roughly 1.6m to 1.9m.");
    expect(prompt).not.toContain("For crane/hoist scenes, hook block and sling components should stay proportionate to worker torso/arms; avoid oversized rigging that dwarfs humans unnaturally.");
    expect(prompt).toContain("The single image MUST instantly communicate five elements WITHOUT any text overlay:");
    expect(prompt).toContain("1) ACCIDENT TYPE - What kind of accident is imminent?");
    expect(prompt).toContain("4) INJURY-PRONE BODY PART - Which body part is at immediate risk?");
    expect(prompt).toContain("ACCIDENT TYPE visual encoding:");
    expect(prompt).toContain("INJURY-PRONE BODY PART visual encoding:");
    expect(prompt).toContain("Clearly show the body part at immediate risk (hand, forearm, head, torso, leg, or foot) in close spatial relation to the hazard source.");
    expect(prompt).toContain("Prioritize educational clarity over shock value; do not depict gore, dismemberment, or graphic injury.");
    expect(prompt).toContain("Do not render any captions, labels, UI badges, callout boxes, arrows, or warning text inside the image.");
    expect(prompt).toContain("Do not render panel labels, captions, timestamps, arrows, or any text inside the image.");
    expect(prompt).toContain("Depict the immediate action as actively happening in-frame");
    expect(prompt).toContain("Accident-label salience rules (secondary, context-anchored):");
    expect(prompt).toContain("Target accident-type anchor: 끼임.");
    expect(prompt).toContain("=== CORE SIGNAL VISUALIZATION (MANDATORY) ===");
    expect(prompt).toContain("Hazard hotspot salience: isolate one primary danger hotspot using contrast, edge sharpness, and focal framing.");
    expect(prompt).toContain("The secondary accident label must not dominate or override the scene context.");
    expect(prompt).toContain("Context constraint: Keep the press moving section visible near frame center.");
    expect(prompt).toContain("Normalized accident type key: caughtIn");
  });

  it("injects recognized context constraints for manual crane identity", () => {
    const recognizedContext = createRecognizedContext();

    const prompt = buildScenarioImagePrompt({
      inputStr: "wood cutter inspection",
      scenario: createScenario({
        accidentType: "electric-shock accident",
        riskLocation: "cutting blade zone",
      }),
      hasReferenceImage: true,
      recognizedContext,
    });

    expect(prompt).toContain("Recognized equipment: manual crane");
    expect(prompt).toContain("Recognized hazard parts: chain, hook, lifting hook point");
    expect(prompt).toContain("Context constraint: chain block, chain, and lifting hook point should be clearly visible in one frame.");
    expect(prompt).toContain("Context constraint: avoid wide-angle distortion and keep equipment scale realistic.");
    expect(prompt).toContain("If the secondary accident label conflicts with recognized context, keep recognized context and reinterpret the label.");
    expect(prompt).toContain("For crane/hoist scenes, hook block and sling components should stay proportionate to worker torso/arms; avoid oversized rigging that dwarfs humans unnaturally.");
  });

  it("adds explicit debris and kickback directives when cutting hazard cues are present", () => {
    const recognizedContext = createRecognizedContext({
      canonicalEquipment: "wood cutter",
      operationContext: "wood cutter cutting operation",
      hazardParts: ["cutting blade", "chip ejection path", "workpiece feed point"],
      sceneConstraints: [],
    });

    const prompt = buildScenarioImagePrompt({
      inputStr: "wood cutter",
      scenario: createScenario({
        accidentType: "맞음 사고",
        riskLocation: "절단날과 자재 투입 구간",
        reason:
          "During cutting, metal chips and blade fragments are flying toward the worker and the workpiece is starting to kick back due to rotational force.",
      }),
      hasReferenceImage: false,
      recognizedContext,
    });

    expect(prompt).toContain("Critical hazard-event visibility rules:");
    expect(prompt).toContain("Render flying chips or blade fragments with visible trajectories originating from the cutting point.");
    expect(prompt).toContain("Show the workpiece sliding or kicking back from rotational force at the same moment.");
  });

  it("adds suspended-load constraint only for fall/suspended-load scenarios", () => {
    const prompt = buildScenarioImagePrompt({
      inputStr: "manual crane lifting work",
      scenario: createScenario({
        accidentType: "fall accident",
        riskLocation: "under suspended load",
        reason: "the load is slipping while hanging and may drop onto the worker path.",
      }),
      hasReferenceImage: false,
      recognizedContext: createRecognizedContext(),
    });

    expect(prompt).toContain(
      "For suspended-load/fall risks, keep load in air with unstable tilt or slipping signs, but not fully detached impact aftermath.",
    );
  });

  it("separates accident-type discriminator cues for same equipment context", () => {
    const recognizedContext = createRecognizedContext({
      canonicalEquipment: "gas cutting workstation",
      operationContext: "gas hose-connected cutting operation",
      hazardParts: ["gas hose connection", "torch nozzle", "spark source"],
      sceneConstraints: ["Keep gas hose connection and torch nozzle visible in one frame."],
    });

    const fireExplosionPrompt = buildScenarioImagePrompt({
      inputStr: "gas cutting workstation",
      scenario: createScenario({
        accidentType: "화재·폭발",
        riskLocation: "가스 공급 호스 및 연결구",
        reason: "누출 가스가 점화원과 만나 확산되고 있습니다.",
      }),
      hasReferenceImage: false,
      recognizedContext,
    });

    const burnPrompt = buildScenarioImagePrompt({
      inputStr: "gas cutting workstation",
      scenario: createScenario({
        accidentType: "화상",
        riskLocation: "가스 토치 노즐 및 절단 작업면",
        reason: "고온 비산물이 보호구 틈으로 접촉할 수 있습니다.",
      }),
      hasReferenceImage: false,
      recognizedContext,
    });

    expect(fireExplosionPrompt).toContain("=== ACCIDENT TYPE DISCRIMINATOR (MANDATORY) ===");
    expect(fireExplosionPrompt).toContain("Normalized accident type key: explosion");
    expect(fireExplosionPrompt).toContain(
      "MUST HAVE: pressurized/flammable source plus ignition trigger proximity.",
    );
    expect(fireExplosionPrompt).toContain(
      "MUST NOT HAVE: small localized flame-only scene without blast context.",
    );

    expect(burnPrompt).toContain("Normalized accident type key: burn");
    expect(burnPrompt).toContain(
      "MUST HAVE: hot surface/splash source with heat transfer direction.",
    );
    expect(burnPrompt).toContain(
      "MUST NOT HAVE: blast-pressure cues as dominant signature.",
    );
  });

  it("marks heuristic as ambiguous when only three of five cues exist", () => {
    const heuristic = evaluateHazardVisibilityHeuristic(
      createScenario({
        riskLocation: "절단점과 작업자 손 위치",
        reason: "파편 비산 궤적이 작업자 손 방향으로 진행되고 반발이 발생합니다.",
      }),
      createRecognizedContext({
        hazardParts: ["cutting blade", "worker position", "debris trajectory"],
      }),
    );

    expect(heuristic.decision).toBe("ambiguous");
    expect(heuristic.score).toBeGreaterThanOrEqual(3);
  });

  it("marks heuristic as soft_fail when critical cues are largely missing", () => {
    const heuristic = evaluateHazardVisibilityHeuristic(
      createScenario({
        riskLocation: "작업대 주변",
        reason: "작업 중 주의가 필요합니다.",
      }),
      createRecognizedContext({
        hazardParts: ["설비 주변"],
      }),
    );

    expect(heuristic.decision).toBe("soft_fail");
  });

  it("uses hybrid quality gate for ambiguous heuristic and accepts judge pass result", async () => {
    const judge = vi.fn().mockResolvedValue({
      qualityStatus: "pass",
      qualityReasons: ["4요소 모두 확인"],
      score: 4,
    });

    const result = await evaluateScenarioImageQuality({
      scenario: createScenario({
        riskLocation: "cutting point and worker hand position",
        reason: "worker hands move too close to the blade and debris trajectory moves toward worker.",
        immediateAction: "monitor the condition.",
      }),
      recognizedContext: createRecognizedContext({
        hazardParts: ["cutting blade", "worker hand position"],
      }),
      judgeImageQuality: judge,
    });

    expect(judge).toHaveBeenCalledTimes(1);
    expect(result.qualityStatus).toBe("pass");
  });

  it("prioritizes AI image judge even when heuristic would pass", async () => {
    const judge = vi.fn().mockResolvedValue({
      qualityStatus: "soft_fail",
      qualityReasons: ["post-incident 상태로 판정됨"],
      score: 4,
    });

    const result = await evaluateScenarioImageQuality({
      scenario: createScenario({
        riskLocation: "cutting blade and worker hand position",
        reason: "debris trajectory is moving toward worker and emergency stop action is delayed.",
        immediateAction: "press emergency stop button immediately.",
      }),
      recognizedContext: createRecognizedContext({
        hazardParts: ["cutting blade", "worker hand position", "debris trajectory", "emergency stop button"],
      }),
      judgeImageQuality: judge,
    });

    expect(judge).toHaveBeenCalledTimes(1);
    expect(result.qualityStatus).toBe("soft_fail");
  });

  it("forces soft_fail when any hard quality gate flag is false", async () => {
    const judge = vi.fn().mockResolvedValue({
      qualityStatus: "pass",
      qualityReasons: ["model judged pass"],
      score: 15,
      maxScore: 15,
      criterionFlags: {
        equipmentContextAligned: true,
        mechanismSalienceVisible: true,
        typeDiscriminatorVisible: true,
        hazardHotspotSalienceVisible: false,
        injuryBodyPartEmphasisVisible: true,
        trajectoryVectorVisible: true,
        immediateActionPointVisible: true,
      },
    });

    const result = await evaluateScenarioImageQuality({
      scenario: createScenario({
        accidentType: "협착 사고",
        riskLocation: "프레스 간극",
      }),
      recognizedContext: createRecognizedContext(),
      judgeImageQuality: judge,
    });

    expect(result.qualityStatus).toBe("soft_fail");
    expect(result.qualityReasons).toContain("Hard gate failed: hazard hotspot salience.");
  });

  it("returns soft_fail when hybrid judge evaluates ambiguous case as fail", async () => {
    const judge = vi.fn().mockResolvedValue({
      qualityStatus: "soft_fail",
      qualityReasons: ["비산 궤적이 명확하지 않음"],
      score: 1,
    });

    const result = await evaluateScenarioImageQuality({
      scenario: createScenario({
        riskLocation: "cutting point and worker hand position",
        reason: "worker hands move too close to the blade and debris trajectory moves toward worker.",
        immediateAction: "monitor the condition.",
      }),
      recognizedContext: createRecognizedContext({
        hazardParts: ["cutting blade", "worker hand position"],
      }),
      judgeImageQuality: judge,
    });

    expect(result.qualityStatus).toBe("soft_fail");
  });

  it("falls back to soft_fail when ambiguous case judge fails", async () => {
    const judge = vi.fn().mockRejectedValue(new Error("judge failed"));

    const result = await evaluateScenarioImageQuality({
      scenario: createScenario({
        riskLocation: "cutting point and worker hand position",
        reason: "worker hands move too close to the blade and debris trajectory moves toward worker.",
        immediateAction: "monitor the condition.",
      }),
      recognizedContext: createRecognizedContext({
        hazardParts: ["cutting blade", "worker hand position"],
      }),
      judgeImageQuality: judge,
    });

    expect(result.qualityStatus).toBe("soft_fail");
  });

  it("uses equipment/site context fallback when model response is not parseable", () => {
    const scenarios = parsePredictionScenarios("unparseable response", "wood cutter");

    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].accidentType.length).toBeGreaterThan(0);
    expect(scenarios[0].riskLocation.length).toBeGreaterThan(0);
    expect(scenarios[1].riskLocation.length).toBeGreaterThan(0);
  });

  it("keeps manual-crane fallback identity when response parsing fails", () => {
    const recognizedContext = createRecognizedContext();
    const scenarios = parsePredictionScenarios("unparseable response", "manual crane", recognizedContext);

    expect(scenarios).toHaveLength(3);
    expect(scenarios[0].riskLocation.length).toBeGreaterThan(0);
    expect(scenarios[1].riskLocation.length).toBeGreaterThan(0);
  });

  it("uses text-only part when reference image is absent", () => {
    const parts = buildImageGenerationParts("image prompt");
    expect(parts).toEqual([{ text: "image prompt" }]);
  });

  it("includes inlineData part when reference image is provided", () => {
    const referenceImagePart = {
      inlineData: {
        mimeType: "image/png",
        data: "base64-image",
      },
    };

    const parts = buildImageGenerationParts("image prompt", referenceImagePart);
    expect(parts).toEqual([{ text: "image prompt" }, referenceImagePart]);
  });

  it("retries up to three attempts and selects highest-quality soft-fail candidate", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(createInlineImageResponse("attempt-1"))
      .mockResolvedValueOnce(createInlineImageResponse("attempt-2"))
      .mockResolvedValueOnce(createInlineImageResponse("attempt-3"));
    vi.stubGlobal("fetch", fetchMock);

    const buildJudgeResponse = (flags: Record<string, boolean>, reasons: string[]) =>
      JSON.stringify({
        ...flags,
        qualityStatus: "soft_fail",
        reasons,
      });

    vi.mocked(generateGeminiTextWithFallback)
      .mockResolvedValueOnce(
        buildJudgeResponse(
          {
            hazardSourceVisible: true,
            workerExposurePathVisible: true,
            accidentDirectionVisible: true,
            immediateActionCueVisible: true,
            injuryBodyPartVisible: false,
            preIncidentMomentVisible: true,
            noReadableText: true,
            scaleConsistencyVisible: true,
            equipmentContextAligned: false,
            mechanismSalienceVisible: false,
            typeDiscriminatorVisible: false,
          },
          ["equipment context alignment missing", "type discriminator weak"],
        ),
      )
      .mockResolvedValueOnce(
        buildJudgeResponse(
          {
            hazardSourceVisible: true,
            workerExposurePathVisible: true,
            accidentDirectionVisible: true,
            immediateActionCueVisible: true,
            injuryBodyPartVisible: true,
            preIncidentMomentVisible: true,
            noReadableText: true,
            scaleConsistencyVisible: true,
            equipmentContextAligned: true,
            mechanismSalienceVisible: false,
            typeDiscriminatorVisible: false,
          },
          ["mechanism salience weak"],
        ),
      )
      .mockResolvedValueOnce(
        buildJudgeResponse(
          {
            hazardSourceVisible: true,
            workerExposurePathVisible: true,
            accidentDirectionVisible: true,
            immediateActionCueVisible: true,
            injuryBodyPartVisible: true,
            preIncidentMomentVisible: true,
            noReadableText: true,
            scaleConsistencyVisible: true,
            equipmentContextAligned: false,
            mechanismSalienceVisible: false,
            typeDiscriminatorVisible: false,
          },
          ["equipment context alignment missing", "mechanism salience weak", "type discriminator weak"],
        ),
      );

    const result = await predictionService.generateScenarioImage({
      machineContext: "manual crane",
      scenario: createScenario({
        accidentType: "화재·폭발",
        riskLocation: "가스 공급 호스 및 연결구",
        reason: "누출 가스가 점화원과 만나 확산될 수 있습니다.",
      }),
      recognizedContext: createRecognizedContext(),
    });

    const secondRequestBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body ?? "{}")) as {
      contents?: Array<{ parts?: Array<{ text?: string }> }>;
    };
    const secondPrompt = secondRequestBody.contents?.[0]?.parts?.[0]?.text ?? "";

    expect(secondPrompt).toContain("=== RETRY FOCUS HINTS (MANDATORY) ===");
    expect(secondPrompt).toContain(
      "Lock recognized equipment identity, hazard parts, and operation context as fixed anchors in one frame.",
    );
    expect(secondPrompt).toContain(
      "Strengthen mechanism visibility: source -> worker exposure -> imminent trajectory must be traceable at first glance.",
    );
    expect(secondPrompt).toContain(
      "Increase accident-type discriminator cues and remove conflicting visual signals from other accident types.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(generateGeminiTextWithFallback).toHaveBeenCalledTimes(3);
    expect(result).toBeDefined();
    expect(result?.qualityStatus).toBe("soft_fail");
    expect(result?.imageUrl).toContain("attempt-2");
  });

  it("parses camelCase extended quality flags and hard-gates a missing immediate action point", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(createInlineImageResponse("camel-1"))
      .mockResolvedValueOnce(createInlineImageResponse("camel-2"))
      .mockResolvedValueOnce(createInlineImageResponse("camel-3"));
    vi.stubGlobal("fetch", fetchMock);

    const buildCamelJudgeResponse = () =>
      JSON.stringify({
        hazardSourceVisible: true,
        workerExposurePathVisible: true,
        accidentDirectionVisible: true,
        immediateActionCueVisible: true,
        injuryBodyPartVisible: true,
        preIncidentMomentVisible: true,
        noReadableText: true,
        scaleConsistencyVisible: true,
        equipmentContextAligned: true,
        mechanismSalienceVisible: true,
        typeDiscriminatorVisible: true,
        hazardHotspotSalienceVisible: true,
        injuryBodyPartEmphasisVisible: true,
        trajectoryVectorVisible: true,
        immediateActionPointVisible: false,
        qualityStatus: "pass",
        reasons: ["immediate action point missing"],
      });

    vi.mocked(generateGeminiTextWithFallback)
      .mockResolvedValueOnce(buildCamelJudgeResponse())
      .mockResolvedValueOnce(buildCamelJudgeResponse())
      .mockResolvedValueOnce(buildCamelJudgeResponse());

    const result = await predictionService.generateScenarioImage({
      machineContext: "press",
      scenario: createScenario({
        accidentType: "협착 사고",
        riskLocation: "프레스 간극",
        reason: "작업자 손이 간극으로 접근하고 있습니다.",
      }),
      recognizedContext: createRecognizedContext({
        canonicalEquipment: "press",
        operationContext: "press operation",
        hazardParts: ["pinch gap", "worker hand position", "emergency stop button"],
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(generateGeminiTextWithFallback).toHaveBeenCalledTimes(3);
    expect(result?.qualityStatus).toBe("soft_fail");
  });

  it("parses snake_case extended quality flags and hard-gates a false trajectory vector", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(createInlineImageResponse("snake-case-1"))
      .mockResolvedValueOnce(createInlineImageResponse("snake-case-2"))
      .mockResolvedValueOnce(createInlineImageResponse("snake-case-3"));
    vi.stubGlobal("fetch", fetchMock);

    const buildSnakeCaseJudgeResponse = () =>
      JSON.stringify({
        hazard_source_visible: true,
        worker_exposure_path_visible: true,
        accident_direction_visible: true,
        immediate_action_cue_visible: true,
        injury_body_part_visible: true,
        pre_incident_moment_visible: true,
        no_readable_text: true,
        scale_consistency_visible: true,
        equipment_context_aligned: true,
        mechanism_salience_visible: true,
        type_discriminator_visible: true,
        hazard_hotspot_salience_visible: true,
        injury_body_part_emphasis_visible: true,
        trajectory_vector_visible: false,
        immediate_action_point_visible: true,
        qualityStatus: "pass",
        reasons: ["trajectory vector visibility missing"],
      });

    vi.mocked(generateGeminiTextWithFallback)
      .mockResolvedValueOnce(buildSnakeCaseJudgeResponse())
      .mockResolvedValueOnce(buildSnakeCaseJudgeResponse())
      .mockResolvedValueOnce(buildSnakeCaseJudgeResponse());

    const result = await predictionService.generateScenarioImage({
      machineContext: "press",
      scenario: createScenario({
        accidentType: "끼임 사고",
        riskLocation: "프레스 작동부",
        reason: "작업자 손이 가동부 간극으로 접근 중입니다.",
      }),
      recognizedContext: createRecognizedContext({
        canonicalEquipment: "press",
        operationContext: "press operation",
        hazardParts: ["pinch gap", "infeed roller", "worker hand position"],
      }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(generateGeminiTextWithFallback).toHaveBeenCalledTimes(3);
    expect(result?.qualityStatus).toBe("soft_fail");
  });
});



