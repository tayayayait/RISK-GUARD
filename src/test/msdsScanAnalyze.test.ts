import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { handleMsdsScanAnalyze, MSDS_DISCLAIMER } from "../../supabase/functions/msds-scan-analyze/index";

describe("msds-scan-analyze edge function handler", () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = process.env;

  beforeEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv, DATA_GO_KR_API_KEY: "test-secret-key" };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = originalEnv;
  });

  it("handles mode='text' with toluene CAS, returning substance and 4 PPE checklist items", async () => {
    const listXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items><item><chemId>001032</chemId><chemNameKor>톨루엔</chemNameKor><casNo>108-88-3</casNo></item></items></body>
</response>`;

    const sec08Xml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items>
    <item><msdsItemCode>H0602</msdsItemCode><itemDetail>유기화합물용 방독마스크</itemDetail></item>
    <item><msdsItemCode>H0604</msdsItemCode><itemDetail>보안경</itemDetail></item>
    <item><msdsItemCode>H0606</msdsItemCode><itemDetail>내화학성 장갑</itemDetail></item>
    <item><msdsItemCode>H0608</msdsItemCode><itemDetail>보호복 및 안전화</itemDetail></item>
  </items></body>
</response>`;

    const genericSecXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items/></body>
</response>`;

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("getChemList")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => listXml,
        } as Response);
      }
      if (url.includes("getChemDetail08")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => sec08Xml,
        } as Response);
      }
      if (url.includes("ncisghs")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ header: { resultCode: "200" }, body: { items: [] } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => genericSecXml,
      } as Response);
    });

    const req = new Request("http://localhost/functions/v1/msds-scan-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "text",
        text: "톨루엔 CAS 108-88-3",
      }),
    });

    const res = await handleMsdsScanAnalyze(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.substance.chemId).toBe("001032");
    expect(body.ppeChecklist).toHaveLength(4);
    expect(body.ppeChecklist[0].part).toBe("respiratory");
    expect(body.ppeChecklist[0].requirement).toContain("방독마스크");
    expect(body.disclaimer).toBe(MSDS_DISCLAIMER);
  });

  it("returns candidates when multiple Korean matches require user selection", async () => {
    const listXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items>
    <item><chemId>001032</chemId><chemNameKor>톨루엔-A</chemNameKor><casNo>108-88-3</casNo></item>
    <item><chemId>001033</chemId><chemNameKor>톨루엔-B</chemNameKor><casNo>108-88-4</casNo></item>
  </items></body>
</response>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => listXml,
    } as Response);

    const req = new Request("http://localhost/functions/v1/msds-scan-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "text",
        hint: { productName: "톨루엔" },
      }),
    });

    const res = await handleMsdsScanAnalyze(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.substance).toBeNull();
    expect(body.needsUserSelection).toBeDefined();
    expect(body.needsUserSelection.candidates.length).toBe(2);
  });

  it("returns 503 when service key is missing", async () => {
    delete process.env.DATA_GO_KR_API_KEY;
    delete process.env.DATA_GO_API_KEY;
    delete process.env.PUBLIC_DATA_API_KEY;
    delete process.env.VITE_DATA_GO_KR_API_KEY;

    const req = new Request("http://localhost/functions/v1/msds-scan-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "text", text: "톨루엔" }),
    });

    const res = await handleMsdsScanAnalyze(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toContain("MISSING_SECRET");
  });

  it("handles partial section 08 failure returning 200 with meta.sectionErrors", async () => {
    const listXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items><item><chemId>001032</chemId><chemNameKor>톨루엔</chemNameKor><casNo>108-88-3</casNo></item></items></body>
</response>`;

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("getChemList")) {
        return Promise.resolve({ ok: true, status: 200, text: async () => listXml } as Response);
      }
      if (url.includes("getChemDetail08")) {
        return Promise.reject(new Error("Section 08 timeout"));
      }
      if (url.includes("ncisghs")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ header: { resultCode: "200" }, body: { items: [] } }),
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => `<response><header><resultCode>00</resultCode><resultMsg>NORMAL</resultMsg></header><body><items/></body></response>`,
      } as Response);
    });

    const req = new Request("http://localhost/functions/v1/msds-scan-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "text", text: "톨루엔 CAS 108-88-3" }),
    });

    const res = await handleMsdsScanAnalyze(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.substance.chemId).toBe("001032");
    expect(body.meta.sectionErrors).toBeDefined();
    expect(body.meta.sectionErrors.some((e: { sectionNo: number }) => e.sectionNo === 8)).toBe(true);
  });

  it("returns 200 with substance null when substance is unresolved", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `<response><header><resultCode>00</resultCode><resultMsg>NORMAL</resultMsg></header><body><items/></body></response>`,
      json: async () => ({ header: { resultCode: "200" }, body: { items: [] } }),
    } as unknown as Response);

    const req = new Request("http://localhost/functions/v1/msds-scan-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "text", text: "인식 불가능 텍스트" }),
    });

    const res = await handleMsdsScanAnalyze(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.substance).toBeNull();
    expect(body.disclaimer).toBe(MSDS_DISCLAIMER);
  });

  it("always contains the fixed disclaimer in response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `<response><header><resultCode>00</resultCode><resultMsg>NORMAL</resultMsg></header><body><items/></body></response>`,
      json: async () => ({ header: { resultCode: "200" }, body: { items: [] } }),
    } as unknown as Response);

    const req = new Request("http://localhost/functions/v1/msds-scan-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "text", text: "sample" }),
    });

    const res = await handleMsdsScanAnalyze(req);
    const body = await res.json();
    expect(body.disclaimer).toContain("본 정보는 안전보건공단");
    expect(body.disclaimer).toContain("산업안전보건법");
  });

  it("returns 405 when HTTP method is not POST", async () => {
    const req = new Request("http://localhost/functions/v1/msds-scan-analyze", {
      method: "GET",
    });

    const res = await handleMsdsScanAnalyze(req);
    expect(res.status).toBe(405);
  });

  // ── 회귀: 교차검증은 라벨 사진을 판독한 image 모드에서만 수행한다.
  //    text 모드에서도 돌려버려 "공식 그림문자가 라벨에 누락됨" critical 경고가
  //    항상 뜨던 문제를 두 방향으로 고정한다.
  const tolueneListXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items><item><chemId>001032</chemId><chemNameKor>톨루엔</chemNameKor><casNo>108-88-3</casNo></item></items></body>
