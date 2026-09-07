import { describe, expect, it, vi } from "vitest";
import {
  isSectionCacheStale,
  isTtlExpired,
  getCachedSubstance,
  findCachedByCas,
  getCachedSections,
  SUBSTANCE_TTL_DAYS,
} from "../../supabase/functions/_shared/msds-cache";

describe("msds-cache utility", () => {
  it("determines section cache is not stale when lastDate matches", () => {
    const cached = { last_date: "2025-08-08" };
    expect(isSectionCacheStale(cached, "2025-08-08")).toBe(false);
  });

  it("determines section cache is stale when lastDate has changed", () => {
    const cached = { last_date: "2025-08-08" };
    expect(isSectionCacheStale(cached, "2026-01-01")).toBe(true);
  });

  it("detects TTL expiration for substances older than 30 days", () => {
    const freshIso = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const expiredIso = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString();

    expect(isTtlExpired(freshIso, SUBSTANCE_TTL_DAYS)).toBe(false);
    expect(isTtlExpired(expiredIso, SUBSTANCE_TTL_DAYS)).toBe(true);
  });

  it("returns null gracefully when database client throws an exception", async () => {
    const brokenSb = {
      from: vi.fn().mockImplementation(() => {
        throw new Error("DB connection pool destroyed");
      }),
    };

    const substance = await getCachedSubstance(brokenSb, "001032");
    expect(substance).toBeNull();

    const casResult = await findCachedByCas(brokenSb, "108-88-3");
    expect(casResult).toBeNull();

    const sections = await getCachedSections(brokenSb, "001032", [2, 4]);
    expect(sections.size).toBe(0);
  });

  it("retrieves cached sections into a map correctly", async () => {
    const mockData = [
      { section_no: 2, payload: [{ msdsItemCode: "B02", itemDetail: "인화성" }] },
      { section_no: 8, payload: [{ msdsItemCode: "H0602", itemDetail: "방독마스크" }] },
    ];

    const fakeSb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: mockData,
              error: null,
            }),
          }),
        }),
      }),
    };

    const sections = await getCachedSections(fakeSb, "001032", [2, 8]);
    expect(sections.has(2)).toBe(true);
    expect(sections.has(8)).toBe(true);
    expect(sections.get(2)).toHaveLength(1);
    expect(sections.get(8)?.[0].itemDetail).toBe("방독마스크");
  });
});
