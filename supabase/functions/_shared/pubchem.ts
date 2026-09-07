/**
 * PubChem REST API 클라이언트 (국내 미등재 물질 폴백용)
 */

export const PUBCHEM_REST_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug";
export const PUBCHEM_VIEW_BASE = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view";

export interface PubChemResult {
  cid: number;
  name: string;
  iupacName?: string;
  sourceUrl: string;
  citation: string;
}

export interface PubChemOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_TIMEOUT_MS = 6000;

export async function fetchPubChemCidByName(
  name: string,
  options: PubChemOptions = {}
): Promise<number | null> {
  const cleanName = encodeURIComponent(name.trim());
  if (!cleanName) return null;

  const url = `${PUBCHEM_REST_BASE}/compound/name/${cleanName}/cids/JSON`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: options.signal ?? controller.signal,
      headers: { Accept: "application/json" },
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    const cids = data?.IdentifierList?.CID;
    if (Array.isArray(cids) && cids.length > 0) {
      return Number(cids[0]);
    }
    return null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

export async function fetchPubChemFallback(
  name: string,
  options: PubChemOptions = {}
): Promise<PubChemResult | null> {
  const cid = await fetchPubChemCidByName(name, options);
  if (!cid) return null;

  return {
    cid,
    name,
    sourceUrl: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
    citation: "https://pubchem.ncbi.nlm.nih.gov/docs/citation-guidelines",
  };
}
