import { searchChemicals, MsdsSearchCondition, MsdsChemicalSummary } from "./msds-api.ts";
import { fetchPubChemFallback, PubChemResult } from "./pubchem.ts";

export type ResolutionStrategy =
  | "cas"
  | "un"
  | "name_ko"
  | "name_en_bridge"
  | "pubchem"
  | "user_selected"
  | "unresolved";

export type ResolutionConfidence = "high" | "medium" | "low" | "none";

export interface ResolvedSubstance {
  chemId: string;
  chemNameKor: string;
  casNo?: string;
  unNo?: string;
  resolvedBy: ResolutionStrategy;
  confidence: ResolutionConfidence;
  lastDate?: string;
  pubChem?: PubChemResult;
}

export interface ChemCandidate {
  chemId: string;
  chemNameKor: string;
  casNo?: string;
  unNo?: string;
}

export interface ResolutionResult {
  substance: ResolvedSubstance | null;
  needsUserSelection?: {
    candidates: ChemCandidate[];
    reason: string;
  };
  warnings?: string[];
}

export interface ResolveOptions {
  serviceKey: string;
  hint?: {
    productName?: string;
    casNo?: string;
  };
  selectedChemId?: string;
  signal?: AbortSignal;
}

export const NCIS_SBSTN_BASE_URL = "https://apis.data.go.kr/B552584/kecoapi/ncissbstn";

/** 환경공단 화학물질정보(ncissbstn) 응답. sbstnNmKor 는 국문명 미등재 시 빈 문자열로 온다. */
interface NcisSbstnItem {
  sbstnId?: string | number;
  casNo?: string;
  sbstnNmKor?: string;
  sbstnNmEng?: string;
  sbstnNm2Kor?: string;
  sbstnNm2Eng?: string;
  mlcfrm?: string;
  mlcwgt?: string;
}

interface NcisSbstnResponse {
  header?: { resultCode?: string | number; resultMsg?: string };
  body?: { items?: NcisSbstnItem[]; totalCount?: string | number };
}

/**
 * CAS 체크디지트 검증:
 * 형식: \d{2,7}-\d{2}-\d
 * 마지막 자리 = (앞자리들을 역순으로 1, 2, 3... 가중합) mod 10
 */
export function validateCasCheckDigit(casNo: string): boolean {
  if (!casNo) return false;
  const match = casNo.trim().match(/^(\d{2,7})-(\d{2})-(\d)$/);
  if (!match) return false;

  const prefixDigits = (match[1] + match[2]).split("").map(Number);
  const checkDigit = Number(match[3]);

  let sum = 0;
  let weight = 1;
  for (let i = prefixDigits.length - 1; i >= 0; i--) {
    sum += prefixDigits[i] * weight;
    weight++;
  }

  return sum % 10 === checkDigit;
}

/**
 * 텍스트에서 유효한 CAS 번호들을 추출 (체크디지트 통과한 것만 반환)
 */
export function extractValidCasNumbers(text: string): string[] {
  if (!text) return [];
  const casRegex = /\b(\d{2,7}-\d{2}-\d)\b/g;
  const matches = [...text.matchAll(casRegex)];
  const validCasList: string[] = [];

  for (const match of matches) {
    const cas = match[1];
    if (validateCasCheckDigit(cas)) {
      if (!validCasList.includes(cas)) {
        validCasList.push(cas);
      }
    }
  }

  return validCasList;
}

/**
 * 텍스트에서 UN 번호 추출 (e.g. "UN1294" 또는 "UN 1294" 또는 4자리 UN번호)
 */
export function extractUnNumbers(text: string): string[] {
  if (!text) return [];
  const unRegex = /\bUN\s*([0-9]{4})\b/gi;
  const matches = [...text.matchAll(unRegex)];
  const unList: string[] = [];

  for (const match of matches) {
    const un = match[1];
    if (!unList.includes(un)) {
      unList.push(un);
    }
  }

  return unList;
}

/**
 * 환경공단 영문명 브리지 검색 (chemSbstnList searchGubun=1)
 * ★ 중요: 반드시 영문명이 검색어와 대소문자 무시 완전 일치(Exact Match)해야 함
 */
