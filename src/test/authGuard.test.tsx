import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

describe("ProtectedRoute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("인증 확인 중에는 보호된 화면을 렌더링하지 않는다", () => {
    vi.mocked(useAuth).mockReturnValue({ loading: true, user: null } as never);

    render(
      <MemoryRouter initialEntries={["/prediction"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/prediction" element={<div>사고 예측</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText("사고 예측")).not.toBeInTheDocument();
    expect(screen.getByText("로그인 상태를 확인하고 있습니다.")).toBeInTheDocument();
  });

  it("로그인하지 않은 사용자는 원래 경로를 보존해 로그인 화면으로 보낸다", () => {
    vi.mocked(useAuth).mockReturnValue({ loading: false, user: null } as never);

    render(
      <MemoryRouter initialEntries={["/prediction"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/prediction" element={<div>사고 예측</div>} />
          </Route>
          <Route path="/login" element={<div>로그인 화면</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("로그인 화면")).toBeInTheDocument();
    expect(screen.queryByText("사고 예측")).not.toBeInTheDocument();
  });

  it("로그인한 사용자는 보호된 화면을 이용한다", () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      user: { id: "user-1", email: "worker@example.com" },
    } as never);

    render(
      <MemoryRouter initialEntries={["/prediction"]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/prediction" element={<div>사고 예측</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("사고 예측")).toBeInTheDocument();
  });
});
