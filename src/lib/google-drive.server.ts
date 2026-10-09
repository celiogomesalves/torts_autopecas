/**
 * Helpers Google Drive — somente servidor.
 * - Token refresh
 * - ensureFolder (busca por nome e cria se não existir)
 * - uploadFile (multipart/related)
 *
 * Usa fetch direto na Drive API v3 (compatível com Cloudflare Workers).
 */

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";

export const DRIVE_SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
  "openid",
];

export type GoogleTokens = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
  id_token?: string;
};

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export function getOAuthClient() {
  return {
    clientId: requireEnv("GOOGLE_OAUTH_CLIENT_ID"),
    clientSecret: requireEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
  };
}

export function buildAuthUrl(opts: { redirectUri: string; state: string }) {
  const { clientId } = getOAuthClient();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    scope: DRIVE_SCOPES.join(" "),
    state: opts.state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForTokens(opts: {
  code: string;
  redirectUri: string;
}): Promise<GoogleTokens> {
  const { clientId, clientSecret } = getOAuthClient();
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
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao trocar code por tokens: ${res.status} ${txt}`);
  }
  return (await res.json()) as GoogleTokens;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokens> {
  const { clientId, clientSecret } = getOAuthClient();
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch(OAUTH_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao renovar access_token: ${res.status} ${txt}`);
  }
  return (await res.json()) as GoogleTokens;
}

export async function fetchUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { email?: string };
  return j.email ?? null;
}

/**
 * Garante que uma pasta com {name} exista dentro de {parentId}. Retorna o id da pasta.
 * Escopo drive.file: só enxerga arquivos criados pelo próprio app.
 */
export async function ensureFolder(opts: {
  accessToken: string;
  parentId: string | null;
  name: string;
}): Promise<string> {
  const safeName = opts.name.replace(/'/g, "\\'");
  const parentClause = opts.parentId ? ` and '${opts.parentId}' in parents` : "";
  const q = `mimeType='application/vnd.google-apps.folder' and trashed=false and name='${safeName}'${parentClause}`;
  const listRes = await fetch(
    `${DRIVE_API}/files?` +
      new URLSearchParams({ q, fields: "files(id,name)", pageSize: "1" }).toString(),
    { headers: { Authorization: `Bearer ${opts.accessToken}` } },
  );
  if (!listRes.ok) {
    const txt = await listRes.text();
    throw new Error(`Drive list falhou: ${listRes.status} ${txt}`);
  }
  const listJson = (await listRes.json()) as { files?: Array<{ id: string }> };
  if (listJson.files && listJson.files.length > 0) return listJson.files[0].id;

  const createBody: Record<string, unknown> = {
    name: opts.name,
    mimeType: "application/vnd.google-apps.folder",
  };
  if (opts.parentId) createBody.parents = [opts.parentId];

  const createRes = await fetch(`${DRIVE_API}/files?fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createBody),
  });
  if (!createRes.ok) {
    const txt = await createRes.text();
    throw new Error(`Drive create folder falhou: ${createRes.status} ${txt}`);
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

/**
 * Upload multipart/related. Substitui arquivo com mesmo nome no parent (delete + insert).
 */
/**
 * Verifica se já existe um arquivo com o nome informado dentro da pasta.
 * Retorna o id do primeiro encontrado, ou null.
 */
export async function findFileInFolder(opts: {
  accessToken: string;
  parentId: string;
  name: string;
}): Promise<string | null> {
  const safeName = opts.name.replace(/'/g, "\\'");
  const q = `name='${safeName}' and '${opts.parentId}' in parents and trashed=false`;
  const res = await fetch(
    `${DRIVE_API}/files?` +
      new URLSearchParams({ q, fields: "files(id)", pageSize: "1" }).toString(),
    { headers: { Authorization: `Bearer ${opts.accessToken}` } },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as { files?: Array<{ id: string }> };
  return j.files?.[0]?.id ?? null;
}

export async function uploadFile(opts: {
  accessToken: string;
  parentId: string;
  name: string;
  mimeType: string;
  data: ArrayBuffer | Uint8Array;
}): Promise<string> {
  // Remove arquivos antigos com mesmo nome
  const safeName = opts.name.replace(/'/g, "\\'");
  const q = `name='${safeName}' and '${opts.parentId}' in parents and trashed=false`;
  const existing = await fetch(
    `${DRIVE_API}/files?` +
      new URLSearchParams({ q, fields: "files(id)", pageSize: "10" }).toString(),
    { headers: { Authorization: `Bearer ${opts.accessToken}` } },
  );
  if (existing.ok) {
    const j = (await existing.json()) as { files?: Array<{ id: string }> };
    for (const f of j.files ?? []) {
      await fetch(`${DRIVE_API}/files/${f.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${opts.accessToken}` },
      });
    }
  }

  const boundary = "lvb_" + Math.random().toString(36).slice(2);
  const metadata = JSON.stringify({ name: opts.name, parents: [opts.parentId] });
  const bytes = opts.data instanceof Uint8Array ? opts.data : new Uint8Array(opts.data);

  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);

  const res = await fetch(`${DRIVE_UPLOAD}/files?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Drive upload falhou: ${res.status} ${txt}`);
  }
  const j = (await res.json()) as { id: string };
  return j.id;
}

// ─── HMAC state para OAuth ───────────────────────────────────────────────
function b64url(buf: ArrayBuffer | Uint8Array): string {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of u) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function hmac(payload: string): Promise<string> {
  const secret = requireEnv("GOOGLE_OAUTH_STATE_SECRET");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return b64url(sig);
}

export async function signState(companyId: string): Promise<string> {
  const payload = `${companyId}.${Date.now()}`;
  const sig = await hmac(payload);
  return `${b64url(new TextEncoder().encode(payload))}.${sig}`;
}

export async function verifyState(state: string): Promise<{ companyId: string } | null> {
  try {
    const [payloadB64, sig] = state.split(".");
    if (!payloadB64 || !sig) return null;
    const payload = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const expected = await hmac(payload);
    if (expected !== sig) return null;
    const [companyId, tsStr] = payload.split(".");
    const ts = Number(tsStr);
    if (!companyId || !ts) return null;
    // Expira em 15 minutos
    if (Date.now() - ts > 15 * 60 * 1000) return null;
    return { companyId };
  } catch {
    return null;
  }
}

// ─── Estrutura de pastas ─────────────────────────────────────────────────
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Converte para America/Sao_Paulo (UTC-3, sem DST desde 2019) usando getUTC*
function toSpParts(date: Date): { y: number; m: number; d: number } {
  const sp = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return { y: sp.getUTCFullYear(), m: sp.getUTCMonth() + 1, d: sp.getUTCDate() };
}

export function monthFolderName(date: Date): string {
  const { y, m } = toSpParts(date);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad2(m)}-01 a ${y}-${pad2(m)}-${pad2(lastDay)}`;
}

export function dayFolderName(date: Date, cashRegisterSeq: number | null): string {
  const { y, m, d } = toSpParts(date);
  const seq = cashRegisterSeq ?? 1;
  return `${y}-${pad2(m)}-${pad2(d)} - Caixa #${seq}`;
}

