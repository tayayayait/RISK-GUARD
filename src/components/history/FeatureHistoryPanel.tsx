import { ExternalLink, History, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface FeatureHistoryItem {
  id: string;
  title: string;
  subtitle?: string;
  updatedAt: string;
}

interface FeatureHistoryPanelProps<T extends FeatureHistoryItem> {
  items: T[];
  onOpen: (item: T) => void;
  onDelete: (item: T) => void;
  onRefresh?: () => void;
  heading?: string;
  description?: string;
  emptyMessage?: string;
  loading?: boolean;
  error?: string;
  openingId?: string;
  deletingId?: string;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "저장 시각 없음";
  }
  return date.toLocaleString("ko-KR", { dateStyle: "medium", timeStyle: "short" });
}

export function FeatureHistoryPanel<T extends FeatureHistoryItem>({
  items,
  onOpen,
  onDelete,
  onRefresh,
  heading = "이전 작업",
  description = "저장한 작업을 다시 열거나 삭제할 수 있습니다.",
  emptyMessage = "저장된 작업 기록이 없습니다.",
  loading = false,
  error = "",
  openingId,
  deletingId,
}: FeatureHistoryPanelProps<T>) {
  return (
    <section className="rounded-radius-lg border border-border bg-surface p-space-5" aria-label={heading}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-heading-3 text-neutral-900">
            <History className="h-5 w-5 text-primary-700" />
            {heading}
            {!loading && (
              <span className="rounded-full bg-primary-050 px-2 py-0.5 text-caption font-medium text-primary-700">
                {items.length}
              </span>
            )}
          </h2>
          <p className="mt-1 text-body-sm text-neutral-500">{description}</p>
        </div>
        {onRefresh && (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
        )}
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 rounded-radius-md bg-neutral-050 p-space-4 text-body-sm text-neutral-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          작업 기록을 불러오는 중입니다.
        </div>
      ) : error ? (
        <p className="mt-4 rounded-radius-md border border-danger-200 bg-danger-050 p-space-4 text-body-sm text-danger-700">
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-4 rounded-radius-md border border-dashed border-neutral-200 bg-neutral-050 p-space-4 text-body-sm text-neutral-600">
          {emptyMessage}
        </p>
      ) : (
        <ul className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => {
            const isOpening = openingId === item.id;
            const isDeleting = deletingId === item.id;
            return (
              <li key={item.id} className="rounded-radius-md border border-neutral-200 bg-white p-space-3 [content-visibility:auto] [contain-intrinsic-size:0_112px]">
                <p className="truncate text-body-md font-medium text-neutral-900">{item.title || "제목 없는 작업"}</p>
                {item.subtitle && <p className="mt-1 truncate text-caption text-neutral-600">{item.subtitle}</p>}
                <p className="mt-2 text-caption text-neutral-500">{formatUpdatedAt(item.updatedAt)}</p>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onOpen(item)}
                    disabled={isOpening || Boolean(openingId) || Boolean(deletingId)}
                    aria-label={`${item.title} 열기`}
                  >
                    {isOpening ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="mr-1 h-3.5 w-3.5" />}
                    {isOpening ? "여는 중" : "열기"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-danger-700 hover:bg-danger-050 hover:text-danger-700"
                    onClick={() => onDelete(item)}
                    disabled={isDeleting || Boolean(openingId) || Boolean(deletingId)}
                    aria-label={`${item.title} 삭제`}
                  >
                    {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
