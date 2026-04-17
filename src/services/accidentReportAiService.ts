import type { AssessmentData } from "@/types/assessment";
import { generateGeminiTextWithFallback } from "@/services/geminiTextModelFallback";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
const configuredModel = import.meta.env.VITE_GEMINI_TEXT_MODEL;

export const AccidentReportAiService = {
  async generateFormalText(assessment: AssessmentData) {
    if (!apiKey) {
      throw new Error("Gemini API key is not configured.");
    }

    const prompt = `
당신은 산업안전보건 전문가입니다.
아래 입력 데이터를 기반으로 재해조사표의 정식 서술 문구를 작성하세요.

[입력 데이터]
- 작업명: ${assessment.taskName}
- 작업설명: ${assessment.taskDescription || "정보 없음"}
- 장소: ${assessment.profile.workLocation || "미상"}
- 위험요인(사고요인): ${assessment.profile.hazards.map((hazard) => hazard.name).join(", ")}
- 권장 개선조치(재발방지): ${assessment.analysis.improvements.map((improvement) => improvement.action).join(", ")}
- 예상 사고 시나리오: ${assessment.analysis.scenario || "미상"}

[출력 규칙]
반드시 아래 JSON 형식으로만 응답하세요. 마크다운 코드블록은 금지합니다.

{
  "location": "(작업 장소)",
  "workType": "(사고 관련 작업 유형을 1문장으로 설명)",
  "situation": "(사고 발생 당시 상황을 사실형 문장으로 설명)",
  "cause": ["원인1", "원인2"],
  "plan": "(재발방지 계획을 1~2문장으로 요약)"
}`;

    const rawText = await generateGeminiTextWithFallback({
      apiKey,
      configuredModel,
      prompt,
      context: "accidentReportAiService",
    });

    const cleanText = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();

    return JSON.parse(cleanText) as {
      location: string;
      workType: string;
      situation: string;
      cause: string[];
      plan: string;
    };
  },
};
