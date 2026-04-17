import type { AssessmentData, ReportSection } from "@/types/assessment";

function toBullets(items: string[]) {
  if (!items.length) {
    return "데이터 없음";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

type CitationCategory = "case" | "fatality" | "law" | "guide" | "media";

const FATALITY_BADGES = new Set(["사고사망", "사망사고", "치명사고"]);
const PRE_WORK_STAGES = new Set(["immediate", "same_day", "pre_resume"]);
const LEGAL_CLAUSE_PATTERNS = [
  /다음\s*각\s*호/u,
  /사업주는/u,
  /제\d+\s*조/u,
  /별표/u,
  /각\s*호의\s*어느\s*하나/u,
  /해체\s*또는\s*변경/u,
  /비계\(飛階\)/u,
];
const LAW_ARTICLE_PATTERN = /제?\s*\d+\s*조(?:의?\s*\d+)?/u;
const LAW_ACTION_VERB_PATTERN = /(설치|점검|확인|착용|통제|차단|보호|격리|중지|기록|정비|유지|교육|보수|검사|정전|접지|절연|보강|교체|완료|준수|이행)/u;
const LAW_BOILERPLATE_PATTERN = /(다음\s*각\s*호|각\s*호의\s*어느\s*하나|사업주|근로자)/u;
const LAW_COMPLEX_CLAUSE_PATTERN = /(각\s*호|경우에는|할\s*것|닿도록|작업\s*또는\s*장소|설치하는\s*경우)/u;
const LAW_ACTION_FOCUS_PATTERNS: Array<{ pattern: RegExp; phrase: string }> = [
  { pattern: /울타리|출입/u, phrase: "작업 구역 울타리 설치와 출입 통제를" },
  { pattern: /고소작업대|리프트/u, phrase: "고소작업대·리프트 안전장치 상태를" },
  { pattern: /비상정지|조작스위치|비상구|비상경보|환기/u, phrase: "비상설비의 작동 상태를" },
  { pattern: /충전부|절연|전원|전기|누전|접지|도전성/u, phrase: "전기 설비의 절연·접지·전원 차단 상태를" },
  { pattern: /사다리/u, phrase: "사다리 사용 조건과 추락 방지 상태를" },
  { pattern: /안전난간|난간|방호|안전대|보호구|추락/u, phrase: "추락 방지 설비와 보호구 착용 상태를" },
  { pattern: /점검표|작업허가|허가/u, phrase: "안전점검표와 작업허가 조건을" },
  { pattern: /기록|교육/u, phrase: "조치 이행 결과 기록과 작업자 교육을" },
];

function normalizeText(value: string | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function uniqueNonEmpty(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = normalizeText(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizeArticleToken(value?: string) {
  return normalizeText(value).replace(/\s+/g, "");
}

function normalizeArticleLabel(value?: string) {
  const token = normalizeArticleToken(value);
  if (!token) {
    return "";
  }
  if (token.startsWith("제")) {
    return token;
  }
  if (/^\d+조(?:의\d+)?$/u.test(token)) {
    return `제${token}`;
  }
  const match = token.match(/(\d+조(?:의\d+)?)/u);
  if (match?.[1]) {
    return `제${match[1]}`;
  }
  return token;
}

function cleanLawName(value?: string) {
  const normalized = normalizeText(value)
    .replace(/\([^)]*\)$/u, "")
    .replace(/[,:;.\-–—\s]+$/u, "")
    .trim();
  if (!normalized) {
    return "";
  }
  return normalized.replace(LAW_ARTICLE_PATTERN, "").trim();
}

function cleanArticleTitle(value?: string) {
  const normalized = normalizeText(value)
    .replace(/^[\[(（]+/u, "")
    .replace(/[\])）]+$/u, "")
    .replace(/[,:;.\s]+$/u, "")
    .trim();
  if (!normalized || LAW_ARTICLE_PATTERN.test(normalized)) {
    return "";
  }
  return normalized;
}

function extractLawNameFromSource(source?: string) {
  const normalized = normalizeText(source);
  if (!normalized) {
    return "";
  }
  const match = normalized.match(LAW_ARTICLE_PATTERN);
  if (match?.index !== undefined) {
    return cleanLawName(normalized.slice(0, match.index));
  }
  return "";
}

function extractArticleNumberFromText(source?: string) {
  const normalized = normalizeText(source);
  if (!normalized) {
    return "";
  }
  const match = normalized.match(LAW_ARTICLE_PATTERN);
  return normalizeArticleLabel(match?.[0] ?? "");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractArticleTitleFromSource(articleNumber: string, source?: string) {
  const articleLabel = normalizeArticleLabel(articleNumber);
  const normalizedSource = normalizeText(source);
  if (!articleLabel || !normalizedSource) {
    return "";
  }

  const articleRegex = escapeRegex(articleLabel).replace(/\s+/g, "\\s*");
  const parenPattern = new RegExp(`${articleRegex}\\s*[\\(\\[]\\s*([^\\)\\]\\n]{2,80})\\s*[\\)\\]]`, "u");
  const parenMatch = normalizedSource.match(parenPattern);
  if (parenMatch?.[1]) {
    const cleaned = cleanArticleTitle(parenMatch[1]);
    if (cleaned) {
      return cleaned;
    }
  }

  const articlePattern = new RegExp(articleRegex, "u");
  const articleMatch = normalizedSource.match(articlePattern);
  if (!articleMatch) {
    return "";
  }

  const index = normalizedSource.indexOf(articleMatch[0]);
  if (index < 0) {
    return "";
  }

  const afterArticle = normalizeText(
    normalizedSource
      .slice(index + articleMatch[0].length)
      .replace(/^[\s:;,.()[\]'"`]+/u, ""),
  );
  if (!afterArticle) {
    return "";
  }

  return cleanArticleTitle(afterArticle.split(/[.;。!?\n]/u)[0] ?? "");
}

function normalizeActionSeed(value: string | undefined) {
  const normalized = normalizeText(value);
  if (!normalized) {
    return "";
  }

  return normalized
    .replace(/^[-•*>\d.)(\[\]]+\s*/u, "")
    .replace(/^->\s*/u, "")
    .replace(/^[①-⑳]\s*/u, "")
    .replace(/^[가-힣]{1,6}하라:\s*/u, "")
    .replace(/^[가-힣]{1,6}한다:\s*/u, "")
    .replace(/^[가-힣]{1,6}하세요:\s*/u, "")
    .replace(/\s*-\s*/g, " ")
    .trim();
}

function looksLikeLegalClause(text: string) {
  if (text.length > 120) {
    return true;
  }
  return LEGAL_CLAUSE_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeSentenceEnding(text: string) {
  return text
    .replace(/하십시오\.?$/u, "해야 합니다.")
    .replace(/하세요\.?$/u, "해야 합니다.")
    .replace(/하라\.?$/u, "해야 합니다.")
    .replace(/해서는 안 됩니다\.?$/u, "금지해야 합니다.")
    .replace(/하여야 합니다\.?$/u, "해야 합니다.")
    .replace(/해야 합니다\.해야 합니다\.?$/u, "해야 합니다.")
    .replace(/해야 한다\.?$/u, "해야 합니다.")
    .replace(/하여야 한다\.?$/u, "해야 합니다.")
    .replace(/할 것\.?$/u, "해야 합니다.")
    .replace(/한다\.?$/u, "합니다.")
    .replace(/합니다\.합니다\.?$/u, "합니다.")
    .replace(/[.!?]{2,}$/u, ".");
}

function endsAbruptly(text: string) {
  return /(또는|및|등|후|전|중|때|의|을|를|에|로|으로|조)$/u.test(text);
}

function toNaturalSentence(raw: string, mode: "checklist" | "improvement") {
  const seed = normalizeActionSeed(raw);
  if (!seed) {
    return "";
  }

  let sentence = normalizeSentenceEnding(seed);
  if (!/[.!?]$/u.test(sentence) || endsAbruptly(sentence)) {
    const suffix = mode === "checklist"
      ? " 관련 안전조치를 작업 전에 확인해야 합니다."
      : " 관련 개선조치를 실행해야 합니다.";
    if (looksLikeLegalClause(sentence) || endsAbruptly(sentence)) {
      sentence = `${sentence.replace(/[,:;]$/u, "")}${suffix}`;
    } else if (/(점검|확인|설치|정비|착용|통제|중지|승인|허가|보고|기록|준수|이행|정리|보강|개선|차단|격리)$/u.test(sentence)) {
      sentence = `${sentence}해야 합니다.`;
    } else {
      sentence = `${sentence.replace(/[,:;]$/u, "")}해야 합니다.`;
    }
  }

  return normalizeSentenceEnding(sentence).trim();
}

function polishActionItems(items: string[], mode: "checklist" | "improvement") {
  return uniqueNonEmpty(
    items
      .map((item) => toNaturalSentence(item, mode))
      .filter((item) => item.length > 0),
  );
}

function normalizeLawActionSource(text: string) {
  return normalizeText(text)
    .replace(/^\[(즉시|당일|재개 전|재개전|개선)\]\s*/u, "")
    .replace(/^[>\-]+\s*/u, "")
    .replace(/^[①-⑳]\s*/u, "")
    .replace(/^[가-힣]\s+/u, "")
    .replace(/(?:\(|（)\s*근거[^)）]*[)）]/gu, "")
    .replace(/제\d+\s*조(?:의\d+)?(?:\s*제\d+\s*항)?/gu, "")
    .replace(/다음\s*각\s*호(?:의\s*어느\s*하나)?(?:에\s*해당하는\s*것)?/gu, "")
    .replace(/각\s*호의\s*어느\s*하나/gu, "")
    .replace(/사업주(?:는|가)?/gu, "")
    .replace(/근로자(?:는|가)?/gu, "")
    .replace(/합니다\.\s*해야\s*합니다\./gu, "해야 합니다.")
    .replace(/해야\s*합니다\.\s*해야\s*합니다\./gu, "해야 합니다.")
    .replace(/\s+/g, " ")
    .trim();
}

function pickLawActionClause(text: string) {
  const clauses = text
    .split(/(?<=[.!?])\s+|(?<=다)\s+(?=[가-힣A-Za-z0-9])/u)
    .map((clause) => normalizeText(clause).replace(/^[,;:\-\s]+|[,;:\-\s]+$/gu, ""))
    .filter((clause) => clause.length > 0);

  const preferred = clauses.find((clause) =>
    LAW_ACTION_VERB_PATTERN.test(clause)
    && clause.length <= 96
    && !LAW_BOILERPLATE_PATTERN.test(clause)
    && !/관련\s*조치\s*이행\s*여부/u.test(clause)
  );
  if (preferred) {
    return preferred;
  }

  const verbClause = clauses.find((clause) => LAW_ACTION_VERB_PATTERN.test(clause));
  if (verbClause) {
    return verbClause;
  }

  return clauses[0] ?? text;
}

function inferLawActionFocus(text: string) {
  const normalized = normalizeText(text);
  for (const { pattern, phrase } of LAW_ACTION_FOCUS_PATTERNS) {
    if (pattern.test(normalized)) {
      return phrase;
    }
  }
  return "";
}

function fallbackLawActionSentence(stage: "immediate" | "same_day" | "pre_resume" | "improvement", source: string) {
  const focused = inferLawActionFocus(source);
  if (focused) {
    return `${focused} 확인하고 필요한 조치를 완료해야 합니다.`;
  }

  if (stage === "immediate") {
    return "즉시 위험요인을 통제하고 필수 안전조치를 이행해야 합니다.";
  }
  if (stage === "same_day") {
    return "당일 법령 조치 이행 여부를 점검하고 누락 항목을 보완해야 합니다.";
  }
  if (stage === "pre_resume") {
    return "작업 재개 전에 안전설비와 작업조건 충족 여부를 재확인해야 합니다.";
  }
  return "재발 방지를 위해 법령 기준의 개선조치를 수립하고 이행해야 합니다.";
}

function toReadableLawActionSentence(item: AssessmentData["lawActionItems"][number]) {
  const source = normalizeLawActionSource(item.actionText || item.legalRequirement || "");
  if (!source) {
    return fallbackLawActionSentence(item.stage, "");
  }

  const clause = pickLawActionClause(source);
  const polished = toNaturalSentence(clause, "improvement");
  const needsFallback = !polished
    || polished.length > 96
    || LAW_BOILERPLATE_PATTERN.test(polished)
    || LAW_COMPLEX_CLAUSE_PATTERN.test(clause)
    || /해야\s*합니다\.\s*해야\s*합니다\./u.test(polished)
    || endsAbruptly(polished);

  const sentence = needsFallback ? fallbackLawActionSentence(item.stage, source) : polished;
  return normalizeSentenceEnding(sentence)
    .replace(/합니다\.\s*해야\s*합니다\./gu, "해야 합니다.")
    .replace(/해야\s*합니다\.\s*해야\s*합니다\./gu, "해야 합니다.")
    .trim();
}

type LawBasisMeta = {
  lawName: string;
  articleTitle: string;
};

function buildLawBasisMetaByArticle(assessment: AssessmentData) {
  const byArticle = new Map<string, LawBasisMeta>();

  for (const evidence of assessment.evidenceItems) {
    if (evidence.type !== "law") {
      continue;
    }

    const articleLabel = normalizeArticleLabel(
      evidence.articleNumber
      || extractArticleNumberFromText(`${evidence.legalBasis ?? ""} ${evidence.title ?? ""} ${evidence.summaryArticle ?? ""}`),
    );
    if (!articleLabel) {
      continue;
    }

    const articleToken = normalizeArticleToken(articleLabel);
    const current = byArticle.get(articleToken);

    const lawName = cleanLawName(
      extractLawNameFromSource(evidence.legalBasis)
      || extractLawNameFromSource(evidence.title)
      || evidence.title,
    );
    const articleTitle = cleanArticleTitle(
      evidence.articleTitle
      || extractArticleTitleFromSource(articleLabel, evidence.title)
      || extractArticleTitleFromSource(articleLabel, evidence.summaryArticle)
      || extractArticleTitleFromSource(articleLabel, evidence.legalBasis)
      || extractArticleTitleFromSource(articleLabel, evidence.keyExcerpt)
      || extractArticleTitleFromSource(articleLabel, evidence.clausePreview),
    );

    byArticle.set(articleToken, {
      lawName: lawName || current?.lawName || "",
      articleTitle: articleTitle || current?.articleTitle || "",
    });
  }

  return byArticle;
}

function resolveLawBasisArticles(item: AssessmentData["lawActionItems"][number]) {
  const fromItem = uniqueNonEmpty(item.articleNumbers.map((articleNumber) => normalizeArticleLabel(articleNumber))).filter(Boolean);
  if (fromItem.length > 0) {
    return fromItem;
  }

  const inferred = normalizeArticleLabel(
    extractArticleNumberFromText(`${item.legalBasis ?? ""} ${item.lawName ?? ""} ${item.summaryArticle ?? ""}`),
  );
  if (inferred) {
    return [inferred];
  }

  return [];
}

function formatLawBasisEntries(
  item: AssessmentData["lawActionItems"][number],
  basisMetaByArticle: Map<string, LawBasisMeta>,
) {
  const articles = resolveLawBasisArticles(item);
  const baseLawName = cleanLawName(item.lawName || extractLawNameFromSource(item.legalBasis));
  const baseTitle = cleanArticleTitle(item.articleTitle);

  if (articles.length === 0) {
    const lawName = baseLawName || "관련 법령 확인 필요";
    return [`${lawName} 제○조(조문명 확인 필요)`];
  }

  return uniqueNonEmpty(
    articles.map((articleLabel) => {
      const meta = basisMetaByArticle.get(normalizeArticleToken(articleLabel));
      const lawName = cleanLawName(baseLawName || meta?.lawName) || "관련 법령 확인 필요";
      const articleTitle = cleanArticleTitle(
        baseTitle
        || extractArticleTitleFromSource(articleLabel, item.legalBasis)
        || extractArticleTitleFromSource(articleLabel, item.summaryArticle)
        || extractArticleTitleFromSource(articleLabel, item.clausePreview)
        || extractArticleTitleFromSource(articleLabel, item.keyExcerpt)
        || meta?.articleTitle,
      ) || "조문명 확인 필요";

      return `${lawName} ${articleLabel}(${articleTitle})`;
    }),
  );
}

function compactTaskContext(assessment: AssessmentData) {
  const value = normalizeText(assessment.taskName || assessment.taskDescription);
  if (!value) {
    return "현재";
  }
  return value.length > 42 ? `${value.slice(0, 42)}…` : value;
}

function sourceBadgeCategory(sourceBadge: string): CitationCategory | null {
  if (sourceBadge === "재해사례") {
    return "case";
  }
  if (FATALITY_BADGES.has(sourceBadge)) {
    return "fatality";
  }
  if (sourceBadge === "법령") {
    return "law";
  }
  if (sourceBadge === "Guide") {
    return "guide";
  }
  if (sourceBadge === "미디어") {
    return "media";
  }
  return null;
}

function mapEvidenceById(assessment: AssessmentData) {
  return new Map(
    assessment.evidenceItems.map((item) => [item.id, item]),
  );
}

function formatCitationTitleList(assessment: AssessmentData, category: CitationCategory) {
  const evidenceById = mapEvidenceById(assessment);
  const rows = assessment.citations.filter((citation) => sourceBadgeCategory(citation.sourceBadge) === category);
  if (!rows.length) {
    return "근거 수집 실패 또는 미선택";
  }

  return rows
    .map((row) => {
      const url = normalizeText(evidenceById.get(row.evidenceId)?.url);
      const suffix = url ? ` (${url})` : "";
      return `- ${row.title}${suffix}`;
    })
    .join("\n");
}

function formatKnowledgeCitationsWithAiSummary(assessment: AssessmentData, category: "law" | "guide") {
  const evidenceById = mapEvidenceById(assessment);
  const rows = assessment.citations.filter((citation) => sourceBadgeCategory(citation.sourceBadge) === category);
  if (!rows.length) {
    return "근거 수집 실패 또는 미선택";
  }

  return rows
    .map((row) => {
      const evidence = evidenceById.get(row.evidenceId);
      const url = normalizeText(evidence?.url);
      const aiSummary = row.aiSummary ?? evidence?.aiSummary;
      const lines = [`- ${row.title}${url ? ` (${url})` : ""}`];

      if (!aiSummary) {
        return lines.join("\n");
      }

      const incidentRelevance = normalizeText(aiSummary.incidentRelevance);
      const applicabilityReason = normalizeText(aiSummary.applicabilityReason);
      const practicalActions = uniqueNonEmpty(aiSummary.practicalActions ?? []);

      if (incidentRelevance) {
        lines.push(`  · 우리 회사 사고와의 관련성: ${incidentRelevance}`);
      }
      if (applicabilityReason) {
        lines.push(`  · 적용 이유: ${applicabilityReason}`);
      }

      lines.push("  · 실제 조치:");
      if (!practicalActions.length) {
        lines.push("    - 실행 조치 항목 없음");
      } else {
        lines.push(...practicalActions.map((action) => `    - ${action}`));
      }

      return lines.join("\n");
    })
    .join("\n");
}

function formatCaseAndFatalityCitations(assessment: AssessmentData, category: "case" | "fatality") {
  const evidenceById = mapEvidenceById(assessment);
  const rows = assessment.citations.filter((citation) => sourceBadgeCategory(citation.sourceBadge) === category);
  if (!rows.length) {
    return "근거 수집 실패 또는 미선택";
  }

  return rows
    .map((row) => {
      const evidence = evidenceById.get(row.evidenceId);
      const summaryFromEvidence = uniqueNonEmpty(evidence?.summaryBullets ?? []);
      const summary = summaryFromEvidence.length > 0
        ? summaryFromEvidence.join(" / ")
        : normalizeText(row.summary);

      const lines = [`- ${row.title}`];
      if (summary) {
        lines.push(`  · 요약: ${summary}`);
      }

      if (category === "fatality") {
        const incidentDate = normalizeText(evidence?.incidentDate);
        const place = normalizeText(evidence?.place);
        const casualtyScale = normalizeText(evidence?.casualtyScale);

        if (incidentDate) {
          lines.push(`  · 일시: ${incidentDate}`);
        }
        if (place) {
          lines.push(`  · 장소: ${place}`);
        }
        if (casualtyScale) {
          lines.push(`  · 인명피해: ${casualtyScale}`);
        }
      }

      const url = normalizeText(evidence?.url);
      if (url) {
        lines.push(`  · 원문: ${url}`);
      }
      return lines.join("\n");
    })
    .join("\n");
}

function formatSelectedMaterials(assessment: AssessmentData) {
  const selected = assessment.materials.filter((material) => assessment.selectedMaterials.includes(material.id));
  if (!selected.length) {
    return "선택된 자료 없음";
  }
  return selected.map((material) => `- [${material.type}] ${material.title} (${material.url})`).join("\n");
}

function formatCitationResourceLinks(assessment: AssessmentData) {
  const selected = assessment.materials.filter((material) => assessment.selectedMaterials.includes(material.id));
  if (!selected.length) {
    return "선택된 자료 없음";
  }
  return selected.map((material) => `- [${material.type}] ${material.title} (${material.url})`).join("\n");
}

function formatLawRemedialActions(assessment: AssessmentData) {
  if (!assessment.lawActionItems.length) {
    return "법령 기반 개선조치 없음";
  }

  const basisMetaByArticle = buildLawBasisMetaByArticle(assessment);

  return uniqueNonEmpty(
    assessment.lawActionItems
    .map((item) => {
      const stage = item.stage === "immediate"
        ? "즉시"
        : item.stage === "same_day"
        ? "당일"
        : item.stage === "pre_resume"
        ? "재개 전"
        : "개선";
      const action = toReadableLawActionSentence(item);
      const basisList = formatLawBasisEntries(item, basisMetaByArticle);
      const basis = basisList.join(", ");
      return `- [${stage}] ${action} (근거: ${basis})`;
    })
  ).join("\n");
}

export function buildDefaultImprovementActions(assessment: AssessmentData): string[] {
  const fromAnalysis = polishActionItems(
    assessment.analysis.improvements.map((improvement) => improvement.action),
    "improvement",
  );
  if (fromAnalysis.length > 0) {
    return fromAnalysis;
  }

  const fromLawImprovement = polishActionItems(
    assessment.lawActionItems
      .filter((item) => item.stage === "improvement")
      .filter((item) => !looksLikeLegalClause(item.actionText))
      .map((item) => item.actionText),
    "improvement",
  );
  if (fromLawImprovement.length > 0) {
    return fromLawImprovement;
  }

  const taskContext = compactTaskContext(assessment);
  const fromImmediateActions = polishActionItems(
    polishActionItems(
      assessment.analysis.immediateActions.map((action) => action.action),
      "checklist",
    ).map((item) =>
      item.replace(
        /해야 합니다\.$/u,
        " 조치의 이행 상태를 점검하고 재발방지 기준으로 문서화해야 합니다.",
      ),
    ),
    "improvement",
  );
  const fromHazards = polishActionItems(
    assessment.profile.hazards.map(
      (hazard) => `${taskContext} 작업의 ${hazard.name} 위험요인 재발방지 대책을 수립하고 작업자에게 공유합니다.`,
    ),
    "improvement",
  );

  const fallback = uniqueNonEmpty([...fromImmediateActions, ...fromHazards]);
  if (fallback.length > 0) {
    return fallback.slice(0, 8);
  }

  return ["작업 특성에 맞는 재발방지 대책을 수립하고 이행 여부를 점검한다."];
}

export function buildDefaultChecklistItems(assessment: AssessmentData): string[] {
  const fromImmediate = polishActionItems(
    assessment.analysis.immediateActions.map((action) => action.action),
    "checklist",
  );
  const fromLawActions = uniqueNonEmpty(
    assessment.lawActionItems
      .filter((item) => PRE_WORK_STAGES.has(item.stage))
      .map((item) => normalizeActionSeed(item.actionText))
      .filter((item) => item.length > 0 && !looksLikeLegalClause(item)),
  );

  const polishedLawActions = polishActionItems(fromLawActions, "checklist");
  const merged = uniqueNonEmpty([...fromImmediate, ...polishedLawActions]).slice(0, 10);
  if (merged.length > 0) {
    return merged;
  }

  const taskContext = compactTaskContext(assessment);
  const hazardFallback = polishActionItems(
    assessment.profile.hazards.map(
      (hazard) => `${taskContext} 작업 전 ${hazard.name} 위험요인 방지 조치와 보호구 착용 상태를 확인합니다.`,
    ),
    "checklist",
  ).slice(0, 10);

  if (hazardFallback.length > 0) {
    return hazardFallback;
  }

  return ["작업 시작 전 위험요인과 보호구 착용 상태를 확인한다."];
}

function resolveChecklistItems(assessment: AssessmentData) {
  const fromAssessment = polishActionItems(assessment.checklistItems, "checklist").slice(0, 10);
  if (fromAssessment.length > 0) {
    return fromAssessment;
  }

  return buildDefaultChecklistItems(assessment);
}

export function buildReportSectionsFromAssessment(assessment: AssessmentData): ReportSection[] {
  const improvementActions = buildDefaultImprovementActions(assessment);
  const checklistItems = resolveChecklistItems(assessment);

  return [
    {
      id: "header",
      title: "문서 헤더",
      content: `RISK-GUARD 위험성평가 보고서\n작성일: ${new Date().toISOString().slice(0, 10)}`,
      editable: false,
      order: 1,
    },
    {
      id: "overview",
      title: "작업 개요",
      content: assessment.taskDescription || "작업 설명 미입력",
      editable: true,
      order: 2,
    },
    {
      id: "profile",
      title: "작업 프로필",
      content: `업종: ${assessment.profile.industry}\n작업장소: ${assessment.profile.workLocation}\n장비: ${assessment.profile.equipment.join(", ") || "없음"}`,
      editable: true,
      order: 3,
    },
    {
      id: "hazards",
      title: "주요 위험요인",
      content: toBullets(assessment.profile.hazards.map((hazard) => `${hazard.name} (가중치 ${hazard.weight})`)),
      editable: true,
      order: 4,
    },
    {
      id: "risk-level",
      title: "위험등급 및 즉시 조치",
      content: `위험등급: ${assessment.analysis.level.toUpperCase()} (${assessment.analysis.score}점)\n\n${toBullets(assessment.analysis.immediateActions.map((action) => action.action))}`,
      editable: true,
      order: 5,
    },
    {
      id: "disaster-cases",
      title: "유사 재해사례 요약",
      content: formatCaseAndFatalityCitations(assessment, "case"),
      editable: true,
      order: 6,
    },
    {
      id: "fatality-warning",
      title: "사망사고 기반 경고",
      content: formatCaseAndFatalityCitations(assessment, "fatality"),
      editable: true,
      order: 7,
    },
    {
      id: "law-guide",
      title: "법령 및 KOSHA Guide 근거",
      content: [
        "[법령 인용]",
        formatKnowledgeCitationsWithAiSummary(assessment, "law"),
        "",
        "[KOSHA Guide 인용]",
        formatKnowledgeCitationsWithAiSummary(assessment, "guide"),
        "",
        "[미디어 인용]",
        formatCitationTitleList(assessment, "media"),
        "",
        "[교육자료 링크]",
        formatCitationResourceLinks(assessment),
      ].join("\n").trim(),
      editable: true,
      order: 8,
    },
    {
      id: "law-remedial-actions",
      title: "법령 기반 개선조치",
      content: formatLawRemedialActions(assessment),
      editable: true,
      order: 9,
    },
    {
      id: "improvements",
      title: "권장 개선조치",
      content: toBullets(improvementActions),
      editable: true,
      order: 10,
    },
    {
      id: "checklist",
      title: "작업 전 체크리스트",
      content: toBullets(checklistItems),
      editable: false,
      order: 11,
    },
    {
      id: "materials",
      title: "추천 교육자료",
      content: formatSelectedMaterials(assessment),
      editable: true,
      order: 12,
    },
    {
      id: "briefing",
      title: "작업 전 안전 브리핑 문안",
      content: assessment.briefingText || "브리핑 문안 없음",
      editable: true,
      order: 13,
    },
  ];
}

export function buildReportPlainText(assessment: AssessmentData) {
  const sections = assessment.reportSections.slice().sort((left, right) => left.order - right.order);
  const checklistItems = resolveChecklistItems(assessment);
  const body = sections.map((section) => `## ${section.title}\n\n${section.content}`).join("\n\n");
  return `${body}\n\n## 작업 전 체크리스트\n\n${checklistItems.map((item, index) => `${index + 1}. ${item}`).join("\n")}\n\n## 작업 전 안전 브리핑 문안\n\n${assessment.briefingText}`;
}
