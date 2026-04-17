import { describe, expect, it } from "vitest";
import {
  getGeminiTextModelCandidates,
  isGeminiModelNotFoundError,
  isGeminiRetryableModelError,
  shouldPreferGeminiProModel,
} from "@/services/geminiTextModelFallback";

describe("geminiTextModelFallback", () => {
  it("uses gemini-3-flash-preview as the default first candidate", () => {
    const candidates = getGeminiTextModelCandidates();
    expect(candidates[0]).toBe("gemini-3-flash-preview");
  });

  it("routes to gemini-3.1-pro-preview first for high-complexity prompts", () => {
    const longPrompt = `
      Analyze workplace hazards and return output in strict JSON schema format.
      Include legal basis, hazard rationale, and mitigation actions as enum-compatible fields.
      ${"Provide detailed evidence-driven constraints and structured rules.\n".repeat(120)}
    `;

    const candidates = getGeminiTextModelCandidates("gemini-3-flash-preview", longPrompt);
    expect(candidates[0]).toBe("gemini-3.1-pro-preview");
  });

  it("routes multimodal prompts with long text to gemini-3.1-pro-preview first", () => {
    const prompt = [
      `
        Review image and text together, then return hazard analysis in JSON schema.
        ${"Include structured legal evidence and strict output constraints.\n".repeat(60)}
      `,
      { inlineData: { data: "ZmFrZQ==", mimeType: "image/png" } },
    ];

    const candidates = getGeminiTextModelCandidates(undefined, prompt);
    expect(candidates[0]).toBe("gemini-3.1-pro-preview");
  });

  it("keeps explicit custom model first when model is outside auto routing pair", () => {
    const candidates = getGeminiTextModelCandidates("gemini-legacy-custom");
    expect(candidates[0]).toBe("gemini-legacy-custom");
    expect(candidates.filter((value) => value === "gemini-3-flash-preview")).toHaveLength(1);
    expect(candidates.filter((value) => value === "gemini-3.1-pro-preview")).toHaveLength(1);
  });

  it("prefers flash for short prompts", () => {
    expect(shouldPreferGeminiProModel("short prompt")).toBe(false);
  });

  it("prefers pro for long structured prompts", () => {
    const prompt = `JSON schema strict structured ${"hazard evidence ".repeat(300)}`;
    expect(shouldPreferGeminiProModel(prompt)).toBe(true);
  });

  it("detects model-not-found message from Gemini SDK errors", () => {
    const error = new Error(
      "models/gemini-1.5-flash is not found for API version v1beta, or is not supported for generateContent.",
    );
    expect(isGeminiModelNotFoundError(error)).toBe(true);
  });

  it("detects model-not-found by 404 status payload", () => {
    expect(isGeminiModelNotFoundError({ status: 404, message: "Not Found" })).toBe(true);
  });

  it("does not classify unrelated errors as model-not-found", () => {
    expect(isGeminiModelNotFoundError(new Error("network timeout"))).toBe(false);
  });

  it("classifies 429 payload as retryable model error", () => {
    expect(isGeminiRetryableModelError({ status: 429, message: "Too many requests" })).toBe(true);
  });

  it("classifies unrelated payload as non-retryable model error", () => {
    expect(isGeminiRetryableModelError(new Error("invalid argument"))).toBe(false);
  });
});
