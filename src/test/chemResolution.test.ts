import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  validateCasCheckDigit,
  extractValidCasNumbers,
  resolveChemical,
} from "../../supabase/functions/_shared/chem-resolution";

describe("chem-resolution logic", () => {
  const mockServiceKey = "test-key";
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("validates CAS check digit for valid chemicals and rejects invalid ones", () => {
    // 톨루엔: 108-88-3
    expect(validateCasCheckDigit("108-88-3")).toBe(true);
    // 벤젠: 71-43-2
    expect(validateCasCheckDigit("71-43-2")).toBe(true);
    // 아세톤: 67-64-1
    expect(validateCasCheckDigit("67-64-1")).toBe(true);

    // 잘못된 체크디지트
    expect(validateCasCheckDigit("108-88-5")).toBe(false);
    expect(validateCasCheckDigit("71-43-9")).toBe(false);

    // 날짜 형태 방어 (2026-08-18)
    expect(validateCasCheckDigit("2026-08-18")).toBe(false);
    expect(validateCasCheckDigit("2026-08-1")).toBe(false);
  });

  it("extracts valid CAS numbers and ignores invalid ones or dates", () => {
    const text = "제조일자 2026-08-18 함유물질 톨루엔 (CAS: 108-88-3) 및 불량코드 108-88-5";
    const casList = extractValidCasNumbers(text);

    expect(casList).toEqual(["108-88-3"]);
  });

  it("resolves via CAS path when valid CAS is present in rawText", async () => {
    const mockXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items><item><chemId>001032</chemId><chemNameKor>톨루엔</chemNameKor><casNo>108-88-3</casNo></item></items></body>
</response>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockXml,
    } as Response);

    const result = await resolveChemical(
      { rawText: "톨루엔 CAS 108-88-3 포함" },
      { serviceKey: mockServiceKey }
    );

    expect(result.substance).not.toBeNull();
    expect(result.substance?.chemId).toBe("001032");
    expect(result.substance?.resolvedBy).toBe("cas");
    expect(result.substance?.confidence).toBe("high");
  });

  it("falls back to name search when CAS check digit fails", async () => {
    // 108-88-5 is invalid check digit, so it should try name search for '톨루엔'
    const mockXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items><item><chemId>001032</chemId><chemNameKor>톨루엔</chemNameKor><casNo>108-88-3</casNo></item></items></body>
</response>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockXml,
    } as Response);

    const result = await resolveChemical(
      { rawText: "톨루엔 (108-88-5)" },
      { serviceKey: mockServiceKey }
    );

    expect(result.substance).not.toBeNull();
    expect(result.substance?.resolvedBy).toBe("name_ko");
    expect(result.substance?.confidence).toBe("medium");
  });

  it("resolves medium confidence for single Korean name match", async () => {
    const mockXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items><item><chemId>001032</chemId><chemNameKor>톨루엔</chemNameKor></item></items></body>
</response>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockXml,
    } as Response);

    const result = await resolveChemical(
      { productName: "톨루엔" },
      { serviceKey: mockServiceKey }
    );

    expect(result.substance?.resolvedBy).toBe("name_ko");
    expect(result.substance?.confidence).toBe("medium");
  });

  it("requires user selection when multiple Korean matches exist without exact match", async () => {
    const mockXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items>
    <item><chemId>001032</chemId><chemNameKor>톨루엔-A</chemNameKor><casNo>108-88-3</casNo></item>
    <item><chemId>001033</chemId><chemNameKor>톨루엔-B</chemNameKor><casNo>108-88-4</casNo></item>
    <item><chemId>001034</chemId><chemNameKor>톨루엔-C</chemNameKor><casNo>108-88-5</casNo></item>
  </items></body>
</response>`;

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => mockXml,
    } as Response);

    const result = await resolveChemical(
      { productName: "톨루엔" },
      { serviceKey: mockServiceKey }
    );

    expect(result.substance).toBeNull();
    expect(result.needsUserSelection).toBeDefined();
    expect(result.needsUserSelection?.candidates).toHaveLength(3);
  });

  it("bridges English name to CAS when exact match exists", async () => {
    const bridgeJson = {
      header: { resultCode: "200" },
      body: {
        items: [
          {
            sbstnId: "35074",
            casNo: "108-88-3",
            sbstnNmEng: "Toluene",
            sbstnNmKor: "톨루엔",
          },
        ],
      },
    };

    const msdsXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items><item><chemId>001032</chemId><chemNameKor>톨루엔</chemNameKor><casNo>108-88-3</casNo></item></items></body>
</response>`;

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("ncissbstn")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => bridgeJson,
        } as Response);
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => msdsXml,
      } as Response);
    });

    const result = await resolveChemical(
      { productName: "Toluene" },
      { serviceKey: mockServiceKey }
    );

    expect(result.substance).not.toBeNull();
    expect(result.substance?.resolvedBy).toBe("name_en_bridge");
    expect(result.substance?.chemId).toBe("001032");
  });

  it("does not bridge partial English matches (e.g. 'Toluene, nitro-') and falls back to PubChem", async () => {
    const partialBridgeJson = {
      header: { resultCode: "200" },
      body: {
        items: [
          {
            sbstnId: "1009",
            casNo: "1321-12-6",
            sbstnNmEng: "Toluene, nitro-",
          },
          {
            sbstnId: "1012",
            casNo: "1333-07-9",
            sbstnNmEng: "Toluenesulfonamide",
          },
        ],
      },
    };

    const pubChemJson = {
      IdentifierList: { CID: [1140] },
    };

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("ncissbstn")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => partialBridgeJson,
        } as Response);
      }
      if (url.includes("pubchem")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => pubChemJson,
        } as Response);
      }
      return Promise.reject(new Error("Unexpected call"));
    });

    const result = await resolveChemical(
      { productName: "Toluene" },
      { serviceKey: mockServiceKey }
    );

    expect(result.substance).not.toBeNull();
    expect(result.substance?.resolvedBy).toBe("pubchem");
    expect(result.substance?.chemId).toBe("PUBCHEM_1140");
  });

  it("returns null substance gracefully without throwing when all resolution strategies fail", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const result = await resolveChemical(
      { rawText: "알 수 없는 텍스트 1234" },
      { serviceKey: mockServiceKey }
    );

    expect(result.substance).toBeNull();
  });

  // ── 회귀: 다중 매칭 후 사용자가 고른 chemId 가 반영되어야 한다.
  //    이전 구현은 chemId 를 국문명 검색어로 넘겨 항상 0건이 나왔고,
  //    선택이 무시된 채 같은 후보 목록이 다시 반환됐다(무한 루프).
  const multiMatchXml = `<response>
  <header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>
  <body><items>
    <item><chemId>013199</chemId><chemNameKor>디메틸란</chemNameKor><casNo>644-64-4</casNo></item>
    <item><chemId>013749</chemId><chemNameKor>메틸 술폰</chemNameKor><casNo>67-71-0</casNo></item>
    <item><chemId>001012</chemId><chemNameKor>메틸 아민</chemNameKor><casNo>74-89-5</casNo></item>
  </items></body>
</response>`;

  it("asks the user to choose when a Korean name matches multiple substances", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => multiMatchXml,
    } as Response);

    const result = await resolveChemical({ rawText: "메틸" }, { serviceKey: mockServiceKey });

    expect(result.substance).toBeNull();
    expect(result.needsUserSelection?.candidates.map((c) => c.chemId)).toEqual([
      "013199",
      "013749",
      "001012",
    ]);
  });

  it("honours selectedChemId from a previous multi-match instead of asking again", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => multiMatchXml,
    } as Response);

    const result = await resolveChemical(
      { rawText: "메틸" },
      { serviceKey: mockServiceKey, selectedChemId: "013749" },
    );

    expect(result.needsUserSelection).toBeUndefined();
    expect(result.substance).not.toBeNull();
    expect(result.substance?.chemId).toBe("013749");
    expect(result.substance?.chemNameKor).toBe("메틸 술폰");
    expect(result.substance?.resolvedBy).toBe("user_selected");
  });

  it("re-asks rather than guessing when selectedChemId is not among the candidates", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => multiMatchXml,
    } as Response);

    const result = await resolveChemical(
      { rawText: "메틸" },
      { serviceKey: mockServiceKey, selectedChemId: "999999" },
    );

    expect(result.substance).toBeNull();
    expect(result.needsUserSelection).toBeDefined();
    expect(result.warnings?.join(" ")).toContain("999999");
  });
});

