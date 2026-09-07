export type PpePart = "respiratory" | "eye" | "hand" | "body";

/**
 * 깨진 HTML 엔티티(&amp;lt;, &lt;, &gt;, &amp;, &quot;, &#39; 등)를 디코딩하고 공백을 정규화합니다.
 */
export function decodeHtmlEntities(raw: string | undefined | null): string {
  if (!raw) return "";
  let text = String(raw);

  // 이중 인코딩(&amp;lt; 등) 및 단일 인코딩 반복 처리
  const entityMap: Record<string, string> = {
    "&amp;lt;": "<",
    "&amp;gt;": ">",
    "&amp;amp;": "&",
    "&amp;quot;": '"',
    "&amp;#39;": "'",
    "&amp;nbsp;": " ",
    "&lt;": "<",
    "&gt;": ">",
    "&amp;": "&",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };

  for (const [entity, replacement] of Object.entries(entityMap)) {
    text = text.replaceAll(entity, replacement);
  }

  // 중복 공백 및 양 끝 공백 정리
  return text.replace(/[ \t]+/g, " ").trim();
}

export interface PpeSummaryResult {
  part: string;
  summary: string;
  tags: string[];
  hasDetail: boolean;
  detailLines: string[];
  rawCleaned: string;
}

/**
 * 긴 MSDS 원문 문장에서 핵심 보호구 태그 및 요약 문구를 추출하고 세부 항목을 분리합니다.
 */
