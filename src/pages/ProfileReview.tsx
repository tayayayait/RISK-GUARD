import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, RefreshCw, ArrowRight, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAssessment } from "@/contexts/AssessmentContext";
import type { HazardItem, WorkProfile } from "@/types/assessment";
import { HAZARD_TYPE_OPTIONS, INDUSTRY_OPTIONS, RISK_WEIGHTS, RISK_WEIGHT_RULES, getStepIndex, normalizeHazards } from "@/types/assessment";
import { normalizeHazardType } from "../../supabase/functions/_shared/hazard-taxonomy.ts";

function buildId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `hazard-${Math.random().toString(36).slice(2, 9)}`;
}

function resolveHazardType(type: string, name: string) {
  return normalizeHazardType(type, name) || "추락";
}

function normalizeProfileForComparison(profile: WorkProfile) {
  return {
    industry: profile.industry.trim(),
    workLocation: profile.workLocation.trim(),
    equipment: profile.equipment
      .map((item) => item.trim())
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right, "ko")),
    hazards: normalizeHazards(profile.hazards)
      .map((hazard) => ({
        name: hazard.name.trim(),
        type: hazard.type,
        weight: hazard.weight,
        confidence: hazard.confidence,
        reason: (hazard.reason ?? "").trim(),
      }))
      .sort((left, right) => {
        const leftKey = `${left.type}|${left.name}|${left.weight}|${left.confidence}|${left.reason}`;
        const rightKey = `${right.type}|${right.name}|${right.weight}|${right.confidence}|${right.reason}`;
        return leftKey.localeCompare(rightKey, "ko");
      }),
  };
}

function isSameProfile(left: WorkProfile, right: WorkProfile) {
  return JSON.stringify(normalizeProfileForComparison(left)) === JSON.stringify(normalizeProfileForComparison(right));
}

const CONFIDENCE_META: Record<HazardItem["confidence"], { label: string; className: string }> = {
  high: {
    label: "높음",
    className: "text-success-700 bg-success-050 border border-success-200",
  },
  medium: {
    label: "보통",
    className: "text-warning-700 bg-warning-050 border border-warning-200",
  },
  low: {
    label: "낮음",
    className: "text-danger-700 bg-danger-050 border border-danger-200",
  },
};

type AnalysisPrepareStageId = "profile_apply" | "law_lookup" | "action_compose" | "finalizing";

const ANALYSIS_PREPARE_STAGE_ORDER: AnalysisPrepareStageId[] = [
  "profile_apply",
  "law_lookup",
  "action_compose",
  "finalizing",
];

const ANALYSIS_PREPARE_STAGE_META: Record<
  AnalysisPrepareStageId,
  {
    title: string;
    detail: string;
  }
> = {
  profile_apply: {
    title: "작업 프로필 확정",
    detail: "위험도 계산에 필요한 프로필 값을 적용하고 있습니다.",
  },
  law_lookup: {
    title: "법령 근거 수집",
    detail: "관련 법령·가이드·조치 후보를 검색하고 있습니다.",
  },
  action_compose: {
    title: "조치 항목 구성",
    detail: "검색된 근거를 작업 단계별 조치 항목으로 정리하고 있습니다.",
  },
  finalizing: {
    title: "결과 화면 준비",
    detail: "분석 결과 화면 전환을 마무리하고 있습니다.",
  },
};

