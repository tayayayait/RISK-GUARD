export interface UniqueLegalBasisOption {
  legalBasis: string;
  articleNumber: string;
  score: number;
}

const ARTICLE_NUMBER_PATTERN = /제\s*\d+\s*조(?:의\s*\d+)?/;
const ASSIGNED_COUNT_WEIGHT = 1_000_000;
const PREFERRED_MATCH_WEIGHT = 1_000;
const UNAVAILABLE_WEIGHT = -1_000_000_000;

const normalizeSpace = (value: string) => value.trim().replace(/\s+/g, " ");

const legalBasisKey = (option: UniqueLegalBasisOption) => {
  const articleNumber = normalizeSpace(option.articleNumber || option.legalBasis).match(ARTICLE_NUMBER_PATTERN)?.[0] ?? "";
  return articleNumber.replace(/\s+/g, "") || normalizeSpace(option.legalBasis);
};

const normalizeOptions = (options: UniqueLegalBasisOption[]) => {
  const bestByKey = new Map<string, UniqueLegalBasisOption>();
  for (const option of options) {
    const key = legalBasisKey(option);
    if (!key || !normalizeSpace(option.legalBasis)) {
      continue;
    }
    const previous = bestByKey.get(key);
    if (!previous || previous.score < option.score) {
      bestByKey.set(key, option);
    }
  }
  return [...bestByKey.values()].sort((left, right) => right.score - left.score);
};

export function assignUniqueLegalBasisOptions(
  optionsByRow: UniqueLegalBasisOption[][],
  preferredLegalBases: string[] = [],
): string[] {
  const normalizedOptions = optionsByRow.map(normalizeOptions);
  const preferred = preferredLegalBases.map(normalizeSpace);
  if (normalizedOptions.length === 0) {
    return [];
  }

  const articleKeys = [...new Set(normalizedOptions.flatMap((options) => options.map(legalBasisKey)))];
  const articleIndexByKey = new Map(articleKeys.map((key, index) => [key, index]));
  const columnCount = articleKeys.length + normalizedOptions.length;
  const weights = normalizedOptions.map((options, rowIndex) => {
    const rowWeights = Array.from({ length: columnCount }, () => UNAVAILABLE_WEIGHT);
    for (const option of options) {
      const columnIndex = articleIndexByKey.get(legalBasisKey(option));
      if (columnIndex === undefined) {
        continue;
      }
      const preferredBonus = normalizeSpace(option.legalBasis) === preferred[rowIndex]
        ? PREFERRED_MATCH_WEIGHT
        : 0;
      rowWeights[columnIndex] = ASSIGNED_COUNT_WEIGHT + preferredBonus + option.score;
    }
    for (let dummyIndex = articleKeys.length; dummyIndex < columnCount; dummyIndex += 1) {
      rowWeights[dummyIndex] = 0;
    }
    return rowWeights;
  });
  const maximumWeight = Math.max(0, ...weights.flat());
  const costs = weights.map((row) => row.map((weight) => maximumWeight - weight));
  const rowCount = costs.length;
  const rowPotentials = Array.from({ length: rowCount + 1 }, () => 0);
  const columnPotentials = Array.from({ length: columnCount + 1 }, () => 0);
  const matchedRowByColumn = Array.from({ length: columnCount + 1 }, () => 0);
  const previousColumn = Array.from({ length: columnCount + 1 }, () => 0);

  for (let row = 1; row <= rowCount; row += 1) {
    matchedRowByColumn[0] = row;
    let currentColumn = 0;
    const minimumValues = Array.from({ length: columnCount + 1 }, () => Number.POSITIVE_INFINITY);
    const usedColumns = Array.from({ length: columnCount + 1 }, () => false);

    do {
      usedColumns[currentColumn] = true;
      const currentRow = matchedRowByColumn[currentColumn];
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;
      for (let column = 1; column <= columnCount; column += 1) {
        if (usedColumns[column]) {
          continue;
        }
        const reducedCost = costs[currentRow - 1][column - 1]
          - rowPotentials[currentRow]
          - columnPotentials[column];
        if (reducedCost < minimumValues[column]) {
          minimumValues[column] = reducedCost;
          previousColumn[column] = currentColumn;
        }
        if (minimumValues[column] < delta) {
          delta = minimumValues[column];
          nextColumn = column;
        }
      }
      for (let column = 0; column <= columnCount; column += 1) {
        if (usedColumns[column]) {
          rowPotentials[matchedRowByColumn[column]] += delta;
          columnPotentials[column] -= delta;
        } else {
          minimumValues[column] -= delta;
        }
      }
      currentColumn = nextColumn;
    } while (matchedRowByColumn[currentColumn] !== 0);

    do {
      const nextColumn = previousColumn[currentColumn];
      matchedRowByColumn[currentColumn] = matchedRowByColumn[nextColumn];
      currentColumn = nextColumn;
    } while (currentColumn !== 0);
  }

  const assignedColumnByRow = Array.from({ length: rowCount }, () => -1);
  for (let column = 1; column <= columnCount; column += 1) {
    const row = matchedRowByColumn[column];
    if (row > 0) {
      assignedColumnByRow[row - 1] = column - 1;
    }
  }

  return assignedColumnByRow.map((columnIndex, rowIndex) => {
    if (columnIndex < 0 || columnIndex >= articleKeys.length) {
      return "";
    }
    const assignedKey = articleKeys[columnIndex];
    return normalizedOptions[rowIndex].find((option) => legalBasisKey(option) === assignedKey)?.legalBasis ?? "";
  });
}
