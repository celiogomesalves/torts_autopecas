import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { PageHeading } from "@/components/page-header";
import { SensitiveSettingsWarning } from "@/components/sensitive-settings-warning";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, ExternalLink, FileWarning, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/app/auditoria-fiscal")({
  component: AuditoriaFiscalPage,
});

type ProductRow = {
  id: string;
  name: string;
  sku: string | null;
  active: boolean;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  origem: number | null;
  unit: string | null;
  unidade_tributavel: string | null;
  icms_csosn: string | null;
  icms_cst: string | null;
  pis_cst: string | null;
  cofins_cst: string | null;
  gtin: string | null;
};

type Issue = { field: string; level: "error" | "warn"; message: string };

function auditProduct(p: ProductRow): Issue[] {
  const issues: Issue[] = [];
  const ncm = (p.ncm ?? "").replace(/\D/g, "");
  if (!ncm) issues.push({ field: "NCM", level: "error", message: "NCM ausente" });
  else if (ncm.length !== 8)
    issues.push({ field: "NCM", level: "error", message: "NCM deve ter 8 dígitos" });

  const cfop = (p.cfop ?? "").replace(/\D/g, "");
  if (!cfop) issues.push({ field: "CFOP", level: "error", message: "CFOP ausente" });
  else if (cfop.length !== 4)
    issues.push({ field: "CFOP", level: "error", message: "CFOP deve ter 4 dígitos" });

  if (p.origem === null || p.origem === undefined)
    issues.push({ field: "Origem", level: "error", message: "Origem da mercadoria não definida" });

  // unidade_tributavel pode herdar de "unit" na emissão; só alerta se ambos vazios
  if (!p.unidade_tributavel?.trim() && !p.unit?.trim())
    issues.push({
      field: "Unid. tributável",
      level: "warn",
      message: "Unidade tributável (e unidade de venda) não preenchida",
    });

  const csosn = (p.icms_csosn ?? "").trim();
  const cst = (p.icms_cst ?? "").trim();
  if (!csosn && !cst)
    issues.push({
      field: "ICMS",
      level: "error",
      message: "CSOSN/CST do ICMS não informado",
    });

  if (!(p.pis_cst ?? "").trim())
    issues.push({ field: "PIS", level: "error", message: "CST do PIS ausente" });
  if (!(p.cofins_cst ?? "").trim())
    issues.push({ field: "COFINS", level: "error", message: "CST do COFINS ausente" });

  const cest = (p.cest ?? "").replace(/\D/g, "");
  if (cest && cest.length !== 7)
    issues.push({ field: "CEST", level: "warn", message: "CEST deve ter 7 dígitos" });

  // "SEM GTIN" é valor padrão aceito pela SEFAZ quando não há GTIN
  const gtinRaw = (p.gtin ?? "").trim().toUpperCase();
  const gtin = (p.gtin ?? "").replace(/\D/g, "");
  if (gtin && gtinRaw !== "SEM GTIN" && ![8, 12, 13, 14].includes(gtin.length))
    issues.push({ field: "GTIN", level: "warn", message: "GTIN com tamanho inválido" });

  return issues;
}

function AuditoriaFiscalPage() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "error" | "warn" | "ok">("error");

  const q = useQuery({
    queryKey: ["fiscal-audit", cid],
    enabled: !!cid,
    queryFn: async () => {
      const pageSize = 1000;
      const all: ProductRow[] = [];
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("products")
          .select(
            "id,name,sku,active,ncm,cest,cfop,origem,unit,unidade_tributavel,icms_csosn,icms_cst,pis_cst,cofins_cst,gtin",
          )
          .eq("company_id", cid)
          .eq("active", true)
          .order("name")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const batch = (data ?? []) as ProductRow[];
        all.push(...batch);
        if (batch.length < pageSize) break;
      }
      return all;
    },
  });

  const rows = useMemo(() => {
    const list = q.data ?? [];
    return list.map((p) => ({ p, issues: auditProduct(p) }));
  }, [q.data]);

  const totals = useMemo(() => {
    let withErr = 0,
      withWarn = 0,
      ok = 0;
    rows.forEach(({ issues }) => {
      const hasErr = issues.some((i) => i.level === "error");
      const hasWarn = issues.some((i) => i.level === "warn");
      if (hasErr) withErr++;
      else if (hasWarn) withWarn++;
      else ok++;
    });
    return { total: rows.length, withErr, withWarn, ok };
  }, [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter(({ p, issues }) => {
      const hasErr = issues.some((i) => i.level === "error");
      const hasWarn = issues.some((i) => i.level === "warn");
      if (filter === "error" && !hasErr) return false;
      if (filter === "warn" && !hasWarn) return false;
      if (filter === "ok" && (hasErr || hasWarn)) return false;
      if (!s) return true;
      return (
        p.name.toLowerCase().includes(s) ||
        (p.sku ?? "").toLowerCase().includes(s) ||
        (p.ncm ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, search, filter]);

  return (
    <div className="space-y-4">
      <PageHeading
        icon={ShieldCheck}
        title="Auditoria fiscal de produtos"
        subtitle="Identifique produtos sem NCM, CFOP, CST/CSOSN e demais dados obrigatórios para emissão de NFC-e/NF-e"
      />

      <SensitiveSettingsWarning area="fiscal" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Total ativos</p>
          <p className="text-2xl font-bold">{totals.total}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Com erros</p>
          <p className="text-2xl font-bold text-destructive">{totals.withErr}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Com alertas</p>
          <p className="text-2xl font-bold text-amber-600">{totals.withWarn}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Em conformidade</p>
          <p className="text-2xl font-bold text-green-600">{totals.ok}</p>
        </Card>
      </div>

      <Card className="p-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nome, SKU ou NCM..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="error">Somente com erros</SelectItem>
            <SelectItem value="warn">Somente com alertas</SelectItem>
            <SelectItem value="ok">Em conformidade</SelectItem>
          </SelectContent>
        </Select>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} de {rows.length}
        </span>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>NCM</TableHead>
              <TableHead>CFOP</TableHead>
              <TableHead>Problemas</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum produto encontrado.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(({ p, issues }) => {
                const hasErr = issues.some((i) => i.level === "error");
                const hasWarn = issues.some((i) => i.level === "warn");
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {hasErr ? (
                          <FileWarning className="size-4 text-destructive shrink-0" />
                        ) : hasWarn ? (
                          <AlertTriangle className="size-4 text-amber-600 shrink-0" />
                        ) : (
                          <CheckCircle2 className="size-4 text-green-600 shrink-0" />
                        )}
                        <span className="font-medium">{p.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">{p.sku ?? "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{p.ncm ?? "—"}</TableCell>
                    <TableCell className="text-xs font-mono">{p.cfop ?? "—"}</TableCell>
                    <TableCell>
                      {issues.length === 0 ? (
                        <Badge variant="outline" className="text-green-700 border-green-500">
                          OK
                        </Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {issues.map((i, idx) => (
                            <Badge
                              key={idx}
                              variant={i.level === "error" ? "destructive" : "outline"}
                              className={
                                i.level === "warn"
                                  ? "border-amber-500 text-amber-700"
                                  : undefined
                              }
                              title={i.message}
                            >
                              {i.field}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button asChild size="sm" variant="ghost" title="Abrir produtos">
                        <Link to="/app/produtos">
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
