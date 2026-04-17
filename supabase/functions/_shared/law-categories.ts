export const LAW_API_CATEGORIES = ["1", "2", "3", "4"] as const;
export const MEDIA_API_CATEGORIES = ["6"] as const;
export const GUIDE_API_CATEGORIES = ["5", "7", "8", "9", "11"] as const;

export const LAW_GUIDE_CATEGORIES = [
  ...LAW_API_CATEGORIES,
  ...MEDIA_API_CATEGORIES,
  ...GUIDE_API_CATEGORIES,
] as const;

const LAW_GUIDE_CATEGORY_SET = new Set<string>(LAW_GUIDE_CATEGORIES);
const LAW_API_CATEGORY_SET = new Set<string>(LAW_API_CATEGORIES);
const MEDIA_API_CATEGORY_SET = new Set<string>(MEDIA_API_CATEGORIES);
const GUIDE_API_CATEGORY_SET = new Set<string>(GUIDE_API_CATEGORIES);

function normalizeCategory(category: string | undefined) {
  if (!category) {
    return "";
  }

  return category.trim();
}

export function isLawGuideCategory(category: string | undefined) {
  return LAW_GUIDE_CATEGORY_SET.has(normalizeCategory(category));
}

export function isLawApiCategory(category: string | undefined) {
  return LAW_API_CATEGORY_SET.has(normalizeCategory(category));
}

export function isMediaApiCategory(category: string | undefined) {
  return MEDIA_API_CATEGORY_SET.has(normalizeCategory(category));
}

export function isGuideApiCategory(category: string | undefined) {
  return GUIDE_API_CATEGORY_SET.has(normalizeCategory(category));
}
