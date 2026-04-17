import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { buildLawGuidesPayload, type LawGuideRequestBody } from "../_shared/law-guides-core.ts";
import { errorResponse, handlePreflight, jsonResponse, parseJsonBody } from "../_shared/http.ts";

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    if (req.method !== "POST") {
      return errorResponse(405, "METHOD_NOT_ALLOWED", "Only POST is supported.");
    }

    const body = await parseJsonBody<LawGuideRequestBody>(req);
    if (!body) {
      return errorResponse(400, "INVALID_JSON", "Request body must be valid JSON.");
    }

    const payload = await buildLawGuidesPayload(body, { mode: "assessment" });
    return jsonResponse(payload, 200, { "x-risk-guard-source": "kosha-law-guides-assessment" });
  } catch (error) {
    console.error("[kosha-law-guides-assessment] Unhandled error", error);

    if (error instanceof Error && error.message.startsWith("VALIDATION_ERROR:")) {
      return errorResponse(400, "VALIDATION_ERROR", error.message.replace("VALIDATION_ERROR:", ""));
    }

    return errorResponse(500, "INTERNAL_ERROR", "Unexpected error during law guide lookup.");
  }
});
