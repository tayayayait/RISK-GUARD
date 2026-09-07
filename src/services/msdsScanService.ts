import { invokeBackend } from "./edgeFunctionClient";
import type { ScanRequest, ScanResponse } from "../../supabase/functions/msds-scan-analyze/index";

export type { ScanRequest, ScanResponse };

export async function scanAndAnalyzeMsds(request: ScanRequest): Promise<ScanResponse> {
  const response = await invokeBackend<ScanResponse>({
    supabaseFunction: "msds-scan-analyze",
    legacyPath: "msds-scan-analyze",
    payload: request,
    throwOnError: true,
  });

  if (!response) {
    throw new Error("화학물질 스캔 분석 응답을 받아오지 못했습니다.");
  }

  return response;
}
