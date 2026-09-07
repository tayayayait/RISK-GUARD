import { beforeEach, describe, expect, it, vi } from "vitest";
import { invokeBackend } from "@/services/edgeFunctionClient";
import { getSupabaseClient } from "@/integrations/supabase/client";

vi.mock("@/integrations/supabase/client", () => ({
  getSupabaseClient: vi.fn(),
}));

describe("edgeFunctionClient 인증 전달", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "anon-key");
  });

  it("현재 로그인 세션의 access token을 Edge Function에 전달한다", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({
          data: { session: { access_token: "user-access-token" } },
          error: null,
        }),
      },
    } as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await invokeBackend({
      supabaseFunction: "example-function",
      legacyPath: "/example-function",
      payload: { hello: "world" },
      throwOnError: true,
    });

    const request = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(request.headers).toMatchObject({
      apikey: "anon-key",
      Authorization: "Bearer user-access-token",
    });
  });

  it("로그인 세션이 없으면 anon key로 사용자 기능을 호출하지 않는다", async () => {
    vi.mocked(getSupabaseClient).mockReturnValue({
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      },
    } as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      invokeBackend({
        supabaseFunction: "example-function",
        legacyPath: "/example-function",
        payload: {},
      }),
    ).rejects.toThrow("AUTH_REQUIRED");

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
