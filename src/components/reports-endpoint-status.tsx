import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";

type EnvCheck = {
  label: string;
  origin: string;
  loading: boolean;
  ok: boolean | null;
  httpStatus?: number;
  latencyMs?: number;
  error?: string;
  env?: {
    serviceRoleKey: boolean;
    supabaseUrl: boolean;
    publishableKey: boolean;
    database: boolean | null;
  };
  lastExecution?: { created_at: string; meta: Record<string, any> | null } | null;
};

const PREVIEW_ORIGIN = "https://id-preview--54df0fe6-5eb6-44d7-8103-7686e7f4ca70.lovable.app";
const PUBLISHED_ORIGIN = "https://torqueautopecas.lovable.app";
const CUSTOM_DOMAIN_ORIGIN = "https://tortsautopecas.agenc-ia.net";

function baseEnvironments(): { label: string; origin: string }[] {
  const current = typeof window !== "undefined" ? window.location.origin : "";
  const list = [
    { label: "Preview", origin: PREVIEW_ORIGIN },
    { label: "Produção", origin: CUSTOM_DOMAIN_ORIGIN },
    { label: "Publicado (Lovable)", origin: PUBLISHED_ORIGIN },
  ];
  const isEditorPreview = current.endsWith(".lovableproject.com");
  if (current && !isEditorPreview && !list.some((e) => e.origin === current)) {
    list.unshift({ label: "Origem atual", origin: current });
  }
  return list;
}

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR");
}

export function ReportsEndpointStatus() {
  const { currentCompanyId } = useAuth();
  const [checks, setChecks] = useState<EnvCheck[]>(() =>
    baseEnvironments().map((e) => ({ ...e, loading: false, ok: null })),
  );

  const runChecks = useCallback(async () => {
    const envs = baseEnvironments();
    setChecks(envs.map((e) => ({ ...e, loading: true, ok: null })));

    const results = await Promise.all(
      envs.map(async (e): Promise<EnvCheck> => {
        const started = Date.now();
        const url = `${e.origin}/api/public/reports/sales${
          currentCompanyId ? `?companyId=${currentCompanyId}` : ""
        }`;
        try {
          const res = await fetch(url, { method: "GET", cache: "no-store" });
          const data = await res.json().catch(() => null);
          return {
            ...e,
            loading: false,
            ok: Boolean(data?.ok) && res.ok,
            httpStatus: res.status,
            latencyMs: Date.now() - started,
            env: data?.env,
            lastExecution: data?.lastExecution ?? null,
            error: data?.ok ? undefined : (data?.error ?? `HTTP ${res.status}`),
          };
        } catch (err: any) {
          return {
            ...e,
            loading: false,
            ok: false,
            latencyMs: Date.now() - started,
            error: err?.message ?? "Falha de rede",
          };
        }
      }),
    );

    setChecks(results);
  }, [currentCompanyId]);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const anyLoading = checks.some((c) => c.loading);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <div>
            <h3 className="font-semibold">Status do endpoint de PDF de vendas</h3>
            <p className="text-xs text-muted-foreground">
              Verificação em tempo real por ambiente e a última execução registrada
              do relatório usado pelo n8n.
            </p>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => void runChecks()} disabled={anyLoading}>
          {anyLoading ? (
            <Loader2 className="size-3 mr-1 animate-spin" />
          ) : (
            <RefreshCw className="size-3 mr-1" />
          )}
          Verificar
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {checks.map((c) => (
          <div key={c.origin} className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{c.label}</p>
                <p className="text-[11px] text-muted-foreground break-all">{c.origin}</p>
              </div>
              {c.loading ? (
                <Badge variant="secondary" className="shrink-0">
                  <Loader2 className="size-3 mr-1 animate-spin" /> Verificando
                </Badge>
              ) : c.ok ? (
                <Badge className="shrink-0 bg-emerald-600 hover:bg-emerald-600">
                  <CheckCircle2 className="size-3 mr-1" /> Online
                </Badge>
              ) : c.ok === false ? (
                <Badge variant="destructive" className="shrink-0">
                  <XCircle className="size-3 mr-1" /> Falha
                </Badge>
              ) : (
                <Badge variant="outline" className="shrink-0">—</Badge>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {c.httpStatus !== undefined && (
                <Badge variant="outline">HTTP {c.httpStatus}</Badge>
              )}
              {c.latencyMs !== undefined && (
                <Badge variant="outline">{c.latencyMs} ms</Badge>
              )}
              {c.env && (
                <>
                  <Badge variant={c.env.serviceRoleKey ? "secondary" : "destructive"}>
                    SERVICE_ROLE_KEY {c.env.serviceRoleKey ? "OK" : "ausente"}
                  </Badge>
                  <Badge variant={c.env.database ? "secondary" : "destructive"}>
                    Banco {c.env.database ? "OK" : "falha"}
                  </Badge>
                </>
              )}
            </div>

            {c.error && (
              <p className="text-[11px] text-destructive break-words">{c.error}</p>
            )}

            <div className="border-t pt-2 text-[11px] text-muted-foreground space-y-0.5">
              <p className="font-medium text-foreground">Última execução</p>
              {c.lastExecution ? (
                <>
                  <p>{fmtDateTime(c.lastExecution.created_at)}</p>
                  <p className="break-words">
                    {String(c.lastExecution.meta?.host ?? "—")} ·{" "}
                    {String(c.lastExecution.meta?.format ?? "—")} · HTTP{" "}
                    {String(c.lastExecution.meta?.status ?? "—")} ·{" "}
                    {String(c.lastExecution.meta?.salesCount ?? 0)} vendas ·{" "}
                    {String(c.lastExecution.meta?.durationMs ?? "—")} ms
                  </p>
                  {c.lastExecution.meta?.error && (
                    <p className="text-destructive break-words">
                      {String(c.lastExecution.meta.error)}
                    </p>
                  )}
                </>
              ) : (
                <p>Nenhuma execução registrada ainda.</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