export async function bridgeEnglishNameToCas(
  serviceKey: string,
  englishName: string,
  signal?: AbortSignal
): Promise<string | null> {
  const cleanName = englishName.trim();
  if (!cleanName) return null;

  const url = new URL(`${NCIS_SBSTN_BASE_URL}/chemSbstnList`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("searchGubun", "1");
  url.searchParams.set("searchNm", cleanName);
  url.searchParams.set("returnType", "JSON");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "10");

  try {
    const res = await fetch(url.toString(), { method: "GET", signal });
    if (!res.ok) return null;
    const json = (await res.json()) as NcisSbstnResponse;
    if (String(json?.header?.resultCode) !== "200") return null;

    const items = json?.body?.items;
    if (!Array.isArray(items) || items.length === 0) return null;

    const targetLower = cleanName.toLowerCase();

    // 1) sbstnNmEng 대소문자 무시 완전일치 검색
    for (const item of items) {
      const eng = (item.sbstnNmEng || "").trim().toLowerCase();
      if (eng === targetLower && item.casNo) {
        if (validateCasCheckDigit(item.casNo)) {
          return item.casNo;
        }
      }
    }

    // 2) sbstnNm2Eng (유사명 세미콜론 구분) 대소문자 무시 완전일치 검색
    for (const item of items) {
      const aliases = (item.sbstnNm2Eng || "")
        .split(";")
        .map((a: string) => a.trim().toLowerCase());
      if (aliases.includes(targetLower) && item.casNo) {
        if (validateCasCheckDigit(item.casNo)) {
          return item.casNo;
        }
      }
    }

    // 부분일치만 있는 경우 채택하지 않고 null 반환
    return null;
  } catch {
    return null;
  }
}

/**
 * 텍스트 또는 힌트로부터 물질을 확정(Resolution)하는 핵심 함수
 */
