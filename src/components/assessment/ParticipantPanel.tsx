import { useState } from "react";
import { useAssessment } from "@/contexts/AssessmentContext";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  PARTICIPANT_ROLE_LABELS,
  PARTICIPATION_METHOD_LABELS,
  type ParticipantRole,
  type ParticipationMethod,
} from "@/types/assessment";

const INPUT_CLASS =
  "h-9 w-full rounded-radius-md border border-border bg-surface px-2 text-body-sm text-neutral-900 outline-none focus-visible:ring-1 focus-visible:ring-primary-600";

/**
 * 위험성평가 참여자 기록 (시행규칙 제37조의2 / 제37조의4제1항제2호).
 * 사업장 순회 점검이 원칙이고 설문조사·면담을 병행할 수 있다.
 */
export function ParticipantPanel() {
  const { assessment, addParticipant, removeParticipant } = useAssessment();
  const { toast } = useToast();

  const [name, setName] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [role, setRole] = useState<ParticipantRole>("worker");
  const [method, setMethod] = useState<ParticipationMethod>("site_patrol");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const participants = assessment?.participants ?? [];
  const isSaved = Boolean(assessment?.persistedId);
  const hasWorkerRepresentative = participants.some((item) => item.role === "worker_representative");

  const handleAdd = async () => {
    if (!name.trim()) {
      toast({ title: "참여자 이름을 입력해 주세요." });
      return;
    }

    setIsSubmitting(true);
    try {
      await addParticipant({
        name: name.trim(),
        role,
        affiliation: affiliation.trim() || undefined,
        method,
        participatedAt: assessment?.workDate || undefined,
      });
      setName("");
      setAffiliation("");
    } catch (error) {
      console.error("[ParticipantPanel] Failed to add participant.", error);
      toast({
        title: "참여자 추가 실패",
        description: isSaved
          ? "잠시 후 다시 시도해 주세요."
          : "평가가 저장된 뒤에 참여자를 기록할 수 있습니다.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemove = async (participantId: string) => {
    try {
      await removeParticipant(participantId);
    } catch (error) {
      console.error("[ParticipantPanel] Failed to remove participant.", error);
      toast({ title: "참여자 삭제 실패", description: "잠시 후 다시 시도해 주세요." });
    }
  };

  return (
    <section
      className="rounded-radius-lg border border-border bg-surface p-space-5"
      data-testid="participant-panel"
    >
      <div className="mb-space-3">
        <h2 className="text-heading-2 text-neutral-900">참여 근로자</h2>
        <p className="text-caption text-neutral-500">
          위험성평가에 참여한 근로자와 근로자대표를 기록합니다. 순회 점검이 원칙이며 설문조사·면담을
          병행할 수 있습니다.
        </p>
      </div>

      {!hasWorkerRepresentative && participants.length > 0 && (
        <p
          className="mb-space-3 rounded-radius-md bg-warning-050 px-2 py-1 text-caption text-warning-700"
          data-testid="participant-representative-warning"
        >
          근로자대표가 기록되지 않았습니다. 근로자대표가 요구하면 참여시켜야 합니다.
        </p>
      )}

      <div className="mb-space-4 grid gap-space-2 sm:grid-cols-5">
        <input
          className={INPUT_CLASS}
          placeholder="이름"
          aria-label="참여자 이름"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          className={INPUT_CLASS}
          placeholder="소속 (선택)"
          aria-label="참여자 소속"
          value={affiliation}
          onChange={(event) => setAffiliation(event.target.value)}
        />
        <select
          className={INPUT_CLASS}
          aria-label="참여자 역할"
          value={role}
          onChange={(event) => setRole(event.target.value as ParticipantRole)}
        >
          {Object.entries(PARTICIPANT_ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className={INPUT_CLASS}
          aria-label="참여 방법"
          value={method}
          onChange={(event) => setMethod(event.target.value as ParticipationMethod)}
        >
          {Object.entries(PARTICIPATION_METHOD_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <Button
          type="button"
          onClick={() => void handleAdd()}
          disabled={isSubmitting || !isSaved}
          data-testid="participant-add"
        >
          추가
        </Button>
      </div>

      {!isSaved && (
        <p className="mb-space-3 text-caption text-neutral-500">
          평가가 저장된 뒤에 참여자를 기록할 수 있습니다.
        </p>
      )}

      {participants.length === 0 ? (
        <p className="text-body-sm text-neutral-500">기록된 참여자가 없습니다.</p>
      ) : (
        <ul className="space-y-space-2">
          {participants.map((participant) => (
            <li
              key={participant.id}
              className="flex items-center justify-between rounded-radius-md border border-border px-space-3 py-space-2"
            >
              <div className="text-body-sm text-neutral-900">
                <span className="font-medium">{participant.name}</span>
                <span className="ml-2 text-caption text-neutral-500">
                  {PARTICIPANT_ROLE_LABELS[participant.role]}
                  {participant.affiliation ? ` · ${participant.affiliation}` : ""}
                  {` · ${PARTICIPATION_METHOD_LABELS[participant.method]}`}
                </span>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => void handleRemove(participant.id)}
                aria-label={`${participant.name} 삭제`}
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
