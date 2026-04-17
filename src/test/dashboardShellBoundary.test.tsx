import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DashboardShell } from "@/components/layout/DashboardShell";

describe("DashboardShell provider boundary", () => {
  it("renders without AssessmentProvider context", () => {
    render(
      <MemoryRouter>
        <DashboardShell>
          <div>boundary-ok</div>
        </DashboardShell>
      </MemoryRouter>,
    );

    expect(screen.getByText("boundary-ok")).toBeInTheDocument();
  });
});
