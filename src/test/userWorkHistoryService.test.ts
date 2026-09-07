import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseClient } from "@/integrations/supabase/client";
import { UserWorkHistoryService } from "@/services/userWorkHistoryService";

vi.mock("@/integrations/supabase/client", () => ({
  getSupabaseClient: vi.fn(),
}));

function createBuilder(result: { data: unknown; error: unknown }) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["insert", "select", "eq", "in", "order", "limit", "delete", "update"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = vi.fn(async () => result);
  builder.maybeSingle = vi.fn(async () => result);
  builder.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve));
  return builder;
}

const row = {
  id: "11111111-2222-3333-4444-555555555555",
  feature: "accident-prediction",
  title: "프레스 사고 예측",
  subtitle: "시나리오 3개",
  input_payload: { query: "프레스" },
  result_payload: { scenarios: [] },
  created_at: "2026-08-20T01:00:00.000Z",
  updated_at: "2026-08-20T01:00:00.000Z",
};

describe("UserWorkHistoryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("현재 사용자의 작업 결과를 생성하고 응답을 camelCase로 변환한다", async () => {
    const builder = createBuilder({ data: row, error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const record = await UserWorkHistoryService.create({
      feature: "accident-prediction",
      title: "프레스 사고 예측",
      subtitle: "시나리오 3개",
      input: { query: "프레스" },
      result: { scenarios: [] },
    });

    expect(from).toHaveBeenCalledWith("user_work_history");
    expect(builder.insert).toHaveBeenCalledWith({
      feature: "accident-prediction",
      title: "프레스 사고 예측",
      subtitle: "시나리오 3개",
      input_payload: { query: "프레스" },
      result_payload: { scenarios: [] },
    });
    expect(record.createdAt).toBe("2026-08-20T01:00:00.000Z");
    expect(record.input).toEqual({ query: "프레스" });
  });

  it("기능별 목록을 최신 수정 순으로 조회한다", async () => {
    const builder = createBuilder({ data: [row], error: null });
    const from = vi.fn(() => builder);
    vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);

    const records = await UserWorkHistoryService.list("accident-prediction");

    expect(builder.eq).toHaveBeenCalledWith("feature", "accident-prediction");
    expect(builder.order).toHaveBeenCalledWith("updated_at", { ascending: false });
    expect(records[0].title).toBe("프레스 사고 예측");
    expect(records[0].input).toEqual({ query: "프레스" });
    expect(records[0].result).toEqual({ scenarios: [] });
  });

  it("다시 열 때 id와 허용 기능을 함께 제한한다", async () => {
    const builder = createBuilder({ data: row, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await UserWorkHistoryService.get(row.id, ["accident-prediction", "chemical-scan"]);

    expect(builder.eq).toHaveBeenCalledWith("id", row.id);
    expect(builder.in).toHaveBeenCalledWith("feature", ["accident-prediction", "chemical-scan"]);
  });

  it("삭제도 id와 기능을 함께 제한하고 미존재 레코드는 실패한다", async () => {
    const builder = createBuilder({ data: { id: row.id }, error: null });
    vi.mocked(getSupabaseClient).mockReturnValue({ from: vi.fn(() => builder) } as never);

    await UserWorkHistoryService.remove(row.id, "accident-prediction");

    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("id", row.id);
    expect(builder.eq).toHaveBeenCalledWith("feature", "accident-prediction");
  });
});
