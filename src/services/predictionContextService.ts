import { fetchKoshaMachines, KoshaMachineData } from "@/data/KOSHADataset";
import { generateGeminiTextWithFallback } from "@/services/geminiTextModelFallback";

export interface RecognitionInlineDataPart {
  inlineData: {
    data: string;
    mimeType: string;
  };
}

export type RecognitionConfidence = "high" | "medium" | "low";

export interface CatalogEvidenceItem {
  id: string;
  machineNameKorean: string;
  machineNameEnglish: string;
  description: string;
  score: number;
}

export interface PredictionRecognizedContext {
  canonicalEquipment: string;
  operationContext: string;
  hazardParts: string[];
  sceneConstraints: string[];
  confidence: RecognitionConfidence;
  catalogEvidence: {
    primary: CatalogEvidenceItem | null;
    alternatives: CatalogEvidenceItem[];
  };
}

interface RecognizePredictionContextInput {
  inputText: string;
  apiKey: string;
  configuredModel?: string;
  hasReferenceImage: boolean;
  imagePart?: RecognitionInlineDataPart;
}

interface RankedMachineCandidate extends KoshaMachineData {
  score: number;
  matchReasons: string[];
}

let machineCatalogPromise: Promise<KoshaMachineData[]> | null = null;

function getMachineCatalog(): Promise<KoshaMachineData[]> {
  if (!machineCatalogPromise) {
    machineCatalogPromise = fetchKoshaMachines();
  }
  return machineCatalogPromise;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeForMatch(value: string): string {
  return normalizeWhitespace(value).toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

function tokenize(value: string): string[] {
  const tokens = normalizeWhitespace(value)
    .toLowerCase()
    .split(/[\s,./·()\-_/]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
  return [...new Set(tokens)];
}

function truncateText(value: string, maxLength = 160): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function buildRuleMatchScore(machine: KoshaMachineData, query: string): RankedMachineCandidate {
  const normalizedQuery = normalizeForMatch(query);
  const queryTokens = tokenize(query);
  const nameKorean = normalizeForMatch(machine.machineNameKorean);
  const nameEnglish = normalizeForMatch(machine.machineNameEnglish);
  const description = normalizeForMatch(machine.description);
  const categories = normalizeForMatch(`${machine.mainCategory} ${machine.subCategory} ${machine.minorCategory}`);

  let score = 0;
  const matchReasons: string[] = [];

  if (normalizedQuery && nameKorean === normalizedQuery) {
    score += 260;
    matchReasons.push("기계설비명 정확일치");
  }

  if (normalizedQuery && nameKorean.includes(normalizedQuery)) {
    score += 160;
    matchReasons.push("기계설비명 포함일치");
  }

  if (normalizedQuery && normalizedQuery.includes(nameKorean) && nameKorean.length >= 3) {
    score += 110;
    matchReasons.push("입력문장 내 기계설비명 포함");
  }

  if (normalizedQuery && nameEnglish.includes(normalizedQuery)) {
    score += 70;
    matchReasons.push("영문명 매칭");
  }

  for (const token of queryTokens) {
    const normalizedToken = normalizeForMatch(token);
    if (!normalizedToken) {
      continue;
    }
    if (nameKorean.includes(normalizedToken)) {
      score += 28;
      matchReasons.push(`기계명 토큰(${token})`);
    }
    if (nameEnglish.includes(normalizedToken)) {
      score += 14;
      matchReasons.push(`영문 토큰(${token})`);
    }
    if (description.includes(normalizedToken)) {
      score += 12;
      matchReasons.push(`설명 토큰(${token})`);
    }
    if (categories.includes(normalizedToken)) {
      score += 8;
      matchReasons.push(`업종 토큰(${token})`);
    }
  }

  if (normalizedQuery.includes("수동크레인") && normalizeForMatch(machine.machineNameKorean).includes("수동크레인")) {
    score += 320;
    matchReasons.push("수동크레인 직접 매칭");
  }

  return {
    ...machine,
    score,
    matchReasons,
  };
}

function rankMachineCandidates(query: string, machines: KoshaMachineData[]): RankedMachineCandidate[] {
  if (!normalizeWhitespace(query)) {
    return [];
  }

  return machines
    .map((machine) => buildRuleMatchScore(machine, query))
    .filter((machine) => machine.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
}

function toConfidence(score: number): RecognitionConfidence {
  if (score >= 240) {
    return "high";
  }
  if (score >= 120) {
    return "medium";
  }
  return "low";
}

function inferOperationContext(inputText: string, candidate: KoshaMachineData | null): string {
  const normalizedInput = normalizeWhitespace(inputText);
  const description = normalizeWhitespace(candidate?.description ?? "");
  const machineName = normalizeWhitespace(candidate?.machineNameKorean ?? "") || normalizedInput || "기계설비";

  if (/(인양|권상|운반|하역|양중)/.test(description)) {
    return `${machineName} 중량물 인양/운반 작업`;
  }
  if (/(절단|절삭|재단|톱|가공)/.test(description)) {
    return `${machineName} 절단/가공 작업`;
  }
  if (/(배선|전기|접지|차단기|패널)/.test(description)) {
    return `${machineName} 전기 설비 점검/조작 작업`;
  }
  if (normalizedInput && /(점검|정비|교체|조작)/.test(normalizedInput)) {
    return `${machineName} ${normalizedInput}`;
  }

  return `${machineName} 취급 작업`;
}

function inferHazardParts(inputText: string, candidate: KoshaMachineData | null): string[] {
  const combined = normalizeWhitespace(
    `${inputText} ${candidate?.machineNameKorean ?? ""} ${candidate?.machineNameEnglish ?? ""} ${candidate?.description ?? ""}`,
  ).toLowerCase();

  if (/(수동크레인|manual crane|체인블록|chain block|체인 호이스트|hoist|크레인|인양|권상)/.test(combined)) {
    return ["체인", "훅", "풀리", "인양 하중 접점"];
  }
  if (/(재단기|절단기|톱|절단|절삭|saw|cutter)/.test(combined)) {
    return ["절단날", "재료 투입구", "회전 가동부", "가드 경계"];
  }
  if (/(배전반|분전반|패널|배선|차단기|switch|cable|전기)/.test(combined)) {
    return ["노출 배선", "스위치/차단기 단자", "충전부 접촉점", "젖은 바닥 구간"];
  }
  if (/(컨베이어|롤러|벨트|프레스|금형)/.test(combined)) {
    return ["인입 롤러", "가동부 틈", "금형 하강부", "비상정지 접근 구간"];
  }

  return ["가동부 접촉점", "작업자 손 위치", "작업자 발 위치"];
}

function inferSceneConstraints(equipment: string, hazardParts: string[]): string[] {
  const constraints = [
    "장비 종류와 구조를 입력 맥락에 맞게 유지하고 무관한 장비로 전환하지 않는다.",
    "위험부위와 작업자 행동이 같은 프레임에서 인과관계로 보이게 구성한다.",
    "사고유형은 보조 라벨로만 반영하고 장면 구성 우선순위를 바꾸지 않는다.",
  ];

  const combinedContext = `${equipment} ${hazardParts.join(" ")}`.toLowerCase();

  if (/(수동크레인|manual crane|체인블록|chain block|호이스트|크레인)/.test(combinedContext)) {
    constraints.push("체인블록 본체, 체인, 훅, 인양 하중 접점을 같은 프레임에 명확히 표시한다.");
    constraints.push("원경 샷을 금지하고 장비가 너무 작게 보이지 않도록 근/중거리 구도로 구성한다.");
    constraints.push("장비 본체와 핵심 위험부위가 프레임의 주요 영역을 차지하게 유지한다.");
    constraints.push("체인 장력 방향과 하중 흔들림 경로가 즉시 위험 신호로 보이도록 구성한다.");
  }

  if (/(cut|cutter|saw|blade|chip|fragment|kickback|절단|재단|톱|파편|비산|튕|반발)/.test(combinedContext)) {
    constraints.push("절단점에서 파편이나 칩이 비산하는 궤적과 작업자 노출 경로를 같은 프레임에 보여준다.");
    constraints.push("회전력으로 부재가 밀리거나 튕겨 나가려는 순간(킥백)을 가시적으로 표현한다.");
  }

  if (hazardParts.includes("절단날")) {
    constraints.push("절단날과 손 접근 거리가 동시에 보이도록 구성하고 가드 경계선을 명확히 드러낸다.");
  }

  return [...new Set(constraints)].slice(0, 8);
}

function toCatalogEvidenceItem(candidate: RankedMachineCandidate): CatalogEvidenceItem {
  return {
    id: candidate.id,
    machineNameKorean: normalizeWhitespace(candidate.machineNameKorean),
    machineNameEnglish: normalizeWhitespace(candidate.machineNameEnglish),
    description: truncateText(candidate.description, 220),
    score: Math.round(candidate.score),
  };
}

function buildRuleBasedContext(inputText: string, ranked: RankedMachineCandidate[]): PredictionRecognizedContext {
  const primary = ranked[0] ?? null;
  const canonicalEquipment = normalizeWhitespace(primary?.machineNameKorean ?? inputText ?? "") || "기계설비 미상";
  const operationContext = inferOperationContext(inputText, primary);
  const hazardParts = inferHazardParts(inputText, primary).slice(0, 5);
  const sceneConstraints = inferSceneConstraints(canonicalEquipment, hazardParts);
  const confidence = toConfidence(primary?.score ?? 0);

  return {
    canonicalEquipment,
    operationContext,
    hazardParts,
    sceneConstraints,
    confidence,
    catalogEvidence: {
      primary: primary ? toCatalogEvidenceItem(primary) : null,
      alternatives: ranked.slice(1, 4).map(toCatalogEvidenceItem),
    },
  };
}

function stripCodeFence(rawText: string): string {
  return rawText
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
}

function findJsonSlice(text: string): string | null {
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1);
  }
  return null;
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function normalizeConfidence(value: unknown, fallback: RecognitionConfidence): RecognitionConfidence {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }
  return fallback;
}

function readArrayStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === "string" ? normalizeWhitespace(item) : ""))
    .filter(Boolean)
    .slice(0, 6);
}

