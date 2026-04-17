import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import type { AssessmentStep } from "@/types/assessment";
import { useOptionalAssessment } from "@/contexts/AssessmentContext";

interface Props {
  targetStep: AssessmentStep;
  children: ReactNode;
}

export function StepRouteGuard({ targetStep, children }: Props) {
  const context = useOptionalAssessment();

  if (targetStep === "input") {
    return <>{children}</>;
  }

  if (!context) {
    return <Navigate to="/assessments/new" replace />;
  }

  const { assessment, currentStep, canAccessStep, getStepRoute } = context;

  if (!assessment) {
    return <Navigate to="/assessments/new" replace />;
  }

  if (!canAccessStep(targetStep)) {
    return <Navigate to={getStepRoute(currentStep)} replace />;
  }

  return <>{children}</>;
}
