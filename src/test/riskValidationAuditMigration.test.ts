import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("risk validation audit migration schema", () => {
  it("defines history validation columns with jsonb constraints", () => {
    const migrationPath = resolve(
      process.cwd(),
      "supabase/migrations/202604170001_risk_row_validation_audit.sql",
    );
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS validation_summary JSONB NOT NULL");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS validation_events JSONB NOT NULL");
    expect(sql).toContain("risk_assessment_history_validation_summary_object");
    expect(sql).toContain("risk_assessment_history_validation_events_array");
  });

  it("creates risk_row_validation_audit table with required constraints", () => {
    const migrationPath = resolve(
      process.cwd(),
      "supabase/migrations/202604170001_risk_row_validation_audit.sql",
    );
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.risk_row_validation_audit");
    expect(sql).toContain("risk_row_validation_audit_form_type_check");
    expect(sql).toContain("risk_row_validation_audit_final_status_check");
    expect(sql).toContain("risk_row_validation_audit_metadata_object");
  });
});

