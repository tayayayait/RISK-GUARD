import { formatOpenApiServiceError } from "./smart-search-parser.ts";

export interface DataGoResponseHeader {
  resultCode: string;
  resultMsg: string;
}

export class DataGoXmlError extends Error {
  readonly code: string;
  readonly details?: string;

  constructor(code: string, message: string, details?: string) {
    super(message);
    this.name = "DataGoXmlError";
    this.code = code;
    this.details = details;
  }
}

/**
 * XML 엔티티(&amp;, &lt;, &gt;, &quot;, &apos;, &#NN;, &#xHH;) 디코더
 */
export function decodeXmlEntities(raw: string): string {
  if (!raw) return "";
  return (
    raw
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, dec) => {
        try {
          return String.fromCharCode(parseInt(dec, 10));
        } catch {
          return _;
        }
      })
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
        try {
          return String.fromCharCode(parseInt(hex, 16));
        } catch {
          return _;
        }
      })
      // &amp; 는 반드시 마지막에 치환한다.
      // 먼저 치환하면 "&amp;lt;" 가 "&lt;" 를 거쳐 "<" 로 이중 디코딩된다.
      .replace(/&amp;/g, "&")
  );
}

/**
 * XML 블록 내에서 지정한 단일 태그의 텍스트를 추출 (개행 보존, 디코딩 적용)
 */
export function extractTag(block: string, tag: string): string {
  if (!block || !tag) return "";
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = block.match(new RegExp(`<${escaped}>([\\s\\S]*?)</${escaped}>`, "i"));
  if (!match || match[1] === undefined) {
    return "";
  }
  return decodeXmlEntities(match[1].trim());
}

/**
 * 응답 헤더(resultCode, resultMsg) 판정
 */
export function readResponseHeader(xml: string): DataGoResponseHeader {
  const text = (xml || "").trim();
  if (!text) {
    throw new DataGoXmlError("UPSTREAM_PARSE_ERROR", "Empty XML response", "");
  }

  // 1) OpenAPI_ServiceResponse 에러 체크
  const openApiError = formatOpenApiServiceError(text);
  if (openApiError) {
    throw new DataGoXmlError(openApiError, `data.go.kr service error: ${openApiError}`, text.slice(0, 200));
  }

  // 2) <header> 태그 내의 resultCode/resultMsg 추출
  const headerMatch = text.match(/<header>([\s\S]*?)<\/header>/i);
  if (!headerMatch) {
    throw new DataGoXmlError("UPSTREAM_PARSE_ERROR", "Missing <header> in XML response", text.slice(0, 200));
  }

  const headerBlock = headerMatch[1];
  const resultCode = extractTag(headerBlock, "resultCode");
  const resultMsg = extractTag(headerBlock, "resultMsg");

  if (!resultCode) {
    throw new DataGoXmlError("UPSTREAM_PARSE_ERROR", "Missing resultCode in <header>", text.slice(0, 200));
  }

  if (resultCode !== "00") {
    throw new DataGoXmlError(
      `UPSTREAM_RESULT_ERROR:${resultCode}:${resultMsg || "UNKNOWN"}`,
      `Upstream returned resultCode ${resultCode}: ${resultMsg}`,
      text.slice(0, 200)
    );
  }

  return {
    resultCode,
    resultMsg,
  };
}

/**
 * <item>...</item> 반복 블록을 파싱하여 Record<string, string>[] 로 반환
 */
export function extractXmlItems(xml: string): Record<string, string>[] {
  const text = (xml || "").trim();
  if (!text) {
    return [];
  }

  // 헤더 검증 (비정상 응답시 throw)
  readResponseHeader(text);

  // <items> 블록 확인
  // <items/> 인 경우 빈 배열
  if (/<items\s*\/>/i.test(text)) {
    return [];
  }

  const itemsMatch = text.match(/<items>([\s\S]*?)<\/items>/i);
  if (!itemsMatch) {
    // items 태그가 없지만 에러도 아닌 경우 (e.g. 빈 body)
    return [];
  }

  const itemsBlock = itemsMatch[1];
  const itemMatches = [...itemsBlock.matchAll(/<item>([\s\S]*?)<\/item>/gi)];
  if (itemMatches.length === 0) {
    return [];
  }

  const results: Record<string, string>[] = [];

  for (const match of itemMatches) {
    const itemContent = match[1];
    const record: Record<string, string> = {};

    // 자식 태그들 추출 (<tag>value</tag> 또는 <tag/>)
    const tagMatches = itemContent.matchAll(/<([a-zA-Z0-9_-]+)>([\s\S]*?)<\/\1>|<([a-zA-Z0-9_-]+)\s*\/>/g);
    for (const tagMatch of tagMatches) {
      if (tagMatch[3]) {
        // self-closing <tag/>
        record[tagMatch[3]] = "";
      } else if (tagMatch[1]) {
        // <tag>value</tag>
        record[tagMatch[1]] = decodeXmlEntities(tagMatch[2].trim());
      }
    }

    results.push(record);
  }

  return results;
}
