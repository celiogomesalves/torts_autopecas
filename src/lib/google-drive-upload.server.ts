/**
 * Upload do XML de uma NF-e autorizada para o Google Drive da empresa.
 *
 * Pipeline:
 *   1) Supabase Storage (bucket fiscal-xmls) — cache local.
 *   2) Focus NFe autenticada — `${focusBase}/v2/nfce/{ref}.xml` com Basic auth.
 *   3) URL pública (xml_url) — último recurso.
 *
 * Em caso de falha, apenas marca `drive_upload_status='pending'` com a mensagem
 * de erro. Um cron diário (processDailyDriveCheck) reprocessa as notas
 * autorizadas do dia que ainda não estão no Drive.
 */
import { getDriveSupabaseAdmin } from "./drive-supabase.server";
const supabaseAdmin = getDriveSupabaseAdmin();
import {
  refreshAccessToken,
  ensureFolder,
  uploadFile,
  findFileInFolder,
  monthFolderName,
  dayFolderName,
  fetchUserEmail,
} from "./google-drive.server";

type UploadResult = {
  ok: boolean;
  skipped?: string;
  folderId?: string;
  xmlFileId?: string;
  error?: string;
};

function focusBaseUrl(ambiente?: string | null) {
  return ambiente === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

function basicAuth(token: string) {
  return "Basic " + btoa(`${token}:`);
}

async function getFocusToken(companyId: string, ambiente?: string | null): Promise<string | null> {
  const { data: fs } = await supabaseAdmin
    .from("fiscal_settings")
    .select("ambiente, focus_company_token, focus_token_homologacao, focus_token_producao")
    .eq("company_id", companyId)
    .maybeSingle();
  if (!fs) return null;
  const detected = (ambiente ?? fs.ambiente) === "producao" ? "producao" : "homologacao";
  const envToken = detected === "producao" ? fs.focus_token_producao : fs.focus_token_homologacao;
  const token =
    (envToken ?? "").trim() ||
    (fs.focus_company_token ?? "").trim() ||
    (process.env.FOCUS_NFE_TOKEN ?? "").trim();
  return token || null;
}

async function getValidAccessToken(companyId: string): Promise<{
  accessToken: string;
  rootFolderId: string;
  rootFolderName: string;
} | null> {
  const { data: settings } = await supabaseAdmin
    .from("company_drive_settings")
    .select("enabled, refresh_token, access_token, token_expires_at, root_folder_id, root_folder_name")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!settings || !settings.refresh_token) return null;
  if (!settings.enabled) return null;

  const expiresAt = settings.token_expires_at ? new Date(settings.token_expires_at).getTime() : 0;
  let accessToken = settings.access_token as string | null;

  if (!accessToken || Date.now() > expiresAt - 60_000) {
    const refreshed = await refreshAccessToken(settings.refresh_token, companyId);
    accessToken = refreshed.access_token;
    await supabaseAdmin
      .from("company_drive_settings")
      .update({
        access_token: refreshed.access_token,
        token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      })
      .eq("company_id", companyId);
  }

  let rootFolderId = settings.root_folder_id as string | null;
  if (!rootFolderId) {
    rootFolderId = await ensureFolder({
      accessToken: accessToken!,
      parentId: null,
      name: settings.root_folder_name || "Notas Fiscais",
    });
    await supabaseAdmin
      .from("company_drive_settings")
      .update({ root_folder_id: rootFolderId })
      .eq("company_id", companyId);
  }

  return {
    accessToken: accessToken!,
    rootFolderId,
    rootFolderName: settings.root_folder_name || "Notas Fiscais",
  };
}

