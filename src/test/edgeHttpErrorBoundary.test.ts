import { describe, expect, it } from "vitest";
import { withErrorBoundary } from "../../supabase/functions/_shared/http";

describe("withErrorBoundary", () => {
  it("returns INTERNAL_ERROR JSON with CORS headers when handler throws", async () => {
    const wrapped = withErrorBoundary(async () => {
      throw new Error("boom");
    }, "test-function");

    const response = await wrapped(new Request("http://localhost/test", { method: "POST" }));
    const payload = await response.json() as {
      error?: {
        code?: string;
        message?: string;
      };
    };

    expect(response.status).toBe(500);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("POST, OPTIONS");
    expect(payload.error?.code).toBe("INTERNAL_ERROR");
    expect(payload.error?.message).toBe("Unexpected server error.");
  });

  it("passes through handler response when no error occurs", async () => {
    const wrapped = withErrorBoundary(async () => {
      return new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }, "test-function");

    const response = await wrapped(new Request("http://localhost/test", { method: "POST" }));
    const payload = await response.json() as { ok?: boolean };

    expect(response.status).toBe(201);
    expect(payload.ok).toBe(true);
  });
});
