// Triggering route regeneration
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import { PwaInstaller } from "@/components/PwaInstaller";
import { ConfirmDialogProvider } from "@/components/confirm-dialog";

import { useEffect } from "react";

import appCss from "../styles.css?url";

interface RouterContext {
  queryClient: QueryClient;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0",
      },
      { title: "AutoPeças ERP" },
      { name: "description", content: "ERP multiempresa para auto peças" },
      { name: "theme-color", content: "#ef4444" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "AutoPeças" },
      { property: "og:title", content: "AutoPeças ERP" },
      { name: "twitter:title", content: "AutoPeças ERP" },
      { property: "og:description", content: "ERP multiempresa para auto peças" },
      { name: "twitter:description", content: "ERP multiempresa para auto peças" },
      {
        property: "og:image",
        content: "/pwa-icon-512.png",
      },
      {
        name: "twitter:image",
        content: "/pwa-icon-512.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const swUrl = import.meta.env.DEV ? "/dev-sw.js?dev-sw" : "/sw.js";
      navigator.serviceWorker
        .register(swUrl, { type: "module" })
        .then((reg) => {
          console.log("Service Worker registrado com sucesso:", reg);
        })
        .catch((err) => {
          console.error("Erro ao registrar Service Worker:", err);
        });
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ConfirmDialogProvider>
          <Outlet />
          <Toaster richColors position="top-right" theme="dark" />
          <PwaInstaller />
        </ConfirmDialogProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
