import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CompanyProfileService } from "@/services/companyProfileService";
import type { CompanyProfileStorageSource, CompanyProfileUpsertPayload } from "@/types/companyProfile";

interface FormState extends CompanyProfileUpsertPayload {}

const EMPTY_FORM: FormState = {
  businessNumber: "",
  managementNumber: "",
  businessName: "",
  industry: "",
  headquartersAddress: "",
};

function toFriendlyError(error: unknown) {
  const code = error instanceof Error ? error.message : "";
  if (code === "COMPANY_PROFILE_INVALID_BUSINESS_NUMBER") {
    return "사업자등록번호는 숫자 10자리 형식이어야 합니다.";
  }
  if (code.startsWith("COMPANY_PROFILE_REQUIRED_")) {
    return "모든 회사 정보 항목을 입력해 주세요.";
  }
  if (code.startsWith("COMPANY_PROFILE_MAX_LENGTH_")) {
    return "입력 가능한 최대 길이를 초과한 항목이 있습니다.";
  }
  return "회사 정보 저장 중 오류가 발생했습니다.";
}

function toStorageLabel(source: CompanyProfileStorageSource) {
  if (source === "server") {
    return "서버 저장";
  }
  if (source === "local") {
    return "로컬 폴백 저장";
  }
  return "미저장";
}

export default function Settings() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFetchingByNumber, setIsFetchingByNumber] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [storageSource, setStorageSource] = useState<CompanyProfileStorageSource>("none");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        setErrorMessage("");
        const result = await CompanyProfileService.getLatestProfile();
        if (cancelled) {
          return;
        }

        if (result.item) {
          setForm({
            businessNumber: result.item.businessNumber,
            managementNumber: result.item.managementNumber,
            businessName: result.item.businessName,
            industry: result.item.industry,
            headquartersAddress: result.item.headquartersAddress,
          });
        }
        setStorageSource(result.source);
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(toFriendlyError(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const canSubmit = useMemo(() => {
    return (
      form.businessNumber.trim().length > 0
      && form.managementNumber.trim().length > 0
      && form.businessName.trim().length > 0
      && form.industry.trim().length > 0
      && form.headquartersAddress.trim().length > 0
    );
  }, [form]);

  const handleChange = (field: keyof FormState, value: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setErrorMessage("");
      setStatusMessage("");

      const result = await CompanyProfileService.upsert(form);
      if (!result.item) {
        throw new Error("COMPANY_PROFILE_SAVE_FAILED");
      }

      setForm({
        businessNumber: result.item.businessNumber,
        managementNumber: result.item.managementNumber,
        businessName: result.item.businessName,
        industry: result.item.industry,
        headquartersAddress: result.item.headquartersAddress,
      });
      setStorageSource(result.source);
      setStatusMessage(
        result.source === "server"
          ? "회사 정보가 서버에 저장되었습니다. 산업재해조사표에서 자동 입력됩니다."
          : "서버 연결 실패로 로컬에 저장했습니다. 동일 브라우저에서 자동 입력됩니다.",
      );
    } catch (error) {
      setErrorMessage(toFriendlyError(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadByBusinessNumber = async () => {
    try {
      setIsFetchingByNumber(true);
      setErrorMessage("");
      setStatusMessage("");

      const result = await CompanyProfileService.getByBusinessNumber(form.businessNumber);
      if (!result.item) {
        setStorageSource(result.source);
        setStatusMessage("해당 사업자등록번호로 저장된 회사 정보가 없습니다.");
        return;
      }

      setForm({
        businessNumber: result.item.businessNumber,
        managementNumber: result.item.managementNumber,
        businessName: result.item.businessName,
        industry: result.item.industry,
        headquartersAddress: result.item.headquartersAddress,
      });
      setStorageSource(result.source);
      setStatusMessage(
        result.source === "server"
          ? "서버에 저장된 회사 정보를 불러왔습니다."
          : "로컬 캐시에 저장된 회사 정보를 불러왔습니다.",
      );
    } catch (error) {
      setErrorMessage(toFriendlyError(error));
    } finally {
      setIsFetchingByNumber(false);
    }
  };

  return (
    <DashboardShell>
      <div className="max-w-3xl mx-auto space-y-space-5">
        <header>
          <h1 className="text-heading-1 text-neutral-900 tracking-tight">회사 정보 설정</h1>
          <p className="text-body-md text-neutral-600 mt-1">
            아래 값은 산업재해조사표의 사업장 정보 고정값으로 자동 입력됩니다.
          </p>
        </header>

        <section className="rounded-radius-lg border border-border bg-surface p-space-5 space-y-space-4">
          <div className="rounded-radius-sm border border-neutral-200 bg-neutral-050 px-space-3 py-space-2 text-body-sm text-neutral-700">
            현재 저장 상태: <span className="font-semibold">{toStorageLabel(storageSource)}</span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-body-sm text-neutral-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              회사 정보를 불러오는 중입니다.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-space-3">
              <div className="space-y-1">
                <label htmlFor="company-business-number" className="text-label-sm text-neutral-700">
                  사업자등록번호
                </label>
                <div className="flex gap-2">
                  <Input
                    id="company-business-number"
                    value={form.businessNumber}
                    onChange={(event) => handleChange("businessNumber", event.target.value)}
                    placeholder="예: 123-45-67890"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0"
                    disabled={isLoading || isSaving || isFetchingByNumber || !form.businessNumber.trim()}
                    onClick={() => void handleLoadByBusinessNumber()}
                  >
                    {isFetchingByNumber ? <Loader2 className="h-4 w-4 animate-spin" /> : "불러오기"}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <label htmlFor="company-management-number" className="text-label-sm text-neutral-700">
                  산재관리번호(본사 고유 번호)
                </label>
                <Input
                  id="company-management-number"
                  value={form.managementNumber}
                  onChange={(event) => handleChange("managementNumber", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="company-business-name" className="text-label-sm text-neutral-700">
                  사업장명
                </label>
                <Input
                  id="company-business-name"
                  value={form.businessName}
                  onChange={(event) => handleChange("businessName", event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="company-industry" className="text-label-sm text-neutral-700">
                  업종
                </label>
                <Input
                  id="company-industry"
                  value={form.industry}
                  onChange={(event) => handleChange("industry", event.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <label htmlFor="company-headquarters-address" className="text-label-sm text-neutral-700">
                  소재지(본사 주소)
                </label>
                <Input
                  id="company-headquarters-address"
                  value={form.headquartersAddress}
                  onChange={(event) => handleChange("headquartersAddress", event.target.value)}
                />
              </div>
            </div>
          )}

          {statusMessage && (
            <div className="rounded-radius-sm border border-success-200 bg-success-050 p-space-3 text-body-sm text-success-700 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="rounded-radius-sm border border-danger-200 bg-danger-050 p-space-3 text-body-sm text-danger-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              className="bg-primary-700 hover:bg-primary-900 text-white min-w-[160px]"
              disabled={isLoading || isSaving || !canSubmit}
              onClick={() => void handleSave()}
            >
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              회사 정보 저장
            </Button>
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
