import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./ui/button";
import { X, CameraOff, Loader2 } from "lucide-react";

interface BarcodeScannerProps {
  onScan: (decodedText: string) => void;
  onClose: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const html5QrCodeRef = useRef<any>(null);
  const rafRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const scannedRef = useRef(false);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia)
    ) {
      setError("Seu navegador não suporta acesso à câmera ou a conexão não é segura (HTTPS).");
      setIsInitializing(false);
      return;
    }

    const handleScan = (text: string) => {
      if (scannedRef.current) return;
      scannedRef.current = true;
      onScan(text);
      stop();
    };

    const stop = () => {
      stoppedRef.current = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (html5QrCodeRef.current?.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };

    const start = async () => {
      try {
        // 1. Pede o stream da câmera imediatamente (parte mais lenta)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
        if (stoppedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        // 2. Tenta usar BarcodeDetector nativo (rápido, sem libs)
        const NativeDetector = (window as any).BarcodeDetector;
        if (NativeDetector) {
          try {
            const formats = await NativeDetector.getSupportedFormats?.();
            const detector = new NativeDetector({
              formats: formats?.length
                ? formats
                : ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code", "itf"],
            });
            const video = videoRef.current!;
            video.srcObject = stream;
            video.setAttribute("playsinline", "true");
            await video.play();
            setIsInitializing(false);

            const tick = async () => {
              if (stoppedRef.current) return;
              try {
                const codes = await detector.detect(video);
                if (codes && codes.length > 0 && codes[0].rawValue) {
                  handleScan(codes[0].rawValue);
                  return;
                }
              } catch {}
              rafRef.current = requestAnimationFrame(tick);
            };
            tick();
            return;
          } catch (e) {
            // Cai pro fallback
          }
        }

        // 3. Fallback: html5-qrcode (carrega dinamicamente)
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        const { Html5Qrcode } = await import("html5-qrcode");
        if (stoppedRef.current) return;
        const html5QrCode = new Html5Qrcode("barcode-reader");
        html5QrCodeRef.current = html5QrCode;
        await html5QrCode.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 150 } },
          (decodedText) => handleScan(decodedText),
          () => {},
        );
        setIsInitializing(false);
      } catch (err: any) {
        console.error("Erro ao iniciar câmera:", err);
        setIsInitializing(false);
        if (err?.name === "NotAllowedError" || String(err).includes("NotAllowedError")) {
          setError(
            "Acesso à câmera negado. Por favor, permita o acesso nas configurações do seu navegador.",
          );
        } else {
          setError(
            "Não foi possível acessar a câmera. Certifique-se de que nenhum outro app a esteja usando.",
          );
        }
      }
    };

    start();

    return () => {
      stop();
    };
  }, [onScan]);

  const useNative = typeof window !== "undefined" && !!(window as any).BarcodeDetector;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/90 p-4"
      style={{ zIndex: 2147483647 }}
      onPointerDownCapture={(e) => e.stopPropagation()}
    >
      <div className="relative w-full max-w-lg bg-white rounded-xl p-6 shadow-2xl overflow-hidden">
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-2 top-2 hover:bg-slate-100 rounded-full z-10"
          onClick={onClose}
        >
          <X className="size-5" />
        </Button>

        <h2 className="text-xl font-bold mb-4 text-center">Escanear Código</h2>

        {error ? (
          <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="bg-red-50 p-4 rounded-full">
              <CameraOff className="size-10 text-destructive" />
            </div>
            <div className="space-y-2">
              <p className="text-destructive font-semibold">{error}</p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                No celular, você precisa aceitar a solicitação de permissão que o navegador exibe.
                Se você já negou antes, procure pelo ícone de cadeado na barra de endereço para
                redefinir as permissões.
              </p>
            </div>
            <Button onClick={onClose} variant="outline" className="mt-4 px-8">
              Fechar
            </Button>
          </div>
        ) : (
          <div className="relative">
            {isInitializing && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50 rounded-lg z-10">
                <Loader2 className="size-8 text-primary animate-spin mb-2" />
                <p className="text-sm text-muted-foreground">Iniciando câmera...</p>
              </div>
            )}
            {useNative ? (
              <video
                ref={videoRef}
                className="w-full rounded-lg bg-black min-h-[300px] object-cover"
                muted
                playsInline
              />
            ) : (
              <div
                id="barcode-reader"
                className="w-full overflow-hidden rounded-lg bg-black min-h-[300px]"
              ></div>
            )}
            {!isInitializing && (
              <div className="mt-6 flex flex-col items-center gap-4">
                <p className="text-sm text-center text-muted-foreground animate-pulse">
                  Aponte a câmera para o código de barras ou QR Code.
                </p>
                <Button variant="outline" onClick={onClose} className="w-full max-w-[200px]">
                  Cancelar
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
