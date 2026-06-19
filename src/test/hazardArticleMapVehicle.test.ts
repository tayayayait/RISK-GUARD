import { describe, expect, it } from "vitest";
import { HAZARD_ARTICLE_MAP } from "../../supabase/functions/_shared/hazard-article-map.ts";

describe("vehicle hazard article map", () => {
  it("uses vehicle control article numbers and titles from the stored rules text", () => {
    const entries = HAZARD_ARTICLE_MAP["차량/이동장비 충돌"];
    const byArticle = new Map(entries.map((entry) => [entry.article, entry.title]));

    expect(byArticle.get("제39조")).toBe("작업지휘자의 지정");
    expect(byArticle.get("제40조")).toBe("신호");
    expect(byArticle.get("제172조")).toBe("접촉의 방지");
    expect(byArticle.get("제179조")).toBe("전조등 등의 설치");
    expect(byArticle.get("제184조")).toBe("제동장치 등");
    expect(byArticle.get("제199조")).toBe("전도 등의 방지");
    expect(byArticle.get("제200조")).toBe("접촉 방지");
    expect(byArticle.has("제196조")).toBe(false);
    expect(byArticle.has("제198조")).toBe(false);
  });
});