function parseGeminiContext(rawText: string, fallback: PredictionRecognizedContext): PredictionRecognizedContext {
  const cleaned = stripCodeFence(rawText);
  const directParsed = safeJsonParse<Record<string, unknown>>(cleaned);
  const sliced = directParsed ? null : findJsonSlice(cleaned);
  const parsed = directParsed ?? (sliced ? safeJsonParse<Record<string, unknown>>(sliced) : null);

  if (!parsed) {
    return fallback;
  }

  const canonicalEquipment = normalizeWhitespace(String(parsed.canonicalEquipment ?? "")) || fallback.canonicalEquipment;
  const operationContext = normalizeWhitespace(String(parsed.operationContext ?? "")) || fallback.operationContext;
  const hazardParts = readArrayStrings(parsed.hazardParts);
  const sceneConstraints = readArrayStrings(parsed.sceneConstraints);
  const confidence = normalizeConfidence(parsed.confidence, fallback.confidence);

  return {
    canonicalEquipment,
    operationContext,
    hazardParts: hazardParts.length > 0 ? hazardParts : fallback.hazardParts,
    sceneConstraints: sceneConstraints.length > 0 ? sceneConstraints : fallback.sceneConstraints,
    confidence,
    catalogEvidence: fallback.catalogEvidence,
  };
}