export async function resolveChemical(
  input: {
    rawText?: string;
    productName?: string;
    casNo?: string;
  },
  options: ResolveOptions
): Promise<ResolutionResult> {
  const warnings: string[] = [];
  const text = (input.rawText || "") + " " + (input.productName || "") + " " + (input.casNo || "");

  /**
   * 이전 다중 매칭에서 사용자가 고른 chemId 가 이번 검색 결과에 있으면 그것으로 확정한다.
   *
   * chemId 는 물질명이 아니므로 getChemList 로 되찾을 수 없다(국문명 검색 시 항상 0건).
   * 따라서 사용자에게 보여줬던 것과 같은 검색을 다시 수행한 뒤 그 결과에서 골라낸다.
   */
  const pickSelected = (results: MsdsChemicalSummary[]): MsdsChemicalSummary | null => {
    if (!options.selectedChemId) return null;
    return results.find((r) => r.chemId === options.selectedChemId) ?? null;
  };

  /** 사용자 선택이 있었는데 후보에서 찾지 못한 경우 — 임의 선택하지 않고 다시 물어본다. */
  const selectionMissed = () => {
    if (options.selectedChemId) {
      warnings.push(
        `Selected chemId ${options.selectedChemId} was not found in the candidate list; asking the user again.`,
      );
    }
  };

  // 1) CAS 번호 기반 확정
  const validCasList = extractValidCasNumbers(text);
  if (input.casNo && validateCasCheckDigit(input.casNo) && !validCasList.includes(input.casNo)) {
    validCasList.unshift(input.casNo);
  }

  for (const cas of validCasList) {
    try {
      const results = await searchChemicals(
        options.serviceKey,
        { keyword: cas, condition: MsdsSearchCondition.CAS },
        { signal: options.signal }
      );

      if (results.length > 0) {
        const best = results.find((r) => r.casNo === cas) || results[0];
        return {
          substance: {
            chemId: best.chemId,
            chemNameKor: best.chemNameKor,
            casNo: best.casNo || cas,
            unNo: best.unNo,
            resolvedBy: "cas",
            confidence: "high",
            lastDate: best.lastDate,
          },
          warnings,
        };
      }
    } catch (err) {
      warnings.push(`CAS search error for ${cas}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2) UN 번호 기반 확정
  const unList = extractUnNumbers(text);
  for (const un of unList) {
    try {
      const results = await searchChemicals(
        options.serviceKey,
        { keyword: un, condition: MsdsSearchCondition.UN },
        { signal: options.signal }
      );

      const selectedFromUn = pickSelected(results);
      if (selectedFromUn) {
        return {
          substance: {
            chemId: selectedFromUn.chemId,
            chemNameKor: selectedFromUn.chemNameKor,
            casNo: selectedFromUn.casNo,
            unNo: selectedFromUn.unNo || un,
            resolvedBy: "user_selected",
            confidence: "high",
            lastDate: selectedFromUn.lastDate,
          },
          warnings,
        };
      }

      if (results.length === 1) {
        const single = results[0];
        return {
          substance: {
            chemId: single.chemId,
            chemNameKor: single.chemNameKor,
            casNo: single.casNo,
            unNo: single.unNo || un,
            resolvedBy: "un",
            confidence: "high",
            lastDate: single.lastDate,
          },
          warnings,
        };
      } else if (results.length > 1) {
        selectionMissed();
        return {
          substance: null,
          needsUserSelection: {
            candidates: results.slice(0, 5).map((r) => ({
              chemId: r.chemId,
              chemNameKor: r.chemNameKor,
              casNo: r.casNo,
              unNo: r.unNo,
            })),
            reason: `UN 번호 [UN${un}]에 해당하는 물질이 여러 개 검색되었습니다. 물질을 선택해 주세요.`,
          },
          warnings,
        };
      }
    } catch (err) {
      warnings.push(`UN search error for ${un}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const hasKorean = (str?: string) => Boolean(str && /[가-힣]/.test(str));
  const hasEnglish = (str?: string) => Boolean(str && /[A-Za-z]{3,}/.test(str));

  let koNameCandidate: string | undefined;
  let enNameCandidate: string | undefined;

  if (input.productName) {
    const trimmed = input.productName.trim();
    if (hasKorean(trimmed)) {
      koNameCandidate = trimmed;
    } else if (hasEnglish(trimmed)) {
      enNameCandidate = trimmed;
    }
  }

  if (!koNameCandidate && input.rawText) {
    koNameCandidate = input.rawText.match(/[가-힣]{2,20}/)?.[0];
  }
  if (!enNameCandidate && input.rawText) {
    enNameCandidate = input.rawText.match(/\b[A-Za-z]{3,30}\b/)?.[0];
  }

  // 3) 국문 물질명 기반 확정
  if (koNameCandidate) {
    try {
      const results = await searchChemicals(
        options.serviceKey,
        { keyword: koNameCandidate, condition: MsdsSearchCondition.NAME_KO },
        { signal: options.signal }
      );

      const selectedFromName = pickSelected(results);
      if (selectedFromName) {
        return {
          substance: {
            chemId: selectedFromName.chemId,
            chemNameKor: selectedFromName.chemNameKor,
            casNo: selectedFromName.casNo,
            unNo: selectedFromName.unNo,
            resolvedBy: "user_selected",
            confidence: "high",
            lastDate: selectedFromName.lastDate,
          },
          warnings,
        };
      }

      if (results.length === 1) {
        const single = results[0];
        return {
          substance: {
            chemId: single.chemId,
            chemNameKor: single.chemNameKor,
            casNo: single.casNo,
            unNo: single.unNo,
            resolvedBy: "name_ko",
            confidence: "medium",
            lastDate: single.lastDate,
          },
          warnings,
        };
      } else if (results.length > 1) {
        // 완전 일치 항목이 1개만 존재하는지 확인
        const exactMatch = results.filter(
          (r) => r.chemNameKor.trim() === koNameCandidate.trim()
        );
        if (exactMatch.length === 1) {
          const single = exactMatch[0];
          return {
            substance: {
              chemId: single.chemId,
              chemNameKor: single.chemNameKor,
              casNo: single.casNo,
              unNo: single.unNo,
              resolvedBy: "name_ko",
              confidence: "medium",
              lastDate: single.lastDate,
            },
            warnings,
          };
        }

        // 다중 매칭 시 자동 선택 금지 -> 사용자 선택 요청
        selectionMissed();
        return {
          substance: null,
          needsUserSelection: {
            candidates: results.slice(0, 5).map((r) => ({
              chemId: r.chemId,
              chemNameKor: r.chemNameKor,
              casNo: r.casNo,
              unNo: r.unNo,
            })),
            reason: `검색어 [${koNameCandidate}]에 해당하는 물질이 여러 개 검색되었습니다. 올바른 물질을 선택해 주세요.`,
          },
          warnings,
        };
      }
    } catch (err) {
      warnings.push(`Korean name search error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 4) 영문 물질명 브리지 검색
  if (enNameCandidate) {
    const bridgedCas = await bridgeEnglishNameToCas(
      options.serviceKey,
      enNameCandidate,
      options.signal
    );

    if (bridgedCas) {
      const msdsResults = await searchChemicals(
        options.serviceKey,
        { keyword: bridgedCas, condition: MsdsSearchCondition.CAS },
        { signal: options.signal }
      );
      if (msdsResults.length > 0) {
        const match = msdsResults.find((r) => r.casNo === bridgedCas) || msdsResults[0];
        return {
          substance: {
            chemId: match.chemId,
            chemNameKor: match.chemNameKor,
            casNo: match.casNo || bridgedCas,
            unNo: match.unNo,
            resolvedBy: "name_en_bridge",
            confidence: "medium",
            lastDate: match.lastDate,
          },
          warnings,
        };
      }
    }
  }

  // 5) 국내 미등재 -> PubChem 폴백
  const pubChemQuery = enNameCandidate || koNameCandidate;
  if (pubChemQuery) {
    const pubChemResult = await fetchPubChemFallback(pubChemQuery, {
      signal: options.signal,
    });
    if (pubChemResult) {
      return {
        substance: {
          chemId: `PUBCHEM_${pubChemResult.cid}`,
          chemNameKor: pubChemResult.name,
          resolvedBy: "pubchem",
          confidence: "low",
          pubChem: pubChemResult,
        },
        warnings,
      };
    }
  }

  // 6) 전부 실패 -> unresolved (200 응답 유지)
  return {
    substance: null,
    warnings,
  };
}
