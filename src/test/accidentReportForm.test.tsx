import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccidentReportForm } from "@/components/forms/AccidentReportForm";
import type { AccidentReportData } from "@/types/formTemplate";

const sampleData: AccidentReportData = {
  administrativeInfo: {
    receiptNumber: "",
    receiptDate: "",
    processingDate: "",
    processingPeriodDays: "14",
    writerName: "",
    writerPhone: "",
    writtenYear: "2026",
    writtenMonth: "4",
    writtenDay: "13",
    employerName: "",
    workerRepresentativeName: "",
    laborOfficeName: "",
  },
  businessInfo: {
    businessName: "리스크가드 본사",
    businessNumber: "123-45-67890",
    managementNumber: "A-001",
    workersCount: "100",
    industry: "제조업",
    address: "서울 중구 1",
    subcontractorInfo: {
      businessName: "",
      managementNumber: "",
    },
    dispatchedInfo: {
      businessName: "",
      managementNumber: "",
    },
    constructionInfo: {
      orderer: "",
      principalBusinessName: "",
      principalManagementNumber: "",
      constructionSiteName: "",
      constructionType: "",
      progressRate: "",
      constructionAmount: "",
    },
  },
  victimInfo: {
    name: "홍길동",
    residentNumber: "",
    address: "",
    phone: "010-0000-0000",
    nationality: "대한민국",
    nationalityType: "domestic",
    visaType: "",
    jobTitle: "정비공",
    hireDate: "",
    experienceYears: "",
    experienceMonths: "",
    employmentType: "regular",
    workType: "regular",
    injuryType: "골절",
    injuryPart: "팔",
    expectedRestDays: "30",
    isDead: false,
  },
  accidentDetails: {
    occurredDate: {
      year: "2026",
      month: "04",
      day: "13",
      dayOfWeek: "월",
      hour: "10",
      minute: "10",
    },
    location: "A동",
    workType: "정비",
    workTiming: "during_work",
    situation: "사고 상황",
    cause: ["원인1"],
  },
  preventionPlan: {
    plan: "재발방지 계획",
    requestTechnicalSupport: false,
    consentPersonalData: false,
  },
  legalViolations: [],
};

function clickPseudoCheckbox(labelText: string) {
  const label = screen.getByText(labelText).closest("label");
  expect(label).not.toBeNull();
  const clickArea = label?.querySelector("div");
  expect(clickArea).not.toBeNull();
  fireEvent.click(clickArea as HTMLDivElement);
}

describe("AccidentReportForm", () => {
  it("renders fixed business fields as disabled", () => {
    render(
      <AccidentReportForm
        data={sampleData}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue(sampleData.businessInfo.businessName)).toBeDisabled();
    expect(screen.getByDisplayValue(sampleData.businessInfo.businessNumber)).toBeDisabled();
    expect(screen.getByDisplayValue(sampleData.businessInfo.managementNumber)).toBeDisabled();
    expect(screen.getByDisplayValue(sampleData.businessInfo.industry)).toBeDisabled();
    expect(screen.getByDisplayValue(sampleData.businessInfo.address)).toBeDisabled();
  });

  it("updates checkbox fields via onChange", () => {
    const onChange = vi.fn();

    render(
      <AccidentReportForm
        data={sampleData}
        onChange={onChange}
      />,
    );

    clickPseudoCheckbox("사망");
    expect(onChange).toHaveBeenCalledWith("victimInfo.isDead", true);

    clickPseudoCheckbox("즉시 기술지원 서비스 요청");
    expect(onChange).toHaveBeenCalledWith("preventionPlan.requestTechnicalSupport", true);
  });

  it("updates dispatched employer fields via onChange", () => {
    const onChange = vi.fn();

    render(
      <AccidentReportForm
        data={sampleData}
        onChange={onChange}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("파견사업주 사업장명"), {
      target: { value: "파견사 사업장" },
    });
    fireEvent.change(screen.getByPlaceholderText("파견사업주 산재관리번호"), {
      target: { value: "D-100" },
    });

    expect(onChange).toHaveBeenCalledWith("businessInfo.dispatchedInfo.businessName", "파견사 사업장");
    expect(onChange).toHaveBeenCalledWith("businessInfo.dispatchedInfo.managementNumber", "D-100");
  });

  it("renders resident number input as a single editable field", () => {
    const dataWithResident = {
      ...sampleData,
      victimInfo: {
        ...sampleData.victimInfo,
        residentNumber: "95066298",
      },
    };

    render(
      <AccidentReportForm
        data={dataWithResident}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue("95066298")).toBeInTheDocument();
  });

  it("expands multiline textareas according to measured height", () => {
    const originalScrollHeight = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "scrollHeight");
    Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", {
      configurable: true,
      get() {
        return 180;
      },
    });

    render(
      <AccidentReportForm
        data={sampleData}
        onChange={vi.fn()}
      />,
    );

    const situationTextarea = screen.getByDisplayValue("사고 상황");
    expect((situationTextarea as HTMLTextAreaElement).style.height).toBe("180px");

    if (originalScrollHeight) {
      Object.defineProperty(HTMLTextAreaElement.prototype, "scrollHeight", originalScrollHeight);
    } else {
      delete (HTMLTextAreaElement.prototype as { scrollHeight?: number }).scrollHeight;
    }
  });
});
