import { useCallback, useMemo } from "react";
import { Check, FileText, Brain, BarChart3, Search, BookOpen, FileOutput } from "lucide-react";
import { STEP_CONFIG, type AssessmentStep } from "@/types/assessment";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useAssessment } from "@/contexts/AssessmentContext";
import { preloadRouteComponent } from "@/lib/routeComponents";

const STEP_ICONS: Record<AssessmentStep, React.ElementType> = {
  input: FileText,
  profile_review: Brain,
  analysis: BarChart3,
  evidence: Search,
  materials: BookOpen,
  report: FileOutput,
};

interface Props {
  currentStep: AssessmentStep;
}

export function StepRail({ currentStep }: Props) {
  const navigate = useNavigate();
  const { canAccessStep, getStepRoute } = useAssessment();
  const currentIndex = useMemo(() => STEP_CONFIG.findIndex((s) => s.step === currentStep), [currentStep]);

  const handlePrefetch = useCallback((step: AssessmentStep) => {
    if (!canAccessStep(step)) {
      return;
    }
    preloadRouteComponent(getStepRoute(step));
  }, [canAccessStep, getStepRoute]);

  const handleNavigate = useCallback((step: AssessmentStep) => {
    if (!canAccessStep(step)) {
      return;
    }
    navigate(getStepRoute(step));
  }, [canAccessStep, getStepRoute, navigate]);

  return (
    <nav className="hidden lg:flex w-[240px] 2xl:w-[264px] shrink-0 flex-col bg-surface border-r border-border py-space-6 px-space-4">
      <div className="text-label-md text-neutral-500 mb-space-4 px-space-3">평가 단계</div>
      <div className="space-y-space-1">
        {STEP_CONFIG.map((config, index) => {
          const Icon = STEP_ICONS[config.step];
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;

          const isEnabled = canAccessStep(config.step);

          return (
            <button
              key={config.step}
              type="button"
              onMouseEnter={() => handlePrefetch(config.step)}
              onFocus={() => handlePrefetch(config.step)}
              onTouchStart={() => handlePrefetch(config.step)}
              onClick={() => handleNavigate(config.step)}
              disabled={!isEnabled}
              className={cn(
                "w-full text-left flex items-center gap-space-3 px-space-3 py-space-3 rounded-radius-md transition-colors",
                isCurrent && "bg-primary-050 text-primary-700",
                isCompleted && "text-success-600",
                isFuture && "text-neutral-500",
                !isEnabled && "opacity-60 cursor-not-allowed"
              )}
            >
              <div className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full shrink-0",
                isCurrent && "bg-primary-700 text-white",
                isCompleted && "bg-success-050 text-success-600",
                isFuture && "bg-neutral-100 text-neutral-500"
              )}>
                {isCompleted ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <div className="min-w-0">
                <div className={cn("text-body-sm truncate", isCurrent && "font-semibold")}>
                  {config.label}
                </div>
                <div className="text-caption text-neutral-500">
                  {isCompleted ? "Done" : isCurrent ? "In progress" : `${index + 1} step`}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
