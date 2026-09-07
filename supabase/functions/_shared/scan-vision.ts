/**
 * Gemini 비전 모델을 활용한 화학물질 라벨/문서 OCR 및 구조화 추출 모듈
 */
import { readEnv } from "./runtime-env.ts";

export interface VisionExtractionResult {
  docType: "ghs_label" | "msds" | "work_order" | "warning_sign" | "unknown";
  rawText: string;
  productName?: string;
  supplier?: string;
  casNumbers: string[];
  signalWord?: "위험" | "경고" | "";  // 빈 문자열은 하위호환용. 신규 응답은 미표기 시 필드를 생략한다.
  pictograms: string[];
  hCodes?: string[];
  pCodes?: string[];
  confidence: number;
}

export interface VisionOptions {
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  signal?: AbortSignal;
}

const DEFAULT_VISION_MODEL = "gemini-3.1-pro-preview";
/**
 * 실사진(100KB~4MB) 판독은 15초로는 부족해 자주 abort 된다(실측).
 * pro 모델 기준 여유를 두되 Edge Function 전체 예산 안에 들어오도록 30초로 잡는다.
 */
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_RETRIES = 1;
const RETRY_DELAY_MS = 500;

export const VISION_PROMPT = `
당신은 화학물질 경고표지(GHS 라벨), MSDS, 작업지시서, 위험물 경고표지 전문 판독기입니다.
주어진 이미지에서 텍스트와 픽토그램을 정확하게 판독하여 JSON 스키마에 맞게 추출하세요.

[판독 원칙]
1. 추론이나 지어내기를 절대 금지합니다. 이미지에서 실제로 눈으로 확인되는 글자만 rawText 및 해당 필드에 적으십시오. 보이지 않는 항목은 빈 문자열("") 또는 빈 배열([])로 두십시오.
2. 픽토그램(pictograms)은 빨간색 마름모 테두리 안의 GHS 공인 그림문자만 판독하여 GHS01~GHS09 코드로 반환하십시오.
   - GHS01: 폭발성 (폭탄)
   - GHS02: 인화성 (불꽃)
   - GHS03: 산화성 (원 위의 불꽃)
   - GHS04: 고압가스 (가스실린더)
   - GHS05: 부식성 (부식)
   - GHS06: 급성독성 (해골)
   - GHS07: 경고/자극성 (느낌표)
   - GHS08: 건강유해성 (인체/호흡기)
   - GHS09: 환경유해성 (물고기와 나무)
3. 신호어(signalWord)는 '위험' 또는 '경고' 표기가 명확히 보일 때만 선택하고, 보이지 않으면 이 항목을 생략하십시오.
4. CAS 번호(casNumbers)는 '108-88-3'과 같은 형식으로 인쇄된 것만 추출하십시오.
5. confidence는 이미지의 해상도, 초점, 훼손 상태, 텍스트 선명도를 기준으로 0.0 ~ 1.0 사이의 수치로 산정하십시오.
`;

export const VISION_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    docType: {
      type: "string",
      enum: ["ghs_label", "msds", "work_order", "warning_sign", "unknown"],
    },
    rawText: { type: "string" },
    productName: { type: "string" },
    supplier: { type: "string" },
    casNumbers: {
      type: "array",
      items: { type: "string" },
    },
    // Gemini 는 enum 에 빈 문자열을 허용하지 않는다
    // (`response_schema.properties[signalWord].enum[2]: cannot be empty` → 400).
    // 신호어가 안 보이면 이 필드를 아예 생략하도록 required 에서도 제외한다.
    signalWord: {
      type: "string",
      enum: ["위험", "경고"],
      nullable: true,
    },
    pictograms: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "GHS01",
          "GHS02",
          "GHS03",
          "GHS04",
          "GHS05",
          "GHS06",
          "GHS07",
          "GHS08",
          "GHS09",
        ],
      },
    },
    hCodes: {
      type: "array",
      items: { type: "string" },
    },
    pCodes: {
      type: "array",
      items: { type: "string" },
    },
    confidence: { type: "number" },
  },
  required: ["docType", "rawText", "casNumbers", "pictograms", "confidence"],
};

export async function extractFromImage(
  geminiApiKey: string,
  base64Data: string,
  mimeType: "image/jpeg" | "image/png" | string = "image/jpeg",
  options: VisionOptions = {}
): Promise<VisionExtractionResult> {
  const model = options.model || readEnv("GEMINI_ANALYZE_MODEL") || DEFAULT_VISION_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const cleanBase64 = base64Data.replace(/^data:image\/[a-zA-Z]+;base64,/, "").trim();

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: VISION_PROMPT,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: VISION_RESPONSE_SCHEMA,
      temperature: 0,
    },
  };

  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
  let lastError: unknown = null;

  // 타임아웃/5xx 는 1회 재시도한다. 판독 1회 실패로 전체 요청이 502 가 되면
  // 현장에서는 "사진을 다시 찍으라"는 안내만 남고 원인을 알 수 없다.
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }

    const controller = new AbortController();
    let isTimedOut = false;
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: options.signal ?? controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        const error = new Error(`Gemini vision API error ${res.status}: ${errText.slice(0, 200)}`);
        // 4xx 는 요청 자체가 잘못된 것이므로 재시도해도 같다.
        if (res.status < 500 || attempt === maxRetries) throw error;
        lastError = error;
        continue;
      }

      const data = await res.json();
      const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!candidateText) {
        throw new Error("No text content returned from Gemini vision model");
      }

      return JSON.parse(candidateText) as VisionExtractionResult;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      lastError = isTimedOut
        ? new Error(`Gemini vision timed out after ${timeoutMs}ms`)
        : err;
      if (attempt === maxRetries) throw lastError;
    }
  }

  throw lastError ?? new Error("Gemini vision extraction failed");
}
