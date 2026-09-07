/**
 * 파싱된 법령 조문(output/law-corpus/*.json)을 RAGFlow에 조문 단위 청크로 업로드한다.
 *
 * PDF를 그대로 올려 RAGFlow가 자동 청킹하게 두면 두 가지가 깨진다.
 *   1) 조문 경계가 뭉개진다 — 제1~8조가 한 청크에 들어가거나, 조문번호 없는 파편이 생긴다.
 *      → 답변에 "제38조" 라고 인용할 근거가 사라진다. M2 요구사항이 성립하지 않는다.
 *   2) PDF 텍스트 추출 과정에서 띄어쓰기가 소실된다("사업주는선반ㆍ롤러기등...").
 *      → 키워드 검색(term_similarity)이 0에 수렴하고, 사용자에게 보일 인용문도 읽기 어렵다.
 *
 * 이 스크립트는 이미 검증된 파서 결과(조문 수 100% 일치)를 조문 1건 = 청크 1건으로 올린다.
 *
 * 사용:
 *   node scripts/upload-law-to-ragflow.mjs --create        # 데이터셋 생성만
 *   node scripts/upload-law-to-ragflow.mjs --limit 5       # 소규모 검증
 *   node scripts/upload-law-to-ragflow.mjs                 # 전체 업로드(이어하기 지원)
 *
 * 환경변수(.env.local 자동 로드): VITE_RAGFLOW_API_URL, VITE_RAGFLOW_API_KEY
 */
import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const CORPUS_DIR = path.join(projectRoot, "output", "law-corpus");
const STATE_FILE = path.join(projectRoot, "output", "ragflow-upload-state.json");
const DATASET_NAME = "KOSHA-Safety-Laws-Articles";

async function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(projectRoot, file);
    if (!existsSync(p)) continue;
    const text = await readFile(p, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const eq = t.indexOf("=");
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
      if (v && !process.env[k]) process.env[k] = v;
    }
  }
}

function config() {
  const base = (process.env.VITE_RAGFLOW_API_URL || process.env.RAGFLOW_API_URL || "").replace(/\/+$/, "");
  const key = process.env.VITE_RAGFLOW_API_KEY || process.env.RAGFLOW_API_KEY || "";
  if (!base || !key) {
    console.error("✗ VITE_RAGFLOW_API_URL / VITE_RAGFLOW_API_KEY 를 .env.local 에 설정하세요.");
    process.exit(2);
  }
  return { base, key };
}

async function api(cfg, method, endpoint, body, isJson = true) {
  const res = await fetch(`${cfg.base}${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      ...(isJson ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    ...(body ? { body: isJson ? JSON.stringify(body) : body } : {}),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`비 JSON 응답 (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  if (json.code !== 0) {
    throw new Error(`RAGFlow code=${json.code}: ${json.message ?? ""}`.slice(0, 300));
  }
  return json.data;
}

/**
 * 청크 본문. 조문 헤더를 반드시 포함시킨다.
 * 검색 결과 청크만 보고도 어느 법령 몇 조인지 특정되어야 인용이 성립한다.
 */
function buildChunkContent(meta, article) {
  const header = `[${meta.docTitle}] ${article.articleLabel}` +
    (article.articleTitle ? `(${article.articleTitle})` : "");
  const section = [article.section?.편, article.section?.장, article.section?.절]
    .filter(Boolean)
    .join(" > ");
  const body = article.content.replace(
    new RegExp(`^${article.articleLabel}\\s*(\\([^)]*\\))?\\s*`),
    "",
  ).trim();

  return [
    header,
    section ? `소속: ${section}` : null,
    `시행일: ${meta.effectiveDate} · ${meta.authority} 제${meta.promulgationNo}호`,
    "",
    body,
  ].filter((l) => l !== null).join("\n");
}

function buildKeywords(meta, article) {
  return [
    meta.docTitle,
    article.articleLabel,
    article.articleTitle,
    article.section?.장,
  ].filter(Boolean).map((s) => String(s).slice(0, 60));
}

async function loadState() {
  if (!existsSync(STATE_FILE)) return { datasetId: null, documents: {}, uploaded: {} };
  return JSON.parse(await readFile(STATE_FILE, "utf8"));
}

async function saveState(state) {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), "utf8");
}

