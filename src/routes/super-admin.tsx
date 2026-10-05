import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchPendingCompanies,
  approveCompany,
  rejectCompany,
  isSuperAdmin,
  getAppBaseUrl,
  updateAppBaseUrl,
  clearN8nLogs,
} from "@/lib/db";
import { appwrite as supabase } from "@/integrations/appwrite/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Shield,
  Check,
  X,
  ArrowLeft,
  Building2,
  Loader2,
  Sparkles,
  Settings,
  LayoutGrid,
  Users,
  Lock,
  Globe,
  Save,
  KeyRound,
  Info,
  History,
  Terminal,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

const SYSTEM_MODULES = [
  { id: "dashboard", name: "Dashboard", description: "Painel principal com indicadores" },
  { id: "vendas", name: "Vendas", description: "Ponto de venda e histórico de vendas" },
  { id: "produtos", name: "Produtos", description: "Cadastro e gestão de mercadorias" },
  { id: "estoque", name: "Estoque", description: "Movimentações e contagem de estoque" },
  { id: "financeiro", name: "Financeiro", description: "Contas a pagar e conciliação" },
  { id: "parceiros", name: "Parceiros", description: "Clientes e fornecedores" },
  { id: "delivery", name: "Delivery", description: "Gestão de entregas e motoristas" },
  { id: "notas-fiscais", name: "Notas Fiscais", description: "Emissão e consulta de NFe/NFCe" },
  {
    id: "fechamento-caixa",
    name: "Fechamento de Caixa",
    description: "Controle de turnos e sangrias",
  },
  { id: "equipe", name: "Equipe", description: "Gestão de membros e permissões" },
  { id: "configuracoes", name: "Configurações", description: "Configurações da empresa" },
];

export const Route = createFileRoute("/super-admin")({
  head: () => ({ meta: [{ title: "Super Admin — AutoPeças ERP" }] }),
  component: SuperAdminPage,
});

function SuperAdminPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [loading, user, navigate]);

  const adminQ = useQuery({
    queryKey: ["isSuperAdmin", user?.id],
    queryFn: isSuperAdmin,
    enabled: !!user,
  });

  const qc = useQueryClient();
  const pendingQ = useQuery({
    queryKey: ["pendingCompanies"],
    queryFn: fetchPendingCompanies,
    enabled: !!adminQ.data,
  });

  const approveMut = useMutation({
    mutationFn: approveCompany,
    onSuccess: () => {
      toast.success("Empresa aprovada");
      qc.invalidateQueries({ queryKey: ["pendingCompanies"] });
      qc.invalidateQueries({ queryKey: ["companies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [rejectTarget, setRejectTarget] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectCompany(id, reason),
    onSuccess: () => {
      toast.success("Empresa rejeitada");
      setRejectTarget(null);
      setRejectReason("");
      qc.invalidateQueries({ queryKey: ["pendingCompanies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const systemSettingsQ = useQuery({
    queryKey: ["systemSettings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_settings" as any)
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return {
        ai_product_lookup_enabled: Boolean((data as any)?.ai_product_lookup_enabled ?? true),
        module_configs: (data as any)?.module_configs || [],
      };
    },
    enabled: !!adminQ.data,
  });

  const updateSettingsMut = useMutation({
    mutationFn: async (patch: any) => {
      const { error } = await supabase
        .from("system_settings" as any)
        .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
        .eq("id", true);
      if (error) throw error;
      return patch;
    },
    onSuccess: () => {
      toast.success("Configurações atualizadas");
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleAiLookupMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("system_settings" as any)
        .update({
          ai_product_lookup_enabled: enabled,
          updated_at: new Date().toISOString(),
          updated_by: user?.id ?? null,
        })
        .eq("id", true);
      if (error) throw error;
      return enabled;
    },
    onSuccess: (enabled) => {
      toast.success(
        enabled
          ? "Consulta de produto com IA habilitada"
          : "Consulta de produto com IA desabilitada",
      );
      qc.invalidateQueries({ queryKey: ["systemSettings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (loading || adminQ.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="size-10 animate-spin text-brand-red" />
      </div>
    );
  }

  if (!adminQ.data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="p-8 max-w-md text-center space-y-3">
          <Shield className="size-12 mx-auto text-brand-red" />
          <h1 className="text-xl font-bold">Acesso restrito</h1>
          <p className="text-sm text-muted-foreground">
            Esta área é exclusiva para super administradores.
          </p>
          <Button onClick={() => window.history.back()}>Voltar</Button>
        </Card>
      </div>
    );
  }

  const pending = pendingQ.data ?? [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
              <Shield className="size-6 text-brand-red" /> Painel do Super Admin
            </h1>
            <p className="text-sm text-muted-foreground">
              Aprove ou rejeite novas empresas cadastradas
            </p>
          </div>
          <Button variant="ghost" onClick={() => window.history.back()} className="w-fit">
            <ArrowLeft className="size-4 mr-2" /> Voltar
          </Button>
        </div>

        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList className="bg-card border border-border h-auto flex-wrap justify-start p-1 gap-1">
            <TabsTrigger
              value="pending"
              className="flex items-center gap-1.5 py-2 px-2.5 sm:px-3 text-xs md:text-sm"
            >
              <Building2 className="size-4 shrink-0" />
              <span>Pendentes</span>
              <span className="text-muted-foreground">({pending.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="modules"
              className="flex items-center gap-1.5 py-2 px-2.5 sm:px-3 text-xs md:text-sm"
            >
              <LayoutGrid className="size-4 shrink-0" />
              <span className="sm:hidden">Módulos</span>
              <span className="hidden sm:inline">Módulos & Padrões</span>
            </TabsTrigger>
            <TabsTrigger
              value="n8n"
              className="flex items-center gap-1.5 py-2 px-2.5 sm:px-3 text-xs md:text-sm"
            >
              <KeyRound className="size-4 shrink-0" />
              <span>API n8n</span>
            </TabsTrigger>
            <TabsTrigger
              value="logs"
              className="flex items-center gap-1.5 py-2 px-2.5 sm:px-3 text-xs md:text-sm"
            >
              <History className="size-4 shrink-0" />
              <span>Logs API</span>
            </TabsTrigger>
            <TabsTrigger
              value="system"
              className="flex items-center gap-1.5 py-2 px-2.5 sm:px-3 text-xs md:text-sm"
            >
              <Globe className="size-4 shrink-0" />
              <span>Sistema</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="size-4 text-brand-orange" />
                <h3 className="font-semibold">Configurações globais de IA</h3>
              </div>
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Label htmlFor="ai_lookup_global" className="text-sm font-medium">
                    Permitir consulta de produtos com IA
                  </Label>
                  <p className="text-xs text-muted-foreground max-w-xl">
                    Quando desativado, o botão de pesquisa com IA no cadastro de produtos fica
                    indisponível para todas as empresas.
                  </p>
                </div>
                <Switch
                  id="ai_lookup_global"
                  checked={Boolean(systemSettingsQ.data?.ai_product_lookup_enabled)}
                  disabled={systemSettingsQ.isLoading || toggleAiLookupMut.isPending}
                  onCheckedChange={(v) => toggleAiLookupMut.mutate(v)}
                />
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="size-4" />
                <h3 className="font-semibold">Solicitações de Cadastro</h3>
              </div>

              <div className="hidden md:block rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Empresa</TableHead>
                      <TableHead>CNPJ</TableHead>
                      <TableHead>Criado por</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right w-44">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pendingQ.isLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          Carregando...
                        </TableCell>
                      </TableRow>
                    ) : pending.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                          Nenhuma empresa pendente.
                        </TableCell>
                      </TableRow>
                    ) : (
                      pending.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {c.cnpj || "—"}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>{c.creator_name || "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {c.creator_email || "—"}
                            </div>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(c.created_at).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            {c.rejected_at ? (
                              <Badge variant="outline" className="border-brand-red text-brand-red">
                                Rejeitada
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-brand-orange text-brand-orange"
                              >
                                Pendente
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                onClick={() => approveMut.mutate(c.id)}
                                disabled={approveMut.isPending}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                <Check className="size-4 mr-1" /> Aprovar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setRejectTarget({ id: c.id, name: c.name })}
                                className="border-brand-red text-brand-red hover:bg-brand-red hover:text-brand-red-foreground"
                              >
                                <X className="size-4 mr-1" /> Rejeitar
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile */}
              <div className="md:hidden space-y-3">
                {pendingQ.isLoading ? (
                  <div className="text-center text-muted-foreground py-10">Carregando...</div>
                ) : pending.length === 0 ? (
                  <div className="text-center text-muted-foreground py-10">
                    Nenhuma empresa pendente.
                  </div>
                ) : (
                  pending.map((c) => (
                    <Card key={c.id} className="p-4 space-y-3 border-l-4 border-l-brand-orange">
                      <div>
                        <div className="font-bold">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.cnpj || "Sem CNPJ"}</div>
                      </div>
                      <div className="text-xs">
                        <div>{c.creator_name || "—"}</div>
                        <div className="text-muted-foreground">{c.creator_email || "—"}</div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                          onClick={() => approveMut.mutate(c.id)}
                        >
                          <Check className="size-4 mr-1" /> Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1 border-brand-red text-brand-red"
                          onClick={() => setRejectTarget({ id: c.id, name: c.name })}
                        >
                          <X className="size-4 mr-1" /> Rejeitar
                        </Button>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <N8nLogsTab />
          </TabsContent>

          <TabsContent value="modules" className="space-y-4">
            <Card className="p-0 overflow-hidden">
              <div className="p-4 bg-muted/50 border-b">
                <h3 className="font-semibold flex items-center gap-2">
                  <LayoutGrid className="size-4" /> Configuração de Módulos Globais
                </h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Defina quais módulos estão disponíveis e quais são as permissões padrão para novas
                  empresas.
                </p>
              </div>
              <div className="overflow-auto max-h-[calc(100vh-300px)] border rounded-md">
                <Table>
                  <TableHeader className="sticky top-0 bg-background z-10">
                    <TableRow>
                      <TableHead className="w-[250px]">Módulo</TableHead>
                      <TableHead className="text-center">Ativo Global</TableHead>
                      <TableHead colSpan={4} className="text-center border-l">
                        Permissões Padrão (Novas Empresas)
                      </TableHead>
                    </TableRow>
                    <TableRow className="bg-muted/30">
                      <TableHead></TableHead>
                      <TableHead></TableHead>
                      <TableHead className="text-center border-l text-[10px] uppercase font-bold">
                        Ver
                      </TableHead>
                      <TableHead className="text-center text-[10px] uppercase font-bold">
                        Criar
                      </TableHead>
                      <TableHead className="text-center text-[10px] uppercase font-bold">
                        Editar
                      </TableHead>
                      <TableHead className="text-center text-[10px] uppercase font-bold">
                        Excluir
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {SYSTEM_MODULES.map((mod) => {
                      const config = (systemSettingsQ.data?.module_configs || []).find(
                        (c: any) => c.id === mod.id,
                      ) || {
                        id: mod.id,
                        enabled: true,
                        defaults: { view: true, create: true, edit: true, delete: true },
                      };

                      const updateMod = (patch: any) => {
                        const current = systemSettingsQ.data?.module_configs || [];
                        const exists = current.find((c: any) => c.id === mod.id);
                        let next;
                        if (exists) {
                          next = current.map((c: any) =>
                            c.id === mod.id ? { ...c, ...patch } : c,
                          );
                        } else {
                          next = [...current, { ...config, ...patch }];
                        }
                        updateSettingsMut.mutate({ module_configs: next });
                      };

                      return (
                        <TableRow key={mod.id}>
                          <TableCell>
                            <div className="font-medium text-sm">{mod.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {mod.description}
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={config.enabled}
                              onCheckedChange={(v) => updateMod({ enabled: v })}
                            />
                          </TableCell>
                          <TableCell className="text-center border-l">
                            <Checkbox
                              checked={config.defaults?.view}
                              onCheckedChange={(v) =>
                                updateMod({ defaults: { ...config.defaults, view: !!v } })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={config.defaults?.create}
                              onCheckedChange={(v) =>
                                updateMod({ defaults: { ...config.defaults, create: !!v } })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={config.defaults?.edit}
                              onCheckedChange={(v) =>
                                updateMod({ defaults: { ...config.defaults, edit: !!v } })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={config.defaults?.delete}
                              onCheckedChange={(v) =>
                                updateMod({ defaults: { ...config.defaults, delete: !!v } })
                              }
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="p-4 bg-muted/20 border-t flex justify-between items-center">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Lock className="size-3" /> Alterações afetam apenas novos cadastros ou restrições
                  globais.
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    // Propagar padrões para todas as empresas (Apenas exemplo, seria uma RPC complexa)
                    toast.info("Funcionalidade de propagação em lote será implementada em breve.");
                  }}
                >
                  <Users className="size-4 mr-2" /> Propagar para todas empresas
                </Button>
              </div>
            </Card>
          </TabsContent>
          <TabsContent value="n8n" className="space-y-4">
            <N8nIntegrationTab />
          </TabsContent>

          <TabsContent value="system" className="space-y-4">
            <BrandingCard />
            <SystemSettingsTab />
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeitar empresa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja rejeitar <strong>{rejectTarget?.name}</strong>? O criador não
              poderá utilizá-la até nova aprovação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label>Motivo (opcional)</Label>
            <Input
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Ex: dados inválidos"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (rejectTarget) rejectMut.mutate({ id: rejectTarget.id, reason: rejectReason });
              }}
              className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
            >
              Rejeitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SystemSettingsTab() {
  const [baseUrl, setBaseUrl] = useState("");
  const qc = useQueryClient();

  const baseUrlQ = useQuery({
    queryKey: ["app-base-url"],
    queryFn: getAppBaseUrl,
  });

  useEffect(() => {
    if (baseUrlQ.data) setBaseUrl(baseUrlQ.data);
  }, [baseUrlQ.data]);

  const updateMut = useMutation({
    mutationFn: updateAppBaseUrl,
    onSuccess: () => {
      toast.success("Configuração do sistema atualizada");
      qc.invalidateQueries({ queryKey: ["app-base-url"] });
    },
    onError: (e: Error) => toast.error("Erro ao atualizar: " + e.message),
  });

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-10 rounded-lg bg-brand-red/10 text-brand-red flex items-center justify-center">
            <Globe className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Configurações Globais</h3>
            <p className="text-sm text-muted-foreground">
              Ajustes técnicos que afetam o funcionamento do sistema em rede
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="base_url">Domínio Base (URL do Sistema)</Label>
            <div className="flex gap-2">
              <Input
                id="base_url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://tortsautopecas.vercel.app"
              />
              <Button
                onClick={() => updateMut.mutate(baseUrl)}
                disabled={updateMut.isPending || baseUrlQ.isLoading}
                className="bg-brand-red hover:bg-brand-red/90 text-white gap-2"
              >
                {updateMut.isPending ? (
                  "Salvando..."
                ) : (
                  <>
                    <Save className="size-4" /> Salvar
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Esta URL é utilizada pelo banco de dados para disparar tarefas automáticas (como
              limpeza de IPs). Se você alterar o domínio principal do sistema, atualize este campo.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-blue-50/50 border-blue-100">
        <div className="flex items-start gap-3">
          <Settings className="size-5 text-blue-600 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-blue-900">Nota técnica</h4>
            <p className="text-sm text-blue-800/80 leading-relaxed">
              O agendador de tarefas (Cron Job) utiliza esta URL para chamar os endpoints de
              manutenção. Ao salvar, o valor é armazenado na tabela{" "}
              <code className="bg-blue-100 px-1 rounded">app_config</code>, que é lida dinamicamente
              pelas funções SQL do banco.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function BrandingCard() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const brandingQ = useQuery({
    queryKey: ["branding-admin"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_settings" as any)
        .select("brand_name, brand_logo_url")
        .maybeSingle();
      return {
        name: ((data as any)?.brand_name as string | null) ?? "",
        logoUrl: ((data as any)?.brand_logo_url as string | null) ?? null,
      };
    },
  });

  useEffect(() => {
    if (brandingQ.data) {
      setName(brandingQ.data.name);
      setLogoUrl(brandingQ.data.logoUrl);
    }
  }, [brandingQ.data]);

  const saveMut = useMutation({
    mutationFn: async (patch: { brand_name: string | null; brand_logo_url: string | null }) => {
      const { error } = await supabase
        .from("system_settings" as any)
        .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user?.id ?? null })
        .eq("id", true);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Marca atualizada");
      qc.invalidateQueries({ queryKey: ["branding"] });
      qc.invalidateQueries({ queryKey: ["branding-admin"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onUpload = async (file: File) => {
    try {
      setUploading(true);
      const ext = file.name.split(".").pop() || "png";
      const path = `logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("branding").upload(path, file, {
        upsert: true,
        contentType: file.type,
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("branding").getPublicUrl(path);
      const url = data.publicUrl;
      setLogoUrl(url);
      await saveMut.mutateAsync({ brand_name: name || null, brand_logo_url: url });
    } catch (e: any) {
      toast.error(e.message ?? "Falha no upload");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="p-6 max-w-2xl bg-card/60 border-border/60">
      <div className="flex items-start gap-3 mb-6">
        <div className="size-11 rounded-xl bg-brand-orange/10 text-brand-orange flex items-center justify-center shrink-0">
          <Sparkles className="size-5" />
        </div>
        <div>
          <h3 className="text-lg font-bold leading-tight">Identidade Visual</h3>
          <p className="text-sm text-muted-foreground">
            Nome e logotipo exibidos no sistema (sidebar, login e splash)
          </p>
        </div>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="brand_name" className="text-sm font-semibold">
            Nome do sistema
          </Label>
          <Input
            id="brand_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="AutoPeças"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm font-semibold">Logo</Label>
          <div className="flex items-start gap-4">
            <div className="size-20 rounded-xl bg-muted/40 flex items-center justify-center overflow-hidden border border-border shrink-0">
              {logoUrl ? (
                <img src={logoUrl} alt="Logo" className="size-full object-contain" />
              ) : (
                <Shield className="size-8 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              {logoUrl && (
                <Input
                  value={logoUrl}
                  readOnly
                  className="text-xs font-mono text-muted-foreground"
                />
              )}
              <div className="flex items-center gap-2">
                <Input
                  type="file"
                  accept="image/*"
                  disabled={uploading}
                  className="flex-1"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(f);
                  }}
                />
                {logoUrl && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setLogoUrl(null);
                      saveMut.mutate({ brand_name: name || null, brand_logo_url: null });
                    }}
                  >
                    Remover
                  </Button>
                )}
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Recomendado: PNG/SVG quadrado, fundo transparente, até 200KB.
          </p>
        </div>

        <Button
          onClick={() => saveMut.mutate({ brand_name: name || null, brand_logo_url: logoUrl })}
          disabled={saveMut.isPending || uploading}
          className="bg-brand-red hover:bg-brand-red/90 text-white gap-2"
        >
          <Save className="size-4" />
          {saveMut.isPending ? "Salvando..." : "Salvar marca"}
        </Button>
      </div>
    </Card>
  );
}
function N8nIntegrationTab() {
  const [apiUrl] = useState(
    () => (typeof window !== "undefined" ? window.location.origin : ""),
  );
  const [infoDialog, setInfoDialog] = useState<{
    title: string;
    endpoint: string;
    body: any;
    headers?: any;
    response?: any;
  } | null>(null);

  const endpoints = [
    {
      id: "products",
      title: "Consulta de Produtos",
      description: "Pesquisa produtos no estoque de uma empresa específica.",
      path: "/functions/v1/n8n-products-query",
      body: {
        company_id: "ID-DA-EMPRESA",
        search: "termo de busca",
        limit: 50,
      },
      response: {
        ok: true,
        found: true,
        data: [{ id: "...", name: "Produto X", price: 100 }],
        pagination: { total: 1, limit: 50, offset: 0 },
      },
    },
    {
      id: "clients",
      title: "Consulta de Clientes (Telegram/WhatsApp)",
      description: "Busca clientes pelo nome, telegram_id ou telefone.",
      path: "/functions/v1/n8n-clients-query",
      body: {
        company_id: "ID-DA-EMPRESA",
        telegram_id: "123456789",
        phone: "5511999999999",
        search: "Busca geral (opcional)",
        limit: 10,
      },
      response: {
        ok: true,
        found: true,
        data: [{ id: "...", name: "João Silva", telegram_id: "123456789" }],
        pagination: { total: 1, limit: 10, offset: 0 },
      },
    },
    {
      id: "create-partner",
      title: "Cadastro de Parceiros (Clientes/Fornecedores)",
      description: "Cria um novo parceiro no sistema.",
      path: "/functions/v1/n8n-partners-create",
      body: {
        company_id: "ID-DA-EMPRESA",
        name: "Nome do Parceiro",
        type: "cliente",
        phone: "5511999999999",
        telegram_id: "123456789",
        email: "email@exemplo.com",
        doc: "CPF ou CNPJ",
      },
      response: {
        ok: true,
        message: "sucesso",
        data: { id: "...", name: "Nome do Parceiro" },
      },
    },
    {
      id: "digital-sales",
      title: "Gestão de Vendas (Create)",
      description:
        "Registra vendas de plataformas externas ou manuais com bloqueio de estoque e fila de delivery.",
      path: "/functions/v1/n8n-sales-handler",
      body: {
        action: "create",
        company_id: "UUID-DA-EMPRESA",
        cliente_id: "UUID-DO-CLIENTE",
        tipo: "Entrega",
        plataforma: "hotmart",
        valor_bruto: "197.00",
        valor_unitario: "197.00",
        quantidade: "1",
        produto_id: "UUID-OPCIONAL",
        produto: "Nome do Produto",
        cliente: "Nome do Cliente",
        cliente_email: "cliente@email.com",
        cliente_telefone: "11999999999",
        cliente_endereco: "Rua Exemplo, 123",
        payment_method: "cartao_credito",
        discount: "0.00",
        observacoes: "Venda via link externo",
      },
      response: {
        ok: true,
        sale_id: "UUID-DA-VENDA",
        message: "Venda registrada no Delivery e aguardando confirmação. Estoque bloqueado.",
      },
    },
    {
      id: "sales-handler",
      title: "Gestão de Vendas (Update/Cancel)",
      description: "Atualiza ou cancela vendas existentes via n8n.",
      path: "/functions/v1/n8n-sales-handler",
      body: {
        action: "update",
        company_id: "UUID-DA-EMPRESA",
        sale_id: "UUID-DA-VENDA",
        sale: {
          status: "concluida",
          notes: "Atualizado via n8n",
        },
      },
      response: {
        ok: true,
      },
    },
    {
      id: "query-orders",
      title: "Consulta de Pedidos (Delivery)",
      description: "Pesquisa pedidos de delivery com filtros por status, cliente ou motorista.",
      path: "/functions/v1/n8n-orders-query",
      body: {
        company_id: "ID-DA-EMPRESA",
        client_id: "ID-DO-CLIENTE (UUID opcional)",
        client_name: "Nome do Cliente (busca opcional)",
        produto: "Nome do Produto (opcional)",
        periodo: "hoje (opcional)",
        search: "termo de busca",
        data_inicio: "2023-01-01",
        data_fim: "2023-12-31",
        status: "aguardando_confirmacao",
        limit: 10,
        offset: 0,
      },
      response: {
        ok: true,
        data: [
          {
            id: "...",
            customer_name: "João Silva",
            status: "aguardando_confirmacao",
            total_amount: 150.0,
          },
        ],
        pagination: { total: 1, limit: 50, offset: 0 },
      },
    },
  ];

  return (
    <div className="max-w-4xl space-y-4 max-h-[calc(100vh-250px)] overflow-y-auto pr-2">
      <Card className="p-4 md:p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-10 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <KeyRound className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Configuração Global de API (n8n)</h3>
            <p className="text-sm text-muted-foreground">
              Endpoints para consulta de dados via fluxos externos
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {endpoints.map((ep) => (
            <div key={ep.id} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold text-sm flex items-center gap-2 italic">
                  <div className="size-2 bg-indigo-500 rounded-full" /> {ep.title}
                </h4>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7 text-indigo-500 hover:text-indigo-600 hover:bg-indigo-50"
                  onClick={() =>
                    setInfoDialog({
                      title: ep.title,
                      endpoint: `${apiUrl}${ep.path}`,
                      body: ep.body,
                      response: ep.response,
                      headers: {
                        "Content-Type": "application/json",
                        "x-api-key": "SUA_CHAVE_AQUI",
                      },
                    })
                  }
                >
                  <Info className="size-4" />
                </Button>
              </div>
              <div className="p-3 bg-muted rounded-md font-mono text-[10px] md:text-xs break-all relative group">
                POST {apiUrl}
                {ep.path}
              </div>
            </div>
          ))}

          <Card className="p-4 border-amber-100 bg-amber-50 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-amber-900 text-sm">
              <Shield className="size-4" /> Regras de Venda Digital & NF
            </div>
            <ul className="text-[11px] text-amber-800 space-y-1 list-disc pl-4">
              <li>
                <strong>Campos Recomendados:</strong> plataforma, valor_bruto, valor_unitario,
                quantidade, cliente_id, produto_id.
              </li>
              <li>
                <strong>Nota Fiscal:</strong> Se <code>emitir_nota_fiscal</code> for true, os campos{" "}
                <code>cliente</code>, <code>cliente_documento</code> e <code>produto</code>{" "}
                tornam-se obrigatórios.
              </li>
              <li>
                <strong>Pré-requisitos Fiscais:</strong> A empresa deve ter Razão Social e
                Certificado Digital A1 configurados no sistema web.
              </li>
              <li>
                <strong>Fluxo:</strong> A venda entra como "Aguardando" e aparece na tela de
                Delivery para conferência humana.
              </li>
            </ul>
          </Card>

          <Card className="p-4 border-indigo-100 bg-indigo-50/50 space-y-3">
            <div className="flex items-center gap-2 font-semibold text-indigo-900 text-sm">
              <Info className="size-4" /> Dica de Autenticação
            </div>
            <p className="text-xs text-indigo-800/80 leading-relaxed">
              Use o header <code>x-api-key</code> com o valor da chave secreta definida nas variáveis
              de ambiente (N8N_API_KEY).
            </p>
          </Card>
        </div>
      </Card>

      <AlertDialog open={!!infoDialog} onOpenChange={(o) => !o && setInfoDialog(null)}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Info className="size-5 text-indigo-500" />
              Documentação: {infoDialog?.title}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Modelo de requisição para integração com n8n ou outros serviços.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 my-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Endpoint (POST)
              </Label>
              <div className="p-2 bg-muted rounded font-mono text-xs break-all border border-border">
                {infoDialog?.endpoint}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">Headers</Label>
                <div className="p-3 bg-indigo-950 text-indigo-100 rounded font-mono text-xs overflow-x-auto whitespace-pre">
                  {JSON.stringify(infoDialog?.headers, null, 2)}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold uppercase text-muted-foreground">
                  Body (JSON)
                </Label>
                <div className="p-3 bg-indigo-950 text-indigo-100 rounded font-mono text-xs overflow-x-auto whitespace-pre">
                  {JSON.stringify(infoDialog?.body, null, 2)}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold uppercase text-muted-foreground">
                Exemplo de Resposta (Sucesso)
              </Label>
              <div className="p-3 bg-indigo-950 text-indigo-100 rounded font-mono text-xs overflow-x-auto whitespace-pre">
                {JSON.stringify(infoDialog?.response, null, 2)}
              </div>
              <p className="text-[10px] text-muted-foreground">
                Dica: Verifique se <code>found</code> é <code>true</code> ou se{" "}
                <code>pagination.total &gt; 0</code> para saber se o registro foi encontrado.
              </p>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-100 rounded-md">
              <p className="text-[11px] text-amber-800 leading-relaxed">
                <strong>Importante:</strong> O <code>company_id</code> é obrigatório para filtrar os
                dados da empresa correta. O <code>search</code> realiza uma busca aproximada (LIKE)
                nos campos relevantes.
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogAction className="bg-indigo-600 hover:bg-indigo-700">
              Entendido
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function N8nLogsTab() {
  const { user } = useAuth();
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const logsQ = useQuery({
    queryKey: ["n8n-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("entity", "n8n_api")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000,
  });

  const clearLogs = async () => {
    setIsDeleting(true);
    try {
      await clearN8nLogs();

      toast.success("Logs excluídos com sucesso");
      setShowClearConfirm(false);
      logsQ.refetch();
    } catch (error: any) {
      console.error("Erro ao excluir logs:", error);
      toast.error("Erro ao excluir logs: " + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Card className="p-4 md:p-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-lg bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
            <Terminal className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Logs de Integração n8n</h3>
            <p className="text-sm text-muted-foreground">
              Monitoramento em tempo real das chamadas aos endpoints da API
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                disabled={isDeleting || logsQ.data?.length === 0}
              >
                {isDeleting ? (
                  <Loader2 className="size-4 animate-spin mr-2" />
                ) : (
                  <Trash2 className="size-4 mr-2" />
                )}
                Limpar Logs
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir permanentemente?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação excluirá todos os logs de integração n8n registrados no sistema. Esta
                  operação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(e) => {
                    e.preventDefault();
                    clearLogs();
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  disabled={isDeleting}
                >
                  {isDeleting ? "Excluindo..." : "Confirmar Exclusão"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button
            variant="outline"
            size="sm"
            onClick={() => logsQ.refetch()}
            disabled={logsQ.isFetching}
          >
            {logsQ.isFetching ? (
              <Loader2 className="size-4 animate-spin mr-2" />
            ) : (
              <History className="size-4 mr-2" />
            )}
            Atualizar
          </Button>
        </div>
      </div>

      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Empresa (ID)</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Detalhes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logsQ.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  Carregando logs...
                </TableCell>
              </TableRow>
            ) : logsQ.data?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  Nenhum log encontrado.
                </TableCell>
              </TableRow>
            ) : (
              logsQ.data?.map((log: any) => (
                <TableRow key={log.id} className="text-xs">
                  <TableCell className="whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell className="font-mono text-[10px] truncate max-w-[120px]">
                    {log.company_id}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-[10px] uppercase font-bold">
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{log.meta?.endpoint || "—"}</TableCell>
                  <TableCell>
                    {log.meta?.ok ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200 text-[10px]">
                        Sucesso
                      </Badge>
                    ) : (
                      <Badge className="bg-red-500/10 text-red-600 border-red-200 text-[10px]">
                        Falha
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-7"
                      onClick={() => setSelectedLog(log)}
                    >
                      <Info className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={!!selectedLog} onOpenChange={(o) => !o && setSelectedLog(null)}>
        <AlertDialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Terminal className="size-5 text-indigo-500" />
              Detalhes da Chamada API
            </AlertDialogTitle>
            <AlertDialogDescription>
              Informações técnicas da requisição e resposta do n8n.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 my-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground font-bold">
                  Data/Hora
                </Label>
                <div className="text-sm">
                  {selectedLog && new Date(selectedLog.created_at).toLocaleString("pt-BR")}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] uppercase text-muted-foreground font-bold">
                  Endpoint
                </Label>
                <div className="text-sm font-medium">{selectedLog?.meta?.endpoint || "—"}</div>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-[10px] uppercase text-muted-foreground font-bold">
                Payload (Request/Meta)
              </Label>
              <div className="p-3 bg-indigo-950 text-indigo-100 rounded font-mono text-xs overflow-x-auto whitespace-pre max-h-[300px]">
                {selectedLog ? JSON.stringify(selectedLog.meta, null, 2) : ""}
              </div>
            </div>

            {!selectedLog?.meta?.ok && selectedLog?.meta?.error && (
              <div className="space-y-2">
                <Label className="text-[10px] uppercase text-red-500 font-bold">
                  Erro Retornado
                </Label>
                <div className="p-3 bg-red-950 text-red-100 rounded font-mono text-xs border border-red-900">
                  {selectedLog.meta.error}
                </div>
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogAction className="bg-indigo-600 hover:bg-indigo-700">
              Fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
