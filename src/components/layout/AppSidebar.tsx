import { useCallback, useMemo } from "react";
import { Home, ClipboardList, Settings, Shield, AlertTriangle } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useOptionalAssessment } from "@/contexts/AssessmentContext";
import { STEP_CONFIG, type AssessmentStep } from "@/types/assessment";
import { preloadRouteComponent } from "@/lib/routeComponents";

const SIDEBAR_ITEMS = [
  {
    title: "위험성평가",
    icon: Home,
    route: "/",
    isAssessmentFlow: true,
  },
  {
    title: "서식센터",
    icon: ClipboardList,
    route: "/forms",
  },
  {
    title: "사고 예측",
    icon: AlertTriangle,
    route: "/prediction",
  },
  {
    title: "설정",
    icon: Settings,
    route: "/settings",
  },
];

interface Props {
  currentStep?: AssessmentStep;
}

export function AppSidebar({ currentStep }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const assessmentContext = useOptionalAssessment();
  const canAccessStep = assessmentContext?.canAccessStep ?? (() => false);
  const getStepRoute = assessmentContext?.getStepRoute ?? (() => "/assessments/new");
  const currentStepIndex = useMemo(
    () => STEP_CONFIG.findIndex((stepConfig) => stepConfig.step === currentStep),
    [currentStep],
  );

  const prefetchRoute = useCallback((route: string) => {
    preloadRouteComponent(route);
  }, []);

  const handleStepNavigate = useCallback((step: AssessmentStep) => {
    if (!canAccessStep(step)) {
      return;
    }
    navigate(getStepRoute(step));
  }, [canAccessStep, getStepRoute, navigate]);

  return (
    <nav className="w-[240px] 2xl:w-[264px] shrink-0 flex-col bg-surface border-r border-border flex h-full">
      <div className="h-16 flex items-center px-space-6 border-b border-border shrink-0">
        <Link to="/" aria-label="메인 화면으로 이동" className="flex items-center gap-space-2">
          <Shield className="h-7 w-7 text-primary-700" />
          <span className="text-heading-3 text-primary-900 tracking-tight">RISK-GUARD</span>
        </Link>
      </div>

      <div className="p-space-4 flex-1 overflow-y-auto">
        <div className="space-y-space-1">
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.route ||
                            (item.isAssessmentFlow && location.pathname.startsWith('/assessments'));

            return (
              <div key={item.title}>
                <Link
                  to={item.route}
                  onMouseEnter={() => prefetchRoute(item.route)}
                  onFocus={() => prefetchRoute(item.route)}
                  onTouchStart={() => prefetchRoute(item.route)}
                  className={cn(
                    "w-full flex items-center gap-space-3 px-space-3 py-space-3 rounded-radius-md transition-colors",
                    isActive
                      ? "bg-primary-050 text-primary-700"
                      : "text-neutral-600 hover:bg-neutral-050 hover:text-neutral-900"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className={cn("text-body-md font-medium", isActive && "font-semibold")}>
                    {item.title}
                  </span>
                </Link>

                {/* Sub-menu for Assessment Flow */}
                {item.isAssessmentFlow && isActive && assessmentContext && (
                  <div className="ml-space-8 mt-space-1 space-y-space-1 relative before:content-[''] before:absolute before:left-[-1.25rem] before:top-2 before:bottom-2 before:w-px before:bg-neutral-200">
                    {STEP_CONFIG.map((config, index) => {
                      const isCurrentStep = config.step === currentStep;
                      const isEnabled = canAccessStep(config.step);
                      const isCompleted = index < currentStepIndex;
                      const targetRoute = getStepRoute(config.step);

                      return (
                        <button
                          key={config.step}
                          onMouseEnter={() => prefetchRoute(targetRoute)}
                          onFocus={() => prefetchRoute(targetRoute)}
                          onTouchStart={() => prefetchRoute(targetRoute)}
                          onClick={() => handleStepNavigate(config.step)}
                          disabled={!isEnabled}
                          className={cn(
                            "w-full text-left px-space-3 py-space-2 rounded-radius-sm text-body-sm transition-colors",
                            isCurrentStep
                              ? "bg-primary-050/50 text-primary-700 font-medium"
                              : isEnabled
                              ? "text-neutral-600 hover:bg-neutral-050"
                              : "text-neutral-400 cursor-not-allowed opacity-60",
                            isCompleted && !isCurrentStep && "text-neutral-600"
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span>{config.label}</span>
                            {isCompleted && !isCurrentStep && (
                              <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
