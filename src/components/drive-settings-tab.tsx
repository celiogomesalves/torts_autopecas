import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Cloud,
  CheckCircle2,
  ExternalLink,
  Loader2,
  AlertCircle,
  FolderTree,
  PlugZap,
  Key,
  Copy,
  Eye,
  EyeOff,
  ShieldCheck,
  Mail,
  HelpCircle,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import {
  getDriveStatus,
  getDriveAuthUrl,
  updateDriveSettings,
  disconnectDrive,
  runDriveCheckNow,
  backfillContabilidade,
  testDriveConnectionFn,
} from "@/lib/google-drive.functions";

export function DriveSettingsTab({ companyId }: { companyId: string | null }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const status = useServerFn(getDriveStatus);
  const authUrl = useServerFn(getDriveAuthUrl);
  const update = useServerFn(updateDriveSettings);
  const disconnect = useServerFn(disconnectDrive);
  const runNow = useServerFn(runDriveCheckNow);
  const backfill = useServerFn(backfillContabilidade);
  const testConn = useServerFn(testDriveConnectionFn);

  const q = useQuery({
    queryKey: ["drive-status", companyId],
    enabled: !!companyId,
    queryFn: () => status({ data: { companyId: companyId! } }),
  });

  const [folderName, setFolderName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [dailyCheckEnabled, setDailyCheckEnabled] = useState(true);
  const [dailyCheckHour, setDailyCheckHour] = useState(23);
  const [backfillStart, setBackfillStart] = useState("2026-06-01");
  const [backfillEnd, setBackfillEnd] = useState("2026-06-30");

  // Credenciais Google OAuth
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [copiedDriveUri, setCopiedDriveUri] = useState(false);
  const [copiedGmailUri, setCopiedGmailUri] = useState(false);

  useEffect(() => {
    if (q.data) {
      setFolderName(q.data.rootFolderName ?? "Notas Fiscais");
      setEnabled(q.data.enabled);
      setDailyCheckEnabled((q.data as any).dailyCheckEnabled ?? true);
      setDailyCheckHour((q.data as any).dailyCheckHour ?? 23);
      if ((q.data as any).googleClientId && (q.data as any).googleClientId !== "Configurado no Servidor (.env)") {
        setGoogleClientId((q.data as any).googleClientId);
      }
    }
  }, [q.data]);

  // Toast de retorno do OAuth callback
  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const st = u.searchParams.get("drive_status");
    const msg = u.searchParams.get("drive_message");
    if (st === "ok") toast.success(msg || "Google Drive conectado com sucesso!");
    if (st === "error") toast.error(msg || "Falha ao conectar Google Drive");
    if (st) {
      u.searchParams.delete("drive_status");
      u.searchParams.delete("drive_message");
      window.history.replaceState({}, "", u.toString());
      qc.invalidateQueries({ queryKey: ["drive-status", companyId] });
    }
  }, [companyId, qc]);

  const connect = useMutation({
    mutationFn: async () => {
      const hasCreds = (q.data as any)?.hasGoogleCredentials || (googleClientId.trim() && googleClientSecret.trim());
      if (!hasCreds) {
        throw new Error("Configure e salve o Client ID e Client Secret do Google antes de conectar a conta.");
      }
      const origin = typeof window !== "undefined" ? window.location.origin : null;
      const r = await authUrl({ data: { companyId: companyId!, origin } });
      window.location.href = r.url;
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao iniciar conexão com Google"),
  });

  const saveCredentials = useMutation({
    mutationFn: () => {
      if (!googleClientId.trim()) {
        throw new Error("Informe o Google Client ID");
      }
      return update({
        data: {
          companyId: companyId!,
          googleClientId: googleClientId.trim(),
          googleClientSecret: googleClientSecret.trim() ? googleClientSecret.trim() : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Credenciais do Google salvas com sucesso!");
      setGoogleClientSecret(""); // limpa o campo sensível da memória
      qc.invalidateQueries({ queryKey: ["drive-status", companyId] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar credenciais"),
  });

  const saveSettings = useMutation({
    mutationFn: () =>
      update({
        data: {
          companyId: companyId!,
          enabled,
          rootFolderName: folderName,
          dailyCheckEnabled,
          dailyCheckHour,
          googleClientId: googleClientId.trim() ? googleClientId.trim() : undefined,
          googleClientSecret: googleClientSecret.trim() ? googleClientSecret.trim() : undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["drive-status", companyId] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao salvar"),
  });

  const doDisconnect = useMutation({
    mutationFn: () => disconnect({ data: { companyId: companyId! } }),
    onSuccess: () => {
      toast.success("Drive desconectado");
      qc.invalidateQueries({ queryKey: ["drive-status", companyId] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao desconectar"),
  });

  const doRunNow = useMutation({
    mutationFn: () => runNow({ data: { companyId: companyId! } }),
    onSuccess: (r: any) => {
      if (r.cashRegisters === 0) {
        toast.success("Nenhum caixa fechado neste mês.");
      } else if (r.processed === 0) {
        toast.success(
          `${r.cashRegisters} caixa(s) verificados — nenhuma NFC-e autorizada.`,
        );
      } else if (r.reuploaded === 0 && r.failed === 0) {
        toast.success(
          `Tudo certo: ${r.processed} nota(s) de ${r.cashRegisters} caixa(s) já estão no Drive.`,
        );
      } else {
        toast.success(
          `Verificação concluída: ${r.reuploaded} reenviada(s), ${r.failed} falha(s) de ${r.processed} (em ${r.cashRegisters} caixa(s)).`,
        );
      }
      qc.invalidateQueries({ queryKey: ["drive-status", companyId] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao executar verificação"),
  });

  const doBackfill = useMutation({
    mutationFn: () =>
      backfill({
        data: { companyId: companyId!, startDate: backfillStart, endDate: backfillEnd },
      }),
    onSuccess: (r: any) => {
      toast.success(
        `Contabilidade: ${r.ok} nova(s), ${r.skipped ?? 0} já existia(m), ${r.failed} falha(s)${r.missing ? ` (${r.missing} sem XML)` : ""} de ${r.processed} nota(s).`,
      );
    },
    onError: (e: any) => toast.error(e?.message || "Erro no backfill"),
  });

  const doTest = useMutation({
    mutationFn: () => testConn({ data: { companyId: companyId! } }),
    onSuccess: (r: any) => {
      if (r.ok) {
        toast.success(
          `${r.message} Conta: ${r.email || "—"} · Pasta: ${r.rootFolderName || "—"}`,
        );
      } else {
        toast.error(r.message);
      }
      qc.invalidateQueries({ queryKey: ["drive-status", companyId] });
    },
    onError: (e: any) => toast.error(e?.message || "Erro ao testar conexão"),
  });

  if (!companyId) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Selecione uma empresa.
        </CardContent>
      </Card>
    );
  }

  if (q.isLoading) {
    return (
      <Card>
        <CardContent className="py-10 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando…
        </CardContent>
      </Card>
    );
  }

  const connected = !!q.data?.connected;
  const hasCredentials = !!(q.data as any)?.hasGoogleCredentials;
  const isEnvConfigured = !!(q.data as any)?.isConfiguredViaEnv;

  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "https://torts-autopecas.vercel.app";
  const driveCallbackUri = `${currentOrigin}/api/public/google-drive/callback`;
  const gmailCallbackUri = `${currentOrigin}/api/public/gmail/callback`;

  const copyToClipboard = (text: string, type: "drive" | "gmail") => {
    navigator.clipboard.writeText(text);
    if (type === "drive") {
      setCopiedDriveUri(true);
      setTimeout(() => setCopiedDriveUri(false), 2000);
    } else {
      setCopiedGmailUri(true);
      setTimeout(() => setCopiedGmailUri(false), 2000);
    }
    toast.success("URI copiada para a área de transferência!");
  };

  return (
    <div className="space-y-6">
      {/* ─── CARD 1: CREDENCIAIS GOOGLE OAUTH 2.0 ──────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Key className="size-5 text-primary" /> Credenciais Google OAuth 2.0
              </CardTitle>
              <CardDescription>
                Configure o Client ID e Client Secret do Google Cloud. Estas mesmas credenciais habilitam tanto o{" "}
                <span className="font-semibold text-foreground">Google Drive</span> (arquivamento de notas fiscais) quanto o{" "}
                <span className="font-semibold text-foreground">Gmail</span> (envio de e-mails para contabilidade e clientes).
              </CardDescription>
            </div>
            {hasCredentials ? (
              <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                <ShieldCheck className="size-3" />
                {isEnvConfigured ? "Credenciais (.env)" : "Credenciais Ativas"}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-amber-500 text-amber-500 gap-1">
                <AlertCircle className="size-3" /> Não Configurado
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="googleClientId" className="text-sm font-medium">
                Google Client ID
              </Label>
              <Input
                id="googleClientId"
                value={googleClientId}
                onChange={(e) => setGoogleClientId(e.target.value)}
                placeholder="Ex.: 123456789-abc.apps.googleusercontent.com"
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Identificador público da sua aplicação no Google Cloud Console.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="googleClientSecret" className="text-sm font-medium">
                Google Client Secret
              </Label>
              <div className="relative">
                <Input
                  id="googleClientSecret"
                  type={showSecret ? "text" : "password"}
                  value={googleClientSecret}
                  onChange={(e) => setGoogleClientSecret(e.target.value)}
                  placeholder={hasCredentials ? "•••••••••••••••••••• (salvo - preencha para alterar)" : "Cole a chave secreta aqui"}
                  className="font-mono text-xs pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Chave secreta gerada junto ao Client ID. Fica armazenada de forma segura.
              </p>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              onClick={() => saveCredentials.mutate()}
              disabled={saveCredentials.isPending}
              variant="default"
              className="gap-2"
            >
              {saveCredentials.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Key className="size-4" />
              )}
              Salvar Credenciais do Google
            </Button>
          </div>

          {/* Guia de Configuração no Google Cloud Console */}
          <div className="rounded-lg border bg-muted/40 p-4 space-y-3 mt-4 text-sm">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <HelpCircle className="size-4 text-primary" />
              <span>Como configurar no Google Cloud Console:</span>
            </div>
            <ol className="list-decimal list-inside space-y-1.5 text-xs text-muted-foreground leading-relaxed pl-1">
              <li>
                Acesse o{" "}
                <a
                  href="https://console.cloud.google.com/apis/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary underline font-medium hover:text-primary/80 inline-flex items-center gap-1"
                >
                  Google Cloud Console <ExternalLink className="size-3 inline" />
                </a>{" "}
                e crie ou selecione o projeto da empresa.
              </li>
              <li>
                Vá em <strong>APIs e Serviços &gt; Biblioteca</strong> e ative a{" "}
                <span className="font-semibold text-foreground">Google Drive API</span> e a{" "}
                <span className="font-semibold text-foreground">Gmail API</span>.
              </li>
              <li>
                Em <strong>Tela de consentimento OAuth</strong>, configure como <em>Externo</em> e adicione os usuários autorizados.
              </li>
              <li>
                Em <strong>Credenciais &gt; Criar Credenciais &gt; ID do cliente OAuth</strong>, selecione o tipo{" "}
                <em>Aplicativo da Web</em>.
              </li>
              <li>
                No campo <strong>URIs de redirecionamento autorizados</strong>, adicione as seguintes URLs:
              </li>
            </ol>

            <div className="space-y-2 pt-2">
              <div className="rounded border bg-background/80 p-2.5 flex items-center justify-between gap-2">
                <div className="truncate">
                  <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Cloud className="size-3 text-sky-500" /> Redirecionamento Google Drive:
                  </div>
                  <div className="font-mono text-xs select-all truncate text-foreground">{driveCallbackUri}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-8 gap-1.5"
                  onClick={() => copyToClipboard(driveCallbackUri, "drive")}
                >
                  {copiedDriveUri ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                  {copiedDriveUri ? "Copiado" : "Copiar"}
                </Button>
              </div>

              <div className="rounded border bg-background/80 p-2.5 flex items-center justify-between gap-2">
                <div className="truncate">
                  <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <Mail className="size-3 text-red-500" /> Redirecionamento Gmail:
                  </div>
                  <div className="font-mono text-xs select-all truncate text-foreground">{gmailCallbackUri}</div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-8 gap-1.5"
                  onClick={() => copyToClipboard(gmailCallbackUri, "gmail")}
                >
                  {copiedGmailUri ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
                  {copiedGmailUri ? "Copiado" : "Copiar"}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── CARD 2: CONEXÃO E OPERAÇÃO DO GOOGLE DRIVE ───────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Cloud className="size-5 text-sky-500" /> Integração Google Drive
              </CardTitle>
              <CardDescription>
                Arquive automaticamente o XML das NFC-e autorizadas em pastas organizadas no Drive da empresa.
              </CardDescription>
            </div>
            {connected ? (
              <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle2 className="size-3" /> Conta Conectada
              </Badge>
            ) : (
              <Badge variant="outline">Desconectado</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {!connected && (
            <div className="rounded-md border bg-muted/30 p-4 space-y-3">
              <div className="flex items-start gap-2 text-sm">
                <AlertCircle className="size-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="font-medium">Conecte a conta Google da empresa</p>
                  <p className="text-xs text-muted-foreground">
                    O sistema só enxerga as pastas e arquivos que ele mesmo criar (escopo
                    <span className="font-mono"> drive.file</span>). Os arquivos de notas fiscais ficam salvos na conta que
                    você autorizar.
                  </p>
                </div>
              </div>
              <Button
                onClick={() => connect.mutate()}
                disabled={connect.isPending}
                className="gap-2"
              >
                {connect.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ExternalLink className="size-4" />
                )}
                Conectar Conta Google Drive
              </Button>
            </div>
          )}

          {connected && (
            <div className="rounded-md border p-4 space-y-1 text-sm bg-emerald-500/5 border-emerald-500/20">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Conta conectada:</span>
                <span className="font-semibold text-foreground">{q.data?.email || "—"}</span>
              </div>
              {q.data?.connectedAt && (
                <div className="text-xs text-muted-foreground">
                  Conectado em {new Date(q.data.connectedAt).toLocaleString("pt-BR")}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label className="text-sm">Pasta-raiz no Drive</Label>
            <Input
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder="Ex.: Notas Fiscais - Torque"
            />
            <p className="text-xs text-muted-foreground">
              Pasta criada na raiz da conta conectada. Renomear aqui só afeta as próximas pastas
              criadas — a já existente continua com o nome anterior.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Envio automático ao autorizar NFC-e</p>
              <p className="text-xs text-muted-foreground">
                Quando desligado, você ainda pode reenviar manualmente pelo histórico de notas fiscais.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Verificação diária automática</p>
                <p className="text-xs text-muted-foreground">
                  No horário escolhido, percorre todos os caixas fechados do mês
                  corrente e reenvia ao Drive os XMLs que estiverem faltando.
                </p>
              </div>
              <Switch
                checked={dailyCheckEnabled}
                onCheckedChange={setDailyCheckEnabled}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Executar às</Label>
              <select
                className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
                value={dailyCheckHour}
                disabled={!dailyCheckEnabled}
                onChange={(e) => setDailyCheckHour(Number(e.target.value))}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">(horário de Brasília)</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t">
              <p className="text-xs text-muted-foreground">
                Quer adiantar? Roda agora para todos os caixas fechados do mês.
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={!connected || doRunNow.isPending}
                onClick={() =>
                  confirm({
                    title: "Executar verificação agora?",
                    description:
                      "Vou percorrer todos os caixas fechados do mês corrente e reenviar ao Drive os XMLs que estiverem faltando. Pode levar alguns segundos.",
                    confirmLabel: "Executar agora",
                  }).then((ok) => ok && doRunNow.mutate())
                }
              >
                {doRunNow.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                Verificar agora
              </Button>
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-3">
            <div>
              <p className="text-sm font-medium">Backfill pasta “Contabilidade”</p>
              <p className="text-xs text-muted-foreground">
                Copia para <code>&lt;mês&gt;/Contabilidade/</code> todos os XMLs das
                NFC-e autorizadas no período selecionado. Idempotente (arquivos com mesmo nome são substituídos).
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Início</Label>
                <Input
                  type="date"
                  value={backfillStart}
                  onChange={(e) => setBackfillStart(e.target.value)}
                  className="h-9 w-[160px]"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fim</Label>
                <Input
                  type="date"
                  value={backfillEnd}
                  onChange={(e) => setBackfillEnd(e.target.value)}
                  className="h-9 w-[160px]"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!connected || doBackfill.isPending}
                onClick={() =>
                  confirm({
                    title: "Copiar XMLs para Contabilidade?",
                    description: `Vou copiar para a pasta Contabilidade de cada mês todos os XMLs das NFC-e autorizadas entre ${backfillStart} e ${backfillEnd}.`,
                    confirmLabel: "Copiar agora",
                  }).then((ok) => ok && doBackfill.mutate())
                }
              >
                {doBackfill.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                Copiar para Contabilidade
              </Button>
            </div>
          </div>

          <div className="rounded-md border p-3 bg-muted/20 text-xs">
            <div className="flex items-center gap-1 mb-2 text-muted-foreground">
              <FolderTree className="size-3" /> Estrutura de pastas no Google Drive
            </div>
            <pre className="font-mono text-[11px] leading-5 text-foreground/80">
{`${folderName || "Notas Fiscais"}/
└── 2026-06-01 a 2026-06-30/
    └── 2026-06-26 - Caixa #3/
        └── NFe-000123-1-Venda000456.xml`}
            </pre>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => doTest.mutate()}
              disabled={!connected || doTest.isPending}
            >
              {doTest.isPending ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <PlugZap className="size-4 mr-2" />
              )}
              Testar conexão
            </Button>
            <Button onClick={() => saveSettings.mutate()} disabled={saveSettings.isPending}>
              {saveSettings.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              Salvar configurações do Drive
            </Button>
            {connected && (
              <Button
                variant="outline"
                onClick={() =>
                  confirm({
                    title: "Desconectar Google Drive?",
                    description:
                      "As próximas notas não serão enviadas automaticamente. Os arquivos já enviados permanecem no Drive.",
                    confirmLabel: "Desconectar",
                    variant: "destructive",
                  }).then((ok) => ok && doDisconnect.mutate())
                }
                disabled={doDisconnect.isPending}
              >
                {doDisconnect.isPending && <Loader2 className="size-4 mr-2 animate-spin" />}
                Desconectar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
