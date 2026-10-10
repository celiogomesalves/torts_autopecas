// Server-only admin client para o módulo Google Drive / Gmail.
// Opera 100% no Appwrite Server Adapter.
import { supabaseAdmin as appwriteAdmin } from "@/integrations/supabase/client.server";

export function getDriveSupabaseAdmin(): any {
  return appwriteAdmin;
}
