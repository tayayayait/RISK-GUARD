const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
// Default to auth headers ON. Set VITE_SUPABASE_USE_AUTH_HEADERS=false only when explicitly needed.
const SUPABASE_USE_AUTH_HEADERS = import.meta.env.VITE_SUPABASE_USE_AUTH_HEADERS !== "false";

interface InvokeBackendOptions {
  supabaseFunction: string;
  legacyPath: string;
  payload: unknown;
  timeoutMs?: number;
  throwOnError?: boolean;
}

function normalizeBaseUrl(url: string) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function toRequestHeaders() {
  // Use a simple request by default to avoid browser preflight failures on non-2xx OPTIONS.
  const headers: Record<string, string> = {
    "Content-Type": "text/plain;charset=UTF-8",
  };

  if (SUPABASE_USE_AUTH_HEADERS) {
    if (!SUPABASE_ANON_KEY) {
      console.warn("[Supabase] VITE_SUPABASE_USE_AUTH_HEADERS=true but VITE_SUPABASE_ANON_KEY is missing.");
    } else {
      headers.apikey = SUPABASE_ANON_KEY;
      headers.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
    }
  }

  return headers;
}

async function invokeSupabaseFunction<T>(functionName: string, payload: unknown, timeoutMs = 30000): Promise<T | null> {
  if (!SUPABASE_URL) {
    console.warn(`[Supabase] Backend not configured. Cannot invoke ${functionName}`);
    return null;
  }

  const baseUrl = normalizeBaseUrl(SUPABASE_URL);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: toRequestHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "No error body");
      let upstreamCode = "";
      try {
        const parsed = JSON.parse(errorText) as { code?: unknown; error?: { code?: unknown } };
        if (typeof parsed.code === "string" && parsed.code.trim()) {
          upstreamCode = parsed.code.trim();
        } else if (typeof parsed.error?.code === "string" && parsed.error.code.trim()) {
          upstreamCode = parsed.error.code.trim();
        }
      } catch {
        // ignore JSON parse failure
      }

      const statusLabel = upstreamCode ? `${response.status} ${upstreamCode}` : `${response.status}`;
      console.error(`[Supabase] Function ${functionName} failed: ${statusLabel} - ${errorText}`);
      throw new Error(`Supabase function failed (${functionName}): ${statusLabel}`);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[Supabase] Function ${functionName} timed out after ${timeoutMs}ms`);
      throw new Error(`Timeout: ${functionName}`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function invokeBackend<T>(options: InvokeBackendOptions): Promise<T | null> {
  const { supabaseFunction, payload, timeoutMs = 30000, throwOnError = false } = options;

  try {
    const supabaseResult = await invokeSupabaseFunction<T>(supabaseFunction, payload, timeoutMs);
    if (supabaseResult) {
      return supabaseResult;
    }

    if (throwOnError) {
      throw new Error(`Empty response: ${supabaseFunction}`);
    }
  } catch (error) {
    console.warn(`[Backend] Failed to invoke proxy for ${supabaseFunction}:`, error);
    if (throwOnError) {
      throw error;
    }
  }

  // legacyProxy fallback은 제거 (Edge Function 우선)
  console.warn(`[Backend] Returning null for ${supabaseFunction} due to error or missing config`);
  return null;
}
