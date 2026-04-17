import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, ExternalLink } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAssessment } from "@/contexts/AssessmentContext";
import type { MaterialPriorityMode, MaterialSearchFilters } from "@/types/assessment";
import {
  DEFAULT_PRIORITY_MODE,
  HAZARD_CODE_OPTIONS,
  INDUSTRY_CODE_OPTIONS,
  MATERIAL_PRIORITY_MODES,
  MATERIAL_TYPE_CODE_OPTIONS,
} from "../../supabase/functions/_shared/material-search.ts";

const ALL_OPTION = "all";
const PAGE_SIZE = 10;

type MaterialsViewMode = "recommended" | "search";
type HazardFilterMode = "all" | "selected";

type PageToken = number | "ellipsis";

function toMaterialStatusMessage(status: string) {
  if (status === "loading") return "자료를 조회하는 중입니다.";
  if (status === "success" || status === "partial") return "조회 결과가 반영되었습니다.";
  if (status === "empty") return "조건에 맞는 자료가 없습니다.";
  if (status === "error") return "자료 조회에 실패했습니다.";
  return "조회 대기 상태입니다.";
}

function buildPageTokens(totalPages: number, currentPage: number): PageToken[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }

  const tokens: PageToken[] = [1];
  if (currentPage > 3) {
    tokens.push("ellipsis");
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);
  for (let page = start; page <= end; page += 1) {
    tokens.push(page);
  }

  if (currentPage < totalPages - 2) {
    tokens.push("ellipsis");
  }

  tokens.push(totalPages);
  return tokens;
}

