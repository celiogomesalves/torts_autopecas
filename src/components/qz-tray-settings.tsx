import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Loader2, CheckCircle2, TestTube2 } from "lucide-react";
import { toast } from "sonner";
import {
  qzEnabled,
  setQzEnabled,
  qzPrinterName,
  setQzPrinterName,
  qzConnect,
  qzListPrinters,
  qzFindDefaultPrinter,
  qzPrintTestReceipt,
} from "@/lib/qz-print";


import { useAuth } from "@/lib/auth-context";

export function QzTraySettings() {
  const { currentCompanyId } = useAuth();
  const [enabled, setEnabled] = useState<boolean>(false);
  const [printer, setPrinter] = useState<string>("");
  const [printers, setPrinters] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [connected, setConnected] = useState(false);


  useEffect(() => {
    const sync = () => {
      setEnabled(qzEnabled(currentCompanyId));
      setPrinter(qzPrinterName(currentCompanyId) ?? "");
    };
    sync();
    window.addEventListener("ap:print-mode-changed", sync);
    return () => window.removeEventListener("ap:print-mode-changed", sync);
  }, [currentCompanyId]);

  const disableUsbIfActive = async () => {
    try {
      const { usbEnabled, setUsbEnabled } = await import("@/lib/usb-print");
      if (usbEnabled(currentCompanyId)) setUsbEnabled(false, currentCompanyId);
    } catch {
      /* noop */
    }
  };

  const handleToggle = async (v: boolean) => {
    setEnabled(v);
    setQzEnabled(v, currentCompanyId);
    if (v) {
      await disableUsbIfActive();
      window.dispatchEvent(new Event("ap:print-mode-changed"));
      handleConnect();
    } else {
      window.dispatchEvent(new Event("ap:print-mode-changed"));
    }
  };

  const handleConnect = async () => {
    try {
      setLoading(true);
      await qzConnect();
      setConnected(true);
      const list = await qzListPrinters();
      setPrinters(list);
      if (!printer) {
        const def = await qzFindDefaultPrinter();
        if (def) {
          setPrinter(def);
          setQzPrinterName(def, currentCompanyId);
        }
      }
      toast.success(`QZ Tray conectado (${list.length} impressora(s))`);
    } catch (e: any) {
      setConnected(false);
      toast.error(
        e?.message ||
          "Falha ao conectar no QZ Tray. Verifique se o serviço está em execução nesta máquina.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPrinter = async (name: string) => {
    setPrinter(name);
    setQzPrinterName(name || null, currentCompanyId);
    if (name && !qzEnabled(currentCompanyId)) {
      setEnabled(true);
      setQzEnabled(true, currentCompanyId);
      await disableUsbIfActive();
      window.dispatchEvent(new Event("ap:print-mode-changed"));
    }
    if (name) toast.success(`Impressora padrão: ${name}`);
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      await qzPrintTestReceipt(printer || undefined);
      toast.success("Cupom de teste enviado para a impressora");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao imprimir cupom de teste");
    } finally {
      setTesting(false);
    }
  };


  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="size-10 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center">
          <Printer className="size-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold">Impressão local (QZ Tray)</h3>
          <p className="text-sm text-muted-foreground">
            Envia o cupom direto para a impressora térmica desta máquina, sem
            diálogo do navegador. Requer o aplicativo QZ Tray instalado e em
            execução.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">Usar QZ Tray neste dispositivo</Label>
          <p className="text-xs text-muted-foreground">
            Quando ativo, a impressão da NFC-e usa a impressora selecionada
            abaixo (configuração por dispositivo).
          </p>
        </div>
        <Switch checked={enabled} onCheckedChange={handleToggle} />
      </div>

      {enabled && (
        <div className="mt-4 space-y-4">
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label>Impressora</Label>
              <Select
                value={printer}
                onValueChange={handleSelectPrinter}
                disabled={!printers.length}
              >
                <SelectTrigger>
                  <SelectValue placeholder={printers.length ? "Selecione" : "Conecte para listar"} />
                </SelectTrigger>
                <SelectContent>
                  {printers.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleConnect} disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : connected ? (
                <CheckCircle2 className="size-4 mr-1 text-green-600" />
              ) : null}
              {connected ? "Reconectar" : "Conectar"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleTest}
              disabled={testing || (!printer && !connected)}
              title="Imprime um cupom de teste 80mm"
            >
              {testing ? (
                <Loader2 className="size-4 mr-1 animate-spin" />
              ) : (
                <TestTube2 className="size-4 mr-1" />
              )}
              Testar impressão
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            Na primeira conexão, o QZ Tray pode pedir autorização — basta
            confirmar. Salve a impressora padrão para usá-la em todas as
            emissões nesta máquina.
          </p>
        </div>
      )}
    </Card>
  );
}
