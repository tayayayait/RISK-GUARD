import { describe, expect, it } from "vitest";
import { buildCsvEnhancementTokens, scoreTextAgainstTokens } from "../../supabase/functions/_shared/csv-catalog.ts";

const loader = {
  constructionCatalog: [
    {
      projectType: "apartment",
      tradeName: "foundation pile",
      detailProcess: "drilling",
      tokens: ["apartment", "foundation", "pile", "drilling", "foundationpile"],
    },
  ],
  equipmentCatalog: [
    {
      majorIndustry: "manufacturing",
      middleIndustry: "metal",
      subIndustry: "machining",
      equipmentName: "cnc lathe",
      equipmentNameEn: "CNC lathe",
      tokens: ["manufacturing", "cnc", "lathe", "cnclathe"],
    },
  ],
};

describe("csv catalog enhancement", () => {
  it("matches normal query and returns process/equipment tokens", () => {
    const result = buildCsvEnhancementTokens(
      {
        taskName: "apartment foundation pile drilling work",
        profile: {
          industry: "manufacturing",
          workLocation: "line 1",
          equipment: ["cnc lathe"],
          hazards: [{ name: "fall" }],
        },
      },
      loader,
    );

    expect(result.processTokens).toContain("foundation");
    expect(result.equipmentTokens).toContain("cnc");
  });

  it("supports typo matching", () => {
    const result = buildCsvEnhancementTokens(
      {
        taskName: "apartment foundatio pile dring",
        profile: {
          industry: "manufacturing",
          workLocation: "line 1",
          equipment: ["cnc lathee"],
          hazards: [{ name: "fall" }],
        },
      },
      loader,
    );

    expect(result.processTokens).toContain("foundation");
    expect(result.equipmentTokens).toContain("lathe");
  });

  it("supports partial token matching", () => {
    const result = buildCsvEnhancementTokens(
      {
        taskName: "drill operation",
        profile: {
          industry: "manufacturing",
          workLocation: "line 1",
          equipment: [],
          hazards: [],
        },
      },
      loader,
    );

    expect(result.processTokens).toContain("drilling");
  });

  it("returns empty tokens when query is unrelated", () => {
    const result = buildCsvEnhancementTokens(
      {
        taskName: "orbit docking",
        profile: {
          industry: "space",
          workLocation: "hangar",
          equipment: ["quantum rig"],
          hazards: [{ name: "radiation" }],
        },
      },
      loader,
    );

    expect(result.processTokens).toEqual([]);
    expect(result.equipmentTokens).toEqual([]);
    expect(result.industryHintTokens).toEqual([]);
  });

  it("scores title text against catalog tokens", () => {
    const scored = scoreTextAgainstTokens("CNC lathee operation manual", ["cnc", "lathe", "drilling"]);
    expect(scored.score).toBeGreaterThanOrEqual(2);
    expect(scored.matched).toContain("cnc");
  });
});
