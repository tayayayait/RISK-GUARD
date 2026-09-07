import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchGhsSubstance, GhsSearchGubun } from "../../supabase/functions/_shared/ghs-api";

describe("ghs-api client", () => {
  const mockServiceKey = "test-service-key";
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses toluene JSON response and decomposes pictograms using caret (^)", async () => {
    const mockJson = {
      header: { resultCode: "200", resultMsg: "NORMAL SERVICE." },
      body: {
        items: [
          {
            sbstnId: "35074",
            casNo: "108-88-3",
            sbstnNmKor: "톨루엔",
            sbstnNmEng: "Toluene",
            sbstnTypeUnqno: "기존화학물질:V^사고대비물질:28^등록대상기존화학물질:131",
            sfsgwd: "위험",
            mfctrCn: "-",
            unnm: "1294",
            pctgrmCd: "GHS02^GHS07^GHS08",
            hrmflnList: [
              {
                hrmflnClsfArtclNm: "흡인 유해성",
                hrmDngrCd: "H304",
                clsfGrd: "1",
                hrmPrevntCd: "P301+P310^P331^P405^P501",
              },
            ],
          },
        ],
        numOfRows: "1",
        pageNo: "1",
        totalCount: "1",
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response);

    const result = await fetchGhsSubstance(mockServiceKey, "108-88-3", GhsSearchGubun.CAS);

    expect(result).not.toBeNull();
    expect(result?.pictograms).toEqual(["GHS02", "GHS07", "GHS08"]);
    expect(result?.signalWord).toBe("위험");
    expect(result?.casNo).toBe("108-88-3");
  });

  it("decomposes hrmPrevntCd with caret (^) delimiter correctly", async () => {
    const mockJson = {
      header: { resultCode: "200", resultMsg: "NORMAL SERVICE." },
      body: {
        items: [
          {
            casNo: "108-88-3",
            pctgrmCd: "GHS02",
            hrmflnList: [
              {
                hrmflnClsfArtclNm: "흡인 유해성",
                hrmDngrCd: "H304",
                hrmPrevntCd: "P301+P310^P331^P405^P501",
              },
            ],
          },
        ],
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response);

    const result = await fetchGhsSubstance(mockServiceKey, "108-88-3");
    expect(result?.hazardList[0].hrmPrevntCdList).toEqual([
      "P301+P310",
      "P331",
      "P405",
      "P501",
    ]);
  });

  it("considers resultCode='200' as normal service without throwing", async () => {
    const mockJson = {
      header: { resultCode: "200", resultMsg: "NORMAL SERVICE." },
      body: { items: [{ casNo: "108-88-3", pctgrmCd: "GHS02" }] },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response);

    await expect(fetchGhsSubstance(mockServiceKey, "108-88-3")).resolves.not.toThrow();
  });

  it("throws error when resultCode is not 200 (e.g. resultCode='97')", async () => {
    const mockJson = {
      header: { resultCode: "97", resultMsg: "INVALID API KEY" },
      body: { items: [] },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response);

    await expect(fetchGhsSubstance(mockServiceKey, "108-88-3")).rejects.toThrowError(/97/);
  });

  it("returns null when items is empty array without throwing", async () => {
    const mockJson = {
      header: { resultCode: "200", resultMsg: "NORMAL SERVICE." },
      body: { items: [] },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response);

    const result = await fetchGhsSubstance(mockServiceKey, "nonexistent");
    expect(result).toBeNull();
  });

  it("handles pctgrmCd with '-' or empty string returning empty array", async () => {
    const mockJson = {
      header: { resultCode: "200", resultMsg: "NORMAL SERVICE." },
      body: {
        items: [{ casNo: "108-88-3", pctgrmCd: "-" }],
      },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockJson,
    } as Response);

    const result = await fetchGhsSubstance(mockServiceKey, "108-88-3");
    expect(result?.pictograms).toEqual([]);
  });
});
