import { MonitorX } from "lucide-react";

export function UnsupportedScreen() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-space-6">
      <div className="max-w-xl w-full bg-surface border border-border rounded-radius-xl p-space-8 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-warning-050 text-warning-600 mb-space-4">
          <MonitorX className="h-7 w-7" />
        </div>
        <h1 className="text-heading-2 text-neutral-900 mb-space-3">지원되지 않는 해상도</h1>
        <p className="text-body-md text-neutral-700 leading-relaxed">
          RISK-GUARD는 1024px 이상 데스크톱 환경에서 사용하도록 설계되었습니다.
          <br />
          브라우저 창 너비를 늘린 뒤 다시 접속하세요.
        </p>
      </div>
    </div>
  );
}

