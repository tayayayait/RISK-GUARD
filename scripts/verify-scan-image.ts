/**
 * 실제 라벨 사진으로 M1 전체 흐름을 검증한다.
 *
 *   사진 → Gemini Vision(판독) → 물질 확정(CAS/UN/이름) → GHS 교차검증
 *        → MSDS 섹션 02/04/07/08/15 → 보호구 체크리스트
 *
 * 목킹 없이 실제 API를 호출한다. `.env.local` 을 자동으로 읽으므로
 * 별도 환경변수 설정이 필요 없다.
 *
 * 사용:
 *   deno run -A scripts/verify-scan-image.ts <이미지파일|디렉터리> [--expect <기대값.json>] [--json <결과.json>]
 *   pnpm run verify:scan -- docs/scan-samples
 *
 * 기대값 JSON 형식 (파일명 → 정답):
 *   {
 *     "toluene-label.jpg": { "casNo": "108-88-3", "pictograms": ["GHS02","GHS07","GHS08"] },
 *     "worn-label.jpg":    { "chemNameKor": "아세톤" }
 *   }
 *
 * 기대값을 주면 작업순서.md Phase 8 완료 조건을 그대로 채점한다.
 *   - 픽토그램 정확도 ≥ 90%
 *   - CAS 추출 성공률 ≥ 70%
 */
// 타입 전용 import 는 런타임에 지워지므로 모듈 부작용(Deno.serve)을 일으키지 않는다.
import type { ScanResponse } from "../supabase/functions/msds-scan-analyze/index.ts";

// 핸들러만 직접 호출하므로 서버는 띄우지 않는다. 값 import 보다 먼저 설정해야 한다.
Deno.env.set("MSDS_SCAN_DISABLE_SERVE", "1");
const { handleMsdsScanAnalyze } = await import("../supabase/functions/msds-scan-analyze/index.ts");

const PICTOGRAM_ACCURACY_TARGET = 0.9;
const CAS_EXTRACTION_TARGET = 0.7;
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png"];
/** Edge Function 이 400 으로 거절하는 크기. 미리 걸러 API 호출을 아낀다. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

interface Expectation {
  casNo?: string;
  chemNameKor?: string;
  pictograms?: string[];
}

interface CaseOutcome {
  file: string;
  ok: boolean;
  error?: string;
  docType?: string;
  confidence?: number;
  readCas: string[];
  readPictograms: string[];
  readSignalWord?: string;
  substanceName?: string;
  substanceChemId?: string;
  resolvedBy?: string;
  ppeRows: number;
  firstAidGroups: number;
  discrepancies: Array<{ severity: string; field: string }>;
  expectation?: Expectation;
  casHit?: boolean;
  pictogramScore?: number;
}

/** .env.local 을 읽어 런타임 환경변수로 올린다. VITE_ 접두어도 그대로 인식된다. */
async function loadEnvLocal(): Promise<void> {
  for (const file of [".env.local", ".env"]) {
    let text: string;
    try {
      text = await Deno.readTextFile(file);
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (value && !Deno.env.get(key)) Deno.env.set(key, value);
    }
  }
}

function requireSecrets(): string[] {
  const missing: string[] = [];
  if (!Deno.env.get("DATA_GO_KR_API_KEY") && !Deno.env.get("VITE_DATA_GO_KR_API_KEY")) {
    missing.push("DATA_GO_KR_API_KEY");
  }
  if (!Deno.env.get("GEMINI_API_KEY") && !Deno.env.get("VITE_GEMINI_API_KEY")) {
    missing.push("GEMINI_API_KEY");
  }
  return missing;
}

