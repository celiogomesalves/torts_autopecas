import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
import { EmailAccountCard } from "@/components/email-account-card";
import { getEmailAccountStatus } from "@/lib/gmail.functions";
import {
  buildAccountingEmailBody,
  buildAccountingEmailBodyHtml,
  buildAccountingEmailSubject,
} from "@/lib/accounting-email";

export type AccountingContact = {
  name: string;
  email: string;
  emails: string[];
  senderName: string;
  webhookUrl: string;
  includePdf: boolean;
  nfeAutoSend: boolean;
  nfeWebhookUrl: string;
};

export function useAccountingContact(companyId: string) {
  return useQuery({
    queryKey: ["accounting-contact", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<AccountingContact> => {
      const empty: AccountingContact = {
        name: "",
        email: "",
        emails: [],
        senderName: "",
        webhookUrl: "",
        includePdf: true,
        nfeAutoSend: false,
        nfeWebhookUrl: "",
      };
      const { data, error } = await (supabase as any)
        .from("company_settings")
        .select(
          "accounting_name, accounting_email, accounting_emails, accounting_sender_name, accounting_webhook_url, accounting_include_pdf, accounting_nfe_auto_send, accounting_nfe_webhook_url",
        )
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) return empty;
      const list: string[] = Array.isArray(data?.accounting_emails)
        ? (data.accounting_emails as string[])
        : [];
      const primary = (data?.accounting_email as string) ?? "";
      return {
        name: (data?.accounting_name as string) ?? "",
        email: primary,
        emails: list.length ? list : primary ? [primary] : [],
        senderName: (data?.accounting_sender_name as string) ?? "",
        webhookUrl: (data?.accounting_webhook_url as string) ?? "",
        includePdf: (data?.accounting_include_pdf as boolean) ?? true,
        nfeAutoSend: (data?.accounting_nfe_auto_send as boolean) ?? false,
        nfeWebhookUrl: (data?.accounting_nfe_webhook_url as string) ?? "",
      };
    },
  });
}


