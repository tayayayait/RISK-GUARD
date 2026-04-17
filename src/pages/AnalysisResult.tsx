import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useAssessment } from "@/contexts/AssessmentContext";
import { buildStandardsRulesPdfUrl } from "@/lib/lawOriginalText";
import type { EvidenceItem, LawActionItem, LawActionStage, LawFitStatus } from "@/types/assessment";
import { HAZARD_ARTICLE_MAP } from "../../supabase/functions/_shared/hazard-article-map.ts";

type TimelineSection = "immediate" | "same_day" | "pre_resume";

type ActionCardData = {
  id: string;
  stage: LawActionStage;
  lawName: string;
  articleNumber: string;
  articleTitle?: string;
  articleLabel: string;
  articleLookupNumber?: string;
  originalUrl: string;
  legalRequirement: string;
  actionText: string;
  reason: string;
  lawFitStatus?: LawFitStatus;
  lawFitReason?: string;
  lawFitScore?: number;
  applicabilityReason?: string;
  keyExcerpt?: string;
  summaryArticle?: string;
  clausePreview?: string;
  generationType?: "direct" | "derived";
  duplicateSuspected?: boolean;
  manualReviewRequired?: boolean;
  selectionMode?: "direct" | "derived" | "reused";
  selectionReason?: string;
  crossStageDedupKey: string;
  lawArticleKey: string;
};

type SelectedLawContext = {
  actionId?: string;
  articleNumber?: string;
  articleTitle?: string;
  articleLookupNumber?: string;
  lawName?: string;
};

function sourceStatusMessage(status: string) {
  if (status === "loading") return "로딩 중";
  if (status === "partial") return "일부 실패";
  if (status === "error") return "조회 실패";
  if (status === "empty") return "결과 없음";
  if (status === "success") return "완료";
  return "대기";
}

type ActionReferenceRowData = {
  id: string;
  type: "reference";
  message: string;
};

type SectionRowData = ActionCardData | ActionReferenceRowData;

const ARTICLE_PATTERN = /제?\s*\d+\s*조(?:의?\s*\d+)?/;
const LEGAL_REQUIREMENT_MAX_LENGTH = 120;
const ACTION_TEXT_MAX_LENGTH = 180;
const REASON_MAX_LENGTH = 180;
const AWKWARD_ENDING_PATTERN = /(및|등|여부|또는|으로|하여|하고|같은|수 있는|등의|등을|등으로|위한|중|전|후|시|확인|점검|이행|실행|유지|설치|통제|관리|이하|것은|것을|것의|만들 것|있는|하는|되는|따른|관한|이상|경우|따라|대하여|대해)$/;
const ACTION_FRAGMENT_ENDING_PATTERN = /(해야|하여야|말해야|위하여|조|것은|것을|것의|이하|경우|따라|대하여|대해)$/;
const PANEL_FRAGMENT_ENDING_PATTERN = /(작업\s*지속|작업할|위험이\s*있는\s*장소|동시\s*확인\s*전\s*장비\s*운전\s*및\s*동일\s*작업\s*지속|및|등|여부|또는|으로|하여|하고|같은|수 있는|위한|중|전|후|시|확인|점검|유지|통제|이하|것은|것을|것의|있는|하는|되는|따른|관한|이상|경우|따라|대하여|대해)$/;
const COMPLETE_SENTENCE_ENDING_PATTERN = /(합니다|됩니다|입니다|해야 합니다|하여야 합니다|해야 한다|하여야 한다|말아야 합니다|말아야 한다|안 됩니다|없습니다|필요합니다|요구합니다|권고합니다|금지합니다|금지됩니다|가능합니다|곤란합니다|하십시오|하세요|한다|된다|이다)$/;
const CONNECTIVE_ENDING_PATTERN = /(으로|하여|하고|같은|수 있는|위한|중|전|후|시|위해)$/;
const NOUN_LIKE_ENDING_PATTERN = /(확인|점검|설치|유지|준수|관리|보완|개선|차단|통제|중단|정지|제거|기록|보고|교육|훈련|승인|이행|실행|완료|재개|가동|착용|격리)$/;
const PANEL_DEDUP_STOPWORDS = new Set([
  "단계",
  "기준",
  "작업",
  "조치",
  "확인",
  "요약",
  "현장",
  "위험",
  "사고",
  "조문",
  "법령",
  "적용",
  "핵심",
  "의미",
  "배경",
]);

const SECTION_META: Record<LawActionStage, { title: string; subtitle: string }> = {
  immediate: {
    title: "즉시 조치",
    subtitle: "즉시 실행해야 할 안전 조치",
  },
  same_day: {
    title: "당일 조치",
    subtitle: "당일 내 완료해야 할 조치",
  },
  pre_resume: {
    title: "작업 재개 전 확인",
    subtitle: "작업 재개 전 필수 확인 조치",
  },
  improvement: {
    title: "재발 방지 조치",
    subtitle: "구조적 개선 및 재발 방지",
  },
};

const CARD_STAGE_META: Record<LawActionStage, {
  actionLabel: string;
  requirementLabel: string;
  reasonLabel: string;
  panelClassName: string;
}> = {
  immediate: {
    actionLabel: "즉시 실행",
    requirementLabel: "즉시 차단 기준",
    reasonLabel: "지금 해야 하는 이유",
    panelClassName: "border-accent-200 bg-accent-050",
  },
  same_day: {
    actionLabel: "당일 완료",
    requirementLabel: "당일 점검 기준",
    reasonLabel: "당일 완료가 필요한 이유",
    panelClassName: "border-warning-200 bg-warning-050",
  },
  pre_resume: {
    actionLabel: "재개 전 확인",
    requirementLabel: "재개 허용 조건",
    reasonLabel: "작업 재개 전 반드시 확인할 사항",
    panelClassName: "border-primary-200 bg-primary-050",
  },
  improvement: {
    actionLabel: "재발 방지 실행",
    requirementLabel: "개선 이행 기준",
    reasonLabel: "재발 방지를 위해 필요한 이유",
    panelClassName: "border-success-200 bg-success-050",
  },
};

const ARTICLE_TITLE_FALLBACKS = new Map<string, string>();
for (const entries of Object.values(HAZARD_ARTICLE_MAP)) {
  for (const entry of entries) {
    ARTICLE_TITLE_FALLBACKS.set((entry.article ?? "").replace(/\s+/g, ""), (entry.title ?? "").trim());
  }
}

function normalizeForDedup(text?: string) {
  return (text ?? "").replace(/\s+/g, "").toLowerCase();
}

