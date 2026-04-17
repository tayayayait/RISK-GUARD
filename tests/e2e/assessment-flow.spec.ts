import { test, expect } from "@playwright/test";

test.describe("RISK-GUARD E2E", () => {
  test("정상 플로우: 입력 -> 프로필확정 -> 분석", async ({ page }) => {
    await page.goto("/assessments/new");
    await page.getByLabel("작업명 필수").fill("외벽 도장 작업");
    await page.getByLabel("작업 설명 필수").fill("고소작업대를 사용한 외벽 도장 작업으로 추락과 화학노출 위험이 존재한다.");
    await page.getByRole("button", { name: "AI 분석 시작" }).click();
    await expect(page.getByText("AI 분석 확인")).toBeVisible();
  });

  test("예외 플로우: 필수값 누락 시 내보내기 차단", async ({ page }) => {
    await page.goto("/assessments/new");
    await expect(page.getByRole("button", { name: "AI 분석 시작" })).toBeDisabled();
  });
});

