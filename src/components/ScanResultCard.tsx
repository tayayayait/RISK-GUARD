import React from "react";
import { HeartPulse, Scale, ShieldAlert } from "lucide-react";
import { GhsPictogram } from "./GhsPictogram";
import { PpeChecklist } from "./PpeChecklist";
import { DiscrepancyAlert } from "./DiscrepancyAlert";
import type { ScanResponse } from "../../supabase/functions/msds-scan-analyze/index";
import { decodeHtmlEntities } from "../lib/msdsFormatter";

interface ScanResultCardProps {
  data: ScanResponse;
}

export const ScanResultCard: React.FC<ScanResultCardProps> = ({ data }) => {
  const { substance, hazard, firstAid, ppe, regulation, ppeChecklist, discrepancies, disclaimer, sources, meta } = data;

  if (!substance) {
    return null;
  }

  const confidenceBadgeColor = {
    high: "bg-emerald-100 text-emerald-800 border-emerald-300",
    medium: "bg-blue-100 text-blue-800 border-blue-300",
    low: "bg-amber-100 text-amber-800 border-amber-300",
    none: "bg-neutral-100 text-neutral-800 border-neutral-300",
  }[substance.confidence || "none"];

  const resolvedByLabel = {
    cas: "CAS 번호 정확 매칭",
    un: "UN 번호 매칭",
    name_ko: "국문 물질명 매칭",
    name_en_bridge: "영문 물질명(NCIS) 브리지",
    pubchem: "PubChem 국제 데이터",
    unresolved: "미특정",
  }[substance.resolvedBy] || substance.resolvedBy;

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto" data-testid="scan-result-card">
      {/* 1. 교차검증 불일치 알림 (최상단) */}
      <DiscrepancyAlert discrepancies={discrepancies} />

      {/* 2. 물질 마스터 카드 */}
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl md:text-2xl font-black text-neutral-900" data-testid="substance-name">
                {decodeHtmlEntities(substance.chemNameKor)}
              </h2>
              {hazard?.signalWord && (
                <span
                  className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${
                    hazard.signalWord === "위험"
                      ? "bg-red-600 text-white"
                      : "bg-amber-500 text-white"
                  }`}
                  data-testid="signal-word-badge"
                >
                  {hazard.signalWord}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs md:text-sm text-neutral-600 mt-2">
              {substance.casNo && <span>CAS No. <strong>{substance.casNo}</strong></span>}
              {substance.unNo && <span>UN No. <strong>{substance.unNo}</strong></span>}
              <span>물질 ID: <strong>{substance.chemId}</strong></span>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1">
            <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${confidenceBadgeColor}`}>
              {resolvedByLabel}
            </span>
            {meta?.servedFromCache && (
              <span className="text-[11px] text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded">
                ⚡ 캐시 데이터 제공
              </span>
            )}
          </div>
        </div>

        {/* 3. GHS 그림문자(픽토그램) 행 */}
        {hazard?.pictograms && hazard.pictograms.length > 0 && (
          <div className="space-y-2 pt-1">
            <h4 className="text-xs font-bold text-neutral-500 tracking-wider uppercase">
              유해성·위험성 그림문자 (GHS)
            </h4>
            <div className="flex flex-wrap gap-4 py-2" data-testid="ghs-pictograms-row">
              {hazard.pictograms.map((pic) => (
                <GhsPictogram key={pic} code={pic} size="md" />
              ))}
            </div>
          </div>
        )}

        {/* 유해위험문구(H코드) */}
        {hazard?.hCodes && hazard.hCodes.length > 0 && (
          <div className="space-y-2 pt-2 border-t text-xs">
            <h4 className="font-bold text-neutral-700">주요 유해·위험문구</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {hazard.hCodes.map((h, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-2 p-2 rounded-lg bg-neutral-50 border border-neutral-200/70"
                >
                  <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 font-bold text-[11px] shrink-0">
                    {h.code}
                  </span>
                  <span className="text-neutral-800 leading-snug font-medium break-words">
                    {decodeHtmlEntities(h.text)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. 필수 개인보호구 체크리스트 */}
      {ppeChecklist && ppeChecklist.length > 0 && (
        <PpeChecklist items={ppeChecklist} />
      )}

      {/* 5. 응급조치 요령 */}
      {firstAid && (
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-3" data-testid="first-aid-section">
          <div className="flex items-center gap-2 border-b pb-3">
            <HeartPulse className="w-5 h-5 text-red-500" />
            <h3 className="font-bold text-neutral-900 text-base md:text-lg">
              응급조치 요령
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {[
              { id: "eye", title: "눈에 들어갔을 때", items: firstAid.eye },
              { id: "skin", title: "피부에 접촉했을 때", items: firstAid.skin },
              { id: "inhalation", title: "흡입했을 때", items: firstAid.inhalation },
              { id: "ingestion", title: "먹었을 때", items: firstAid.ingestion },
            ].map((section) => (
              <div
                key={section.id}
                className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-3.5 space-y-1.5"
              >
                <div className="font-bold text-sm text-neutral-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400"></span>
                  {section.title}
                </div>
                <ul className="text-xs text-neutral-700 space-y-1 pl-3.5 list-disc">
                  {section.items && section.items.length > 0 ? (
                    section.items.map((it, idx) => (
                      <li key={idx} className="leading-relaxed break-words">
                        {decodeHtmlEntities(it)}
                      </li>
                    ))
                  ) : (
                    <li className="text-neutral-400">자료없음</li>
                  )}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. 노출기준 및 법적 규제현황 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {ppe?.exposureLimits && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-2">
            <div className="flex items-center gap-2 font-bold text-neutral-900 text-sm border-b pb-2">
              <ShieldAlert className="w-4 h-4 text-blue-600" />
              노출기준
            </div>
            <div className="text-xs space-y-2 text-neutral-700 pt-1">
              <div>
                <span className="font-medium text-neutral-500 block mb-0.5">국내 규정:</span>
                <span className="font-semibold text-neutral-900 bg-neutral-100 px-2 py-1 rounded inline-block">
                  {decodeHtmlEntities(ppe.exposureLimits.domestic) || "자료없음"}
                </span>
              </div>
              <div>
                <span className="font-medium text-neutral-500 block mb-0.5">ACGIH 규정:</span>
                <span className="text-neutral-800 bg-neutral-50 px-2 py-1 rounded inline-block border border-neutral-200/60">
                  {decodeHtmlEntities(ppe.exposureLimits.acgih) || "자료없음"}
                </span>
              </div>
            </div>
          </div>
        )}

        {regulation && (
          <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm space-y-2">
            <div className="flex items-center gap-2 font-bold text-neutral-900 text-sm border-b pb-2">
              <Scale className="w-4 h-4 text-purple-600" />
              주요 법적 규제현황
            </div>
            <ul className="text-xs text-neutral-700 space-y-1.5 list-none">
              {regulation.oshAct?.map((r, i) => (
                <li key={`osh-${i}`} className="flex items-start gap-1.5">
                  <span className="font-semibold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 text-[10px] shrink-0 mt-0.5">
                    산안법
                  </span>
                  <span className="leading-snug">{decodeHtmlEntities(r)}</span>
                </li>
              ))}
              {regulation.chemicalControlAct?.map((r, i) => (
                <li key={`cca-${i}`} className="flex items-start gap-1.5">
                  <span className="font-semibold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 text-[10px] shrink-0 mt-0.5">
                    화관법
                  </span>
                  <span className="leading-snug">{decodeHtmlEntities(r)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 7. 출처 및 법적 고지문 (항상 표시) */}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs text-neutral-600 space-y-2" data-testid="disclaimer-container">
        <div className="flex flex-wrap gap-3 text-neutral-500 font-medium">
          {sources.map((s, idx) => (
            <span key={idx}>
              출처: {s.label} ({s.api})
            </span>
          ))}
        </div>
        <p className="whitespace-pre-line text-neutral-700 leading-relaxed font-normal border-t pt-2" data-testid="disclaimer-text">
          {decodeHtmlEntities(disclaimer)}
        </p>
      </div>
    </div>
  );
};