function normalizeForSimilarity(text?: string) {
  return normalizeSpace(text)
    .toLowerCase()
    .replace(ARTICLE_PATTERN, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeForSimilarity(text?: string) {
  return normalizeForSimilarity(text)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !PANEL_DEDUP_STOPWORDS.has(token));
}

function tokenSimilarity(left: string[], right: string[]) {
  if (!left.length || !right.length) {
    return 0;
  }
  const rightSet = new Set(right);
  const intersection = left.filter((token) => rightSet.has(token)).length;
  const union = new Set([...left, ...right]).size;
  if (!union) {
    return 0;
  }
  return intersection / union;
}

function isNearDuplicatePanelText(left?: string, right?: string) {
  const leftNormalized = normalizeForDedup(stripTerminalPunctuation(left ?? ""));
  const rightNormalized = normalizeForDedup(stripTerminalPunctuation(right ?? ""));
  if (!leftNormalized || !rightNormalized) {
    return false;
  }

  if (
    leftNormalized === rightNormalized
    || leftNormalized.includes(rightNormalized)
    || rightNormalized.includes(leftNormalized)
  ) {
    return true;
  }

  const leftTokens = tokenizeForSimilarity(left);
  const rightTokens = tokenizeForSimilarity(right);
  if (leftTokens.length < 3 || rightTokens.length < 3) {
    return false;
  }

  return tokenSimilarity(leftTokens, rightTokens) >= 0.72;
}

function normalizeSpace(text?: string) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function normalizeArticleToken(articleNumber?: string) {
  return normalizeSpace(articleNumber).replace(/\s+/g, "");
}

function cleanArticleTitle(title?: string) {
  const cleaned = normalizeSpace(title)
    .replace(/^[\s:;,.()[\]'"`]+/g, "")
    .replace(/[\s:;,.()[\]'"`]+$/g, "");
  if (!cleaned) {
    return "";
  }
  if (ARTICLE_PATTERN.test(cleaned)) {
    return "";
  }
  return cleaned;
}

function escapeForRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractArticleTitleFromSource(articleNumber: string, source?: string) {
  const normalizedArticle = normalizeArticleToken(articleNumber);
  const normalizedSource = normalizeSpace(source);
  if (!normalizedArticle || !normalizedSource) {
    return "";
  }

  const articleRegex = escapeForRegex(normalizedArticle).replace(/\s+/g, "\\s*");
  const parenPattern = new RegExp(`${articleRegex}\\s*[\\(\\[]\\s*([^\\)\\]\\n]{2,80})\\s*[\\)\\]]`);
  const parenMatch = normalizedSource.match(parenPattern);
  if (parenMatch?.[1]) {
    const cleaned = cleanArticleTitle(parenMatch[1]);
    if (cleaned) {
      return cleaned;
    }
  }

  const articlePattern = new RegExp(articleRegex);
  const articleMatch = normalizedSource.match(articlePattern);
  if (!articleMatch) {
    return "";
  }

  const index = normalizedSource.indexOf(articleMatch[0]);
  if (index < 0) {
    return "";
  }

  const afterArticle = normalizeSpace(
    normalizedSource
      .slice(index + articleMatch[0].length)
      .replace(/^[\s:;,.()[\]'"`]+/g, ""),
  );
  if (!afterArticle) {
    return "";
  }

  return cleanArticleTitle(afterArticle.split(/[.;。!?\n]/)[0] ?? "");
}

function resolveEvidenceArticleTitle(
  articleNumber: string,
  evidence?: Pick<EvidenceItem, "articleTitle" | "title" | "summaryArticle" | "keyExcerpt" | "clausePreview" | "legalBasis">,
) {
  const normalizedArticle = normalizeArticleToken(articleNumber);
  if (!normalizedArticle) {
    return "";
  }

  const candidates = [
    extractArticleTitleFromSource(normalizedArticle, evidence?.title),
    extractArticleTitleFromSource(normalizedArticle, evidence?.summaryArticle),
    extractArticleTitleFromSource(normalizedArticle, evidence?.legalBasis),
    cleanArticleTitle(evidence?.articleTitle),
    extractArticleTitleFromSource(normalizedArticle, evidence?.keyExcerpt),
    extractArticleTitleFromSource(normalizedArticle, evidence?.clausePreview),
    cleanArticleTitle(ARTICLE_TITLE_FALLBACKS.get(normalizedArticle)),
  ];

  return candidates.find(Boolean) ?? "";
}

function formatArticleLabel(articleNumber: string, articleTitle?: string) {
  const normalizedArticle = normalizeSpace(articleNumber);
  if (!normalizedArticle || normalizedArticle === "근거 조문 확인 필요") {
    return normalizedArticle || "근거 조문 확인 필요";
  }
  const cleanedTitle = cleanArticleTitle(articleTitle);
  if (!cleanedTitle) {
    return normalizedArticle;
  }
  return `${normalizedArticle}(${cleanedTitle})`;
}

function truncateSentence(text: string, maxLength: number) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const sliced = normalized.slice(0, maxLength);
  const lastSpace = sliced.lastIndexOf(" ");
  const safe = lastSpace >= Math.floor(maxLength * 0.6) ? sliced.slice(0, lastSpace) : sliced;
  return safe.replace(/[,\s]+$/g, "").trim();
}

function ensurePeriod(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function stripTerminalPunctuation(text: string) {
  return normalizeSpace(text).replace(/[.!?]+$/g, "").trim();
}

function hasAwkwardEnding(text: string) {
  const bare = stripTerminalPunctuation(text);
  if (!bare) {
    return true;
  }

  if (/[,:;]$/.test(bare)) {
    return true;
  }

  return AWKWARD_ENDING_PATTERN.test(bare);
}

type SentenceCompletionKind = "generic" | "requirement" | "reason" | "action" | "panel";

function isLikelyCompleteKoreanSentence(text: string) {
  const bare = stripTerminalPunctuation(text);
  if (!bare) {
    return false;
  }
  if (COMPLETE_SENTENCE_ENDING_PATTERN.test(bare) || /[다요]$/.test(bare)) {
    return true;
  }
  return /[A-Za-z0-9)]$/.test(bare) && /[.!?]$/.test(normalizeSpace(text));
}

function hasUnclosedParenthesis(text: string) {
  let depth = 0;
  for (const char of text) {
    if (char === "(" || char === "（") depth += 1;
    if (char === ")" || char === "）") depth -= 1;
  }
  return depth > 0;
}

function trimToClosedParenthesis(text: string) {
  let lastClosed = -1;
  let depth = 0;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === "(" || char === "（") depth += 1;
    if (char === ")" || char === "）") {
      depth -= 1;
      if (depth === 0) lastClosed = i;
    }
  }
  if (!hasUnclosedParenthesis(text)) return text;
  const lastOpen = text.lastIndexOf("(");
  const altOpen = text.lastIndexOf("（");
  const cutIndex = Math.max(lastOpen, altOpen);
  if (cutIndex <= 0) return text;
  return text.slice(0, cutIndex).replace(/[,\s]+$/g, "").trim();
}

const ATTRIBUTIVE_ENDING_PATTERN = /(것은|것을|것의|이하|있는|하는|되는|따른|관한|대하여|대해)$/;

function completeSentenceFragment(text: string, kind: SentenceCompletionKind) {
  let bare = stripTerminalPunctuation(text).replace(/[,:;]+$/g, "").trim();
  if (!bare) {
    return "";
  }

  // 괄호가 열린 채 닫히지 않은 경우 → 괄호 이전까지만 사용
  if (hasUnclosedParenthesis(bare)) {
    bare = trimToClosedParenthesis(bare);
    if (!bare) {
      return "";
    }
  }

  if (isLikelyCompleteKoreanSentence(bare)) {
    return ensurePeriod(bare);
  }
  if (/(해야|하여야|말해야)$/.test(bare)) {
    return ensurePeriod(`${bare} 합니다`);
  }
  if (/위하여$/.test(bare)) {
    return kind === "reason"
      ? ensurePeriod(`${bare.replace(/위하여$/, "위해")} 조치가 필요합니다`)
      : ensurePeriod(`${bare.replace(/위하여$/, "위해")} 조치를 이행해야 합니다`);
  }
  if (/여부$/.test(bare)) {
    return ensurePeriod(`${bare}를 확인해야 합니다`);
  }
  if (kind === "action" && /조$/.test(bare)) {
    return "";
  }

  // 관형형·연결형 어미로 끝나면 → 문장이 중간에 잘린 것이므로 빈 문자열 반환(fallback 유도)
  if (ATTRIBUTIVE_ENDING_PATTERN.test(bare)) {
    return "";
  }

  if (/(및|또는|등|등의|등을|등으로)$/.test(bare)) {
    const stem = bare.replace(/(및|또는|등|등의|등을|등으로)$/g, "").trim();
    if (stem) {
      if (kind === "reason") {
        return ensurePeriod(`${stem} 등 관련 위험요인을 확인해야 하므로 조치가 필요합니다`);
      }
      if (kind === "action") {
        return ensurePeriod(`${stem} 등 관련 조치를 실행해야 합니다`);
      }
      return ensurePeriod(`${stem} 등 관련 사항을 점검해야 합니다`);
    }
  }

  if (CONNECTIVE_ENDING_PATTERN.test(bare)) {
    const stem = bare.replace(CONNECTIVE_ENDING_PATTERN, "").trim();
    if (stem) {
      if (kind === "reason") {
        return ensurePeriod(`${stem} 상황이므로 조치가 필요합니다`);
      }
      if (kind === "action") {
        return ensurePeriod(`${stem} 기준에 따라 조치를 실행해야 합니다`);
      }
      if (kind === "panel") {
        return ensurePeriod(`${stem} 기준을 현장에 적용해야 합니다`);
      }
      return ensurePeriod(`${stem} 기준을 확인해야 합니다`);
    }
  }

  if (NOUN_LIKE_ENDING_PATTERN.test(bare)) {
    if (kind === "reason") {
      return ensurePeriod(`${bare}가 필요한 이유입니다`);
    }
    return ensurePeriod(`${bare}해야 합니다`);
  }

  if (kind === "reason") {
    return ensurePeriod(`${bare} 때문에 조치가 필요합니다`);
  }
  if (kind === "action") {
    return ensurePeriod(`${bare} 조치를 이행해야 합니다`);
  }
  if (kind === "panel") {
    return ensurePeriod(`${bare} 기준을 현장에 적용해야 합니다`);
  }
  return ensurePeriod(`${bare}를 확인해야 합니다`);
}

function toCompletedSentence(text: string, maxLength: number, kind: SentenceCompletionKind = "generic") {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }

  const clipped = truncateSentence(normalized, maxLength);
  if (!clipped) {
    return "";
  }

  const finalized = ensurePeriod(clipped);
  if (!hasAwkwardEnding(finalized) && isLikelyCompleteKoreanSentence(finalized)) {
    return finalized;
  }

  const completed = completeSentenceFragment(clipped, kind);
  if (completed && !hasAwkwardEnding(completed) && isLikelyCompleteKoreanSentence(completed)) {
    return completed;
  }

  return "";
}

function fallbackRequirementByStage(stage: LawActionStage, actionText: string) {
  const action = stripTerminalPunctuation(actionText) || "해당 조치";
  if (stage === "immediate") {
    return `${action} 이행 여부를 즉시 점검하고 조치 완료 전에는 작업을 중단해야 합니다.`;
  }
  if (stage === "same_day") {
    return `${action} 이행 여부를 당일 점검하고 점검 완료 전에는 동일 작업을 재개하면 안 됩니다.`;
  }
  if (stage === "pre_resume") {
    return `${action} 이행 여부와 재개 조건을 확인하고 승인 전에는 설비를 재가동하면 안 됩니다.`;
  }
  return `${action} 이행 계획을 확정하고 개선 완료 전에는 기존 위험 작업을 반복하면 안 됩니다.`;
}

function toSingleSentence(text: string, maxLength: number) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }

  const first = normalized
    .split(/(?<=[.!?])\s+|;|\n/g)
    .map((part) => normalizeSpace(part))
    .find(Boolean) ?? normalized;

  return truncateSentence(first, maxLength);
}

function fallbackActionByStage(stage: LawActionStage, legalRequirement?: string) {
  const anchor = stripTerminalPunctuation(toSingleSentence(legalRequirement ?? "", 80));
  if (stage === "immediate") {
    return anchor
      ? `${anchor} 기준에 따라 즉시 조치를 실행해야 합니다.`
      : "위험 확산을 막기 위해 즉시 조치를 실행해야 합니다.";
  }
  if (stage === "same_day") {
    return anchor
      ? `${anchor} 기준에 따라 당일 조치를 완료해야 합니다.`
      : "잔류 위험을 제거하기 위해 당일 조치를 완료해야 합니다.";
  }
  if (stage === "pre_resume") {
    return anchor
      ? `${anchor} 기준을 확인한 뒤에만 작업을 재개해야 합니다.`
      : "재개 조건을 확인한 뒤에만 작업을 재개해야 합니다.";
  }
  return anchor
    ? `${anchor} 기준에 따라 개선 조치를 이행해야 합니다.`
    : "동일 사고 재발을 막기 위해 개선 조치를 이행해야 합니다.";
}

function isLikelyCompleteActionSentence(text: string) {
  const bare = stripTerminalPunctuation(text);
  if (!bare) {
    return false;
  }
  if (/[,:;]$/.test(bare)) {
    return false;
  }
  if (hasAwkwardEnding(bare) || ACTION_FRAGMENT_ENDING_PATTERN.test(bare)) {
    return false;
  }
  // 괄호가 열린 채 닫히지 않은 문장은 불완전
  if (hasUnclosedParenthesis(bare)) {
    return false;
  }
  // 관형형 어미로 끝나는 문장은 불완전
  if (ATTRIBUTIVE_ENDING_PATTERN.test(bare)) {
    return false;
  }
  return isLikelyCompleteKoreanSentence(bare);
}

function toCompletedActionText(stage: LawActionStage, actionText: string, legalRequirement?: string) {
  const normalized = toSingleSentence(actionText, ACTION_TEXT_MAX_LENGTH);
  if (!normalized) {
    return fallbackActionByStage(stage, legalRequirement);
  }

  const direct = ensurePeriod(normalized);
  if (isLikelyCompleteActionSentence(direct)) {
    return direct;
  }

  const bare = stripTerminalPunctuation(normalized).replace(/[,:;]$/g, "").trim();
  if (bare) {
    const completed = completeSentenceFragment(bare, "action");
    if (completed && isLikelyCompleteActionSentence(completed)) {
      return completed;
    }
  }

  return fallbackActionByStage(stage, legalRequirement || actionText);
}

function resolveArticleNumber(item: Pick<EvidenceItem, "title" | "legalBasis" | "articleNumber">) {
  if (item.articleNumber?.trim()) {
    return item.articleNumber.trim();
  }

  const source = `${item.legalBasis ?? ""} ${item.title}`;
  const match = source.match(ARTICLE_PATTERN);
  return match?.[0] ?? "";
}

function resolveArticleNumberFromText(text?: string) {
  if (!text) {
    return "";
  }

  const match = text.match(ARTICLE_PATTERN);
  return match?.[0] ?? "";
}

function dedupeArticleNumbers(articleNumbers?: string[]) {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const raw of articleNumbers ?? []) {
    const normalized = normalizeSpace(raw);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    values.push(normalized);
  }

  return values;
}

