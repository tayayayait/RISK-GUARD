import { LogOut, Menu, UserCircle2 } from "lucide-react";
import { STEP_CONFIG, type AssessmentStep } from "@/types/assessment";
import { useOptionalAssessment } from "@/contexts/AssessmentContext";
import { Button } from "@/components/ui/button";
import { useOptionalAuth } from "@/contexts/AuthContext";

interface Props {
  currentStep?: AssessmentStep;
  onMenuClick?: () => void;
}

export function AppHeader({ currentStep, onMenuClick }: Props) {
  const assessmentContext = useOptionalAssessment();
  const auth = useOptionalAuth();
  const onRetrySave = assessmentContext?.retrySave;
  const stepLabel = STEP_CONFIG.find(s => s.step === currentStep)?.label ?? "진행 상단";
  const assessment = assessmentContext?.assessment ?? null;

  const isAssessmentContext = !!currentStep;

  // 저장 표시는 실제 서버 응답만 반영한다. 저장한 적이 없으면 "저장됨"이라고 하지 않는다.
  const saveStatus = assessment?.saveState.status ?? "idle";
  const saveLabel =
    saveStatus === "saving"
      ? "저장 중"
      : saveStatus === "error"
        ? "저장 실패"
        : saveStatus === "saved"
          ? "저장됨"
          : "저장 전";
  const saveColor =
    saveStatus === "saving"
      ? "bg-warning-600"
      : saveStatus === "error"
        ? "bg-danger-600"
        : saveStatus === "saved"
          ? "bg-success-600"
          : "bg-neutral-400";

  return (
    <header className="h-16 shrink-0 flex items-center justify-between px-space-6 bg-surface border-b border-border">
      <div className="flex items-center gap-space-3">
        <Button variant="ghost" size="icon" className="lg:hidden -ml-2" onClick={onMenuClick}>
          <Menu className="h-5 w-5 text-neutral-700" />
        </Button>
        <span className="text-body-md font-medium text-neutral-900">
          {isAssessmentContext ? stepLabel : ""}
        </span>
      </div>
      <div className="flex items-center gap-space-3">
        {isAssessmentContext && (
          <div className="flex items-center gap-space-3">
          <span className="text-caption text-neutral-500" data-testid="assessment-save-label">
            {saveLabel}
          </span>
          <div className={`h-2 w-2 rounded-full ${saveColor}`} data-testid="assessment-save-indicator" />
          {saveStatus === "error" && onRetrySave && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 rounded-radius-md text-caption"
              onClick={() => void onRetrySave()}
              data-testid="assessment-save-retry"
            >
              재시도
            </Button>
          )}
          </div>
        )}
        {auth && (
          <>
            <div className="hidden items-center gap-2 border-l border-border pl-space-3 sm:flex">
              <UserCircle2 className="h-4 w-4 text-neutral-500" />
              <span className="max-w-48 truncate text-caption text-neutral-600">
                {auth.user?.email ?? "로그인 사용자"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-neutral-600"
              onClick={() => {
                void auth.signOut().catch((error) => console.error("[Auth] Failed to sign out.", error));
              }}
              aria-label="로그아웃"
            >
              <LogOut className="mr-1 h-4 w-4" />
              <span className="hidden sm:inline">로그아웃</span>
            </Button>
          </>
        )}
      </div>
    </header>
  );
}
