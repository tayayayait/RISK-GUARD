-- Risk assessment store: durable home for the main assessment flow.
--
-- Relationship to public.risk_assessment_history:
--   risk_assessment_history  = Form Center SNAPSHOT (create/list/get/delete, 30-day expiry).
--                              Still used by the accident-report template and existing Form Center
--                              history. NOT modified or deprecated here.
--   risk_assessments (below)  = Main flow LIVING DOCUMENT. Rows stay editable after confirmation so
--                              that improvement follow-up (owner / due date / completion) can be
--                              updated for weeks after the assessment itself is finished.
--
-- Retention: 산업안전보건법 제36조제5항 + 시행규칙 제37조의4제2항 require 3-year retention.
--   retain_until is an INFORMATIONAL marker only. These tables deliberately carry no expiry
--   column and no purge job: records must never be auto-deleted, and losing the browser-side
--   scope key must never delete server-side data.

-- ---------------------------------------------------------------------------
-- Header
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_hash TEXT NOT NULL,
  owner_id UUID,
  task_name TEXT NOT NULL,
  task_description TEXT NOT NULL DEFAULT '',
  site_name TEXT NOT NULL DEFAULT '',
  work_date DATE,
  industry TEXT NOT NULL DEFAULT '',
  work_location TEXT NOT NULL DEFAULT '',
  evaluator TEXT NOT NULL DEFAULT '',
  reference_score INTEGER,
  reference_level TEXT,
  analysis_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retain_until TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '3 years'),
  CONSTRAINT risk_assessments_scope_hash_length CHECK (char_length(scope_hash) >= 32),
  CONSTRAINT risk_assessments_task_name_length CHECK (char_length(task_name) BETWEEN 1 AND 120),
  CONSTRAINT risk_assessments_status_check CHECK (status IN ('draft', 'confirmed', 'archived')),
  CONSTRAINT risk_assessments_reference_score_range
    CHECK (reference_score IS NULL OR reference_score BETWEEN 0 AND 100),
  CONSTRAINT risk_assessments_reference_level_check
    CHECK (reference_level IS NULL OR reference_level IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT risk_assessments_analysis_snapshot_object
    CHECK (jsonb_typeof(analysis_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_scope_updated
  ON public.risk_assessments (scope_hash, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_owner_updated
  ON public.risk_assessments (owner_id, updated_at DESC)
  WHERE owner_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_risk_assessments_retain_until
  ON public.risk_assessments (retain_until);

-- ---------------------------------------------------------------------------
-- Rows (normalized: improvement follow-up is queried and patched per row)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_assessment_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.risk_assessments(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  work_process TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  cause TEXT NOT NULL DEFAULT '',
  hazard_factor TEXT NOT NULL DEFAULT '',
  legal_basis TEXT NOT NULL DEFAULT '',
  current_measure TEXT NOT NULL DEFAULT '',
  frequency SMALLINT NOT NULL DEFAULT 1,
  severity SMALLINT NOT NULL DEFAULT 1,
  risk_level TEXT NOT NULL DEFAULT '',
  acceptability TEXT NOT NULL DEFAULT 'not_acceptable',
  acceptability_basis TEXT NOT NULL DEFAULT '',
  reduction_measure TEXT NOT NULL DEFAULT '',
  post_frequency SMALLINT,
  post_severity SMALLINT,
  post_risk_level TEXT NOT NULL DEFAULT '',
  post_acceptability TEXT,
  responsible_person TEXT NOT NULL DEFAULT '',
  improvement_date DATE,
  completion_date DATE,
  improvement_status TEXT NOT NULL DEFAULT 'planned',
  completion_note TEXT NOT NULL DEFAULT '',
  control_intent TEXT,
  validation_status TEXT NOT NULL DEFAULT 'ok',
  review_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT risk_assessment_rows_row_index_non_negative CHECK (row_index >= 0),
  CONSTRAINT risk_assessment_rows_frequency_range CHECK (frequency BETWEEN 1 AND 5),
  CONSTRAINT risk_assessment_rows_severity_range CHECK (severity BETWEEN 1 AND 5),
  CONSTRAINT risk_assessment_rows_post_frequency_range
    CHECK (post_frequency IS NULL OR post_frequency BETWEEN 1 AND 5),
  CONSTRAINT risk_assessment_rows_post_severity_range
    CHECK (post_severity IS NULL OR post_severity BETWEEN 1 AND 5),
  CONSTRAINT risk_assessment_rows_acceptability_check
    CHECK (acceptability IN ('acceptable', 'not_acceptable')),
  CONSTRAINT risk_assessment_rows_post_acceptability_check
    CHECK (post_acceptability IS NULL OR post_acceptability IN ('acceptable', 'not_acceptable')),
  CONSTRAINT risk_assessment_rows_improvement_status_check
    CHECK (improvement_status IN ('planned', 'in_progress', 'done', 'deferred')),
  CONSTRAINT risk_assessment_rows_validation_status_check
    CHECK (validation_status IN ('ok', 'review_required')),
  CONSTRAINT risk_assessment_rows_review_meta_object CHECK (jsonb_typeof(review_meta) = 'object'),
  CONSTRAINT risk_assessment_rows_unique_index UNIQUE (assessment_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_risk_assessment_rows_assessment_index
  ON public.risk_assessment_rows (assessment_id, row_index);

CREATE INDEX IF NOT EXISTS idx_risk_assessment_rows_open_improvements
  ON public.risk_assessment_rows (improvement_status, improvement_date)
  WHERE improvement_status <> 'done';

-- ---------------------------------------------------------------------------
-- Participants (시행규칙 제37조의2, 기록 요건 제37조의4제1항제2호)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_assessment_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.risk_assessments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'worker',
  affiliation TEXT NOT NULL DEFAULT '',
  method TEXT NOT NULL DEFAULT 'site_patrol',
  participated_at DATE,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT risk_assessment_participants_name_length CHECK (char_length(name) BETWEEN 1 AND 80),
  CONSTRAINT risk_assessment_participants_role_check
    CHECK (role IN ('worker', 'worker_representative', 'manager', 'supervisor')),
  CONSTRAINT risk_assessment_participants_method_check
    CHECK (method IN ('site_patrol', 'survey', 'interview', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_risk_assessment_participants_assessment
  ON public.risk_assessment_participants (assessment_id, created_at);

-- ---------------------------------------------------------------------------
-- Share records (시행규칙 제37조의3)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.risk_assessment_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.risk_assessments(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT 'posting',
  shared_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  audience_note TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT risk_assessment_shares_phase_check CHECK (phase IN ('before', 'after')),
  CONSTRAINT risk_assessment_shares_method_check
    CHECK (method IN ('education', 'briefing', 'posting', 'written', 'electronic'))
);

CREATE INDEX IF NOT EXISTS idx_risk_assessment_shares_assessment
  ON public.risk_assessment_shares (assessment_id, shared_at DESC);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_risk_assessment_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_risk_assessments_updated_at ON public.risk_assessments;

CREATE TRIGGER trg_risk_assessments_updated_at
BEFORE UPDATE ON public.risk_assessments
FOR EACH ROW
EXECUTE FUNCTION public.set_risk_assessment_updated_at();

DROP TRIGGER IF EXISTS trg_risk_assessment_rows_updated_at ON public.risk_assessment_rows;

CREATE TRIGGER trg_risk_assessment_rows_updated_at
BEFORE UPDATE ON public.risk_assessment_rows
FOR EACH ROW
EXECUTE FUNCTION public.set_risk_assessment_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: reachable only through the service-role edge function today.
-- Adding an owner_id-based policy later is additive; no table redesign needed.
-- ---------------------------------------------------------------------------
ALTER TABLE public.risk_assessments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_assessment_rows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_assessment_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_assessment_shares       ENABLE ROW LEVEL SECURITY;