async function collectImages(target: string): Promise<string[]> {
  const info = await Deno.stat(target);
  if (info.isFile) return [target];

  const files: string[] = [];
  for await (const entry of Deno.readDir(target)) {
    if (!entry.isFile) continue;
    const lower = entry.name.toLowerCase();
    if (IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
      files.push(`${target.replace(/[\\/]+$/, "")}/${entry.name}`);
    }
  }
  return files.sort();
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function mimeTypeOf(file: string): "image/jpeg" | "image/png" {
  return file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

/** 기대 픽토그램과의 일치도 = 교집합 / 합집합 (Jaccard). 누락·오검출 모두 감점된다. */
function scorePictograms(read: string[], expected: string[]): number {
  const readSet = new Set(read);
  const expectedSet = new Set(expected);
  if (readSet.size === 0 && expectedSet.size === 0) return 1;
  let intersection = 0;
  for (const code of expectedSet) if (readSet.has(code)) intersection += 1;
  const union = new Set([...readSet, ...expectedSet]).size;
  return union === 0 ? 1 : intersection / union;
}

async function runCase(file: string, expectation?: Expectation): Promise<CaseOutcome> {
  const base: CaseOutcome = {
    file,
    ok: false,
    readCas: [],
    readPictograms: [],
    ppeRows: 0,
    firstAidGroups: 0,
    discrepancies: [],
    expectation,
  };

  const bytes = await Deno.readFile(file);
  if (bytes.byteLength > MAX_IMAGE_BYTES) {
    return { ...base, error: `이미지가 ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB 로 4MB 제한을 넘습니다.` };
  }

  const req = new Request("http://localhost/functions/v1/msds-scan-analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: "image",
      image: toBase64(bytes),
      mimeType: mimeTypeOf(file),
    }),
  });

  // 캐시(Supabase)를 끄고 실 API 경로만 확인한다.
  const res = await handleMsdsScanAnalyze(req, { supabaseClient: null });
  const payload = await res.json();

  if (!res.ok) {
    return { ...base, error: `HTTP ${res.status} ${payload?.error?.code ?? ""} ${payload?.error?.message ?? ""}`.trim() };
  }

  const body = payload as ScanResponse;
  const readCas = body.extraction.casNumbers ?? [];
  const readPictograms = body.extraction.pictograms ?? [];

  const outcome: CaseOutcome = {
    ...base,
    ok: true,
    docType: body.docType,
    confidence: body.extraction.confidence,
    readCas,
    readPictograms,
    readSignalWord: body.extraction.signalWord || undefined,
    substanceName: body.substance?.chemNameKor,
    substanceChemId: body.substance?.chemId,
    resolvedBy: body.substance?.resolvedBy ?? (body.needsUserSelection ? "needs_user_selection" : "unresolved"),
    ppeRows: body.ppeChecklist?.length ?? 0,
    firstAidGroups: body.firstAid
      ? Object.values(body.firstAid).filter((group) => Array.isArray(group) && group.length > 0).length
      : 0,
    discrepancies: (body.discrepancies ?? []).map((d) => ({ severity: d.severity, field: d.field })),
  };

  if (expectation) {
    if (expectation.casNo) outcome.casHit = readCas.includes(expectation.casNo);
    if (expectation.pictograms) outcome.pictogramScore = scorePictograms(readPictograms, expectation.pictograms);
  }

  return outcome;
}

function printCase(outcome: CaseOutcome): void {
  const name = outcome.file.split(/[\\/]/).pop();
  console.log(`\n── ${name}`);
  if (!outcome.ok) {
    console.log(`   ✗ ${outcome.error}`);
    return;
  }

  console.log(`   판독      docType=${outcome.docType} confidence=${outcome.confidence?.toFixed(2)}`);
  console.log(`   CAS       ${outcome.readCas.length ? outcome.readCas.join(", ") : "(없음)"}`);
  console.log(`   픽토그램  ${outcome.readPictograms.length ? outcome.readPictograms.join(", ") : "(없음)"}`);
  console.log(`   신호어    ${outcome.readSignalWord ?? "(없음)"}`);
  console.log(
    `   물질확정  ${outcome.substanceName ?? "미확정"}` +
      `${outcome.substanceChemId ? ` (chemId=${outcome.substanceChemId})` : ""} by=${outcome.resolvedBy}`,
  );
  console.log(`   안전정보  보호구 ${outcome.ppeRows}행 / 응급조치 ${outcome.firstAidGroups}그룹`);

  const critical = outcome.discrepancies.filter((d) => d.severity === "critical");
  console.log(
    `   교차검증  ${outcome.discrepancies.length}건` +
      (critical.length ? ` (critical ${critical.length}: ${critical.map((d) => d.field).join(", ")})` : ""),
  );

  if (outcome.expectation) {
    if (outcome.casHit !== undefined) {
      console.log(`   기대 CAS  ${outcome.expectation.casNo} → ${outcome.casHit ? "일치" : "불일치"}`);
    }
    if (outcome.pictogramScore !== undefined) {
      console.log(
        `   기대 픽토  ${outcome.expectation.pictograms?.join(", ")} → 일치도 ${(outcome.pictogramScore * 100).toFixed(0)}%`,
      );
    }
  }
}

