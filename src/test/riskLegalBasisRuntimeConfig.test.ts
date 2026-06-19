import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("risk legal basis edge runtime contract", () => {
  it("allows enough time for Gemini review and uses the provenance-aware fallback policy", () => {
    const source = readFileSync(
      resolve(process.cwd(), "supabase/functions/risk-legal-basis-fit/index.ts"),
      "utf8",
    );

    expect(source).toContain("const REVIEW_TIMEOUT_MS = 20000;");
    expect(source).toContain("const CONTEXT_ANALYSIS_TIMEOUT_MS = 18000;");
    expect(source).toContain("getRiskControlIntentSearchTerms(row.controlIntent)");
    expect(source).toContain("selectDeterministicLegalReview");
    expect(source).toContain("candidateOptions");
    expect(source).toContain("originalText");
    expect(source).toContain("evidenceExcerpt");
    expect(source).toContain("isEvidenceExcerptFromOriginal");
    expect(source).toContain('fallbackReason: "timeout"');
  });
});
