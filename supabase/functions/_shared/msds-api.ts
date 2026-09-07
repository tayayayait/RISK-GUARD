import { extractXmlItems, DataGoXmlError } from "./data-go-xml.ts";

export const MSDS_BASE_URL = "https://apis.data.go.kr/B552468/msdschem";

export enum MsdsSearchCondition {
  NAME_KO = "0",
  CAS = "1",
  UN = "2",
  KE = "3",
  EN = "4",
}

export interface MsdsChemicalSummary {
  chemId: string; // 선행 0 보존 필수 (e.g. "001032")
  chemNameKor: string;
  casNo?: string;
  unNo?: string;
  keNo?: string;
  enNo?: string;
  openYn?: string;
  koshaConfirm?: string;
  lastDate?: string;
}

export interface MsdsSectionItem {
  msdsItemCode: string;
  upMsdsItemCode?: string;
  msdsItemNameKor?: string;
  itemDetail?: string;
  lev?: string;
  msdsItemNo?: string;
  ordrIdx?: string;
}

export interface FetchSectionsResult {
  sections: Map<number, MsdsSectionItem[]>;
  sectionErrors: Array<{ sectionNo: number; error: string }>;
}

export interface MsdsRequestOptions {
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
}

export class MsdsApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status?: number, details?: unknown) {
    super(`[${code}] ${message}`);
    this.name = "MsdsApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_RETRIES = 1;
const DEFAULT_RETRY_DELAY_MS = 500;

function padSectionNo(sectionNo: number): string {
  return String(sectionNo).padStart(2, "0");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600);
}

/** 서비스가 이용 불가하거나 인증키가 잘못된 경우 — 재시도해도 결과가 같다. */
const FATAL_RESULT_CODES = new Set(["12", "20", "30", "31", "32"]);
/** 일별 요청 한도 초과 */
export const QUOTA_RESULT_CODE = "22";

/**
 * 에러 코드 문자열에서 data.go.kr 결과코드를 뽑아낸다.
 *
 * 코드 형식: `UPSTREAM_RESULT_ERROR:31:기한만료된 서비스키` / `OPENAPI_...:31`
 * 부분 문자열 검색(`code.includes("30")`)을 쓰면 `UPSTREAM_HTTP_530` 같은 값이
 * 인증 오류로 오분류되므로, 콜론으로 구분된 숫자만 인정한다.
 */
export function extractUpstreamResultCode(code: string): string | null {
  const match = code.match(/:(\d{1,3})(?::|$)/);
  return match ? match[1] : null;
}

export function isFatalUpstreamCode(code: string): boolean {
  const resultCode = extractUpstreamResultCode(code);
  return resultCode !== null && FATAL_RESULT_CODES.has(resultCode);
}

export function isQuotaExceededCode(code: string): boolean {
  return code === "QUOTA_EXCEEDED" || extractUpstreamResultCode(code) === QUOTA_RESULT_CODE;
}

function isNonRetryableError(error: unknown): boolean {
  if (error instanceof DataGoXmlError || error instanceof MsdsApiError) {
    return isFatalUpstreamCode(error.code) || isQuotaExceededCode(error.code);
  }
  return false;
}

/**
 * MSDS API 단일 요청 헬퍼 (타임아웃 + 재시도)
 */
export async function requestMsdsXml(
  url: string,
  options: MsdsRequestOptions = {}
): Promise<string> {
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
        if (isRetryableStatus(res.status) && attempt < maxRetries) {
          lastError = new MsdsApiError(
            `UPSTREAM_HTTP_${res.status}`,
            `Upstream HTTP ${res.status}`,
            res.status
          );
          continue;
        }
        const errText = await res.text().catch(() => "");
        throw new MsdsApiError(
          `UPSTREAM_HTTP_${res.status}`,
          `Upstream HTTP ${res.status}: ${errText.slice(0, 100)}`,
          res.status
        );
      }

      const text = await res.text();
      return text;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener("abort", onCallerAbort);
      }

      if (isNonRetryableError(err)) {
        throw err;
      }

      if (isTimedOut) {
        lastError = new MsdsApiError("UPSTREAM_TIMEOUT", `MSDS API timed out after ${timeoutMs}ms`, 504);
      } else {
        lastError = err;
      }

      if (attempt < maxRetries && !isNonRetryableError(lastError)) {
        continue;
      }
    }
  }

  if (lastError instanceof MsdsApiError || lastError instanceof DataGoXmlError) {
    throw lastError;
  }
  throw new MsdsApiError(
    "UPSTREAM_NETWORK_ERROR",
    lastError instanceof Error ? lastError.message : "Unknown upstream error",
    502,
    lastError
  );
}

