import React, { useState } from "react";
import { PanelRightOpen } from "lucide-react";
import { AppHeader } from "./AppHeader";
import { AppSidebar } from "./AppSidebar";
import type { AssessmentStep } from "@/types/assessment";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

interface Props {
  children: React.ReactNode;
  currentStep?: AssessmentStep;
  rightPanel?: React.ReactNode;
  rightPanelDrawerOpen?: boolean;
  onRightPanelDrawerOpenChange?: (open: boolean) => void;
}

export function DashboardShell({
  children,
  currentStep,
  rightPanel,
  rightPanelDrawerOpen,
  onRightPanelDrawerOpenChange,
}: Props) {
  const [uncontrolledDrawerOpen, setUncontrolledDrawerOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const isDrawerControlled = typeof rightPanelDrawerOpen === "boolean";
  const drawerOpen = isDrawerControlled ? rightPanelDrawerOpen : uncontrolledDrawerOpen;

  const setDrawerOpen = (open: boolean) => {
    if (!isDrawerControlled) {
      setUncontrolledDrawerOpen(open);
    }
    onRightPanelDrawerOpenChange?.(open);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden h-full lg:block">
        <AppSidebar currentStep={currentStep} />
      </div>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-[260px] border-border p-0" aria-label="모바일 사이드바">
          <SheetTitle className="sr-only">모바일 사이드바</SheetTitle>
          <SheetDescription className="sr-only">
            앱 메뉴와 단계 이동을 위한 사이드바입니다.
          </SheetDescription>
          <AppSidebar currentStep={currentStep} />
        </SheetContent>
      </Sheet>

      <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader currentStep={currentStep} onMenuClick={() => setMobileSidebarOpen(true)} />
        <main className="relative flex-1 overflow-y-auto p-space-6 2xl:p-space-8">
          {rightPanel && (
            <div className="mb-space-3 hidden justify-end lg:flex xl:hidden">
              <Button
                variant="outline"
                className="h-9 rounded-radius-md"
                onClick={() => setDrawerOpen(true)}
                aria-label="요약 패널 열기"
              >
                <PanelRightOpen className="mr-space-1 h-4 w-4" />
                요약 패널
              </Button>
            </div>
          )}
          <div className="flex gap-space-6">
            <div className="min-w-0 flex-1">{children}</div>
            {rightPanel && (
              <aside className="relative hidden w-[320px] shrink-0 xl:block 2xl:w-[360px]">
                <div className="sticky top-0">{rightPanel}</div>
              </aside>
            )}
          </div>
        </main>
      </div>

      {rightPanel && (
        <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
          <SheetContent
            side="right"
            className="w-[360px] max-w-[92vw] overflow-y-auto p-space-4"
            aria-label="요약 패널 서랍"
          >
            <SheetTitle className="sr-only">요약 패널</SheetTitle>
            <SheetDescription className="sr-only">
              분석 결과 요약과 법령 상세 정보를 제공합니다.
            </SheetDescription>
            {rightPanel}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