function buildRecognitionPrompt(
  inputText: string,
  rankedCandidates: RankedMachineCandidate[],
  fallback: PredictionRecognizedContext,
  hasReferenceImage: boolean,
): string {
  const candidateLines = rankedCandidates.length > 0
    ? rankedCandidates
      .map((candidate, index) =>
        `${index + 1}. [${candidate.id}] ${candidate.machineNameKorean} (${candidate.machineNameEnglish}) | 설명: ${
          truncateText(candidate.description, 120)
        } | 점수:${Math.round(candidate.score)}`
      )
      .join("\n")
    : "- 후보 없음";

  return [
    "당신은 산업안전보건 장비 인식 전문가다.",
    "아래 입력과 KOSHA 기계설비 후보를 기반으로 장비/작업맥락/위험부위를 구조화한다.",
    "출력은 반드시 JSON 하나만 반환한다. 코드블록/설명 문장 금지.",
    "",
    "[입력]",
    `- 사용자 입력: ${normalizeWhitespace(inputText) || "정보 없음"}`,
    `- 참조 이미지: ${hasReferenceImage ? "있음" : "없음"}`,
    "",
    "[KOSHA 후보 Top-K]",
    candidateLines,
    "",
    "[규칙 기반 초안]",
    JSON.stringify(
      {
        canonicalEquipment: fallback.canonicalEquipment,
        operationContext: fallback.operationContext,
        hazardParts: fallback.hazardParts,
        sceneConstraints: fallback.sceneConstraints,
        confidence: fallback.confidence,
      },
      null,
      2,
    ),
    "",
    "[출력 규칙]",
    "1) canonicalEquipment는 가능한 한 후보 목록의 기계설비명 중 하나를 선택한다.",
    "2) operationContext는 작업 상황을 1문장으로 작성한다.",
    "3) hazardParts는 핵심 위험부위 3~5개를 작성한다.",
    "4) sceneConstraints는 이미지 생성용 제약 3~6개를 작성한다.",
    "5) 사고유형 중심이 아닌 장비/위험부위 중심으로 작성한다.",
    "6) confidence는 high|medium|low 중 하나다.",
    "",
    "[반환 형식]",
    "{",
    '  "canonicalEquipment": "",',
    '  "operationContext": "",',
    '  "hazardParts": ["", ""],',
    '  "sceneConstraints": ["", ""],',
    '  "confidence": "high|medium|low"',
    "}",
  ].join("\n");
}

