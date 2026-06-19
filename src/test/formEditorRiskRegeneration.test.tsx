import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FormEditor from "@/pages/FormEditor";
import type { RiskAssessmentRow } from "@/types/formTemplate";
import { analyzeTaskToAssessment } from "@/services/assessmentAnalysisService";
import { FormLawService } from "@/services/formLawService";
import { FormService } from "@/services/formService";
import { FormHistoryService } from "@/services/formHistoryService";
import { RiskValidationAuditService } from "@/services/riskValidationAuditService";
import { RiskLegalBasisFitService } from "@/services/riskLegalBasisFitService";
import { toast } from "@/hooks/use-toast";
import * as documentBuilder from "@/lib/documentBuilder";

vi.mock("@/services/assessmentAnalysisService", () => ({
  analyzeTaskToAssessment: vi.fn(),
}));

vi.mock("@/services/formLawService", () => ({
  FormLawService: {
    searchLaws: vi.fn(async () => ({
      items: [],
      lawItems: [],
      guideItems: [],
      mediaItems: [],
      lawActionItems: [],
      status: "empty",
    })),
  },
}));

vi.mock("@/services/riskLegalBasisFitService", () => ({
  RiskLegalBasisFitService: {
    analyzeRows: vi.fn(async (input: { rows: RiskAssessmentRow[] }) => input.rows.map((row, rowIndex) => ({
      rowIndex,
      hazardType: row.hazardFactor.includes("감전") ? "감전" : "추락",
      accidentMechanism: `${row.cause} ${row.hazardFactor}`.trim(),
      unsafeCondition: row.cause,
      equipment: row.hazardFactor.includes("감전") ? ["충전부"] : ["비계", "작업발판"],
      searchTerms: row.hazardFactor.includes("감전")
        ? ["충전부 방호", "감전 방지"]
        : ["비계 작업발판", "추락 방지"],
    }))),
    reviewRows: vi.fn(async () => []),
  },
}));

vi.mock("@/services/riskValidationAuditService", () => ({
  RiskValidationAuditService: {
    writeEvents: vi.fn(async () => ({ inserted: 0 })),
  },
}));

