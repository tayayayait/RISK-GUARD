-- company_profile_defaults table for accident-report fixed business info
CREATE TABLE IF NOT EXISTS public.company_profile_defaults (
  business_number TEXT PRIMARY KEY,
  management_number TEXT NOT NULL,
  business_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  headquarters_address TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT company_profile_defaults_business_number_length CHECK (char_length(business_number) BETWEEN 10 AND 12),
  CONSTRAINT company_profile_defaults_business_name_length CHECK (char_length(business_name) BETWEEN 1 AND 160),
  CONSTRAINT company_profile_defaults_industry_length CHECK (char_length(industry) BETWEEN 1 AND 120),
  CONSTRAINT company_profile_defaults_address_length CHECK (char_length(headquarters_address) BETWEEN 1 AND 240)
);

CREATE INDEX IF NOT EXISTS idx_company_profile_defaults_updated_at
  ON public.company_profile_defaults (updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_company_profile_defaults_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_profile_defaults_updated_at ON public.company_profile_defaults;

CREATE TRIGGER trg_company_profile_defaults_updated_at
BEFORE UPDATE ON public.company_profile_defaults
FOR EACH ROW
EXECUTE FUNCTION public.set_company_profile_defaults_updated_at();