function resolveActionArticleNumbers(item: Pick<LawActionItem, "articleNumbers" | "legalBasis" | "lawName">) {
  const deduped = dedupeArticleNumbers(item.articleNumbers);
  if (deduped.length > 0) {
    return deduped;
  }

  const inferred = resolveArticleNumberFromText(`${item.legalBasis ?? ""} ${item.lawName ?? ""}`);
  return inferred ? [inferred] : [];
}

function extractLawNameFromLegalBasis(legalBasis?: string) {
  const normalized = normalizeSpace(legalBasis);
  if (!normalized) {
    return "";
  }

  const articleMatch = normalized.match(ARTICLE_PATTERN);
  if (articleMatch?.index !== undefined) {
    const lawName = normalized.slice(0, articleMatch.index).trim();
    if (lawName) {
      return lawName;
    }
  }

  return normalized;
}

function resolveLegalRequirement(item: {
  legalRequirement?: string;
  clausePreview?: string;
}) {
  if (item.legalRequirement?.trim()) {
    return toSingleSentence(item.legalRequirement.trim(), LEGAL_REQUIREMENT_MAX_LENGTH);
  }

  if (item.clausePreview?.trim()) {
    return toSingleSentence(item.clausePreview.trim(), LEGAL_REQUIREMENT_MAX_LENGTH);
  }

  return "해당 법적 요구사항 확인 필요";
}

function stageRestrictionText(stage: LawActionStage) {
  if (stage === "immediate") {
    return "조치가 완료될 때까지 작업을 중단해야 합니다";
  }
  if (stage === "same_day") {
    return "당일 점검을 완료하기 전에는 동일 작업을 재개하면 안 됩니다";
  }
  if (stage === "pre_resume") {
    return "재개 확인이 완료되기 전에는 설비를 재가동하면 안 됩니다";
  }
  return "개선 계획이 확정되기 전에는 기존 위험 작업을 반복하면 안 됩니다";
}

function looksHeadingStyleRequirement(text: string) {
  const normalized = text.trim();
  if (!normalized) {
    return true;
  }
  if (/^제?\s*\d+/.test(normalized) && normalized.length <= 48) {
    return true;
  }
  return normalized.length < 10;
}

function buildStageLegalRequirement(stage: LawActionStage, requirement: string, actionText: string) {
  const normalizedRequirement = toSingleSentence(requirement, LEGAL_REQUIREMENT_MAX_LENGTH)
    .replace(/^[^:]{1,20}\s*:\s*/, "")
    .trim();
  const normalizedAction = stripTerminalPunctuation(toSingleSentence(actionText, 72));

  const seed = normalizedRequirement && !looksHeadingStyleRequirement(normalizedRequirement)
    ? normalizedRequirement
    : normalizedAction || "해당 안전조치";
  const base = stripTerminalPunctuation(seed);

  if (!base) {
    return "해당 법적 요구사항 확인 필요";
  }

  const hasCheckWord = base.includes("확인") || base.includes("점검");
  const withContext = hasCheckWord ? base : `${base} 이행 여부를 점검`;
  const hasRestriction = withContext.includes("안 됩니다")
    || withContext.includes("없습니다")
    || withContext.includes("중단")
    || withContext.includes("금지");
  const withRestriction = hasRestriction
    ? withContext
    : `${withContext}, ${stageRestrictionText(stage)}`;

  const completed = toCompletedSentence(withRestriction, LEGAL_REQUIREMENT_MAX_LENGTH, "requirement");
  if (completed) {
    return completed;
  }

  return toCompletedSentence(
    fallbackRequirementByStage(stage, normalizedAction || base || "해당 안전조치"),
    LEGAL_REQUIREMENT_MAX_LENGTH,
    "requirement",
  ) || ensurePeriod(truncateSentence(withRestriction, LEGAL_REQUIREMENT_MAX_LENGTH));
}

function toReasonText(text: string, maxLength: number) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+|;|\n/g)
    .map((part) => normalizeSpace(part))
    .filter((part) => part.length >= 8);

  for (const sentence of sentences) {
    const completed = toCompletedSentence(sentence, maxLength, "reason");
    if (completed) {
      return completed;
    }
  }

  return toCompletedSentence(normalized, maxLength, "reason");
}

function fallbackReasonByStage(stage: LawActionStage, actionText: string) {
  const action = stripTerminalPunctuation(actionText) || "해당 조치";
  if (stage === "immediate") {
    return `위험 확산을 차단하기 위해 ${action} 조치를 즉시 실행해야 합니다.`;
  }
  if (stage === "same_day") {
    return `잔류 위험을 제거하기 위해 ${action} 조치를 당일 내 완료해야 합니다.`;
  }
  if (stage === "pre_resume") {
    return `재개 조건을 충족하기 위해 ${action} 조치를 확인한 뒤에만 작업을 재개해야 합니다.`;
  }
  return `동일 사고 재발을 막기 위해 ${action} 조치를 포함해 절차 개선, 교육 강화, 장비 보완을 병행해야 합니다.`;
}

