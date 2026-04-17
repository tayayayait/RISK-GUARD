import { invokeBackend } from "@/services/edgeFunctionClient";
import type {
  CompanyProfile,
  CompanyProfileStorageSource,
  CompanyProfileUpsertPayload,
} from "@/types/companyProfile";

const COMPANY_PROFILE_CACHE_KEY = "risk-guard:company-profile:cache:v1";
const BUSINESS_NUMBER_DIGITS = 10;
const MAX_MANAGEMENT_NUMBER_LENGTH = 60;
const MAX_BUSINESS_NAME_LENGTH = 160;
const MAX_INDUSTRY_LENGTH = 120;
const MAX_ADDRESS_LENGTH = 240;

interface CompanyProfileResponse {
  item?: CompanyProfile | null;
}

interface ResolveResult {
  item: CompanyProfile | null;
  source: CompanyProfileStorageSource;
}

function getStorage() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage;
}

function toTrimmedValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBusinessNumber(rawBusinessNumber: string) {
  const digits = rawBusinessNumber.replace(/\D/g, "");
  if (digits.length !== BUSINESS_NUMBER_DIGITS) {
    throw new Error("COMPANY_PROFILE_INVALID_BUSINESS_NUMBER");
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function validateRequiredField(fieldName: string, value: string, maxLength: number) {
  const normalized = toTrimmedValue(value);
  if (!normalized) {
    throw new Error(`COMPANY_PROFILE_REQUIRED_${fieldName.toUpperCase()}`);
  }
  if (normalized.length > maxLength) {
    throw new Error(`COMPANY_PROFILE_MAX_LENGTH_${fieldName.toUpperCase()}`);
  }
  return normalized;
}

function validateAndNormalizePayload(payload: CompanyProfileUpsertPayload): CompanyProfileUpsertPayload {
  const businessNumber = normalizeBusinessNumber(toTrimmedValue(payload.businessNumber));
  const managementNumber = validateRequiredField(
    "managementNumber",
    payload.managementNumber,
    MAX_MANAGEMENT_NUMBER_LENGTH,
  );
  const businessName = validateRequiredField("businessName", payload.businessName, MAX_BUSINESS_NAME_LENGTH);
  const industry = validateRequiredField("industry", payload.industry, MAX_INDUSTRY_LENGTH);
  const headquartersAddress = validateRequiredField(
    "headquartersAddress",
    payload.headquartersAddress,
    MAX_ADDRESS_LENGTH,
  );

  return {
    businessNumber,
    managementNumber,
    businessName,
    industry,
    headquartersAddress,
  };
}

function isCompanyProfileShape(value: unknown): value is CompanyProfile {
  if (!value || typeof value !== "object") {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.businessNumber === "string"
    && typeof row.managementNumber === "string"
    && typeof row.businessName === "string"
    && typeof row.industry === "string"
    && typeof row.headquartersAddress === "string"
  );
}

function readCachedProfile() {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const raw = storage.getItem(COMPANY_PROFILE_CACHE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isCompanyProfileShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: CompanyProfile) {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  storage.setItem(COMPANY_PROFILE_CACHE_KEY, JSON.stringify(profile));
}

async function fetchFromServer(businessNumber: string) {
  return invokeBackend<CompanyProfileResponse>({
    supabaseFunction: "company-profile",
    legacyPath: "/company-profile",
    payload: {
      action: "get",
      businessNumber,
    },
    timeoutMs: 30000,
  });
}

async function upsertToServer(payload: CompanyProfileUpsertPayload) {
  return invokeBackend<CompanyProfileResponse>({
    supabaseFunction: "company-profile",
    legacyPath: "/company-profile",
    payload: {
      action: "upsert",
      payload,
    },
    timeoutMs: 30000,
  });
}

export const CompanyProfileService = {
  getCachedCompanyProfile() {
    return readCachedProfile();
  },

  normalizeBusinessNumber(rawBusinessNumber: string) {
    return normalizeBusinessNumber(rawBusinessNumber);
  },

  async getByBusinessNumber(rawBusinessNumber: string): Promise<ResolveResult> {
    const businessNumber = normalizeBusinessNumber(toTrimmedValue(rawBusinessNumber));
    const cached = readCachedProfile();

    try {
      const response = await fetchFromServer(businessNumber);
      if (response?.item && isCompanyProfileShape(response.item)) {
        writeCachedProfile(response.item);
        return {
          item: response.item,
          source: "server",
        };
      }
    } catch (error) {
      console.warn("[CompanyProfileService] Failed to fetch profile from server.", error);
    }

    if (cached) {
      try {
        if (normalizeBusinessNumber(cached.businessNumber) === businessNumber) {
          return {
            item: cached,
            source: "local",
          };
        }
      } catch {
        // ignore malformed local cache
      }
    }

    return {
      item: null,
      source: "none",
    };
  },

  async getLatestProfile(): Promise<ResolveResult> {
    const cached = readCachedProfile();
    if (!cached) {
      return {
        item: null,
        source: "none",
      };
    }

    try {
      return this.getByBusinessNumber(cached.businessNumber);
    } catch {
      return {
        item: null,
        source: "none",
      };
    }
  },

  async upsert(payload: CompanyProfileUpsertPayload): Promise<ResolveResult> {
    const normalizedPayload = validateAndNormalizePayload(payload);

    try {
      const response = await upsertToServer(normalizedPayload);
      if (response?.item && isCompanyProfileShape(response.item)) {
        writeCachedProfile(response.item);
        return {
          item: response.item,
          source: "server",
        };
      }
    } catch (error) {
      console.warn("[CompanyProfileService] Failed to upsert profile to server.", error);
    }

    const fallbackItem: CompanyProfile = {
      ...normalizedPayload,
      updatedAt: new Date().toISOString(),
    };
    writeCachedProfile(fallbackItem);

    return {
      item: fallbackItem,
      source: "local",
    };
  },
};
