/**
 * 환경공단 유독물GHS API 클라이언트 (NCIS GHS)
 */

export const GHS_BASE_URL = "https://apis.data.go.kr/B552584/kecoapi/ncisghs";

export enum GhsSearchGubun {
  NAME_EN = "1",
  CAS = "2",
  UNIQUE_NO = "3",
}

export interface GhsHazardItem {
  hrmflnClsfArtclNm?: string;
  hrmDngrCd?: string;
  clsfGrd?: string;
  hrmPrevntCdList: string[]; // ^ 분해된 P코드 배열
}

export interface GhsSubstanceDetail {
  sbstnId?: string;
  casNo?: string;
  sbstnNmKor?: string;
  sbstnNmEng?: string;
  sbstnTypeUnqno?: string;
  signalWord?: string; // sfsgwd
  mfctrCn?: string;
  unNo?: string; // unnm
  pictograms: string[]; // pctgrmCd (캐럿 분해)
  hazardList: GhsHazardItem[];
}

export interface GhsRequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
}

export class GhsApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status?: number, details?: unknown) {
    super(`[${code}] ${message}`);
    this.name = "GhsApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 캐럿(^) 구분자를 분해하고 빈 요소 및 '-' 센티널 제거
 */
export function splitCaretValues(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split("^")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s !== "-");
}

/**
 * GHS API 요청 헬퍼
 */
interface GhsRawItem {
  sbstnId?: string | number;
  casNo?: string;
  sbstnNmKor?: string;
  sbstnNmEng?: string;
  sbstnTypeUnqno?: string;
  sfsgwd?: string;
  mfctrCn?: string;
  unnm?: string;
  pctgrmCd?: string;
  hrmflnList?: Array<Record<string, unknown>>;
}

interface GhsRawResponse {
  header?: { resultCode?: string | number; resultMsg?: string };
  body?: { items?: GhsRawItem[]; totalCount?: string | number };
}

export async function requestGhsJson(
  url: string,
  options: GhsRequestOptions = {}
): Promise<GhsRawResponse> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await delay(retryDelayMs);
    }

    const controller = new AbortController();
    let isTimedOut = false;
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      controller.abort();
    }, timeoutMs);

    const onCallerAbort = () => controller.abort();
    if (options.signal) {
      options.signal.addEventListener("abort", onCallerAbort, { once: true });
    }

    try {
      const res = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener("abort", onCallerAbort);
      }

      if (!res.ok) {
        if ((res.status === 429 || res.status >= 500) && attempt < maxRetries) {
          lastError = new GhsApiError(`GHS_HTTP_${res.status}`, `HTTP error ${res.status}`, res.status);
          continue;
        }
        throw new GhsApiError(`GHS_HTTP_${res.status}`, `HTTP error ${res.status}`, res.status);
      }

      const json = (await res.json()) as GhsRawResponse;
      return json;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener("abort", onCallerAbort);
      }

      if (err instanceof GhsApiError && /97|91|93/.test(err.code)) {
        throw err;
      }

      if (isTimedOut) {
        lastError = new GhsApiError("GHS_TIMEOUT", `GHS API timed out after ${timeoutMs}ms`, 504);
      } else {
        lastError = err;
      }

      if (attempt < maxRetries) {
        continue;
      }
    }
  }

  if (lastError instanceof GhsApiError) {
    throw lastError;
  }
  throw new GhsApiError(
    "GHS_NETWORK_ERROR",
    lastError instanceof Error ? lastError.message : "Unknown error",
    502,
    lastError
  );
}

/**
 * GHS 화학물질 상세/기준값 조회 (GET /ghsList)
 */
export async function fetchGhsSubstance(
  serviceKey: string,
  searchNm: string,
  searchGubun: GhsSearchGubun = GhsSearchGubun.CAS,
  options: GhsRequestOptions = {}
): Promise<GhsSubstanceDetail | null> {
  const url = new URL(`${GHS_BASE_URL}/ghsList`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("searchNm", searchNm);
  url.searchParams.set("searchGubun", searchGubun);
  url.searchParams.set("returnType", "JSON");
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "10");

  const json = await requestGhsJson(url.toString(), options);

  const resultCode = String(json?.header?.resultCode ?? "").trim();
  const resultMsg = json?.header?.resultMsg ?? "";

  // GHS API의 성공 코드는 "200"
  if (resultCode !== "200") {
    throw new GhsApiError(
      `GHS_UPSTREAM_ERROR:${resultCode}`,
      `GHS API returned code ${resultCode}: ${resultMsg}`
    );
  }

  const items = json?.body?.items;
  if (!items || !Array.isArray(items) || items.length === 0) {
    return null;
  }

  /**
   * CAS 조회는 정확일치라 첫 행이 곧 정답이지만, 영문명 조회는 부분일치다
   * (`Toluene` → `Toluene, nitro-` 가 먼저 온다).
   * 이 값은 라벨 교차검증의 기준값이 되므로 다른 물질을 잡으면 안전 경고가 통째로 틀어진다.
   * 따라서 검색 조건과 실제로 일치하는 행만 채택한다.
   */
  const normalized = searchNm.trim().toLowerCase();
  const matched =
    searchGubun === GhsSearchGubun.CAS
      ? items.find((item) => (item.casNo || "").trim() === searchNm.trim())
      : searchGubun === GhsSearchGubun.NAME_EN
        ? items.find((item) => (item.sbstnNmEng || "").trim().toLowerCase() === normalized)
        : items.find((item) => String(item.sbstnId ?? "").trim() === searchNm.trim());

  if (!matched) {
    return null;
  }

  const first = matched;
  const pictograms = splitCaretValues(first.pctgrmCd);

  const rawHazardList = Array.isArray(first.hrmflnList) ? first.hrmflnList : [];
  const hazardList: GhsHazardItem[] = rawHazardList.map((h: Record<string, unknown>) => ({
    hrmflnClsfArtclNm: typeof h.hrmflnClsfArtclNm === "string" ? h.hrmflnClsfArtclNm : undefined,
    hrmDngrCd: typeof h.hrmDngrCd === "string" ? h.hrmDngrCd : undefined,
    clsfGrd: typeof h.clsfGrd === "string" ? h.clsfGrd : undefined,
    hrmPrevntCdList: splitCaretValues(typeof h.hrmPrevntCd === "string" ? h.hrmPrevntCd : ""),
  }));

  return {
    sbstnId: first.sbstnId ? String(first.sbstnId) : undefined,
    casNo: first.casNo || undefined,
    sbstnNmKor: first.sbstnNmKor || undefined,
    sbstnNmEng: first.sbstnNmEng || undefined,
    sbstnTypeUnqno: first.sbstnTypeUnqno || undefined,
    signalWord: first.sfsgwd || undefined,
    mfctrCn: first.mfctrCn || undefined,
    unNo: first.unnm || undefined,
    pictograms,
    hazardList,
  };
}
