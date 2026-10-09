import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Usb,
  Loader2,
  TestTube2,
  Plug,
  AlertCircle,
  CircleDot,
  CheckCircle2,
  Ban,
} from "lucide-react";
import { toast } from "sonner";
import {
  isWebUsbSupported,
  usbEnabled,
  setUsbEnabled,
  usbStoredDevice,
  setUsbStoredDevice,
  usbRequestDevice,
  usbPrintTest,
} from "@/lib/usb-print";
import { setQzEnabled, qzEnabled } from "@/lib/qz-print";
import { useAuth } from "@/lib/auth-context";

const PRINT_MODE_EVENT = "ap:print-mode-changed";

type Status = "incompatible" | "unpaired" | "paired" | "connected";

const STATUS_META: Record<
  Status,
  { label: string; className: string; Icon: typeof CheckCircle2; hint: string }
> = {
  incompatible: {
    label: "Não compatível",
    className: "bg-muted text-muted-foreground border-muted-foreground/20",
    Icon: Ban,
    hint: "Navegador não suporta WebUSB — use Chrome, Edge ou Opera.",
  },
  unpaired: {
    label: "Não pareada",
    className: "bg-amber-100 text-amber-900 border-amber-300",
    Icon: AlertCircle,
    hint: "Nenhuma impressora autorizada neste navegador ainda.",
  },
  paired: {
    label: "Pareada",
    className: "bg-blue-100 text-blue-900 border-blue-300",
    Icon: CircleDot,
    hint: "Autorizada, mas não localizada agora (verifique se está ligada e conectada).",
  },
  connected: {
    label: "Conectada",
    className: "bg-green-100 text-green-900 border-green-300",
    Icon: CheckCircle2,
    hint: "Pronta para receber impressões.",
  },
};

