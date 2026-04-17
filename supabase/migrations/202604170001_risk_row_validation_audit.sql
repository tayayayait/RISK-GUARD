ALTER TABLE public.risk_assessment_history
  ADD COLUMN IF NOT EXISTS validation_summary JSONB NOT NULL DEFAULT '{"totalRows":0,"reviewRequiredRows":0,"okRows":0,"hazardTypeCounts":{}}'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_events JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  ALTER TABLE public.risk_assessment_history
    ADD CONSTRAINT risk_assessment_history_validation_summary_object
    CHECK (jsonb_typeof(validation_summary) = 'object');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.risk_assessment_history
    ADD CONSTRAINT risk_assessment_history_validation_events_array
    CHECK (jsonb_typeof(validation_events) = 'array');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE TABLE IF NOT EXISTS public.risk_row_validation_audit (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  event_timestamp TIMESTAMPTZ,
  site_name TEXT NOT NULL DEFAULT '',
  form_type TEXT NOT NULL DEFAULT 'risk-assessment',
  row_index INTEGER NOT NULL,
  expected_hazard_type TEXT NOT NULL DEFAULT '',
  detected_hazard_type TEXT NOT NULL DEFAULT '',
  field TEXT NOT NULL,
  reason_code TEXT NOT NULL,
  rewritten BOOLEAN NOT NULL DEFAULT false,
  final_status TEXT NOT NULL DEFAULT 'ok',
  source TEXT NOT NULL DEFAULT 'form-editor',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT risk_row_validation_audit_row_index_non_negative CHECK (row_index >= 0),
  CONSTRAINT risk_row_validation_audit_form_type_check CHECK (form_type IN ('risk-assessment')),
  CONSTRAINT risk_row_validation_audit_final_status_check CHECK (final_status IN ('ok', 'review_required')),
  CONSTRAINT risk_row_validation_audit_metadata_object CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_risk_row_validation_audit_created_at
  ON public.risk_row_validation_audit (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_row_validation_audit_site_created
  ON public.risk_row_validation_audit (site_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_row_validation_audit_status_created
  ON public.risk_row_validation_audit (final_status, created_at DESC);

