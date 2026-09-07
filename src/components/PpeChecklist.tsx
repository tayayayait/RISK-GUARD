import React, { useState } from "react";
import { Shield, Eye, Hand, UserCheck, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import type { PpeChecklistItem } from "../../supabase/functions/msds-scan-analyze/index";
import { extractPpeSummary } from "../lib/msdsFormatter";

interface PpeChecklistProps {
  items: PpeChecklistItem[];
}

const PART_ICONS = {
  respiratory: Shield,
  eye: Eye,
  hand: Hand,
  body: UserCheck,
};

const PART_LABELS: Record<string, string> = {
  respiratory: "호흡기 보호",
  eye: "눈·안면 보호",
  hand: "손 보호(장갑)",
  body: "신체·보호복",
};

export const PpeChecklist: React.FC<PpeChecklistProps> = ({ items }) => {
  const [checkedMap, setCheckedMap] = useState<Record<string, boolean>>({});
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});

  const toggleCheck = (part: string) => {
    setCheckedMap((prev) => ({ ...prev, [part]: !prev[part] }));
  };

  const toggleExpand = (part: string) => {
    setExpandedMap((prev) => ({ ...prev, [part]: !prev[part] }));
  };

  const allChecked = items.length > 0 && items.every((item) => checkedMap[item.part]);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm space-y-4" data-testid="ppe-checklist-container">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-indigo-600 shrink-0" />
          <h3 className="font-bold text-neutral-900 text-base md:text-lg">
            필수 개인보호구(PPE) 체크리스트
          </h3>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
            allChecked
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {allChecked ? "✓ 모든 보호구 착용 확인됨" : "작업 전 착용 확인 필요"}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5" data-testid="ppe-checklist-grid">
        {items.map((item) => {
          const Icon = PART_ICONS[item.part] || Shield;
          const isChecked = Boolean(checkedMap[item.part]);
          const isExpanded = Boolean(expandedMap[item.part]);
          const partLabel = PART_LABELS[item.part] || item.part;

          const { summary, tags, hasDetail, detailLines, rawCleaned } = extractPpeSummary(
            item.part,
            item.requirement
          );

          return (
            <div
              key={item.part}
              onClick={() => toggleCheck(item.part)}
              className={`flex flex-col justify-between p-4 rounded-xl border transition-all cursor-pointer select-none ${
                isChecked
                  ? "border-emerald-400 bg-emerald-50/40 shadow-xs"
                  : "border-neutral-200 bg-neutral-50/50 hover:bg-neutral-100/60 hover:border-neutral-300"
              }`}
              data-testid={`ppe-item-${item.part}`}
            >
              <div>
                {/* 상단: 아이콘 + 부위 라벨 + 체크 아이콘 */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`p-1.5 rounded-lg flex items-center justify-center transition-colors ${
                        isChecked
                          ? "bg-emerald-600 text-white"
                          : "bg-white text-neutral-700 border border-neutral-200 shadow-xs"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="font-bold text-sm text-neutral-900">
                      {partLabel}
                    </span>
                  </div>

                  <div className="shrink-0">
                    <CheckCircle2
                      className={`w-5 h-5 transition-colors ${
                        isChecked ? "text-emerald-600 fill-emerald-100" : "text-neutral-300"
                      }`}
                    />
                  </div>
                </div>

                {/* 핵심 태그 배지들 */}
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 my-2">
                    {tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-md border ${
                          isChecked
                            ? "bg-emerald-100/70 text-emerald-800 border-emerald-200"
                            : "bg-white text-indigo-700 border-indigo-100 shadow-2xs"
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* 핵심 요약 문구 */}
                <p className="text-xs text-neutral-800 font-medium leading-relaxed break-words mt-1">
                  {summary}
                </p>
              </div>

              {/* 세부 내용 보기 / 접기 토글 */}
              {hasDetail && (
                <div className="mt-3 pt-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(item.part);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-neutral-500 hover:text-indigo-600 transition-colors py-0.5"
                    data-testid={`ppe-toggle-detail-${item.part}`}
                  >
                    <span>{isExpanded ? "상세 규정 접기" : "공단 상세 규정 보기"}</span>
                    {isExpanded ? (
                      <ChevronUp className="w-3.5 h-3.5" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {isExpanded && (
                    <div
                      className="mt-2 p-3 rounded-lg border border-neutral-200 bg-white/90 text-xs text-neutral-700 space-y-1.5 animate-in fade-in duration-150"
                      data-testid={`ppe-detail-${item.part}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="font-semibold text-[10px] text-neutral-400 tracking-wider uppercase">
                        KOSHA 공식 기준 원문
                      </div>
                      {detailLines.length > 1 ? (
                        <ul className="list-disc list-inside space-y-1 text-neutral-700 leading-relaxed pl-1">
                          {detailLines.map((line, idx) => (
                            <li key={idx} className="break-words">
                              {line}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="leading-relaxed break-words text-neutral-700">
                          {rawCleaned}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
