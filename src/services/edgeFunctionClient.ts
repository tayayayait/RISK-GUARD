import { getSupabaseClient } from "@/integrations/supabase/client";

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

function readSupabaseUrl() {
  return (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
}

function readSupabaseApiKey() {
  return (
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
    || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  )?.trim();
}

async function toRequestHeaders() {
  const apiKey = readSupabaseApiKey();
  if (!apiKey) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) {
    throw new Error("AUTH_REQUIRED");
  }

  return {
    "Content-Type": "text/plain;charset=UTF-8",
    apikey: apiKey,
    Authorization: `Bearer ${accessToken}`,
  };
}

async function invokeSupabaseFunction<T>(functionName: string, payload: unknown, timeoutMs = 30000): Promise<T | null> {
  const supabaseUrl = readSupabaseUrl();
  if (!supabaseUrl) {
    console.warn(`[Supabase] Backend not configured. Cannot invoke ${functionName}`);
    return null;
  }

  const baseUrl = normalizeBaseUrl(supabaseUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: await toRequestHeaders(),
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
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      throw error;
    }
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
    if (error instanceof Error && error.message === "AUTH_REQUIRED") {
      throw error;
    }
    console.warn(`[Backend] Failed to invoke proxy for ${supabaseFunction}:`, error);
    if (throwOnError) {
      throw error;
    }
  }

  // legacyProxy fallback은 제거 (Edge Function 우선)
  console.warn(`[Backend] Returning null for ${supabaseFunction} due to error or missing config`);
  return null;
}
