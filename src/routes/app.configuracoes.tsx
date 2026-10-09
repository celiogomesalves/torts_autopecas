import { usePersistedState } from "@/hooks/use-persisted-state";
import { PageHeading } from "@/components/page-header";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import {
  fetchCompanyRoles,
  createCompanyRole,
  updateCompanyRole,
  deleteCompanyRole,
  upsertRolePermissionsBatch,
  countMembersByRoles,
  isSuperAdmin,
  hasPermission,
  fetchCompany,
} from "@/lib/db";
import type { Company, CompanyRoleWithPermissions, PermissionAction } from "@/lib/db-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FiscalSettingsTab } from "@/components/fiscal-settings-tab";
import { AgendaSettingsTab } from "@/components/agenda-settings-tab";
import { SensitiveSettingsWarning } from "@/components/sensitive-settings-warning";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  ShieldCheck,
  Plus,
  Trash2,
  Pencil,
  Lock,
  Settings as SettingsIcon,
  DollarSign,
  Save,
  ScanBarcode,
  Bot,
  
  CheckCircle2,
  XCircle,
  Receipt,
  Eye,
  Tags,
  Building2,
  MapPin,
  Hash,
  FileText,
  LayoutDashboard,
  Boxes,
  Wallet,
  BarChart3,
  Calculator,
  TrendingUp,
  Banknote,
  Truck,
  Ruler,
  Award,
  Package,
  Contact,
  ClipboardList,
  CreditCard,
  ShoppingCart,
  ChevronRight,
  ChevronDown,
  Info,
  Activity,
  Phone,
  Printer,
  Cloud,
  Webhook,
  Calendar,
} from "lucide-react";

import { maskPhone, maskCpfCnpj } from "@/lib/masks";
import { LabelTemplatesConfig } from "@/components/label-templates-config";
import { DriveSettingsTab } from "@/components/drive-settings-tab";
import { N8nPayloadTab } from "@/components/n8n-payload-tab";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { receiptStyle } from "@/lib/receipt-style";
import { qzEnabled, qzPrinterName, qzPrintHtml80mm } from "@/lib/qz-print";
import { UsbPrintSettings } from "@/components/usb-print-settings";
import { QzTraySettings } from "@/components/qz-tray-settings";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Usb, TestTube2, Loader2 } from "lucide-react";

export const Route = createFileRoute("/app/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — AutoPeças ERP" }] }),
  component: SettingsPage,
});

const MODULES: Array<{ key: string; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "dashboard_valores", label: "Dashboard - Ver valores financeiros" },
  { key: "vendas", label: "Vendas (PDV)" },
  { key: "estoque", label: "Estoque" },
  { key: "financeiro", label: "Financeiro (Contas)" },
  { key: "fechamento-caixa", label: "Gestão de Caixa" },
  { key: "fechamento-caixa-abrir", label: "Gestão de Caixa - Abrir caixa" },
  { key: "fechamento-caixa-ver-todos", label: "Gestão de Caixa - Ver todos os caixas" },
  { key: "fluxo-caixa", label: "Fluxo de caixa" },
  { key: "conciliacao", label: "Conciliação bancária" },
  { key: "delivery", label: "Delivery" },
  { key: "notas-fiscais", label: "Notas Fiscais" },
  { key: "notas-fiscais-emitir", label: "Notas Fiscais - Emitir NFC-e" },
  { key: "notas-fiscais-imprimir", label: "Notas Fiscais - Imprimir / Reimprimir DANFE" },
  { key: "notas-fiscais-cancelar", label: "Notas Fiscais - Cancelar NFC-e" },
  { key: "notas-fiscais-consultar", label: "Notas Fiscais - Consultar SEFAZ" },
  { key: "produtos", label: "Produtos" },
  { key: "categorias", label: "Categorias" },
  { key: "marcas", label: "Marcas" },
  { key: "unidades", label: "Unidades de Medida" },
  { key: "localizacoes", label: "Localizações de Estoque" },
  { key: "parceiros", label: "Clientes & Fornecedores" },
  { key: "formas-pagamento", label: "Formas de pagamento" },
  { key: "agenda", label: "Agenda (Tarefas e Compromissos)" },

  { key: "relatorios", label: "Relatórios" },
  { key: "equipe", label: "Equipe" },
  { key: "gerenciar_equipes_contagem", label: "Gerenciar Equipes de Contagem" },
  { key: "produtos_auditoria_outros", label: "Produtos - Ver auditoria de outros usuários" },
  { key: "configuracoes", label: "Configurações" },
];

const MODULE_GROUPS = [
  {
    name: "Operacional",
    icon: ShoppingCart,
    modules: ["dashboard", "dashboard_valores", "vendas", "delivery", "parceiros", "agenda"],
  },
  {
    name: "Produtos & Estoque",
    icon: Boxes,
    modules: ["produtos", "estoque", "categorias", "marcas", "localizacoes", "unidades"],
  },
  {
    name: "Financeiro",
    icon: Wallet,
    modules: [
      "financeiro",
      "fechamento-caixa",
      "fechamento-caixa-abrir",
      "fechamento-caixa-ver-todos",
      "fluxo-caixa",
      "conciliacao",
      "formas-pagamento",
    ],
  },
  {
    name: "Fiscal",
    icon: FileText,
    modules: [
      "notas-fiscais",
      "notas-fiscais-emitir",
      "notas-fiscais-imprimir",
      "notas-fiscais-cancelar",
      "notas-fiscais-consultar",
    ],
  },
  {
    name: "Administrativo",
    icon: Shield,
    modules: ["relatorios", "equipe", "produtos_auditoria_outros", "configuracoes"],
  },
];

const ACTIONS: PermissionAction[] = ["view", "create", "edit", "delete"];
const ACTION_LABEL: Record<PermissionAction, string> = {
  view: "Ver",
  create: "Criar",
  edit: "Editar",
  delete: "Excluir",
};

