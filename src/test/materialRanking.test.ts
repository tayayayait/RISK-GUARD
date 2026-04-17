import { describe, expect, it } from "vitest";
import { rerankMaterialsWithCsvContext } from "../../supabase/functions/_shared/material-ranking.ts";

describe("material ranking with csv context", () => {
  it("re-ranks items and appends csv-based reason", () => {
    const ranked = rerankMaterialsWithCsvContext(
      [
        {
          id: "m1",
          type: "OPS",
          title: "paint line safety checklist",
          url: "https://example.com/m1",
          language: "ko",
          relevance: 70,
          recommendReason: "base recommendation",
          selected: false,
          excluded: false,
        },
        {
          id: "m2",
          type: "OPS",
          title: "CNC lathe safety guideline",
          url: "https://example.com/m2",
          language: "ko",
          relevance: 60,
          recommendReason: "base recommendation",
          selected: false,
          excluded: false,
        },
      ],
      {
        taskName: "CNC lathe setup work",
        profile: {
          industry: "manufacturing",
          workLocation: "line 1",
          equipment: ["CNC lathe"],
          hazards: [{ name: "cut", weight: 30 }],
        },
      },
    );

    expect(ranked[0].id).toBe("m2");
    expect(ranked[0].recommendReason).toContain("\uACF5\uC815/\uC124\uBE44 \uC77C\uCE58 \uADFC\uAC70");
  });
});
