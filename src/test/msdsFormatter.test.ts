import { describe, expect, it } from "vitest";
import { decodeHtmlEntities, extractPpeSummary } from "../lib/msdsFormatter";

describe("msdsFormatter", () => {
  describe("decodeHtmlEntities", () => {
    it("decodes multiple HTML entities and cleans spaces", () => {
      const input = "산소가 부족한 경우(&amp;lt;19.6%), 송기마스크 &amp; 자급식 &quot;보호구&quot;";
      const result = decodeHtmlEntities(input);
      expect(result).toBe('산소가 부족한 경우(<19.6%), 송기마스크 & 자급식 "보호구"');
    });

    it("handles empty or null inputs gracefully", () => {
      expect(decodeHtmlEntities(null)).toBe("");
      expect(decodeHtmlEntities(undefined)).toBe("");
      expect(decodeHtmlEntities("")).toBe("");
    });
  });

  describe("extractPpeSummary", () => {
    it("summarizes long respiratory requirement and extracts tags", () => {
      const longRespiratory =
        "노출되는 물질의 물리화학적 특성에 맞는 한국산업안전보건공단의 인증을 필한 호흡용 보호구를 착용 하시오 / " +
        "-안면부여과식 방진마스크 또는 공기여과식 방진마스크(고효율미립자여과재)또는 전동팬 부착 방진마스크(분진, 미스트, 흄 등 여과재) / " +
        "기체/액체물질의 경우 다음과 같은 호흡기 보호구가 권고됨 :격리식 전면형 방독마스크(유기화합물용(산성가스인 경우 산성가스용)) / " +
        "산소가 부족한 경우(&amp;lt;19.6%), 송기마스크, 혹은 자급식 호흡보호구를 착용하시오";

      const res = extractPpeSummary("respiratory", longRespiratory);

      expect(res.hasDetail).toBe(true);
      expect(res.tags).toContain("유기화합물용 방독마스크");
      expect(res.tags).toContain("방진마스크");
      expect(res.summary).toContain("방독마스크");
      expect(res.rawCleaned).toContain("<19.6%");
      expect(res.detailLines.length).toBeGreaterThan(1);
    });

    it("summarizes long eye protection requirement", () => {
      const longEye =
        "눈에 자극을 일으키거나 기타 건강상의 장애를 일으킬 수 있는 다음과 같은 보안경을 착용하시오. " +
        "- 가스상태의 유기물질의 경우 밀폐형 보안경 - 증기상태의 유기물질의 경우 보안경 혹은 통기성 보안경 " +
        "- 입자상 물질의 경우 통기성 보안경 / 근로자가 접근이 용이한 위치에 긴급세척시설(샤워식) 및 세안설비를 설치하시오";

      const res = extractPpeSummary("eye", longEye);

      expect(res.hasDetail).toBe(true);
      expect(res.tags).toContain("밀폐형 보안경");
      expect(res.tags).toContain("긴급 세안/세척설비");
      expect(res.summary).toContain("보안경");
    });

    it("preserves short requirements as summary", () => {
      const shortHand = "적절한 내화학성 장갑(니트릴)을 착용하시오.";
      const res = extractPpeSummary("hand", shortHand);

      expect(res.summary).toBe("적절한 내화학성 장갑(니트릴)을 착용하시오.");
      expect(res.tags).toContain("니트릴 장갑");
    });

    it("handles empty or missing data", () => {
      const res = extractPpeSummary("body", "자료없음");
      expect(res.hasDetail).toBe(false);
      expect(res.summary).toContain("별도 권고 기준이 없습니다");
    });
  });
});