const LAW_LOOKUP_TRICKLE_LIMIT = 89;

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function ProfileReview() {
  const navigate = useNavigate();
  const { assessment, confirmProfile, prefetchLawGuidesForAnalysis, startAnalysis, isLoading } = useAssessment();

  const [industry, setIndustry] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [equipmentInput, setEquipmentInput] = useState("");
  const [hazards, setHazards] = useState<HazardItem[]>([]);
  const [newHazardName, setNewHazardName] = useState("");
  const [isPreparingAnalysis, setIsPreparingAnalysis] = useState(false);
  const [prepareStage, setPrepareStage] = useState<AnalysisPrepareStageId>("profile_apply");
  const [prepareProgress, setPrepareProgress] = useState(0);
  const [prepareProgressTarget, setPrepareProgressTarget] = useState(0);
  const [prepareError, setPrepareError] = useState("");

  useEffect(() => {
    if (!assessment) {
      return;
    }
    setIndustry(assessment.profile.industry);
    setWorkLocation(assessment.profile.workLocation);
    setEquipmentInput(assessment.profile.equipment.join(", "));
    setHazards(
      assessment.profile.hazards.map((hazard) => ({
        ...hazard,
        type: resolveHazardType(hazard.type, hazard.name),
      })),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assessment?.id]);

  const lowConfidenceFields = useMemo(() => {
    if (!assessment) {
      return [];
    }
    const keys: string[] = [];
    if (assessment.profileConfidence.industry === "low") keys.push("업종");
    if (assessment.profileConfidence.workLocation === "low") keys.push("작업장소");
    if (assessment.profileConfidence.equipment === "low") keys.push("장비");
    if (assessment.profileConfidence.hazards === "low") keys.push("위험요인");
    return keys;
  }, [assessment]);

  const parsedEquipment = useMemo(
    () =>
      equipmentInput
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 5),
    [equipmentInput],
  );

  const canConfirm = Boolean(assessment && industry && workLocation.trim() && parsedEquipment.length > 0 && hazards.length > 0);

  useEffect(() => {
    if (!isPreparingAnalysis) {
      return;
    }

    const timer = window.setInterval(() => {
      setPrepareProgress((previous) => {
        if (previous >= prepareProgressTarget) {
          return previous;
        }

        const remaining = prepareProgressTarget - previous;
        const increment = Math.min(6, Math.max(1, Math.ceil(remaining * 0.28)));
        return Math.min(prepareProgressTarget, previous + increment);
      });
    }, 120);

    return () => window.clearInterval(timer);
  }, [isPreparingAnalysis, prepareProgressTarget]);

  useEffect(() => {
    if (!isPreparingAnalysis || prepareStage !== "law_lookup") {
      return;
    }

    const trickleTimer = window.setInterval(() => {
      setPrepareProgressTarget((previous) => Math.min(LAW_LOOKUP_TRICKLE_LIMIT, previous + 1));
    }, 1200);

    return () => window.clearInterval(trickleTimer);
  }, [isPreparingAnalysis, prepareStage]);

  if (!assessment) {
    return null;
  }

  if (isPreparingAnalysis) {
    const currentPrepareStageIndex = ANALYSIS_PREPARE_STAGE_ORDER.indexOf(prepareStage);
    const currentPrepareStage = ANALYSIS_PREPARE_STAGE_META[prepareStage];
    const progress = Math.max(1, Math.min(100, Math.round(prepareProgress)));
    const statusHint = prepareStage === "law_lookup"
      ? "법령/가이드 검색은 보통 30초~1분 정도 소요됩니다."
      : "현재 단계를 실시간으로 반영하고 있습니다.";

    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,_#eaf3ff_0%,_#f8fafc_42%,_#ffffff_100%)] px-space-4">
        <div className="pointer-events-none absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary-200/45 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-sky-100/70 blur-3xl" />
        <div className="relative w-full max-w-2xl rounded-radius-lg border border-white/80 bg-white/90 p-space-6 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)] backdrop-blur" aria-live="polite">
          <div className="flex items-start gap-space-4">
            <div className="relative mt-1 shrink-0">
              <span className="absolute inset-0 rounded-full bg-primary-200/60 blur-md" aria-hidden="true" />
              <Loader2 className="relative h-10 w-10 animate-spin text-primary-700" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-label-md text-primary-700">AI 분석 준비</p>
              <h2 className="mt-space-1 text-heading-2 text-neutral-900">분석 결과를 준비하고 있습니다</h2>
              <p className="mt-space-2 text-body-md font-semibold text-neutral-700">{currentPrepareStage.title}</p>
              <p className="mt-space-1 text-body-sm text-neutral-600">{currentPrepareStage.detail}</p>
              <p className="mt-space-1 text-body-sm font-medium text-neutral-500">{statusHint}</p>
            </div>
          </div>

          <div className="mt-space-6">
            <div className="mb-space-2 flex items-center justify-between text-caption text-neutral-500">
              <span>실시간 진행 상태</span>
              <span className="font-mono-num">{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary-600 via-primary-700 to-sky-600 transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-space-4 grid grid-cols-1 gap-space-2 md:grid-cols-2">
              {ANALYSIS_PREPARE_STAGE_ORDER.map((stageId, index) => {
                const stage = ANALYSIS_PREPARE_STAGE_META[stageId];
                const status = index < currentPrepareStageIndex
                  ? "done"
                  : index === currentPrepareStageIndex
                    ? "active"
                    : "pending";

                return (
                <div
                  key={stageId}
                  className={`rounded-radius-md border px-space-3 py-space-2 text-caption transition-colors ${
                    status === "done"
                      ? "border-primary-300 bg-primary-050 text-primary-900"
                      : status === "active"
                        ? "border-primary-400 bg-primary-100/70 text-primary-900"
                        : "border-neutral-200 bg-white text-neutral-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-space-2">
                    <span>{stage.title}</span>
                    <span className="font-semibold">
                      {status === "done" ? "완료" : status === "active" ? "진행중" : "대기"}
                    </span>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const updateHazard = (hazardId: string, updates: Partial<HazardItem>) => {
    setHazards((prev) => prev.map((hazard) => (hazard.id === hazardId ? { ...hazard, ...updates } : hazard)));
  };

  const removeHazard = (hazardId: string) => {
    setHazards((prev) => prev.filter((hazard) => hazard.id !== hazardId));
  };

  const addHazard = () => {
    const name = newHazardName.trim();
    if (!name || hazards.length >= 8) {
      return;
    }
    setHazards((prev) => [
      ...prev,
      {
        id: buildId(),
        name,
        type: resolveHazardType(name, name),
        weight: RISK_WEIGHTS[name] ?? 15,
        confidence: "medium",
        reason: "근거 없음",
      },
    ]);
    setNewHazardName("");
  };

  const handleConfirm = async () => {
    if (!canConfirm || isPreparingAnalysis) {
      return;
    }

    const profile: WorkProfile = {
      industry,
      workLocation: workLocation.trim(),
      equipment: parsedEquipment,
      hazards,
    };

    const hasLawEvidence = assessment.evidenceItems.some((item) => item.type === "law");
    const hasPrefetchedLawData = hasLawEvidence || assessment.lawActionItems.length > 0 || Boolean(assessment.lawGuideMeta);
    const isProfileChanged = !isSameProfile(assessment.profile, profile);
    const shouldApplyProfile = assessment.status === "review_required"
      || getStepIndex(assessment.currentStep) < getStepIndex("analysis")
      || isProfileChanged;
    const shouldForceLawPrefetch = isProfileChanged || !hasPrefetchedLawData || assessment.apiStatuses.lawGuide === "error";

    setPrepareError("");
    if (shouldForceLawPrefetch) {
      setPrepareStage("profile_apply");
      setPrepareProgress(6);
      setPrepareProgressTarget(28);
      setIsPreparingAnalysis(true);
    }

    try {
      if (shouldApplyProfile) {
        await confirmProfile(profile);
      }
      if (shouldForceLawPrefetch) {
        setPrepareProgress((previous) => Math.max(previous, 28));
        setPrepareStage("law_lookup");
        setPrepareProgressTarget(74);
      }
      await prefetchLawGuidesForAnalysis({
        taskName: assessment.taskName,
        profile,
        force: shouldForceLawPrefetch,
      });
      if (shouldForceLawPrefetch) {
        setPrepareProgress((previous) => Math.max(previous, 88));
        setPrepareStage("action_compose");
        setPrepareProgressTarget(96);
        await wait(220);
        setPrepareStage("finalizing");
        setPrepareProgressTarget(100);
        await wait(260);
        setPrepareProgress(100);
      }
      navigate(`/assessments/${assessment.id}/analysis`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      setPrepareError(detail ? `분석 결과 준비에 실패했습니다: ${detail}` : "분석 결과 준비에 실패했습니다.");
      setIsPreparingAnalysis(false);
    }
  };

  const handleReanalyze = async () => {
    const next = await startAnalysis({
      taskName: assessment.taskName,
      taskDescription: assessment.taskDescription,
      siteName: assessment.siteName,
      workDate: assessment.workDate,
      photos: assessment.photos,
    });
    navigate(`/assessments/${next.id}/profile-review`);
  };

  const rightPanel = (
    <div className="space-y-space-4">
      <div className="bg-surface rounded-radius-lg border border-border p-space-5">
        <h3 className="text-heading-3 text-neutral-900 mb-space-3">검증 체크리스트</h3>
        <ul className="space-y-space-2 text-body-sm text-neutral-700">
          <li>업종/작업장소/장비/위험요인을 확정해야 다음 단계로 이동합니다.</li>
          <li><strong>위험요인별 가중치</strong>는 최종 작업 위험도를 산출(0~100)하는 핵심 계산값으로 사용됩니다. AI가 부여한 점수가 현장에 맞게 설정되었는지 실무자의 판단에 따라 필요 시 수정하고 확정해 주세요.</li>
          <li>신뢰도 낮음 항목은 반드시 수동 검토 후 수정해 주세요.</li>
          <li>재분석을 실행하면 수정하던 값들은 모두 초기화됩니다.</li>
        </ul>
      </div>
      <div className="bg-surface rounded-radius-lg border border-border p-space-5">
        <h3 className="text-heading-3 text-neutral-900 mb-space-3">설정 기준</h3>
        <div className="space-y-space-3">
          <div>
            <p className="text-label-md text-neutral-800 mb-space-2">위험요인 가중치 기준</p>
            <div className="rounded-radius-md border border-border overflow-hidden">
              {RISK_WEIGHT_RULES.map((rule) => (
                <div
                  key={rule.typeGroup}
                  className="grid grid-cols-[1fr_auto] gap-space-2 px-space-3 py-space-2 text-body-sm text-neutral-700 border-b border-border last:border-b-0"
                >
                  <span>{rule.typeGroup}</span>
                  <span className="font-semibold tabular-nums">{rule.weight}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-label-md text-neutral-800 mb-space-2">AI 신뢰도 구간</p>
            <ul className="space-y-space-1 text-body-sm text-neutral-700">
              <li><strong>높음</strong>: 입력 근거가 충분한 추론</li>
              <li><strong>보통</strong>: 일부 근거가 부족한 추론</li>
              <li><strong>낮음</strong>: 근거 부족으로 수동 검토가 필요한 추론</li>
            </ul>
          </div>
          <p className="text-caption text-neutral-500">
            신뢰도는 AI 판단의 신뢰 수준이며, 발생 확률과는 다릅니다.
          </p>
        </div>
      </div>
      <div className="bg-surface rounded-radius-lg border border-border p-space-5">
        <h3 className="text-heading-3 text-neutral-900 mb-space-2">AI 입력 원문</h3>
        <p className="text-body-sm text-neutral-700 whitespace-pre-line">{assessment.taskDescription}</p>
      </div>
    </div>
  );

  return (
    <DashboardShell currentStep="profile_review" rightPanel={rightPanel}>
      {prepareError && (
        <div className="mb-space-4 rounded-radius-md border border-danger-600/30 bg-danger-050 p-space-4 flex items-center gap-space-3">
          <AlertTriangle className="h-5 w-5 text-danger-600 shrink-0" />
          <div className="text-body-sm text-danger-600">{prepareError}</div>
        </div>
      )}

      {lowConfidenceFields.length > 0 && (
        <div className="mb-space-5 rounded-radius-md border border-danger-600/30 bg-danger-050 p-space-4 flex items-center gap-space-3">
          <AlertTriangle className="h-5 w-5 text-danger-600 shrink-0" />
          <div className="text-body-sm text-danger-600">
            신뢰도 낮음: {lowConfidenceFields.join(", ")}. 확인 후 수정하세요.
          </div>
        </div>
      )}

      <div className="bg-surface rounded-radius-lg border border-border p-space-6">
        <h1 className="text-heading-1 text-neutral-900 mb-space-2">AI 분석 확인</h1>
        <p className="text-body-md text-neutral-500 mb-space-6">Gemini 추론 결과를 검토하고 필수 프로필을 확정하세요.</p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-4 mb-space-4">
          <div>
            <Label className="text-label-md mb-space-2 block">업종</Label>
            <Select value={industry} onValueChange={setIndustry}>
              <SelectTrigger className="h-11 rounded-radius-md">
                <SelectValue placeholder="업종 선택" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRY_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-label-md mb-space-2 block">작업장소</Label>
            <Input
              value={workLocation}
              onChange={(event) => setWorkLocation(event.target.value)}
              placeholder="예: 건설 현장 외벽"
              className="h-11 rounded-radius-md"
            />
          </div>
        </div>

        <div className="mb-space-4">
          <Label className="text-label-md mb-space-2 block">장비 (쉼표 구분, 최대 5개)</Label>
          <Input
            value={equipmentInput}
            onChange={(event) => setEquipmentInput(event.target.value)}
            placeholder="예: 고소작업대, 절단기"
            className="h-11 rounded-radius-md"
          />
        </div>

        <div className="mb-space-4">
          <Label className="text-label-md mb-space-3 block">위험요인 (최대 8개)</Label>
          
          <div className="grid grid-cols-12 gap-space-2 mb-space-2 px-space-2">
            <Label className="col-span-3 text-caption font-semibold text-neutral-500">위험요인명</Label>
            <Label className="col-span-3 text-caption font-semibold text-neutral-500">위험유형</Label>
            <Label className="col-span-2 text-caption font-semibold text-neutral-500">AI 가중치 (0~40)</Label>
            <Label className="col-span-2 text-caption font-semibold text-neutral-500">AI 신뢰도</Label>
            <Label className="col-span-2 text-caption font-semibold text-neutral-500">추천 근거</Label>
          </div>

          <div className="space-y-space-2">
            {hazards.map((hazard) => (
              <div key={hazard.id} className="grid grid-cols-12 gap-space-2 items-center border border-border bg-neutral-50/50 rounded-radius-md p-space-2">
                <div className="col-span-3 flex items-center gap-space-2">
                  <Input
                    className="flex-1 h-9 rounded-radius-md bg-white border-neutral-300"
                    value={hazard.name}
                    onChange={(event) => updateHazard(hazard.id, { name: event.target.value })}
                  />
                  <Button size="sm" variant="ghost" onClick={() => removeHazard(hazard.id)} className="text-neutral-500">
                    삭제
                  </Button>
                </div>
                <div className="col-span-3">
                  <Select value={resolveHazardType(hazard.type, hazard.name)} onValueChange={(value) => updateHazard(hazard.id, { type: value })}>
                    <SelectTrigger className="h-9 rounded-radius-md bg-white border-neutral-300">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HAZARD_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  className="col-span-2 h-9 rounded-radius-md bg-white border-neutral-300"
                  type="number"
                  min={1}
                  max={40}
                  value={hazard.weight}
                  onChange={(event) => updateHazard(hazard.id, { weight: Number(event.target.value) || hazard.weight })}
                />
                <div className="col-span-2">
                  <span className={`inline-flex items-center rounded-full px-2 py-1 text-caption font-medium ${CONFIDENCE_META[hazard.confidence].className}`}>
                    {CONFIDENCE_META[hazard.confidence].label}
                  </span>
                </div>
                <div className="col-span-2 rounded-radius-md border border-neutral-200 bg-white px-space-3 py-space-2 text-body-sm text-neutral-700 whitespace-pre-line">
                  {hazard.reason?.trim() || "근거 없음"}
                </div>
              </div>
            ))}
          </div>

          {hazards.length < 8 && (
            <div className="flex gap-space-2 mt-space-2">
              <Input
                value={newHazardName}
                onChange={(event) => setNewHazardName(event.target.value)}
                placeholder="위험요인 추가"
                className="h-10 rounded-radius-md"
              />
              <Button variant="outline" onClick={addHazard}>
                추가
              </Button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-space-3 mb-space-2">
          <Button variant="outline" onClick={() => navigate("/assessments/new")} className="h-11">
            입력 수정
          </Button>
          <Button variant="outline" onClick={handleReanalyze} className="h-11" disabled={isLoading || isPreparingAnalysis}>
            <RefreshCw className="h-4 w-4 mr-space-1" />
            재분석
          </Button>
          <Button onClick={handleConfirm} className="h-11 bg-primary-700 hover:bg-primary-900 text-white" disabled={!canConfirm || isLoading || isPreparingAnalysis}>
            분석 결과 확정
            <ArrowRight className="h-4 w-4 ml-space-1" />
          </Button>
        </div>
      </div>
    </DashboardShell>
  );
}

