// Server-only Supabase admin client para o módulo Google Drive.
// Usa secrets DRIVE_SUPABASE_URL / DRIVE_SUPABASE_SERVICE_ROLE_KEY porque o
// prefixo "SUPABASE_" é reservado na plataforma e este projeto usa Supabase externo.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let _client: SupabaseClient<Database> | undefined;

export function getDriveSupabaseAdmin(): SupabaseClient<Database> {
  if (_client) return _client;
  const url = process.env.DRIVE_SUPABASE_URL;
  const key = process.env.DRIVE_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Configuração ausente: defina DRIVE_SUPABASE_URL e DRIVE_SUPABASE_SERVICE_ROLE_KEY nos secrets do projeto.",
    );
  }
  _client = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  return _client;
}
