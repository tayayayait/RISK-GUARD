import { getSupabaseClient } from "@/integrations/supabase/client";

export type UserWorkFeature =
  | "form-risk-assessment"
  | "form-accident-report"
  | "accident-prediction"
  | "chemical-scan";

export interface UserWorkRecordSummary {
  id: string;
  feature: UserWorkFeature;
  title: string;
  subtitle: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserWorkRecordDetail<TInput = Record<string, unknown>, TResult = Record<string, unknown>>
  extends UserWorkRecordSummary {
  input: TInput;
  result: TResult;
}

export interface UserWorkRecordCreate<TInput, TResult> {
  feature: UserWorkFeature;
  title: string;
  subtitle?: string;
  input: TInput;
  result: TResult;
}

const SUMMARY_COLUMNS = "id, feature, title, subtitle, created_at, updated_at";
const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, input_payload, result_payload`;
const FEATURES: UserWorkFeature[] = [
  "form-risk-assessment",
  "form-accident-report",
  "accident-prediction",
  "chemical-scan",
];

function normalizeFeatures(features?: UserWorkFeature | UserWorkFeature[]) {
  if (!features) {
    return [];
  }
  return Array.isArray(features) ? [...new Set(features)] : [features];
}

function toSummary(value: unknown): UserWorkRecordSummary {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const feature = typeof row.feature === "string" && FEATURES.includes(row.feature as UserWorkFeature)
    ? row.feature as UserWorkFeature
    : null;
  const id = typeof row.id === "string" ? row.id : "";
  if (!id || !feature) {
    throw new Error("USER_WORK_HISTORY_INVALID_RESPONSE");
  }
  return {
    id,
    feature,
    title: typeof row.title === "string" ? row.title : "",
    subtitle: typeof row.subtitle === "string" ? row.subtitle : "",
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : "",
  };
}

function toDetail<TInput, TResult>(value: unknown): UserWorkRecordDetail<TInput, TResult> {
  const summary = toSummary(value);
  const row = value as Record<string, unknown>;
  return {
    ...summary,
    input: (row.input_payload ?? {}) as TInput,
    result: (row.result_payload ?? {}) as TResult,
  };
}

function normalizeRecordId(recordId: string) {
  const id = recordId.trim();
  if (!id) {
    throw new Error("USER_WORK_HISTORY_INVALID_RECORD_ID");
  }
  return id;
}

function applyFeatureFilter<T extends { eq: (...args: unknown[]) => T; in: (...args: unknown[]) => T }>(
  query: T,
  features?: UserWorkFeature | UserWorkFeature[],
) {
  const normalized = normalizeFeatures(features);
  if (normalized.length === 1) {
    return query.eq("feature", normalized[0]);
  }
  if (normalized.length > 1) {
    return query.in("feature", normalized);
  }
  return query;
}

export const UserWorkHistoryService = {
  async create<TInput extends object, TResult extends object>(
    payload: UserWorkRecordCreate<TInput, TResult>,
  ): Promise<UserWorkRecordDetail<TInput, TResult>> {
    const title = payload.title.trim();
    if (!title) {
      throw new Error("USER_WORK_HISTORY_TITLE_REQUIRED");
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("user_work_history")
      .insert({
        feature: payload.feature,
        title: title.slice(0, 160),
        subtitle: (payload.subtitle ?? "").trim().slice(0, 240),
        input_payload: payload.input,
        result_payload: payload.result,
      })
      .select(DETAIL_COLUMNS)
      .single();

    if (error || !data) {
      throw new Error(`USER_WORK_HISTORY_CREATE_FAILED:${error?.message ?? "No row returned"}`);
    }
    return toDetail<TInput, TResult>(data);
  },

  async list(features?: UserWorkFeature | UserWorkFeature[], limit = 50) {
    const client = getSupabaseClient();
    let query = client.from("user_work_history").select(DETAIL_COLUMNS);
    query = applyFeatureFilter(query as never, features) as typeof query;
    const { data, error } = await query
      .order("updated_at", { ascending: false })
      .limit(Math.min(100, Math.max(1, Math.round(limit))));

    if (error) {
      throw new Error(`USER_WORK_HISTORY_LIST_FAILED:${error.message}`);
    }
    return (data ?? []).map((item) => toDetail<Record<string, unknown>, Record<string, unknown>>(item));
  },

  async get<TInput = Record<string, unknown>, TResult = Record<string, unknown>>(
    recordId: string,
    features?: UserWorkFeature | UserWorkFeature[],
  ): Promise<UserWorkRecordDetail<TInput, TResult>> {
    const client = getSupabaseClient();
    let query = client
      .from("user_work_history")
      .select(DETAIL_COLUMNS)
      .eq("id", normalizeRecordId(recordId));
    query = applyFeatureFilter(query as never, features) as typeof query;
    const { data, error } = await query.maybeSingle();

    if (error) {
      throw new Error(`USER_WORK_HISTORY_GET_FAILED:${error.message}`);
    }
    if (!data) {
      throw new Error("USER_WORK_HISTORY_NOT_FOUND");
    }
    return toDetail<TInput, TResult>(data);
  },

  async remove(recordId: string, features?: UserWorkFeature | UserWorkFeature[]) {
    const client = getSupabaseClient();
    let query = client
      .from("user_work_history")
      .delete()
      .eq("id", normalizeRecordId(recordId));
    query = applyFeatureFilter(query as never, features) as typeof query;
    const { data, error } = await query.select("id").maybeSingle();

    if (error) {
      throw new Error(`USER_WORK_HISTORY_DELETE_FAILED:${error.message}`);
    }
    if (!data) {
      throw new Error("USER_WORK_HISTORY_NOT_FOUND");
    }
  },
};
