import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/202608200001_risk_assessment_store.sql",
);

function readMigration() {
  return readFileSync(migrationPath, "utf8");
}

describe("risk assessment store migration schema", () => {
  it("creates the four store tables", () => {
    const sql = readMigration();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.risk_assessments");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.risk_assessment_rows");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.risk_assessment_participants");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.risk_assessment_shares");
  });

  it("keeps records for three years and never auto-expires them", () => {
    const sql = readMigration();

    expect(sql).toContain("retain_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 years')");
    // Auto-deletion must not exist: no expires_at column and no TTL cleanup on these tables.
    expect(sql).not.toContain("expires_at");
    expect(sql).not.toMatch(/DELETE\s+FROM\s+public\.risk_assessments/i);
  });

  it("reserves owner_id so authentication can replace scope_hash additively", () => {
    const sql = readMigration();

    expect(sql).toContain("owner_id UUID");
    expect(sql).toContain("idx_risk_assessments_owner_updated");
  });

  it("constrains acceptability, post-risk and improvement status on rows", () => {
    const sql = readMigration();

    expect(sql).toContain("risk_assessment_rows_acceptability_check");
    expect(sql).toContain("risk_assessment_rows_post_acceptability_check");
    expect(sql).toContain("risk_assessment_rows_improvement_status_check");
    expect(sql).toContain("risk_assessment_rows_post_frequency_range");
    expect(sql).toContain("risk_assessment_rows_post_severity_range");
    expect(sql).toContain("risk_assessment_rows_unique_index UNIQUE (assessment_id, row_index)");
  });

  it("indexes open improvements for follow-up queries", () => {
    const sql = readMigration();

    expect(sql).toContain("idx_risk_assessment_rows_open_improvements");
    expect(sql).toContain("WHERE improvement_status <> 'done'");
  });

  it("constrains participant roles and share phases to the statutory values", () => {
    const sql = readMigration();

    expect(sql).toContain("risk_assessment_participants_role_check");
    expect(sql).toContain("'worker', 'worker_representative', 'manager', 'supervisor'");
    expect(sql).toContain("risk_assessment_participants_method_check");
    expect(sql).toContain("'site_patrol', 'survey', 'interview', 'other'");
    expect(sql).toContain("risk_assessment_shares_phase_check");
    expect(sql).toContain("'before', 'after'");
  });

  it("cascades child rows and enables row level security", () => {
    const sql = readMigration();

    const cascadeCount = sql.match(/ON DELETE CASCADE/g) ?? [];
    expect(cascadeCount.length).toBe(3);

    expect(sql).toContain("ALTER TABLE public.risk_assessments             ENABLE ROW LEVEL SECURITY;");
    expect(sql).toContain("ALTER TABLE public.risk_assessment_rows         ENABLE ROW LEVEL SECURITY;");
    expect(sql).toContain("ALTER TABLE public.risk_assessment_participants ENABLE ROW LEVEL SECURITY;");
    expect(sql).toContain("ALTER TABLE public.risk_assessment_shares       ENABLE ROW LEVEL SECURITY;");
  });

  it("leaves the Form Center snapshot table untouched", () => {
    const sql = readMigration();

    expect(sql).not.toMatch(/ALTER TABLE public\.risk_assessment_history/);
    expect(sql).not.toMatch(/DROP TABLE[\s\S]*risk_assessment_history/);
  });
});
