/**
 * Envio de e-mail pelo próprio sistema via Gmail API (OAuth2).
 * Somente servidor. Reaproveita as credenciais GOOGLE_OAUTH_CLIENT_ID/SECRET.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";
const GMAIL_SEND = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

/** Client admin (Appwrite adapter). */
export async function getEmailAdmin(): Promise<any> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

// ─── OAuth ───────────────────────────────────────────────────────────────
export async function buildGmailAuthUrl(opts: {
  redirectUri: string;
  state: string;
  companyId?: string | null;
}) {
  const { getOAuthClient } = await import("./google-drive.server");
  const { clientId } = await getOAuthClient(opts.companyId);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    scope: GMAIL_SCOPES.join(" "),
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
};

export async function exchangeGmailCode(opts: {
  code: string;
  redirectUri: string;
  companyId?: string | null;
}): Promise<GoogleTokens> {
  const { getOAuthClient } = await import("./google-drive.server");
  const { clientId, clientSecret } = await getOAuthClient(opts.companyId);
  const body = new URLSearchParams({
    code: opts.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: opts.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Falha ao trocar code por tokens: ${res.status} ${await res.text()}`);
  return (await res.json()) as GoogleTokens;
}

export async function fetchGoogleEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const j = (await res.json()) as { email?: string };
  return j.email ?? null;
}

/** Retorna um access_token válido para a empresa (renova se necessário). */
export async function getCompanyAccessToken(companyId: string): Promise<{
  accessToken: string;
  senderEmail: string;
  senderName: string | null;
} | null> {
  const admin = await getEmailAdmin();
  const { data: row } = await admin
    .from("company_email_settings")
    .select("google_email, sender_name, refresh_token, access_token, token_expires_at")
    .eq("company_id", companyId)
    .maybeSingle();

  const r = row as Record<string, any> | null;
  if (!r?.refresh_token || !r?.google_email) return null;

  const exp = r.token_expires_at ? new Date(r.token_expires_at).getTime() : 0;
  if (r.access_token && exp - Date.now() > 60_000) {
    return { accessToken: r.access_token, senderEmail: r.google_email, senderName: r.sender_name };
  }

  const { getOAuthClient } = await import("./google-drive.server");
  const { clientId, clientSecret } = await getOAuthClient(companyId);

  const body = new URLSearchParams({
    refresh_token: r.refresh_token,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Falha ao renovar access_token: ${res.status} ${await res.text()}`);
  const tokens = (await res.json()) as GoogleTokens;

  await admin
    .from("company_email_settings")
    .update({
      access_token: tokens.access_token,
      token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("company_id", companyId);

  return {
    accessToken: tokens.access_token,
    senderEmail: r.google_email,
    senderName: r.sender_name,
  };
}

// ─── MIME ────────────────────────────────────────────────────────────────
function b64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(bin);
}

function b64Utf8(s: string): string {
  return b64(new TextEncoder().encode(s));
}

function encodeHeader(v: string): string {
  return /^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64Utf8(v)}?=`;
}

function wrap76(s: string): string {
  return s.replace(/(.{76})/g, "$1\r\n");
}

export type MailAttachment = {
  filename: string;
  mimeType: string;
  contentBase64: string;
};

export function buildRawMessage(opts: {
  fromEmail: string;
  fromName?: string | null;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
}): string {
  const mixed = `mixed_${crypto.randomUUID().replace(/-/g, "")}`;
  const alt = `alt_${crypto.randomUUID().replace(/-/g, "")}`;
  const from = opts.fromName
    ? `${encodeHeader(opts.fromName)} <${opts.fromEmail}>`
    : opts.fromEmail;

  const lines: string[] = [
    `From: ${from}`,
    `To: ${opts.to.join(", ")}`,
    `Subject: ${encodeHeader(opts.subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64Utf8(opts.text ?? opts.html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))),
    `--${alt}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap76(b64Utf8(opts.html)),
    `--${alt}--`,
  ];

  for (const a of opts.attachments ?? []) {
    lines.push(
      `--${mixed}`,
      `Content-Type: ${a.mimeType}; name="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "",
      wrap76(a.contentBase64),
    );
  }
  lines.push(`--${mixed}--`, "");

  const mime = lines.join("\r\n");
  return b64Utf8(mime).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// ─── Envio ───────────────────────────────────────────────────────────────
export type SendResult = { sent: boolean; reason?: string; recipients?: string[] };

export async function sendCompanyEmail(opts: {
  companyId: string;
  to: string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: MailAttachment[];
  context?: string;
  senderNameOverride?: string | null;
}): Promise<SendResult> {
  const recipients = Array.from(
    new Set(opts.to.map((e) => String(e ?? "").trim()).filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))),
  );
  if (recipients.length === 0) return { sent: false, reason: "nenhum destinatário válido" };

  const creds = await getCompanyAccessToken(opts.companyId);
  if (!creds) return { sent: false, reason: "conta de e-mail (Gmail) não conectada" };

  const raw = buildRawMessage({
    fromEmail: creds.senderEmail,
    fromName: opts.senderNameOverride ?? creds.senderName,
    to: recipients,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
    attachments: opts.attachments,
  });

  const res = await fetch(GMAIL_SEND, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });

  const admin = await getEmailAdmin();
  if (!res.ok) {
    const errText = (await res.text().catch(() => "")).slice(0, 800);
    console.error("[gmail] envio falhou", res.status, errText);
    await admin.from("email_logs").insert({
      company_id: opts.companyId,
      to_emails: recipients,
      subject: opts.subject,
      context: opts.context ?? null,
      status: "error",
      error: `HTTP ${res.status}: ${errText}`,
    });
    return { sent: false, reason: `Gmail HTTP ${res.status}: ${errText}`, recipients };
  }

  await admin.from("email_logs").insert({
    company_id: opts.companyId,
    to_emails: recipients,
    subject: opts.subject,
    context: opts.context ?? null,
    status: "sent",
  });
  return { sent: true, recipients };
}

// ─── State assinado (CSRF) ───────────────────────────────────────────────
async function hmac(payload: string): Promise<string> {
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET ?? "fallback";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64(new Uint8Array(sig)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function signGmailState(companyId: string): Promise<string> {
  const payload = `${companyId}.${Date.now()}`;
  return `${b64Utf8(payload).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.${await hmac(payload)}`;
}

export async function verifyGmailState(state: string): Promise<{ companyId: string } | null> {
  try {
    const [payloadB64, sig] = state.split(".");
    if (!payloadB64 || !sig) return null;
    const payload = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    if ((await hmac(payload)) !== sig) return null;
    const [companyId, tsStr] = payload.split(".");
    const ts = Number(tsStr);
    if (!companyId || !ts || Date.now() - ts > 15 * 60 * 1000) return null;
    return { companyId };
  } catch {
    return null;
  }
}