export function extractPpeSummary(part: PpePart | string, rawText: string | undefined | null): PpeSummaryResult {
  const cleaned = decodeHtmlEntities(rawText);

  if (!cleaned || cleaned === "자료없음" || cleaned === "해당없음" || cleaned === "-") {
    return {
      part,
      summary: "해당 보호구에 대한 별도 권고 기준이 없습니다.",
      tags: [],
      hasDetail: false,
      detailLines: [],
      rawCleaned: cleaned || "자료없음",
    };
  }

  // 세부 항목 분리 (/ 또는 줄바꿈 또는 - 기준으로 분리)
  const rawSegments = cleaned
    .split(/\s*[\/\n]\s*|\s+-\s+/)
    .map((s) => s.trim().replace(/^[-•*]\s*/, ""))
    .filter((s) => s.length > 0);

  const detailLines = rawSegments.length > 0 ? rawSegments : [cleaned];

  const tags: string[] = [];
  let summary = "";

  switch (part) {
    case "respiratory": {
      // 호흡기 보호
      const hasOrganic = /유기화합물|유기용제|유기물질/.test(cleaned);
      const hasAcid = /산성가스|산성/.test(cleaned);
      const hasGasMask = /방독마스크|방독\s*마스크/.test(cleaned);
      const hasDustMask = /방진마스크|방진\s*마스크|분진|미스트|흄/.test(cleaned);
      const hasSuppliedAir = /송기마스크|자급식|산소.*부족|19\.5%|19\.6%/.test(cleaned);
      const hasPapr = /전동팬|전동식/.test(cleaned);

      if (hasOrganic) tags.push("유기화합물용 방독마스크");
      else if (hasAcid) tags.push("산성가스용 방독마스크");
      else if (hasGasMask) tags.push("방독마스크");

      if (hasDustMask) tags.push("방진마스크");
      if (hasPapr) tags.push("전동식 보호구");
      if (hasSuppliedAir) tags.push("송기마스크(밀폐/산소결핍 시)");

      if (tags.length === 0) {
        if (/인증.*호흡용/.test(cleaned)) tags.push("KOSHA 인증 호흡보호구");
        else tags.push("호흡보호구 착용");
      }

      // 요약 문장 생성
      if (hasOrganic && hasDustMask) {
        summary = "유기화합물용 방독마스크 또는 방진마스크(공단 인증) 착용";
      } else if (hasOrganic) {
        summary = "공단 인증 유기화합물용 방독마스크 착용 권고";
      } else if (hasGasMask) {
        summary = "공단 인증 적정 방독마스크 착용 권고";
      } else if (hasDustMask) {
        summary = "공단 인증 방진마스크(고효율 여과재) 착용 권고";
      } else if (cleaned.length < 50) {
        summary = cleaned;
      } else {
        summary = "작업 환경 및 농도에 맞는 공단 인증 호흡용 보호구 착용";
      }

      if (hasSuppliedAir && !summary.includes("송기마스크")) {
        summary += " (밀폐공간/산소 부족 시 송기마스크)";
      }
      break;
    }

    case "eye": {
      // 눈·안면 보호
      const hasTightGoggles = /밀폐형\s*보안경|밀폐형/.test(cleaned);
      const hasVentGoggles = /통기성\s*보안경|통기성/.test(cleaned);
      const hasFaceShield = /안면보호구|안면\s*보호구|페이스실드/.test(cleaned);
      const hasWashStation = /세안설비|세척시설|샤워식/.test(cleaned);

      if (hasTightGoggles) tags.push("밀폐형 보안경");
      if (hasVentGoggles) tags.push("통기성 보안경");
      if (!hasTightGoggles && !hasVentGoggles && /보안경/.test(cleaned)) tags.push("화학물질용 보안경");
      if (hasFaceShield) tags.push("안면보호구");
      if (hasWashStation) tags.push("긴급 세안/세척설비");

      if (tags.length === 0) tags.push("눈·안면 보호구");

      if (hasTightGoggles || hasVentGoggles) {
        summary = "가스/증기/비산 방지용 보안경(밀폐형 또는 통기성) 착용";
      } else if (hasFaceShield) {
        summary = "화학물질 비산 방지용 보안경 및 안면보호구 착용";
      } else if (cleaned.length < 50) {
        summary = cleaned;
      } else {
        summary = "화학물질 취급용 보안경 착용";
      }

      if (hasWashStation && !summary.includes("세안")) {
        summary += " (인근 긴급 세안설비 구비)";
      }
      break;
    }

    case "hand": {
      // 손 보호
      const hasNitrile = /니트릴/.test(cleaned);
      const hasNeoprene = /네오프렌/.test(cleaned);
      const hasChemicalGloves = /내화학성|화학물질용|화학용|내투과성/.test(cleaned);

      if (hasNitrile) tags.push("니트릴 장갑");
      if (hasNeoprene) tags.push("네오프렌 장갑");
      if (!hasNitrile && !hasNeoprene && hasChemicalGloves) tags.push("내화학성 보호장갑");
      if (tags.length === 0) tags.push("보호장갑");

      if (hasNitrile || hasNeoprene) {
        summary = "적절한 재질의 내화학성 장갑(니트릴/네오프렌 등) 착용";
      } else if (hasChemicalGloves) {
        summary = "물질 특성에 맞는 내화학성 보호장갑 착용";
      } else if (cleaned.length < 40) {
        summary = cleaned;
      } else {
        summary = "화학물질 침투 방지용 적합 재질 보호장갑 착용";
      }
      break;
    }

    case "body": {
      // 신체·보호복
      const hasSuit = /보호의복|보호복|내화학성\s*의복/.test(cleaned);
      const hasBoots = /안전화|보호장화|화학용\s*장화/.test(cleaned);
      const hasApron = /앞치마|에이프런/.test(cleaned);

      if (hasSuit) tags.push("내화학성 보호복");
      if (hasBoots) tags.push("안전화/장화");
      if (hasApron) tags.push("화학 앞치마");
      if (tags.length === 0) tags.push("보호의복");

      if (hasSuit && hasBoots) {
        summary = "적절한 재질의 내화학성 보호복 및 안전화 착용";
      } else if (hasSuit) {
        summary = "화학물질 접촉 방지용 보호의복 착용";
      } else if (cleaned.length < 40) {
        summary = cleaned;
      } else {
        summary = "물질 특성에 맞는 화학물질용 보호의복 착용";
      }
      break;
    }

    default: {
      tags.push("개인보호구");
      summary = cleaned.length > 50 ? cleaned.slice(0, 50) + "..." : cleaned;
      break;
    }
  }

  // 만약 원문이 매우 짧고 간단한 경우 원문 자체가 요약이 됨
  if (cleaned.length <= 40 && detailLines.length <= 1) {
    summary = cleaned;
  }

  // 상세 보기 필요 여부: 원문 길이가 45자 이상이거나 세부 항목이 2개 이상일 때
  const hasDetail = cleaned.length > 45 || detailLines.length > 1;

  return {
    part,
    summary,
    tags,
    hasDetail,
    detailLines,
    rawCleaned: cleaned,
  };
}
