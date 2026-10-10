import { createServerFn } from "@tanstack/react-start";

function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://torts-autopecas.vercel.app";
}

export const testFocusNfeWebhook = createServerFn({ method: "POST" })
  .inputValidator((input: { target?: "prod" | "preview" } | undefined) => input ?? {})
  .handler(async ({ data }) => {
    const secret =
      process.env.FOCUS_NFE_WEBHOOK_SECRET || "torts-fiscal-focus-nfe-sec-2026";

    const baseUrl = getAppBaseUrl();
    const webhookUrl = `${baseUrl}/api/public/focus-nfe?secret=${encodeURIComponent(secret)}`;

    const testPayload = {
      cnpj_emitente: "00000000000000",
      ref: "test_ref_123",
      status: "autorizado",
      status_sefaz: "100",
      mensagem_sefaz: "Autorizado o uso da NF-e",
      chave_nfe: "NFe000000000000000000000000000000000000000",
      numero: "1",
      serie: "1",
      protocolo: "000000000000000",
      caminho_xml_nota_fiscal: "/arquivos/00000000000000/202301/XMLs/000000000000000000000000000000000000000-nfe.xml",
      caminho_danfe: "/arquivos/00000000000000/202301/DANFEs/000000000000000000000000000000000000000.pdf",
    };

    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(testPayload),
      });

      let body: string | object;
      const text = await response.text();
      try {
        body = text ? JSON.parse(text) : "";
      } catch {
        body = text;
      }

      return {
        status: response.status,
        statusText: response.statusText,
        body,
        url: webhookUrl.replace(secret, "***"),
      };
    } catch (err) {
      return {
        status: 0,
        statusText: "fetch failed",
        body: err instanceof Error ? err.message : String(err),
        url: webhookUrl.replace(secret, "***"),
      };
    }
  });

// ─────────────────────────────────────────────────────────────────────────────
// Registrar/sincronizar webhook na Focus NFe (ambientes homologação e produção)
// ─────────────────────────────────────────────────────────────────────────────

type Ambiente = "homologacao" | "producao";

function focusBaseUrl(amb: Ambiente) {
  return amb === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

function basicAuth(token: string) {
  return "Basic " + btoa(`${token}:`);
}

type HookRow = {
  ambiente: Ambiente;
  baseUrl: string;
  ok: boolean;
  action: "created" | "exists" | "error";
  http?: number;
  hookId?: string;
  url?: string;
  event?: string;
  error?: string;
};

async function syncOneAmbiente(opts: {
  ambiente: Ambiente;
  token: string;
  webhookUrl: string;
  event: string;
}): Promise<HookRow> {
  const base = focusBaseUrl(opts.ambiente);
  const auth = basicAuth(opts.token);
  // 1) Lista hooks existentes
  const listRes = await fetch(`${base}/v2/hooks`, {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  const listTxt = await listRes.text();
  if (!listRes.ok) {
    return {
      ambiente: opts.ambiente,
      baseUrl: base,
      ok: false,
      action: "error",
      http: listRes.status,
      error: `Falha ao listar hooks: ${listTxt.slice(0, 300)}`,
    };
  }
  let list: Array<{ id?: string; url?: string; event?: string }> = [];
  try {
    const parsed = JSON.parse(listTxt);
    list = Array.isArray(parsed) ? parsed : [];
  } catch {
    list = [];
  }
  const existing = list.find(
    (h) => h?.event === opts.event && h?.url === opts.webhookUrl,
  );
  if (existing) {
    return {
      ambiente: opts.ambiente,
      baseUrl: base,
      ok: true,
      action: "exists",
      hookId: existing.id,
      url: existing.url,
      event: existing.event,
    };
  }

  // 2) Cria
  const createRes = await fetch(`${base}/v2/hooks`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ event: opts.event, url: opts.webhookUrl }),
  });
  const createTxt = await createRes.text();
  let createBody: { id?: string; url?: string; event?: string } | string;
  try { createBody = JSON.parse(createTxt); } catch { createBody = createTxt; }
  if (!createRes.ok) {
    return {
      ambiente: opts.ambiente,
      baseUrl: base,
      ok: false,
      action: "error",
      http: createRes.status,
      error: typeof createBody === "string" ? createBody.slice(0, 300) : JSON.stringify(createBody).slice(0, 300),
    };
  }
  const created = typeof createBody === "object" ? createBody : {};
  return {
    ambiente: opts.ambiente,
    baseUrl: base,
    ok: true,
    action: "created",
    http: createRes.status,
    hookId: created.id,
    url: created.url,
    event: created.event,
  };
}

export const syncFocusNfeWebhooks = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      tokenHomologacao?: string | null;
      tokenProducao?: string | null;
      event?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const secret =
      process.env.FOCUS_NFE_WEBHOOK_SECRET || "torts-fiscal-focus-nfe-sec-2026";

    const webhookUrl = `${getAppBaseUrl()}/api/public/focus-nfe?secret=${encodeURIComponent(secret)}`;
    const event = data.event || "nfe";

    const results: HookRow[] = [];
    const fallbackToken = process.env.FOCUS_NFE_TOKEN || "";

    const homTok = (data.tokenHomologacao || fallbackToken || "").trim();
    const prodTok = (data.tokenProducao || fallbackToken || "").trim();

    if (homTok) {
      try {
        results.push(await syncOneAmbiente({ ambiente: "homologacao", token: homTok, webhookUrl, event }));
      } catch (e) {
        results.push({ ambiente: "homologacao", baseUrl: focusBaseUrl("homologacao"), ok: false, action: "error", error: e instanceof Error ? e.message : String(e) });
      }
    } else {
      results.push({ ambiente: "homologacao", baseUrl: focusBaseUrl("homologacao"), ok: false, action: "error", error: "Token de homologação não informado" });
    }

    if (prodTok) {
      try {
        results.push(await syncOneAmbiente({ ambiente: "producao", token: prodTok, webhookUrl, event }));
      } catch (e) {
        results.push({ ambiente: "producao", baseUrl: focusBaseUrl("producao"), ok: false, action: "error", error: e instanceof Error ? e.message : String(e) });
      }
    } else {
      results.push({ ambiente: "producao", baseUrl: focusBaseUrl("producao"), ok: false, action: "error", error: "Token de produção não informado" });
    }

    return { webhookUrl: webhookUrl.replace(secret, "***"), event, results };
  });
