import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type LookupResult = {
  found: boolean;
  ncm?: string;
  description?: string;
  reason?: string;
  source?: "company" | "ai" | "lovable";
};

const PROMPT = (categoryName: string) => `Você é um especialista em classificação fiscal brasileira (NCM/SH).
Categoria de produto (autopeças/varejo): "${categoryName}".

Retorne APENAS um JSON válido no formato:
{"ncm":"00000000","description":"descrição oficial curta","confidence":"high|medium|low"}

Regras:
- O NCM deve ter exatamente 8 dígitos (sem pontos).
- Se a categoria for ambígua ou genérica demais para indicar um NCM exato, retorne {"ncm":null,"description":null,"confidence":"low"}.
- Não invente. Prefira null a chutar.`;

type ChatCall = {
  url: string;
  authHeader: string;
  modelId: string;
};

async function validateNcmBrasilApi(ncm: string): Promise<{ ok: boolean; description?: string }> {
  try {
    const formatted = `${ncm.slice(0, 4)}.${ncm.slice(4, 6)}.${ncm.slice(6, 8)}`;
    const res = await fetch(`https://brasilapi.com.br/api/ncm/v1/${formatted}`);
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { descricao?: string };
    return { ok: true, description: json?.descricao };
  } catch {
    return { ok: false };
  }
}

async function searchNcmBrasilApi(query: string): Promise<{ ncm?: string; description?: string }> {
  try {
    const res = await fetch(`https://brasilapi.com.br/api/ncm/v1?search=${encodeURIComponent(query)}`);
    if (!res.ok) return {};
    const list = (await res.json()) as Array<{ codigo?: string; descricao?: string }>;
    for (const item of list ?? []) {
      const digits = (item.codigo ?? "").replace(/\D/g, "");
      if (digits.length === 8) return { ncm: digits, description: item.descricao };
    }
    return {};
  } catch {
    return {};
  }
}

async function resolveValidNcm(candidate: string | undefined, query: string): Promise<{ ncm?: string; description?: string }> {
  const digits = (candidate ?? "").replace(/\D/g, "");
  if (digits.length === 8) {
    const v = await validateNcmBrasilApi(digits);
    if (v.ok) return { ncm: digits, description: v.description };
  }
  return await searchNcmBrasilApi(query);
}

async function callChatCompletion(
  { url, authHeader, modelId }: ChatCall,
  categoryName: string,
): Promise<LookupResult> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: "Responda apenas com JSON válido, sem markdown." },
        { role: "user", content: PROMPT(categoryName) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (res.status === 429) return { found: false, reason: "Muitas requisições. Tente novamente em instantes." };
  if (res.status === 402) return { found: false, reason: "Créditos de IA esgotados." };
  if (res.status === 401) return { found: false, reason: "Token da integração inválido. Revise em Configurações." };
  if (!res.ok) return { found: false, reason: `Falha na consulta (${res.status}).` };

  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = json.choices?.[0]?.message?.content ?? "";
  let parsed: { ncm?: string | null; description?: string | null; confidence?: string };
  try {
    parsed = JSON.parse(content);
  } catch {
    return { found: false, reason: "Não foi possível interpretar a resposta da IA." };
  }

  const rawNcm = (parsed.ncm ?? "").toString().replace(/\D/g, "");
  const resolved = await resolveValidNcm(rawNcm, categoryName);
  if (!resolved.ncm) {
    return {
      found: false,
      reason:
        "NCM não validado na tabela TIPI. Revise o nome da categoria ou informe o NCM manualmente.",
    };
  }
  return { found: true, ncm: resolved.ncm, description: resolved.description ?? parsed.description?.toString() ?? undefined };
}

async function callN8nWebhook(webhookUrl: string, categoryName: string): Promise<LookupResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: categoryName, type: "ncm_lookup" }),
    });
    if (!res.ok) return { found: false, reason: `Webhook retornou ${res.status}.` };
    const data = (await res.json().catch(() => ({}))) as { ncm?: string; description?: string };
    const rawNcm = (data?.ncm ?? "").toString().replace(/\D/g, "");
    const resolved = await resolveValidNcm(rawNcm, categoryName);
    if (!resolved.ncm) {
      return {
        found: false,
        reason: "NCM retornado pelo webhook não consta na tabela TIPI.",
      };
    }
    return { found: true, ncm: resolved.ncm, description: resolved.description ?? data?.description };
  } catch (e) {
    return {
      found: false,
      reason: e instanceof Error ? e.message : "Falha ao chamar o webhook.",
    };
  }
}

export const lookupNcmByCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const data = input as { categoryName?: string; companyId?: string };
    const name = (data?.categoryName ?? "").toString().trim();
    if (!name) throw new Error("Informe o nome da categoria");
    if (name.length > 120) throw new Error("Nome muito longo");
    return { categoryName: name, companyId: data?.companyId?.toString() };
  })
  .handler(async ({ data, context }): Promise<LookupResult> => {
    const { supabase } = context;

    // 1) Tenta usar a integração configurada da empresa (se habilitada, validada e ativa)
    if (data.companyId) {
      const { data: settings } = await supabase
        .from("company_settings")
        .select("ai_enabled, ai_model, ai_connection_validated")
        .eq("company_id", data.companyId)
        .maybeSingle();

      if (settings?.ai_enabled && settings?.ai_connection_validated && settings?.ai_model) {
        const { data: tokenRow } = await (supabase.rpc as any)("get_company_ai_token", {
          _company: data.companyId,
        });
        const token = (tokenRow ?? "").toString().trim();

        if (token) {
          const model = settings.ai_model as string;
          let result: LookupResult | null = null;

          if (model === "custom/n8n-webhook") {
            result = await callN8nWebhook(token, data.categoryName);
          } else if (model.startsWith("openai/") && !model.includes("transcribe") && !model.includes("whisper")) {
            const modelId = model.replace(/^openai\//, "");
            result = await callChatCompletion(
              {
                url: "https://api.openai.com/v1/chat/completions",
                authHeader: `Bearer ${token}`,
                modelId,
              },
              data.categoryName,
            );
          } else if (model.startsWith("google/")) {
            const googleKey = token;
            const modelName = model.replace(/^google\//, "") || "gemini-1.5-flash";
            result = await callChatCompletion(
              {
                url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
                authHeader: `Bearer ${googleKey}`,
                modelId: modelName,
              },
              data.categoryName,
            );
          }

          if (result) return { ...result, source: "company" };
        }
      }
    }

    // 2) Fallback: Provedor de IA configurado no ambiente
    const apiKey =
      process.env.OPENAI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.LOVABLE_API_KEY;

    if (!apiKey) {
      return {
        found: false,
        reason:
          "Nenhuma integração de IA ativa e nenhuma chave de API configurada. Habilite e teste a IA em Configurações > Integrações.",
      };
    }

    const isGemini = Boolean(process.env.GEMINI_API_KEY);
    const endpoint = isGemini
      ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
      : process.env.OPENAI_API_KEY
        ? "https://api.openai.com/v1/chat/completions"
        : "https://ai.gateway.lovable.dev/v1/chat/completions";
    const modelId = isGemini ? "gemini-1.5-flash" : "gpt-4o-mini";

    const r = await callChatCompletion(
      {
        url: endpoint,
        authHeader: `Bearer ${apiKey}`,
        modelId,
      },
      data.categoryName,
    );
    return { ...r, source: "ai" };
  });
