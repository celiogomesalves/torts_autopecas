import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Mail, Plug, Send, Unplug } from "lucide-react";
import {
  getEmailAccountStatus,
  getEmailAuthUrl,
  saveEmailSenderName,
  disconnectEmailAccount,
  sendTestEmail,
  setNfeAutoSend,
} from "@/lib/gmail.functions";
import { useConfirm } from "@/components/confirm-dialog";

export function EmailAccountCard({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const status = useServerFn(getEmailAccountStatus);
  const authUrl = useServerFn(getEmailAuthUrl);
  const saveSender = useServerFn(saveEmailSenderName);
  const disconnect = useServerFn(disconnectEmailAccount);
  const sendTest = useServerFn(sendTestEmail);
  const setAutoSend = useServerFn(setNfeAutoSend);

  const { data, isLoading } = useQuery({
    queryKey: ["email-account", companyId],
    enabled: !!companyId,
    queryFn: () => status({ data: { companyId } }),
  });

  const [senderName, setSenderName] = useState("");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState<null | "connect" | "save" | "test" | "disconnect" | "autosend">(null);

  useEffect(() => {
    if (data?.senderName) setSenderName(data.senderName);
  }, [data?.senderName]);

  // Feedback do retorno do OAuth
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const st = p.get("email_status");
    if (!st) return;
    const msg = p.get("email_message") ?? "";
    if (st === "ok") toast.success(msg || "Conta de e-mail conectada");
    else toast.error(msg || "Falha ao conectar a conta de e-mail");
    p.delete("email_status");
    p.delete("email_message");
    window.history.replaceState({}, "", `${window.location.pathname}?${p.toString()}`);
    qc.invalidateQueries({ queryKey: ["email-account", companyId] });
  }, [companyId, qc]);

  const connect = async () => {
    setBusy("connect");
    try {
      const res = await authUrl({ data: { companyId, origin: window.location.origin } });
      window.location.href = res.url;
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao iniciar a conexão");
      setBusy(null);
    }
  };

  return (
    <Card className="p-4 sm:p-6 w-full space-y-4 overflow-hidden">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Mail className="h-4 w-4" /> Conta de envio de e-mail
          </h3>
          <p className="text-sm text-muted-foreground">
            O próprio sistema envia os e-mails (nota fiscal e relatórios) por esta conta Google.
          </p>
        </div>
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : data?.connected ? (
          <Badge variant="secondary">Conectada</Badge>
        ) : (
          <Badge variant="outline">Desconectada</Badge>
        )}
      </div>

      {data?.connected && (
        <p className="text-sm">
          Remetente: <strong>{data.email}</strong>
        </p>
      )}

      <div className="space-y-2">
        <Label htmlFor="email-sender">Nome de exibição do remetente</Label>
        <Input
          id="email-sender"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          placeholder="Ex.: Torque Autopeças"
          disabled={isLoading}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={async () => {
            setBusy("save");
            try {
              await saveSender({ data: { companyId, senderName } });
              toast.success("Nome do remetente salvo");
              qc.invalidateQueries({ queryKey: ["email-account", companyId] });
            } catch (e: any) {
              toast.error(e?.message ?? "Falha ao salvar");
            } finally {
              setBusy(null);
            }
          }}
        >
          {busy === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar remetente"}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button onClick={connect} disabled={busy !== null} title="Autorizar a conta Google que enviará os e-mails">
          {busy === "connect" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plug className="h-4 w-4" />
          )}
          {data?.connected ? "Reconectar" : "Conectar conta Google"}
        </Button>

        {data?.connected && (
          <Button
            variant="outline"
            disabled={busy !== null}
            title="Remove a autorização desta conta"
            onClick={async () => {
              const ok = await confirm({
                title: "Desconectar conta de e-mail?",
                description: "Os envios automáticos deixarão de funcionar até reconectar.",
                confirmLabel: "Desconectar",
                variant: "destructive",
              });
              if (!ok) return;
              setBusy("disconnect");
              try {
                await disconnect({ data: { companyId } });
                toast.success("Conta desconectada");
                qc.invalidateQueries({ queryKey: ["email-account", companyId] });
              } catch (e: any) {
                toast.error(e?.message ?? "Falha ao desconectar");
              } finally {
                setBusy(null);
              }
            }}
          >
            <Unplug className="h-4 w-4" /> Desconectar
          </Button>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <label
          className="flex items-center gap-2 text-sm"
          title={data?.connected ? "Envia XML e PDF da NFC-e para os e-mails da contabilidade" : "Conecte uma conta de e-mail para habilitar"}
        >
          <Checkbox
            checked={data?.connected && data?.nfeAutoSend === true}
            disabled={isLoading || !data?.connected || busy !== null}
            onCheckedChange={async (v) => {
              const enabled = v === true;
              setBusy("autosend");
              try {
                await setAutoSend({ data: { companyId, enabled } });
                toast.success(enabled ? "Envio automático da nota fiscal habilitado" : "Envio automático desabilitado");
                qc.invalidateQueries({ queryKey: ["email-account", companyId] });
                qc.invalidateQueries({ queryKey: ["accounting-contact", companyId] });
              } catch (e: any) {
                toast.error(e?.message ?? "Falha ao salvar");
              } finally {
                setBusy(null);
              }
            }}
          />
          Enviar automaticamente XML e PDF da nota fiscal após a venda
        </label>
        <p className="text-xs text-muted-foreground">
          {data?.connected
            ? "Ao autorizar uma NFC-e, os arquivos são enviados desta conta para os e-mails da contabilidade."
            : "Disponível somente com uma conta de e-mail conectada."}
        </p>
      </div>

      <div className="space-y-2 border-t pt-4">
        <Label htmlFor="email-test">Enviar e-mail de teste para</Label>
        <div className="flex gap-2">
          <Input
            id="email-test"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="voce@exemplo.com"
            disabled={!data?.connected}
          />
          <Button
            variant="outline"
            disabled={!data?.connected || busy !== null || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo)}
            onClick={async () => {
              setBusy("test");
              try {
                const r = await sendTest({ data: { companyId, to: testTo.trim() } });
                if (r.sent) toast.success("E-mail de teste enviado");
                else toast.error(r.reason ?? "Falha no envio");
              } catch (e: any) {
                toast.error(e?.message ?? "Falha no envio");
              } finally {
                setBusy(null);
              }
            }}
          >
            {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Testar
          </Button>
        </div>
      </div>
    </Card>
  );
}