const LLM_MODELS = [
  // Google Gemini
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (preview)" },
  { value: "google/gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite (preview)" },
  { value: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
  { value: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
  { value: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  // OpenAI GPT
  { value: "openai/gpt-5-nano", label: "GPT-5 Nano" },
  { value: "openai/gpt-5-mini", label: "GPT-5 Mini" },
  { value: "openai/gpt-5", label: "GPT-5" },
  { value: "openai/gpt-5.2", label: "GPT-5.2" },
  { value: "openai/gpt-5.4-nano", label: "GPT-5.4 Nano" },
  { value: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { value: "openai/gpt-5.4", label: "GPT-5.4" },
  { value: "openai/gpt-5.4-pro", label: "GPT-5.4 Pro" },
  { value: "openai/gpt-5.5", label: "GPT-5.5" },
  { value: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro" },
  // Transcrição (OpenAI)
  { value: "openai/gpt-4o-transcribe", label: "GPT-4o Transcribe" },
  { value: "openai/gpt-4o-mini-transcribe", label: "GPT-4o Mini Transcribe" },
  { value: "openai/whisper-1", label: "Whisper 1" },
];


const normalizeAiToken = (value: string) => {
  const trimmed = value.trim();
  const match = trimmed.match(/sk-[A-Za-z0-9_-]+/);
  return match?.[0] ?? trimmed;
};

function SettingsPage() {
  const { user, currentCompanyId } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = usePersistedState("configuracoes:tab", "financial");

  // Permite deep-link ?tab=drive (vindo do callback OAuth)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URL(window.location.href).searchParams.get("tab");
    if (t) setActiveTab(t);
  }, [setActiveTab]);

  const roleQ = useQuery({
    queryKey: ["my-membership", user?.id, currentCompanyId],
    enabled: !!user && !!currentCompanyId,
    queryFn: async () => {
      const { data } = await supabase
        .from("memberships")
        .select("role")
        .eq("user_id", user!.id)
        .eq("company_id", currentCompanyId!)
        .maybeSingle();
      return (data?.role as string | undefined) ?? null;
    },
  });

  const superAdminQ = useQuery({
    queryKey: ["isSuperAdmin", user?.id],
    queryFn: isSuperAdmin,
    enabled: !!user,
  });

  const isSuper = !!superAdminQ.data;

  const configPermQ = useQuery({
    queryKey: ["has_permission", currentCompanyId, "configuracoes", "view", user?.id],
    queryFn: () => hasPermission(currentCompanyId!, "configuracoes", "view"),
    enabled: !!currentCompanyId && !!user,
  });

  const allowed = isSuper || (configPermQ.data ?? false);

  useEffect(() => {
    if (!roleQ.isLoading && roleQ.data !== undefined && !allowed) {
      navigate({ to: "/app" });
    }
  }, [roleQ.isLoading, roleQ.data, allowed, navigate]);

  if (roleQ.isLoading || !allowed) {
    return (
      <Card className="p-10 text-center text-muted-foreground">Verificando permissões...</Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeading
        icon={SettingsIcon}
        title="Configurações"
        subtitle="Gerencie perfis, permissões e ajustes da empresa"
      />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-card border border-border h-auto flex-wrap justify-start">
          <TabsTrigger value="financial" className="gap-2">
            <SettingsIcon className="size-4" /> Geral
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-2">
            <ShieldCheck className="size-4" /> Perfis & Permissões
          </TabsTrigger>
          <TabsTrigger value="integrations" className="gap-2">
            <Bot className="size-4" /> Integrações
          </TabsTrigger>
          <TabsTrigger
            value="printing"
            className="gap-2"
            onMouseEnter={() => {
              qc.prefetchQuery({
                queryKey: ["company-detail", currentCompanyId],
                queryFn: async () => {
                  const { data, error } = await supabase
                    .from("companies")
                    .select("id, name, cnpj")
                    .eq("id", currentCompanyId!)
                    .single();
                  if (error) throw error;
                  return data;
                },
              });
            }}
          >
            <Receipt className="size-4" /> Impressão
          </TabsTrigger>
          <TabsTrigger value="fiscal" className="gap-2">
            <FileText className="size-4" /> Fiscal (NFC-e)
          </TabsTrigger>
          <TabsTrigger value="drive" className="gap-2">
            <Cloud className="size-4" /> Google Drive
          </TabsTrigger>
          <TabsTrigger value="company" className="gap-2">
            <Building2 className="size-4" /> Empresa
          </TabsTrigger>
          <TabsTrigger value="n8n" className="gap-2">
            <Webhook className="size-4" /> Payload n8n
          </TabsTrigger>
          <TabsTrigger value="agenda" className="gap-2">
            <Calendar className="size-4" /> Agenda
          </TabsTrigger>
        </TabsList>


        <TabsContent value="financial" className="space-y-4">
          <FinancialTab />
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <SensitiveSettingsWarning area="integracoes" />
          <IntegrationsTab />
        </TabsContent>

        <TabsContent value="roles" className="space-y-4">
          <RolesTab />
        </TabsContent>

        <TabsContent value="printing" className="space-y-4">
          <PrintingTab />
        </TabsContent>

        <TabsContent value="fiscal" className="space-y-4">
          <SensitiveSettingsWarning area="fiscal" />
          <FiscalSettingsTab />
        </TabsContent>

        <TabsContent value="drive" className="space-y-4">
          <DriveSettingsTab companyId={currentCompanyId} />
        </TabsContent>

        <TabsContent value="company" className="space-y-4">
          <SensitiveSettingsWarning area="empresa" />
          <CompanyTab />
        </TabsContent>

        <TabsContent value="n8n" className="space-y-4">
          <N8nPayloadTab />
        </TabsContent>

        <TabsContent value="agenda" className="space-y-4">
          <AgendaSettingsTab />
        </TabsContent>
      </Tabs>

    </div>
  );
}

function CompanyTab() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();

  const companyQ = useQuery({
    queryKey: ["company-detail", cid],
    queryFn: async () => {
      const company = await fetchCompany(cid);
      if (!company) throw new Error("Empresa não encontrada");
      return company;
    },
    enabled: !!cid,
  });

  const fiscalQ = useQuery({
    queryKey: ["fiscal-settings", cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fiscal_settings")
        .select("*")
        .eq("company_id", cid)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!cid,
  });

  const [name, setName] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [ie, setIe] = useState("");
  const [endereco, setEndereco] = useState("");
  const [phone, setPhone] = useState("");
  const [zipCode, setZipCode] = useState("");

  useEffect(() => {
    if (companyQ.data) {
      setName(companyQ.data.name || "");
      setCnpj(companyQ.data.cnpj || "");
      setPhone(companyQ.data.phone || "");
      setZipCode((companyQ.data as any).zip_code || "");
    }
  }, [companyQ.data]);

  useEffect(() => {
    if (fiscalQ.data) {
      setRazaoSocial(fiscalQ.data.razao_social || "");
      setIe(fiscalQ.data.ie || "");
      setEndereco(fiscalQ.data.endereco || "");
      // if cnpj is not in company table but in fiscal, sync it
      if (!cnpj && fiscalQ.data.cnpj) setCnpj(fiscalQ.data.cnpj);
    }
  }, [fiscalQ.data, cnpj]);

  const saveMut = useMutation({
    mutationFn: async () => {
      // Update company name/cnpj/telefone/CEP
      const { data: updated, error: compError } = await (supabase.from("companies") as any)
        .update({
          name,
          cnpj: cnpj || null,
          phone: phone || null,
          zip_code: zipCode || null,
        })
        .eq("id", cid)
        .select("id,phone,zip_code");
      if (compError) throw compError;
      if (!updated || updated.length === 0) {
        throw new Error(
          "Não foi possível salvar os dados da empresa. Verifique se você tem permissão de administrador.",
        );
      }


      // Upsert fiscal settings
      const { data: existing } = await supabase
        .from("fiscal_settings")
        .select("company_id")
        .eq("company_id", cid)
        .maybeSingle();

      if (existing) {
        const { error: fiscalError } = await supabase
          .from("fiscal_settings")
          .update({
            razao_social: razaoSocial,
            cnpj,
            ie,
            endereco,
            telefone: phone || null,
            cep: zipCode || null,
            updated_at: new Date().toISOString(),
          })
          .eq("company_id", cid);
        if (fiscalError) throw fiscalError;
      } else {
        const { error: fiscalError } = await supabase.from("fiscal_settings").insert({
          company_id: cid,
          razao_social: razaoSocial,
          cnpj,
          ie,
          endereco,
          telefone: phone || null,
          cep: zipCode || null,
        });
        if (fiscalError) throw fiscalError;
      }

    },
    onSuccess: () => {
      toast.success("Dados da empresa atualizados");
      qc.invalidateQueries({ queryKey: ["company-detail", cid] });
      qc.invalidateQueries({ queryKey: ["fiscal-settings", cid] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (companyQ.isLoading || fiscalQ.isLoading) {
    return (
      <Card className="p-10 text-center text-muted-foreground">Carregando dados da empresa...</Card>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-10 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center">
            <Building2 className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Dados da Empresa</h3>
            <p className="text-sm text-muted-foreground">
              Configure as informações oficiais da sua empresa para cupons e documentos
            </p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="comp_name">Nome Fantasia</Label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="comp_name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-9"
                  placeholder="Ex: Auto Peças Silva"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comp_razao">Razão Social</Label>
              <div className="relative">
                <FileText className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="comp_razao"
                  value={razaoSocial}
                  onChange={(e) => setRazaoSocial(e.target.value)}
                  className="pl-9"
                  placeholder="Ex: Silva & Filhos Ltda"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="comp_cnpj">CNPJ</Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="comp_cnpj"
                    value={maskCpfCnpj(cnpj)}
                    onChange={(e) => setCnpj(maskCpfCnpj(e.target.value))}
                    className="pl-9"
                    placeholder="00.000.000/0000-00"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="comp_ie">Inscrição Estadual</Label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="comp_ie"
                    value={ie}
                    onChange={(e) => setIe(e.target.value)}
                    className="pl-9"
                    placeholder="Isento"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comp_phone">Telefone de Contato</Label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  id="comp_phone"
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  className="pl-9"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="comp_zip" className="flex items-center gap-1">
                CEP <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    id="comp_zip"
                    value={zipCode}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                      if (val.length <= 5) setZipCode(val);
                      else setZipCode(val.slice(0, 5) + "-" + val.slice(5));
                    }}
                    className="pl-9"
                    placeholder="00000-000"
                    required
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={zipCode.replace(/\D/g, "").length !== 8}
                  onClick={async () => {
                    const cleanZip = zipCode.replace(/\D/g, "");
                    try {
                      const res = await fetch(`https://viacep.com.br/ws/${cleanZip}/json/`);
                      const data = await res.json();
                      if (data.erro) {
                        toast.error("CEP não encontrado");
                        return;
                      }
                      const fullAddr = `${data.logradouro}, ${data.bairro}, ${data.localidade} - ${data.uf}`;
                      setEndereco(fullAddr);
                      toast.success("Endereço preenchido!");
                    } catch (e) {
                      toast.error("Erro ao buscar CEP");
                    }
                  }}
                >
                  Buscar
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Obrigatório para o cálculo de frete no Delivery.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="comp_addr">Endereço Completo</Label>
              <div className="relative">
                <MapPin className="absolute left-3 top-3 size-4 text-muted-foreground" />
                <Textarea
                  id="comp_addr"
                  value={endereco}
                  onChange={(e) => setEndereco(e.target.value)}
                  className="pl-9 min-h-[115px]"
                  placeholder="Rua, Número, Bairro, Cidade - UF, CEP"
                />
              </div>
              <p className="text-[10px] text-muted-foreground italic">
                Este endereço aparecerá no rodapé/cabeçalho dos cupons se habilitado.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => saveMut.mutate()}
                disabled={saveMut.isPending}
                className="gap-2 bg-brand-orange hover:bg-brand-orange/90 text-white"
              >
                {saveMut.isPending ? (
                  "Salvando..."
                ) : (
                  <>
                    <Save className="size-4" /> Salvar Alterações
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 bg-blue-50/50 border-blue-100">
        <div className="flex items-start gap-3">
          <SettingsIcon className="size-5 text-blue-600 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-blue-900">Uso desses dados</h4>
            <p className="text-sm text-blue-800/80 leading-relaxed">
              As informações configuradas nesta aba são utilizadas automaticamente em:
            </p>
            <ul className="text-sm text-blue-800/70 list-disc pl-5 mt-2 space-y-1">
              <li>Cabeçalhos de cupons de venda (se habilitado na aba Impressão)</li>
              <li>Emissão de Notas Fiscais Eletrônicas (NF-e e NFC-e)</li>
              <li>Relatórios oficiais de fechamento e movimentação</li>
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}

function RolesTab() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();

  const rolesQ = useQuery({
    queryKey: ["company-roles", cid],
    queryFn: () => fetchCompanyRoles(cid),
    enabled: !!cid,
  });

  const roles = rolesQ.data ?? [];
  const roleIds = roles.map((r) => r.id);

  const memberCountsQ = useQuery({
    queryKey: ["role-member-counts", cid, roleIds.join(",")],
    queryFn: () => countMembersByRoles(roleIds),
    enabled: roleIds.length > 0,
  });
  const memberCounts = memberCountsQ.data ?? {};

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => roles.find((r) => r.id === selectedId) ?? roles[0] ?? null,
    [roles, selectedId],
  );

  const createMut = useMutation({
    mutationFn: (input: { name: string; description?: string }) =>
      createCompanyRole({ company_id: cid, ...input }),
    onSuccess: (r) => {
      toast.success("Perfil criado");
      setSelectedId(r.id);
      qc.invalidateQueries({ queryKey: ["company-roles", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCompanyRole(id),
    onSuccess: () => {
      toast.success("Perfil excluído");
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["company-roles", cid] });
      qc.invalidateQueries({ queryKey: ["role-member-counts", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (rolesQ.isLoading) {
    return <Card className="p-10 text-center text-muted-foreground">Carregando perfis...</Card>;
  }

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      <Card className="p-4 space-y-3 h-fit">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Perfis ({roles.length})</h3>
          <CreateRoleDialog
            onCreate={(input) => createMut.mutate(input)}
            disabled={createMut.isPending}
          />
        </div>
        <div className="space-y-1">
          {roles.map((r) => {
            const count = memberCounts[r.id] ?? 0;
            return (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={[
                  "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2",
                  selected?.id === r.id
                    ? "bg-brand-orange/15 border-l-2 border-brand-orange text-foreground"
                    : "hover:bg-accent text-foreground/80",
                ].join(" ")}
              >
                <span className="flex-1 truncate font-medium">{r.name}</span>
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                  {count}
                </Badge>
                {r.is_system && (
                  <Badge variant="outline" className="text-[10px] gap-1 border-muted-foreground/30">
                    <Lock className="size-3" /> Sistema
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {selected ? (
        <RoleDetail
          role={selected}
          memberCount={memberCounts[selected.id] ?? 0}
          onDelete={() => deleteMut.mutate(selected.id)}
          deleting={deleteMut.isPending}
        />
      ) : (
        <Card className="p-10 text-center text-muted-foreground">Crie um perfil para começar.</Card>
      )}
    </div>
  );
}

function CreateRoleDialog({
  onCreate,
  disabled,
}: {
  onCreate: (input: { name: string; description?: string }) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          className="gap-1 bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
        >
          <Plus className="size-3" /> Novo
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo perfil</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Caixa"
              maxLength={50}
            />
          </div>
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button
            disabled={disabled || !name.trim()}
            onClick={() => {
              onCreate({ name: name.trim(), description: description.trim() || undefined });
              setName("");
              setDescription("");
              setOpen(false);
            }}
          >
            Criar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RoleDetail({
  role,
  memberCount,
  onDelete,
  deleting,
}: {
  role: CompanyRoleWithPermissions;
  memberCount: number;
  onDelete: () => void;
  deleting: boolean;
}) {
  const qc = useQueryClient();
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;

  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    MODULE_GROUPS.forEach((g) => (init[g.name] = false));
    return init;
  });

  const toggleGroup = (name: string) => {
    setExpandedGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const [editingMeta, setEditingMeta] = useState(false);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");

  useEffect(() => {
    setName(role.name);
    setDescription(role.description ?? "");
    setEditingMeta(false);
  }, [role.id, role.name, role.description]);

  const permMap = useMemo(() => {
    const m = new Map<string, { view: boolean; create: boolean; edit: boolean; delete: boolean }>();
    for (const p of role.permissions) {
      m.set(p.module, {
        view: p.can_view,
        create: p.can_create,
        edit: p.can_edit,
        delete: p.can_delete,
      });
    }
    return m;
  }, [role.permissions]);

  const [matrix, setMatrix] = useState<Record<string, Record<PermissionAction, boolean>>>({});
  useEffect(() => {
    const init: Record<string, Record<PermissionAction, boolean>> = {};
    for (const m of MODULES) {
      const cur = permMap.get(m.key);
      init[m.key] = {
        view: cur?.view ?? false,
        create: cur?.create ?? false,
        edit: cur?.edit ?? false,
        delete: cur?.delete ?? false,
      };
    }
    setMatrix(init);
  }, [permMap]);

  const updateMeta = useMutation({
    mutationFn: () =>
      updateCompanyRole(role.id, { name: name.trim(), description: description.trim() || null }),
    onSuccess: () => {
      toast.success("Perfil atualizado");
      setEditingMeta(false);
      qc.invalidateQueries({ queryKey: ["company-roles", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveAll = useMutation({
    mutationFn: () =>
      upsertRolePermissionsBatch(
        MODULES.map((m) => ({
          role_id: role.id,
          module: m.key,
          can_view: matrix[m.key]?.view ?? false,
          can_create: matrix[m.key]?.create ?? false,
          can_edit: matrix[m.key]?.edit ?? false,
          can_delete: matrix[m.key]?.delete ?? false,
        })),
      ),
    onSuccess: () => {
      toast.success("Permissões salvas");
      qc.invalidateQueries({ queryKey: ["company-roles", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (mod: string, act: PermissionAction) => {
    setMatrix((prev) => ({ ...prev, [mod]: { ...prev[mod], [act]: !prev[mod][act] } }));
  };

  const toggleRow = (mod: string) => {
    const allSelected = ACTIONS.every((a) => matrix[mod]?.[a]);
    setMatrix((prev) => ({
      ...prev,
      [mod]: {
        view: !allSelected,
        create: !allSelected,
        edit: !allSelected,
        delete: !allSelected,
      },
    }));
  };

  const toggleCol = (act: PermissionAction) => {
    const allSelected = MODULES.every((m) => matrix[m.key]?.[act]);
    setMatrix((prev) => {
      const next = { ...prev };
      for (const m of MODULES) {
        next[m.key] = { ...next[m.key], [act]: !allSelected };
      }
      return next;
    });
  };

  const toggleAll = () => {
    const allSelected = MODULES.every((m) => ACTIONS.every((a) => matrix[m.key]?.[a]));
    setMatrix((prev) => {
      const next = { ...prev };
      for (const m of MODULES) {
        next[m.key] = {
          view: !allSelected,
          create: !allSelected,
          edit: !allSelected,
          delete: !allSelected,
        };
      }
      return next;
    });
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          {editingMeta ? (
            <div className="space-y-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={50} />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => updateMeta.mutate()}
                  disabled={updateMeta.isPending}
                >
                  Salvar
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditingMeta(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold">{role.name}</h3>
                {role.is_system && (
                  <Badge variant="outline" className="gap-1 text-[10px]">
                    <Lock className="size-3" /> Sistema
                  </Badge>
                )}
                <Badge variant="secondary" className="text-[10px]">
                  {memberCount} membro(s)
                </Badge>
              </div>
              {role.description && (
                <p className="text-sm text-muted-foreground mt-1">{role.description}</p>
              )}
            </>
          )}
        </div>

        <div className="flex gap-2">
          {!editingMeta && !role.is_system && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditingMeta(true)}
              className="gap-1"
            >
              <Pencil className="size-3" /> Editar
            </Button>
          )}
          {!role.is_system && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1 text-destructive">
                  <Trash2 className="size-3" /> Excluir
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Excluir perfil?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Esta ação não pode ser desfeita. Membros perderão este perfil.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} disabled={deleting}>
                    Excluir
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 p-3 bg-muted/30 rounded-lg border border-border">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="toggle-all"
              checked={
                MODULES.length > 0 && MODULES.every((m) => ACTIONS.every((a) => matrix[m.key]?.[a]))
              }
              onCheckedChange={() => toggleAll()}
            />
            <Label htmlFor="toggle-all" className="text-sm font-semibold cursor-pointer">
              Selecionar Todos
            </Label>
          </div>
        </div>
        <div className="flex gap-4">
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-[10px] uppercase font-bold"
            onClick={() => {
              const allCollapsed = Object.values(expandedGroups).every((v) => !v);
              const next: Record<string, boolean> = {};
              MODULE_GROUPS.forEach((g) => (next[g.name] = allCollapsed));
              setExpandedGroups(next);
            }}
          >
            {Object.values(expandedGroups).every((v) => !v) ? "Expandir Todos" : "Recolher Todos"}
          </Button>
        </div>
      </div>

      <div className="space-y-8 mt-4">
        {MODULE_GROUPS.map((group) => (
          <Collapsible
            key={group.name}
            open={expandedGroups[group.name]}
            onOpenChange={() => toggleGroup(group.name)}
            className="space-y-3"
          >
            <CollapsibleTrigger asChild>
              <div className="flex items-center justify-between group cursor-pointer pb-2 border-b border-brand-orange/20">
                <div className="flex flex-col md:flex-row md:items-center gap-3 w-full">
                  <div className="flex items-center gap-2 min-w-fit">
                    <group.icon className="size-5 text-brand-orange" />
                    <h4 className="font-bold text-base truncate">{group.name}</h4>
                    <Badge variant="outline" className="text-[10px] ml-1 shrink-0">
                      {group.modules.length}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-x-4 gap-y-2 flex-wrap md:border-l md:border-border md:pl-3">
                    {ACTIONS.map((a) => {
                      const allInGroup = group.modules.every((modKey) => matrix[modKey]?.[a]);
                      const someInGroup = group.modules.some((modKey) => matrix[modKey]?.[a]);
                      return (
                        <div
                          key={a}
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            id={`group-${group.name}-${a}`}
                            checked={allInGroup}
                            className={!allInGroup && someInGroup ? "opacity-50" : ""}
                            onCheckedChange={() => {
                              setMatrix((prev) => {
                                const next = { ...prev };
                                group.modules.forEach((modKey) => {
                                  next[modKey] = { ...next[modKey], [a]: !allInGroup };
                                });
                                return next;
                              });
                            }}
                          />
                          <Label
                            htmlFor={`group-${group.name}-${a}`}
                            className="text-[10px] font-bold uppercase text-muted-foreground cursor-pointer whitespace-nowrap"
                          >
                            {ACTION_LABEL[a]}
                          </Label>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground group-hover:text-foreground transition-colors">
                  <span className="text-xs">
                    {expandedGroups[group.name] ? "Recolher" : "Expandir"}
                  </span>
                  {expandedGroups[group.name] ? (
                    <ChevronDown className="size-4" />
                  ) : (
                    <ChevronRight className="size-4" />
                  )}
                </div>
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="rounded-md border border-border overflow-hidden bg-card/50">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[300px]">Módulo / Página</TableHead>
                      {ACTIONS.map((a) => (
                        <TableHead key={a} className="text-center w-24">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                            {ACTION_LABEL[a]}
                          </span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.modules.map((modKey) => {
                      const m = MODULES.find((mod) => mod.key === modKey);
                      if (!m) return null;
                      return (
                        <TableRow key={m.key} className="hover:bg-muted/30 transition-colors">
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`row-${m.key}`}
                                checked={ACTIONS.every((a) => matrix[m.key]?.[a])}
                                onCheckedChange={() => toggleRow(m.key)}
                              />
                              <Label htmlFor={`row-${m.key}`} className="text-sm cursor-pointer">
                                {m.label}
                              </Label>
                            </div>
                          </TableCell>
                          {ACTIONS.map((a) => (
                            <TableCell key={a} className="text-center">
                              <Checkbox
                                checked={matrix[m.key]?.[a] ?? false}
                                onCheckedChange={() => toggle(m.key, a)}
                              />
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => saveAll.mutate()} disabled={saveAll.isPending} className="gap-2">
          <Save className="size-4" />
          {saveAll.isPending ? "Salvando..." : "Salvar permissões"}
        </Button>
      </div>
    </Card>
  );
}

function FinancialTab() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();

  const { data: companySettings, isLoading } = useQuery({
    queryKey: ["company-settings", cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("company_id, cashflow_start_date, updated_at, updated_by, barcode_scanner_enabled, ai_enabled, ai_model, ai_connection_validated, ai_validated_at, barcode_label_config, stock_code_auto_generate, stock_code_prefix, profit_margin, allow_public_search, public_search_start_time, public_search_end_time, network_access_ttl_days, default_ncm, auto_logout_enabled, auto_logout_time, force_logout_at, last_forced_logout_at, accounting_name, accounting_email")
        .eq("company_id", cid)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      return (
        (data as any) || {
          cashflow_start_date: null,
          barcode_scanner_enabled: false,
          stock_code_prefix: "EST",
          stock_code_auto_generate: true,
          profit_margin: 0,
        }
      );
    },
    enabled: !!cid,
  });

  const [margin, setMargin] = useState<number>(0);
  const [cashflowStart, setCashflowStart] = useState<string>("");
  const [barcodeEnabled, setBarcodeEnabled] = useState(false);
  const [allowPublicSearch, setAllowPublicSearch] = useState(false);
  const [publicSearchStart, setPublicSearchStart] = useState<string>("");
  const [publicSearchEnd, setPublicSearchEnd] = useState<string>("");
  const [networkAccessTtl, setNetworkAccessTtl] = useState<number>(30);
  const [stockPrefix, setStockPrefix] = useState("EST");
  const [stockAutoGenerate, setStockAutoGenerate] = useState(true);
  const [defaultNcm, setDefaultNcm] = useState("");
  const [isSavingPrefix, setIsSavingPrefix] = useState(false);


  useEffect(() => {
    if (companySettings) {
      setMargin(Number(companySettings.profit_margin) || 0);
      setCashflowStart(companySettings.cashflow_start_date || "");
      setBarcodeEnabled(Boolean(companySettings.barcode_scanner_enabled));
      setAllowPublicSearch(Boolean((companySettings as any).allow_public_search));
      setPublicSearchStart(
        ((companySettings as any).public_search_start_time as string)?.slice(0, 5) || "",
      );
      setPublicSearchEnd(
        ((companySettings as any).public_search_end_time as string)?.slice(0, 5) || "",
      );
      setNetworkAccessTtl(Number((companySettings as any).network_access_ttl_days) || 30);
      setStockPrefix(companySettings.stock_code_prefix || "EST");
      setStockAutoGenerate(companySettings.stock_code_auto_generate !== false);
      setDefaultNcm(((companySettings as any).default_ncm || "").toString());
    }

  }, [companySettings]);

  const updateMut = useMutation({
    mutationFn: async (val: number) => {
      const { error } = await supabase
        .from("company_settings")
        .upsert({
          company_id: cid,
          profit_margin: val,
          updated_at: new Date().toISOString(),
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Margem atualizada");
      qc.invalidateQueries({ queryKey: ["company-settings", cid] });
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  const updateCashflowMut = useMutation({
    mutationFn: async (val: string) => {
      const { error } = await supabase
        .from("company_settings")
        .upsert({
          company_id: cid,
          cashflow_start_date: val || null,
          updated_at: new Date().toISOString(),
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Início do fluxo atualizado");
      qc.invalidateQueries({ queryKey: ["company-settings", cid] });
    },
    onError: (e: Error) => toast.error("Erro: " + e.message),
  });

  const updateBarcodeMut = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("company_settings")
        .upsert({
          company_id: cid,
          barcode_scanner_enabled: enabled,
          updated_at: new Date().toISOString(),
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração de scanner salva");
      qc.invalidateQueries({ queryKey: ["company-settings", cid] });
    },
  });

  if (isLoading)
    return <Card className="p-10 text-center text-muted-foreground">Carregando...</Card>;

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-10 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center">
            <DollarSign className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Geral & Financeiro</h3>
            <p className="text-sm text-muted-foreground">Parâmetros globais do sistema</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label>Margem de Lucro Padrão (%)</Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                value={margin}
                onChange={(e) => setMargin(Number(e.target.value))}
                className="max-w-[200px]"
              />
              <Button
                onClick={() => updateMut.mutate(margin)}
                disabled={updateMut.isPending}
                size="sm"
                variant="outline"
              >
                Salvar
              </Button>
            </div>
          </div>

          <div className="space-y-2 border-t pt-6">
            <Label>Data de Início do Fluxo de Caixa</Label>
            <div className="flex items-center gap-3">
              <Input
                type="date"
                value={cashflowStart}
                onChange={(e) => setCashflowStart(e.target.value)}
                className="max-w-[220px]"
              />
              <Button
                onClick={() => updateCashflowMut.mutate(cashflowStart)}
                disabled={updateCashflowMut.isPending}
                size="sm"
                variant="outline"
              >
                Salvar
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-md border p-4 border-t pt-6">
            <div className="flex items-start gap-3">
              <ScanBarcode className="size-5 text-brand-orange mt-1" />
              <div>
                <Label>Leitura por código de barras</Label>
                <p className="text-xs text-muted-foreground">
                  Botão de câmera no cadastro de produtos
                </p>
              </div>
            </div>
            <Checkbox
              checked={barcodeEnabled}
              onCheckedChange={(c) => {
                setBarcodeEnabled(c === true);
                updateBarcodeMut.mutate(c === true);
              }}
            />
          </div>

          <div className="space-y-4 border-t pt-6">
            <div className="flex items-start gap-3">
              <Tags className="size-5 text-brand-orange mt-1" />
              <div>
                <Label>Código de Estoque</Label>
                <p className="text-xs text-muted-foreground">Regras de geração automática</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Input
                value={stockPrefix}
                onChange={(e) => setStockPrefix(e.target.value.toUpperCase().slice(0, 5))}
                className="max-w-[120px]"
                placeholder="EST"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  supabase
                    .from("company_settings")
                    .upsert({ company_id: cid, stock_code_prefix: stockPrefix })
                    .then(() => toast.success("Prefixo salvo"));
                }}
              >
                Salvar
              </Button>
            </div>
          </div>

          <div className="space-y-4 border-t pt-6">
            <div className="flex items-start gap-3">
              <Tags className="size-5 text-brand-orange mt-1" />
              <div>
                <Label>NCM padrão</Label>
                <p className="text-xs text-muted-foreground">
                  Usado automaticamente quando a categoria selecionada não possuir NCM cadastrado.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Input
                value={defaultNcm}
                onChange={(e) => setDefaultNcm(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className="max-w-[160px]"
                placeholder="00000000"
                inputMode="numeric"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (defaultNcm && defaultNcm.length !== 8) {
                    toast.error("NCM deve conter 8 dígitos");
                    return;
                  }
                  const { error } = await supabase
                    .from("company_settings")
                    .upsert({ company_id: cid, default_ncm: defaultNcm || null } as any);
                  if (error) {
                    toast.error("Erro ao salvar: " + error.message);
                    return;
                  }
                  toast.success("NCM padrão salvo");
                  qc.invalidateQueries({ queryKey: ["company-settings", cid] });
                }}
              >
                Salvar
              </Button>
            </div>
          </div>

        </div>
      </Card>
    </div>
  );
}

function IntegrationsTab() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();

  const { data: companySettings, isLoading } = useQuery({
    queryKey: ["company-settings", cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_settings")
        .select("company_id, cashflow_start_date, updated_at, updated_by, barcode_scanner_enabled, ai_enabled, ai_model, ai_connection_validated, ai_validated_at, barcode_label_config, stock_code_auto_generate, stock_code_prefix, profit_margin, allow_public_search, public_search_start_time, public_search_end_time, network_access_ttl_days, default_ncm, auto_logout_enabled, auto_logout_time, force_logout_at, last_forced_logout_at, accounting_name, accounting_email")
        .eq("company_id", cid)
        .maybeSingle();
      if (error && error.code !== "PGRST116") throw error;
      return (data as any) || {};
    },
    enabled: !!cid,
  });

  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiModel, setAiModel] = useState("google/gemini-3-flash-preview");
  const [aiToken, setAiToken] = useState("");
  const [aiValidated, setAiValidated] = useState(false);

  useEffect(() => {
    if (companySettings) {
      setAiEnabled(Boolean(companySettings.ai_enabled));
      setAiModel(companySettings.ai_model || "google/gemini-3-flash-preview");
      setAiValidated(Boolean(companySettings.ai_connection_validated));
    }
  }, [companySettings]);

  // ai_token lives in a column with restricted access; fetch via RPC for admins
  useEffect(() => {
    if (!cid) return;
    (async () => {
      const { data } = await supabase.rpc("get_company_ai_token" as any, { _company: cid });
      if (typeof data === "string") setAiToken(data);
    })();
  }, [cid]);

  const updateAiMut = useMutation({
    mutationFn: async () => {
      const normalizedToken = normalizeAiToken(aiToken);
      const payload: any = {
        company_id: cid,
        ai_enabled: aiEnabled,
        ai_model: aiModel,
        ai_connection_validated: aiValidated,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from("company_settings").upsert(payload);
      if (error) throw error;
      if (normalizedToken) {
        const { error: tokErr } = await supabase.rpc("set_company_ai_token" as any, {
          _company: cid,
          _token: normalizedToken,
        });
        if (tokErr) throw tokErr;
      }
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["company-settings", cid] });
    },
  });

  const testAiMut = useMutation({
    mutationFn: async () => {
      const normalizedToken = normalizeAiToken(aiToken);
      const { data, error } = await supabase.functions.invoke("test-ai-connection", {
        body: { model: aiModel, token: normalizedToken, company_id: cid },
      });
      if (error || !data?.ok) throw new Error(data?.error || "Falha na conexão");
      await supabase
        .from("company_settings")
        .upsert({
          company_id: cid,
          ai_connection_validated: true,
          ai_validated_at: new Date().toISOString(),
        });
    },
    onSuccess: () => {
      setAiValidated(true);
      toast.success("Conexão validada!");
      qc.invalidateQueries({ queryKey: ["company-settings", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading)
    return <Card className="p-10 text-center text-muted-foreground">Carregando...</Card>;

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-10 rounded-lg bg-indigo-500/15 text-indigo-500 flex items-center justify-center">
            <Bot className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Integração com IA</h3>
            <p className="text-sm text-muted-foreground">
              Configure o modelo de IA usado nas buscas automáticas
            </p>
          </div>
        </div>

        <div className="space-y-4 rounded-md border p-4 bg-muted/30">
          <div className="flex items-center justify-between">
            <Label className="text-base">Habilitar IA</Label>
            <Checkbox
              checked={aiEnabled}
              onCheckedChange={(c) => {
                setAiEnabled(c === true);
                if (!c) setAiValidated(false);
              }}
            />
          </div>

          {aiEnabled && (
            <div className="grid gap-4 sm:grid-cols-2 pt-2">
              <div className="space-y-2">
                <Label>Modelo</Label>
                <Select
                  value={aiModel}
                  onValueChange={(v) => {
                    setAiModel(v);
                    setAiValidated(false);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LLM_MODELS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Token da API</Label>
                <Input
                  value={aiToken}
                  onChange={(e) => setAiToken(e.target.value)}
                  placeholder="Token"
                />
              </div>
            </div>
          )}

          {aiEnabled && (
            <div className="flex flex-wrap gap-2 pt-4 border-t">
              <Button
                onClick={() => updateAiMut.mutate()}
                disabled={updateAiMut.isPending}
                size="sm"
              >
                Salvar
              </Button>

              <Button
                variant="outline"
                onClick={() => testAiMut.mutate()}
                disabled={testAiMut.isPending}
                size="sm"
                className="gap-2"
              >
                Testar{" "}
                {aiValidated ? (
                  <CheckCircle2 className="size-4 text-green-500" />
                ) : (
                  <XCircle className="size-4 text-red-500" />
                )}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function ThermalTestButton() {
  const { currentCompanyId } = useAuth();
  const [testing, setTesting] = useState(false);

  const runTest = async () => {
    setTesting(true);
    try {
      const { usbEnabled, usbStoredDevice, usbPrintTest } = await import("@/lib/usb-print");
      const { qzEnabled, qzPrinterName, qzPrintTestReceipt } = await import("@/lib/qz-print");

      if (usbEnabled(currentCompanyId) && usbStoredDevice(currentCompanyId)) {
        await usbPrintTest(currentCompanyId);
        toast.success("Teste enviado via WebUSB — verifique se a impressora imprimiu.");
        return;
      }
      if (qzEnabled(currentCompanyId) && qzPrinterName(currentCompanyId)) {
        await qzPrintTestReceipt(qzPrinterName(currentCompanyId) || undefined);
        toast.success("Teste enviado via QZ Tray — verifique se a impressora imprimiu.");
        return;
      }
      toast.error(
        "Nenhum método de impressão ativo. Habilite e pareie WebUSB ou conecte o QZ Tray antes de testar.",
      );
    } catch (e: any) {
      toast.error(e?.message || "Falha ao imprimir o teste");
    } finally {
      setTesting(false);
    }
  };

  return (
    <Card className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <TestTube2 className="size-4" />
        </div>
        <div className="min-w-0">
          <div className="font-semibold">Testar impressão agora</div>
          <p className="text-xs text-muted-foreground">
            Envia um cupom de teste usando o método ativo (WebUSB ou QZ Tray) para
            confirmar que a impressora responde antes de salvar.
          </p>
        </div>
      </div>
      <Button onClick={runTest} disabled={testing} className="gap-2 w-full sm:w-auto shrink-0">
        {testing ? <Loader2 className="size-4 animate-spin" /> : <TestTube2 className="size-4" />}
        Imprimir teste
      </Button>
    </Card>
  );
}



function PrintingTab() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  return (
    <Tabs defaultValue="receipt" className="space-y-4">
      <TabsList className="bg-card border border-border h-auto flex-wrap justify-start">
        <TabsTrigger value="receipt" className="gap-2">
          <Receipt className="size-4" /> Cupom
        </TabsTrigger>
        <TabsTrigger value="thermal" className="gap-2">
          <Printer className="size-4" /> Impressora térmica
        </TabsTrigger>
        <TabsTrigger value="labels" className="gap-2">
          <Tags className="size-4" /> Etiquetas
        </TabsTrigger>
      </TabsList>
      <TabsContent value="receipt" className="space-y-4">
        <ReceiptConfigTab />
      </TabsContent>
      <TabsContent value="thermal" className="space-y-4">
        <div className="max-w-4xl space-y-4 pb-20">
          <ThermalTestButton />
          <Accordion
            type="single"
            collapsible
            className="space-y-3"
          >
            <AccordionItem value="usb" className="border rounded-lg bg-card px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center">
                    <Usb className="size-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold">Impressão direta USB (WebUSB)</div>
                    <div className="text-xs text-muted-foreground">
                      Recomendado — sem instalar nada
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <UsbPrintSettings />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="qz" className="border rounded-lg bg-card px-4">
              <AccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="size-9 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center">
                    <Printer className="size-4" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold">Impressão local (QZ Tray)</div>
                    <div className="text-xs text-muted-foreground">
                      Alternativa — lista impressoras do sistema
                    </div>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-2">
                <QzTraySettings />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </TabsContent>
      <TabsContent value="labels" className="space-y-4">
        <LabelTemplatesConfig companyId={cid} />
      </TabsContent>
    </Tabs>
  );
}

function ReceiptConfigTab() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;

  const companyQ = useQuery({
    queryKey: ["company-detail", cid],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name, cnpj")
        .eq("id", cid)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!cid,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 10,
  });

  const [header, setHeader] = useState("");
  const [showColumns, setShowColumns] = useState(true);
  const [showSummary, setShowSummary] = useState(true);
  const [showTotals, setShowTotals] = useState(true);
  const [footerMessage, setFooterMessage] = useState("Obrigado pela preferência!");

  // New settings
  const [showCnpjAddress, setShowCnpjAddress] = useState(false);
  const [showCustomerData, setShowCustomerData] = useState(false);
  const [showDetailedInstallments, setShowDetailedInstallments] = useState(false);
  const [receiptWidth, setReceiptWidth] = useState("280"); // em px
  const [fontSizePx, setFontSizePx] = useState("12"); // tamanho base
  const [lineHeight, setLineHeight] = useState("1.35"); // ~ LPI
  const [boldStrength, setBoldStrength] = useState("0.4"); // reforço de negrito
  const [defaultPrinterReceipt, setDefaultPrinterReceipt] = useState("browser");
  const [defaultPrinterCashClosing, setDefaultPrinterCashClosing] = useState("browser");

  useEffect(() => {
    const saved = localStorage.getItem(`print_settings_${cid}`);
    const companyName = companyQ.data?.name || "AUTO PEÇAS ERP";

    if (saved) {
      const parsed = JSON.parse(saved);
      setHeader(parsed.header || companyName);
      setShowColumns(parsed.showColumns !== false);
      setShowSummary(parsed.showSummary !== false);
      setShowTotals(parsed.showTotals !== false);
      setFooterMessage(parsed.footerMessage || "Obrigado pela preferência!");

      setShowCnpjAddress(!!parsed.showCnpjAddress);
      setShowCustomerData(!!parsed.showCustomerData);
      setShowDetailedInstallments(!!parsed.showDetailedInstallments);
      setReceiptWidth(parsed.receiptWidth || "280");
      setFontSizePx(parsed.fontSizePx || "12");
      setLineHeight(parsed.lineHeight || "1.35");
      setBoldStrength(parsed.boldStrength ?? "0.4");
      setDefaultPrinterReceipt(parsed.defaultPrinterReceipt || "browser");
      setDefaultPrinterCashClosing(parsed.defaultPrinterCashClosing || "browser");
    } else {
      setHeader(companyName);
    }
  }, [cid, companyQ.data]);

  const save = () => {
    localStorage.setItem(
      `print_settings_${cid}`,
      JSON.stringify({
        header,
        showColumns,
        showSummary,
        showTotals,
        footerMessage,
        showCnpjAddress,
        showCustomerData,
        showDetailedInstallments,
        receiptWidth,
        fontSizePx,
        lineHeight,
        boldStrength,
        defaultPrinterReceipt,
        defaultPrinterCashClosing,
      }),
    );
    toast.success("Configurações de impressão salvas");
  };

  return (
    <div className="max-w-6xl space-y-4 pb-20">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="p-4 sm:p-6 min-w-0">

          <div className="flex items-center gap-3 mb-6">
            <div className="size-10 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center">
              <Receipt className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Configurações do Cupom</h3>
              <p className="text-sm text-muted-foreground">
                Personalize as informações do cupom impresso
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="header_text">Cabeçalho do Cupom</Label>
              <Input
                id="header_text"
                value={header}
                onChange={(e) => setHeader(e.target.value)}
                placeholder="Ex: AUTO PEÇAS DO JOÃO"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="printer_receipt">Impressora de Cupons</Label>
                <Select value={defaultPrinterReceipt} onValueChange={setDefaultPrinterReceipt}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="browser">Padrão do Navegador</SelectItem>
                    <SelectItem value="thermal_80mm">Térmica 80mm (Rede/USB)</SelectItem>
                    <SelectItem value="thermal_58mm">Térmica 58mm (Rede/USB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="printer_closing">Impressora de Fechamento</Label>
                <Select
                  value={defaultPrinterCashClosing}
                  onValueChange={setDefaultPrinterCashClosing}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="browser">Padrão do Navegador</SelectItem>
                    <SelectItem value="thermal_80mm">Térmica 80mm (Rede/USB)</SelectItem>
                    <SelectItem value="thermal_58mm">Térmica 58mm (Rede/USB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Label htmlFor="receipt_width">Largura do Cupom (px)</Label>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <Input
                  id="receipt_width"
                  type="number"
                  value={receiptWidth}
                  onChange={(e) => setReceiptWidth(e.target.value)}
                  className="w-24 shrink-0"
                />
                <span className="text-xs text-muted-foreground min-w-0">
                  Sugestão: 280 para 80mm, 200 para 58mm.
                </span>
              </div>

            </div>

            <div className="grid gap-4 sm:grid-cols-3 pt-2">
              <div className="space-y-2">
                <Label htmlFor="font_size">Tamanho da fonte (px)</Label>
                <Input
                  id="font_size"
                  type="number"
                  min={8}
                  max={20}
                  step={1}
                  value={fontSizePx}
                  onChange={(e) => setFontSizePx(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">Padrão: 12. Maior = mais legível.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="line_height">Espaçamento (linhas/pol.)</Label>
                <Input
                  id="line_height"
                  type="number"
                  min={1}
                  max={2}
                  step={0.05}
                  value={lineHeight}
                  onChange={(e) => setLineHeight(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">1.2 compacto • 1.35 padrão • 1.6 espaçado.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bold_strength">Reforço do negrito</Label>
                <Input
                  id="bold_strength"
                  type="number"
                  min={0}
                  max={1}
                  step={0.1}
                  value={boldStrength}
                  onChange={(e) => setBoldStrength(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">0 sem reforço • 0.4 padrão • 0.7 térmica clara.</p>
              </div>
            </div>

            <div className="space-y-4 border-t border-border pt-6">
              <Label>Informações Visíveis</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show_cnpj"
                    checked={showCnpjAddress}
                    onCheckedChange={(c) => setShowCnpjAddress(c === true)}
                  />
                  <Label htmlFor="show_cnpj" className="text-sm cursor-pointer">
                    CNPJ e Endereço
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show_customer"
                    checked={showCustomerData}
                    onCheckedChange={(c) => setShowCustomerData(c === true)}
                  />
                  <Label htmlFor="show_customer" className="text-sm cursor-pointer">
                    Dados do Cliente
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show_columns"
                    checked={showColumns}
                    onCheckedChange={(c) => setShowColumns(c === true)}
                  />
                  <Label htmlFor="show_columns" className="text-sm cursor-pointer">
                    Colunas de Itens
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show_summary"
                    checked={showSummary}
                    onCheckedChange={(c) => setShowSummary(c === true)}
                  />
                  <Label htmlFor="show_summary" className="text-sm cursor-pointer">
                    Resumo (Subtotal/Desc)
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show_totals"
                    checked={showTotals}
                    onCheckedChange={(c) => setShowTotals(c === true)}
                  />
                  <Label htmlFor="show_totals" className="text-sm cursor-pointer">
                    Totais e Pagamento
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="show_installments"
                    checked={showDetailedInstallments}
                    onCheckedChange={(c) => setShowDetailedInstallments(c === true)}
                  />
                  <Label htmlFor="show_installments" className="text-sm cursor-pointer">
                    Parcelamento Detalhado
                  </Label>
                </div>
              </div>
            </div>

            <div className="space-y-2 border-t border-border pt-6">
              <Label htmlFor="footer_message">Mensagem de Rodapé</Label>
              <Textarea
                id="footer_message"
                value={footerMessage}
                onChange={(e) => setFooterMessage(e.target.value)}
                placeholder="Ex: Volte sempre!"
                rows={2}
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-end items-stretch sm:items-center gap-2 pt-4 border-t border-border">
              <ReceiptPreview
                settings={{
                  header,
                  showColumns,
                  showSummary,
                  showTotals,
                  footerMessage,
                  showCnpjAddress,
                  showCustomerData,
                  showDetailedInstallments,
                  receiptWidth,
                  fontSizePx,
                  lineHeight,
                  boldStrength,
                }}
              />
              <Button
                variant="outline"
                onClick={() => {
                  const css = receiptStyle({
                    widthPx: receiptWidth,
                    fontSizePx,
                    lineHeight,
                    boldStrength,
                  });
                  const html = `<html><head><title>Teste de Impressão</title><style>${css}</style></head><body>
                    <h2>TESTE DE IMPRESSÃO</h2>
                    <div class="header-text">${header || "AUTO PEÇAS ERP"}</div>
                    <div class="company-sub">Verificação das configurações</div>
                    <div class="divider"></div>
                    <div class="row"><span>Largura:</span><span>${receiptWidth}px</span></div>
                    <div class="row"><span>Fonte:</span><span>${fontSizePx}px</span></div>
                    <div class="row"><span>Espaçamento:</span><span>${lineHeight}</span></div>
                    <div class="row"><span>Negrito:</span><span>${boldStrength}</span></div>
                    <div class="row"><span>Data/Hora:</span><span>${new Date().toLocaleString("pt-BR")}</span></div>
                    <div class="divider"></div>
                    <table>
                      <thead><tr><th>Item</th><th class="right">Valor</th></tr></thead>
                      <tbody>
                        <tr><td>1 UN x ÓLEO MOTOR 5W30</td><td class="right">R$ 55,00</td></tr>
                        <tr><td>1 UN x FILTRO COMBUSTÍVEL</td><td class="right">R$ 20,00</td></tr>
                        <tr><td>2 UN x PALHETA TRASEIRA</td><td class="right">R$ 30,00</td></tr>
                      </tbody>
                    </table>
                    <div class="divider"></div>
                    <div class="row big"><span>TOTAL:</span><span>R$ 105,00</span></div>
                    <div class="divider"></div>
                    <div class="footer">${footerMessage || "Obrigado pela preferência!"}</div>
                  </body></html>`;

                  const useQz = qzEnabled(cid) && qzPrinterName(cid);
                  if (useQz) {
                    qzPrintHtml80mm(html, { widthPx: receiptWidth || "280" })
                      .then(() => toast.success("Teste enviado para a impressora (QZ Tray)."))
                      .catch((e) => {
                        toast.error(e?.message || "Falha no teste via QZ Tray.");
                      });
                    return;
                  }
                  // Fallback navegador: usa um iframe oculto para evitar
                  // pop-up bloqueado e garantir que window.print() dispare
                  // após o conteúdo carregar.
                  const iframe = document.createElement("iframe");
                  iframe.style.cssText =
                    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
                  iframe.setAttribute("aria-hidden", "true");
                  document.body.appendChild(iframe);
                  const cleanup = () => {
                    setTimeout(() => {
                      try {
                        document.body.removeChild(iframe);
                      } catch {
                        /* noop */
                      }
                    }, 1000);
                  };
                  iframe.onload = () => {
                    try {
                      const w = iframe.contentWindow;
                      if (!w) {
                        toast.error("Falha ao abrir a janela de impressão.");
                        cleanup();
                        return;
                      }
                      w.focus();
                      w.print();
                      w.addEventListener?.("afterprint", cleanup, { once: true });
                      setTimeout(cleanup, 5000);
                    } catch {
                      toast.error("Falha ao imprimir teste.");
                      cleanup();
                    }
                  };
                  iframe.srcdoc = html;
                }}
                className="w-full sm:w-auto gap-2"
              >
                <Printer className="size-4" /> Imprimir Teste
              </Button>
              <Button onClick={save} className="w-full sm:w-auto gap-2">
                <Save className="size-4" /> Salvar Configurações
              </Button>
            </div>
          </div>
        </Card>

        <div className="hidden xl:block">
          <div className="sticky top-6">
            <div className="text-center mb-2">
              <Badge variant="outline">Prévia em tempo real</Badge>
            </div>
            <div className="flex justify-center">
              <ReceiptPreviewContent
                settings={{
                  header,
                  showColumns,
                  showSummary,
                  showTotals,
                  footerMessage,
                  showCnpjAddress,
                  showCustomerData,
                  showDetailedInstallments,
                  receiptWidth,
                  fontSizePx,
                  lineHeight,
                  boldStrength,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReceiptPreview({ settings }: { settings: any }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Eye className="size-4" /> Prévia do Cupom
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[95vw] sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Prévia do Cupom</DialogTitle>
        </DialogHeader>
        <div className="flex justify-center bg-accent/50 p-4 rounded-lg overflow-auto max-h-[70vh]">
          <ReceiptPreviewContent settings={settings} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReceiptPreviewContent({ settings }: { settings: any }) {
  const { currentCompanyId } = useAuth();

  const fiscalQ = useQuery({
    queryKey: ["fiscal-settings", currentCompanyId],
    queryFn: async () => {
      const { data } = await supabase
        .from("fiscal_settings")
        .select("*")
        .eq("company_id", currentCompanyId!)
        .maybeSingle();
      return data;
    },
    enabled: !!currentCompanyId && settings.showCnpjAddress,
  });

  const fiscal = fiscalQ.data;

  return (
    <div
      className="bg-white text-black p-4 shadow-sm border border-border"
      style={{
        width: `${settings.receiptWidth}px`,
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: "12px",
        lineHeight: "1.2",
      }}
    >
      <div className="text-center font-bold text-base mb-1">COMPROVANTE DE VENDA</div>
      {settings.header && <div className="text-center font-bold mb-1">{settings.header}</div>}

      {settings.showCnpjAddress && fiscal && (
        <div className="text-center text-[10px] mb-1">
          {fiscal.razao_social && <div>{fiscal.razao_social}</div>}
          {fiscal.cnpj && <div>CNPJ: {fiscal.cnpj}</div>}
          {fiscal.endereco && <div>{fiscal.endereco}</div>}
        </div>
      )}

      <div className="text-center text-[10px]">Data: {new Date().toLocaleString("pt-BR")}</div>
      <div className="text-center text-[10px]">Venda: #000123</div>

      {settings.showCustomerData && (
        <div className="border-t border-dashed border-black mt-2 pt-2 text-[10px]">
          <div className="font-bold">CLIENTE:</div>
          <div>JOÃO DA SILVA</div>
          <div>CPF: 000.000.000-00</div>
        </div>
      )}

      <div className="border-b border-dashed border-black my-2"></div>

      {settings.showColumns ? (
        <table className="w-full text-[10px]">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left">PROD</th>
              <th className="text-left">QTD</th>
              <th className="text-right">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>FILTRO DE ÓLEO</td>
              <td>1</td>
              <td className="text-right">R$ 45,00</td>
            </tr>
            <tr>
              <td>ÓLEO 5W30 1L</td>
              <td>4</td>
              <td className="text-right">R$ 220,00</td>
            </tr>
          </tbody>
        </table>
      ) : (
        <div className="text-[10px] italic text-center">Itens ocultos nas configurações</div>
      )}

      {settings.showSummary && (
        <div className="border-t border-dashed border-black mt-2 pt-2">
          <div className="flex justify-between text-[10px]">
            <span>SUBTOTAL:</span> <span>R$ 265,00</span>
          </div>
          <div className="flex justify-between text-[10px]">
            <span>DESCONTO:</span> <span>R$ 15,00</span>
          </div>
        </div>
      )}

      {settings.showTotals && (
        <div className="mt-2">
          <div className="flex justify-between font-bold text-[12px]">
            <span>TOTAL:</span> <span>R$ 250,00</span>
          </div>
          <div className="border-t border-dashed border-black mt-1 pt-1"></div>
          <div className="flex justify-between text-[10px]">
            <span>MÉTODO:</span> <span>CARTÃO DE CRÉDITO</span>
          </div>

          {settings.showDetailedInstallments && (
            <div className="text-[10px] pl-2">
              <div>- 1/3: R$ 83,34 (15/05)</div>
              <div>- 2/3: R$ 83,33 (15/06)</div>
              <div>- 3/3: R$ 83,33 (15/07)</div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 text-center border-t border-dashed border-black pt-2">
        <div className="text-[10px]">{settings.footerMessage}</div>
      </div>

      <div className="mt-3 pt-2 border-t border-dashed border-black text-center">
        <div className="text-[11px] font-bold">Faça sua avaliação</div>
        <div className="text-[10px] mb-1">Conte-nos como foi a sua experiência</div>
        <img
          src="/__l5e/assets-v1/39befd4c-2c54-4182-b44d-7642d3876149/google-review-qr.png"
          alt="QR Avaliação"
          className="mx-auto"
          style={{ width: 110, height: 110 }}
        />
      </div>
    </div>
  );
}