vi.mock("@/components/layout/DashboardShell", () => ({
  DashboardShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

let latestRiskRows: RiskAssessmentRow[] = [];
let latestLegalBasisReviewRequiredByRow: boolean[] = [];
let latestLegalBasisReviewDetailsByRow: Array<{
  status: string;
  evidenceExcerpt?: string;
  applicabilityReason?: string;
  reason?: string;
} | undefined> = [];
vi.mock("@/components/forms/RiskAssessmentTable", () => ({
  RiskAssessmentTable: ({
    data,
    onChange,
    onAddRow,
    onAddRiskWithAi,
    disableAddRiskWithAi,
    isAddingRiskWithAi,
    onMatchLegalBasisWithAi,
    isMatchingLegalBasis,
    disableMatchLegalBasis,
    legalBasisReviewRequiredByRow,
    legalBasisReviewDetailsByRow,
  }: {
    data: RiskAssessmentRow[];
    onChange: (index: number, field: keyof RiskAssessmentRow, value: string | number) => void;
    onAddRow?: () => void;
    onAddRiskWithAi?: () => void;
    disableAddRiskWithAi?: boolean;
    isAddingRiskWithAi?: boolean;
    onMatchLegalBasisWithAi?: () => void;
    isMatchingLegalBasis?: boolean;
    disableMatchLegalBasis?: boolean;
    legalBasisReviewRequiredByRow?: boolean[];
    legalBasisReviewDetailsByRow?: Array<{
      status: string;
      evidenceExcerpt?: string;
      applicabilityReason?: string;
      reason?: string;
    } | undefined>;
  }) => {
    latestRiskRows = data;
    latestLegalBasisReviewRequiredByRow = legalBasisReviewRequiredByRow ?? [];
    latestLegalBasisReviewDetailsByRow = legalBasisReviewDetailsByRow ?? [];
    return (
      <div>
        <div data-testid="risk-table-row-count">{data.length}</div>
        {onAddRow && (
          <button type="button" onClick={onAddRow}>
            행 추가
          </button>
        )}
        {onAddRiskWithAi && (
          <button
            type="button"
            onClick={onAddRiskWithAi}
            disabled={Boolean(disableAddRiskWithAi || isAddingRiskWithAi)}
          >
            AI로 위험성 추가
          </button>
        )}
        {onMatchLegalBasisWithAi && (
          <button
            type="button"
            onClick={onMatchLegalBasisWithAi}
            disabled={Boolean(disableMatchLegalBasis || isMatchingLegalBasis)}
          >
            AI로 적합한 법령 찾기
          </button>
        )}
        {data.length > 0 && (
          <button
            type="button"
            onClick={() =>
              onChange(0, "legalBasis", "산업안전보건기준에 관한 규칙 제13조(추락 위험 방지)")
            }
          >
            행1 법적기준 입력
          </button>
        )}
        {data.length > 0 && (
          <button
            type="button"
            onClick={() => onChange(0, "cause", `${data[0]?.cause ?? ""} (edited)`)}
          >
            행1 원인 수정
          </button>
        )}
      </div>
    );
  },
}));

vi.mock("@/components/forms/AccidentReportForm", () => ({
  AccidentReportForm: () => <div>accident-form</div>,
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
}));

function buildRiskAssessmentFixture(taskName: string, taskDescription: string, scenario = taskDescription) {
  return {
    id: `assessment-${taskName}`,
    taskName,
    taskDescription,
    profile: {
      industry: "건설업",
      workLocation: "?꾩옣",
      equipment: ["?λ퉬"],
      hazards: [
        {
          id: "hazard-1",
          name: "?꾪뿕?붿씤",
          type: "?묒뾽?뱀꽦 ?붿씤",
          weight: 30,
          confidence: "medium",
          reason: taskDescription,
        },
      ],
    },
    analysis: {
      scenario,
      immediateActions: [{ id: "A1", action: "利됱떆 議곗튂瑜??쒗뻾?쒕떎.", priority: 1 }],
      improvements: [{ id: "I1", action: "?щ컻諛⑹? ?梨낆쓣 ?섎┰?쒕떎.", category: "관리" }],
      score: 0,
      level: "low",
      fatalityCases: [],
    },
    evidenceItems: [],
    lawActionItems: [],
  } as any;
}

function fillRequiredInputs(taskName: string, context: string) {
  const textboxes = screen.getAllByRole("textbox");
  fireEvent.change(textboxes[0], { target: { value: taskName } });
  fireEvent.change(textboxes[1], { target: { value: context } });
}

function createRiskRowSeed(partial: Partial<RiskAssessmentRow>): RiskAssessmentRow {
  return {
    workProcess: partial.workProcess ?? "?ㅻ퉬 ?먭?",
    category: partial.category ?? "?묒뾽?뱀꽦 ?붿씤",
    cause: partial.cause ?? "",
    hazardFactor: partial.hazardFactor ?? "",
    legalBasis: partial.legalBasis ?? "",
    currentMeasure: partial.currentMeasure ?? "?꾩옣 ?곹깭瑜??먭??쒕떎.",
    frequency: partial.frequency ?? 3,
    severity: partial.severity ?? 3,
    riskLevel: partial.riskLevel ?? "9(蹂댄넻)",
    reductionMeasure: partial.reductionMeasure ?? "媛쒖꽑 議곗튂瑜??쒗뻾?쒕떎.",
    improvementDate: partial.improvementDate ?? "",
    completionDate: partial.completionDate ?? "",
    responsiblePerson: partial.responsiblePerson ?? "",
    validationStatus: partial.validationStatus,
    reviewRequiredFields: partial.reviewRequiredFields,
    reviewReasonCodes: partial.reviewReasonCodes,
    expectedHazardType: partial.expectedHazardType,
    detectedHazardType: partial.detectedHazardType,
  };
}

describe("FormEditor risk assessment regeneration flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    latestRiskRows = [];
    latestLegalBasisReviewRequiredByRow = [];
    (URL as any).createObjectURL = vi.fn(() => "blob:mock-risk-report");
    (URL as any).revokeObjectURL = vi.fn();
    vi.mocked(FormLawService.searchLaws).mockResolvedValue({
      items: [],
      lawItems: [],
      guideItems: [],
      mediaItems: [],
      lawActionItems: [],
      status: "empty",
    });
    vi.mocked(RiskValidationAuditService.writeEvents).mockResolvedValue({ inserted: 0 });
  });

  it("replaces existing rows with newly generated rows on rerun", async () => {
    const firstFixture = buildRiskAssessmentFixture(
      "1李??앹꽦",
      "?묒뾽?먭? 湲덉냽 ?덈떒湲곕? ?ъ슜??泥좎옱瑜??덈떒?섎뒗 ?숈븞 蹂댄샇??컻瑜???梨??먯씠 ?덈떒?좎뿉 ?묎렐?섍퀬 ?뚰렪 鍮꾩궛 媛?μ꽦???믪븘吏??곹깭?먯꽌 ?μ떆媛??묒뾽???섑뻾?쒕떎.",
    );
    const secondFixture = buildRiskAssessmentFixture(
      "2李??앹꽦",
      "?묒뾽?먭? ?꾩썝 李⑤떒 ?놁씠 ?ㅻ퉬 ?먭???吏꾪뻾?섏뿬 媛먯쟾 ?꾪뿕???덈뒗 ?곹깭??",
    );
    const emptyLawContext = { lawItems: [], lawActionItems: [] };
    const expectedFirstCount = FormService.mapAssessmentToRiskForm(firstFixture, emptyLawContext).length;
    const expectedSecondCount = FormService.mapAssessmentToRiskForm(secondFixture, emptyLawContext).length;

    vi.mocked(analyzeTaskToAssessment)
      .mockResolvedValueOnce(firstFixture)
      .mockResolvedValueOnce(secondFixture);

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "?덈떒 ?묒뾽",
      "?묒뾽?먭? 湲덉냽 ?덈떒湲곕? ?ъ슜??泥좎옱瑜??덈떒?섎뒗 ?숈븞 蹂댄샇??컻瑜???梨??먯씠 ?덈떒?좎뿉 ?묎렐?섍퀬 ?뚰렪 鍮꾩궛 媛?μ꽦???믪븘吏??곹깭?먯꽌 ?μ떆媛??묒뾽???섑뻾?쒕떎.",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(1);
      expect(latestRiskRows.length).toBeGreaterThan(0);
    });
    const firstGenerationCount = latestRiskRows.length;
    const firstGenerationSignature = latestRiskRows.map((row) => `${row.cause}|${row.hazardFactor}`).join("||");

    fillRequiredInputs("媛먯쟾 ?먭? ?묒뾽", "?묒뾽?먭? ?꾩썝 李⑤떒 ?놁씠 ?ㅻ퉬 ?먭???吏꾪뻾?섏뿬 媛먯쟾 ?꾪뿕???덈뒗 ?곹깭??");
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(2);
    });

    const secondGenerationCount = latestRiskRows.length;
    const secondGenerationSignature = latestRiskRows.map((row) => `${row.cause}|${row.hazardFactor}`).join("||");

    expect(firstGenerationCount).toBe(expectedFirstCount);
    expect(secondGenerationCount).toBe(expectedSecondCount);
    expect(secondGenerationSignature).not.toBe(firstGenerationSignature);
  });

  it("keeps previous rows when rerun fails", async () => {
    vi.mocked(analyzeTaskToAssessment)
      .mockResolvedValueOnce(
        buildRiskAssessmentFixture(
          "珥덇린 ?앹꽦",
          "?묒뾽?먭? ?대룞??鍮꾧퀎 ?꾩뿉???먭? ?묒뾽???섑뻾?섎뒗 怨쇱젙?먯꽌 諛쒗뙋 怨좎젙??誘명씉?섍퀬 ?덉쟾? 泥닿껐???꾨씫?????덈뒗 ?곹깭??",
        ),
      )
      .mockRejectedValueOnce(new Error("forced second-pass failure"));

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "鍮꾧퀎 ?먭? ?묒뾽",
      "?묒뾽?먭? ?대룞??鍮꾧퀎 ?꾩뿉???먭? ?묒뾽???섑뻾?섎뒗 怨쇱젙?먯꽌 諛쒗뙋 怨좎젙??誘명씉?섍퀬 ?덉쟾? 泥닿껐???꾨씫?????덈뒗 ?곹깭??",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(1);
      expect(latestRiskRows.length).toBeGreaterThan(0);
    });
    const preservedSignature = latestRiskRows.map((row) => `${row.cause}|${row.hazardFactor}`).join("||");

    fillRequiredInputs(
      "비계 작업 상세",
      "?ъ떎???붿껌: ?묒뾽?먭? ?대룞??鍮꾧퀎 ?꾩뿉???먭? ?묒뾽???섑뻾?섎뒗 怨쇱젙?먯꽌 諛쒗뙋 怨좎젙??誘명씉?섍퀬 ?덉쟾? 泥닿껐???꾨씫?????덈뒗 ?곹깭??",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(2);
      expect(screen.getByText(/forced second-pass failure/i)).toBeInTheDocument();
    });

    const currentSignature = latestRiskRows.map((row) => `${row.cause}|${row.hazardFactor}`).join("||");
    expect(currentSignature).toBe(preservedSignature);
  });

  it("adds one non-duplicate risk row via AI add button", async () => {
    const firstFixture = buildRiskAssessmentFixture(
      "?덈떒 ?묒뾽",
      "?묒뾽?먭? ?덈떒湲?諛⑺샇??컻瑜????곹깭濡??덈떒 ?묒뾽??吏꾪뻾?섏뿬 ?먯씠 ?뚯쟾?좎뿉 ?묎렐??媛?μ꽦???믪? ?곹깭??",
    );
    const addFixture = buildRiskAssessmentFixture(
      "媛먯쟾 ?먭? ?묒뾽",
      "?묒뾽?먭? ?꾩썝 李⑤떒 ?놁씠 諛곗쟾諛??대? ?먭???吏꾪뻾?섎㈃??異⑹쟾遺媛 ?몄텧?섏뼱 媛먯쟾 ?꾪뿕??而ㅼ쭊 ?곹깭??",
    );

    vi.mocked(analyzeTaskToAssessment)
      .mockResolvedValueOnce(firstFixture)
      .mockResolvedValueOnce(addFixture);

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "?덈떒 ?묒뾽",
      "?묒뾽?먭? ?덈떒湲?諛⑺샇??컻瑜????곹깭濡??덈떒 ?묒뾽??吏꾪뻾?섏뿬 ?먯씠 ?뚯쟾?좎뿉 ?묎렐??媛?μ꽦???믪? ?곹깭??",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(1);
      expect(latestRiskRows.length).toBeGreaterThan(0);
    });
    const beforeCount = latestRiskRows.length;

    fireEvent.click(screen.getByRole("button", { name: /^AI로 위험성 추가$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(2);
      expect(latestRiskRows.length).toBe(beforeCount + 1);
    });
  });

  it("fills trailing empty row first when adding AI risk", async () => {
    const firstFixture = buildRiskAssessmentFixture(
      "吏寃뚯감 ?묒뾽",
      "?묒뾽?먭? 吏寃뚯감 ?꾩쭊 ?숈꽑?먯꽌 蹂댄뻾??遺꾨━ ?놁씠 ?대컲 ?묒뾽???섑뻾?섎뒗 ?곹깭??",
    );
    const addFixture = buildRiskAssessmentFixture(
      "?숉븯臾??꾪뿕 ?묒뾽",
      "?곷? ?먯옱 怨좎젙??誘명씉???숉븯臾?異⑸룎 ?꾪뿕??利앷????곹깭?먯꽌 ?섎? ?묒뾽??吏꾪뻾?섎뒗 ?곹솴?대떎.",
    );

    vi.mocked(analyzeTaskToAssessment)
      .mockResolvedValueOnce(firstFixture)
      .mockResolvedValueOnce(addFixture);

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "吏寃뚯감 ?묒뾽",
      "?묒뾽?먭? 吏寃뚯감 ?꾩쭊 ?숈꽑?먯꽌 蹂댄뻾??遺꾨━ ?놁씠 ?대컲 ?묒뾽???섑뻾?섎뒗 ?곹깭??",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(1);
      expect(latestRiskRows.length).toBeGreaterThan(0);
    });

    const generatedCount = latestRiskRows.length;
    fireEvent.click(screen.getByRole("button", { name: "행 추가" }));

    await waitFor(() => {
      expect(latestRiskRows.length).toBe(generatedCount + 1);
    });

    fireEvent.click(screen.getByRole("button", { name: /^AI로 위험성 추가$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(2);
      expect(latestRiskRows.length).toBe(generatedCount + 1);
    });
  });

  it("keeps rows unchanged and shows toast when AI add candidates are all duplicates", async () => {
    const fixture = buildRiskAssessmentFixture(
      "鍮꾧퀎 ?묒뾽",
      "?묒뾽?먭? 鍮꾧퀎 怨좎젙 ?먭? ?놁씠 怨좎냼 ?묒뾽??吏꾪뻾?섏뿬 異붾씫 ?꾪뿕??利앷????곹깭??",
    );

    vi.mocked(analyzeTaskToAssessment)
      .mockResolvedValueOnce(fixture)
      .mockResolvedValueOnce(fixture)
      .mockResolvedValueOnce(fixture);

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "鍮꾧퀎 ?묒뾽",
      "?묒뾽?먭? 鍮꾧퀎 怨좎젙 ?먭? ?놁씠 怨좎냼 ?묒뾽??吏꾪뻾?섏뿬 異붾씫 ?꾪뿕??利앷????곹깭??",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(1);
      expect(latestRiskRows.length).toBeGreaterThan(0);
    });
    const beforeSignature = latestRiskRows.map((row) => `${row.cause}|${row.hazardFactor}`).join("||");

    fireEvent.click(screen.getByRole("button", { name: /^AI로 위험성 추가$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(3);
    });

    const afterSignature = latestRiskRows.map((row) => `${row.cause}|${row.hazardFactor}`).join("||");
    expect(afterSignature).toBe(beforeSignature);
    expect(vi.mocked(toast)).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "추가할 신규 위험요소 없음",
      }),
    );
  });

  it("retries AI add with novelty guidance and adds row when second attempt is non-duplicate", async () => {
    const initialFixture = buildRiskAssessmentFixture(
      "??쑨???臾믩씜",
      "?臾믩씜?癒? ??쑨???⑥쥙???癒? ??곸뵠 ?⑥쥙???臾믩씜??筌욊쑵六??뤿연 ?곕뗀???袁る퓮??筌앹빓????怨밴묶??",
    );
    const duplicateFixture = buildRiskAssessmentFixture(
      "??쑨???臾믩씜",
      "?臾믩씜?癒? ??쑨???⑥쥙???癒? ??곸뵠 ?⑥쥙???臾믩씜??筌욊쑵六??뤿연 ?곕뗀???袁る퓮??筌앹빓????怨밴묶??",
    );
    const nonDuplicateFixture = buildRiskAssessmentFixture(
      "揶쏅Ŋ???癒? ?臾믩씜",
      "?臾믩씜?癒? ?袁⑹뜚 筌△뫀????곸뵠 獄쏄퀣?얕쳸???? ?癒???筌욊쑵六??롢늺???겸뫗?얗겫?揶쎛 ?紐꾪뀱??뤿선 揶쏅Ŋ???袁る퓮???뚣끉彛??怨밴묶??",
    );

    vi.mocked(analyzeTaskToAssessment)
      .mockResolvedValueOnce(initialFixture)
      .mockResolvedValueOnce(duplicateFixture)
      .mockResolvedValueOnce(nonDuplicateFixture);

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "??쑨???臾믩씜",
      "?臾믩씜?癒? ??쑨???⑥쥙???癒? ??곸뵠 ?⑥쥙???臾믩씜??筌욊쑵六??뤿연 ?곕뗀???袁る퓮??筌앹빓????怨밴묶??",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(1);
      expect(latestRiskRows.length).toBeGreaterThan(0);
    });
    const beforeCount = latestRiskRows.length;

    fireEvent.click(screen.getByRole("button", { name: /^AI로 위험성 추가$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(3);
      expect(latestRiskRows.length).toBe(beforeCount + 1);
    });

    const addFirstAttemptInput = vi.mocked(analyzeTaskToAssessment).mock.calls[1]?.[0];
    const addSecondAttemptInput = vi.mocked(analyzeTaskToAssessment).mock.calls[2]?.[0];
    expect(addFirstAttemptInput?.formTemplateHint).toContain("[AI add risk guidance]");
    expect(addSecondAttemptInput?.formTemplateHint).toContain("[retry-novelty]");
  });

  it("automatically analyzes row context and fills legalBasis during initial generation", async () => {
    const fixture = buildRiskAssessmentFixture(
      "비계 작업",
      "작업자가 고소작업 중 비계 고정 상태를 점검하는 과정에서 추락 위험이 증가한 상태이다.",
    );

    vi.mocked(analyzeTaskToAssessment).mockResolvedValueOnce(fixture);
    vi.mocked(FormLawService.searchLaws).mockResolvedValueOnce({
      items: [],
      lawItems: [
        {
          id: "law-storage-42",
          type: "law",
          sourceBadge: "법령",
          title: "제42조(추락의 방지)",
          relevanceScore: 98,
          summaryBullets: ["작업발판 추락 방지 조치"],
          keywords: ["비계", "작업발판", "추락", "고정"],
          sourceType: "storage",
          legalBasis: "산업안전보건기준에 관한 규칙 제42조(추락의 방지)",
          articleNumber: "제42조",
          articleTitle: "추락의 방지",
          clausePreview: "근로자가 추락할 위험이 있는 장소에는 방지 조치를 해야 한다.",
        },
      ],
      guideItems: [],
      mediaItems: [],
      lawActionItems: [],
      status: "success",
    });

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "비계 작업",
      "작업자가 고소작업 중 비계 고정 상태를 점검하는 과정에서 추락 위험이 증가한 상태이다.",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(RiskLegalBasisFitService.analyzeRows)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(FormLawService.searchLaws)).toHaveBeenCalledTimes(1);
      expect(latestRiskRows.length).toBeGreaterThan(0);
    });
    expect(latestRiskRows.some((row) => row.legalBasis.includes("제42조"))).toBe(true);
  });

  it("keeps the best DB or Storage legal candidate visible when AI review is required", async () => {
    const fixture = buildRiskAssessmentFixture(
      "비계 작업",
      "작업자가 고소작업 중 비계 고정 상태를 점검하는 과정에서 추락 위험이 증가한 상태이다.",
    );

    vi.mocked(analyzeTaskToAssessment).mockResolvedValueOnce(fixture);
    vi.mocked(FormLawService.searchLaws).mockResolvedValueOnce({
      items: [],
      lawItems: [
        {
          id: "law-db-42",
          type: "law",
          sourceBadge: "법령",
          title: "제42조(추락의 방지)",
          relevanceScore: 88,
          summaryBullets: ["작업발판 추락 방지 조치"],
          keywords: ["비계", "작업발판", "추락", "고정"],
          sourceType: "db",
          legalBasis: "산업안전보건기준에 관한 규칙 제42조(추락의 방지)",
          articleNumber: "제42조",
          articleTitle: "추락의 방지",
          clausePreview: "근로자가 추락할 위험이 있는 장소에는 방지 조치를 해야 한다.",
        },
      ],
      guideItems: [],
      mediaItems: [],
      lawActionItems: [],
      status: "success",
    });
    vi.mocked(RiskLegalBasisFitService.reviewRows).mockResolvedValueOnce([
      {
        rowIndex: 0,
        recommendedLegalBasis: "산업안전보건기준에 관한 규칙 제42조(추락의 방지)",
        status: "review_required",
        score: 45,
        reason: "DB 원문 후보이나 자동 확정 기준에는 미달합니다.",
        evidenceExcerpt: "근로자가 추락할 위험이 있는 장소에는 방지 조치를 해야 한다.",
        applicabilityReason: "비계 작업발판 추락 위험과 관련되지만 적용 조건은 수동 확인이 필요합니다.",
        reviewSource: "deterministic_fallback",
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "비계 작업",
      "작업자가 고소작업 중 비계 고정 상태를 점검하는 과정에서 추락 위험이 증가한 상태이다.",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(latestRiskRows[0]?.legalBasis).toContain("제42조");
      expect(latestLegalBasisReviewRequiredByRow[0]).toBe(true);
      expect(latestLegalBasisReviewDetailsByRow[0]).toEqual(expect.objectContaining({
        status: "review_required",
        evidenceExcerpt: expect.stringContaining("추락할 위험"),
      }));
    });
  });

  it("reports when a verified deterministic fallback is used after AI review timeout", async () => {
    const fixture = buildRiskAssessmentFixture(
      "비계 작업",
      "작업자가 고소작업 중 비계 고정 상태를 점검하는 과정에서 추락 위험이 증가한 상태이다.",
    );
    vi.mocked(analyzeTaskToAssessment).mockResolvedValueOnce(fixture);
    vi.mocked(FormLawService.searchLaws).mockResolvedValueOnce({
      items: [],
      lawItems: [
        {
          id: "law-storage-42",
          type: "law",
          sourceBadge: "법령",
          title: "제42조(추락의 방지)",
          relevanceScore: 98,
          summaryBullets: ["작업발판 추락 방지 조치"],
          keywords: ["비계", "작업발판", "추락", "고정"],
          sourceType: "storage",
          legalBasis: "산업안전보건기준에 관한 규칙 제42조(추락의 방지)",
          articleNumber: "제42조",
          articleTitle: "추락의 방지",
        },
      ],
      guideItems: [],
      mediaItems: [],
      lawActionItems: [],
      status: "success",
    });
    vi.mocked(RiskLegalBasisFitService.reviewRows).mockResolvedValueOnce([
      {
        rowIndex: 0,
        recommendedLegalBasis: "산업안전보건기준에 관한 규칙 제42조(추락의 방지)",
        status: "verified",
        score: 90,
        reason: "검증된 원문 후보입니다.",
        reviewSource: "deterministic_fallback",
        fallbackReason: "timeout",
      },
    ]);

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "비계 작업",
      "작업자가 고소작업 중 비계 고정 상태를 점검하는 과정에서 추락 위험이 증가한 상태이다.",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        description: expect.stringContaining("검증 대체 1건"),
      }));
    });
  });

  it("does not auto rematch legal basis when row content is edited", async () => {
    const fixture = buildRiskAssessmentFixture(
      "비계 작업",
      "작업자가 고소작업 중 비계 고정 상태를 점검하는 과정에서 추락 위험이 증가한 상태이다.",
    );

    vi.mocked(analyzeTaskToAssessment).mockResolvedValueOnce(fixture);

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "비계 작업",
      "작업자가 고소작업 중 비계 고정 상태를 점검하는 과정에서 추락 위험이 증가한 상태이다.",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(1);
      expect(latestRiskRows.length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "행1 법적기준 입력" }));
    expect(latestRiskRows[0]?.legalBasis).toBe("산업안전보건기준에 관한 규칙 제13조(추락 위험 방지)");

    fireEvent.click(screen.getByRole("button", { name: "행1 원인 수정" }));

    await waitFor(() => {
      expect(vi.mocked(FormLawService.searchLaws)).toHaveBeenCalledTimes(1);
      expect(latestRiskRows[0]?.legalBasis).toBe("");
    });
  });

  it("keeps legalBasis empty and marks review-required when matching fails", async () => {
    const fixture = buildRiskAssessmentFixture(
      "비계 작업",
      "작업자가 고소작업 중 비계 고정 상태를 점검하는 과정에서 추락 위험이 증가한 상태이다.",
    );

    vi.mocked(analyzeTaskToAssessment).mockResolvedValueOnce(fixture);
    vi.mocked(RiskLegalBasisFitService.analyzeRows).mockRejectedValueOnce(new Error("forced legal-match failure"));

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "비계 작업",
      "작업자가 고소작업 중 비계 고정 상태를 점검하는 과정에서 추락 위험이 증가한 상태이다.",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(1);
      expect(latestRiskRows.length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(vi.mocked(FormLawService.searchLaws)).not.toHaveBeenCalled();
      expect(vi.mocked(toast)).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "AI 서식 생성 완료",
        }),
      );
    });
    expect(latestRiskRows.every((row) => row.legalBasis === "")).toBe(true);
    expect(latestLegalBasisReviewRequiredByRow.some(Boolean)).toBe(true);
  });

  it("keeps non-failed rows generated and allows DOCX download when one row is review_required", async () => {
    const fixture = buildRiskAssessmentFixture(
      "전기 배선 점검",
      "분전반 점검 작업 중 전원 차단 확인이 미흡한 상태에서 배선을 점검하는 상황이다.",
    );
    vi.mocked(analyzeTaskToAssessment).mockResolvedValueOnce(fixture);

    const reviewRow = createRiskRowSeed({
      category: "전기적 요인",
      cause: "점검 작업 중 충전부 노출 상태에서 감전 사고가 발생할 수 있음",
      hazardFactor: "충전부 노출로 감전 위험 증가",
      currentMeasure: "안전대 및 추락방지 보호구 착용 상태를 확인한다.",
      reductionMeasure: "누전차단기 정격 감도를 재설정하고 정기 시험을 실시한다.",
      validationStatus: "review_required",
      reviewRequiredFields: ["currentMeasure"],
      reviewReasonCodes: ["current_measure_mismatch"],
      expectedHazardType: "감전",
      detectedHazardType: "추락",
    });
    const okRow = createRiskRowSeed({
      category: "전기적 요인",
      cause: "전원 격리 미확인 상태에서 충전부 접촉으로 감전 사고가 발생할 수 있음",
      hazardFactor: "충전부 노출로 감전 위험 증가",
      currentMeasure: "충전부 노출과 전원 차단 상태를 점검한다.",
      reductionMeasure: "잠금표지 후 전원 차단 상태를 재확인한다.",
      validationStatus: "ok",
      reviewRequiredFields: [],
      reviewReasonCodes: [],
      expectedHazardType: "감전",
      detectedHazardType: "감전",
    });
    const validationSummary = {
      totalRows: 2,
      reviewRequiredRows: 1,
      okRows: 1,
      hazardTypeCounts: { 감전: 2 },
    };
    const validationEvents = [
      {
        timestamp: "2026-04-17T00:00:00.000Z",
        siteName: "현장명",
        formType: "risk-assessment",
        rowIndex: 0,
        expectedHazardType: "감전",
        detectedHazardType: "추락",
        field: "currentMeasure",
        reasonCode: "current_measure_mismatch",
        rewritten: true,
        finalStatus: "review_required",
      },
    ];

    const mapDetailedSpy = vi
      .spyOn(FormService, "mapAssessmentToRiskFormDetailed")
      .mockReturnValue({
        rows: [reviewRow, okRow],
        validationSummary,
        validationEvents: validationEvents as any,
      });
    const revalidateSpy = vi
      .spyOn(FormService, "revalidateRiskAssessmentRows")
      .mockReturnValue({
        rows: [reviewRow, okRow],
        validationSummary,
        validationEvents: [],
      });
    const docxSpy = vi
      .spyOn(documentBuilder, "buildRiskAssessmentDocxBlob")
      .mockReturnValue(new Blob(["risk-report"]));
    const historySpy = vi
      .spyOn(FormHistoryService, "createRiskHistoryRecord")
      .mockResolvedValue({
        id: "history-review-row-1",
        formType: "risk-assessment",
        taskName: "전기 배선 점검",
        siteName: "",
        workDate: "",
        createdAt: "2026-04-17T00:00:00.000Z",
        expiresAt: "2026-05-17T00:00:00.000Z",
        rowCount: 2,
      });

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "전기 배선 점검",
      "분전반 점검 작업 중 전원 차단 확인이 미흡한 상태에서 배선을 점검하는 상황이다.",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(1);
      expect(latestRiskRows).toHaveLength(2);
    });

    expect(latestRiskRows[0].validationStatus).toBe("review_required");
    expect(latestRiskRows[1].validationStatus).toBe("ok");

    const downloadButton = screen.getByRole("button", { name: "법정서식(DOCX) 다운로드" });
    expect(downloadButton).toBeEnabled();

    fireEvent.click(downloadButton);

    await waitFor(() => {
      expect(docxSpy).toHaveBeenCalledTimes(1);
      expect(historySpy).toHaveBeenCalledTimes(1);
    });
    expect(historySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        riskRows: expect.any(Array),
        validationSummary: expect.objectContaining({
          reviewRequiredRows: 1,
        }),
      }),
    );
    expect(vi.mocked(RiskValidationAuditService.writeEvents)).toHaveBeenCalledTimes(1);

    mapDetailedSpy.mockRestore();
    revalidateSpy.mockRestore();
    docxSpy.mockRestore();
    historySpy.mockRestore();
  });

  it("disables AI add button when context text is shorter than 20 chars", async () => {
    const fixture = buildRiskAssessmentFixture(
      "?덈떒 ?묒뾽",
      "?묒뾽?먭? ?덈떒 ?ㅻ퉬 諛⑺샇瑜??댁젣??梨??먯옱 ?덈떒???섑뻾???덈떒 ?꾪뿕??利앷????곹깭??",
    );

    vi.mocked(analyzeTaskToAssessment).mockResolvedValueOnce(fixture);

    render(
      <MemoryRouter initialEntries={["/forms/risk-assessment"]}>
        <Routes>
          <Route path="/forms/:formType" element={<FormEditor />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredInputs(
      "?덈떒 ?묒뾽",
      "?묒뾽?먭? ?덈떒 ?ㅻ퉬 諛⑺샇瑜??댁젣??梨??먯옱 ?덈떒???섑뻾???덈떒 ?꾪뿕??利앷????곹깭??",
    );
    fireEvent.click(screen.getByRole("button", { name: /^AI 분석 및 서식 자동작성$/ }));

    await waitFor(() => {
      expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(1);
      expect(latestRiskRows.length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByLabelText("현재 작업 상황 (필수)"), {
      target: { value: "吏㏃? ?낅젰" },
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^AI로 위험성 추가$/ })).toBeDisabled();
    });
    expect(vi.mocked(analyzeTaskToAssessment)).toHaveBeenCalledTimes(1);
  });
});



