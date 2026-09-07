import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readMigration() {
  const directory = resolve(process.cwd(), "supabase/migrations");
  const filename = readdirSync(directory).find((name) => name.endsWith("_user_account_work_history.sql"));
  expect(filename, "user_account_work_history migration must exist").toBeTruthy();
  const path = resolve(directory, filename ?? "missing.sql");
  expect(existsSync(path)).toBe(true);
  return readFileSync(path, "utf8");
}

describe("사용자별 작업 기록 migration", () => {
  it("서식센터·사고 예측·화학물질 스캔을 한 사용자 기록 테이블에 저장한다", () => {
    const sql = readMigration();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.user_work_history");
    expect(sql).toContain("'form-risk-assessment'");
    expect(sql).toContain("'form-accident-report'");
    expect(sql).toContain("'accident-prediction'");
    expect(sql).toContain("'chemical-scan'");
    expect(sql).toContain("input_payload JSONB");
    expect(sql).toContain("result_payload JSONB");
  });

  it("auth.uid 소유권과 명시적 Data API 권한으로 모든 CRUD를 격리한다", () => {
    const sql = readMigration();

    expect(sql).toMatch(/user_id UUID NOT NULL DEFAULT auth\.uid\(\)/i);
    expect(sql).toMatch(/REFERENCES auth\.users\(id\) ON DELETE CASCADE/i);
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON public\.user_work_history TO authenticated/i);
    expect(sql.match(/\(select auth\.uid\(\)\) = user_id/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("주 위험성평가 테이블과 하위 테이블에도 계정 소유권 정책을 둔다", () => {
    const sql = readMigration();

    expect(sql).toContain("risk_assessments_owner_id_fkey");
    expect(sql).toContain("risk_assessments_select_own");
    expect(sql).toContain("risk_assessments_insert_own");
    expect(sql).toContain("risk_assessments_update_own");
    expect(sql).toContain("risk_assessments_delete_own");
    expect(sql).toContain("risk_assessment_rows_select_own");
    expect(sql).toContain("risk_assessment_participants_select_own");
    expect(sql).toContain("risk_assessment_shares_select_own");
  });
});
