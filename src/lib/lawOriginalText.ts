const ARTICLE_NUMBER_PATTERN = /(\uC81C\s*\d+\s*\uC870(?:\s*\uC758\s*\d+)?)/;

// Shared signed URL for the uploaded standards-rules PDF in Supabase Storage.
const STANDARDS_RULES_PDF_URL = "https://dkslgsguxlznapiygier.supabase.co/storage/v1/object/sign/laws/kr-industrial-safety-and-health-standards-rules.pdf?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV9hNDAyYjdlOS1iM2MxLTRkZGItODUzZC04ZmJmZDczMzFjNmIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJsYXdzL2tyLWluZHVzdHJpYWwtc2FmZXR5LWFuZC1oZWFsdGgtc3RhbmRhcmRzLXJ1bGVzLnBkZiIsImlhdCI6MTc3NTkwMjE1NiwiZXhwIjoyNzIxOTgyMTU2fQ.lnuUrqGsHo40rYKCJowm_581jrVITttOcnUDTmL4dgI";

// Optional page map placeholder for future tuning when verified article->page data exists.
const ARTICLE_PAGE_MAP: Record<string, number> = {};

function normalizeArticleToken(articleNumber: string) {
  return articleNumber.replace(/\s+/g, "");
}

export function extractPrimaryArticleNumber(sourceText?: string) {
  if (!sourceText) {
    return "";
  }

  const match = sourceText.match(ARTICLE_NUMBER_PATTERN);
  return match?.[1] ? normalizeArticleToken(match[1]) : "";
}

export function buildStandardsRulesPdfUrl(articleSourceText?: string) {
  const articleNumber = extractPrimaryArticleNumber(articleSourceText);
  if (!articleNumber) {
    return STANDARDS_RULES_PDF_URL;
  }

  const page = ARTICLE_PAGE_MAP[articleNumber];
  if (page) {
    return `${STANDARDS_RULES_PDF_URL}#page=${page}&search=${encodeURIComponent(articleNumber)}`;
  }

  return `${STANDARDS_RULES_PDF_URL}#search=${encodeURIComponent(articleNumber)}`;
}
