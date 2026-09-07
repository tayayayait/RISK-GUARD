import { describe, expect, it, vi } from "vitest";
import { requireAuthenticatedUserId } from "../../supabase/functions/_shared/auth-user";

describe("Edge Function 사용자 인증", () => {
  it("Bearer 토큰이 없으면 요청을 거부한다", async () => {
    const client = { auth: { getUser: vi.fn() } };

    await expect(
      requireAuthenticatedUserId(new Request("https://example.com"), client),
    ).rejects.toThrow("AUTH_REQUIRED");

    expect(client.auth.getUser).not.toHaveBeenCalled();
  });

  it("검증된 JWT의 사용자 id를 반환한다", async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "11111111-2222-3333-4444-555555555555" } },
          error: null,
        }),
      },
    };

    const userId = await requireAuthenticatedUserId(
      new Request("https://example.com", {
        headers: { Authorization: "Bearer verified-user-token" },
      }),
      client,
    );

    expect(userId).toBe("11111111-2222-3333-4444-555555555555");
    expect(client.auth.getUser).toHaveBeenCalledWith("verified-user-token");
  });

  it("검증 실패 토큰을 사용자로 취급하지 않는다", async () => {
    const client = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new Error("invalid jwt"),
        }),
      },
    };

    await expect(
      requireAuthenticatedUserId(
        new Request("https://example.com", {
          headers: { Authorization: "Bearer invalid-token" },
        }),
        client,
      ),
    ).rejects.toThrow("AUTH_REQUIRED");
  });
});
