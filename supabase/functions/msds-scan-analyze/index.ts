import {
  handlePreflight,
  jsonResponse,
  errorResponse,
  parseJsonBody,
  withErrorBoundary,
} from "../_shared/http.ts";
import {
  fetchChemSections,
  MsdsSectionItem,
  MsdsApiError,
  isFatalUpstreamCode,
} from "../_shared/msds-api.ts";
import {
  normalizeHazardSection,
  normalizeFirstAidSection,
  normalizePpeSection,
  normalizeRegulationSection,
  buildMsdsSectionTree,
  HazardSection,
  FirstAidSection,
  PpeSection,
  RegulationSection,
  MsdsSectionTree,
  PpePart,
} from "../_shared/msds-sections.ts";
import { fetchGhsSubstance, GhsSubstanceDetail } from "../_shared/ghs-api.ts";
import {
  getCachedSubstance,
  upsertSubstance,
  getCachedSections,
  upsertSections,
  isSectionCacheStale,
  getCachedGhs,
  upsertGhs,
} from "../_shared/msds-cache.ts";
import { resolveChemical, ResolvedSubstance, ChemCandidate } from "../_shared/chem-resolution.ts";
import { extractFromImage, VisionExtractionResult } from "../_shared/scan-vision.ts";
import { crossCheckLabelWithOfficialRecord, DiscrepancyItem } from "../_shared/scan-crosscheck.ts";
import { readEnv } from "../_shared/runtime-env.ts";
import type { SupabaseLike } from "../_shared/supabase-client-types.ts";

export const MSDS_DISCLAIMER =
  "본 정보는 안전보건공단 화학물질정보시스템 자료를 바탕으로 한 참고용입니다.\n" +
  "산업안전보건법 제110조·제111조에 따라 MSDS의 작성·제공은 화학물질 제조·수입자의 의무이며,\n" +
  "실제 작업 시에는 반드시 현장에 비치된 MSDS 원본을 확인하십시오.";

/**
 * 라벨/문서에서 읽어낸 값.
 * image 모드에서는 Gemini 판독 결과, text 모드에서는 입력 텍스트만 채워진다.
 */
export type LabelExtraction = Partial<VisionExtractionResult> & { rawText: string };

export interface ScanRequest {
  mode: "text" | "image";
  text?: string;
  image?: string;
  mimeType?: "image/jpeg" | "image/png";
  hint?: { productName?: string; casNo?: string };
  selectedChemId?: string;
}

export interface PpeChecklistItem {
  part: PpePart;
  requirement: string;
  sourceItemCode: string;
}

export interface ScanResponse {
  docType: "ghs_label" | "msds" | "work_order" | "warning_sign" | "unknown";
  extraction: LabelExtraction;
  substance: ResolvedSubstance | null;
  needsUserSelection?: { candidates: ChemCandidate[]; reason?: string };
  hazard?: HazardSection;
  firstAid?: FirstAidSection;
  handling?: MsdsSectionTree;
  ppe?: PpeSection;
  regulation?: RegulationSection;
  ppeChecklist: PpeChecklistItem[];
  discrepancies: DiscrepancyItem[];
  sources: Array<{ label: string; api: string; url: string; retrievedAt: string }>;
  disclaimer: string;
  meta: {
    servedFromCache: boolean;
    quotaExceeded?: boolean;
    sectionErrors?: Array<{ sectionNo: number; error: string }>;
    lowConfidence?: boolean;
    warnings?: string[];
  };
}

export interface HandleOptions {
  supabaseClient?: SupabaseLike | null;
  mockVisionResult?: VisionExtractionResult;
}

function resolveServiceKey(): string {
  return readEnv("DATA_GO_KR_API_KEY", "DATA_GO_API_KEY", "PUBLIC_DATA_API_KEY", "VITE_DATA_GO_KR_API_KEY");
}

function resolveGeminiKey(): string {
  return readEnv("GEMINI_API_KEY", "GOOGLE_API_KEY", "VITE_GEMINI_API_KEY");
}

