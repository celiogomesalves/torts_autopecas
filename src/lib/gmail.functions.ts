import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CALLBACK_PATH = "/api/public/gmail/callback";

function pickRedirectUri(origin?: string | null): string {
  if (origin) {
    try {
      const u = new URL(origin);
      if (u.hostname === "localhost") {
        return `${u.origin}${CALLBACK_PATH}`;
      }
    } catch {
      /* fallback */
    }
  }
  return `https://tortsautopecas.agenc-ia.net${CALLBACK_PATH}`;
}

async function assertCanManage(supabase: any, companyId: string) {
  const { data: isAdmin } = await supabase.rpc("is_admin", { _company: companyId });
  if (isAdmin) return;
  const { data: isManager } = await supabase.rpc("has_company_role", {
    _company: companyId,
    _role: "gerente",
  });
  if (!isManager) throw new Error("Sem permissão para gerenciar o e-mail da empresa");
}

// ─── Status da conexão ───────────────────────────────────────────────────
export const getEmailAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const { getEmailAdmin } = await import("./gmail.server");
    const admin = await getEmailAdmin();
    const [{ data: row }, { data: settings }] = await Promise.all([
      admin
        .from("company_email_settings")
        .select("google_email, sender_name, connected_at, refresh_token")
        .eq("company_id", data.companyId)
        .maybeSingle(),
      admin
        .from("company_settings")
        .select("accounting_nfe_auto_send")
        .eq("company_id", data.companyId)
        .maybeSingle(),
    ]);
    const r = row as Record<string, any> | null;
    return {
      connected: !!r?.refresh_token && !!r?.google_email,
      email: (r?.google_email as string) ?? null,
      senderName: (r?.sender_name as string) ?? null,
      connectedAt: (r?.connected_at as string) ?? null,
      nfeAutoSend: (settings as any)?.accounting_nfe_auto_send === true,
    };
  });

// ─── Envio automático da NFC-e (só com conta conectada) ─────────────────
export const setNfeAutoSend = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; enabled: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const { getEmailAdmin } = await import("./gmail.server");
    const admin = await getEmailAdmin();
    if (data.enabled) {
      const { data: row } = await admin
        .from("company_email_settings")
        .select("refresh_token, google_email")
        .eq("company_id", data.companyId)
        .maybeSingle();
      const r = row as Record<string, any> | null;
      if (!r?.refresh_token || !r?.google_email) {
        throw new Error("Conecte uma conta de e-mail antes de habilitar o envio automático");
      }
    }
    const { error } = await admin.from("company_settings").upsert(
      {
        company_id: data.companyId,
        accounting_nfe_auto_send: data.enabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── URL de autorização ──────────────────────────────────────────────────
export const getEmailAuthUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; origin?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const { buildGmailAuthUrl, signGmailState } = await import("./gmail.server");
    const redirectUri = pickRedirectUri(data.origin);
    const state = await signGmailState(data.companyId);
    return { url: buildGmailAuthUrl({ redirectUri, state }), redirectUri };
  });

// ─── Nome do remetente ───────────────────────────────────────────────────
export const saveEmailSenderName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; senderName: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const { getEmailAdmin } = await import("./gmail.server");
    const admin = await getEmailAdmin();
    const { error } = await admin.from("company_email_settings").upsert(
      {
        company_id: data.companyId,
        sender_name: data.senderName.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "company_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Desconectar ─────────────────────────────────────────────────────────
export const disconnectEmailAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const { getEmailAdmin } = await import("./gmail.server");
    const admin = await getEmailAdmin();
    const { error } = await admin
      .from("company_email_settings")
      .update({
        refresh_token: null,
        access_token: null,
        token_expires_at: null,
        google_email: null,
        connected_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("company_id", data.companyId);
    if (error) throw new Error(error.message);
    // Sem conta conectada, o envio automático é desligado junto
    await admin
      .from("company_settings")
      .update({ accounting_nfe_auto_send: false, updated_at: new Date().toISOString() })
      .eq("company_id", data.companyId);
    return { ok: true };
  });

// ─── Enviar e-mail de teste ──────────────────────────────────────────────
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { companyId: string; to: string }) => d)
  .handler(async ({ data, context }) => {
    await assertCanManage(context.supabase, data.companyId);
    const { sendCompanyEmail } = await import("./gmail.server");
    return sendCompanyEmail({
      companyId: data.companyId,
      to: [data.to],
      subject: "Teste de envio de e-mail",
      html: "<p>Este é um <strong>e-mail de teste</strong> enviado pelo sistema.</p>",
      context: "teste",
    });
  });

// ─── Reenvio manual de uma nota fiscal ───────────────────────────────────
export const resendFiscalNoteEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { ref: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: note } = await context.supabase
      .from("fiscal_notes")
      .select("id, company_id")
      .eq("ref", data.ref)
      .maybeSingle();
    if (!note) throw new Error("Nota fiscal não encontrada ou sem acesso");
    const { sendFiscalNoteByEmail } = await import("./nfce-email.server");
    return sendFiscalNoteByEmail(data.ref, { force: true });
  });
