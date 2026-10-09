import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { FileSpreadsheet, ShieldCheck, MapPin, Printer, KeyRound, Webhook, CheckCircle2, XCircle, AlertCircle, ChevronDown, History } from "lucide-react";
import { maskCpfCnpj } from "@/lib/masks";
import { useServerFn } from "@tanstack/react-start";
import { testFocusNfeWebhook, syncFocusNfeWebhooks } from "@/lib/fiscal-settings.functions";
import { FiscalNotesHistoryPanel } from "@/components/fiscal-notes-history-panel";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

function Section({
  icon,
  title,
  description,
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-left hover:bg-accent/30 transition-colors"
        >
          <div className="size-9 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center shrink-0">
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold leading-tight">{title}</h3>
            {description && (
              <p className="text-xs text-muted-foreground truncate">{description}</p>
            )}
          </div>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        {children}
      </CollapsibleContent>

    </Collapsible>
  );
}


type FiscalSettings = {
  company_id: string;
  razao_social: string | null;
  cnpj: string | null;
  ie: string | null;
  im: string | null;
  cnae: string | null;
  regime: string | null;
  regime_tributario: number | null;
  crt: number | null;
  endereco: string | null;
  endereco_logradouro: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
  endereco_bairro: string | null;
  municipio: string | null;
  cod_municipio_ibge: string | null;
  uf: string | null;
  cep: string | null;
  telefone: string | null;
  email: string | null;
  csc: string | null;
  csc_id: string | null;
  serie_nfce: number | null;
  proximo_numero_nfce: number | null;
  ambiente: string | null;
  nfce_ativa: boolean | null;
  impressora_modelo: string | null;
  focus_company_token: string | null;
  focus_token_homologacao: string | null;
  focus_token_producao: string | null;
  certificado_validade: string | null;
  auto_print_nfce: boolean | null;
};

function cleanFocusToken(token?: string | null) {
  return (token ?? "").replace(/\s+/g, "").trim() || null;
}


const UF_LIST = [
  "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB",
  "PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
];

