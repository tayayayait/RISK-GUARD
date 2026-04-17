import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("law evidence runtime config", () => {
  it("uses evidence_only response mode in kosha-law-evidence endpoint", () => {
    const filePath = resolve(process.cwd(), "supabase/functions/kosha-law-evidence/index.ts");
    const source = readFileSync(filePath, "utf8");
    expect(source).toContain('responseMode: "evidence_only"');
  });

  it("keeps smartSearch timeout constants at hardened values", () => {
    const filePath = resolve(process.cwd(), "supabase/functions/_shared/law-guides-core.ts");
    const source = readFileSync(filePath, "utf8");

    const timeoutMatch = source.match(/const API_FETCH_TIMEOUT_MS = (\d+);/);
    const budgetMatch = source.match(/const API_FETCH_BUDGET_MS = (\d+);/);
    const retryMatch = source.match(/const API_FETCH_RETRY_ATTEMPTS = (\d+);/);
    const lawRowsMatch = source.match(/const LAW_API_ROWS_PER_REQUEST = (\d+);/);
    const lawMinResultMatch = source.match(/const LAW_ADAPTIVE_MIN_RESULTS = (\d+);/);
    const evidenceSearchLimitMatch = source.match(/const EVIDENCE_API_ONLY_MAX_SEARCH_VALUES = (\d+);/);
    const zeroResultFallbackLimitMatch = source.match(/const API_ZERO_RESULT_FALLBACK_LIMIT = (\d+);/);

    expect(timeoutMatch?.[1]).toBe("8000");
    expect(budgetMatch?.[1]).toBe("70000");
    expect(retryMatch?.[1]).toBe("2");
    expect(lawRowsMatch?.[1]).toBe("60");
    expect(lawMinResultMatch?.[1]).toBe("6");
    expect(evidenceSearchLimitMatch?.[1]).toBe("10");
    expect(zeroResultFallbackLimitMatch?.[1]).toBe("3");
    expect(source).toContain("if (!strictOnly && rankedLaw.length < LAW_ADAPTIVE_MIN_RESULTS)");
    expect(source).toContain("ranked.length >= normalizedMinimumResults");
    expect(source).toContain("fetchSmartSearchCategory(serviceKey, normalizedSearchValue, category)");
    expect(source).toContain("if (dedup.size === 0 && fallbackSearchValues.length > 0)");
  });
});
