-- Account-owned work records for Form Center, Accident Prediction, and Chemical Scan.
-- The main risk-assessment flow keeps its normalized legal-record tables and gains
-- explicit auth.uid() ownership below.

CREATE TABLE IF NOT EXISTS public.user_work_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  feature TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  input_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_work_history_feature_check CHECK (
    feature IN (
      'form-risk-assessment',
      'form-accident-report',
      'accident-prediction',
      'chemical-scan'
    )
  ),
  CONSTRAINT user_work_history_title_length CHECK (char_length(title) BETWEEN 1 AND 160),
  CONSTRAINT user_work_history_input_object CHECK (jsonb_typeof(input_payload) = 'object'),
  CONSTRAINT user_work_history_result_object CHECK (jsonb_typeof(result_payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_user_work_history_user_feature_updated
  ON public.user_work_history (user_id, feature, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_user_work_history_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_work_history_updated_at ON public.user_work_history;
CREATE TRIGGER trg_user_work_history_updated_at
BEFORE UPDATE ON public.user_work_history
FOR EACH ROW
EXECUTE FUNCTION public.set_user_work_history_updated_at();

ALTER TABLE public.user_work_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_work_history TO authenticated;
GRANT ALL ON public.user_work_history TO service_role;

DROP POLICY IF EXISTS user_work_history_select_own ON public.user_work_history;
CREATE POLICY user_work_history_select_own
ON public.user_work_history FOR SELECT TO authenticated
USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS user_work_history_insert_own ON public.user_work_history;
CREATE POLICY user_work_history_insert_own
ON public.user_work_history FOR INSERT TO authenticated
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS user_work_history_update_own ON public.user_work_history;
CREATE POLICY user_work_history_update_own
ON public.user_work_history FOR UPDATE TO authenticated
USING ((select auth.uid()) = user_id)
WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS user_work_history_delete_own ON public.user_work_history;
CREATE POLICY user_work_history_delete_own
ON public.user_work_history FOR DELETE TO authenticated
USING ((select auth.uid()) = user_id);

-- Main risk-assessment ownership. owner_id already exists in the durable-store
-- migration; keep it nullable for legacy device-scope records while requiring it
-- on all new authenticated writes through the edge function.
ALTER TABLE public.risk_assessments
  ALTER COLUMN owner_id SET DEFAULT auth.uid();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'risk_assessments_owner_id_fkey'
  ) THEN
    ALTER TABLE public.risk_assessments
      ADD CONSTRAINT risk_assessments_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END
$$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_assessments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_assessment_rows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_assessment_participants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_assessment_shares TO authenticated;

DROP POLICY IF EXISTS risk_assessments_select_own ON public.risk_assessments;
CREATE POLICY risk_assessments_select_own
ON public.risk_assessments FOR SELECT TO authenticated
USING ((select auth.uid()) = owner_id);

DROP POLICY IF EXISTS risk_assessments_insert_own ON public.risk_assessments;
CREATE POLICY risk_assessments_insert_own
ON public.risk_assessments FOR INSERT TO authenticated
WITH CHECK ((select auth.uid()) = owner_id);

DROP POLICY IF EXISTS risk_assessments_update_own ON public.risk_assessments;
CREATE POLICY risk_assessments_update_own
ON public.risk_assessments FOR UPDATE TO authenticated
USING ((select auth.uid()) = owner_id)
WITH CHECK ((select auth.uid()) = owner_id);

DROP POLICY IF EXISTS risk_assessments_delete_own ON public.risk_assessments;
CREATE POLICY risk_assessments_delete_own
ON public.risk_assessments FOR DELETE TO authenticated
USING ((select auth.uid()) = owner_id);

-- Child-table policies derive ownership from the parent assessment. This prevents
-- changing assessment_id to attach a row to another user's assessment.
DROP POLICY IF EXISTS risk_assessment_rows_select_own ON public.risk_assessment_rows;
CREATE POLICY risk_assessment_rows_select_own
ON public.risk_assessment_rows FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
));

DROP POLICY IF EXISTS risk_assessment_rows_insert_own ON public.risk_assessment_rows;
CREATE POLICY risk_assessment_rows_insert_own
ON public.risk_assessment_rows FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
));

DROP POLICY IF EXISTS risk_assessment_rows_update_own ON public.risk_assessment_rows;
CREATE POLICY risk_assessment_rows_update_own
ON public.risk_assessment_rows FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
));

DROP POLICY IF EXISTS risk_assessment_rows_delete_own ON public.risk_assessment_rows;
CREATE POLICY risk_assessment_rows_delete_own
ON public.risk_assessment_rows FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
));

DROP POLICY IF EXISTS risk_assessment_participants_select_own ON public.risk_assessment_participants;
CREATE POLICY risk_assessment_participants_select_own
ON public.risk_assessment_participants FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
));

DROP POLICY IF EXISTS risk_assessment_participants_insert_own ON public.risk_assessment_participants;
CREATE POLICY risk_assessment_participants_insert_own
ON public.risk_assessment_participants FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
));

DROP POLICY IF EXISTS risk_assessment_participants_update_own ON public.risk_assessment_participants;
CREATE POLICY risk_assessment_participants_update_own
ON public.risk_assessment_participants FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
));

DROP POLICY IF EXISTS risk_assessment_participants_delete_own ON public.risk_assessment_participants;
CREATE POLICY risk_assessment_participants_delete_own
ON public.risk_assessment_participants FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
));

DROP POLICY IF EXISTS risk_assessment_shares_select_own ON public.risk_assessment_shares;
CREATE POLICY risk_assessment_shares_select_own
ON public.risk_assessment_shares FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
));

DROP POLICY IF EXISTS risk_assessment_shares_insert_own ON public.risk_assessment_shares;
CREATE POLICY risk_assessment_shares_insert_own
ON public.risk_assessment_shares FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
));

DROP POLICY IF EXISTS risk_assessment_shares_update_own ON public.risk_assessment_shares;
CREATE POLICY risk_assessment_shares_update_own
ON public.risk_assessment_shares FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
));

DROP POLICY IF EXISTS risk_assessment_shares_delete_own ON public.risk_assessment_shares;
CREATE POLICY risk_assessment_shares_delete_own
ON public.risk_assessment_shares FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.risk_assessments assessment
  WHERE assessment.id = assessment_id
    AND assessment.owner_id = (select auth.uid())
));