export function FiscalSettingsTab() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();

  const fiscalQ = useQuery({
    queryKey: ["fiscal-settings-full", cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_settings")
        .select("*")
        .eq("company_id", cid)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as FiscalSettings | null;
    },
    enabled: !!cid,
  });

  const [form, setForm] = useState<Partial<FiscalSettings>>({});

  useEffect(() => {
    if (fiscalQ.data) {
      setForm(fiscalQ.data);
    } else if (fiscalQ.isSuccess) {
      setForm({
        ambiente: "homologacao",
        regime_tributario: 1,
        crt: 1,
        uf: "MG",
        serie_nfce: 1,
        proximo_numero_nfce: 1,
        impressora_modelo: "80mm",
        nfce_ativa: false,
      });
    }
  }, [fiscalQ.data, fiscalQ.isSuccess]);

  const set = <K extends keyof FiscalSettings>(k: K, v: FiscalSettings[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const [cepLoading, setCepLoading] = useState(false);
  const lookupCep = async (digits: string) => {
    try {
      setCepLoading(true);
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data?.erro) {
        toast.error("CEP não encontrado");
        return;
      }
      setForm((p) => ({
        ...p,
        endereco_logradouro: data.logradouro || p.endereco_logradouro || "",
        endereco_bairro: data.bairro || p.endereco_bairro || "",
        endereco_complemento: data.complemento || p.endereco_complemento || "",
        municipio: data.localidade || p.municipio || "",
        uf: data.uf || p.uf || "MG",
        cod_municipio_ibge: data.ibge || p.cod_municipio_ibge || "",
      }));
    } catch {
      toast.error("Falha ao consultar CEP");
    } finally {
      setCepLoading(false);
    }
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const ambienteAtual = form.ambiente ?? "homologacao";
      const legacyToken = cleanFocusToken(form.focus_company_token);
      const homToken =
        cleanFocusToken(form.focus_token_homologacao) ??
        (ambienteAtual === "homologacao" ? legacyToken : null);
      const prodToken =
        cleanFocusToken(form.focus_token_producao) ??
        (ambienteAtual === "producao" ? legacyToken : null);
      const payload = {
        company_id: cid,
        razao_social: form.razao_social ?? null,
        cnpj: (form.cnpj ?? "").replace(/\D/g, "") || null,
        ie: form.ie ?? null,
        im: form.im ?? null,
        cnae: form.cnae ?? null,
        regime: form.regime ?? null,
        regime_tributario: form.regime_tributario ?? 1,
        crt: form.crt ?? 1,
        endereco_logradouro: form.endereco_logradouro ?? null,
        endereco_numero: form.endereco_numero ?? null,
        endereco_complemento: form.endereco_complemento ?? null,
        endereco_bairro: form.endereco_bairro ?? null,
        municipio: form.municipio ?? null,
        cod_municipio_ibge: (form.cod_municipio_ibge ?? "").replace(/\D/g, "") || null,
        uf: form.uf ?? "MG",
        cep: (form.cep ?? "").replace(/\D/g, "") || null,
        telefone: (form.telefone ?? "").replace(/\D/g, "") || null,
        email: form.email ?? null,
        csc: form.csc ?? null,
        csc_id: form.csc_id ?? null,
        serie_nfce: Number(form.serie_nfce ?? 1),
        proximo_numero_nfce: Number(form.proximo_numero_nfce ?? 1),
        ambiente: ambienteAtual,
        nfce_ativa: !!form.nfce_ativa,
        impressora_modelo: form.impressora_modelo ?? "80mm",
        focus_company_token: legacyToken,
        focus_token_homologacao: homToken,
        focus_token_producao: prodToken,
        certificado_validade: form.certificado_validade || null,
        auto_print_nfce: !!form.auto_print_nfce,
        updated_at: new Date().toISOString(),

      };
      const { data, error } = await (supabase.from("fiscal_settings") as any)
        .upsert(payload, { onConflict: "company_id" })
        .select("*")
        .single();
      if (error) throw error;
      return data as FiscalSettings;
    },
    onSuccess: (data) => {
      setForm(data);
      toast.success("Configurações fiscais salvas");
      qc.invalidateQueries({ queryKey: ["fiscal-settings-full", cid] });
      qc.invalidateQueries({ queryKey: ["fiscal-settings", cid] });
    },
    onError: (e: any) => toast.error(e.message || "Erro ao salvar"),
  });

  const [webhookTestResult, setWebhookTestResult] = useState<{
    status: number;
    statusText: string;
    body: string | object;
    url: string;
  } | null>(null);

  const testWebhookFn = useServerFn(testFocusNfeWebhook);

  const webhookTestMut = useMutation({
    mutationFn: async () => testWebhookFn({}),
    onSuccess: (data) => {
      setWebhookTestResult(data);
      toast.success(`Webhook testado — HTTP ${data.status}`);
    },
    onError: (e: any) => {
      toast.error(e.message || "Erro ao testar webhook");
      setWebhookTestResult(null);
    },
  });

  const syncWebhooksFn = useServerFn(syncFocusNfeWebhooks);
  const [syncResult, setSyncResult] = useState<Awaited<ReturnType<typeof syncWebhooksFn>> | null>(null);
  const syncWebhooksMut = useMutation({
    mutationFn: async (vars: { tokenHomologacao?: string; tokenProducao?: string }) => {
      const data = await syncWebhooksFn({ data: vars });
      // Persiste tokens informados em fiscal_settings para o download de XML/DANFE usar o ambiente certo
      const homTok = cleanFocusToken(vars.tokenHomologacao);
      const prodTok = cleanFocusToken(vars.tokenProducao);
      const patch: Record<string, any> = { updated_at: new Date().toISOString() };
      if (homTok) patch.focus_token_homologacao = homTok;
      if (prodTok) patch.focus_token_producao = prodTok;
      if (homTok || prodTok) {
        const { data: saved } = await (supabase.from("fiscal_settings") as any)
          .upsert({ company_id: cid, ...patch }, { onConflict: "company_id" })
          .select("*")
          .single();
        if (saved) setForm(saved as FiscalSettings);
        qc.invalidateQueries({ queryKey: ["fiscal-settings", cid] });
      }
      return data;
    },
    onSuccess: (data) => {
      setSyncResult(data);
      const failed = data.results.filter((r) => !r.ok);
      if (failed.length === 0) toast.success("Webhooks sincronizados e tokens salvos");
      else toast.error(`Falha em ${failed.length} ambiente(s) — veja detalhes abaixo`);
    },
    onError: (e: any) => toast.error(e.message || "Erro ao sincronizar webhooks"),
  });

  if (fiscalQ.isLoading) {
    return <Card className="p-10 text-center text-muted-foreground">Carregando…</Card>;
  }

  return (
    <div className="max-w-5xl space-y-3">
      {/* Status / Ambiente */}
      <Section
        icon={<ShieldCheck className="size-5" />}
        title="Emissão NFC-e"
        description="Ative para começar a emitir cupom fiscal eletrônico via Focus NFe"
      >
        <Card className="p-6">
          <div className="flex items-center justify-between rounded-lg border p-4 mb-6">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">NFC-e ativa</Label>
              <p className="text-xs text-muted-foreground">
                Liga/desliga a emissão de cupom fiscal para esta empresa.
              </p>
            </div>
            <Switch
              checked={!!form.nfce_ativa}
              onCheckedChange={(v) => set("nfce_ativa", v)}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Ambiente</Label>
              <Select
                value={form.ambiente ?? "homologacao"}
                onValueChange={(v) => set("ambiente", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="homologacao">Homologação (testes)</SelectItem>
                  <SelectItem value="producao">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Regime tributário</Label>
              <Select
                value={String(form.regime_tributario ?? 1)}
                onValueChange={(v) => set("regime_tributario", Number(v))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Simples Nacional</SelectItem>
                  <SelectItem value="2">Simples — excesso</SelectItem>
                  <SelectItem value="3">Regime Normal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>CRT</Label>
              <Select
                value={String(form.crt ?? 1)}
                onValueChange={(v) => set("crt", Number(v))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 — Simples Nacional</SelectItem>
                  <SelectItem value="2">2 — Simples (excesso)</SelectItem>
                  <SelectItem value="3">3 — Regime Normal</SelectItem>
                  <SelectItem value="4">4 — MEI</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            A impressão automática do cupom fiscal acontece na finalização da venda, conforme as
            formas de pagamento marcadas para emissão automática em Formas de Pagamento.
          </p>

        </Card>
      </Section>



      {/* Dados fiscais */}
      <Section
        icon={<FileSpreadsheet className="size-5" />}
        title="Dados Fiscais"
        description="Informações obrigatórias para emissão do cupom"
      >
        <Card className="p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>Razão Social *</Label>
              <Input
                value={form.razao_social ?? ""}
                onChange={(e) => set("razao_social", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>CNPJ *</Label>
              <Input
                value={maskCpfCnpj(form.cnpj ?? "")}
                onChange={(e) => set("cnpj", maskCpfCnpj(e.target.value))}
                placeholder="00.000.000/0000-00"
                maxLength={18}
              />
            </div>
            <div className="space-y-2">
              <Label>Inscrição Estadual (IE) *</Label>
              <Input value={form.ie ?? ""} onChange={(e) => set("ie", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Inscrição Municipal (IM)</Label>
              <Input value={form.im ?? ""} onChange={(e) => set("im", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>CNAE principal</Label>
              <Input
                value={form.cnae ?? ""}
                onChange={(e) => set("cnae", e.target.value)}
                placeholder="0000000"
                maxLength={7}
              />
            </div>
          </div>
        </Card>
      </Section>

      {/* Endereço */}
      <Section
        icon={<MapPin className="size-5" />}
        title="Endereço do Estabelecimento"
        description="Endereço impresso no DANFCe (deve bater com o cadastro na SEFAZ)"
      >
        <Card className="p-6">
          <div className="grid gap-4 md:grid-cols-6">
            <div className="space-y-2 md:col-span-2">
              <Label>CEP</Label>
              <Input
                value={form.cep ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  set("cep", v);
                  const digits = v.replace(/\D/g, "");
                  if (digits.length === 8) lookupCep(digits);
                }}
                onBlur={(e) => {
                  const digits = e.target.value.replace(/\D/g, "");
                  if (digits.length === 8) lookupCep(digits);
                }}
                placeholder="00000-000"
                maxLength={9}
                disabled={cepLoading}
              />
            </div>
            <div className="space-y-2 md:col-span-4">
              <Label>Logradouro</Label>
              <Input
                value={form.endereco_logradouro ?? ""}
                onChange={(e) => set("endereco_logradouro", e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label>Número</Label>
              <Input
                value={form.endereco_numero ?? ""}
                onChange={(e) => set("endereco_numero", e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Complemento</Label>
              <Input
                value={form.endereco_complemento ?? ""}
                onChange={(e) => set("endereco_complemento", e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Bairro</Label>
              <Input
                value={form.endereco_bairro ?? ""}
                onChange={(e) => set("endereco_bairro", e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Município</Label>
              <Input
                value={form.municipio ?? ""}
                onChange={(e) => set("municipio", e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Cód. IBGE</Label>
              <Input
                value={form.cod_municipio_ibge ?? ""}
                onChange={(e) => set("cod_municipio_ibge", e.target.value)}
                placeholder="7 dígitos"
                maxLength={7}
              />
            </div>
            <div className="space-y-2 md:col-span-1">
              <Label>UF</Label>
              <Select value={form.uf ?? "MG"} onValueChange={(v) => set("uf", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UF_LIST.map((u) => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>Telefone</Label>
              <Input
                value={form.telefone ?? ""}
                onChange={(e) => set("telefone", e.target.value)}
              />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
          </div>
        </Card>
      </Section>

      {/* CSC + Numeração */}
      <Section
        icon={<KeyRound className="size-5" />}
        title="Credenciais SEFAZ & Numeração"
        description={`CSC obtido no portal SEFAZ-${form.uf || "UF"}. Numeração controlada localmente.`}
      >
        <Card className="p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>CSC ID</Label>
              <Input
                value={form.csc_id ?? ""}
                onChange={(e) => set("csc_id", e.target.value)}
                placeholder="Ex: 000001"
              />
            </div>
            <div className="space-y-2">
              <Label>CSC (Token)</Label>
              <Input
                type="password"
                value={form.csc ?? ""}
                onChange={(e) => set("csc", e.target.value)}
                placeholder="36 caracteres"
              />
            </div>
            <div className="space-y-2">
              <Label>Série NFC-e</Label>
              <Input
                type="number"
                value={form.serie_nfce ?? 1}
                onChange={(e) => set("serie_nfce", Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label>Próximo número</Label>
              <Input
                type="number"
                value={form.proximo_numero_nfce ?? 1}
                onChange={(e) => set("proximo_numero_nfce", Number(e.target.value))}
              />
            </div>
            <Separator className="md:col-span-2" />
            <div className="space-y-2 md:col-span-2">
              <Label>Token Focus NFe — Homologação</Label>
              <Input
                type="password"
                value={form.focus_token_homologacao ?? ""}
                onChange={(e) => set("focus_token_homologacao", e.target.value)}
                placeholder="Token de homologação da empresa na Focus NFe"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Usado para emitir/consultar/baixar DANFE de notas no ambiente de homologação.
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Token Focus NFe — Produção</Label>
              <Input
                type="password"
                value={form.focus_token_producao ?? ""}
                onChange={(e) => set("focus_token_producao", e.target.value)}
                placeholder="Token de produção da empresa na Focus NFe"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Usado para emitir/consultar/baixar DANFE de notas no ambiente de produção.
              </p>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label>Token Focus NFe (legado / fallback)</Label>
              <Input
                type="password"
                value={form.focus_company_token ?? ""}
                onChange={(e) => set("focus_company_token", e.target.value)}
                placeholder="Deixe vazio para usar os tokens por ambiente acima ou o token global do sistema"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                Opcional. Mantido para compatibilidade. Os campos por ambiente acima têm prioridade.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Validade do certificado A1</Label>
              <Input
                type="date"
                value={form.certificado_validade ?? ""}
                onChange={(e) => set("certificado_validade", e.target.value)}
              />
            </div>
          </div>
        </Card>
      </Section>

      {/* Checklist de prontidão */}
      <Section
        icon={<CheckCircle2 className="size-5" />}
        title="Checklist de prontidão"
        description="Confira o que falta para emitir NFC-e em cada ambiente"
      >
        <ReadinessChecklist form={form} />
      </Section>

      {/* Teste Webhook */}
      <Section
        icon={<Webhook className="size-5" />}
        title="Webhook Focus NFe"
        description="Teste e cadastre o endpoint que recebe atualizações de status"
      >
        <Card className="p-6">
          <div className="flex items-center justify-end mb-4">
            <Button
              variant="outline"
              size="sm"
              onClick={() => webhookTestMut.mutate()}
              disabled={webhookTestMut.isPending}
            >
              {webhookTestMut.isPending ? "Testando…" : "Testar Webhook"}
            </Button>
          </div>

          {webhookTestResult && (
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center gap-3">
                {webhookTestResult.status === 200 ? (
                  <CheckCircle2 className="size-5 text-green-500" />
                ) : webhookTestResult.status === 404 ? (
                  <AlertCircle className="size-5 text-amber-500" />
                ) : (
                  <XCircle className="size-5 text-red-500" />
                )}
                <div>
                  <p className="text-sm font-medium">
                    HTTP {webhookTestResult.status} — {webhookTestResult.statusText}
                  </p>
                  <p className="text-xs text-muted-foreground font-mono break-all">
                    {webhookTestResult.url}
                  </p>
                </div>
              </div>
              <div className="rounded bg-muted p-3">
                <pre className="text-xs overflow-auto whitespace-pre-wrap font-mono">
                  {typeof webhookTestResult.body === "string"
                    ? webhookTestResult.body
                    : JSON.stringify(webhookTestResult.body, null, 2)}
                </pre>
              </div>
              {webhookTestResult.status === 404 && (
                <p className="text-xs text-muted-foreground">
                  404 é o comportamento esperado ao usar uma referência de teste inexistente — confirma que o webhook está autenticando e processando corretamente.
                </p>
              )}
            </div>
          )}

          <Separator className="my-6" />

          <RegisterWebhookSection
            syncing={syncWebhooksMut.isPending}
            onSync={(vars: { tokenHomologacao?: string; tokenProducao?: string }) => syncWebhooksMut.mutate(vars)}
            result={syncResult}
            defaultHomToken={
              form.focus_token_homologacao
              ?? (form.ambiente === "homologacao" ? form.focus_company_token : null)
              ?? ""
            }
            defaultProdToken={
              form.focus_token_producao
              ?? (form.ambiente === "producao" ? form.focus_company_token : null)
              ?? ""
            }
          />
        </Card>
      </Section>

      {/* Impressão */}
      <Section
        icon={<Printer className="size-5" />}
        title="Impressão do DANFCe"
        description="Modelo de impressora padrão"
      >
        <Card className="p-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Modelo de impressora</Label>
              <Select
                value={form.impressora_modelo ?? "80mm"}
                onValueChange={(v) => set("impressora_modelo", v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="80mm">Térmica 80mm</SelectItem>
                  <SelectItem value="58mm">Térmica 58mm</SelectItem>
                  <SelectItem value="a4">A4 (laser/jato)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>
      </Section>

      <Section
        icon={<History className="size-5" />}
        title="Histórico de NFC-e"
        description="Notas emitidas, status e ações"
      >
        <FiscalNotesHistoryPanel companyId={cid} />
      </Section>

      <div className="flex justify-end gap-2 sticky bottom-0 bg-background/80 backdrop-blur py-3">
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? "Salvando…" : "Salvar configurações fiscais"}
        </Button>
      </div>
    </div>
  );
}


type ChecklistItem = { label: string; ok: boolean; hint?: string };

function ReadinessChecklist({ form }: { form: Partial<FiscalSettings> }) {
  const has = (v: unknown) => typeof v === "string" ? v.trim().length > 0 : v != null && v !== "";
  const cnpjOk = (form.cnpj ?? "").replace(/\D/g, "").length === 14;
  const cepOk = (form.cep ?? "").replace(/\D/g, "").length === 8;
  const ibgeOk = (form.cod_municipio_ibge ?? "").replace(/\D/g, "").length === 7;
  const certOk = !!form.certificado_validade && new Date(form.certificado_validade) > new Date();
  const credsOk = has(form.csc) && has(form.csc_id);

  const common: ChecklistItem[] = [
    { label: "Razão Social", ok: has(form.razao_social) },
    { label: "CNPJ válido (14 dígitos)", ok: cnpjOk },
    { label: "Inscrição Estadual (IE)", ok: has(form.ie) },
    { label: "Regime tributário e CRT", ok: !!form.regime_tributario && !!form.crt },
    { label: "Endereço (logradouro, número, bairro)", ok: has(form.endereco_logradouro) && has(form.endereco_numero) && has(form.endereco_bairro) },
    { label: "Município + UF", ok: has(form.municipio) && has(form.uf) },
    { label: "CEP válido (8 dígitos)", ok: cepOk },
    { label: "Código IBGE do município (7 dígitos)", ok: ibgeOk },
    { label: "Série e próximo número da NFC-e", ok: !!form.serie_nfce && !!form.proximo_numero_nfce },
    { label: "Certificado A1 válido (no Focus NFe)", ok: certOk, hint: "Informe a data de validade após enviar o certificado no painel Focus NFe." },
  ];

  const homolog: ChecklistItem[] = [
    ...common,
    { label: "CSC + CSC ID de Homologação", ok: credsOk && form.ambiente === "homologacao", hint: "Os campos atuais devem conter o CSC do ambiente selecionado." },
    { label: "Ambiente atual = Homologação", ok: form.ambiente === "homologacao" },
  ];

  const producao: ChecklistItem[] = [
    ...common,
    { label: "CSC + CSC ID de Produção", ok: credsOk && form.ambiente === "producao", hint: "Os campos atuais devem conter o CSC do ambiente selecionado." },
    { label: "Ambiente atual = Produção", ok: form.ambiente === "producao" },
    { label: "NFC-e ativada", ok: !!form.nfce_ativa },
  ];

  const renderList = (items: ChecklistItem[]) => {
    const missing = items.filter((i) => !i.ok).length;
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm">
          {missing === 0 ? (
            <><CheckCircle2 className="size-4 text-green-500" /><span className="font-medium text-green-700">Pronto para emitir</span></>
          ) : (
            <><AlertCircle className="size-4 text-amber-500" /><span className="font-medium text-amber-700">{missing} pendência{missing > 1 ? "s" : ""}</span></>
          )}
        </div>
        <ul className="space-y-1.5 text-sm">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-2">
              {i.ok ? (
                <CheckCircle2 className="size-4 text-green-500 mt-0.5 shrink-0" />
              ) : (
                <XCircle className="size-4 text-red-500 mt-0.5 shrink-0" />
              )}
              <span className={i.ok ? "text-foreground" : "text-muted-foreground"}>
                {i.label}
                {!i.ok && i.hint && <span className="block text-xs text-muted-foreground/80">{i.hint}</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="size-10 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center">
          <CheckCircle2 className="size-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold">Checklist de prontidão</h3>
          <p className="text-sm text-muted-foreground">
            Confira o que falta para emitir NFC-e em cada ambiente. CSC e ID Token são distintos por ambiente — preencha o do ambiente que você quer usar.
          </p>
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h4 className="font-semibold mb-3">Homologação (testes)</h4>
          {renderList(homolog)}
        </div>
        <div className="rounded-lg border p-4">
          <h4 className="font-semibold mb-3">Produção (fiscal real)</h4>
          {renderList(producao)}
        </div>
      </div>
    </Card>
  );
}

type SyncResult = {
  webhookUrl: string;
  event: string;
  results: Array<{
    ambiente: "homologacao" | "producao";
    baseUrl: string;
    ok: boolean;
    action: "created" | "exists" | "error";
    http?: number;
    hookId?: string;
    url?: string;
    event?: string;
    error?: string;
  }>;
};

function RegisterWebhookSection(props: {
  syncing: boolean;
  onSync: (vars: { tokenHomologacao?: string; tokenProducao?: string }) => void;
  result: SyncResult | null;
  defaultHomToken: string;
  defaultProdToken: string;
}) {
  const [homTok, setHomTok] = useState(props.defaultHomToken);
  const [prodTok, setProdTok] = useState(props.defaultProdToken);

  useEffect(() => { if (props.defaultHomToken) setHomTok(props.defaultHomToken); }, [props.defaultHomToken]);
  useEffect(() => { if (props.defaultProdToken) setProdTok(props.defaultProdToken); }, [props.defaultProdToken]);

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold text-sm">Cadastrar webhook na Focus NFe</h4>
        <p className="text-xs text-muted-foreground">
          Registra o mesmo endpoint nos ambientes de <strong>homologação</strong> e <strong>produção</strong> da Focus. Cada ambiente tem um token próprio — informe os dois para sincronizar de uma vez. Se o webhook já existir com a mesma URL, não duplica.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Token Focus — Homologação</Label>
          <Input
            type="password"
            value={homTok}
            onChange={(e) => setHomTok(e.target.value)}
            placeholder="token de homologação"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label>Token Focus — Produção</Label>
          <Input
            type="password"
            value={prodTok}
            onChange={(e) => setProdTok(e.target.value)}
            placeholder="token de produção"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          disabled={props.syncing || (!homTok && !prodTok)}
          onClick={() =>
            props.onSync({
              tokenHomologacao: homTok || undefined,
              tokenProducao: prodTok || undefined,
            })
          }
        >
          {props.syncing ? "Sincronizando…" : "Sincronizar webhooks"}
        </Button>
      </div>

      {props.result && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-mono break-all">
            URL: {props.result.webhookUrl} · evento: {props.result.event}
          </p>
          <div className="grid gap-2 md:grid-cols-2">
            {props.result.results.map((r) => (
              <div key={r.ambiente} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {r.ok ? (
                    <CheckCircle2 className="size-4 text-green-500" />
                  ) : (
                    <XCircle className="size-4 text-red-500" />
                  )}
                  <span className="capitalize">{r.ambiente}</span>
                  <span className="text-xs text-muted-foreground">
                    {r.action === "created" && "criado"}
                    {r.action === "exists" && "já existia"}
                    {r.action === "error" && "erro"}
                    {r.http ? ` · HTTP ${r.http}` : ""}
                  </span>
                </div>
                {r.hookId && (
                  <p className="text-xs text-muted-foreground font-mono">id: {r.hookId}</p>
                )}
                {r.error && (
                  <p className="text-xs text-red-600 break-all">{r.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
