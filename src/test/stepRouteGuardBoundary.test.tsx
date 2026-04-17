import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { StepRouteGuard } from "@/components/layout/StepRouteGuard";

describe("StepRouteGuard provider boundary", () => {
  it("renders input step without AssessmentProvider", () => {
    render(
      <MemoryRouter>
        <StepRouteGuard targetStep="input">
          <div>input-step</div>
        </StepRouteGuard>
      </MemoryRouter>,
    );

    expect(screen.getByText("input-step")).toBeInTheDocument();
  });

  it("redirects to /assessments/new for non-input steps without AssessmentProvider", () => {
    render(
      <MemoryRouter initialEntries={["/assessments/abc/analysis"]}>
        <Routes>
          <Route
            path="/assessments/:id/analysis"
            element={
              <StepRouteGuard targetStep="analysis">
                <div>analysis-step</div>
              </StepRouteGuard>
            }
          />
          <Route path="/assessments/new" element={<div>new-assessment</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("analysis-step")).not.toBeInTheDocument();
    expect(screen.getByText("new-assessment")).toBeInTheDocument();
  });
});