function stageReasonLead(stage: LawActionStage) {
  if (stage === "immediate") {
    return "위험 확산을 즉시 차단해야 하므로";
  }
  if (stage === "same_day") {
    return "잔류 위험을 당일 내 제거해야 하므로";
  }
  if (stage === "pre_resume") {
    return "재개 전 안전 조건을 검증해야 하므로";
  }
  return "재발 방지를 위해 절차와 설비를 구조적으로 개선해야 하므로";
}

function hasStageContext(stage: LawActionStage, text: string) {
  if (stage === "immediate") {
    return /(즉시|확산|차단|중지|정지)/.test(text);
  }
  if (stage === "same_day") {
    return /(당일|잔류|완료|점검)/.test(text);
  }
  if (stage === "pre_resume") {
    return /(재개|재개 전|확인|허가|조건)/.test(text);
  }
  return /(재발|개선|교육|절차|보완|강화)/.test(text);
}

function ensureStageAwareReason(stage: LawActionStage, text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }
  if (hasStageContext(stage, normalized)) {
    return normalized;
  }
  return `${stageReasonLead(stage)} ${normalized}`;
}

function toConciseReason(
  stage: LawActionStage,
  actionText: string,
  actionNeedReason?: string,
  relevanceReason?: string,
) {
  const explicit = normalizeSpace(actionNeedReason ?? "");
  if (explicit) {
    const completed = toReasonText(ensureStageAwareReason(stage, explicit), REASON_MAX_LENGTH);
    if (completed) {
      return completed;
    }
  }

  const fallback = normalizeSpace(relevanceReason ?? "");
  if (fallback) {
    const completed = toReasonText(
      `${fallback}. ${fallbackReasonByStage(stage, actionText)}`,
      REASON_MAX_LENGTH,
    );
    if (completed) {
      return completed;
    }
  }

  return toReasonText(fallbackReasonByStage(stage, actionText), REASON_MAX_LENGTH)
    || ensurePeriod(fallbackReasonByStage(stage, stripTerminalPunctuation(actionText) || "해당 조치"));
}

function buildActionAnchoredReason(item: Pick<ActionCardData, "stage" | "lawName" | "articleLabel" | "actionText" | "legalRequirement">) {
  const requirement = stripTerminalPunctuation(toSingleSentence(item.legalRequirement, 84));
  const action = stripTerminalPunctuation(toSingleSentence(item.actionText, 72)) || "해당 조치";
  const lawRef = normalizeSpace(`${item.lawName} ${item.articleLabel}`) || "해당 조문";
  const stageLead = stageReasonLead(item.stage);

  if (requirement) {
    return toReasonText(`${stageLead} ${lawRef}에서 ${requirement}을 요구하므로 ${action} 조치를 우선 이행해야 합니다.`, REASON_MAX_LENGTH)
      || ensurePeriod(`${stageLead} ${lawRef} 기준에 따라 ${action} 조치를 먼저 수행해야 합니다`);
  }

  return toReasonText(`${stageLead} ${lawRef} 기준에 따라 ${action} 조치를 먼저 수행해야 합니다.`, REASON_MAX_LENGTH)
    || ensurePeriod(`${stageLead} ${action} 조치를 먼저 수행해야 합니다`);
}

function enforceDistinctActionReasons(cards: ActionCardData[], seen: Set<string> = new Set<string>()) {
  return cards.map((card) => {
    let reason = toReasonText(card.reason, REASON_MAX_LENGTH);
    let key = normalizeForDedup(reason);

    if (!reason || seen.has(key)) {
      reason = buildActionAnchoredReason(card);
      key = normalizeForDedup(reason);
    }

    if (seen.has(key)) {
      reason = toReasonText(
        `${buildActionAnchoredReason(card)} (${formatArticleLabel(card.articleNumber, card.articleTitle)})`,
        REASON_MAX_LENGTH,
      );
      key = normalizeForDedup(reason);
    }

    seen.add(key);
    return { ...card, reason };
  });
}

function buildCrossStageDedupKey(actionText: string) {
  return normalizeForDedup(actionText);
}

function buildLawArticleKey(lawName: string, articleNumber: string) {
  return normalizeForDedup(`${lawName}|${articleNumber}`);
}

function lawArticleDedupKey(item: Pick<EvidenceItem, "title" | "legalBasis" | "articleNumber">) {
  const articleNumber = resolveArticleNumber(item);
  const lawName = extractLawNameFromLegalBasis(item.legalBasis) || item.title;
  return normalizeForDedup(`${lawName}|${articleNumber || item.title}`);
}

function isIncidentAnchorMismatch(item: Pick<LawActionItem, "lawFitGateFailureCode">) {
  return item.lawFitGateFailureCode === "INCIDENT_ANCHOR_MISMATCH";
}

function mapLawActionToCard(item: LawActionItem, fallbackEvidence?: EvidenceItem): ActionCardData {
  const dedupedArticles = resolveActionArticleNumbers(item);
  const fallbackArticleNumber = resolveArticleNumber(
    fallbackEvidence ?? { title: "", legalBasis: "", articleNumber: "" },
  );
  const articleNumber = dedupedArticles.length > 0
    ? dedupedArticles[0]
    : fallbackArticleNumber || "근거 조문 확인 필요";
  const articleLookupNumber = dedupedArticles[0] || fallbackArticleNumber;
  const articleTitle = cleanArticleTitle(item.articleTitle)
    || resolveEvidenceArticleTitle(articleLookupNumber || articleNumber, fallbackEvidence)
    || extractArticleTitleFromSource(articleLookupNumber || articleNumber, item.legalBasis)
    || extractArticleTitleFromSource(articleLookupNumber || articleNumber, fallbackEvidence?.legalBasis);
  const articleLabel = formatArticleLabel(articleNumber, articleTitle);

  const lawName = item.lawName?.trim()
    || extractLawNameFromLegalBasis(item.legalBasis)
    || extractLawNameFromLegalBasis(fallbackEvidence?.legalBasis)
    || fallbackEvidence?.title
    || "관련 법령 확인 필요";

  const baseLegalRequirement = resolveLegalRequirement({
    legalRequirement: item.legalRequirement,
    clausePreview: item.clausePreview || fallbackEvidence?.clausePreview,
  });
  const actionText = toCompletedActionText(item.stage, item.actionText, baseLegalRequirement);
  const legalRequirement = buildStageLegalRequirement(item.stage, baseLegalRequirement, actionText);
  const rawReason = item.applicabilityReason?.trim()
    || item.relevanceReason?.trim()
    || fallbackEvidence?.relevanceReason?.trim()
    || fallbackEvidence?.applicabilityReason?.trim();
  const reason = toConciseReason(item.stage, actionText, item.actionNeedReason, rawReason);
  const selectionReason = normalizeSpace(item.selectionReason ?? "")
    || (item.selectionMode === "reused"
      ? `${SECTION_META[item.stage].title} 단계에서 신규 법령/조문 후보가 부족해 기존 근거를 제한적으로 재사용했습니다.`
      : undefined);
  const originalUrl = buildStandardsRulesPdfUrl(articleLookupNumber || item.legalBasis || lawName);
  const isReviewRequired = item.lawFitStatus === "review_required";
  const lawFitReason = normalizeSpace(item.lawFitReason)
    || (isReviewRequired ? "자동 검증 점수가 낮아 조치-법령 매칭의 수동 확인이 필요합니다." : "");

  return {
    id: item.id,
    stage: item.stage,
    lawName,
    articleNumber,
    articleTitle: articleTitle || undefined,
    articleLabel,
    legalRequirement,
    actionText,
    reason,
    originalUrl,
    generationType: item.generationType ?? "direct",
    selectionMode: item.selectionMode,
    selectionReason,
    manualReviewRequired: isReviewRequired,
    lawFitStatus: item.lawFitStatus,
    lawFitReason: lawFitReason || undefined,
    lawFitScore: item.lawFitScore,
    applicabilityReason: normalizeSpace(item.applicabilityReason || fallbackEvidence?.applicabilityReason) || undefined,
    keyExcerpt: normalizeSpace(item.keyExcerpt || fallbackEvidence?.keyExcerpt) || undefined,
    summaryArticle: normalizeSpace(item.summaryArticle || fallbackEvidence?.summaryArticle) || undefined,
    clausePreview: normalizeSpace(item.clausePreview || fallbackEvidence?.clausePreview) || undefined,
    articleLookupNumber: articleLookupNumber || undefined,
    crossStageDedupKey: buildCrossStageDedupKey(actionText),
    lawArticleKey: buildLawArticleKey(lawName, articleNumber),
  };
}

function isReferenceRow(row: SectionRowData): row is ActionReferenceRowData {
  return (row as ActionReferenceRowData).type === "reference";
}

