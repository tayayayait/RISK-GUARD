-- law_articles table for 법령 기반 개선조치
CREATE TABLE IF NOT EXISTS public.law_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  law_name TEXT NOT NULL,
  article_number TEXT NOT NULL,
  article_title TEXT NOT NULL,
  summary TEXT NOT NULL,
  hazard_types TEXT[] NOT NULL,
  remedial_actions TEXT[] NOT NULL,
  compliance_checklist TEXT[],
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_law_hazard ON public.law_articles USING GIN (hazard_types);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'law_articles_law_article_unique'
      AND conrelid = 'public.law_articles'::regclass
  ) THEN
    ALTER TABLE public.law_articles
      ADD CONSTRAINT law_articles_law_article_unique UNIQUE (law_name, article_number);
  END IF;
END $$;