async function getCashRegisterDailySeq(
  companyId: string,
  cashRegisterId: string | null,
  refDate: Date,
): Promise<number | null> {
  if (!cashRegisterId) return null;
  const start = new Date(refDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(refDate);
  end.setHours(23, 59, 59, 999);

  const { data: registers } = await supabaseAdmin
    .from("cash_registers")
    .select("id, opened_at")
    .eq("company_id", companyId)
    .gte("opened_at", start.toISOString())
    .lte("opened_at", end.toISOString())
    .order("opened_at", { ascending: true });

  if (!registers) return 1;
  const idx = registers.findIndex((r) => r.id === cashRegisterId);
  return idx >= 0 ? idx + 1 : 1;
}

function joinFocusUrl(base: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function readJsonPath(obj: unknown, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const key of keys) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function looksLikeXml(buf: Uint8Array): boolean {
  const head = new TextDecoder().decode(buf.slice(0, 200)).trimStart();
  return head.startsWith("<?xml") || head.startsWith("<nfeProc") || head.startsWith("<NFe");
}

async function downloadFile(url: string, headers?: Record<string, string>): Promise<Uint8Array> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Download falhou (${res.status}) ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function downloadFromStorage(path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabaseAdmin.storage.from("fiscal-xmls").download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function downloadXmlFromFocus(
  ref: string,
  companyId: string,
  ambiente: string | null,
): Promise<Uint8Array | null> {
  const token = await getFocusToken(companyId, ambiente);
  if (!token || !ref) return null;
  const base = focusBaseUrl(ambiente);
  const safeRef = encodeURIComponent(ref);
  const directUrl = `${base}/v2/nfce/${safeRef}.xml`;
  const consultationUrl = `${base}/v2/nfce/${safeRef}`;
  try {
    const authHeaders = {
      Authorization: basicAuth(token),
      Accept: "application/xml,text/xml",
    };
    const res = await fetch(directUrl, { headers: authHeaders });
    if (!res.ok) console.warn(`[drive-upload] Focus xml ${res.status} ${directUrl}`);
    const payloadRes = res.ok
      ? res
      : await fetch(consultationUrl, {
          headers: { Authorization: basicAuth(token), Accept: "application/json" },
        });
    if (!payloadRes.ok) {
      console.warn(`[drive-upload] Focus xml consulta ${payloadRes.status} ${consultationUrl}`);
      return null;
    }
    const ct = payloadRes.headers.get("content-type") || "";
    const buf = new Uint8Array(await payloadRes.arrayBuffer());
    if (looksLikeXml(buf)) return buf;

    if (ct.includes("json")) {
      try {
        const json = JSON.parse(new TextDecoder().decode(buf));
        const pathKeys = ["caminho_xml_nota_fiscal", "xml_url", "url_xml"];
        let path = readJsonPath(json, pathKeys);

        if (!path && payloadRes.url !== consultationUrl) {
          const consultRes = await fetch(consultationUrl, {
            headers: { Authorization: basicAuth(token), Accept: "application/json" },
          });
          if (consultRes.ok) {
            const consultJson = await consultRes.json();
            path = readJsonPath(consultJson, pathKeys);
          }
        }

        if (path) {
          const fileUrl = joinFocusUrl(base, path);
          const fileBytes = await downloadFile(fileUrl, authHeaders);
          if (looksLikeXml(fileBytes)) return fileBytes;
          return null;
        }
      } catch (e) {
        console.warn(`[drive-upload] Focus xml JSON inválido`, e);
      }
    }
    return null;
  } catch (e) {
    console.warn(`[drive-upload] Focus xml erro`, e);
    return null;
  }
}

async function markPending(fiscalNoteId: string, errMsg: string) {
  await (supabaseAdmin as any)
    .from("fiscal_notes")
    .update({
      drive_upload_error: errMsg.slice(0, 1000),
      drive_upload_status: "pending",
    })
    .eq("id", fiscalNoteId);
}

export async function uploadFiscalNoteInternal(fiscalNoteId: string): Promise<UploadResult> {
  const { data: note, error } = await (supabaseAdmin as any)
    .from("fiscal_notes")
    .select(
      "id, company_id, sale_id, status, numero, serie, ambiente, ref, xml_url, xml_storage_path, emitted_at, drive_xml_file_id",
    )
    .eq("id", fiscalNoteId)
    .maybeSingle();

  if (error || !note) return { ok: false, error: "Nota não encontrada" };
  if (note.status !== "autorizada") return { ok: false, skipped: "Nota não autorizada" };

  try {
    const creds = await getValidAccessToken(note.company_id);
    if (!creds) {
      await (supabaseAdmin as any)
        .from("fiscal_notes")
        .update({ drive_upload_status: "skipped" })
        .eq("id", fiscalNoteId);
      return { ok: false, skipped: "Drive não conectado para esta empresa" };
    }

    // Descobre cash_register_id e data da venda
    let cashRegisterId: string | null = null;
    let saleNumber: number | null = null;
    if (note.sale_id) {
      const { data: sale } = await supabaseAdmin
        .from("sales")
        .select("cash_register_id, number")
        .eq("id", note.sale_id)
        .maybeSingle();
      cashRegisterId = (sale?.cash_register_id as string | null) ?? null;
      saleNumber = (sale?.number as number | null) ?? null;
    }

    const refDate = new Date(note.emitted_at || Date.now());
    const seq = await getCashRegisterDailySeq(note.company_id, cashRegisterId, refDate);

    const monthName = monthFolderName(refDate);
    const dayName = dayFolderName(refDate, seq);

    const monthFolderId = await ensureFolder({
      accessToken: creds.accessToken,
      parentId: creds.rootFolderId,
      name: monthName,
    });
    const dayFolderId = await ensureFolder({
      accessToken: creds.accessToken,
      parentId: monthFolderId,
      name: dayName,
    });

    const salePart = saleNumber ? `-Venda${String(saleNumber).padStart(6, "0")}` : "";
    const baseName = `NFe-${String(note.numero ?? 0).padStart(6, "0")}-${note.serie ?? 1}${salePart}`;

    // XML: Storage → Focus autenticada → URL armazenada
    let xmlBytes: Uint8Array | null = null;
    if (note.xml_storage_path) {
      xmlBytes = await downloadFromStorage(note.xml_storage_path);
    }
    if (!xmlBytes && note.ref) {
      xmlBytes = await downloadXmlFromFocus(note.ref, note.company_id, note.ambiente);
    }
    if (!xmlBytes && note.xml_url) {
      try {
        const token = await getFocusToken(note.company_id, note.ambiente);
        xmlBytes = await downloadFile(
          note.xml_url,
          token ? { Authorization: basicAuth(token) } : undefined,
        );
      } catch (e) {
        console.warn("[drive-upload] XML URL falhou", e);
      }
    }

    if (!xmlBytes) {
      const msg = "XML indisponível";
      await markPending(fiscalNoteId, msg);
      return { ok: false, error: msg };
    }

    const xmlFileId = await uploadFile({
      accessToken: creds.accessToken,
      parentId: dayFolderId,
      name: `${baseName}.xml`,
      mimeType: "application/xml",
      data: xmlBytes,
    });

    // Cópia paralela em <mês>/Contabilidade/ (todos os XMLs juntos, sem separar por dia)
    try {
      const contabFolderId = await ensureFolder({
        accessToken: creds.accessToken,
        parentId: monthFolderId,
        name: "Contabilidade",
      });
      await uploadFile({
        accessToken: creds.accessToken,
        parentId: contabFolderId,
        name: `${baseName}.xml`,
        mimeType: "application/xml",
        data: xmlBytes,
      });
    } catch (e) {
      console.warn("[drive-upload] falha ao copiar XML para Contabilidade", e);
    }

    await (supabaseAdmin as any)
      .from("fiscal_notes")
      .update({
        drive_folder_id: dayFolderId,
        drive_xml_file_id: xmlFileId,
        drive_uploaded_at: new Date().toISOString(),
        drive_upload_error: null,
        drive_upload_status: "done",
      })
      .eq("id", fiscalNoteId);

    return { ok: true, folderId: dayFolderId, xmlFileId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await markPending(fiscalNoteId, msg);
    return { ok: false, error: msg };
  }
}

/**
 * Verifica, para uma empresa, todos os caixas FECHADOS dentro do mês
 * corrente (America/Sao_Paulo): lista as NFC-e autorizadas vinculadas a
 * vendas desses caixas, confere no Drive se o XML ainda existe e reenvia
 * o que estiver faltando (ou nunca foi arquivado).
 */
export async function runDriveCheckForCompany(companyId: string): Promise<{
  cashRegisters: number;
  processed: number;
  ok: number;
  failed: number;
  reuploaded: number;
}> {
  // Validação do tenant (companyId obrigatório, UUID válido e empresa existente)
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!companyId || typeof companyId !== "string" || !UUID_RE.test(companyId)) {
    throw new Error(`runDriveCheckForCompany: companyId inválido (${companyId})`);
  }
  const { data: companyRow, error: companyErr } = await (supabaseAdmin as any)
    .from("companies")
    .select("id")
    .eq("id", companyId)
    .maybeSingle();
  if (companyErr) throw new Error(`Erro ao validar empresa: ${companyErr.message}`);
  if (!companyRow) throw new Error(`Empresa não encontrada para companyId=${companyId}`);

  // Janela do mês corrente em America/Sao_Paulo
  const nowSp = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const monthStartSp = new Date(
    Date.UTC(nowSp.getUTCFullYear(), nowSp.getUTCMonth(), 1, 0, 0, 0, 0),
  );
  const monthEndSp = new Date(
    Date.UTC(nowSp.getUTCFullYear(), nowSp.getUTCMonth() + 1, 1, 0, 0, 0, 0) - 1,
  );
  const startIso = new Date(monthStartSp.getTime() + 3 * 60 * 60 * 1000).toISOString();
  const endIso = new Date(monthEndSp.getTime() + 3 * 60 * 60 * 1000).toISOString();

  // 1) Caixas fechados no mês corrente (status case-insensitive p/ resiliência)
  const { data: registers, error: regErr } = await (supabaseAdmin as any)
    .from("cash_registers")
    .select("id, status, closed_at, company_id")
    .eq("company_id", companyId)
    .ilike("status", "closed")
    .gte("closed_at", startIso)
    .lte("closed_at", endIso);
  if (regErr) throw new Error(`Erro ao buscar caixas: ${regErr.message}`);

  // Sanity-check: nenhuma linha de outra empresa deve vir aqui
  const leak = (registers ?? []).find((r: any) => r.company_id !== companyId);
  if (leak) {
    throw new Error(
      `Isolamento violado: caixa ${leak.id} pertence a ${leak.company_id}, esperado ${companyId}`,
    );
  }

  console.log(
    `[drive-check] company=${companyId} janela=${startIso}..${endIso} caixas_fechados=${registers?.length ?? 0}`,
  );

  const registerIds = (registers ?? []).map((r: any) => r.id as string);
  if (registerIds.length === 0) {
    return { cashRegisters: 0, processed: 0, ok: 0, failed: 0, reuploaded: 0 };
  }

  // 2) NFC-e autorizadas no mês corrente para essa empresa.
  //    Observação: nem toda venda tem `cash_register_id` populado, então o
  //    vínculo prático com os caixas fechados é por janela temporal (mês).
  const { data: notes, error: notesErr } = await (supabaseAdmin as any)
    .from("fiscal_notes")
    .select("id, drive_xml_file_id, sale_id, emitted_at")
    .eq("company_id", companyId)
    .eq("status", "autorizada")
    .gte("emitted_at", startIso)
    .lte("emitted_at", endIso)
    .limit(5000);
  if (notesErr) throw new Error(`Erro ao buscar NFC-e: ${notesErr.message}`);

  console.log(
    `[drive-check] company=${companyId} notas_autorizadas_no_mes=${notes?.length ?? 0}`,
  );

  const creds = await getValidAccessToken(companyId);

  let processed = 0;
  let ok = 0;
  let failed = 0;
  let reuploaded = 0;

  for (const n of notes ?? []) {
    processed++;

    if (n.drive_xml_file_id && creds) {
      try {
        const res = await fetch(
          `https://www.googleapis.com/drive/v3/files/${n.drive_xml_file_id}?fields=id,trashed`,
          { headers: { Authorization: `Bearer ${creds.accessToken}` } },
        );
        if (res.ok) {
          const meta = (await res.json()) as { trashed?: boolean };
          if (!meta.trashed) {
            ok++;
            continue;
          }
        } else if (res.status !== 404) {
          console.warn("[drive-check] verify falhou", res.status);
        }
      } catch (e) {
        console.warn("[drive-check] erro ao verificar arquivo", e);
      }
      await (supabaseAdmin as any)
        .from("fiscal_notes")
        .update({ drive_xml_file_id: null, drive_folder_id: null })
        .eq("id", n.id);
    }

    const r = await uploadFiscalNoteInternal(n.id);
    if (r.ok) {
      ok++;
      reuploaded++;
    } else {
      failed++;
    }
  }

  return { cashRegisters: registerIds.length, processed, ok, failed, reuploaded };
}

/**
 * Verificação diária acionada pelo cron: percorre as empresas com Drive
 * habilitado cuja `daily_check_hour` bate com a hora atual (America/Sao_Paulo)
 * e executa `runDriveCheckForCompany` em cada uma.
 */
export async function processDailyDriveCheck(): Promise<{
  companies: number;
  processed: number;
  ok: number;
  failed: number;
  reuploaded: number;
}> {
  const nowSp = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const currentHour = nowSp.getUTCHours();

  const { data: companies } = await (supabaseAdmin as any)
    .from("company_drive_settings")
    .select("company_id")
    .eq("enabled", true)
    .eq("daily_check_enabled", true)
    .eq("daily_check_hour", currentHour)
    .not("refresh_token", "is", null);

  if (!companies || companies.length === 0) {
    return { companies: 0, processed: 0, ok: 0, failed: 0, reuploaded: 0 };
  }

  let processed = 0;
  let ok = 0;
  let failed = 0;
  let reuploaded = 0;

  for (const c of companies) {
    const r = await runDriveCheckForCompany(c.company_id);
    processed += r.processed;
    ok += r.ok;
    failed += r.failed;
    reuploaded += r.reuploaded;
  }

  return { companies: companies.length, processed, ok, failed, reuploaded };
}

/** Alias mantido para compatibilidade com a UI ("Verificar agora"). */
export const runDriveCheckForCompanyNow = runDriveCheckForCompany;

/**
 * Backfill: copia para <mês>/Contabilidade/ todos os XMLs das NFC-e
 * autorizadas no período informado. Idempotente (uploadFile substitui
 * arquivo com mesmo nome no destino).
 */
export async function backfillContabilidadeFolder(
  companyId: string,
  startDate: string,
  endDate: string,
): Promise<{ processed: number; ok: number; skipped: number; failed: number; missing: number }> {
  const creds = await getValidAccessToken(companyId);
  if (!creds) throw new Error("Drive não conectado para esta empresa");

  const startIso = new Date(`${startDate}T00:00:00-03:00`).toISOString();
  const endIso = new Date(`${endDate}T23:59:59.999-03:00`).toISOString();

  const { data: notes, error } = await (supabaseAdmin as any)
    .from("fiscal_notes")
    .select(
      "id, company_id, sale_id, status, numero, serie, ambiente, ref, xml_url, xml_storage_path, emitted_at",
    )
    .eq("company_id", companyId)
    .eq("status", "autorizada")
    .gte("emitted_at", startIso)
    .lte("emitted_at", endIso)
    .limit(10000);
  if (error) throw new Error(error.message);

  let processed = 0;
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  let missing = 0;
  const contabCache = new Map<string, string>();

  for (const n of notes ?? []) {
    processed++;
    try {
      const refDate = new Date(n.emitted_at || Date.now());
      const monthName = monthFolderName(refDate);
      let contabFolderId = contabCache.get(monthName);
      if (!contabFolderId) {
        const monthFolderId = await ensureFolder({
          accessToken: creds.accessToken,
          parentId: creds.rootFolderId,
          name: monthName,
        });
        contabFolderId = await ensureFolder({
          accessToken: creds.accessToken,
          parentId: monthFolderId,
          name: "Contabilidade",
        });
        contabCache.set(monthName, contabFolderId);
      }

      let saleNumber: number | null = null;
      if (n.sale_id) {
        const { data: sale } = await supabaseAdmin
          .from("sales")
          .select("number")
          .eq("id", n.sale_id)
          .maybeSingle();
        saleNumber = (sale?.number as number | null) ?? null;
      }
      const salePart = saleNumber ? `-Venda${String(saleNumber).padStart(6, "0")}` : "";
      const baseName = `NFe-${String(n.numero ?? 0).padStart(6, "0")}-${n.serie ?? 1}${salePart}`;
      const fileName = `${baseName}.xml`;

      // Pula quando o XML já existe na pasta Contabilidade do mês
      const existingId = await findFileInFolder({
        accessToken: creds.accessToken,
        parentId: contabFolderId,
        name: fileName,
      });
      if (existingId) {
        skipped++;
        continue;
      }

      let xmlBytes: Uint8Array | null = null;
      if (n.xml_storage_path) xmlBytes = await downloadFromStorage(n.xml_storage_path);
      if (!xmlBytes && n.ref) xmlBytes = await downloadXmlFromFocus(n.ref, n.company_id, n.ambiente);
      if (!xmlBytes && n.xml_url) {
        try {
          const token = await getFocusToken(n.company_id, n.ambiente);
          xmlBytes = await downloadFile(
            n.xml_url,
            token ? { Authorization: basicAuth(token) } : undefined,
          );
        } catch {}
      }
      if (!xmlBytes) {
        missing++;
        failed++;
        continue;
      }

      await uploadFile({
        accessToken: creds.accessToken,
        parentId: contabFolderId,
        name: fileName,
        mimeType: "application/xml",
        data: xmlBytes,
      });
      ok++;
    } catch (e) {
      console.warn("[backfill-contabilidade] falha nota", n.id, e);
      failed++;
    }
  }

  return { processed, ok, skipped, failed, missing };
}



/**
 * Testa a conexão com o Google Drive: renova token se preciso, valida a
 * pasta-raiz e conta arquivos acessíveis.
 */
export async function testDriveConnection(companyId: string): Promise<{
  ok: boolean;
  message: string;
  email?: string | null;
  rootFolderName?: string;
  filesVisible?: number;
}> {
  const creds = await getValidAccessToken(companyId);
  if (!creds) {
    return {
      ok: false,
      message:
        "Sem credenciais válidas: conta não conectada, integração desativada ou refresh_token ausente. Reconecte o Google Drive.",
    };
  }
  let email: string | null = null;
  try {
    email = await fetchUserEmail(creds.accessToken);
  } catch {
    email = null;
  }
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?` +
      new URLSearchParams({
        q: `'${creds.rootFolderId}' in parents and trashed=false`,
        fields: "files(id,name)",
        pageSize: "10",
      }).toString(),
    { headers: { Authorization: `Bearer ${creds.accessToken}` } },
  );
  if (!res.ok) {
    const txt = await res.text();
    return {
      ok: false,
      message: `Falha ao acessar a pasta-raiz no Drive (${res.status}): ${txt.slice(0, 200)}`,
      email,
      rootFolderName: creds.rootFolderName,
    };
  }
  const json = (await res.json()) as { files?: Array<{ id: string }> };
  return {
    ok: true,
    message: "Conexão OK: token válido e pasta-raiz acessível.",
    email,
    rootFolderName: creds.rootFolderName,
    filesVisible: json.files?.length ?? 0,
  };
}