function resolvePrimaryCandidate(
  canonicalEquipment: string,
  rankedCandidates: RankedMachineCandidate[],
): RankedMachineCandidate | null {
  const normalizedCanonical = normalizeForMatch(canonicalEquipment);
  if (!normalizedCanonical) {
    return rankedCandidates[0] ?? null;
  }

  return rankedCandidates.find((candidate) => {
    const normalizedCandidate = normalizeForMatch(candidate.machineNameKorean);
    return normalizedCandidate === normalizedCanonical
      || normalizedCandidate.includes(normalizedCanonical)
      || normalizedCanonical.includes(normalizedCandidate);
  }) ?? rankedCandidates[0] ?? null;
}

export async function recognizePredictionContext({
  inputText,
  apiKey,
  configuredModel,
  hasReferenceImage,
  imagePart,
}: RecognizePredictionContextInput): Promise<PredictionRecognizedContext> {
  const machines = await getMachineCatalog();
  const rankedCandidates = rankMachineCandidates(inputText, machines);
  const ruleBasedContext = buildRuleBasedContext(inputText, rankedCandidates);

  const recognitionPrompt = buildRecognitionPrompt(inputText, rankedCandidates, ruleBasedContext, hasReferenceImage);
  const promptWithImage = hasReferenceImage && imagePart
    ? [recognitionPrompt, imagePart]
    : recognitionPrompt;

  let recognizedContext = ruleBasedContext;

  try {
    const rawResponse = await generateGeminiTextWithFallback({
      apiKey,
      configuredModel,
      prompt: promptWithImage,
      context: "predictionContextService",
    });
    recognizedContext = parseGeminiContext(rawResponse, ruleBasedContext);
  } catch (error: unknown) {
    console.warn("[predictionContextService] Gemini context recognition failed. Using rule-based fallback.", error);
  }

  const resolvedPrimary = resolvePrimaryCandidate(recognizedContext.canonicalEquipment, rankedCandidates);
  const alternatives = rankedCandidates
    .filter((candidate) => candidate.id !== resolvedPrimary?.id)
    .slice(0, 3)
    .map(toCatalogEvidenceItem);

  const confidence = resolvedPrimary
    ? normalizeConfidence(recognizedContext.confidence, toConfidence(resolvedPrimary.score))
    : recognizedContext.confidence;

  return {
    ...recognizedContext,
    confidence,
    catalogEvidence: {
      primary: resolvedPrimary ? toCatalogEvidenceItem(resolvedPrimary) : null,
      alternatives,
    },
  };
}