function markDuplicateSuspected(rowsByStage: Record<TimelineSection, SectionRowData[]>) {
  const lawArticleMap = new Map<string, { ids: string[]; actionKeys: Set<string> }>();

  for (const stage of ["immediate", "same_day", "pre_resume"] as const) {
    for (const row of rowsByStage[stage]) {
      if (isReferenceRow(row)) {
        continue;
      }

      const lawArticleKey = row.lawArticleKey;
      const actionKey = row.crossStageDedupKey || normalizeForDedup(row.actionText);
      if (!lawArticleKey) {
        continue;
      }

      const entry = lawArticleMap.get(lawArticleKey) ?? { ids: [], actionKeys: new Set<string>() };
      entry.ids.push(row.id);
      entry.actionKeys.add(actionKey);
      lawArticleMap.set(lawArticleKey, entry);
    }
  }

  const suspectIds = new Set<string>();
  for (const value of lawArticleMap.values()) {
    if (value.actionKeys.size > 1) {
      for (const id of value.ids) {
        suspectIds.add(id);
      }
    }
  }

  const next = { ...rowsByStage };
  for (const stage of ["immediate", "same_day", "pre_resume"] as const) {
    next[stage] = rowsByStage[stage].map((row) => {
      if (isReferenceRow(row)) {
        return row;
      }

      if (!suspectIds.has(row.id)) {
        return row;
      }

      return {
        ...row,
        duplicateSuspected: true,
      };
    });
  }

  return next;
}

function buildLawTimelineRows(stages: Record<TimelineSection, ActionCardData[]>) {
  return markDuplicateSuspected({
    immediate: [...stages.immediate],
    same_day: [...stages.same_day],
    pre_resume: [...stages.pre_resume],
  });
}

function buildManualReviewReferenceRow(stage: TimelineSection): ActionReferenceRowData {
  const title = SECTION_META[stage].title;
  return {
    id: `manual-review-${stage}`,
    type: "reference",
    message: `${title}: 적합 법령 없음(수동 검토 필요)`,
  };
}

function ensureSectionRows(stage: TimelineSection, rows: SectionRowData[]): SectionRowData[] {
  if (rows.length > 0) {
    return rows;
  }
  return [buildManualReviewReferenceRow(stage)];
}

function buildOriginalUrl(item: EvidenceItem) {
  const articleSource = resolveArticleNumber(item) || item.legalBasis || item.title;
  const sourceUrl = normalizeSpace(item.url);
  if (!sourceUrl) {
    return buildStandardsRulesPdfUrl(articleSource);
  }

  const article = encodeURIComponent(resolveArticleNumberFromText(articleSource) || "제");
  const separator = sourceUrl.includes("#") ? "&" : "#";
  return `${sourceUrl}${separator}search=${article}`;
}

function looksRawLegalText(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return true;
  }

  if (/^제?\s*\d+\s*조/.test(normalized) && (/\d+\.\s*/.test(normalized) || /[가-힣]\s*호/.test(normalized))) {
    return true;
  }

  if (/(하여야\s*한다|한다\.)/.test(normalized) && normalized.length < 80) {
    return true;
  }

  return false;
}

function looksMechanicalNarrative(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return true;
  }
  return /(?:위험요인\s*\d+점|장비\/작업어|rulescore|semanticscore|hazardtype|매칭|점수)/i.test(normalized);
}

function hasPanelAwkwardEnding(text: string) {
  const bare = stripTerminalPunctuation(text);
  if (!bare) {
    return true;
  }
  return hasAwkwardEnding(bare) || PANEL_FRAGMENT_ENDING_PATTERN.test(bare);
}

function toPanelCompletedSentence(text: string) {
  const normalized = normalizeSpace(text);
  if (!normalized) {
    return "";
  }

  const sentences = normalized
    .split(/(?<=[.!?])\s+|(?<=다\.)\s+|;|\n/g)
    .map((part) => normalizeSpace(part))
    .filter(Boolean);
  const candidates = sentences.length > 0 ? sentences : [normalized];

  for (const candidate of candidates) {
    const completed = ensurePeriod(candidate);
    if (!hasPanelAwkwardEnding(completed) && isLikelyCompleteKoreanSentence(completed)) {
      return completed;
    }
    const repaired = completeSentenceFragment(candidate, "panel");
    if (repaired && !hasPanelAwkwardEnding(repaired) && isLikelyCompleteKoreanSentence(repaired)) {
      return repaired;
    }
  }

  return "";
}

function panelStagePhrase(stage?: LawActionStage) {
  if (stage === "immediate") {
    return "즉시 조치 단계";
  }
  if (stage === "same_day") {
    return "당일 조치 단계";
  }
  if (stage === "pre_resume") {
    return "작업 재개 전 확인 단계";
  }
  if (stage === "improvement") {
    return "재발 방지 단계";
  }
  return "단계 미지정(공통 기준)";
}

function ensurePanelStageSentence(stage: LawActionStage | undefined, text: string) {
  const completed = toPanelCompletedSentence(text);
  if (!completed) {
    return "";
  }

  const phrase = panelStagePhrase(stage);
  if (completed.includes(phrase)) {
    return completed;
  }

  const staged = `${phrase}에서 ${stripTerminalPunctuation(completed)}`;
  return toPanelCompletedSentence(staged)
    || `${phrase}에서 현장 기준 준수 여부를 우선 확인해야 합니다.`;
}

function panelFallbackExcerpt(
  stage: LawActionStage | undefined,
  lawRef: string,
  actionText?: string,
  legalRequirement?: string,
) {
  const phrase = panelStagePhrase(stage);
  const action = stripTerminalPunctuation(toSingleSentence(actionText ?? "", 90));
  const requirement = stripTerminalPunctuation(toSingleSentence(legalRequirement ?? "", 90));

  if (action && requirement) {
    return `${phrase}에서 ${lawRef}은 ${requirement} 기준을 통해 ${action} 조치의 선이행과 미이행 상태 작업 금지를 요구합니다.`;
  }
  if (action) {
    return `${phrase}에서 ${lawRef}은 ${action} 조치를 선이행하고 위험 통제 전에는 작업을 지속하지 않도록 요구합니다.`;
  }
  return `${phrase}에서 ${lawRef}은 위험 구간 통제 기준을 먼저 확인하고 보호조치 완료 전 작업 지속을 금지하도록 요구합니다.`;
}

function panelFallbackApplicability(
  stage: LawActionStage | undefined,
  lawRef: string,
  scenario?: string,
  actionText?: string,
  legalRequirement?: string,
) {
  const phrase = panelStagePhrase(stage);
  const normalizedScenario = stripTerminalPunctuation(toSingleSentence(scenario ?? "", 96));
  const normalizedAction = stripTerminalPunctuation(toSingleSentence(actionText ?? "", 84));
  const requirement = stripTerminalPunctuation(toSingleSentence(legalRequirement ?? "", 84));

  if (normalizedScenario && normalizedAction) {
    return `${phrase}에서 ${lawRef}는 ${normalizedScenario} 사고의 원인·작업방식과 ${normalizedAction} 조치 필요성을 연결하는 적용 근거입니다.`;
  }
  if (normalizedScenario && requirement) {
    return `${phrase}에서 ${lawRef}는 ${normalizedScenario} 사고 맥락과 ${requirement} 요구사항의 연결 배경을 설명하는 근거입니다.`;
  }
  return `${phrase}에서 ${lawRef}는 현재 사고 위험요인과 작업 조건에 직접 연결되므로 우선순위 조치의 적용 배경으로 사용됩니다.`;
}

function panelFallbackSummary(
  stage: LawActionStage | undefined,
  lawRef: string,
  actionText?: string,
  legalRequirement?: string,
) {
  const phrase = panelStagePhrase(stage);
  const action = stripTerminalPunctuation(toSingleSentence(actionText ?? "", 88));
  const requirement = stripTerminalPunctuation(toSingleSentence(legalRequirement ?? "", 88));
  if (action && requirement) {
    return `${phrase} 현장 기준 요약: ${lawRef} 기준으로 ${action} 실행 확인, ${requirement} 준수 점검, 이탈 시 즉시 중지·보완 순서로 확인해야 합니다.`;
  }
  if (action) {
    return `${phrase} 현장 기준 요약: ${lawRef} 기준으로 ${action} 이행 확인, 위험상태 차단, 재확인 완료 후 작업 진행 순서로 점검해야 합니다.`;
  }
  return `${phrase} 현장 기준 요약: ${lawRef} 기준으로 작업 전 통제조치 확인, 작업 중 위험원 차단, 재개 전 승인 확인 순서를 점검해야 합니다.`;
}

function toPanelExcerpt(item: {
  stage?: LawActionStage;
  lawRef: string;
  actionText?: string;
  legalRequirement?: string;
  keyExcerpt?: string;
  clausePreview?: string;
}) {
  const candidates = [
    normalizeSpace(item.keyExcerpt),
    normalizeSpace(item.legalRequirement),
    normalizeSpace(item.clausePreview),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const completed = ensurePanelStageSentence(item.stage, candidate);
    if (
      completed
      && !looksRawLegalText(completed)
      && !looksMechanicalNarrative(completed)
      && !hasPanelAwkwardEnding(completed)
    ) {
      return completed;
    }
  }

  return ensurePanelStageSentence(
    item.stage,
    panelFallbackExcerpt(item.stage, item.lawRef, item.actionText, item.legalRequirement),
  ) || ensurePeriod(panelFallbackExcerpt(item.stage, item.lawRef, item.actionText, item.legalRequirement));
}

