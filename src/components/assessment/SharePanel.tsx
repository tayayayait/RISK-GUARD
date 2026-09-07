import { useState } from "react";
import { useAssessment } from "@/contexts/AssessmentContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  SHARE_METHOD_LABELS,
  SHARE_PHASE_LABELS,
  type ShareMethod,
  type SharePhase,
} from "@/types/assessment";

const INPUT_CLASS =
  "h-9 w-full rounded-radius-md border border-border bg-surface px-2 text-body-sm text-neutral-900 outline-none focus-visible:ring-1 focus-visible:ring-primary-600";

/**
 * 위험성평가 결과 공유 기록 (시행규칙 제37조의3).
 * 실시 전에는 일정을, 실시 후에는 파악한 유해·위험 요인, 위험성 수준 결정 결과,
 * 개선대책 수립 내용 및 이행 결과를 공유한 사실을 남긴다.
 */
export function SharePanel() {
  const { assessment, addShareRecord, removeShareRecord } = useAssessment();
  const { toast } = useToast();

  const [phase, setPhase] = useState<SharePhase>("after");
  const [method, setMethod] = useState<ShareMethod>("posting");
  const [audienceNote, setAudienceNote] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const shareRecords = assessment?.shareRecords ?? [];
  const isSaved = Boolean(assessment?.persistedId);
  const hasAfterShare = shareRecords.some((item) => item.phase === "after");

  const handleAdd = async () => {
    if (!content.trim()) {
      toast({ title: "공유한 내용을 입력해 주세요." });
      return;
    }

    setIsSubmitting(true);
    try {
      await addShareRecord({
        phase,
        method,
        content: content.trim(),
        audienceNote: audienceNote.trim() || undefined,
      });
      setContent("");
      setAudienceNote("");
    } catch (error) {
      console.error("[SharePanel] Failed to add share record.", error);
      toast({
        title: "공유 기록 추가 실패",
        description: isSaved
          ? "잠시 후 다시 시도해 주세요."
          : "평가가 저장된 뒤에 공유 기록을 남길 수 있습니다.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (shareId: string) => {
    try {
      await removeShareRecord(shareId);
    } catch (error) {
      console.error("[SharePanel] Failed to remove share record.", error);
      toast({ title: "공유 기록 삭제 실패", description: "잠시 후 다시 시도해 주세요." });
    }
  };

  return (
    <section
      className="rounded-radius-lg border border-border bg-surface p-space-5"
      data-testid="share-panel"
    >
      <div className="mb-space-3">
        <h2 className="text-heading-2 text-neutral-900">결과 공유 기록</h2>
        <p className="text-caption text-neutral-500">
          위험성평가 실시 일정과 결과를 근로자에게 알린 사실을 기록합니다. 안전보건교육·설명회·사업장
          게시·서면·전자적 방법이 모두 인정됩니다.
        </p>
      </div>

      {!hasAfterShare && (
        <p
          className="mb-space-3 rounded-radius-md bg-warning-050 px-2 py-1 text-caption text-warning-700"
          data-testid="share-after-warning"
        >
          실시 후 결과 공유 기록이 없습니다. 유해·위험 요인, 위험성 수준 결정 결과, 개선대책 수립
          내용 및 이행 결과를 근로자에게 알려야 합니다.
        </p>
      )}

      <div className="mb-space-2 grid gap-space-2 sm:grid-cols-3">
        <select
          className={INPUT_CLASS}
          aria-label="공유 시점"
          value={phase}
          onChange={(event) => setPhase(event.target.value as SharePhase)}
        >
          {Object.entries(SHARE_PHASE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={INPUT_CLASS}
          aria-label="공유 방법"
          value={method}
          onChange={(event) => setMethod(event.target.value as ShareMethod)}
        >
          {Object.entries(SHARE_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          className={INPUT_CLASS}
          placeholder="대상·인원 (선택)"
          aria-label="공유 대상"
          value={audienceNote}
          onChange={(event) => setAudienceNote(event.target.value)}
        />
      </div>

      <div className="mb-space-4 flex gap-space-2">
        <input
          className={INPUT_CLASS}
          placeholder="공유한 내용"
          aria-label="공유 내용"
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
        <Button
          type="button"
          onClick={() => void handleAdd()}
          disabled={isSubmitting || !isSaved}
          data-testid="share-add"
        >
          기록
        </Button>
      </div>

      {!isSaved && (
        <p className="mb-space-3 text-caption text-neutral-500">
          평가가 저장된 뒤에 공유 기록을 남길 수 있습니다.
        </p>
      )}

      {shareRecords.length === 0 ? (
        <p className="text-body-sm text-neutral-500">기록된 공유 이력이 없습니다.</p>
      ) : (
        <ul className="space-y-space-2">
          {shareRecords.map((record) => (
            <li
              key={record.id}
              className="flex items-start justify-between rounded-radius-md border border-border px-space-3 py-space-2"
            >
              <div className="text-body-sm text-neutral-900">
                <div>{record.content}</div>
                <div className="text-caption text-neutral-500">
                  {SHARE_PHASE_LABELS[record.phase]}
                  {` · ${SHARE_METHOD_LABELS[record.method]}`}
                  {record.audienceNote ? ` · ${record.audienceNote}` : ""}
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleRemove(record.id)}
                aria-label="공유 기록 삭제"
              >
                삭제
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
