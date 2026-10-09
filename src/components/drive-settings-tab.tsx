import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Cloud, CheckCircle2, ExternalLink, Loader2, AlertCircle, FolderTree, PlugZap } from "lucide-react";
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


  useEffect(() => {
    if (q.data) {
      setFolderName(q.data.rootFolderName ?? "Notas Fiscais");
      setEnabled(q.data.enabled);
      setDailyCheckEnabled((q.data as any).dailyCheckEnabled ?? true);
      setDailyCheckHour((q.data as any).dailyCheckHour ?? 23);
    }
  }, [q.data]);

  // Toast de retorno do OAuth callback
  useEffect(() => {
    if (typeof window === "undefined") return;
    const u = new URL(window.location.href);
    const st = u.searchParams.get("drive_status");
    const msg = u.searchParams.get("drive_message");
    if (st === "ok") toast.success(msg || "Google Drive conectado");
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
      const origin = typeof window !== "undefined" ? window.location.origin : null;
      const r = await authUrl({ data: { companyId: companyId!, origin } });
      window.location.href = r.url;
    },
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="size-5" /> Google Drive
            </CardTitle>
            <CardDescription>
              Arquive automaticamente o XML das NFC-e autorizadas no Drive da empresa.
            </CardDescription>
          </div>
          {connected ? (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="size-3" /> Conectado
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
                <p className="font-medium">Conecte uma conta Google</p>
                <p className="text-xs text-muted-foreground">
                  O sistema só enxerga as pastas e arquivos que ele mesmo criar (escopo
                  <span className="font-mono"> drive.file</span>). Os arquivos ficam na conta que
                  você autorizar.
                </p>
              </div>
            </div>
            <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
              {connect.isPending ? (
                <Loader2 className="size-4 mr-2 animate-spin" />
              ) : (
                <ExternalLink className="size-4 mr-2" />
              )}
              Conectar Google Drive
            </Button>
          </div>
        )}

        {connected && (
          <div className="rounded-md border p-4 space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Conta:</span>
              <span className="font-medium">{q.data?.email || "—"}</span>
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
              Quando desligado, você ainda pode reenviar manualmente pelo histórico.
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
              NFC-e autorizadas no período. Idempotente (arquivos com mesmo nome
              são substituídos).
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
            <FolderTree className="size-3" /> Estrutura de pastas
          </div>
          <pre className="font-mono text-[11px] leading-5">
{`${folderName || "Notas Fiscais"}/
└── 2026-06-01 a 2026-06-30/
    └── 2026-06-26 - Caixa #3/
        └── NFe-000123-1-Venda000456.xml`}
          </pre>
        </div>

        <div className="flex flex-wrap gap-2">
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
            Salvar configurações
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
  );
}