export function UsbPrintSettings() {
  const { currentCompanyId } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [device, setDevice] = useState<ReturnType<typeof usbStoredDevice>>(null);
  const [pairing, setPairing] = useState(false);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<Status>("unpaired");
  const supported = isWebUsbSupported();

  const refreshStatus = useCallback(async () => {
    if (!supported) return setStatus("incompatible");
    const stored = usbStoredDevice(currentCompanyId);
    if (!stored) return setStatus("unpaired");
    try {
      const devices: any[] = await (navigator as any).usb.getDevices();
      const found = devices.find(
        (d) =>
          d.vendorId === stored.vendorId &&
          d.productId === stored.productId &&
          (stored.serialNumber ? d.serialNumber === stored.serialNumber : true),
      );
      setStatus(found ? "connected" : "paired");
    } catch {
      setStatus("paired");
    }
  }, [currentCompanyId, supported]);

  useEffect(() => {
    const sync = () => {
      setEnabled(usbEnabled(currentCompanyId));
      setDevice(usbStoredDevice(currentCompanyId));
      refreshStatus();
    };
    sync();
    window.addEventListener(PRINT_MODE_EVENT, sync);
    // WebUSB connect/disconnect events
    const usb = supported ? (navigator as any).usb : null;
    const onConnect = () => refreshStatus();
    const onDisconnect = () => refreshStatus();
    try {
      usb?.addEventListener?.("connect", onConnect);
      usb?.addEventListener?.("disconnect", onDisconnect);
    } catch {
      /* noop */
    }
    return () => {
      window.removeEventListener(PRINT_MODE_EVENT, sync);
      try {
        usb?.removeEventListener?.("connect", onConnect);
        usb?.removeEventListener?.("disconnect", onDisconnect);
      } catch {
        /* noop */
      }
    };
  }, [currentCompanyId, refreshStatus, supported]);

  const handleToggle = (v: boolean) => {
    setEnabled(v);
    setUsbEnabled(v, currentCompanyId);
    if (v && qzEnabled(currentCompanyId)) setQzEnabled(false, currentCompanyId);
    window.dispatchEvent(new Event(PRINT_MODE_EVENT));
  };

  const handlePair = async () => {
    try {
      setPairing(true);
      const d = await usbRequestDevice(currentCompanyId);
      setDevice(d);
      if (!usbEnabled(currentCompanyId)) {
        setEnabled(true);
        setUsbEnabled(true, currentCompanyId);
      }
      if (qzEnabled(currentCompanyId)) setQzEnabled(false, currentCompanyId);
      window.dispatchEvent(new Event(PRINT_MODE_EVENT));
      await refreshStatus();
      toast.success(
        `Impressora pareada: ${d.productName || `${d.vendorId.toString(16)}:${d.productId.toString(16)}`}`,
      );
    } catch (e: any) {
      if (e?.name !== "NotFoundError") toast.error(e?.message || "Falha ao parear impressora");
    } finally {
      setPairing(false);
    }
  };

  const handleForget = () => {
    setUsbStoredDevice(null, currentCompanyId);
    setDevice(null);
    refreshStatus();
    toast.success("Impressora removida");
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      await usbPrintTest(currentCompanyId);
      toast.success("Cupom de teste enviado");
      refreshStatus();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao imprimir");
    } finally {
      setTesting(false);
    }
  };

  const meta = STATUS_META[status];
  const StatusIcon = meta.Icon;

  return (
    <Card className="p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="size-10 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center">
          <Usb className="size-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-bold">Impressão direta USB (WebUSB)</h3>
            <Badge variant="outline" className={`gap-1 ${meta.className}`}>
              <StatusIcon className="size-3" />
              {meta.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Envia o cupom direto para a impressora térmica USB desta máquina, sem
            instalar nenhum programa. Autorize o dispositivo uma única vez.
            Recomendado como opção principal.
          </p>
          <p className="text-xs text-muted-foreground mt-1">{meta.hint}</p>
        </div>
      </div>

      {!supported && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-900 p-3 text-sm">
          Este navegador não suporta WebUSB. Use Chrome, Edge ou Opera para
          habilitar a impressão direta.
        </div>
      )}

      {supported && (
        <>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label className="text-sm font-medium">Usar impressão USB neste dispositivo</Label>
              <p className="text-xs text-muted-foreground">
                Quando ativo, o cupom sai direto na impressora pareada, sem passar
                pelo diálogo do navegador nem pelo QZ Tray.
              </p>
            </div>
            <Switch checked={enabled} onCheckedChange={handleToggle} />
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-md border p-3 text-sm">
              {device ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <StatusIcon
                    className={`size-4 ${
                      status === "connected"
                        ? "text-green-600"
                        : status === "paired"
                          ? "text-blue-600"
                          : "text-amber-600"
                    }`}
                  />
                  <span className="font-medium">
                    {device.productName ||
                      `USB ${device.vendorId.toString(16)}:${device.productId.toString(16)}`}
                  </span>
                  {device.serialNumber && (
                    <span className="text-xs text-muted-foreground">SN: {device.serialNumber}</span>
                  )}
                </div>
              ) : (
                <span className="text-muted-foreground">Nenhuma impressora pareada.</span>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handlePair} disabled={pairing}>
                {pairing ? (
                  <Loader2 className="size-4 mr-1 animate-spin" />
                ) : (
                  <Plug className="size-4 mr-1" />
                )}
                {device ? "Trocar impressora" : "Parear impressora"}
              </Button>
              <Button
                variant="secondary"
                onClick={handleTest}
                disabled={testing || !device}
                title="Imprime um cupom ESC/POS de teste"
              >
                {testing ? (
                  <Loader2 className="size-4 mr-1 animate-spin" />
                ) : (
                  <TestTube2 className="size-4 mr-1" />
                )}
                Testar impressão
              </Button>
              {device && (
                <Button variant="ghost" onClick={handleForget}>
                  Remover
                </Button>
              )}
            </div>

            <div className="rounded-md bg-muted/40 border p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">
                Por que não aparecem todas as impressoras do sistema?
              </p>
              <p>
                O WebUSB conversa <b>diretamente com o dispositivo USB físico</b> — ele
                não enxerga impressoras instaladas no Windows/macOS (spooler),
                compartilhadas em rede ou conectadas por Bluetooth. No diálogo
                do navegador aparecem apenas dispositivos USB conectados nesta
                máquina.
              </p>
              <p>
                Se a sua impressora térmica não aparece: (1) conecte-a via cabo
                USB direto neste PC; (2) feche a fila de impressão do sistema
                (ela mantém a porta reservada); (3) clique novamente em
                <b> Parear impressora</b>. Para imprimir em impressoras compartilhadas
                de rede ou instaladas no SO, use a alternativa <b>QZ Tray</b> abaixo.
              </p>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}
