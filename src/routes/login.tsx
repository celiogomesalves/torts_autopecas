import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useBranding } from "@/hooks/use-branding";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import {
  Search,
  Package,
  MapPin,
  X,
  Wrench,
  Eye,
  EyeOff,
  Building2,
  Info,
  ArrowRight,
  ImageIcon,
} from "lucide-react";
import { SmartPagination } from "@/components/smart-pagination";
import { appwrite as supabase } from "@/integrations/appwrite/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type NetworkCompany = { id: string; name: string };
type PublicProduct = {
  id: string;
  name: string;
  sku: string;
  alternative_code: string | null;
  brand_name: string | null;
  stock: number;
  min_stock: number;
  unit: string;
  has_location: boolean;
  location_name?: string;
  sale_price?: number;
  description?: string;
  image_url?: string | null;
};

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — AutoPeças ERP" },
      { name: "description", content: "Acesse o ERP de auto peças." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Consulta de estoque simplificada para não logados
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 5;
  const [selectedProduct, setSelectedProduct] = useState<PublicProduct | null>(null);

  // Empresas vinculadas a este IP (rede)
  const networkQ = useQuery({
    queryKey: ["public-network-companies"],
    queryFn: async () => {
      const r = await fetch("/api/public/network-companies");
      const j = (await r.json()) as { companies: NetworkCompany[]; ip?: string; error?: string };
      console.log("Network companies response:", j);
      return j.companies ?? [];
    },
  });
  const networkCompanies = networkQ.data ?? [];

  const [selectedCid, setSelectedCid] = useState<string>("");

  // Auto-seleciona quando há apenas uma empresa, ou recupera última usada
  useEffect(() => {
    if (selectedCid || networkCompanies.length === 0) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("ap.currentCompanyId");
    } catch {
      /* ignore */
    }
    const match = saved && networkCompanies.find((c) => c.id === saved);
    if (match) setSelectedCid(match.id);
    else if (networkCompanies.length === 1) setSelectedCid(networkCompanies[0].id);
  }, [networkCompanies, selectedCid]);

  // Reset paginação ao trocar empresa ou termo
  useEffect(() => {
    setPage(1);
  }, [selectedCid, search]);

  const term = search.trim();
  const stockQ = useQuery({
    queryKey: ["public-stock-search", selectedCid, term],
    queryFn: async () => {
      const u = new URL("/api/public/stock-search", window.location.origin);
      u.searchParams.set("company_id", selectedCid);
      u.searchParams.set("q", term);
      const r = await fetch(u.toString());
      const j = (await r.json()) as { items: PublicProduct[] };
      return j.items ?? [];
    },
    enabled: !!selectedCid && term.length >= 1,
  });

  const filtered = stockQ.data ?? [];

  const paginated = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, page]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/empresas" });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background relative overflow-hidden">
      <div className="hidden lg:flex flex-col justify-between p-10 bg-gradient-to-br from-background via-card/90 to-background/95 relative overflow-hidden border-r border-white/5">
        {/* Animated ambient drifting gradient blobs */}
        <div className="absolute -top-20 -right-20 size-96 rounded-full bg-brand-red/10 blur-[100px] animate-aurora-slow pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 size-96 rounded-full bg-brand-orange/10 blur-[120px] animate-aurora-slower pointer-events-none" />
        <div className="absolute top-1/2 left-1/3 size-64 rounded-full bg-brand-red/5 blur-[80px] animate-pulse pointer-events-none" />

        <div className="flex items-center gap-3 relative z-10">
          <div className="size-11 rounded-xl bg-brand-red flex items-center justify-center overflow-hidden shadow-lg shadow-brand-red/20 border border-white/10">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.name} className="size-full object-cover" />
            ) : (
              <Wrench className="size-6 text-brand-red-foreground" />
            )}
          </div>
          <div>
            <div className="text-xl font-black tracking-tight text-foreground">{branding.name}</div>
            <div className="text-xs uppercase tracking-widest text-brand-orange">
              ERP Multiempresa
            </div>
          </div>
        </div>
        <div className="relative space-y-6 max-w-md w-full z-10">
          <div className="space-y-4">
            <h1 className="text-4xl font-black leading-tight tracking-tight text-foreground">
              Gestão completa para sua{" "}
              <span className="text-brand-orange bg-gradient-to-r from-brand-orange to-brand-orange/80 bg-clip-text">
                loja de auto peças
              </span>
              .
            </h1>
            <p className="text-muted-foreground font-medium">
              Estoque, vendas, financeiro e delivery — tudo em um único lugar, com isolamento total
              entre empresas.
            </p>
          </div>

          {networkCompanies.length > 0 && (
            <Card className="p-0 bg-glass-strong border border-white/10 shadow-2xl flex flex-col max-h-[500px] lg:max-h-[600px] overflow-hidden rounded-xl">
              <div className="p-5 flex flex-col gap-3 sticky top-0 bg-card/95 backdrop-blur-md z-20 border-b border-brand-orange/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <Search className="size-4 text-brand-orange" />
                    Busca Rápida de Estoque
                  </h3>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="flex-1 min-w-0">
                    {networkCompanies.length > 1 ? (
                      <Select value={selectedCid} onValueChange={setSelectedCid}>
                        <SelectTrigger className="h-9 text-xs">
                          <SelectValue placeholder="Empresa..." />
                        </SelectTrigger>
                        <SelectContent>
                          {networkCompanies.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : networkCompanies.length === 1 ? (
                      <div className="flex items-center gap-2 px-2 py-1.5 bg-muted/30 rounded-md border border-dashed border-brand-orange/20 h-9">
                        <Building2 className="size-3 text-brand-orange shrink-0" />
                        <span className="text-xs font-semibold truncate">
                          {networkCompanies[0].name}
                        </span>
                      </div>
                    ) : null}
                  </div>

                  <div className="relative flex-[2]">
                    <Input
                      placeholder={
                        selectedCid
                          ? "Nome, código, marca, descrição, localização..."
                          : "Selecione empresa..."
                      }
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      disabled={!selectedCid}
                      className="pl-8 pr-8 h-9 text-xs"
                    />
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    {search && (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 pb-5 custom-scrollbar">
                {selectedCid && term && (
                  <div className="mt-4 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    {stockQ.isLoading ? (
                      <div className="text-center py-3 text-xs text-muted-foreground">
                        Buscando...
                      </div>
                    ) : filtered.length > 0 ? (
                      <>
                        <div className="rounded-md border bg-background/50">
                          <Table>
                            <TableHeader className="bg-muted/50 sticky top-0 z-10">
                              <TableRow>
                                <TableHead className="text-[9px] uppercase font-bold h-8">
                                  Produto
                                </TableHead>
                                <TableHead className="text-[9px] uppercase font-bold h-8 text-center">
                                  Estoque
                                </TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paginated.map((p) => {
                                const stk = Number(p.stock);
                                const min = Number(p.min_stock);
                                return (
                                  <TableRow
                                    key={p.id}
                                    className="cursor-pointer hover:bg-muted/30 transition-colors group"
                                    onClick={() => setSelectedProduct(p)}
                                  >
                                    <TableCell className="py-2">
                                      <div className="flex items-center gap-3">
                                        {p.image_url ? (
                                          <div className="size-10 rounded border bg-muted shrink-0 overflow-hidden shadow-sm">
                                            <img
                                              src={p.image_url}
                                              alt={p.name}
                                              className="size-full object-cover"
                                            />
                                          </div>
                                        ) : (
                                          <div className="size-10 rounded border bg-muted shrink-0 flex items-center justify-center text-muted-foreground/20">
                                            <Package className="size-5" />
                                          </div>
                                        )}
                                        <div className="min-w-0 flex-1">
                                          <div className="font-medium text-xs flex items-center gap-1.5 leading-tight">
                                            {p.name}
                                            <div className="flex items-center gap-1 shrink-0">
                                              {p.image_url && (
                                                <ImageIcon className="size-3 text-brand-orange" />
                                              )}
                                              <Info className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                                            </div>
                                          </div>
                                          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
                                            <span className="bg-muted px-1 rounded">
                                              SKU {p.sku}
                                            </span>
                                            {p.brand_name && <span>{p.brand_name}</span>}
                                          </div>
                                        </div>
                                      </div>
                                    </TableCell>
                                    <TableCell className="py-2 text-center">
                                      <Badge
                                        variant={
                                          stk === 0
                                            ? "destructive"
                                            : stk <= min
                                              ? "secondary"
                                              : "outline"
                                        }
                                        className="font-bold text-[10px] min-w-[2.5rem] justify-center"
                                      >
                                        {stk} {p.unit}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                );
                              })}
                            </TableBody>
                          </Table>
                        </div>
                        {totalPages > 1 && (
                          <div className="sticky bottom-0 bg-card/95 backdrop-blur-sm pt-2 pb-1 border-t border-brand-orange/5 mt-2">
                            <SmartPagination
                              currentPage={page}
                              totalPages={totalPages}
                              onPageChange={setPage}
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 bg-white/5 rounded-lg border border-dashed border-white/5">
                        <Package className="size-8 text-muted-foreground/20 mb-2" />
                        <p className="text-xs text-muted-foreground">Nenhum produto encontrado</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
        <p className="text-xs text-muted-foreground relative">
          © {new Date().getFullYear()} {branding.name} ERP
        </p>
      </div>

      <div className="flex flex-col items-center justify-start lg:justify-center p-6 gap-8 overflow-y-auto w-full max-w-2xl mx-auto lg:mx-0 lg:max-w-none relative z-10">
        <form
          onSubmit={onSubmit}
          className="w-full max-w-sm space-y-5 rounded-2xl bg-glass border border-white/5 p-8 shadow-2xl relative order-1 lg:order-2 glow-card-orange"
        >
          <div>
            <h2 className="text-2xl font-black tracking-tight text-foreground">Entrar</h2>
            <p className="text-sm text-muted-foreground">
              Use seu e-mail e senha para acessar o painel
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value.toLowerCase().trim())}
              placeholder="voce@empresa.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="w-full bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
          >
            {busy ? "Entrando..." : "Entrar"}
          </Button>
          <p className="text-sm text-muted-foreground text-center">
            Não tem conta?{" "}
            <Link to="/signup" className="text-brand-orange hover:underline">
              Criar conta
            </Link>
          </p>
        </form>

        {/* Modal de Detalhes do Produto */}
        <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
          <DialogContent className="max-w-md p-0 overflow-hidden flex flex-col max-h-[90vh]">
            <DialogHeader className="p-6 pb-2 shrink-0 border-b bg-card">
              <div className="flex items-center gap-2 text-brand-orange mb-1">
                <Package className="size-5" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Detalhes do Produto
                </span>
              </div>
              <DialogTitle className="text-xl font-bold leading-tight">
                {selectedProduct?.name}
              </DialogTitle>
              <DialogDescription className="flex items-center gap-2 mt-1">
                <span className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
                  SKU: {selectedProduct?.sku}
                </span>
                {selectedProduct?.brand_name && (
                  <span className="text-xs text-muted-foreground">
                    • {selectedProduct.brand_name}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-6">
              {selectedProduct?.image_url && (
                <div className="aspect-square w-full rounded-lg border overflow-hidden bg-muted/20">
                  <img
                    src={selectedProduct.image_url}
                    alt={selectedProduct.name}
                    className="size-full object-contain"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1 bg-muted/30 p-3 rounded-lg border">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                    Estoque Atual
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-2xl font-bold ${Number(selectedProduct?.stock) === 0 ? "text-destructive" : "text-foreground"}`}
                    >
                      {selectedProduct?.stock}
                    </span>
                    <span className="text-sm text-muted-foreground font-medium">
                      {selectedProduct?.unit}
                    </span>
                  </div>
                </div>

                {selectedProduct?.sale_price !== undefined && (
                  <div className="space-y-1 bg-brand-orange/5 p-3 rounded-lg border border-brand-orange/20">
                    <span className="text-[10px] uppercase font-bold text-brand-orange block">
                      Preço de Venda
                    </span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-sm font-bold text-brand-orange">R$</span>
                      <span className="text-2xl font-bold text-brand-orange">
                        {selectedProduct.sale_price.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>
                )}

                {selectedProduct?.location_name && (
                  <div className="space-y-1 bg-muted/20 p-3 rounded-lg border border-dashed">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block flex items-center gap-1">
                      <MapPin className="size-2.5" /> Localização
                    </span>
                    <div className="text-sm font-semibold">{selectedProduct.location_name}</div>
                  </div>
                )}
              </div>

              {selectedProduct?.description && (
                <div className="space-y-2">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground block px-1">
                    Descrição / Aplicação
                  </span>
                  <div className="bg-muted/20 p-4 rounded-lg border border-dashed text-sm leading-relaxed text-muted-foreground italic">
                    {selectedProduct.description}
                  </div>
                </div>
              )}

              {selectedProduct?.alternative_code && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-2 rounded border">
                  <span className="font-bold">Código Original/Alt:</span>
                  <span>{selectedProduct.alternative_code}</span>
                </div>
              )}

              <div className="pt-2">
                <Button
                  className="w-full bg-brand-orange hover:bg-brand-orange/90 text-white gap-2 h-11"
                  onClick={() => setSelectedProduct(null)}
                >
                  Fechar Visualização
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Busca Rápida de Estoque (Apenas se houver empresas) */}
        {networkCompanies.length > 0 && (
          <Card className="w-full max-w-2xl p-6 border-brand-orange/20 shadow-lg bg-card/50 backdrop-blur-sm order-2 lg:hidden">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    <Search className="size-5 text-brand-orange" />
                    Busca Rápida de Estoque
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Pesquise produtos sem precisar fazer login
                  </p>
                </div>
              </div>

              {networkCompanies.length > 1 ? (
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <Building2 className="size-3.5" /> Empresa
                  </Label>
                  <Select value={selectedCid} onValueChange={setSelectedCid}>
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Selecione uma empresa..." />
                    </SelectTrigger>
                    <SelectContent>
                      {networkCompanies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : networkCompanies.length === 1 ? (
                <div className="flex items-center gap-2.5 px-3 py-2.5 bg-muted/30 rounded-lg border border-dashed border-brand-orange/20 mb-1">
                  <Building2 className="size-4 text-brand-orange" />
                  <span className="text-sm font-bold">{networkCompanies[0].name}</span>
                </div>
              ) : null}

              <div className="relative">
                <Input
                  placeholder={
                    selectedCid
                      ? "Nome, código, marca, descrição, localização..."
                      : "Selecione uma empresa primeiro"
                  }
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  disabled={!selectedCid}
                  className="pl-10 pr-10 h-12 text-base"
                />
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-5" />
                  </button>
                )}
              </div>

              {selectedCid && term ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                  {stockQ.isLoading ? (
                    <div className="text-center py-6 text-sm text-muted-foreground">
                      Buscando...
                    </div>
                  ) : filtered.length > 0 ? (
                    <>
                      <div className="rounded-md border bg-background/50 overflow-hidden">
                        <Table>
                          <TableHeader className="bg-muted/50">
                            <TableRow>
                              <TableHead className="text-[10px] uppercase font-bold">
                                Produto
                              </TableHead>
                              <TableHead className="text-[10px] uppercase font-bold">
                                Marca
                              </TableHead>
                              <TableHead className="text-[10px] uppercase font-bold text-center">
                                Estoque
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {paginated.map((p) => {
                              const stk = Number(p.stock);
                              const min = Number(p.min_stock);
                              return (
                                <TableRow
                                  key={p.id}
                                  className="group transition-colors cursor-pointer"
                                  onClick={() => setSelectedProduct(p)}
                                >
                                  <TableCell className="py-3">
                                    <div className="flex items-center gap-2">
                                      {p.image_url ? (
                                        <div className="size-10 rounded border bg-muted shrink-0 overflow-hidden">
                                          <img
                                            src={p.image_url}
                                            alt={p.name}
                                            className="size-full object-cover"
                                          />
                                        </div>
                                      ) : (
                                        <div className="size-10 rounded border bg-muted shrink-0 flex items-center justify-center text-muted-foreground/20">
                                          <Package className="size-5" />
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <div className="font-medium truncate flex items-center gap-1.5">
                                          {p.name}
                                          {p.image_url && (
                                            <ImageIcon className="size-3 text-brand-orange shrink-0" />
                                          )}
                                        </div>
                                        <div className="text-[10px] text-muted-foreground flex items-center gap-2">
                                          <span className="bg-muted px-1 rounded">SKU {p.sku}</span>
                                          {p.has_location && (
                                            <span className="flex items-center gap-0.5">
                                              <MapPin className="size-2.5" /> Localização disponível
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-3 text-xs text-muted-foreground">
                                    {p.brand_name || "—"}
                                  </TableCell>
                                  <TableCell className="py-3 text-center">
                                    <Badge
                                      variant={
                                        stk === 0
                                          ? "destructive"
                                          : stk <= min
                                            ? "secondary"
                                            : "outline"
                                      }
                                      className="font-bold min-w-[3rem] justify-center"
                                    >
                                      {stk} {p.unit}
                                    </Badge>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                      <SmartPagination
                        currentPage={page}
                        totalPages={totalPages}
                        onPageChange={setPage}
                        className="mt-4"
                      />
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 bg-muted/20 rounded-lg border border-dashed">
                      <Package className="size-8 text-muted-foreground/30 mb-2" />
                      <p className="text-sm text-muted-foreground font-medium">
                        Nenhum produto encontrado
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground/50">
                  <Package className="size-12 mb-2 opacity-20" />
                  <p className="text-sm italic">
                    {selectedCid
                      ? "Digite algo para pesquisar no estoque..."
                      : "Selecione uma empresa para iniciar a busca"}
                  </p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
