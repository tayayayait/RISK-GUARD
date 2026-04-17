-- risk_assessment_history table for Form Center risk-assessment snapshots
CREATE TABLE IF NOT EXISTS public.risk_assessment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_hash TEXT NOT NULL,
  task_name TEXT NOT NULL,
  site_name TEXT NOT NULL DEFAULT '',
  work_date DATE,
  context_text TEXT NOT NULL DEFAULT '',
  risk_rows JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days'),
  CONSTRAINT risk_assessment_history_scope_hash_length CHECK (char_length(scope_hash) >= 32),
  CONSTRAINT risk_assessment_history_risk_rows_array CHECK (jsonb_typeof(risk_rows) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_risk_assessment_history_scope_created
  ON public.risk_assessment_history (scope_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_risk_assessment_history_expires_at
  ON public.risk_assessment_history (expires_at);