function toPanelApplicability(item: {
  stage?: LawActionStage;
  lawRef: string;
  actionText?: string;
  legalRequirement?: string;
  reason?: string;
  applicabilityReason?: string;
  evidenceApplicability?: string;
  scenario?: string;
}) {
  const candidates = [
    normalizeSpace(item.applicabilityReason),
    normalizeSpace(item.reason),
    normalizeSpace(item.evidenceApplicability),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const completed = ensurePanelStageSentence(item.stage, candidate);
    if (
      completed
      && !looksRawLegalText(completed)
      && !looksMechanicalNarrative(completed)
      && !hasPanelAwkwardEnding(completed)
    ) {
      return completed;
    }
  }

  return ensurePanelStageSentence(
    item.stage,
    panelFallbackApplicability(item.stage, item.lawRef, item.scenario, item.actionText, item.legalRequirement),
  ) || ensurePeriod(panelFallbackApplicability(item.stage, item.lawRef, item.scenario, item.actionText, item.legalRequirement));
}

function toPanelSummary(item: {
  stage?: LawActionStage;
  lawRef: string;
  actionText?: string;
  legalRequirement?: string;
  summaryArticle?: string;
  evidenceSummary?: string;
  clausePreview?: string;
}) {
  const candidates = [
    normalizeSpace(item.summaryArticle),
    normalizeSpace(item.evidenceSummary),
    normalizeSpace(item.legalRequirement),
    normalizeSpace(item.clausePreview),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const completed = ensurePanelStageSentence(item.stage, candidate);
    if (
      completed
      && !looksRawLegalText(completed)
      && !looksMechanicalNarrative(completed)
      && !hasPanelAwkwardEnding(completed)
    ) {
      return completed;
    }
  }

  return ensurePanelStageSentence(
    item.stage,
    panelFallbackSummary(item.stage, item.lawRef, item.actionText, item.legalRequirement),
  ) || ensurePeriod(panelFallbackSummary(item.stage, item.lawRef, item.actionText, item.legalRequirement));
}

function ensureDistinctPanelSections(item: {
  stage?: LawActionStage;
  lawRef: string;
  scenario?: string;
  actionText?: string;
  legalRequirement?: string;
  excerpt: string;
  applicability: string;
  summary: string;
}) {
  let excerpt = item.excerpt;
  let applicability = item.applicability;
  let summary = item.summary;

  const rebuildExcerpt = () =>
    ensurePanelStageSentence(
      item.stage,
      panelFallbackExcerpt(item.stage, item.lawRef, item.actionText, item.legalRequirement),
    ) || ensurePeriod(panelFallbackExcerpt(item.stage, item.lawRef, item.actionText, item.legalRequirement));
  const rebuildApplicability = () =>
    ensurePanelStageSentence(
      item.stage,
      panelFallbackApplicability(item.stage, item.lawRef, item.scenario, item.actionText, item.legalRequirement),
    ) || ensurePeriod(panelFallbackApplicability(item.stage, item.lawRef, item.scenario, item.actionText, item.legalRequirement));
  const rebuildSummary = () =>
    ensurePanelStageSentence(
      item.stage,
      panelFallbackSummary(item.stage, item.lawRef, item.actionText, item.legalRequirement),
    ) || ensurePeriod(panelFallbackSummary(item.stage, item.lawRef, item.actionText, item.legalRequirement));

  if (!excerpt || hasPanelAwkwardEnding(excerpt) || looksRawLegalText(excerpt) || looksMechanicalNarrative(excerpt)) {
    excerpt = rebuildExcerpt();
  }
  if (!applicability || hasPanelAwkwardEnding(applicability) || looksRawLegalText(applicability) || looksMechanicalNarrative(applicability)) {
    applicability = rebuildApplicability();
  }
  if (!summary || hasPanelAwkwardEnding(summary) || looksRawLegalText(summary) || looksMechanicalNarrative(summary)) {
    summary = rebuildSummary();
  }

  if (isNearDuplicatePanelText(applicability, excerpt)) {
    applicability = rebuildApplicability();
  }

  if (isNearDuplicatePanelText(summary, excerpt) || isNearDuplicatePanelText(summary, applicability)) {
    summary = rebuildSummary();
  }

  if (isNearDuplicatePanelText(excerpt, applicability) || isNearDuplicatePanelText(excerpt, summary)) {
    excerpt = rebuildExcerpt();
  }

  return {
    excerpt,
    applicability,
    summary,
  };
}

type ActionCardProps = {
  item: ActionCardData;
  checked: boolean;
  onCheckedChange: (id: string, checked: boolean) => void;
  onSelectArticle: (context: SelectedLawContext) => void;
};

