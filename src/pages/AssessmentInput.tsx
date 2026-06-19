import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Image, X, Sparkles, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAssessment } from "@/contexts/AssessmentContext";
import { cn } from "@/lib/utils";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default function AssessmentInput() {
  const navigate = useNavigate();
  const { startAnalysis, setCurrentStep } = useAssessment();
  const [taskName, setTaskName] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [siteName, setSiteName] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeStep, setAnalyzeStep] = useState(0);
  const [formError, setFormError] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);

  const ANALYZE_STEPS = ["텍스트 분석 중...", "사진 분석 중...", "작업 프로필 정리 중..."];

  const isValid = taskName.length >= 2 && taskName.length <= 60 && taskDescription.length >= 20 && taskDescription.length <= 1000;

  const appendPhotos = useCallback(
    (files: File[]) => {
      setUploadError("");
      const valid = files.filter((file) => file.size <= 10 * 1024 * 1024 && /\.(jpg|jpeg|png|webp)$/i.test(file.name));

      if (files.length !== valid.length) {
        setUploadError("허용되지 않은 파일 형식이거나 10MB를 초과한 파일이 포함되어 있습니다.");
      }

      const newPhotos = valid.slice(0, 5 - photos.length).map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));
      setPhotos((prev) => [...prev, ...newPhotos].slice(0, 5));
    },
    [photos.length],
  );

  const handlePhotoDrop = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      appendPhotos(files);
      event.target.value = "";
    },
    [appendPhotos],
  );

  const handleDragEnter = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (photos.length < 5) {
        setIsDragActive(true);
      }
    },
    [photos.length],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      if (photos.length < 5) {
        setIsDragActive(true);
      }
    },
    [photos.length],
  );

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);
  }, []);

  const handleDropFiles = useCallback(
    (event: React.DragEvent<HTMLLabelElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragActive(false);

      if (photos.length >= 5) {
        return;
      }

      const files = Array.from(event.dataTransfer.files || []);
      if (files.length === 0) {
        setUploadError("웹페이지 이미지 링크 드래그는 지원되지 않습니다. 파일로 저장한 뒤 업로드하세요.");
        return;
      }

      appendPhotos(files);
    },
    [appendPhotos, photos.length],
  );

  const removePhoto = (index: number) => {
    setPhotos((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const handleAnalyze = async () => {
    if (!isValid) {
      return;
    }

    setFormError("");
    setIsAnalyzing(true);

    try {
      for (let i = 0; i < ANALYZE_STEPS.length; i += 1) {
        setAnalyzeStep(i);
        await new Promise((resolve) => setTimeout(resolve, 600));
      }

      const next = await startAnalysis({
        taskName,
        taskDescription,
        siteName,
        workDate,
        photos: photos.map((photo) => photo.file),
      });
      setCurrentStep("profile_review");
      navigate(`/assessments/${next.id}/profile-review`);
    } catch (error) {
      const fallbackBlockedMessage = "AI 분석 실패. 목업 데이터는 사용하지 않았습니다. 서버 상태를 확인한 뒤 다시 시도해 주세요.";
      const detail = error instanceof Error ? error.message : "";
      setFormError(detail ? `${fallbackBlockedMessage} (${detail})` : fallbackBlockedMessage);
    } finally {
      setIsAnalyzing(false);
    }
  };

  if (isAnalyzing) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-space-6 text-center" aria-live="polite">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-neutral-200" />
            <div className="absolute inset-0 h-16 w-16 rounded-full border-4 border-primary-700 border-t-transparent animate-spin" />
          </div>
          <div>
            <h2 className="text-heading-2 text-neutral-900 mb-space-2">AI 분석 진행 중</h2>
            <p className="text-body-lg text-neutral-500">{ANALYZE_STEPS[analyzeStep]}</p>
          </div>
          <div className="flex gap-space-2 mt-space-2">
            {ANALYZE_STEPS.map((_, index) => (
              <div key={index} className={cn("h-2 w-8 rounded-full transition-colors", index <= analyzeStep ? "bg-primary-700" : "bg-neutral-200")} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>

      <div className="max-w-6xl mx-auto px-space-6 py-space-10">
        <div className="mb-space-8">
          <h1 className="text-heading-1 text-neutral-900 mb-space-2">위험성평가 시작</h1>
          <p className="text-body-lg text-neutral-500">작업 정보를 입력하면 AI가 자동으로 위험요인을 분석합니다.</p>
        </div>

        {formError && (
          <div className="mb-space-4 rounded-radius-md border border-danger-600/30 bg-danger-050 p-space-3 flex items-center gap-space-2">
            <AlertTriangle className="h-4 w-4 text-danger-600" />
            <span className="text-body-sm text-danger-600">{formError}</span>
          </div>
        )}

        <div className="grid grid-cols-12 gap-space-6">
          <div className="col-span-12 lg:col-span-7">
            <div className="bg-surface rounded-radius-lg border border-border p-space-6 space-y-space-5">
              <div>
                <Label htmlFor="taskName" className="text-label-md text-neutral-900 mb-space-2 block">
                  작업명<span className="text-danger-600">필수</span>
                </Label>
                <Input
                  id="taskName"
                  value={taskName}
                  onChange={(event) => setTaskName(event.target.value)}
                  placeholder="예: 외벽 도장 작업"
                  maxLength={60}
                  aria-describedby="taskName-help"
                  className="h-11 rounded-radius-md"
                />
                <div id="taskName-help" className="flex justify-between mt-space-1">
                  {taskName.length > 0 && taskName.length < 2 && <span className="text-caption text-danger-600">2자 이상 입력해 주세요.</span>}
                  <span className="text-caption text-neutral-500 ml-auto">{taskName.length}/60</span>
                </div>
              </div>

              <div>
                <Label htmlFor="taskDesc" className="text-label-md text-neutral-900 mb-space-2 block">
                  작업 설명 <span className="text-danger-600">필수</span>
                </Label>
                <Textarea
                  id="taskDesc"
                  value={taskDescription}
                  onChange={(event) => setTaskDescription(event.target.value)}
                  placeholder="작업 내용, 환경, 사용 장비, 작업 인원 등을 구체적으로 설명해 주세요."
                  maxLength={1000}
                  aria-describedby="taskDesc-help"
                  className="min-h-[132px] max-h-[280px] rounded-radius-md resize-y"
                />
                <div id="taskDesc-help" className="flex justify-between mt-space-1">
                  {taskDescription.length > 0 && taskDescription.length < 20 && <span className="text-caption text-danger-600">20자 이상 입력해 주세요.</span>}
                  <span className="text-caption text-neutral-500 ml-auto">{taskDescription.length}/1000</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-space-4">
                <div>
                  <Label htmlFor="siteName" className="text-label-md text-neutral-900 mb-space-2 block">
                    현장명
                  </Label>
                  <Input
                    id="siteName"
                    value={siteName}
                    onChange={(event) => setSiteName(event.target.value)}
                    placeholder="예: 한국건설 현장"
                    maxLength={60}
                    className="h-11 rounded-radius-md"
                  />
                </div>
                <div>
                  <Label htmlFor="workDate" className="text-label-md text-neutral-900 mb-space-2 block">
                    작업일자
                  </Label>
                  <Input
                    id="workDate"
                    type="date"
                    value={workDate}
                    onChange={(event) => setWorkDate(event.target.value)}
                    max={new Date().toISOString().split("T")[0]}
                    className="h-11 rounded-radius-md"
                  />
                </div>
              </div>

              <div>
                <Label className="text-label-md text-neutral-900 mb-space-2 block">현장 사진 (선택, 최대 5장)</Label>
                <label
                  className={cn(
                    "flex flex-col items-center justify-center h-[180px] border-[1.5px] border-dashed border-neutral-300 rounded-radius-lg cursor-pointer transition-colors hover:border-primary-600 hover:bg-primary-050/30",
                    isDragActive && "border-primary-700 bg-primary-050/40",
                    photos.length >= 5 && "opacity-50 cursor-not-allowed",
                  )}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDropFiles}
                >
                  <Upload className="h-8 w-8 text-neutral-500 mb-space-2" />
                  <span className="text-body-sm text-neutral-500">클릭하거나 파일을 드래그해 주세요</span>
                  <span className="text-caption text-neutral-500 mt-space-1">JPG, PNG, WEBP · 파일당 10MB 이하</span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".jpg,.jpeg,.png,.webp"
                    multiple
                    onChange={handlePhotoDrop}
                    disabled={photos.length >= 5}
                  />
                </label>

                {uploadError && <p className="text-caption text-danger-600 mt-space-2">{uploadError}</p>}

                {photos.length > 0 && (
                  <div className="flex gap-space-3 mt-space-3 flex-wrap">
                    {photos.map((photo, index) => (
                      <div key={index} className="relative group">
                        <img src={photo.preview} alt={`현장 사진 ${index + 1}`} className="h-24 w-24 rounded-radius-sm object-cover border border-neutral-200" />
                        <button
                          type="button"
                          onClick={() => removePhoto(index)}
                          className="absolute -top-2 -right-2 h-5 w-5 bg-danger-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label={`사진 ${index + 1} 삭제`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                onClick={handleAnalyze}
                disabled={!isValid}
                className="w-full h-12 rounded-radius-md text-body-lg bg-primary-700 hover:bg-primary-900 text-white"
                size="lg"
              >
                <Sparkles className="h-5 w-5 mr-space-2" />
                AI 분석 시작
              </Button>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-5 space-y-space-4">
            <div className="bg-surface rounded-radius-lg border border-border p-space-5">
              <div className="flex items-start gap-space-3 mb-space-4">
                <Sparkles className="h-5 w-5 text-primary-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-heading-3 text-neutral-900 mb-space-1">AI가 자동으로 분석합니다</h3>
                  <p className="text-body-md text-neutral-500">작업명과 설명만 입력하면, AI가 공종·작업요소·장비·위험요인을 자동 추출하고 KOSHA 공개데이터와 연결합니다.</p>
                </div>
              </div>
              <div className="space-y-space-3">
                {["유사 재해사례 자동 검색", "사고 기반 위험등급 산정", "관련 KOSHA Guide 자동 인용", "작업 전 안전 브리핑 문안 생성"].map((text, index) => (
                  <div key={index} className="flex items-center gap-space-2 text-body-sm text-neutral-700">
                    <div className="h-1.5 w-1.5 rounded-full bg-primary-700 shrink-0" />
                    {text}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface rounded-radius-lg border border-border p-space-5">
              <div className="flex items-start gap-space-3">
                <Image className="h-5 w-5 text-accent-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-heading-3 text-neutral-900 mb-space-1">사진 분석을 지원합니다</h3>
                  <p className="text-body-md text-neutral-500">현장 사진을 업로드하면 장비, 작업환경, 위험상황을 AI가 함께 분석해 결과 정확도를 높입니다.</p>
                </div>
              </div>
            </div>

            <div className="bg-accent-050 rounded-radius-lg border border-neutral-200 p-space-5">
              <div className="flex items-start gap-space-3">
                <Info className="h-5 w-5 text-accent-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-body-sm text-accent-600 font-semibold mb-space-1">개인정보 유의사항</h3>
                  <p className="text-body-md text-neutral-700">작업 설명이나 사진에 근로자의 얼굴, 이름 등 개인정보가 포함되지 않도록 주의해 주세요.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}



