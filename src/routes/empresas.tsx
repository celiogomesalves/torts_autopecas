import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { appwrite } from "@/integrations/appwrite/client";
import { fetchMyCompanies, createCompany, joinCompanyByCode } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Building2, Plus, KeyRound, LogOut, Clock, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { isSuperAdmin } from "@/lib/db";
import { SmartPagination } from "@/components/smart-pagination";
import { SearchInput } from "@/components/search-input";
import { matchSearch } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/empresas")({
  head: () => ({ meta: [{ title: "Empresas — AutoPeças ERP" }] }),
  component: CompaniesPage,
});

function CompaniesPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user, loading, setCurrentCompanyId } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const companiesQ = useQuery({
    queryKey: ["companies", user?.id],
    queryFn: fetchMyCompanies,
    enabled: !!user,
  });

  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [code, setCode] = useState("");

  const createMut = useMutation({
    mutationFn: () => createCompany({ name, cnpj: cnpj || undefined }),
    onSuccess: (c) => {
      toast.success(`Empresa "${c.name}" criada — aguardando aprovação do super admin`);
      qc.invalidateQueries({ queryKey: ["companies"] });
      setName("");
      setCnpj("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const joinMut = useMutation({
    mutationFn: () => joinCompanyByCode(code),
    onSuccess: (companyId) => {
      toast.success("Você entrou na empresa");
      qc.invalidateQueries({ queryKey: ["companies"] });
      setCurrentCompanyId(companyId);
      navigate({ to: "/app" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const goToApp = async (companyId: string, approved: boolean | undefined) => {
    if (approved === false) {
      toast.error("Empresa aguardando aprovação do super admin");
      return;
    }
    setCurrentCompanyId(companyId);
    // Registra IP da rede para busca pública (silencioso, não bloqueia)
    try {
      const {
        data: { session },
      } = await appwrite.auth.getSession();
      if (session?.access_token) {
        console.log("Registrando acesso de rede para empresa:", companyId);
        const res = await fetch("/api/public/register-network-access", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_id: companyId,
            access_token: session.access_token,
          }),
        });
        const result = await res.json();
        console.log("Resultado do registro de rede:", result);
      }
    } catch {
      /* ignore */
    }
    navigate({ to: "/app" });
  };

  const superAdminQ = useQuery({
    queryKey: ["isSuperAdmin", user?.id],
    queryFn: isSuperAdmin,
    enabled: !!user,
  });

  const onLogout = async () => {
    await appwrite.auth.signOut();
    navigate({ to: "/login" });
  };

  const companies = companiesQ.data ?? [];

  const [search, setSearch] = useState("");
  const filtered = useMemo(
    () => companies.filter((c) => matchSearch(c.name, search) || matchSearch(c.cnpj ?? "", search)),
    [companies, search],
  );

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 6;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  // Reset page when filters change
  useMemo(() => setCurrentPage(1), [filtered.length, search]);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold">Olá, {user?.user_metadata?.name || user?.email}</h1>
            <p className="text-sm text-muted-foreground">Selecione uma empresa ou crie uma nova</p>
          </div>
          <div className="flex items-center gap-2">
            {superAdminQ.data && (
              <Button variant="outline" onClick={() => navigate({ to: "/super-admin" })}>
                <Shield className="size-4 mr-2" /> Super Admin
              </Button>
            )}
            <Button variant="ghost" onClick={onLogout}>
              <LogOut className="size-4 mr-2" /> Sair
            </Button>
          </div>
        </div>

        {companiesQ.isLoading && (
          <p className="text-sm text-muted-foreground mb-6">Carregando...</p>
        )}

        {!companiesQ.isLoading &&
          companies.length > 0 &&
          companies.every((c) => c.approved === false) && (
            <Card className="p-4 mb-6 border-brand-orange/40 bg-brand-orange/10">
              <div className="flex items-start gap-3">
                <Clock className="size-5 text-brand-orange shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-semibold text-brand-orange">
                    Acesso bloqueado: aguardando aprovação
                  </div>
                  <p className="text-muted-foreground mt-1">
                    Suas empresas ainda não foram aprovadas pelo super administrador. Você poderá
                    acessar o sistema assim que ao menos uma empresa for aprovada. Você também pode
                    entrar em outra empresa já aprovada usando um código de convite abaixo.
                  </p>
                </div>
              </div>
            </Card>
          )}

        {companies.length > 0 && (
          <div className="mb-10">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="text-sm uppercase tracking-wider text-muted-foreground">
                Suas empresas
              </h2>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Pesquisar empresa..."
                className="sm:max-w-xs"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {paginated.length === 0 && (
                <p className="text-sm text-muted-foreground col-span-full">
                  Nenhuma empresa encontrada para "{search}".
                </p>
              )}
              {paginated.map((c) => {
                const pending = c.approved === false;
                const blocked = (c as any).is_blocked;
                const disabled = pending || blocked;

                return (
                  <Card
                    key={c.id}
                    onClick={() => {
                      if (blocked) {
                        toast.error("Seu acesso a esta empresa foi bloqueado pela administração.");
                        return;
                      }
                      goToApp(c.id, c.approved);
                    }}
                    className={`p-5 transition-colors group ${disabled ? "opacity-70 cursor-not-allowed border-muted" : "cursor-pointer hover:border-brand-red"} ${blocked ? "border-brand-red/30 bg-muted/20" : pending ? "border-brand-orange/40" : ""}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`size-10 rounded-lg flex items-center justify-center transition ${blocked ? "bg-brand-red/10 text-brand-red" : pending ? "bg-brand-orange/15 text-brand-orange" : "bg-brand-red/15 text-brand-red group-hover:bg-brand-red group-hover:text-brand-red-foreground"}`}
                      >
                        {blocked ? (
                          <Shield className="size-5" />
                        ) : pending ? (
                          <Clock className="size-5" />
                        ) : (
                          <Building2 className="size-5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <div className="font-semibold truncate">{c.name}</div>
                          {blocked ? (
                            <Badge variant="destructive" className="text-[10px] uppercase px-1">
                              Bloqueado
                            </Badge>
                          ) : pending ? (
                            <Badge
                              variant="outline"
                              className="border-brand-orange text-brand-orange text-[10px]"
                            >
                              Pendente
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-xs text-muted-foreground">{c.cnpj || "Sem CNPJ"}</div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="mt-4 flex justify-center">
                <SmartPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                />
              </div>
            )}
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Plus className="size-4 text-brand-red" />
              <h3 className="font-semibold">Criar nova empresa</h3>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!name) return;
                createMut.mutate();
              }}
              className="space-y-3"
            >
              <div className="space-y-2">
                <Label>Nome da empresa</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label>CNPJ (opcional)</Label>
                <Input value={cnpj} onChange={(e) => setCnpj(e.target.value)} />
              </div>
              <Button
                type="submit"
                disabled={createMut.isPending}
                className="w-full bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
              >
                {createMut.isPending ? "Criando..." : "Criar empresa"}
              </Button>
            </form>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <KeyRound className="size-4 text-brand-orange" />
              <h3 className="font-semibold">Entrar com código de convite</h3>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!code) return;
                joinMut.mutate();
              }}
              className="space-y-3"
            >
              <div className="space-y-2">
                <Label>Código</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="font-mono tracking-widest"
                />
              </div>
              <Button
                type="submit"
                disabled={joinMut.isPending}
                variant="outline"
                className="w-full border-brand-orange text-brand-orange hover:bg-brand-orange hover:text-brand-orange-foreground"
              >
                {joinMut.isPending ? "Entrando..." : "Entrar na empresa"}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