async function createSupabaseClientFallback(): Promise<SupabaseLike | null> {
  const url = readEnv("SUPABASE_URL");
  const key = readEnv("SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY");
  if (!url || !key) return null;

  try {
    // Deno 전용 원격 모듈. 번들러/tsc 가 정적으로 해석하지 않도록 변수를 거쳐 import 한다.
    const specifier = "https://esm.sh/@supabase/supabase-js@2";
    const mod = (await import(specifier)) as {
      createClient: (url: string, key: string) => SupabaseLike;
    };
    return mod.createClient(url, key);
  } catch {
    // Node(vitest) 등 원격 import 가 불가능한 환경 — 캐시 없이 동작한다.
    return null;
  }
}

export async function handleMsdsScanAnalyze(
  req: Request,
  options: HandleOptions = {}
): Promise<Response> {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return errorResponse(405, "METHOD_NOT_ALLOWED", "Only POST method is allowed.");
  }

  const body = await parseJsonBody<ScanRequest>(req);
  if (!body || typeof body !== "object") {
    return errorResponse(400, "VALIDATION_ERROR", "Request body is required and must be JSON.");
  }

  const mode = body.mode || "text";
  const warnings: string[] = [];

  const serviceKey = resolveServiceKey();
  if (!serviceKey) {
    return errorResponse(503, "MISSING_SECRET:DATA_GO_KR_API_KEY", "DATA_GO_KR_API_KEY secret is not configured.");
  }

  const sb = options.supabaseClient || (await createSupabaseClientFallback());

  // 1) 이미지 또는 텍스트 기반 추출
  let extraction: LabelExtraction = {
    rawText: body.text || "",
    casNumbers: [],
    pictograms: [],
    confidence: 1.0,
    docType: "unknown",
  };

  if (mode === "image") {
    if (!body.image) {
      return errorResponse(400, "VALIDATION_ERROR", "Image base64 data is required for mode='image'.");
    }

    if (options.mockVisionResult) {
      extraction = options.mockVisionResult;
    } else {
      const geminiKey = resolveGeminiKey();
      if (!geminiKey) {
        return errorResponse(503, "MISSING_SECRET:GEMINI_API_KEY", "GEMINI_API_KEY secret is not configured for image mode.");
      }

      try {
        extraction = await extractFromImage(
          geminiKey,
          body.image,
          body.mimeType || "image/jpeg"
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResponse(502, "VISION_FAILED", `Gemini vision extraction failed: ${msg}`);
      }
    }
  }

  // 2) 물질 식별 / 확정 (Chemical Resolution)
  let resolutionResult;
  try {
    const rawTextCombined = [
      extraction.rawText,
      body.text,
      (extraction.casNumbers || []).join(" "),
      extraction.productName,
    ]
      .filter(Boolean)
      .join(" ");

    resolutionResult = await resolveChemical(
      {
        rawText: rawTextCombined,
        productName: extraction.productName || body.hint?.productName,
        casNo: extraction.casNumbers?.[0] || body.hint?.casNo,
      },
      {
        serviceKey,
        selectedChemId: body.selectedChemId,
      }
    );
  } catch (err: unknown) {
    if (err instanceof MsdsApiError && isFatalUpstreamCode(err.code)) {
      return errorResponse(503, "UPSTREAM_AUTH_ERROR", "Public data API key is expired or invalid.");
    }
    const msg = err instanceof Error ? err.message : String(err);
    return errorResponse(502, "UPSTREAM_NETWORK_ERROR", msg || "Failed to resolve chemical");
  }

  if (resolutionResult.warnings) {
    warnings.push(...resolutionResult.warnings);
  }

  // 2-1) 다중 매칭 사용자 선택 요구 시
  if (resolutionResult.needsUserSelection) {
    const response: ScanResponse = {
      docType: extraction.docType || "unknown",
      extraction,
      substance: null,
      needsUserSelection: resolutionResult.needsUserSelection,
      ppeChecklist: [],
      discrepancies: [],
      sources: [],
      disclaimer: MSDS_DISCLAIMER,
      meta: {
        servedFromCache: false,
        warnings,
      },
    };
    return jsonResponse(response, 200, { "x-risk-guard-source": "msds-scan-analyze" });
  }

  // 2-2) 물질 미특정 시
  const substance = resolutionResult.substance;
  if (!substance) {
    const response: ScanResponse = {
      docType: extraction.docType || "unknown",
      extraction,
      substance: null,
      ppeChecklist: [],
      discrepancies: [],
      sources: [],
      disclaimer: MSDS_DISCLAIMER,
      meta: {
        servedFromCache: false,
        warnings,
      },
    };
    return jsonResponse(response, 200, { "x-risk-guard-source": "msds-scan-analyze" });
  }

  // 3) MSDS 섹션 데이터 조회 (2, 4, 7, 8, 15)
  const targetSections = [2, 4, 7, 8, 15];
  let servedFromCache = false;
  let quotaExceeded = false;
  const sectionItemsMap = new Map<number, MsdsSectionItem[]>();
  const sectionErrors: Array<{ sectionNo: number; error: string }> = [];

  let cachedSubstance = null;
  if (sb) {
    cachedSubstance = await getCachedSubstance(sb, substance.chemId);
  }

  const isStale = isSectionCacheStale(cachedSubstance, substance.lastDate);
  if (!isStale && sb) {
    const cachedMap = await getCachedSections(sb, substance.chemId, targetSections);
    if (cachedMap.size === targetSections.length) {
      servedFromCache = true;
      for (const [sNo, payload] of cachedMap.entries()) {
        sectionItemsMap.set(sNo, payload);
      }
    }
  }

  if (sectionItemsMap.size < targetSections.length) {
    const missingSections = targetSections.filter((sNo) => !sectionItemsMap.has(sNo));
    try {
      const fetchRes = await fetchChemSections(serviceKey, substance.chemId, missingSections);
      for (const [sNo, items] of fetchRes.sections.entries()) {
        sectionItemsMap.set(sNo, items);
      }
      if (fetchRes.sectionErrors.length > 0) {
        sectionErrors.push(...fetchRes.sectionErrors);
      }

      if (sb && fetchRes.sections.size > 0) {
        await upsertSubstance(sb, {
          chem_id: substance.chemId,
          chem_name_kor: substance.chemNameKor,
          cas_no: substance.casNo,
          un_no: substance.unNo,
          last_date: substance.lastDate,
        });
        await upsertSections(sb, substance.chemId, fetchRes.sections);
      }
    } catch (err: unknown) {
      if (err instanceof MsdsApiError && err.code === "QUOTA_EXCEEDED") {
        quotaExceeded = true;
        if (sb) {
          const cachedMap = await getCachedSections(sb, substance.chemId, targetSections);
          if (cachedMap.size > 0) {
            servedFromCache = true;
            for (const [sNo, payload] of cachedMap.entries()) {
              sectionItemsMap.set(sNo, payload as MsdsSectionItem[]);
            }
          }
        }
        if (sectionItemsMap.size === 0) {
          return errorResponse(503, "QUOTA_EXCEEDED", "Daily API quota exceeded and no cached data is available.");
        }
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`Section fetch error: ${msg}`);
      }
    }
  }

  // 4) GHS API 교차검증 기준값 조회
  let ghsDetail: GhsSubstanceDetail | null = null;
  if (substance.casNo) {
    if (sb) {
      const cachedGhsRow = await getCachedGhs(sb, substance.casNo);
      if (cachedGhsRow) {
        ghsDetail = {
          casNo: cachedGhsRow.cas_no,
          sbstnId: cachedGhsRow.sbstn_id || undefined,
          signalWord: cachedGhsRow.signal_word || undefined,
          pictograms: cachedGhsRow.pictogram_cd || [],
          unNo: cachedGhsRow.un_no || undefined,
          hazardList: (cachedGhsRow.hazard_list as GhsSubstanceDetail["hazardList"]) || [],
        };
      }
    }

    if (!ghsDetail) {
      try {
        ghsDetail = await fetchGhsSubstance(serviceKey, substance.casNo);
        if (ghsDetail && sb) {
          await upsertGhs(sb, {
            cas_no: substance.casNo,
            sbstn_id: ghsDetail.sbstnId,
            signal_word: ghsDetail.signalWord,
            pictogram_cd: ghsDetail.pictograms,
            un_no: ghsDetail.unNo,
            hazard_list: ghsDetail.hazardList,
          });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        warnings.push(`GHS crosscheck query failed: ${msg}`);
      }
    }
  }

  // 5) 섹션별 정규화
  const sec02Items = sectionItemsMap.get(2) || [];
  const sec04Items = sectionItemsMap.get(4) || [];
  const sec07Items = sectionItemsMap.get(7) || [];
  const sec08Items = sectionItemsMap.get(8) || [];
  const sec15Items = sectionItemsMap.get(15) || [];

  const hazard = sec02Items.length > 0 ? normalizeHazardSection(sec02Items, { warnings }) : undefined;
  const firstAid = sec04Items.length > 0 ? normalizeFirstAidSection(sec04Items) : undefined;
  const handling = sec07Items.length > 0 ? buildMsdsSectionTree(7, sec07Items) : undefined;
  const ppe = sec08Items.length > 0 ? normalizePpeSection(sec08Items) : undefined;
  const regulation = sec15Items.length > 0 ? normalizeRegulationSection(sec15Items) : undefined;

  // 6) 교차검증 (Discrepancy Cross-Check)
  // 라벨 사진을 판독한 image 모드에서만 의미가 있다.
  // text 모드는 비교할 라벨이 없으므로 검증을 돌리지 않는다.
  const crossCheck =
    mode === "image"
      ? crossCheckLabelWithOfficialRecord({
          extraction,
          hazardSection: hazard,
          ghsDetail,
          officialProductName: substance.chemNameKor,
        })
      : { discrepancies: [], isLowConfidence: false, warnings: [] as string[] };
  const discrepancies = crossCheck.discrepancies;
  if (crossCheck.warnings) {
    warnings.push(...crossCheck.warnings);
  }

  // 7) 보호구 체크리스트 생성
  const ppeChecklist: PpeChecklistItem[] = [];
  if (ppe) {
    const parts: Array<{ part: PpePart; code: string; label: string }> = [
      { part: "respiratory", code: "H0602", label: "호흡기" },
      { part: "eye", code: "H0604", label: "눈" },
      { part: "hand", code: "H0606", label: "손" },
      { part: "body", code: "H0608", label: "신체" },
    ];

    for (const p of parts) {
      const items = ppe.ppe[p.part];
      const requirement = items && items.length > 0 ? items.join(" / ") : "자료없음 (안전관리자 확인 필요)";
      ppeChecklist.push({
        part: p.part,
        requirement,
        sourceItemCode: p.code,
      });
    }
  }

  // 8) 출처 구성
  const sources = [
    {
      label: "안전보건공단 화학물질정보 (MSDS)",
      api: "KOSHA MSDS OpenAPI",
      url: "https://msds.kosha.or.kr",
      retrievedAt: new Date().toISOString(),
    },
  ];
  if (ghsDetail) {
    sources.push({
      label: "화학물질정보처리시스템 (NCIS)",
      api: "ME GHS OpenAPI",
      url: "https://ncis.nier.go.kr",
      retrievedAt: new Date().toISOString(),
    });
  }

  const response: ScanResponse = {
    docType: extraction.docType || "msds",
    extraction,
    substance,
    hazard,
    firstAid,
    handling,
    ppe,
    regulation,
    ppeChecklist,
    discrepancies,
    sources,
    disclaimer: MSDS_DISCLAIMER,
    meta: {
      servedFromCache,
      quotaExceeded: quotaExceeded || undefined,
      sectionErrors: sectionErrors.length > 0 ? sectionErrors : undefined,
      lowConfidence: crossCheck.isLowConfidence || undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
  };

  return jsonResponse(response, 200, { "x-risk-guard-source": "msds-scan-analyze" });
}

// Deno 환경에서만 서버를 띄운다. vitest(Node)에서는 핸들러만 import 해서 직접 호출한다.
//
// 여기서 `declare const Deno` 로 전역을 다시 선언하면 진짜 Deno 네임스페이스를 가려서
// 위쪽 resolveServiceKey() 의 `Deno.env` 가 타입 오류가 된다. globalThis 를 통해 접근한다.
type DenoServeGlobal = {
  serve?: (handler: (req: Request) => Promise<Response> | Response) => unknown;
};
const denoRuntime = (globalThis as { Deno?: DenoServeGlobal }).Deno;
// 검증 스크립트(scripts/verify-scan-image.ts)는 핸들러만 쓰므로 서버를 띄우지 않는다.
// 운영에서는 이 변수를 설정하지 않기 때문에 배포 동작은 그대로다.
if (denoRuntime?.serve && readEnv("MSDS_SCAN_DISABLE_SERVE") !== "1") {
  denoRuntime.serve(withErrorBoundary(handleMsdsScanAnalyze, "msds-scan-analyze"));
}