</response>`;

  const sec02Xml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items>
    <item><msdsItemCode>B0402</msdsItemCode><itemDetail>GHS02.gif|GHS07.gif|GHS08.gif</itemDetail></item>
    <item><msdsItemCode>B0404</msdsItemCode><itemDetail>위험</itemDetail></item>
  </items></body>
</response>`;

  const emptySecXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items/></body>
</response>`;

  function stubTolueneApis() {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      const xml = url.includes("getChemList")
        ? tolueneListXml
        : url.includes("getChemDetail02")
          ? sec02Xml
          : emptySecXml;
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => xml,
        // GHS 교차검증 기준값은 쓰지 않는다(섹션02 기준으로 검증)
        json: async () => ({ header: { resultCode: "200" }, body: { items: [] } }),
      } as unknown as Response);
    });
  }

  it("does not raise label discrepancies in text mode", async () => {
    stubTolueneApis();

    const req = new Request("http://localhost/functions/v1/msds-scan-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "text", text: "톨루엔 CAS 108-88-3" }),
    });

    const body = await (await handleMsdsScanAnalyze(req)).json();

    expect(body.substance?.chemId).toBe("001032");
    expect(body.hazard?.pictograms).toEqual(["GHS02", "GHS07", "GHS08"]);
    expect(body.discrepancies).toEqual([]);
  });

  it("raises a critical discrepancy in image mode when the label is missing pictograms", async () => {
    stubTolueneApis();

    const req = new Request("http://localhost/functions/v1/msds-scan-analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "image", image: "dGVzdA==" }),
    });

    const body = await (
      await handleMsdsScanAnalyze(req, {
        mockVisionResult: {
          docType: "ghs_label",
          rawText: "톨루엔 108-88-3",
          casNumbers: ["108-88-3"],
          pictograms: ["GHS02"],
          signalWord: "위험",
          confidence: 0.9,
        },
      })
    ).json();

    const pictogramIssue = body.discrepancies.find(
      (d: { field: string }) => d.field === "pictograms",
    );
    expect(pictogramIssue?.severity).toBe("critical");
    expect(pictogramIssue?.onRecord).toContain("GHS07");
  });
});

