interface SmartSearchHeader {
  resultCode?: unknown;
  resultMsg?: unknown;
}

interface SmartSearchBody {
  total_media?: unknown;
  items?: unknown;
  associated_word?: unknown;
  categorycount?: unknown;
  totalCount?: unknown;
  pageNo?: unknown;
  numOfRows?: unknown;
  dataType?: unknown;
}

interface SmartSearchRoot {
  response?: {
    header?: SmartSearchHeader;
    body?: SmartSearchBody;
  };
  header?: SmartSearchHeader;
  body?: SmartSearchBody;
}

export interface SmartSearchParsedPayload {
  hasContractShape: boolean;
  headerCode: string;
  headerMessage: string;
  media: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  associatedWords: string[];
  categoryCount: Record<string, number>;
  totalCount: number;
  pageNo: number;
  numOfRows: number;
  dataType: string;
}

export interface OpenApiServiceError {
  errMsg: string;
  returnAuthMsg: string;
  returnReasonCode: string;
}

function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) {
    return value as T[];
  }
  if (value && typeof value === "object") {
    return [value as T];
  }
  return [];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function parseJsonStringPayload(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }
  const text = value.trim();
  if (!text || (!text.startsWith("{") && !text.startsWith("["))) {
    return value;
  }
  try {
    return JSON.parse(text);
  } catch {
    return value;
  }
}

function toString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function extractXmlTag(xml: string, tag: string) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(new RegExp(`<${escaped}>([\\s\\S]*?)</${escaped}>`, "i"));
  return match?.[1]?.trim() ?? "";
}

function normalizeErrorToken(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_:-]/g, "")
    .toUpperCase();
}

export function parseOpenApiServiceErrorXml(raw: string): OpenApiServiceError | null {
  const text = raw.trim();
  if (!text || !/<OpenAPI_ServiceResponse[\s>]/i.test(text)) {
    return null;
  }

  const errMsg = extractXmlTag(text, "errMsg");
  const returnAuthMsg = extractXmlTag(text, "returnAuthMsg");
  const returnReasonCode = extractXmlTag(text, "returnReasonCode");

  if (!errMsg && !returnAuthMsg && !returnReasonCode) {
    return null;
  }

  return {
    errMsg,
    returnAuthMsg,
    returnReasonCode,
  };
}

export function formatOpenApiServiceError(raw: string): string | null {
  const parsed = parseOpenApiServiceErrorXml(raw);
  if (!parsed) {
    return null;
  }

  const code = normalizeErrorToken(parsed.returnAuthMsg || parsed.errMsg || "UNKNOWN_ERROR");
  const reason = normalizeErrorToken(parsed.returnReasonCode);
  return reason ? `OPENAPI_${code}:${reason}` : `OPENAPI_${code}`;
}

export function parseSmartSearchPayload(payload: unknown): SmartSearchParsedPayload {
  const normalizedPayload = parseJsonStringPayload(payload);
  const root = (normalizedPayload ?? {}) as SmartSearchRoot;
  const responseRecord = asRecord(root.response);
  const header = (responseRecord.header ?? root.header ?? {}) as SmartSearchHeader;
  const body = (responseRecord.body ?? root.body ?? {}) as SmartSearchBody;
  const bodyRecord = asRecord(body);
  const hasContractShape = (
    Object.keys(asRecord(header)).length > 0
    || Object.keys(bodyRecord).length > 0
    || Object.keys(responseRecord).length > 0
  );

  const totalMediaRaw = (() => {
    const value = bodyRecord.total_media;
    const valueRecord = asRecord(value);
    if (Object.prototype.hasOwnProperty.call(valueRecord, "media")) {
      return valueRecord.media;
    }
    return value;
  })();

  const itemsRaw = (() => {
    const itemsValue = bodyRecord.items ?? bodyRecord.item;
    const itemsRecord = asRecord(itemsValue);
    if (Object.prototype.hasOwnProperty.call(itemsRecord, "item")) {
      return itemsRecord.item;
    }
    return itemsValue;
  })();

  const associatedWordRaw = bodyRecord.associated_word;
  const associatedWords = Array.isArray(associatedWordRaw)
    ? associatedWordRaw.map((value) => toString(value)).filter(Boolean)
    : toString(associatedWordRaw)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

  const categoryCountRaw = asRecord(bodyRecord.categorycount);
  const categoryCount = Object.entries(categoryCountRaw).reduce<Record<string, number>>((acc, [key, value]) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      return acc;
    }
    acc[normalizedKey] = toNumber(value);
    return acc;
  }, {});

  return {
    hasContractShape,
    headerCode: toString(header.resultCode),
    headerMessage: toString(header.resultMsg),
    media: asArray<Record<string, unknown>>(totalMediaRaw),
    items: asArray<Record<string, unknown>>(itemsRaw),
    associatedWords,
    categoryCount,
    totalCount: toNumber(bodyRecord.totalCount),
    pageNo: toNumber(bodyRecord.pageNo),
    numOfRows: toNumber(bodyRecord.numOfRows),
    dataType: toString(bodyRecord.dataType),
  };
}
