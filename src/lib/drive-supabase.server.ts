// Server-only admin client para o módulo Google Drive / Gmail.
// Suporta tanto o Appwrite adapter (padrão atual) quanto Supabase externo se configurado.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin as appwriteAdmin } from "@/integrations/supabase/client.server";

let _client: any;

export function getDriveSupabaseAdmin(): SupabaseClient<Database> {
  if (_client) return _client;
  const url = process.env.DRIVE_SUPABASE_URL;
  const key = process.env.DRIVE_SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    try {
      _client = createClient<Database>(url, key, {
        auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      });
      return _client;
    } catch (e) {
      console.warn("[drive-supabase.server] Falha ao criar cliente Supabase, usando Appwrite:", e);
    }
  }
  _client = appwriteAdmin as unknown as SupabaseClient<Database>;
  return _client;
}
