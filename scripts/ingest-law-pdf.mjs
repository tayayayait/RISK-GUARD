/**
 * 법령 PDF(국가법령정보센터 저장본) → 조문 단위 코퍼스 JSON 변환기.
 *
 * 사용:
 *   node ./scripts/ingest-law-pdf.mjs                 # legal-markdown/*.pdf 전체
 *   node ./scripts/ingest-law-pdf.mjs --check         # 파싱 결과만 검증 출력 (파일 미기록)
 *   node ./scripts/ingest-law-pdf.mjs --file "<path>" # 단일 파일
 *
 * 산출물: output/law-corpus/<법령명>.json
 */
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const INPUT_DIR = path.join(projectRoot, "legal-markdown");
const OUTPUT_DIR = path.join(projectRoot, "output", "law-corpus");

/**
 * 국가법령정보센터 API(`lawService.do`)로 확인한 실제 조문 수(편/장/절 제목 제외).
 * 파싱 누락/오탐을 잡는 회귀 기준값이다.
 *
 * 키는 `법령명@시행일`. 법령은 시행일마다 조문 수가 달라지므로 버전을 함께 고정한다.
 * 예) 산업안전보건법은 2026-08-01 시행분에서 제31조의2(외국인근로자 기초안전보건교육)가
 *     신설되어 184 → 185가 되었다.
 */
const GOLDEN_ARTICLE_COUNTS = {
  "산업안전보건법@2026-08-01": 185,
  "산업안전보건법@2026-06-01": 184,
  "산업안전보건법 시행령@2026-08-01": 125,
  "산업안전보건법 시행규칙@2026-08-01": 252,
  "산업안전보건기준에 관한 규칙@2026-03-02": 690,
};

function lookupGolden(meta) {
  const key = `${meta.docTitle}@${meta.effectiveDate}`;
  return Object.prototype.hasOwnProperty.call(GOLDEN_ARTICLE_COUNTS, key)
    ? GOLDEN_ARTICLE_COUNTS[key]
    : null;
}

/** 파일명 규칙: 법령명(법종구분)(제00000호)(YYYYMMDD).pdf */
const FILENAME_PATTERN = /^(.+?)\(([^)]+)\)\(제(\d+)호\)\((\d{4})(\d{2})(\d{2})\)\.pdf$/;

/** 페이지 머리말: "법제처   12   국가법령정보센터" + 뒤에 붙는 법령명 */
const PAGE_HEADER = /^법제처\s*\d*\s*국가법령정보센터/;

/**
 * 조문 시작. 아래 네 가지 형태만 인정한다.
 *   제3조(적용 범위)          - 일반 조문
 *   제9조 삭제 <2019. 12. 24.> - 삭제 조문
 *   제610조 [종전 제610조는…]  - 이동 주석만 남은 조문
 *   제336조                    - 번호만 홀로 있는 이동/삭제 스텁
 *
 * 뒤따르는 토큰을 제한하지 않으면, 줄바꿈으로 행 첫머리에 온 조문 참조
 * ("제120조제5항, 제121조제4항…")를 새 조문으로 오인한다.
 */
const ARTICLE_START = /^제(\d+)조(?:의(\d+))?(?:\s*\(([^)]*)\)|\s+삭제(?=\s|$)|\s*\[|\s*$)/;

/** 조문 여부와 무관하게 "제N조" 로 시작하는지 (편/장 제목 판별 보조용) */
const ARTICLE_LIKE = /^제\d+조/;

/** 편/장/절/관 제목: "제2장 안전보건관리체제" */
const SECTION_HEADING = /^제(\d+)(편|장|절|관)\s+(.*)$/;

/** 부칙 시작: "부칙 <제21374호, 2026. 2. 19.>" */
const ADDENDA_START = /^부\s*칙\s*[<（(]/;

/** 별표/서식 시작 */
const APPENDIX_START = /^\[별[표지]\s*\d*/;

const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * pdfjs 텍스트 아이템을 y좌표로 묶어 실제 줄 단위로 복원한다.
 *
 * `docTitle`을 넘기면 페이지마다 반복되는 법령명 러닝헤더를 제거한다.
 * 제거하지 않으면 "…안전화 산업안전보건기준에 관한 규칙 4. 물체가…" 처럼
 * 조문 본문 한가운데에 법령명이 섞여 인용문이 오염된다.
 */
async function extractLines(pdfPath, docTitle) {
  const data = new Uint8Array(await readFile(pdfPath));
  const loadingTask = getDocument({ data, useSystemFonts: true, verbosity: 0 });
  const doc = await loadingTask.promise;
  const lines = [];

  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const rows = new Map();

    for (const item of content.items) {
      if (typeof item.str !== "string" || !item.str.trim()) continue;
      const x = item.transform[4];
      const y = Math.round(item.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x, str: item.str });
    }

    const sortedY = [...rows.keys()].sort((a, b) => b - a);
    for (const y of sortedY) {
      const text = rows
        .get(y)
        .sort((a, b) => a.x - b.x)
        .map((cell) => cell.str)
        .join("");
      const trimmed = text.trim();
      if (!trimmed) continue;
      if (PAGE_HEADER.test(trimmed)) continue;
      if (docTitle && normalizeWhitespace(trimmed) === normalizeWhitespace(docTitle)) continue;
      lines.push({ pageNo, text: trimmed, indent: Math.round(rows.get(y)[0].x) });
    }
    page.cleanup();
  }

  if (typeof doc.cleanup === "function") doc.cleanup();
  if (typeof doc.destroy === "function") await doc.destroy();
  if (typeof loadingTask.destroy === "function") await loadingTask.destroy();
  return lines;
}

