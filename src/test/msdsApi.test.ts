import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  searchChemicals,
  fetchChemSection,
  fetchChemSections,
  MsdsSearchCondition,
  MsdsApiError,
} from "../../supabase/functions/_shared/msds-api";

describe("msds-api client", () => {
  const mockServiceKey = "test-service-key";
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("preserves leading zero in chemId as a string", async () => {
    const mockXml = `<response>
  <header>
    <resultCode>00</resultCode>
    <resultMsg>NORMAL SERVICE.</resultMsg>
  </header>
  <body>
    <items>
      <item>
        <casNo>108-88-3</casNo>
        <chemId>001032</chemId>
        <chemNameKor>톨루엔</chemNameKor>
      </item>
    </items>
  </body>
</response>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockXml,
    } as Response);

    const result = await searchChemicals(mockServiceKey, {
      keyword: "톨루엔",
      condition: MsdsSearchCondition.NAME_KO,
    });

    expect(result).toHaveLength(1);
    expect(result[0].chemId).toBe("001032");
    expect(typeof result[0].chemId).toBe("string");
  });

  it("passes searchCnd and params accurately in the query string", async () => {
    const mockXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items/></body>
</response>`;

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockXml,
    } as Response);
    globalThis.fetch = fetchSpy;

    await searchChemicals(mockServiceKey, {
      keyword: "108-88-3",
      condition: MsdsSearchCondition.CAS,
      numOfRows: 5,
      pageNo: 2,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(fetchSpy.mock.calls[0][0]);
    expect(requestedUrl.searchParams.get("serviceKey")).toBe(mockServiceKey);
    expect(requestedUrl.searchParams.get("searchWrd")).toBe("108-88-3");
    expect(requestedUrl.searchParams.get("searchCnd")).toBe("1");
    expect(requestedUrl.searchParams.get("numOfRows")).toBe("5");
    expect(requestedUrl.searchParams.get("pageNo")).toBe("2");
  });

  it("retries on 5xx status code once and succeeds if second attempt is ok", async () => {
    const mockXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items><item><chemId>001032</chemId><chemNameKor>톨루엔</chemNameKor></item></items></body>
</response>`;

    const fetchSpy = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => "Bad Gateway",
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => mockXml,
      } as Response);

    globalThis.fetch = fetchSpy;

    const result = await searchChemicals(
      mockServiceKey,
      { keyword: "톨루엔" },
      { retryDelayMs: 10 }
    );

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].chemId).toBe("001032");
  });

  it("does not retry on returnReasonCode=31 and throws immediately", async () => {
    const errorXml = `<OpenAPI_ServiceResponse>
  <cmmMsgHeader>
    <errMsg>SERVICE ERROR</errMsg>
    <returnAuthMsg>EXPIRED_KEY</returnAuthMsg>
    <returnReasonCode>31</returnReasonCode>
  </cmmMsgHeader>
</OpenAPI_ServiceResponse>`;

    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => errorXml,
    } as Response);

    globalThis.fetch = fetchSpy;

    await expect(
      searchChemicals(mockServiceKey, { keyword: "톨루엔" }, { maxRetries: 2, retryDelayMs: 10 })
    ).rejects.toThrowError(/31/);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws QUOTA_EXCEEDED when resultCode is 22", async () => {
    const quotaXml = `<response>
  <header>
    <resultCode>22</resultCode>
    <resultMsg>LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR</resultMsg>
  </header>
  <body><items/></body>
</response>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => quotaXml,
    } as Response);

    await expect(
      searchChemicals(mockServiceKey, { keyword: "톨루엔" })
    ).rejects.toThrowError(/QUOTA_EXCEEDED/);
  });

  it("handles partial failure in fetchChemSections gracefully", async () => {
    const mockSectionXml = (sectionNo: number) => `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items><item><msdsItemCode>CODE_${sectionNo}</msdsItemCode><itemDetail>Detail ${sectionNo}</itemDetail></item></items></body>
</response>`;

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("getChemDetail04")) {
        return Promise.reject(new Error("Network failed for section 04"));
      }
      if (url.includes("getChemDetail02")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => mockSectionXml(2),
        } as Response);
      }
      if (url.includes("getChemDetail08")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => mockSectionXml(8),
        } as Response);
      }
      return Promise.reject(new Error("Unknown section"));
    });

    const { sections, sectionErrors } = await fetchChemSections(
      mockServiceKey,
      "001032",
      [2, 4, 8],
      { retryDelayMs: 5, maxRetries: 0 }
    );

    expect(sections.has(2)).toBe(true);
    expect(sections.has(8)).toBe(true);
    expect(sections.has(4)).toBe(false);
    expect(sectionErrors).toHaveLength(1);
    expect(sectionErrors[0].sectionNo).toBe(4);
    expect(sectionErrors[0].error).toContain("Network failed for section 04");
  });

  it("handles timeout and raises UPSTREAM_TIMEOUT error after retries", async () => {
    globalThis.fetch = vi.fn().mockImplementation((_url, init) => {
      return new Promise((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new Error("This operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    });

    await expect(
      searchChemicals(
        mockServiceKey,
        { keyword: "톨루엔" },
        { timeoutMs: 50, maxRetries: 1, retryDelayMs: 10 }
      )
    ).rejects.toThrowError(/UPSTREAM_TIMEOUT/);
  });
});
