import React from "react";
import { RotateCcw, AlertCircle } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

interface ChatResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const ChatResetDialog: React.FC<ChatResetDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
}) => {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[420px] rounded-2xl border border-border/80 bg-card/95 p-5 sm:p-6 backdrop-blur-md shadow-2xl space-y-4">
        <AlertDialogHeader className="space-y-3 sm:space-y-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 shadow-xs">
              <RotateCcw className="h-5 w-5 stroke-[1.8]" />
            </div>
            <div>
              <AlertDialogTitle className="text-base sm:text-lg font-bold text-foreground text-left">
                현재 대화 초기화
              </AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-muted-foreground text-left mt-0.5">
                진행 중인 대화를 초기화하고 새 대화를 시작합니다.
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 dark:bg-muted/20 border border-border/70 rounded-xl p-3">
          <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            현재 화면의 대화 내용이 모두 지워지고 새 세션이 시작됩니다. 계속하시겠습니까?
          </p>
        </div>

        <AlertDialogFooter className="flex flex-row items-center justify-end gap-2 pt-2 sm:space-x-0">
          <AlertDialogCancel asChild>
            <Button
              type="button"
              variant="outline"
              className="h-9 px-4 text-xs font-semibold text-muted-foreground hover:text-foreground border-border/80 rounded-xl"
            >
              취소
            </Button>
          </AlertDialogCancel>

          <Button
            type="button"
            onClick={onConfirm}
            className="h-9 px-4 text-xs font-semibold gap-1.5 shadow-sm bg-primary text-primary-foreground hover:bg-primary/90 transition-all rounded-xl"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>초기화하기</span>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
