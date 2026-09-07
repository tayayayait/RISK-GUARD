import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let browserClient: SupabaseClient<Database> | null = null;

function readConfiguration() {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const key = (
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined)
    || (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
  )?.trim();

  return { url, key };
}

export function isSupabaseConfigured() {
  const { url, key } = readConfiguration();
  return Boolean(url && key);
}

export function getSupabaseClient(): SupabaseClient<Database> {
  if (browserClient) {
    return browserClient;
  }

  const { url, key } = readConfiguration();
  if (!url || !key) {
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  browserClient = createClient<Database>(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        "x-client-info": "risk-guard-web",
      },
    },
  });

  return browserClient;
}
