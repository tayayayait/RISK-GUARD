import { Menu } from "lucide-react";
import { STEP_CONFIG, type AssessmentStep } from "@/types/assessment";
import { useOptionalAssessment } from "@/contexts/AssessmentContext";
import { Button } from "@/components/ui/button";

interface Props {
  currentStep?: AssessmentStep;
  onMenuClick?: () => void;
}

export function AppHeader({ currentStep, onMenuClick }: Props) {
  const stepLabel = STEP_CONFIG.find(s => s.step === currentStep)?.label ?? "진행 상단";
  const assessment = useOptionalAssessment()?.assessment ?? null;

  const isAssessmentContext = !!currentStep;

  const saveLabel =
    assessment?.saveState.status === "saving"
      ? "저장 중"
      : assessment?.saveState.status === "error"
        ? "저장 실패"
        : "자동 저장됨";
  const saveColor =
    assessment?.saveState.status === "saving"
      ? "bg-warning-600"
      : assessment?.saveState.status === "error"
        ? "bg-danger-600"
        : "bg-success-600";

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
      {isAssessmentContext && (
        <div className="flex items-center gap-space-3">
          <span className="text-caption text-neutral-500">{saveLabel}</span>
          <div className={`h-2 w-2 rounded-full ${saveColor}`} />
        </div>
      )}
    </header>
  );
}
