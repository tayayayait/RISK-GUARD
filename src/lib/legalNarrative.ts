const ELLIPSIS_PATTERN = /\.\.\.|…/;
const ARTICLE_PATTERN = /제\s*\d+\s*조(?:의\s*\d+)?/g;
const LIST_PATTERN = /(?:^|\s)(?:\d+\.\s*|[가-하]\.\s*|[①-⑳]\s*)/g;
const LEGAL_STYLE_PATTERN = /(?:다음\s*각\s*호|각\s*호|하여야\s*한다|해야\s*한다|아니\s*된다|규정한다)/g;
const MECHANICAL_PATTERN = /(?:키워드|매칭|점수|rulescore|semanticscore|hazardtype|\d+\s*점)/i;

function normalizeText(text?: string) {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

function countMatches(text: string, pattern: RegExp) {
  return (text.match(pattern) ?? []).length;
}

function isRawLawStyle(text?: string) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return true;
  }

  if (ELLIPSIS_PATTERN.test(normalized)) {
    return true;
  }

  const articleCount = countMatches(normalized, ARTICLE_PATTERN);
  const listCount = countMatches(normalized, LIST_PATTERN);
  const legalStyleCount = countMatches(normalized, LEGAL_STYLE_PATTERN);

  return articleCount >= 2 || listCount >= 2 || legalStyleCount >= 3;
}

function hasThreePillars(content: { applicabilityReason: string; keyExcerpt: string; summaryArticle: string }) {
  const joined = normalizeText(`${content.applicabilityReason} ${content.keyExcerpt} ${content.summaryArticle}`);
  const hasApplicability = /(적용|해당|현재|상황|직접|관련)/.test(joined);
  const hasRisk = /(위험|사고|폭발|화재|추락|질식|감전|확산|피해|재사고)/.test(joined);
  const hasAction = /(조치|확인|점검|차단|중지|통제|이행|실행|보완|승인|설치|유지|재개)/.test(joined);
  return hasApplicability && hasRisk && hasAction;
}

export interface LegalNarrativeInput {
  title?: string;
  legalBasis?: string;
  articleNumber?: string;
  relevanceReason?: string;
  applicabilityReason?: string;
  keyExcerpt?: string;
  summaryArticle?: string;
}

export interface LegalNarrativeDisplay {
  applicabilityReason: string;
  keyExcerpt: string;
  summaryArticle: string;
}

function sanitizeReason(reason?: string) {
  const normalized = normalizeText(reason);
  if (!normalized || MECHANICAL_PATTERN.test(normalized) || /hazardType\s*\d+/i.test(normalized)) {
    return "";
  }
  return normalized;
}

function buildFallback(input: LegalNarrativeInput): LegalNarrativeDisplay {
  const lawRef = normalizeText(input.legalBasis)
    || normalizeText(input.articleNumber)
    || normalizeText(input.title)
    || "해당 법령";
  const reasonHint = sanitizeReason(input.relevanceReason);

  const applicabilityReason = reasonHint
    ? `${lawRef}는 ${reasonHint}와 연결된 위험을 통제하기 위한 기준이므로 현재 사고 상황에 직접 적용됩니다.`
    : `${lawRef}는 현재 사고 상황에서 위험 확산을 막기 위한 기준이므로 현장에 직접 적용됩니다.`;

  const keyExcerpt = `${lawRef}의 핵심 의미는 위험이 확인된 작업 구간에서 보호조치와 작업 통제를 먼저 수행하고, 위험이 해소되기 전까지 작업을 계속하지 않는 것입니다.`;
  const summaryArticle = "따라서 현장에서는 작업 전 위험조건 확인, 작업 중 위험원 차단, 작업 재개 전 점검·승인 절차를 순서대로 확인해야 합니다.";

  return {
    applicabilityReason,
    keyExcerpt,
    summaryArticle,
  };
}

function isLowQualityBundle(content: LegalNarrativeDisplay) {
  if (!content.applicabilityReason || !content.keyExcerpt || !content.summaryArticle) {
    return true;
  }

  if (MECHANICAL_PATTERN.test(content.applicabilityReason)) {
    return true;
  }

  if (isRawLawStyle(content.keyExcerpt) || isRawLawStyle(content.summaryArticle)) {
    return true;
  }

  return !hasThreePillars(content);
}

export function resolveLegalNarrativeDisplay(input: LegalNarrativeInput): LegalNarrativeDisplay {
  const candidate: LegalNarrativeDisplay = {
    applicabilityReason: normalizeText(input.applicabilityReason),
    keyExcerpt: normalizeText(input.keyExcerpt),
    summaryArticle: normalizeText(input.summaryArticle),
  };

  if (isLowQualityBundle(candidate)) {
    return buildFallback(input);
  }

  return candidate;
}
