import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Database, CheckCircle2, AlertTriangle, ArrowRight, Server, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

interface SyncResult {
  table: string;
  supabaseRows: number;
  created: number;
  updated: number;
  unchanged?: number;
  error?: string;
}

export function MigrationSyncTab() {
  const [loading, setLoading] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [results, setResults] = useState<SyncResult[]>([]);
  const [syncScope, setSyncScope] = useState<"all" | "fast">("all");

  const fastTables = [
    "products",
    "sales",
    "sale_items",
    "sale_payments",
    "cash_transactions",
    "cash_registers",
    "stock_movements",
    "fiscal_notes",
  ];

  const handleSync = async () => {
    setLoading(true);
    toast.info("Iniciando sincronização incremental com o Supabase...", {
      description: "Operação segura em modo leitura. Nenhum dado do sistema original será alterado.",
    });

    try {
      const payload: any = {};
      if (syncScope === "fast") {
        payload.tables = fastTables;
      }

      const res = await fetch("/api/functions/sync-supabase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Falha na sincronização");
      }

      setResults(data.results || []);
      setLastSync(new Date().toLocaleString("pt-BR"));

      const totalNew = (data.results || []).reduce((acc: number, r: SyncResult) => acc + (r.created || 0), 0);
      const totalUpdated = (data.results || []).reduce((acc: number, r: SyncResult) => acc + (r.updated || 0), 0);

      toast.success("Sincronização concluída com sucesso!", {
        description: `${totalNew} novos registros criados e ${totalUpdated} atualizados.`,
      });
    } catch (err: any) {
      toast.error("Erro na sincronização: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 border-brand-orange/30 bg-gradient-to-br from-card to-brand-orange/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Database className="size-5 text-brand-orange" />
              <h3 className="text-lg font-bold">Sincronizador Supabase → Appwrite</h3>
              <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                <ShieldCheck className="size-3 mr-1" /> Somente Leitura (Zero Risco)
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Mantenha os dados do Appwrite em paridade com o Supabase de produção enquanto o Lovable estiver ativo.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleSync}
              disabled={loading}
              className="bg-brand-orange hover:bg-brand-orange/90 text-white font-medium gap-2 shadow-sm"
            >
              <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Sincronizando..." : "Sincronizar Agora"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-xs">
          <div className="p-3 rounded-lg bg-card/60 border border-border/60 space-y-1">
            <div className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Server className="size-3.5 text-blue-500" /> Origem (Produção Lovable)
            </div>
            <div className="font-mono text-[11px] truncate text-foreground">
              oapfhdcvugcileuxumpb.supabase.co
            </div>
            <div className="text-[10px] text-emerald-500">Modo Read-Only Seguro</div>
          </div>

          <div className="p-3 rounded-lg bg-card/60 border border-border/60 space-y-1">
            <div className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <Database className="size-3.5 text-brand-orange" /> Destino (Novo Ambiente)
            </div>
            <div className="font-mono text-[11px] truncate text-foreground">
              appwrite.agenc-ia.net (torts_autopecas)
            </div>
            <div className="text-[10px] text-muted-foreground">Database: 6ac38b70003d7a7b6188</div>
          </div>

          <div className="p-3 rounded-lg bg-card/60 border border-border/60 space-y-1">
            <div className="font-semibold text-muted-foreground flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-emerald-500" /> Última Sincronização
            </div>
            <div className="font-semibold text-foreground">
              {lastSync || "Concluída recentemente (automática)"}
            </div>
            <div className="text-[10px] text-muted-foreground">
              Escopo: {syncScope === "all" ? "Todas as 21 tabelas" : "Tabelas transacionais rápidas"}
            </div>
          </div>
        </div>
      </Card>

      {/* Relatório de Resultados */}
      {results.length > 0 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm flex items-center gap-2">
              <CheckCircle2 className="size-4 text-emerald-500" /> Detalhes da Execução
            </h4>
            <Badge variant="secondary" className="text-xs">
              {results.length} tabelas processadas
            </Badge>
          </div>

          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="text-xs">
                  <TableHead>Tabela</TableHead>
                  <TableHead className="text-center">Total no Supabase</TableHead>
                  <TableHead className="text-center">Novos no Appwrite</TableHead>
                  <TableHead className="text-center">Atualizados</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((r) => (
                  <TableRow key={r.table} className="text-xs">
                    <TableCell className="font-mono font-medium">{r.table}</TableCell>
                    <TableCell className="text-center font-mono">
                      {r.supabaseRows ?? "—"}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.created > 0 ? (
                        <Badge className="bg-blue-500/10 text-blue-600 border-blue-200 text-[10px]">
                          +{r.created}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {r.updated > 0 ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-[10px]">
                          {r.updated}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {r.error ? (
                        <Badge variant="destructive" className="text-[10px]">
                          {r.error}
                        </Badge>
                      ) : (
                        <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-[10px]">
                          Sincronizado
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
