import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Download, Share, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: Array<string>;
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

const DISMISS_KEY = "pwa-install-dismissed-at";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias

export function PwaInstaller() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // ignora storage indisponível
    }
    setDismissed(true);
  };

  useEffect(() => {
    // Don't show in iframes or Lovable preview
    if (window.self !== window.top || window.location.hostname.includes("lovable.app")) {
      return;
    }

    // Verifica dismiss persistido (TTL de 7 dias)
    try {
      const raw = window.localStorage.getItem(DISMISS_KEY);
      if (raw) {
        const ts = Number(raw);
        if (Number.isFinite(ts) && Date.now() - ts < DISMISS_TTL_MS) {
          setDismissed(true);
          return;
        }
        window.localStorage.removeItem(DISMISS_KEY);
      }
    } catch {
      // ignora
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

  if (isStandalone || dismissed) return null;

  if (isIOS && !isStandalone) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-4">
        <div className="bg-card border p-4 rounded-lg shadow-lg flex flex-col gap-2 relative">
          <button
            type="button"
            aria-label="Fechar"
            onClick={dismiss}
            className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <p className="text-sm font-medium pr-6">Instale o App no seu iPhone</p>
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
        <div className="bg-card border p-4 rounded-lg shadow-lg flex items-center justify-between gap-4 relative">
          <div className="flex-1 pr-6">
            <p className="text-sm font-medium">Instalar Aplicativo</p>
            <p className="text-xs text-muted-foreground text-pretty">
              Instale nosso app para uma melhor experiência e acesso offline.
            </p>
          </div>
          <Button onClick={handleInstallClick} size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Instalar
          </Button>
          <button
            type="button"
            aria-label="Fechar"
            onClick={dismiss}
            className="absolute top-2 right-2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}
