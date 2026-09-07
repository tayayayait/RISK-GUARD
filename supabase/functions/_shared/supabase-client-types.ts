/**
 * Edge Function 이 실제로 쓰는 만큼만 정의한 최소 Supabase 클라이언트 표면.
 *
 * `@supabase/supabase-js` 는 Deno 전용 원격 모듈이라 브라우저용 tsconfig 에서
 * 해석되지 않는다. 그래서 타입을 여기에 직접 좁혀 두고, `any` 대신 이 타입을 쓴다.
 * (느슨한 `any` 때문에 upsert 컬럼명이 `unNo`/`un_no` 로 어긋나도 컴파일이
 *  통과했던 전례가 있다.)
 */

export interface SupabaseResult<T> {
  data: T | null;
  error: unknown;
}

export interface SupabaseSelectBuilder<T> extends PromiseLike<SupabaseResult<T[]>> {
  eq(column: string, value: unknown): SupabaseSelectBuilder<T>;
  in(column: string, values: readonly unknown[]): SupabaseSelectBuilder<T>;
  maybeSingle(): PromiseLike<SupabaseResult<T>>;
  single(): PromiseLike<SupabaseResult<T>>;
}

export interface SupabaseTableBuilder {
  select<T = Record<string, unknown>>(columns?: string): SupabaseSelectBuilder<T>;
  upsert(
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string },
  ): PromiseLike<{ error: unknown }>;
  insert(
    values: Record<string, unknown> | Record<string, unknown>[],
  ): PromiseLike<{ error: unknown }>;
}

export interface SupabaseLike {
  from(table: string): SupabaseTableBuilder;
}