async function ensureDataset(cfg, state) {
  if (state.datasetId) return state.datasetId;

  const existing = await api(cfg, "GET", `/api/v1/datasets?page_size=100`);
  const found = (existing || []).find((d) => d.name === DATASET_NAME);
  if (found) {
    state.datasetId = found.id;
    await saveState(state);
    console.log(`기존 데이터셋 재사용: ${DATASET_NAME} (${found.id})`);
    return found.id;
  }

  // 조문 단위로 직접 넣으므로 RAGFlow 자동 청킹은 쓰지 않는다.
  const created = await api(cfg, "POST", "/api/v1/datasets", {
    name: DATASET_NAME,
    description: "산업안전보건 법령 — 조문 1건 = 청크 1건 (ingest-law-pdf.mjs 파싱 결과)",
    chunk_method: "naive",
  });
  state.datasetId = created.id;
  await saveState(state);
  console.log(`데이터셋 생성: ${DATASET_NAME} (${created.id})`);
  return created.id;
}

async function ensureDocument(cfg, state, datasetId, docTitle) {
  if (state.documents[docTitle]) return state.documents[docTitle];

  // 이 인스턴스는 type=empty 를 지원하지 않는다("No file part!").
  // 최소 텍스트 파일을 multipart 로 올려 문서 껍데기만 만들고, 파싱은 돌리지 않는다.
  // (파싱을 안 하므로 이 파일 자체는 청크가 되지 않고, Add chunk 로 넣은 조문만 남는다.)
  const form = new FormData();
  const placeholder = `${docTitle}
조문 단위 청크는 API로 개별 등록됩니다.
`;
  form.append("file", new Blob([placeholder], { type: "text/plain" }), `${docTitle}.txt`);

  const res = await fetch(`${cfg.base}/api/v1/datasets/${datasetId}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}` },
    body: form,
  });
  const json = await res.json();
  if (json.code !== 0) {
    throw new Error(`문서 생성 실패 code=${json.code}: ${json.message ?? ""}`.slice(0, 300));
  }
  const doc = Array.isArray(json.data) ? json.data[0] : json.data;
  const id = doc.id ?? doc.document_id;
  state.documents[docTitle] = id;
  await saveState(state);
  console.log(`  문서 생성: ${docTitle} (${id})`);
  return id;
}

async function main() {
  await loadEnv();
  const cfg = config();
  const args = process.argv.slice(2);
  const createOnly = args.includes("--create");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : Infinity;

  const state = await loadState();
  const datasetId = await ensureDataset(cfg, state);
  if (createOnly) {
    console.log("데이터셋 준비 완료. --limit 또는 인자 없이 다시 실행해 업로드하세요.");
    return;
  }

  const files = (await readdir(CORPUS_DIR)).filter((f) => f.endsWith(".json"));
  let total = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of files) {
    const corpus = JSON.parse(await readFile(path.join(CORPUS_DIR, file), "utf8"));
    const { meta, articles } = corpus;
    const active = articles.filter((a) => !a.isDeleted);
    const target = active.slice(0, limit === Infinity ? undefined : limit);

    console.log(`\n■ ${meta.docTitle} — 유효조문 ${active.length}건 중 ${target.length}건 처리`);
    const documentId = await ensureDocument(cfg, state, datasetId, meta.docTitle);

    for (const article of target) {
      const key = `${meta.docTitle}#${article.articleLabel}`;
      if (state.uploaded[key]) {
        skipped += 1;
        continue;
      }
      try {
        await api(cfg, "POST", `/api/v1/datasets/${datasetId}/documents/${documentId}/chunks`, {
          content: buildChunkContent(meta, article),
          important_keywords: buildKeywords(meta, article),
        });
        state.uploaded[key] = true;
        total += 1;
        if (total % 25 === 0) {
          await saveState(state);
          console.log(`    ... ${total}건 업로드`);
        }
      } catch (err) {
        failed += 1;
        console.error(`    ✗ ${key}: ${err.message}`);
        if (failed > 10) {
          await saveState(state);
          console.error("실패가 10건을 넘어 중단합니다.");
          process.exit(1);
        }
      }
    }
  }

  await saveState(state);
  console.log(`\n완료: 신규 ${total}건 · 기존 건너뜀 ${skipped}건 · 실패 ${failed}건`);
  console.log(`데이터셋 ID: ${datasetId}`);
}

await main();