export default function MaterialsBoard() {
  const navigate = useNavigate();
  const { assessment, setCurrentStep, selectMaterial, reloadMaterials, generateReport } = useAssessment();

  const [viewMode, setViewMode] = useState<MaterialsViewMode>("recommended");
  const [keyword, setKeyword] = useState("");
  const [materialTypeCode, setMaterialTypeCode] = useState(ALL_OPTION);
  const [industryCode, setIndustryCode] = useState(ALL_OPTION);
  const [hazardFilterMode, setHazardFilterMode] = useState<HazardFilterMode>("all");
  const [selectedHazardCodes, setSelectedHazardCodes] = useState<string[]>([]);
  const [hazardSearchKeyword, setHazardSearchKeyword] = useState("");
  const [priorityMode, setPriorityMode] = useState<MaterialPriorityMode>(DEFAULT_PRIORITY_MODE);
  const [currentPage, setCurrentPage] = useState(1);
  const [recommendedSnapshot, setRecommendedSnapshot] = useState(assessment?.materials ?? []);
  const [hasManualSearch, setHasManualSearch] = useState(false);

  useEffect(() => {
    if (!assessment) {
      return;
    }

    setCurrentStep("materials");
    setViewMode("recommended");
    setCurrentPage(1);
    setHasManualSearch(false);
    setRecommendedSnapshot(assessment.materials);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment?.id]);

  useEffect(() => {
    if (!assessment || hasManualSearch) {
      return;
    }
    setRecommendedSnapshot(assessment.materials);
  }, [assessment, hasManualSearch]);

  if (!assessment) {
    return null;
  }

  const isSearching = assessment.apiStatuses.materials === "loading";
  const selectedHazardLabelByCode = useMemo(
    () => new Map(HAZARD_CODE_OPTIONS.map((option) => [option.code, option.label])),
    [],
  );

  const filteredHazardOptions = useMemo(() => {
    const token = hazardSearchKeyword.trim().toLowerCase();
    if (!token) {
      return HAZARD_CODE_OPTIONS;
    }

    return HAZARD_CODE_OPTIONS.filter((option) => option.label.toLowerCase().includes(token));
  }, [hazardSearchKeyword]);

  const selectedHazardLabels = useMemo(
    () => selectedHazardCodes.map((code) => selectedHazardLabelByCode.get(code) ?? code),
    [selectedHazardCodes, selectedHazardLabelByCode],
  );

  const sourceItems = useMemo(
    () => (viewMode === "recommended" ? recommendedSnapshot : assessment.materials),
    [assessment.materials, recommendedSnapshot, viewMode],
  );

  const visibleItems = useMemo(() => sourceItems.filter((item) => !item.excluded), [sourceItems]);
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));

  useEffect(() => {
    setCurrentPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const pagedItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return visibleItems.slice(start, start + PAGE_SIZE);
  }, [currentPage, visibleItems]);

  const pageTokens = useMemo(() => buildPageTokens(totalPages, currentPage), [currentPage, totalPages]);

  const isHazardSelectionInvalid = viewMode === "search"
    && hazardFilterMode === "selected"
    && selectedHazardCodes.length === 0;

  const buildFilters = (): MaterialSearchFilters => {
    const filters: MaterialSearchFilters = {
      priorityMode,
      industryScope: industryCode === ALL_OPTION ? "all" : "selected",
      hazardScope: hazardFilterMode === "all" ? "all" : "selected",
    };

    const normalizedKeyword = keyword.trim();
    if (normalizedKeyword) {
      filters.keyword = normalizedKeyword;
    }

    if (materialTypeCode !== ALL_OPTION) {
      filters.materialTypeCode = materialTypeCode;
    }

    if (industryCode !== ALL_OPTION) {
      filters.industryCodeOverride = industryCode;
    }

    if (hazardFilterMode === "selected") {
      filters.hazardCodesOverride = selectedHazardCodes.slice(0, 3);
    }

    return filters;
  };

  const runSearch = async () => {
    if (isHazardSelectionInvalid) {
      return;
    }

    setViewMode("search");
    setCurrentPage(1);
    setHasManualSearch(true);
    await reloadMaterials(buildFilters());
  };

  const resetSearch = async () => {
    setKeyword("");
    setMaterialTypeCode(ALL_OPTION);
    setIndustryCode(ALL_OPTION);
    setHazardFilterMode("all");
    setSelectedHazardCodes([]);
    setHazardSearchKeyword("");
    setPriorityMode(DEFAULT_PRIORITY_MODE);
    setViewMode("search");
    setCurrentPage(1);
    setHasManualSearch(true);

    await reloadMaterials({
      priorityMode: DEFAULT_PRIORITY_MODE,
      industryScope: "all",
      hazardScope: "all",
    });
  };

  const toggleHazardCode = (code: string) => {
    setCurrentPage(1);
    setSelectedHazardCodes((prev) => {
      if (prev.includes(code)) {
        return prev.filter((item) => item !== code);
      }
      if (prev.length >= 3) {
        return prev;
      }
      return [...prev, code];
    });
  };

  const rightPanel = (
    <div className="space-y-space-4">
      <div className="bg-surface rounded-radius-lg border border-border p-space-5">
        <h3 className="text-heading-3 text-neutral-900 mb-space-2">선택 상태</h3>
        <p className="text-body-sm text-neutral-700">브리핑 포함: {assessment.selectedMaterials.length}개</p>
        <p className="text-caption text-neutral-500 mt-space-2">{toMaterialStatusMessage(assessment.apiStatuses.materials)}</p>
      </div>
    </div>
  );

  return (
    <DashboardShell currentStep="materials" rightPanel={rightPanel}>
      <div className="bg-surface rounded-radius-lg border border-border p-space-6 mb-space-5">
        <h1 className="text-heading-1 text-neutral-900 mb-space-2">교육 화면</h1>
        <p className="text-body-md text-neutral-500">위험등급과 작업 프로필을 반영한 교육자료를 선택하세요.</p>

        <Tabs
          value={viewMode}
          onValueChange={(value) => {
            setViewMode(value as MaterialsViewMode);
            setCurrentPage(1);
          }}
          className="mt-space-5"
        >
          <TabsList>
            <TabsTrigger
              value="recommended"
              data-testid="materials-tab-recommended"
              onClick={() => {
                setViewMode("recommended");
                setCurrentPage(1);
              }}
            >
              추천자료
            </TabsTrigger>
            <TabsTrigger
              value="search"
              data-testid="materials-tab-search"
              onClick={() => {
                setViewMode("search");
                setCurrentPage(1);
              }}
            >
              전체검색
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {viewMode === "search" ? (
          <div className="mt-space-4 rounded-radius-md border border-border p-space-4 space-y-space-3">
            <div className="grid grid-cols-1 xl:grid-cols-[1fr,180px,180px,180px,180px] gap-space-3">
              <div>
                <Label className="text-caption text-neutral-500 mb-space-1 block">검색어</Label>
                <Input
                  value={keyword}
                  onChange={(event) => {
                    setKeyword(event.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="사고내용 키워드를 입력하세요"
                  className="h-9"
                  data-testid="materials-keyword-input"
                />
              </div>

              <div>
                <Label className="text-caption text-neutral-500 mb-space-1 block">제작형태</Label>
                <Select
                  value={materialTypeCode}
                  onValueChange={(value) => {
                    setMaterialTypeCode(value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_OPTION}>전체</SelectItem>
                    {MATERIAL_TYPE_CODE_OPTIONS.map((option) => (
                      <SelectItem key={option.code} value={option.code}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-caption text-neutral-500 mb-space-1 block">업종</Label>
                <Select
                  value={industryCode}
                  onValueChange={(value) => {
                    setIndustryCode(value);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_OPTION}>전체(모든 업종)</SelectItem>
                    {INDUSTRY_CODE_OPTIONS.map((option) => (
                      <SelectItem key={option.code} value={option.code}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-caption text-neutral-500 mb-space-1 block">재해유형</Label>
                <Select
                  value={hazardFilterMode}
                  onValueChange={(value) => {
                    setHazardFilterMode(value as HazardFilterMode);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="selected">직접선택(최대 3개)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-caption text-neutral-500 mb-space-1 block">우선순위(정렬)</Label>
                <Select
                  value={priorityMode}
                  onValueChange={(value) => {
                    setPriorityMode(value as MaterialPriorityMode);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MATERIAL_PRIORITY_MODES.map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {hazardFilterMode === "selected" ? (
              <div className="space-y-space-2">
                <div className="flex items-center justify-between gap-space-2">
                  <Label className="text-caption text-neutral-500">재해유형 직접 선택 (최대 3개)</Label>
                  <span className="text-caption text-neutral-500">선택 {selectedHazardCodes.length}/3</span>
                </div>
                <div className="flex flex-wrap items-center gap-space-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="h-9 justify-start" data-testid="materials-hazard-picker-trigger">
                        {selectedHazardCodes.length > 0
                          ? `선택 ${selectedHazardCodes.length}개`
                          : "재해유형 선택"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[320px] p-space-3" align="start">
                      <div className="space-y-space-2">
                        <Input
                          value={hazardSearchKeyword}
                          onChange={(event) => setHazardSearchKeyword(event.target.value)}
                          placeholder="재해유형 검색"
                          className="h-9"
                        />
                        <div className="max-h-56 overflow-y-auto space-y-1">
                          {filteredHazardOptions.map((option) => {
                            const checked = selectedHazardCodes.includes(option.code);
                            const disabled = !checked && selectedHazardCodes.length >= 3;
                            return (
                              <button
                                type="button"
                                key={option.code}
                                onClick={() => toggleHazardCode(option.code)}
                                className="w-full text-left h-8 px-2 rounded-radius-sm hover:bg-primary-050 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-space-2"
                                disabled={disabled}
                              >
                                <span className="w-4 h-4 inline-flex items-center justify-center border border-border rounded-sm">
                                  {checked ? <Check className="h-3 w-3" /> : null}
                                </span>
                                <span className="text-body-sm text-neutral-700">{option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-9"
                    onClick={() => {
                      setSelectedHazardCodes([]);
                      setCurrentPage(1);
                    }}
                  >
                    선택초기화
                  </Button>
                </div>
                {selectedHazardCodes.length > 0 ? (
                  <div className="flex flex-wrap gap-space-1">
                    {selectedHazardLabels.map((label) => (
                      <Badge key={label} variant="secondary">{label}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-caption text-neutral-500">직접선택 모드에서는 최소 1개를 선택해야 검색할 수 있습니다.</p>
                )}
              </div>
            ) : null}

            <div className="flex gap-space-2">
              <Button
                className="h-9"
                variant="outline"
                onClick={() => void resetSearch()}
                disabled={isSearching}
                data-testid="materials-reset-button"
              >
                초기화
              </Button>
              <Button
                className="h-9"
                onClick={() => void runSearch()}
                disabled={isSearching || isHazardSelectionInvalid}
                data-testid="materials-search-button"
              >
                {isSearching ? "조회 중.." : "검색"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-space-4 rounded-radius-md border border-border p-space-4 text-body-sm text-neutral-600">
            사고내용과 위험요인 기반으로 추천된 자료입니다. 전체검색 탭에서 조건 검색으로 재조회할 수 있습니다.
          </div>
        )}
      </div>

      <div className="mb-space-3 flex items-center justify-between text-caption text-neutral-500">
        <span>
          총 {visibleItems.length}건
          {visibleItems.length > 0 ? ` · ${currentPage}/${totalPages} 페이지` : ""}
        </span>
        <span>{viewMode === "recommended" ? "추천자료" : "전체검색 결과"}</span>
      </div>

      {isSearching ? (
        <div className="rounded-radius-lg border border-border bg-surface p-space-6 text-center text-body-md text-neutral-600">
          교육자료를 조회하고 있습니다.
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-radius-lg border border-border bg-surface p-space-6 text-center text-body-md text-neutral-600">
          조건에 맞는 교육자료가 없습니다.
        </div>
      ) : (
        <div className="space-y-space-3">
          {pagedItems.map((item) => (
            <div key={item.id} className="rounded-radius-lg border border-border bg-surface p-space-5 min-h-[160px]">
              <div className="flex items-start justify-between gap-space-4">
                <div className="flex items-start gap-space-3">
                  <div className="w-[72px] h-[72px] rounded-radius-md bg-primary-050 text-primary-700 flex items-center justify-center text-label-md">
                    {item.type}
                  </div>
                  <div>
                    <h3 className="text-heading-3 text-neutral-900 mb-space-2">{item.title}</h3>
                    <p className="text-body-sm text-neutral-700 mb-space-2">{item.recommendReason.slice(0, 80)}</p>
                    <p className="text-caption text-neutral-500">
                      언어: {item.language} · 관련도: {item.relevance}
                    </p>
                  </div>
                </div>

                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-body-sm text-primary-700 inline-flex items-center gap-space-1"
                >
                  새 탭에서 열기
                  <ExternalLink className="h-4 w-4" />
                  <span className="sr-only">새 창 열림</span>
                </a>
              </div>

              <div className="flex gap-space-2 mt-space-4">
                <Button
                  className="h-9"
                  variant={item.selected ? "secondary" : "default"}
                  onClick={() => selectMaterial(item.id, "briefing")}
                >
                  {item.selected ? "브리핑 포함됨" : "브리핑 포함"}
                </Button>
                <Button className="h-9" variant="outline" onClick={() => selectMaterial(item.id, "exclude")}>
                  제외
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {visibleItems.length > PAGE_SIZE ? (
        <div className="mt-space-5 flex items-center justify-center gap-space-1" data-testid="materials-pagination">
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={currentPage === 1}
          >
            이전
          </Button>
          {pageTokens.map((token, index) =>
            token === "ellipsis" ? (
              <span key={`ellipsis-${index}`} className="px-2 text-caption text-neutral-500">
                ...
              </span>
            ) : (
              <Button
                type="button"
                key={token}
                variant={token === currentPage ? "default" : "outline"}
                className="h-9 min-w-[36px]"
                onClick={() => setCurrentPage(token)}
                data-testid={`materials-page-${token}`}
              >
                {token}
              </Button>
            ))}
          <Button
            type="button"
            variant="outline"
            className="h-9"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            다음
          </Button>
        </div>
      ) : null}

      <div className="flex justify-end mt-space-6">
        <Button
          onClick={() => {
            generateReport();
            navigate(`/assessments/${assessment.id}/report`);
          }}
          className="h-11 bg-primary-700 hover:bg-primary-900 text-white"
        >
          문서 작성으로 이동
          <ArrowRight className="h-4 w-4 ml-space-1" />
        </Button>
      </div>
    </DashboardShell>
  );
}