const ActionCard = memo(function ActionCard({
  item,
  checked,
  onCheckedChange,
  onSelectArticle,
}: ActionCardProps) {
  const stageMeta = CARD_STAGE_META[item.stage];

  return (
    <div className="rounded-radius-md border border-border bg-surface p-space-4">
      <div className="flex items-start gap-space-3">
        <Checkbox
          id={`action-check-${item.id}`}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(item.id, Boolean(value))}
          className="mt-1"
          aria-label={`${item.actionText} 체크`}
        />
        <div className="min-w-0 flex-1 space-y-space-3">
          <div className="flex flex-wrap items-center gap-space-2">
            {item.generationType === "derived" && (
              <span className="inline-flex items-center rounded-radius-sm bg-primary-100 px-2 py-1 text-caption font-semibold text-primary-800">
                자동 생성 조치
              </span>
            )}
            {item.duplicateSuspected && (
              <span className="inline-flex items-center rounded-radius-sm bg-warning-100 px-2 py-1 text-caption font-semibold text-warning-700">
                중복 의심
              </span>
            )}
            {item.manualReviewRequired && (
              <span className="inline-flex items-center rounded-radius-sm bg-warning-100 px-2 py-1 text-caption font-semibold text-warning-700">
                수동 검토 필요
              </span>
            )}
          </div>

          <div className={`rounded-radius-md border px-space-3 py-space-3 ${stageMeta.panelClassName}`}>
            <p className="text-caption font-semibold text-neutral-700 mb-space-1">{stageMeta.actionLabel}</p>
            <p className="text-body-md text-neutral-900 font-semibold leading-relaxed whitespace-pre-wrap break-words">
              {item.actionText}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-space-2 rounded-radius-sm border border-neutral-200 bg-neutral-50 px-space-3 py-space-2">
            <span className="text-caption font-semibold text-neutral-700">근거 조문</span>
            <span className="text-body-sm text-neutral-900 whitespace-pre-wrap break-words">{item.lawName}</span>
            <button
              type="button"
              className="text-body-sm text-primary-700 underline underline-offset-2 whitespace-pre-wrap break-words"
              onClick={() =>
                onSelectArticle({
                  actionId: item.id,
                  articleNumber: item.articleNumber,
                  articleTitle: item.articleTitle,
                  articleLookupNumber: item.articleLookupNumber,
                  lawName: item.lawName,
                })}
            >
              {item.articleLabel}
            </button>
            <a
              href={item.originalUrl}
              target="_blank"
              rel="noreferrer"
              className="text-caption text-primary-700 underline underline-offset-2"
            >
              원문보기
            </a>
          </div>

          <CompactRow
            label={stageMeta.requirementLabel}
            value={item.legalRequirement}
          />
          <CompactRow
            label={stageMeta.reasonLabel}
            value={item.reason}
          />
          {item.lawFitStatus === "review_required" ? (
            <CompactRow
              label={Number.isFinite(item.lawFitScore) ? `법령 적합성 검증 사유 (${Math.round(item.lawFitScore ?? 0)}점)` : "법령 적합성 검증 사유"}
              value={item.lawFitReason || "자동 검증 점수가 낮아 수동 검토가 필요합니다."}
            />
          ) : null}
          {item.selectionReason ? (
            <CompactRow
              label={item.selectionMode === "reused" ? "반복 선택 근거" : "선택 근거"}
              value={item.selectionReason}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
});

function ActionReferenceRow({ message }: { message: string }) {
  return (
    <div className="rounded-radius-md border border-neutral-200 bg-neutral-50 p-space-4">
      <p className="text-body-sm text-neutral-700">{message}</p>
    </div>
  );
}

function CompactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-radius-sm border border-neutral-200 bg-surface px-space-3 py-space-2">
      <p className="text-caption font-semibold text-neutral-600 mb-space-1">{label}</p>
      <p className="text-body-sm text-neutral-900 leading-relaxed whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
}

export default function AnalysisResult() {
  const navigate = useNavigate();
  const { assessment, setCurrentStep, loadEvidence } = useAssessment();
  const [checkedActionIds, setCheckedActionIds] = useState<Record<string, boolean>>({});
  const [selectedLawContext, setSelectedLawContext] = useState<SelectedLawContext | null>(null);
  const [isRightPanelDrawerOpen, setIsRightPanelDrawerOpen] = useState(false);
  const [isPreparingEvidence, setIsPreparingEvidence] = useState(false);

  useEffect(() => {
    if (!assessment) {
      return;
    }
    setCurrentStep("analysis");
    void loadEvidence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment?.id]);

  useEffect(() => {
    if (!selectedLawContext?.articleNumber && !selectedLawContext?.actionId) {
      return;
    }

    if (window.matchMedia("(max-width: 1279px)").matches) {
      setIsRightPanelDrawerOpen(true);
    }
  }, [selectedLawContext]);

  const lawGuideTrackStatus = useMemo(() => {
    const trackStatus = assessment?.lawGuideMeta?.trackStatus;
    return {
      law: trackStatus?.law ?? (assessment?.apiStatuses.lawGuide === "loading" ? "loading" : "empty"),
      guide: trackStatus?.guide ?? (assessment?.apiStatuses.lawGuide === "loading" ? "loading" : "empty"),
      media: trackStatus?.media ?? (assessment?.apiStatuses.lawGuide === "loading" ? "loading" : "empty"),
    };
  }, [assessment?.lawGuideMeta?.trackStatus, assessment?.apiStatuses.lawGuide]);

  const handleGoToEvidence = async () => {
    if (!assessment?.id || isPreparingEvidence) {
      return;
    }

    setIsPreparingEvidence(true);
    try {
      await loadEvidence();
      navigate(`/assessments/${assessment.id}/evidence`);
    } finally {
      setIsPreparingEvidence(false);
    }
  };

  const handleActionCheckedChange = useCallback((actionId: string, checked: boolean) => {
    setCheckedActionIds((prev) => {
      const prevChecked = Boolean(prev[actionId]);
      if (prevChecked === checked) {
        return prev;
      }

      if (checked) {
        return { ...prev, [actionId]: true };
      }

      const next = { ...prev };
      delete next[actionId];
      return next;
    });
  }, []);

  const evidenceItems = useMemo(() => assessment?.evidenceItems ?? [], [assessment?.evidenceItems]);
  const lawActionItems = useMemo(() => assessment?.lawActionItems ?? [], [assessment?.lawActionItems]);

  const lawItems = useMemo(
    () => evidenceItems.filter((item) => item.type === "law" && item.sourceBadge !== "Guide" && item.sourceBadge !== "미디어"),
    [evidenceItems],
  );

  const dedupedLawItems = useMemo(() => {
    const dedup = new Map<string, EvidenceItem>();
    for (const item of lawItems) {
      const dedupKey = lawArticleDedupKey(item);
      if (!dedupKey) {
        continue;
      }
      const prev = dedup.get(dedupKey);
      if (!prev || item.relevanceScore > prev.relevanceScore) {
        dedup.set(dedupKey, item);
      }
    }
    return Array.from(dedup.values());
  }, [lawItems]);

  const lawEvidenceByArticle = useMemo(() => {
    const map = new Map<string, EvidenceItem>();
    for (const item of dedupedLawItems) {
      const article = normalizeArticleToken(resolveArticleNumber(item));
      if (article && !map.has(article)) {
        map.set(article, item);
      }
    }
    return map;
  }, [dedupedLawItems]);

  const stageCards = useMemo(() => {
    const base: Record<TimelineSection, ActionCardData[]> = {
      immediate: [],
      same_day: [],
      pre_resume: [],
    };

    for (const item of lawActionItems) {
      if (item.stage !== "immediate" && item.stage !== "same_day" && item.stage !== "pre_resume") {
        continue;
      }
      if (isIncidentAnchorMismatch(item)) {
        continue;
      }

      const article = resolveActionArticleNumbers(item)[0];
      const fallbackEvidence = article ? lawEvidenceByArticle.get(normalizeArticleToken(article)) : undefined;
      base[item.stage].push(mapLawActionToCard(item, fallbackEvidence));
    }

    const seenReasonKeys = new Set<string>();
    return {
      immediate: enforceDistinctActionReasons(base.immediate, seenReasonKeys),
      same_day: enforceDistinctActionReasons(base.same_day, seenReasonKeys),
      pre_resume: enforceDistinctActionReasons(base.pre_resume, seenReasonKeys),
    };
  }, [lawActionItems, lawEvidenceByArticle]);

  const sectionRows = useMemo(() => {
    const rows = buildLawTimelineRows(stageCards);
    return {
      immediate: ensureSectionRows("immediate", rows.immediate),
      same_day: ensureSectionRows("same_day", rows.same_day),
      pre_resume: ensureSectionRows("pre_resume", rows.pre_resume),
    };
  }, [stageCards]);

  const improvementCards = useMemo(() => {
    const backendImprovement = lawActionItems.filter((item) =>
      item.stage === "improvement" && !isIncidentAnchorMismatch(item)
    );
    if (backendImprovement.length > 0) {
      const cards = backendImprovement.map((item) => {
        const article = resolveActionArticleNumbers(item)[0];
        const fallbackEvidence = article ? lawEvidenceByArticle.get(normalizeArticleToken(article)) : undefined;
        return mapLawActionToCard(item, fallbackEvidence);
      });
      return enforceDistinctActionReasons(cards);
    }

    const cards = (assessment.analysis.improvements ?? []).map((item, index) => {
      const lawName = "관련 법령 확인 필요";
      const articleNumber = "근거 조문 확인 필요";
      const actionText = toCompletedActionText("improvement", item.action, item.action);
      return {
        id: `improvement-${index + 1}`,
        stage: "improvement" as const,
        lawName,
        articleNumber,
        articleLabel: articleNumber,
        originalUrl: buildStandardsRulesPdfUrl(articleNumber),
        legalRequirement: buildStageLegalRequirement("improvement", item.action, actionText),
        actionText,
        reason: toConciseReason("improvement", actionText),
        generationType: "direct" as const,
        manualReviewRequired: true,
        crossStageDedupKey: buildCrossStageDedupKey(actionText),
        lawArticleKey: buildLawArticleKey(lawName, articleNumber),
      };
    });
    return enforceDistinctActionReasons(cards);
  }, [lawActionItems, lawEvidenceByArticle, assessment?.analysis.improvements]);

  const allActionCards = useMemo(
    () => [...stageCards.immediate, ...stageCards.same_day, ...stageCards.pre_resume, ...improvementCards],
    [stageCards, improvementCards],
  );

  const actionCardById = useMemo(() => {
    const map = new Map<string, ActionCardData>();
    for (const card of allActionCards) {
      map.set(card.id, card);
    }
    return map;
  }, [allActionCards]);

  const fallbackSelectedContext = useMemo<SelectedLawContext | null>(() => {
    const firstAction = allActionCards[0];
    if (firstAction) {
      return {
        actionId: firstAction.id,
        articleNumber: firstAction.articleNumber,
        articleTitle: firstAction.articleTitle,
        articleLookupNumber: firstAction.articleLookupNumber,
        lawName: firstAction.lawName,
      };
    }

    const firstLaw = dedupedLawItems[0];
    if (!firstLaw) {
      return null;
    }

    const articleNumber = resolveArticleNumber(firstLaw);
    const articleTitle = resolveEvidenceArticleTitle(articleNumber, firstLaw);
    return {
      articleNumber,
      articleTitle: articleTitle || undefined,
      lawName: extractLawNameFromLegalBasis(firstLaw.legalBasis) || firstLaw.title,
    };
  }, [allActionCards, dedupedLawItems]);

  const effectiveSelectedContext = selectedLawContext ?? fallbackSelectedContext;

  const selectedActionCard = useMemo(() => {
    const actionId = effectiveSelectedContext?.actionId;
    if (!actionId) {
      return null;
    }
    return actionCardById.get(actionId) ?? null;
  }, [actionCardById, effectiveSelectedContext]);

  const selectedLawItem = useMemo(() => {
    if (dedupedLawItems.length === 0) {
      return null;
    }

    const selectedArticleToken = normalizeArticleToken(
      effectiveSelectedContext?.articleLookupNumber || effectiveSelectedContext?.articleNumber,
    );
    const selectedLawNameToken = normalizeForDedup(effectiveSelectedContext?.lawName ?? "");

    if (selectedArticleToken) {
      const byArticleAndLaw = dedupedLawItems.find((item) => {
        const itemArticleToken = normalizeArticleToken(resolveArticleNumber(item));
        if (itemArticleToken !== selectedArticleToken) {
          return false;
        }
        if (!selectedLawNameToken) {
          return true;
        }
        const itemLawName = extractLawNameFromLegalBasis(item.legalBasis) || item.title;
        return normalizeForDedup(itemLawName) === selectedLawNameToken;
      });
      if (byArticleAndLaw) {
        return byArticleAndLaw;
      }

      const byArticle = dedupedLawItems.find((item) => normalizeArticleToken(resolveArticleNumber(item)) === selectedArticleToken);
      if (byArticle) {
        return byArticle;
      }
    }

    return dedupedLawItems[0] ?? null;
  }, [dedupedLawItems, effectiveSelectedContext]);

  const selectedLawName = normalizeSpace(
    selectedActionCard?.lawName
    || effectiveSelectedContext?.lawName
    || (selectedLawItem ? extractLawNameFromLegalBasis(selectedLawItem.legalBasis) || selectedLawItem.title : ""),
  );
  const selectedArticleNumber = normalizeSpace(
    selectedActionCard?.articleNumber
    || effectiveSelectedContext?.articleNumber
    || (selectedLawItem ? resolveArticleNumber(selectedLawItem) : ""),
  );
  const selectedArticleTitle = cleanArticleTitle(
    selectedActionCard?.articleTitle
    || effectiveSelectedContext?.articleTitle
    || resolveEvidenceArticleTitle(selectedArticleNumber, selectedLawItem ?? undefined),
  );
  const selectedArticleLabel = formatArticleLabel(selectedArticleNumber || "근거 조문 확인 필요", selectedArticleTitle);
  const selectedLawRef = normalizeSpace(`${selectedLawName || "관련 법령"} ${selectedArticleLabel}`);

  const selectedPanelExcerpt = toPanelExcerpt({
    stage: selectedActionCard?.stage,
    lawRef: selectedLawRef,
    actionText: selectedActionCard?.actionText,
    legalRequirement: selectedActionCard?.legalRequirement,
    keyExcerpt: selectedActionCard?.keyExcerpt || selectedLawItem?.keyExcerpt,
    clausePreview: selectedActionCard?.clausePreview || selectedLawItem?.clausePreview,
  });

  const selectedPanelApplicability = toPanelApplicability({
    stage: selectedActionCard?.stage,
    lawRef: selectedLawRef,
    actionText: selectedActionCard?.actionText,
    legalRequirement: selectedActionCard?.legalRequirement,
    reason: selectedActionCard?.reason,
    applicabilityReason: selectedActionCard?.applicabilityReason,
    evidenceApplicability: selectedLawItem?.applicabilityReason || selectedLawItem?.relevanceReason,
    scenario: assessment.analysis.scenario,
  });

  const selectedPanelSummary = toPanelSummary({
    stage: selectedActionCard?.stage,
    lawRef: selectedLawRef,
    actionText: selectedActionCard?.actionText,
    legalRequirement: selectedActionCard?.legalRequirement,
    summaryArticle: selectedActionCard?.summaryArticle,
    evidenceSummary: selectedLawItem?.summaryArticle,
    clausePreview: selectedActionCard?.clausePreview || selectedLawItem?.clausePreview,
  });

  const selectedPanelSections = ensureDistinctPanelSections({
    stage: selectedActionCard?.stage,
    lawRef: selectedLawRef,
    scenario: assessment.analysis.scenario,
    actionText: selectedActionCard?.actionText,
    legalRequirement: selectedActionCard?.legalRequirement,
    excerpt: selectedPanelExcerpt,
    applicability: selectedPanelApplicability,
    summary: selectedPanelSummary,
  });

  const selectedOriginalUrl = selectedActionCard?.originalUrl
    || (selectedLawItem ? buildOriginalUrl(selectedLawItem) : buildStandardsRulesPdfUrl(selectedArticleNumber || selectedLawName));

  const rightPanel = (
    <div data-testid="analysis-right-panel-sticky" className="sticky top-0">
      <div
        data-testid="analysis-right-panel-scroll"
        className="max-h-[calc(100vh-128px)] overflow-y-auto space-y-space-3 rounded-radius-lg border border-border bg-surface p-space-4"
      >
        <h3 className="text-heading-3 text-neutral-900">법령 전문 보기</h3>
        {!selectedLawItem && !selectedActionCard ? (
          <p className="text-body-sm text-neutral-500">선택된 조문이 없습니다.</p>
        ) : (
          <>
            <div className="rounded-radius-md border border-neutral-200 bg-neutral-50 p-space-3">
              <p className="text-caption text-neutral-500 mb-space-1">선택 조문</p>
              <p className="text-body-sm text-neutral-900 font-semibold">
                {selectedLawRef}
              </p>
            </div>
            <div className="rounded-radius-md border border-neutral-200 bg-neutral-50 p-space-3">
              <p className="text-caption text-neutral-500 mb-space-1">핵심 의미</p>
              <p className="text-body-sm text-neutral-900 leading-relaxed whitespace-pre-wrap break-words">
                {selectedPanelSections.excerpt}
              </p>
            </div>
            <div className="rounded-radius-md border border-neutral-200 bg-neutral-50 p-space-3">
              <p className="text-caption text-neutral-500 mb-space-1">적용 배경</p>
              <p className="text-body-sm text-neutral-900 leading-relaxed whitespace-pre-wrap break-words">
                {selectedPanelSections.applicability}
              </p>
            </div>
            <div className="rounded-radius-md border border-neutral-200 bg-neutral-50 p-space-3">
              <p className="text-caption text-neutral-500 mb-space-1">현장 기준 요약</p>
              <p className="text-body-sm text-neutral-900 leading-relaxed whitespace-pre-wrap break-words">
                {selectedPanelSections.summary}
              </p>
            </div>
            <a
              href={selectedOriginalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-body-sm text-primary-700 underline underline-offset-2"
            >
              원문보기
            </a>
          </>
        )}
      </div>
    </div>
  );

  if (!assessment) {
    return null;
  }

  if (isPreparingEvidence) {
    return (
      <DashboardShell currentStep="analysis" rightPanel={rightPanel}>
        <div className="space-y-space-5">
          <div className="rounded-radius-lg border border-border bg-surface p-space-6">
            <div className="flex items-center gap-space-2 text-primary-700 mb-space-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <h1 className="text-heading-2 text-neutral-900">근거 데이터 준비 중</h1>
            </div>
            <p className="text-body-md text-neutral-600">
              유사 재해사례, 사고사망 사례, 법령, KOSHA Guide, 미디어 데이터를 모두 조회하고 있습니다.
              조회가 끝나면 근거 확인 화면으로 자동 이동합니다.
            </p>
          </div>

          <div className="rounded-radius-lg border border-border bg-surface p-space-5">
            <h2 className="text-heading-3 text-neutral-900 mb-space-3">준비 상태</h2>
            <div className="space-y-space-2 text-body-sm text-neutral-700">
              <div>유사 재해사례: {sourceStatusMessage(assessment.apiStatuses.disasterCase)}</div>
              <div>사고사망 사례: {sourceStatusMessage(assessment.apiStatuses.fatalityCase)}</div>
              <div>법령: {sourceStatusMessage(lawGuideTrackStatus.law)}</div>
              <div>KOSHA Guide: {sourceStatusMessage(lawGuideTrackStatus.guide)}</div>
              <div>미디어: {sourceStatusMessage(lawGuideTrackStatus.media)}</div>
            </div>
          </div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      currentStep="analysis"
      rightPanel={rightPanel}
      rightPanelDrawerOpen={isRightPanelDrawerOpen}
      onRightPanelDrawerOpenChange={setIsRightPanelDrawerOpen}
    >
      <div className="space-y-space-5">
        <div className="rounded-radius-lg border border-border bg-surface p-space-6">
          <h1 className="text-heading-1 text-neutral-900 mb-space-2">분석 결과</h1>
          <p className="text-body-md text-neutral-600">
            실행 우선 순서에 따라 현장 조치를 정리했습니다.
          </p>
        </div>

        {(["immediate", "same_day", "pre_resume"] as const).map((stage) => (
          <section
            key={stage}
            className="rounded-radius-lg border border-border bg-surface p-space-5"
          >
            <div className="mb-space-3">
              <h2 className="text-heading-2 text-neutral-900">{SECTION_META[stage].title}</h2>
              <p className="text-caption text-neutral-500">{SECTION_META[stage].subtitle}</p>
            </div>
            <div className="space-y-space-3">
              {sectionRows[stage].map((row) =>
                isReferenceRow(row) ? (
                  <ActionReferenceRow key={row.id} message={row.message} />
                ) : (
                  <ActionCard
                    key={row.id}
                    item={row}
                    checked={Boolean(checkedActionIds[row.id])}
                    onCheckedChange={handleActionCheckedChange}
                    onSelectArticle={setSelectedLawContext}
                  />
                ))}
            </div>
          </section>
        ))}

        <section className="rounded-radius-lg border border-border bg-surface p-space-5">
          <div className="mb-space-3">
            <h2 className="text-heading-2 text-neutral-900">{SECTION_META.improvement.title}</h2>
            <p className="text-caption text-neutral-500">{SECTION_META.improvement.subtitle}</p>
          </div>
          <div className="space-y-space-3">
            {improvementCards.length === 0 ? (
              <ActionReferenceRow message="재발 방지 조치: 적합 법령 없음(수동 검토 필요)" />
            ) : (
              improvementCards.map((item) => (
                <ActionCard
                  key={item.id}
                  item={item}
                  checked={Boolean(checkedActionIds[item.id])}
                  onCheckedChange={handleActionCheckedChange}
                  onSelectArticle={setSelectedLawContext}
                />
              ))
            )}
          </div>
        </section>

        <div className="flex justify-end">
          <Button type="button" onClick={() => void handleGoToEvidence()} disabled={isPreparingEvidence}>
            {isPreparingEvidence ? "근거 데이터 준비 중..." : "증거 화면으로 이동"}
          </Button>
        </div>
      </div>
    </DashboardShell>
  );
}