export function AccountingSettings({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data: companyName = "" } = useQuery({
    queryKey: ["accounting-company-name", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("companies")
        .select("name")
        .eq("id", companyId)
        .maybeSingle();
      return (data?.name as string) ?? "";
    },
  });
  const { data, isLoading } = useAccountingContact(companyId);
  // Remetente vem da conta de e-mail conectada (fonte única)
  const emailStatus = useServerFn(getEmailAccountStatus);
  const { data: emailAccount } = useQuery({
    queryKey: ["email-account", companyId],
    enabled: !!companyId,
    queryFn: () => emailStatus({ data: { companyId } }),
  });
  const senderName = (emailAccount?.senderName ?? "").trim();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [saving, setSaving] = useState(false);

  // Disparo manual — período por mês/ano
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);

  const years = useMemo(
    () => Array.from({ length: 6 }, (_, i) => currentYear - i),
    [currentYear],
  );
  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];
  const maxMonth = year === currentYear ? currentMonth : 12;

  useEffect(() => {
    if (month > maxMonth) setMonth(maxMonth);
  }, [maxMonth, month]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const from = `${year}-${pad(month)}-01`;
  const to = `${year}-${pad(month)}-${pad(new Date(year, month, 0).getDate())}`;

  const [format, setFormat] = useState<"pdf" | "pdf_base64" | "json">("pdf_base64");
  const [paymentMethods, setPaymentMethods] = useState("");
  const [paymentMethodIds, setPaymentMethodIds] = useState("");
  const [includePdf, setIncludePdf] = useState(true);
  const [nfeWebhookUrl, setNfeWebhookUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (data) {
      setName(data.name);
      setEmail(data.emails.join(", "));
      setWebhookUrl(data.webhookUrl);
      setIncludePdf(data.includePdf);
      setNfeWebhookUrl(data.nfeWebhookUrl);
    }
  }, [data]);

  const emailList = useMemo(
    () =>
      email
        .split(/[,;\n]/)
        .map((e) => e.trim())
        .filter(Boolean),
    [email],
  );
  const isEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const invalidEmails = emailList.filter((e) => !isEmail(e));
  const emailValid = emailList.length > 0 && invalidEmails.length === 0;
  const urlValid = /^https?:\/\/.+/i.test(webhookUrl.trim());
  const nfeUrlValid = !nfeWebhookUrl.trim() || /^https?:\/\/.+/i.test(nfeWebhookUrl.trim());

  const canTrigger = useMemo(
    () =>
      !!companyId &&
      name.trim().length > 0 &&
      emailValid &&
      urlValid &&
      !!from &&
      !!to &&
      from <= to,
    [companyId, name, emailValid, urlValid, from, to],
  );

  const save = async () => {
    if (emailList.length > 0 && !emailValid) {
      toast.error(`E-mail inválido: ${invalidEmails.join(", ")}`);
      return;
    }
    if (webhookUrl.trim() && !urlValid) {
      toast.error("Informe uma URL de webhook válida (http/https)");
      return;
    }
    if (!nfeUrlValid) {
      toast.error("Informe uma URL válida para o webhook da nota fiscal");
      return;
    }
    setSaving(true);
    const { error } = await (supabase as any).from("company_settings").upsert(
      {
        company_id: companyId,
        accounting_name: name.trim() || null,
        accounting_email: emailList[0] ?? null,
        accounting_emails: emailList,
        accounting_sender_name: senderName || null,
        accounting_webhook_url: webhookUrl.trim() || null,
        accounting_include_pdf: includePdf,
        accounting_nfe_webhook_url: nfeWebhookUrl.trim() || null,
      },
      { onConflict: "company_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    qc.invalidateQueries({ queryKey: ["accounting-contact", companyId] });
    toast.success("Dados da contabilidade salvos");
  };


  const trigger = async () => {
    if (!canTrigger) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }
    setSending(true);
    setResult(null);
    const emailSubject = buildAccountingEmailSubject(companyName, from, to);
    const emailParams = {
      recipientName: name.trim(),
      from,
      to,
      companyName,
      senderName: senderName.trim() || companyName,
      includePdf,
    };
    const emailBody = buildAccountingEmailBody(emailParams);
    const emailBodyHtml = buildAccountingEmailBodyHtml(emailParams);
    const payload = {
      companyId,
      from,
      to,
      period: `${from} a ${to}`,
      // Sem PDF, o formato enviado é json para o endpoint não inferir PDF
      format: includePdf ? format : "json",
      paymentMethods: paymentMethods
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      paymentMethodIds: paymentMethodIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      includePdf,
      accounting: { name: name.trim(), email: emailList[0] ?? "", emails: emailList, senderName: senderName.trim() || companyName },
      accountingName: name.trim(),
      accountingEmail: emailList.join(", "),
      accountingEmails: emailList,
      senderName: senderName.trim() || companyName,
      companyName,
      emailSubject,
      emailBody,
      emailBodyHtml,
      triggeredAt: new Date().toISOString(),
      source: "manual",
    };
    // Headers HTTP só aceitam ASCII: mandamos o texto legível quando possível
    // e sempre uma variante base64 (UTF-8) para o n8n decodificar.
    const b64 = (s: string) =>
      btoa(String.fromCharCode(...new TextEncoder().encode(s)));
    const ascii = (s: string) => (/^[\x20-\x7E]*$/.test(s) ? s : "");
    try {
      const res = await fetch(webhookUrl.trim(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-period": `${from} a ${to}`,
          "x-accounting-name": ascii(name.trim()),
          "x-accounting-name-b64": b64(name.trim()),
          "x-accounting-email": emailList.join(","),
          "x-include-pdf": includePdf ? "1" : "0",
          "x-email-subject": ascii(emailSubject),
          "x-email-subject-b64": b64(emailSubject),
          "x-email-body-b64": b64(emailBody),
          "x-email-body-html-b64": b64(emailBodyHtml),
          "x-sender-name": ascii(senderName.trim() || companyName),
          "x-sender-name-b64": b64(senderName.trim() || companyName),
        },
        body: JSON.stringify(payload),
      });


      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* resposta não-JSON */
      }
      setResult({ ok: res.ok, text: pretty || `HTTP ${res.status}` });
      if (res.ok) toast.success("Webhook executado");
      else toast.error(`Webhook retornou HTTP ${res.status}`);
    } catch (e: any) {
      setResult({ ok: false, text: e?.message ?? "Falha ao chamar o webhook" });
      toast.error("Falha ao chamar o webhook");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

      <Card className="p-4 sm:p-6 w-full space-y-4 overflow-hidden">
        <div>
          <h3 className="font-semibold">Contabilidade</h3>
          <p className="text-sm text-muted-foreground">
            Responsável que receberá os relatórios enviados pelo sistema.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="acc-name">Nome *</Label>
            <Input
              id="acc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome do contador ou escritório"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="acc-email">E-mails *</Label>
            <Input
              id="acc-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contabilidade@exemplo.com, fiscal@exemplo.com"
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Separe vários destinatários por vírgula ou ponto e vírgula.
            </p>
            {invalidEmails.length > 0 && (
              <p className="text-xs text-destructive">
                Inválido(s): {invalidEmails.join(", ")}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="acc-webhook">URL do webhook do n8n *</Label>
          <Input
            id="acc-webhook"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder="https://n8n.exemplo.com/webhook/relatorio-contabilidade"
            disabled={isLoading}
          />
          <p className="text-xs text-muted-foreground">
            Usada para antecipar a execução do fluxo agendado.
          </p>
        </div>

        <p className="text-xs text-muted-foreground border-t pt-4">
          O nome do remetente e o envio automático da nota fiscal são configurados no
          card da conta de e-mail ao lado.
        </p>

      </Card>

      {companyId && <EmailAccountCard companyId={companyId} />}



      <Card className="p-4 sm:p-6 w-full space-y-4 overflow-hidden">
        <div>
          <h3 className="font-semibold">Antecipar execução</h3>
          <p className="text-sm text-muted-foreground">
            Dispara agora o fluxo do n8n que normalmente roda por agendamento.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="min-w-0 space-y-1">
            <Label className="text-xs">Mês *</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {monthNames.map((m, i) => (
                <option key={m} value={i + 1} disabled={i + 1 > maxMonth}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-xs">Ano *</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground truncate">
              Período: {from} a {to}
            </p>
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-xs">Formato *</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={format}
              onChange={(e) => setFormat(e.target.value as typeof format)}
            >
              <option value="pdf">PDF (binário)</option>
              <option value="pdf_base64">PDF (base64 em JSON)</option>
              <option value="json">JSON (dados)</option>
            </select>
          </div>
          <div className="min-w-0 space-y-1">
            <Label className="text-xs leading-tight block truncate" title="Formas de pagamento (nomes, por vírgula)">
              Formas de pagamento
            </Label>
            <Input
              placeholder="opcional — vazio = todas"
              value={paymentMethods}
              onChange={(e) => setPaymentMethods(e.target.value)}
            />
          </div>
          <div className="min-w-0 space-y-1 sm:col-span-2 xl:col-span-4">
            <Label className="text-xs">IDs das formas de pagamento (mais preciso)</Label>
            <Input
              placeholder="opcional — uuid1, uuid2"
              value={paymentMethodIds}
              onChange={(e) => setPaymentMethodIds(e.target.value)}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={includePdf}
              onCheckedChange={(v) => setIncludePdf(v === true)}
            />
            Enviar relatório de vendas em PDF
          </label>
        </div>



        <div className="flex items-center gap-3">
          <Button onClick={trigger} disabled={!canTrigger || sending}>
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Executar agora
          </Button>
          {!canTrigger && (
            <span className="text-xs text-muted-foreground">
              Nome, e-mail, webhook e período são obrigatórios.
            </span>
          )}
        </div>

        {result && (
          <div className="space-y-1">
            <Label className="text-xs uppercase text-muted-foreground">
              Retorno do webhook — {result.ok ? "sucesso" : "falha"}
            </Label>
            <pre
              className={`bg-muted p-2 rounded text-xs overflow-auto max-h-64 ${
                result.ok ? "" : "text-destructive"
              }`}
            >
              {result.text}
            </pre>
          </div>
        )}
      </Card>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={saving || isLoading}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Salvar
        </Button>
      </div>
    </div>
  );

}
