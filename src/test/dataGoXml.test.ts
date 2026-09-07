import { describe, expect, it } from "vitest";
import {
  decodeXmlEntities,
  extractTag,
  extractXmlItems,
  readResponseHeader,
  DataGoXmlError,
} from "../../supabase/functions/_shared/data-go-xml";

describe("data-go-xml shared parser", () => {
  it("parses valid XML with 3 items correctly", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<response>
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
      <item>
        <casNo>71-43-2</casNo>
        <chemId>000001</chemId>
        <chemNameKor>벤젠</chemNameKor>
      </item>
      <item>
        <casNo>67-64-1</casNo>
        <chemId>000002</chemId>
        <chemNameKor>아세톤</chemNameKor>
      </item>
    </items>
    <numOfRows>3</numOfRows>
    <pageNo>1</pageNo>
    <totalCount>3</totalCount>
  </body>
</response>`;

    const items = extractXmlItems(xml);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      casNo: "108-88-3",
      chemId: "001032",
      chemNameKor: "톨루엔",
    });
    expect(items[1].chemId).toBe("000001");
    expect(items[2].chemId).toBe("000002");
  });

  it("preserves newlines inside itemDetail", () => {
    const xml = `<response>
  <header>
    <resultCode>00</resultCode>
    <resultMsg>NORMAL SERVICE.</resultMsg>
  </header>
  <body>
    <items>
      <item>
        <msdsItemCode>O100402</msdsItemCode>
        <itemDetail>Flam. Liq. 2
Repr. 2
Asp. Tox. 1
STOT RE 2</itemDetail>
      </item>
    </items>
  </body>
</response>`;

    const items = extractXmlItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0].itemDetail).toBe("Flam. Liq. 2\nRepr. 2\nAsp. Tox. 1\nSTOT RE 2");
  });

  it("decodes XML entities such as &amp;, &lt;, &gt;, &quot;, &apos;", () => {
    const xml = `<response>
  <header>
    <resultCode>00</resultCode>
    <resultMsg>NORMAL SERVICE.</resultMsg>
  </header>
  <body>
    <items>
      <item>
        <chemNameKor>벤젠 &amp; 톨루엔 &lt;위험&gt; &quot;주의&apos;</chemNameKor>
      </item>
    </items>
  </body>
</response>`;

    const items = extractXmlItems(xml);
    expect(items).toHaveLength(1);
    expect(items[0].chemNameKor).toBe('벤젠 & 톨루엔 <위험> "주의\'');
  });

  it("returns an empty array when items tag is empty (<items/> or empty <items></items>)", () => {
    const xmlSelfClosing = `<response>
  <header>
    <resultCode>00</resultCode>
    <resultMsg>NORMAL SERVICE.</resultMsg>
  </header>
  <body>
    <items/>
    <totalCount>0</totalCount>
  </body>
</response>`;

    expect(extractXmlItems(xmlSelfClosing)).toEqual([]);

    const xmlEmptyBlock = `<response>
  <header>
    <resultCode>00</resultCode>
    <resultMsg>NORMAL SERVICE.</resultMsg>
  </header>
  <body>
    <items></items>
    <totalCount>0</totalCount>
  </body>
</response>`;

    expect(extractXmlItems(xmlEmptyBlock)).toEqual([]);
  });

  it("throws error when response is OpenAPI_ServiceResponse with returnReasonCode=31", () => {
    const xml = `<OpenAPI_ServiceResponse>
  <cmmMsgHeader>
    <errMsg>SERVICE ERROR</errMsg>
    <returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg>
    <returnReasonCode>31</returnReasonCode>
  </cmmMsgHeader>
</OpenAPI_ServiceResponse>`;

    expect(() => extractXmlItems(xml)).toThrowError(/31/);
  });

  it("throws error when resultCode is not 00 (e.g. resultCode=22)", () => {
    const xml = `<response>
  <header>
    <resultCode>22</resultCode>
    <resultMsg>LIMITED NUMBER OF SERVICE REQUESTS EXCEEDS ERROR</resultMsg>
  </header>
  <body>
    <items/>
  </body>
</response>`;

    expect(() => extractXmlItems(xml)).toThrowError(/22/);
  });
});
