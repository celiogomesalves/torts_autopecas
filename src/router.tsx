import { createRouter, useRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "./routeTree.gen";

const CHUNK_RELOAD_KEY = "__chunk_reload_attempt__";

function isChunkLoadError(error: Error) {
  const msg = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return (
    /ChunkLoadError|Loading chunk [\d]+ failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      msg,
    )
  );
}

function DefaultErrorComponent(props: import("@tanstack/react-router").ErrorComponentProps) {
  const error = props.error as Error;
  const reset = props.reset;
  const router = useRouter();

  // Auto-reload uma única vez em erro de chunk (típico após deploy novo)
  if (typeof window !== "undefined" && isChunkLoadError(error)) {
    try {
      const already = sessionStorage.getItem(CHUNK_RELOAD_KEY);
      if (!already) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
        window.location.reload();
        return null;
      }
    } catch {
      // sessionStorage indisponível — segue exibindo a tela de erro
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            onClick={() => {
              try {
                sessionStorage.removeItem(CHUNK_RELOAD_KEY);
              } catch {
                /* ignore */
              }
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Início
          </a>
        </div>
      </div>
    </div>
  );
}


export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5 * 1000, // 5 segundos: evita refetch imediato ao navegar
        gcTime: 15 * 60_000, // 15 min: tempo em cache após ficar inativo
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        refetchOnReconnect: true,
      },
    },
  });
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // viewport: pré-carrega o chunk JS de cada rota assim que o <Link> aparece
    // na tela (ex.: itens do menu lateral), eliminando o atraso na 1ª navegação.
    defaultPreload: "viewport",
    defaultPreloadDelay: 0,
    // Mantém o cache do preload por 30s para que a navegação seguinte use o chunk já baixado
    defaultPreloadStaleTime: 30_000,
    defaultPreloadGcTime: 5 * 60_000,
    defaultErrorComponent: DefaultErrorComponent,
  });
  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
