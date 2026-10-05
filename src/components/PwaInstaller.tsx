import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Share } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PwaInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Don't show in iframes
    if (window.self !== window.top) {
      return;
    }

    // Check if is iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // Check if is already installed/standalone
    const isStandaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone;
    setIsStandalone(isStandaloneMode);

    const handler = (e: Event) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Show the prompt
    deferredPrompt.prompt();

    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      toast.success("Obrigado por instalar nosso aplicativo!");
    }

    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
  };

  if (isStandalone) return null;

  if (isIOS && !isStandalone) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-4">
        <div className="bg-card border p-4 rounded-lg shadow-lg flex flex-col gap-2">
          <p className="text-sm font-medium">Instale o App no seu iPhone</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            Toque no ícone de compartilhar <Share className="w-3 h-3" /> e depois em "Adicionar à
            Tela de Início"
          </p>
          <Button variant="outline" size="sm" onClick={() => setIsIOS(false)} className="w-full">
            Entendi
          </Button>
        </div>
      </div>
    );
  }

  if (deferredPrompt) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-4">
        <div className="bg-card border p-4 rounded-lg shadow-lg flex items-center justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium">Instalar Aplicativo</p>
            <p className="text-xs text-muted-foreground text-pretty">
              Instale nosso app para uma melhor experiência e acesso offline.
            </p>
          </div>
          <Button onClick={handleInstallClick} size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Instalar
          </Button>
        </div>
      </div>
    );
  }

  return null;
}
