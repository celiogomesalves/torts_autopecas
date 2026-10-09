import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CALLBACK_PATH = "/api/public/google-drive/callback";

function pickRedirectUri(origin?: string | null): string {
  if (origin) {
    try {
      const u = new URL(origin);
      const isAllowedHost =
        u.hostname === "localhost" ||
        u.hostname.endsWith(".lovable.app") ||
        u.hostname.endsWith(".lovableproject.com");
      if ((u.protocol === "https:" || u.hostname === "localhost") && isAllowedHost) {
        return `${u.origin}${CALLBACK_PATH}`;
      }
    } catch {
      // fallback abaixo
    }
  }
  return `https://project--54df0fe6-5eb6-44d7-8103-7686e7f4ca70.lovable.app${CALLBACK_PATH}`;
}

async function assertCanManage(supabase: any, companyId: string) {
  // Checa via RPC has_company_role/is_admin
  const { data: isAdmin } = await supabase.rpc("is_admin", { _company: companyId });
  if (isAdmin) return;
  const { data: isManager } = await supabase.rpc("has_company_role", {
    _company: companyId,
    _role: "gerente",
  });
  if (!isManager) {
    throw new Error("Sem permissão para gerenciar a integração com Drive");
  }
}

// ─── getDriveStatus ──────────────────────────────────────────────────────
export const getDriveStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const { data: row } = await context.supabase
      .from("company_drive_settings")
      .select(
        "enabled, google_email, root_folder_name, root_folder_id, connected_at, updated_at, daily_check_enabled, daily_check_hour" as never,
      )
      .eq("company_id", data.companyId)
      .maybeSingle();
    if (!row) {
      return {
        connected: false,
        enabled: true,
        email: null,
        rootFolderName: "Notas Fiscais",
        rootFolderId: null,
        connectedAt: null,
        dailyCheckEnabled: true,
        dailyCheckHour: 23,
      };
    }
    const r = row as any;
    return {
      connected: !!r.root_folder_id,
      enabled: r.enabled,
      email: r.google_email,
      rootFolderName: r.root_folder_name,
      rootFolderId: r.root_folder_id,
      connectedAt: r.connected_at,
      dailyCheckEnabled: r.daily_check_enabled ?? true,
      dailyCheckHour: r.daily_check_hour ?? 23,
    };
  });

// ─── getDriveAuthUrl ─────────────────────────────────────────────────────
export const getDriveAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; origin?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const { buildAuthUrl, signState } = await import("./google-drive.server");
    const redirectUri = pickRedirectUri(data.origin);
    const state = await signState(data.companyId);
    return { url: buildAuthUrl({ redirectUri, state }), redirectUri };
  });

// ─── updateDriveSettings ─────────────────────────────────────────────────
export const updateDriveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      companyId: string;
      enabled?: boolean;
      rootFolderName?: string;
      dailyCheckEnabled?: boolean;
      dailyCheckHour?: number;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const patch: Record<string, unknown> = { company_id: data.companyId };
    if (typeof data.enabled === "boolean") patch.enabled = data.enabled;
    if (typeof data.rootFolderName === "string" && data.rootFolderName.trim()) {
      patch.root_folder_name = data.rootFolderName.trim();
    }
    if (typeof data.dailyCheckEnabled === "boolean") {
      patch.daily_check_enabled = data.dailyCheckEnabled;
    }
    if (typeof data.dailyCheckHour === "number") {
      const h = Math.max(0, Math.min(23, Math.floor(data.dailyCheckHour)));
      patch.daily_check_hour = h;
    }
    const { error } = await context.supabase
      .from("company_drive_settings")
      .upsert(patch as never, { onConflict: "company_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── disconnectDrive ─────────────────────────────────────────────────────
export const disconnectDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("company_drive_settings")
      .update({
        refresh_token: null,
        access_token: null,
        token_expires_at: null,
        google_email: null,
        root_folder_id: null,
        connected_at: null,
      })
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── uploadFiscalNoteToDrive (manual + reuso pelo webhook) ──────────────
export const uploadFiscalNoteToDrive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { fiscalNoteId: string }) => d)
  .handler(async ({ data, context }) => {
    const { uploadFiscalNoteInternal } = await import("./google-drive-upload.server");

    // Usa o client autenticado do usuário (RLS) para validar acesso à nota
    const { data: note, error } = await context.supabase
      .from("fiscal_notes")
      .select("id, company_id")
      .eq("id", data.fiscalNoteId)
      .maybeSingle();
    if (error || !note) throw new Error("Nota fiscal não encontrada ou sem acesso");

    return uploadFiscalNoteInternal(data.fiscalNoteId);
  });

// ─── runDriveCheckNow (botão "Verificar agora") ─────────────────────────
export const runDriveCheckNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const { runDriveCheckForCompanyNow } = await import("./google-drive-upload.server");
    return runDriveCheckForCompanyNow(data.companyId);
  });

// ─── backfillContabilidade (copiar XMLs históricos para Contabilidade) ──
export const backfillContabilidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; startDate: string; endDate: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const { backfillContabilidadeFolder } = await import("./google-drive-upload.server");
    return backfillContabilidadeFolder(data.companyId, data.startDate, data.endDate);
  });


// ─── testDriveConnection (botão "Testar conexão") ───────────────────────
export const testDriveConnectionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const { testDriveConnection } = await import("./google-drive-upload.server");
    return testDriveConnection(data.companyId);
  });
