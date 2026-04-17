import { buildLawGuidesPayload, type LawGuideRequestBody } from "./law-guides-core.ts";

export interface LawEvidencePayload {
  items: unknown[];
  lawItems: unknown[];
  guideItems: unknown[];
  mediaItems: unknown[];
  meta?: Record<string, unknown>;
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export async function buildLawEvidencePayload(body: LawGuideRequestBody): Promise<LawEvidencePayload> {
  const payload = await buildLawGuidesPayload(body);
  const lawItems = asArray(payload.lawItems);
  const guideItems = asArray(payload.guideItems);
  const mediaItems = asArray(payload.mediaItems);
  const items = asArray(payload.items);

  return {
    items: items.length > 0 ? items : [...lawItems, ...guideItems, ...mediaItems],
    lawItems,
    guideItems,
    mediaItems,
    ...(asRecord(payload.meta) ? { meta: asRecord(payload.meta) } : {}),
  };
}