/**
 * 줄 목록을 조문 단위로 분해한다.
 * 부칙 이후는 본문에서 제외한다(부칙 조문을 본문으로 인용하면 근거가 오염된다).
 */
function parseArticles(lines) {
  const articles = [];
  const skipped = { addenda: 0, appendix: 0 };
  let current = null;
  let heading = { 편: null, 장: null, 절: null, 관: null };
  let inBody = true;
  let lastOrder = [0, 0];
  const rejected = [];

  const flush = () => {
    if (!current) return;
    const body = normalizeWhitespace(current.rawLines.join(" "));
    current.content = body;
    const afterLabel = body
      .replace(new RegExp(`^제${current.articleNo}조(의\\d+)?\\s*(\\([^)]*\\))?\\s*`), "")
      .trim();
    // 삭제 조문 / 다른 조문으로 이동해 껍데기만 남은 조문은 RAG 색인에서 제외한다.
    current.isDeleted = afterLabel === "" || /^삭제(\s|<|$)/.test(afterLabel) || /^\[(종전|제\d+조)/.test(afterLabel);
    delete current.rawLines;
    articles.push(current);
    current = null;
  };

  for (const line of lines) {
    const { text, pageNo } = line;

    if (ADDENDA_START.test(text)) {
      flush();
      inBody = false;
      skipped.addenda += 1;
      continue;
    }
    if (APPENDIX_START.test(text)) {
      flush();
      inBody = false;
      skipped.appendix += 1;
      continue;
    }
    if (!inBody) continue;

    const headingMatch = SECTION_HEADING.exec(text);
    if (headingMatch && !ARTICLE_LIKE.test(text)) {
      flush();
      const [, num, kind, title] = headingMatch;
      heading = { ...heading, [kind]: `제${num}${kind} ${normalizeWhitespace(title)}` };
      if (kind === "편") heading = { 편: heading.편, 장: null, 절: null, 관: null };
      if (kind === "장") heading = { ...heading, 절: null, 관: null };
      if (kind === "절") heading = { ...heading, 관: null };
      continue;
    }

    const articleMatch = ARTICLE_START.exec(text);
    if (articleMatch) {
      const [, no, branch, title] = articleMatch;
      const order = [Number(no), branch ? Number(branch) : 0];
      // 조문 번호는 단조 증가한다. 역행하면 본문 중간의 인용으로 본다.
      if (order[0] < lastOrder[0] || (order[0] === lastOrder[0] && order[1] <= lastOrder[1])) {
        rejected.push({ label: branch ? `제${no}조의${branch}` : `제${no}조`, pageNo, text: text.slice(0, 80) });
        if (current) current.rawLines.push(text);
        continue;
      }
      lastOrder = order;
      flush();
      current = {
        articleNo: no,
        branchNo: branch ?? null,
        articleLabel: branch ? `제${no}조의${branch}` : `제${no}조`,
        articleTitle: title ? normalizeWhitespace(title) : null,
        section: { ...heading },
        pageNo,
        rawLines: [text],
      };
      continue;
    }

    if (current) current.rawLines.push(text);
  }

  flush();
  return { articles, skipped, rejected };
}

/** 조문 본문에서 항(①…) / 호(1.) / 목(가.) 계층을 분해한다. */
function splitParagraphs(article) {
  const stripped = article.content
    .replace(new RegExp(`^${article.articleLabel}\\s*(\\([^)]*\\))?\\s*`), "")
    .trim();

  const paragraphs = [];
  const circledClass = `[${CIRCLED}]`;
  const parts = stripped.split(new RegExp(`(?=${circledClass})`, "u")).filter(Boolean);

  if (parts.length <= 1) {
    paragraphs.push({ marker: null, text: stripped, items: extractItems(stripped) });
    return paragraphs;
  }

  for (const part of parts) {
    const marker = CIRCLED.includes(part[0]) ? part[0] : null;
    const text = marker ? part.slice(1).trim() : part.trim();
    if (!text) continue;
    paragraphs.push({ marker, text, items: extractItems(text) });
  }
  return paragraphs;
}

/**
 * 호(1. 2. 3.) 추출.
 * "2019. 12. 26." 같은 날짜 표기와 구분하기 위해 뒤에 숫자+점이 이어지지 않는 경우만 호로 본다.
 */
function extractItems(text) {
  const items = [];
  const pattern = /(?:^|\s)(\d{1,2})\.\s(?!\d{1,2}\.)/g;
  const marks = [];
  let match;
  while ((match = pattern.exec(text)) !== null) {
    marks.push({ no: Number(match[1]), start: match.index, contentStart: pattern.lastIndex });
  }
  // 번호가 1부터 순차 증가하는 구간만 호로 인정한다.
  let expected = 1;
  const valid = [];
  for (const mark of marks) {
    if (mark.no === expected) {
      valid.push(mark);
      expected += 1;
    }
  }
  for (let i = 0; i < valid.length; i += 1) {
    const end = i + 1 < valid.length ? valid[i + 1].start : text.length;
    items.push({
      no: String(valid[i].no),
      text: normalizeWhitespace(text.slice(valid[i].contentStart, end)),
    });
  }
  return items;
}

function parseFileMeta(fileName) {
  const match = FILENAME_PATTERN.exec(fileName);
  if (!match) return null;
  const [, docTitle, authority, promulgationNo, year, month, day] = match;
  return {
    docTitle: docTitle.trim(),
    authority: authority.trim(),
    promulgationNo,
    effectiveDate: `${year}-${month}-${day}`,
    sourceFile: fileName,
  };
}

async function ingestFile(pdfPath) {
  const fileName = path.basename(pdfPath);
  const meta = parseFileMeta(fileName);
  if (!meta) {
    return { fileName, error: "파일명이 「법령명(법종구분)(제00000호)(YYYYMMDD).pdf」 규칙과 다릅니다." };
  }

  const lines = await extractLines(pdfPath, meta.docTitle);
  const { articles, skipped, rejected } = parseArticles(lines);

  for (const article of articles) {
    article.paragraphs = splitParagraphs(article);
    article.sourceUrl = `https://www.law.go.kr/법령/${encodeURIComponent(meta.docTitle)}/${article.articleLabel}`;
  }

  const active = articles.filter((a) => !a.isDeleted);
  const golden = lookupGolden(meta);

  return {
    fileName,
    meta,
    stats: {
      pages: lines.length ? lines[lines.length - 1].pageNo : 0,
      parsedArticles: articles.length,
      deletedArticles: articles.length - active.length,
      golden,
      delta: golden === null ? null : articles.length - golden,
      withTitle: articles.filter((a) => a.articleTitle).length,
      withParagraphMarkers: articles.filter((a) => a.paragraphs.some((p) => p.marker)).length,
      totalItems: articles.reduce((sum, a) => sum + a.paragraphs.reduce((s, p) => s + p.items.length, 0), 0),
      skipped,
      rejectedReferences: rejected.length,
    },
    articles,
    rejected,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const fileArgIndex = args.indexOf("--file");
  const targets = [];

  if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
    targets.push(path.resolve(projectRoot, args[fileArgIndex + 1]));
  } else {
    const entries = await readdir(INPUT_DIR);
    for (const entry of entries) {
      if (entry.toLowerCase().endsWith(".pdf") && FILENAME_PATTERN.test(entry)) {
        targets.push(path.join(INPUT_DIR, entry));
      }
    }
  }

  if (!targets.length) {
    console.error(`대상 PDF가 없습니다: ${INPUT_DIR}`);
    process.exitCode = 1;
    return;
  }

  if (!checkOnly) await mkdir(OUTPUT_DIR, { recursive: true });

  let failed = 0;
  for (const target of targets) {
    const result = await ingestFile(target);
    if (result.error) {
      console.error(`✗ ${result.fileName}: ${result.error}`);
      failed += 1;
      continue;
    }

    const { meta, stats } = result;
    const verdict =
      stats.golden === null ? "기준값 없음" : stats.delta === 0 ? "일치" : `차이 ${stats.delta > 0 ? "+" : ""}${stats.delta}`;
    if (stats.golden !== null && stats.delta !== 0) failed += 1;

    console.log(
      [
        `${stats.delta === 0 || stats.golden === null ? "✓" : "✗"} ${meta.docTitle}`,
        `[${meta.authority} 제${meta.promulgationNo}호 · 시행 ${meta.effectiveDate}]`,
        `조문 ${stats.parsedArticles} (기준 ${stats.golden ?? "-"} → ${verdict})`,
        `삭제 ${stats.deletedArticles} · 제목보유 ${stats.withTitle} · 항보유 ${stats.withParagraphMarkers} · 호 ${stats.totalItems}`,
      ].join("\n    "),
    );

    if (!checkOnly) {
      const outPath = path.join(OUTPUT_DIR, `${meta.docTitle}.json`);
      await writeFile(outPath, JSON.stringify({ meta, stats: result.stats, articles: result.articles }, null, 2), "utf8");
      console.log(`    → ${path.relative(projectRoot, outPath)}`);
    }
  }

  if (failed) {
    console.error(`\n${failed}건이 기준값과 다릅니다.`);
    process.exitCode = 1;
  }
}

await main();
