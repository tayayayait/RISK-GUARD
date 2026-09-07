import { expect, test } from "@playwright/test";

const serviceUrl = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:4173";

for (const route of ["/", "/forms", "/prediction", "/scan", "/safety-qa", "/settings"]) {
  test(`로그인하지 않은 사용자는 ${route}에서 로그인 화면으로 이동한다`, async ({ page }) => {
    await page.goto(`${serviceUrl}${route}`);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "작업 기록을 이어서 확인하세요" })).toBeVisible();
    await expect(page.getByLabel("이메일")).toBeVisible();
    await expect(page.getByLabel("비밀번호")).toBeVisible();
  });
}
