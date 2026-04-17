export interface CompanyProfile {
  businessNumber: string;
  managementNumber: string;
  businessName: string;
  industry: string;
  headquartersAddress: string;
  updatedAt?: string;
}

export interface CompanyProfileUpsertPayload {
  businessNumber: string;
  managementNumber: string;
  businessName: string;
  industry: string;
  headquartersAddress: string;
}

export type CompanyProfileStorageSource = "server" | "local" | "none";