/**
 * MSDS 물질 목록 검색 (GET /getChemList)
 */
export async function searchChemicals(
  serviceKey: string,
  params: {
    keyword: string;
    condition?: MsdsSearchCondition | string;
    numOfRows?: number;
    pageNo?: number;
  },
  options: MsdsRequestOptions = {}
): Promise<MsdsChemicalSummary[]> {
  const condition = params.condition ?? MsdsSearchCondition.NAME_KO;
  const numOfRows = params.numOfRows ?? 10;
  const pageNo = params.pageNo ?? 1;

  const url = new URL(`${MSDS_BASE_URL}/getChemList`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("searchWrd", params.keyword);
  url.searchParams.set("searchCnd", String(condition));
  url.searchParams.set("numOfRows", String(numOfRows));
  url.searchParams.set("pageNo", String(pageNo));

  try {
    const xml = await requestMsdsXml(url.toString(), options);
    const rawItems = extractXmlItems(xml);

    return rawItems.map((item) => ({
      chemId: String(item.chemId ?? "").trim(), // 선행 0 문자열 유지
      chemNameKor: item.chemNameKor ?? "",
      casNo: item.casNo || undefined,
      unNo: item.unNo || undefined,
      keNo: item.keNo || undefined,
      enNo: item.enNo || undefined,
      openYn: item.openYn || undefined,
      koshaConfirm: item.koshaConfirm || undefined,
      lastDate: item.lastDate || undefined,
    }));
  } catch (err: unknown) {
    if (err instanceof DataGoXmlError) {
      if (isQuotaExceededCode(err.code)) {
        throw new MsdsApiError("QUOTA_EXCEEDED", "Daily request limit exceeded (resultCode=22)", 503, err);
      }
    }
    throw err;
  }
}

/**
 * MSDS 단일 섹션 상세 조회 (GET /getChemDetail01 ~ 16)
 */
export async function fetchChemSection(
  serviceKey: string,
  chemId: string,
  sectionNo: number,
  options: MsdsRequestOptions = {}
): Promise<MsdsSectionItem[]> {
  if (sectionNo < 1 || sectionNo > 16) {
    throw new MsdsApiError("VALIDATION_ERROR", `Invalid MSDS section number: ${sectionNo}`, 400);
  }

  const padded = padSectionNo(sectionNo);
  const url = new URL(`${MSDS_BASE_URL}/getChemDetail${padded}`);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("chemId", chemId);

  try {
    const xml = await requestMsdsXml(url.toString(), options);
    const rawItems = extractXmlItems(xml);

    return rawItems.map((item) => ({
      msdsItemCode: item.msdsItemCode ?? "",
      upMsdsItemCode: item.upMsdsItemCode || undefined,
      msdsItemNameKor: item.msdsItemNameKor || undefined,
      itemDetail: item.itemDetail ?? "",
      lev: item.lev || undefined,
      msdsItemNo: item.msdsItemNo || undefined,
      ordrIdx: item.ordrIdx || undefined,
    }));
  } catch (err: unknown) {
    if (err instanceof DataGoXmlError) {
      if (isQuotaExceededCode(err.code)) {
        throw new MsdsApiError("QUOTA_EXCEEDED", "Daily request limit exceeded (resultCode=22)", 503, err);
      }
    }
    throw err;
  }
}

/**
 * MSDS 다중 섹션 병렬 조회 (부분 실패 허용)
 */
export async function fetchChemSections(
  serviceKey: string,
  chemId: string,
  sectionNos: number[],
  options: MsdsRequestOptions = {}
): Promise<FetchSectionsResult> {
  const sections = new Map<number, MsdsSectionItem[]>();
  const sectionErrors: Array<{ sectionNo: number; error: string }> = [];

  const promises = sectionNos.map(async (sectionNo) => {
    try {
      const items = await fetchChemSection(serviceKey, chemId, sectionNo, options);
      sections.set(sectionNo, items);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      sectionErrors.push({ sectionNo, error: errMsg });
    }
  });

  await Promise.all(promises);

  return {
    sections,
    sectionErrors,
  };
}
