-- Extend risk_assessment_history to support multiple Form Center templates.
ALTER TABLE public.risk_assessment_history
  ADD COLUMN IF NOT EXISTS form_type TEXT NOT NULL DEFAULT 'risk-assessment',
  ADD COLUMN IF NOT EXISTS accident_data JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  ALTER TABLE public.risk_assessment_history
    ADD CONSTRAINT risk_assessment_history_form_type_check
    CHECK (form_type IN ('risk-assessment', 'accident-report'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.risk_assessment_history
    ADD CONSTRAINT risk_assessment_history_accident_data_object
    CHECK (jsonb_typeof(accident_data) = 'object');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS idx_risk_assessment_history_scope_form_created
  ON public.risk_assessment_history (scope_hash, form_type, created_at DESC);
