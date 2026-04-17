import { describe, expect, it } from "vitest";
import {
  formatOpenApiServiceError,
  parseOpenApiServiceErrorXml,
  parseSmartSearchPayload,
} from "../../supabase/functions/_shared/smart-search-parser";

describe("smartSearch parser", () => {
  it("parses mixed items/total_media structure and metadata fields", () => {
    const parsed = parseSmartSearchPayload({
      response: {
        header: {
          resultCode: "00",
          resultMsg: "NORMAL_SERVICE",
        },
        body: {
          associated_word: ["산업안전보건", "KOSHA"],
          categorycount: { "1": 4, "6": "12", "7": 3 },
          totalCount: "19",
          pageNo: 1,
          numOfRows: "20",
          dataType: "JSON",
          total_media: [
            { category: "6", title: "OPS", media_style: "OPS" },
          ],
          items: {
            item: [
              { category: "1", title: "산업안전보건법 제1조", doc_id: "LAW-1" },
              { category: "7", title: "KOSHA GUIDE", doc_id: "GUIDE-1" },
            ],
          },
        },
      },
    });

    expect(parsed.hasContractShape).toBe(true);
    expect(parsed.headerCode).toBe("00");
    expect(parsed.headerMessage).toBe("NORMAL_SERVICE");
    expect(parsed.associatedWords).toEqual(["산업안전보건", "KOSHA"]);
    expect(parsed.categoryCount).toEqual({ "1": 4, "6": 12, "7": 3 });
    expect(parsed.totalCount).toBe(19);
    expect(parsed.pageNo).toBe(1);
    expect(parsed.numOfRows).toBe(20);
    expect(parsed.dataType).toBe("JSON");
    expect(parsed.media).toHaveLength(1);
    expect(parsed.items).toHaveLength(2);
  });

  it("accepts single-object items payload", () => {
    const parsed = parseSmartSearchPayload({
      response: {
        body: {
          items: {
            item: { category: "4", title: "산업안전보건기준에 관한 규칙 제20조" },
          },
        },
      },
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.category).toBe("4");
  });

  it("accepts root-level header/body schema", () => {
    const parsed = parseSmartSearchPayload({
      header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
      body: {
        total_media: [{ category: "6", title: "OPS-1" }],
        items: { item: [{ category: "1", title: "법령-1" }] },
        totalCount: 2,
      },
    });

    expect(parsed.hasContractShape).toBe(true);
    expect(parsed.media).toHaveLength(1);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.totalCount).toBe(2);
  });

  it("parses nested total_media.media list", () => {
    const parsed = parseSmartSearchPayload({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
        body: {
          total_media: {
            media: [{ category: "6", title: "OPS-1" }],
          },
        },
      },
    });

    expect(parsed.media).toHaveLength(1);
    expect(parsed.media[0]?.category).toBe("6");
  });

  it("parses stringified json payload", () => {
    const parsed = parseSmartSearchPayload(JSON.stringify({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
        body: {
          items: { item: [{ category: "7", title: "Guide-1" }] },
        },
      },
    }));

    expect(parsed.hasContractShape).toBe(true);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.category).toBe("7");
  });

  it("marks unknown schema as no contract shape", () => {
    const parsed = parseSmartSearchPayload({ message: "ok" });
    expect(parsed.hasContractShape).toBe(false);
    expect(parsed.items).toHaveLength(0);
    expect(parsed.media).toHaveLength(0);
  });

  it("extracts OpenAPI XML error returnAuthMsg/returnReasonCode", () => {
    const xml = [
      "<OpenAPI_ServiceResponse>",
      "<cmmMsgHeader>",
      "<errMsg>SERVICE ERROR</errMsg>",
      "<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg>",
      "<returnReasonCode>30</returnReasonCode>",
      "</cmmMsgHeader>",
      "</OpenAPI_ServiceResponse>",
    ].join("");

    const parsed = parseOpenApiServiceErrorXml(xml);
    expect(parsed).toEqual({
      errMsg: "SERVICE ERROR",
      returnAuthMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
      returnReasonCode: "30",
    });
    expect(formatOpenApiServiceError(xml)).toBe("OPENAPI_SERVICE_KEY_IS_NOT_REGISTERED_ERROR:30");
  });

  it("returns null for non-xml error text", () => {
    expect(parseOpenApiServiceErrorXml("Proxy Error")).toBeNull();
    expect(formatOpenApiServiceError("Proxy Error")).toBeNull();
  });
});
