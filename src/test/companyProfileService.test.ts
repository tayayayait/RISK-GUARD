import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeBackend } from "@/services/edgeFunctionClient";
import { CompanyProfileService } from "@/services/companyProfileService";

vi.mock("@/services/edgeFunctionClient", () => ({
  invokeBackend: vi.fn(),
}));

describe("CompanyProfileService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("upsert success path writes server value to cache", async () => {
    vi.mocked(invokeBackend).mockResolvedValue({
      item: {
        businessNumber: "123-45-67890",
        managementNumber: "A-001",
        businessName: "리스크가드 본사",
        industry: "제조업",
        headquartersAddress: "서울시 중구 1",
        updatedAt: "2026-04-13T10:00:00.000Z",
      },
    });

    const result = await CompanyProfileService.upsert({
      businessNumber: "1234567890",
      managementNumber: "A-001",
      businessName: "리스크가드 본사",
      industry: "제조업",
      headquartersAddress: "서울시 중구 1",
    });

    expect(result.source).toBe("server");
    expect(result.item?.businessNumber).toBe("123-45-67890");
    expect(CompanyProfileService.getCachedCompanyProfile()?.businessName).toBe("리스크가드 본사");
  });

  it("upsert fallback path stores local cache when backend is unavailable", async () => {
    vi.mocked(invokeBackend).mockResolvedValue(null);

    const result = await CompanyProfileService.upsert({
      businessNumber: "9876543210",
      managementNumber: "B-002",
      businessName: "현장관리센터",
      industry: "건설업",
      headquartersAddress: "부산시 해운대구 2",
    });

    expect(result.source).toBe("local");
    expect(result.item?.businessNumber).toBe("987-65-43210");
    expect(CompanyProfileService.getCachedCompanyProfile()?.businessName).toBe("현장관리센터");
  });

  it("getByBusinessNumber returns local cache when server request fails", async () => {
    window.localStorage.setItem(
      "risk-guard:company-profile:cache:v1",
      JSON.stringify({
        businessNumber: "123-45-67890",
        managementNumber: "A-001",
        businessName: "캐시 사업장",
        industry: "서비스업",
        headquartersAddress: "대전시 서구 3",
      }),
    );
    vi.mocked(invokeBackend).mockResolvedValue(null);

    const result = await CompanyProfileService.getByBusinessNumber("1234567890");

    expect(result.source).toBe("local");
    expect(result.item?.businessName).toBe("캐시 사업장");
  });

  it("getLatestProfile returns none when no cache exists", async () => {
    const result = await CompanyProfileService.getLatestProfile();
    expect(result.source).toBe("none");
    expect(result.item).toBeNull();
  });
});