function printSummary(outcomes: CaseOutcome[]): boolean {
  const total = outcomes.length;
  const succeeded = outcomes.filter((o) => o.ok);
  const resolved = succeeded.filter((o) => o.substanceChemId);
  const withPpe = succeeded.filter((o) => o.ppeRows > 0);

  console.log("\n" + "=".repeat(64));
  console.log(`총 ${total}장 · 판독 성공 ${succeeded.length} · 물질확정 ${resolved.length} · 보호구 확보 ${withPpe.length}`);

  let pass = succeeded.length === total;
  if (succeeded.length !== total) {
    console.log(`✗ 판독 실패 ${total - succeeded.length}건`);
  }

  const casCases = succeeded.filter((o) => o.casHit !== undefined);
  if (casCases.length) {
    const rate = casCases.filter((o) => o.casHit).length / casCases.length;
    const ok = rate >= CAS_EXTRACTION_TARGET;
    if (!ok) pass = false;
    console.log(
      `${ok ? "✓" : "✗"} CAS 추출 성공률   ${(rate * 100).toFixed(1)}%  (목표 ${CAS_EXTRACTION_TARGET * 100}%, n=${casCases.length})`,
    );
  }

  const pictoCases = succeeded.filter((o) => o.pictogramScore !== undefined);
  if (pictoCases.length) {
    const avg = pictoCases.reduce((sum, o) => sum + (o.pictogramScore ?? 0), 0) / pictoCases.length;
    const ok = avg >= PICTOGRAM_ACCURACY_TARGET;
    if (!ok) pass = false;
    console.log(
      `${ok ? "✓" : "✗"} 픽토그램 정확도   ${(avg * 100).toFixed(1)}%  (목표 ${PICTOGRAM_ACCURACY_TARGET * 100}%, n=${pictoCases.length})`,
    );
  }

  if (!casCases.length && !pictoCases.length) {
    const hadExpectations = outcomes.some((o) => o.expectation);
    console.log(
      hadExpectations
        ? "ⓘ 판독에 성공한 사진이 없어 정확도를 채점하지 못했습니다. 위 실패 원인을 먼저 해결하세요."
        : "ⓘ 기대값(--expect)이 없어 정확도는 채점하지 않았습니다. 위 판독 결과를 눈으로 확인하세요.",
    );
  }

  console.log("=".repeat(64));
  return pass;
}

async function main(): Promise<void> {
  const args = [...Deno.args];
  const expectIndex = args.indexOf("--expect");
  const jsonIndex = args.indexOf("--json");
  const expectPath = expectIndex !== -1 ? args[expectIndex + 1] : undefined;
  const jsonPath = jsonIndex !== -1 ? args[jsonIndex + 1] : undefined;
  // 플래그 값으로 소비된 위치는 건너뛴다. -1 일 때 0번 인자를 잘못 제외하지 않도록 주의.
  const consumed = new Set<number>();
  if (expectIndex !== -1) consumed.add(expectIndex + 1);
  if (jsonIndex !== -1) consumed.add(jsonIndex + 1);
  const target = args.find((a, i) => !a.startsWith("--") && !consumed.has(i));

  if (!target) {
    console.error("사용법: deno run -A scripts/verify-scan-image.ts <이미지파일|디렉터리> [--expect 기대값.json] [--json 결과.json]");
    Deno.exit(2);
  }

  await loadEnvLocal();
  const missing = requireSecrets();
  if (missing.length) {
    console.error(`✗ 다음 키가 없습니다: ${missing.join(", ")}`);
    console.error("  .env.local 에 VITE_DATA_GO_KR_API_KEY / VITE_GEMINI_API_KEY 가 있는지 확인하세요.");
    Deno.exit(2);
  }

  let expectations: Record<string, Expectation> = {};
  if (expectPath) {
    expectations = JSON.parse(await Deno.readTextFile(expectPath)) as Record<string, Expectation>;
  }

  const files = await collectImages(target);
  if (!files.length) {
    console.error(`✗ ${target} 에서 이미지(${IMAGE_EXTENSIONS.join(", ")})를 찾지 못했습니다.`);
    Deno.exit(2);
  }

  console.log(`M1 실사진 검증 · ${files.length}장 · Gemini Vision + MSDS/GHS 실 API 호출`);

  const outcomes: CaseOutcome[] = [];
  for (const file of files) {
    const name = file.split(/[\\/]/).pop() ?? file;
    let outcome: CaseOutcome;
    try {
      outcome = await runCase(file, expectations[name]);
    } catch (err) {
      outcome = {
        file,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        readCas: [],
        readPictograms: [],
        ppeRows: 0,
        firstAidGroups: 0,
        discrepancies: [],
      };
    }
    outcomes.push(outcome);
    printCase(outcome);
  }

  const pass = printSummary(outcomes);

  if (jsonPath) {
    await Deno.writeTextFile(jsonPath, JSON.stringify(outcomes, null, 2));
    console.log(`결과 저장: ${jsonPath}`);
  }

  Deno.exit(pass ? 0 : 1);
}

await main();
