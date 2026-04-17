import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_TEXT_FLASH_MODEL = "gemini-3-flash-preview";
const GEMINI_TEXT_PRO_MODEL = "gemini-3.1-pro-preview";
const DEFAULT_GEMINI_TEXT_MODEL = GEMINI_TEXT_FLASH_MODEL;
const AUTO_ROUTED_GEMINI_TEXT_MODELS = [
  GEMINI_TEXT_FLASH_MODEL,
  GEMINI_TEXT_PRO_MODEL,
];

const PRO_PRIORITY_TEXT_LENGTH = 2400;
const PRO_PRIORITY_LINE_COUNT = 60;
const PRO_PRIORITY_MULTIMODAL_TEXT_LENGTH = 900;
const PRO_PRIORITY_STRUCTURE_HINT_COUNT = 3;
const PRO_PRIORITY_STRUCTURE_HINTS = [
  "json",
  "schema",
  "structured",
  "strict",
  "enum",
  "evidence",
  "legal",
  "hazard",
];

const MODEL_NOT_FOUND_PATTERNS = [
  "is not found for api version",
  "is not supported for generatecontent",
  "[404",
  " 404 ",
];

const MODEL_RETRYABLE_PATTERNS = [
  "resource exhausted",
  "rate limit",
  "temporarily unavailable",
  "service unavailable",
  "internal error",
  "deadline exceeded",
];

type GeminiTextInlineDataPart = { inlineData: { data: string; mimeType: string } };
type GeminiTextPromptPart = string | GeminiTextInlineDataPart;
type GeminiTextPrompt = string | GeminiTextPromptPart[];

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return String(error ?? "unknown error");
}

function normalizePromptText(prompt?: GeminiTextPrompt): { text: string; hasInlineData: boolean } {
  if (!prompt) {
    return { text: "", hasInlineData: false };
  }

  if (typeof prompt === "string") {
    return { text: prompt, hasInlineData: false };
  }

  const textParts: string[] = [];
  let hasInlineData = false;

  for (const part of prompt) {
    if (typeof part === "string") {
      textParts.push(part);
      continue;
    }

    if (part && typeof part === "object" && "inlineData" in part) {
      hasInlineData = true;
    }
  }

  return {
    text: textParts.join("\n"),
    hasInlineData,
  };
}

function countStructureHints(normalizedText: string): number {
  let hitCount = 0;

  for (const hint of PRO_PRIORITY_STRUCTURE_HINTS) {
    if (normalizedText.includes(hint)) {
      hitCount += 1;
    }
  }

  return hitCount;
}

export function shouldPreferGeminiProModel(prompt?: GeminiTextPrompt): boolean {
  const { text, hasInlineData } = normalizePromptText(prompt);
  const normalized = text.toLowerCase();
  const lineCount = normalized.length === 0 ? 0 : normalized.split(/\r?\n/).length;
  const structureHintCount = countStructureHints(normalized);

  const longPrompt = normalized.length >= PRO_PRIORITY_TEXT_LENGTH;
  const denseMultilinePrompt = normalized.length >= 1600 && lineCount >= PRO_PRIORITY_LINE_COUNT;
  const multimodalLongPrompt = hasInlineData && normalized.length >= PRO_PRIORITY_MULTIMODAL_TEXT_LENGTH;
  const structureHeavyPrompt = normalized.length >= 1400 && structureHintCount >= PRO_PRIORITY_STRUCTURE_HINT_COUNT;

  return longPrompt || denseMultilinePrompt || multimodalLongPrompt || structureHeavyPrompt;
}

export function getGeminiTextModelCandidates(configuredModel?: string, prompt?: GeminiTextPrompt): string[] {
  const explicitModel = configuredModel?.trim();
  const autoOrdered = shouldPreferGeminiProModel(prompt)
    ? [GEMINI_TEXT_PRO_MODEL, GEMINI_TEXT_FLASH_MODEL]
    : [DEFAULT_GEMINI_TEXT_MODEL, GEMINI_TEXT_PRO_MODEL];

  const ordered = explicitModel && !AUTO_ROUTED_GEMINI_TEXT_MODELS.includes(explicitModel)
    ? [explicitModel, ...autoOrdered]
    : autoOrdered;

  return ordered.filter((value, index) => Boolean(value) && ordered.indexOf(value) === index);
}

export function isGeminiModelNotFoundError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (status === 404) {
      return true;
    }
  }

  const message = extractErrorMessage(error).toLowerCase();
  return MODEL_NOT_FOUND_PATTERNS.some((pattern) => message.includes(pattern));
}

export function isGeminiRetryableModelError(error: unknown): boolean {
  if (error && typeof error === "object" && "status" in error) {
    const status = (error as { status?: unknown }).status;
    if (status === 429 || status === 500 || status === 503 || status === 504) {
      return true;
    }
  }

  const message = extractErrorMessage(error).toLowerCase();
  return MODEL_RETRYABLE_PATTERNS.some((pattern) => message.includes(pattern));
}

interface GenerateGeminiTextOptions {
  apiKey: string;
  configuredModel?: string;
  prompt: GeminiTextPrompt;
  context: string;
}

export async function generateGeminiTextWithFallback({
  apiKey,
  configuredModel,
  prompt,
  context,
}: GenerateGeminiTextOptions): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelCandidates = getGeminiTextModelCandidates(configuredModel, prompt);
  let lastError: unknown = null;

  for (const modelName of modelCandidates) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      lastError = error;
      if (isGeminiModelNotFoundError(error) || isGeminiRetryableModelError(error)) {
        console.warn(`[${context}] Gemini model '${modelName}' failed. Trying next candidate.`);
        continue;
      }

      throw error;
    }
  }

  const lastErrorMessage = extractErrorMessage(lastError);
  throw new Error(
    `No available Gemini text model for generateContent. Set VITE_GEMINI_TEXT_MODEL. Tried: ${modelCandidates.join(", ")}. Last error: ${lastErrorMessage}`,
  );
}
