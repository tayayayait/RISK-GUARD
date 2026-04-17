import {
  buildCsvEnhancementTokens,
  scoreTextAgainstTokens,
  type CsvEnhancementContext,
} from "./csv-catalog.ts";

export interface MaterialRankingItem {
  id: string;
  type: string;
  title: string;
  url: string;
  language: string;
  relevance: number;
  recommendReason: string;
  selected: boolean;
  excluded: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(text: string) {
  return normalizeText(text)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && token !== "work" && token !== "task" && token !== "setup");
}

function unique(items: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const value = item.trim();
    if (!value) continue;
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function rerankMaterialsWithCsvContext(
  items: MaterialRankingItem[],
  context: CsvEnhancementContext,
) {
  const enhancement = buildCsvEnhancementTokens(context);
  const directEquipmentTokens = unique(
    context.profile.equipment.flatMap((equipmentName) => tokenize(equipmentName)),
  ).slice(0, 8);

  const ranked = items
    .map((item) => {
      const equipmentMatch = scoreTextAgainstTokens(item.title, enhancement.equipmentTokens);
      const processMatch = scoreTextAgainstTokens(item.title, enhancement.processTokens);
      const directEquipmentMatch = scoreTextAgainstTokens(item.title, directEquipmentTokens);

      // Direct equipment match from profile is the strongest signal.
      const equipmentPriorityBonus = directEquipmentMatch.score >= 2 ? 12 : 0;
      const bonus = clamp(
        processMatch.score * 2 +
        equipmentMatch.score * 6 +
        directEquipmentMatch.score * 12 +
        equipmentPriorityBonus,
        0,
        36,
      );
      const nextRelevance = clamp(item.relevance + bonus, 0, 100);

      const reasonParts = [item.recommendReason];
      if (processMatch.score > 0 || equipmentMatch.score > 0 || directEquipmentMatch.score > 0) {
        const matched = unique([
          ...processMatch.matched.map((token) => `\uACF5\uC815:${token}`),
          ...equipmentMatch.matched.map((token) => `\uC124\uBE44:${token}`),
          ...directEquipmentMatch.matched.map((token) => `\uC9C1\uC811\uC124\uBE44:${token}`),
        ]).slice(0, 4);

        reasonParts.push(`\uACF5\uC815/\uC124\uBE44 \uC77C\uCE58 \uADFC\uAC70(${matched.join(", ")})`);
      }

      return {
        item: {
          ...item,
          relevance: nextRelevance,
          recommendReason: reasonParts.join(" | "),
        },
        processMatchScore: processMatch.score,
        equipmentMatchScore: equipmentMatch.score,
        directEquipmentMatchScore: directEquipmentMatch.score,
      };
    })
    .sort((left, right) => {
      if (right.item.relevance !== left.item.relevance) {
        return right.item.relevance - left.item.relevance;
      }
      if (right.directEquipmentMatchScore !== left.directEquipmentMatchScore) {
        return right.directEquipmentMatchScore - left.directEquipmentMatchScore;
      }
      if (right.equipmentMatchScore !== left.equipmentMatchScore) {
        return right.equipmentMatchScore - left.equipmentMatchScore;
      }
      if (right.processMatchScore !== left.processMatchScore) {
        return right.processMatchScore - left.processMatchScore;
      }
      return left.item.title.localeCompare(right.item.title);
    })
    .map((entry) => entry.item);

  return ranked;
}
