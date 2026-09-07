import type { SupabaseLike } from "./supabase-client-types.ts";
import type { MsdsSectionItem } from "./msds-api.ts";

/**
 * 화학물질 및 MSDS 섹션 캐시 유틸리티
 */

export interface CachedSubstance {
  chem_id: string;
  chem_name_kor: string;
  cas_no?: string | null;
  un_no?: string | null;
  ke_no?: string | null;
  en_no?: string | null;
  last_date?: string | null;
  fetched_at: string;
}

export interface CachedSection {
  chem_id: string;
  section_no: number;
  payload: unknown;
  fetched_at: string;
}

export interface CachedGhs {
  cas_no: string;
  sbstn_id?: string | null;
  signal_word?: string | null;
  pictogram_cd?: string[] | null;
  un_no?: string | null;
  hazard_list?: unknown;
  fetched_at: string;
}

export const SUBSTANCE_TTL_DAYS = 30;
export const GHS_TTL_DAYS = 90;

/**
 * 주어진 fetchedAt(ISO string)이 TTL(일 단위)을 초과했는지 판정
 */
export function isTtlExpired(fetchedAtIso: string, ttlDays: number): boolean {
  if (!fetchedAtIso) return true;
  const fetchedTime = new Date(fetchedAtIso).getTime();
  if (Number.isNaN(fetchedTime)) return true;
  const now = Date.now();
  const maxAgeMs = ttlDays * 24 * 60 * 60 * 1000;
  return now - fetchedTime > maxAgeMs;
}

/**
 * 섹션 캐시 무효화 여부 판정:
 * 공단 getChemList의 lastDate가 캐시된 lastDate와 다르면 stale로 판정
 */
export function isSectionCacheStale(
  cachedSubstance: { last_date?: string | null } | null | undefined,
  freshLastDate?: string | null
): boolean {
  if (!cachedSubstance) return true;
  if (!freshLastDate) return false; // 새 lastDate 정보가 없으면 기존 캐시 유지
  if (!cachedSubstance.last_date) return true;
  return cachedSubstance.last_date !== freshLastDate;
}

/**
 * chem_id로 물질 마스터 캐시 조회
 */
export async function getCachedSubstance(
  supabaseClient: SupabaseLike | null,
  chemId: string
): Promise<CachedSubstance | null> {
  if (!supabaseClient || !chemId) return null;
  try {
    const { data, error } = await supabaseClient
      .from("chem_substance")
      .select<CachedSubstance>("*")
      .eq("chem_id", chemId)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * cas_no로 물질 마스터 캐시 조회
 */
export async function findCachedByCas(
  supabaseClient: SupabaseLike | null,
  casNo: string
): Promise<CachedSubstance | null> {
  if (!supabaseClient || !casNo) return null;
  try {
    const { data, error } = await supabaseClient
      .from("chem_substance")
      .select<CachedSubstance>("*")
      .eq("cas_no", casNo)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * 물질 마스터 캐시 저장/갱신
 */
export async function upsertSubstance(
  supabaseClient: SupabaseLike | null,
  row: {
    chem_id: string;
    chem_name_kor: string;
    cas_no?: string;
    un_no?: string;
    ke_no?: string;
    en_no?: string;
    last_date?: string;
  }
): Promise<void> {
  if (!supabaseClient || !row.chem_id) return;
  try {
    await supabaseClient.from("chem_substance").upsert(
      {
        chem_id: row.chem_id,
        chem_name_kor: row.chem_name_kor,
        cas_no: row.cas_no || null,
        un_no: row.un_no || null,
        ke_no: row.ke_no || null,
        en_no: row.en_no || null,
        last_date: row.last_date || null,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "chem_id" }
    );
  } catch {
    // 캐시 저장 실패는 무시하고 계속 진행
  }
}

/**
 * 섹션 원문 캐시 조회
 */
export async function getCachedSections(
  supabaseClient: SupabaseLike | null,
  chemId: string,
  sectionNos: number[]
): Promise<Map<number, MsdsSectionItem[]>> {
  const result = new Map<number, MsdsSectionItem[]>();
  if (!supabaseClient || !chemId || sectionNos.length === 0) return result;

  try {
    const { data, error } = await supabaseClient
      .from("chem_section")
      .select<{ section_no: unknown; payload: unknown }>("section_no, payload")
      .eq("chem_id", chemId)
      .in("section_no", sectionNos);

    if (error || !data) return result;

    for (const row of data) {
      if (typeof row.section_no === "number" && Array.isArray(row.payload)) {
        result.set(row.section_no, row.payload);
      }
    }
    return result;
  } catch {
    return result;
  }
}

/**
 * 섹션 원문 캐시 저장/갱신
 */
export async function upsertSections(
  supabaseClient: SupabaseLike | null,
  chemId: string,
  sections: Map<number, MsdsSectionItem[]> | Array<{ sectionNo: number; payload: MsdsSectionItem[] }>
): Promise<void> {
  if (!supabaseClient || !chemId) return;

  const entries: Array<{ chem_id: string; section_no: number; payload: unknown; fetched_at: string }> = [];
  const now = new Date().toISOString();

  if (sections instanceof Map) {
    for (const [sectionNo, payload] of sections.entries()) {
      entries.push({
        chem_id: chemId,
        section_no: sectionNo,
        payload,
        fetched_at: now,
      });
    }
  } else if (Array.isArray(sections)) {
    for (const item of sections) {
      entries.push({
        chem_id: chemId,
        section_no: item.sectionNo,
        payload: item.payload,
        fetched_at: now,
      });
    }
  }

  if (entries.length === 0) return;

  try {
    await supabaseClient
      .from("chem_section")
      .upsert(entries, { onConflict: "chem_id,section_no" });
  } catch {
    // 캐시 쓰기 실패 무시
  }
}

/**
 * GHS 교차검증 기준값 캐시 조회
 */
export async function getCachedGhs(
  supabaseClient: SupabaseLike | null,
  casNo: string
): Promise<CachedGhs | null> {
  if (!supabaseClient || !casNo) return null;
  try {
    const { data, error } = await supabaseClient
      .from("chem_ghs")
      .select<CachedGhs>("*")
      .eq("cas_no", casNo)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * GHS 교차검증 기준값 캐시 저장/갱신
 */
export async function upsertGhs(
  supabaseClient: SupabaseLike | null,
  row: {
    cas_no: string;
    sbstn_id?: string;
    signal_word?: string;
    pictogram_cd?: string[];
    un_no?: string;
    hazard_list?: unknown;
  }
): Promise<void> {
  if (!supabaseClient || !row.cas_no) return;
  try {
    await supabaseClient.from("chem_ghs").upsert(
      {
        cas_no: row.cas_no,
        sbstn_id: row.sbstn_id || null,
        signal_word: row.signal_word || null,
        pictogram_cd: row.pictogram_cd || [],
        un_no: row.un_no || null,
        hazard_list: row.hazard_list || [],
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "cas_no" }
    );
  } catch {
    // 무시
  }
}
