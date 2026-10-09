import { makePrefetchLoader } from "@/lib/route-prefetch";
import { receiptStyle } from "@/lib/receipt-style";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchProducts, fetchPartners, createQuotation, fetchQuotations, updateQuotation, deleteQuotation, fetchCompany, upsertPartner } from "@/lib/db";
import { PageHeading } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Trash2, FileText, Calculator, User, Package, ShoppingCart, Printer, Receipt, Save, Edit, MoreVertical, PackagePlus, UserPlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { brl, parseCurrencyInput, formatCurrencyInput } from "@/lib/format";
import { toast } from "sonner";
import { maskCpfCnpj } from "@/lib/masks";
import { EntitySelectorDialog } from "@/components/entity-selector-dialog";
import { PrintPreviewDialog } from "@/components/print-preview-dialog";
import { useConfirm } from "@/components/confirm-dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Product, Partner, Quotation } from "@/lib/db-types";
export const Route = createFileRoute("/app/orcamentos")({
  loader: makePrefetchLoader(["quotations", "clients", "paymentMethods"]),
  component: QuotationPage,
});

interface QuotationItem {
  product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
}

function QuotationPage() {
  const { currentCompanyId, user } = useAuth();
  const cid = currentCompanyId!;
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [items, setItems] = useState<QuotationItem[]>([]);
  const [customer, setCustomer] = useState<Partner | null>(null);
  const [notes, setNotes] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState("");

  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customQty, setCustomQty] = useState("1");
  const [customPriceRaw, setCustomPriceRaw] = useState("0,00");

  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickCustName, setQuickCustName] = useState("");
  const [quickCustPhone, setQuickCustPhone] = useState("");
  const [quickCustDoc, setQuickCustDoc] = useState("");
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);


  const companyQ = useQuery({
    queryKey: ["company", cid],
    queryFn: () => fetchCompany(cid),
    enabled: !!cid,
  });

  const productsQ = useQuery({
    queryKey: ["products-all", cid],
    queryFn: () => fetchProducts(cid),
    enabled: !!cid,
  });

  const partnersQ = useQuery({
    queryKey: ["partners", cid, "cliente"],
    queryFn: () => fetchPartners(cid, "cliente"),
    enabled: !!cid,
  });

  const quotationsQ = useQuery({
    queryKey: ["quotations", cid],
    queryFn: () => fetchQuotations(cid),
    enabled: !!cid,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        company_id: cid,
        customer_id: customer?.id || null,
        customer_name: customer?.name || "Consumidor Final",
        subtotal: total,
        total: total,
        notes: notes,
        items: items,
        created_by: user?.id,
      };

      if (editingId) {
        return updateQuotation(editingId, payload);
      } else {
        return createQuotation(payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations", cid] });
      toast.success(editingId ? "Orçamento atualizado!" : "Orçamento salvo com sucesso!");
      resetForm();
    },
    onError: (err: any) => {
      console.error(err);
      toast.error("Erro ao salvar orçamento");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteQuotation,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quotations", cid] });
      toast.success("Orçamento excluído!");
    }
  });

  const resetForm = () => {
    setItems([]);
    setCustomer(null);
    setNotes("");
    setEditingId(null);
  };

  const addItem = (productId: string) => {
    const product = productsQ.data?.find(p => p.id === productId);
    if (!product) return;

    if (items.some(i => i.product_id === product.id)) {
      toast.error("Produto já adicionado");
      return;
    }
    setItems([...items, {
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      quantity: 1,
      unit_price: product.sale_price || 0
    }]);
  };

  const addCustomItem = () => {
    const name = customName.trim();
    if (!name) { toast.error("Informe o nome do produto"); return; }
    const qty = Number(customQty) || 0;
    if (qty <= 0) { toast.error("Quantidade inválida"); return; }
    const price = parseCurrencyInput(customPriceRaw);
    setItems((prev) => [...prev, {
      product_id: `custom-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,
      name,
      sku: "AVULSO",
      quantity: qty,
      unit_price: price,
    }]);
    setCustomName(""); setCustomQty("1"); setCustomPriceRaw("0,00");
    setCustomOpen(false);
  };

  const handleQuickCustomer = async () => {
    if (!quickCustName.trim()) {
      toast.error("Informe pelo menos o nome do cliente");
      return;
    }

    try {
      setIsCreatingCustomer(true);
      const newPartner = await upsertPartner(cid, {
        name: quickCustName,
        phone: quickCustPhone,
        doc: quickCustDoc,
        type: "cliente",
        active: true,
        userId: user?.id
      });
      
      setCustomer(newPartner);
      queryClient.invalidateQueries({ queryKey: ["partners", cid, "cliente"] });
      toast.success("Cliente cadastrado e selecionado!");
      
      setQuickCustName("");
      setQuickCustPhone("");
      setQuickCustDoc("");
      setQuickCustomerOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Erro ao cadastrar cliente");
    } finally {
      setIsCreatingCustomer(false);
    }
  };

  const removeItem = (productId: string) => {
    setItems(items.filter(i => i.product_id !== productId));
  };

  const updateItem = (productId: string, patch: Partial<QuotationItem>) => {
    setItems(items.map(i => i.product_id === productId ? { ...i, ...patch } : i));
  };

  const total = useMemo(() => items.reduce((acc, i) => acc + (i.quantity * i.unit_price), 0), [items]);

  const generatePDF = () => {
    if (items.length === 0) {
      toast.error("Adicione pelo menos um produto");
      return;
    }

    const now = new Date().toLocaleString("pt-BR");
    const company = companyQ.data;
    
    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <style>
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; }
    body { font-family: sans-serif; padding: 20mm; color: #333; line-height: 1.4; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #ef4444; padding-bottom: 20px; margin-bottom: 30px; }
    .company-info h1 { margin: 0; color: #ef4444; font-size: 28px; text-transform: uppercase; letter-spacing: 1px; }
    .company-details { font-size: 13px; color: #666; margin-top: 8px; }
    .quotation-title { text-align: right; }
    .quotation-title h2 { margin: 0; font-size: 20px; color: #444; }
    .quotation-number { font-weight: bold; font-size: 16px; margin-top: 5px; color: #ef4444; }
    
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-bottom: 30px; }
    .info-box { border: 1px solid #eee; padding: 15px; border-radius: 8px; }
    .info-label { font-weight: bold; text-transform: uppercase; font-size: 11px; color: #999; margin-bottom: 8px; display: block; }
    .info-value { font-size: 14px; font-weight: 500; }
    
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th { background: #f8fafc; text-align: left; padding: 12px 10px; border-bottom: 2px solid #ef4444; font-size: 12px; text-transform: uppercase; color: #64748b; }
    td { padding: 12px 10px; border-bottom: 1px solid #f1f5f9; font-size: 13px; }
    tr:nth-child(even) { background-color: #fcfcfc; }
    
    .totals-area { display: flex; justify-content: flex-end; }
    .totals-table { width: 250px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
    .total-row.grand-total { border-bottom: none; margin-top: 10px; padding-top: 15px; border-top: 2px solid #ef4444; }
    .total-label { font-size: 14px; color: #64748b; }
    .total-value { font-size: 14px; font-weight: bold; }
    .grand-total .total-label { font-size: 18px; color: #1e293b; font-weight: 800; }
    .grand-total .total-value { font-size: 22px; color: #ef4444; font-weight: 900; }
    
    .notes { margin-top: 40px; font-size: 13px; background: #f8fafc; padding: 20px; border-radius: 8px; border-left: 4px solid #cbd5e1; }
    .footer { margin-top: 60px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div class="company-info">
      <h1>${company?.name || "ORÇAMENTO"}</h1>
      <div class="company-details">
        ${company?.cnpj ? `CNPJ: ${company.cnpj}<br/>` : ""}
        ${company?.phone ? `Tel: ${company.phone}<br/>` : ""}
        Gerado em ${now}
      </div>
    </div>
    <div class="quotation-title">
      <h2>Documento de Proposta</h2>
      <div class="quotation-number">#${editingId ? editingId.substring(0, 8).toUpperCase() : Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}</div>
    </div>
  </div>

  <div class="info-grid">
    <div class="info-box">
      <span class="info-label">Cliente / Destinatário</span>
      <div class="info-value">${customer?.name || "Consumidor Final"}</div>
      ${customer?.phone ? `<div style="font-size: 12px; color: #666; margin-top: 4px;">Tel: ${customer.phone}</div>` : ''}
      ${customer?.email ? `<div style="font-size: 12px; color: #666; margin-top: 2px;">Email: ${customer.email}</div>` : ''}
    </div>
    <div class="info-box">
      <span class="info-label">Validade e Status</span>
      <div class="info-value" style="color: #f59e0b;">VÁLIDO POR 7 DIAS</div>
      <div style="font-size: 12px; color: #666; margin-top: 4px;">Sujeito a disponibilidade de estoque</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 15%">Cód/SKU</th>
        <th style="width: 45%">Produto / Descrição</th>
        <th style="width: 10%; text-align: center">Qtd</th>
        <th style="width: 15%; text-align: right">Unitário</th>
        <th style="width: 15%; text-align: right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${items.map(i => `
        <tr>
          <td style="font-family: monospace; color: #64748b;">${i.sku}</td>
          <td style="font-weight: 500;">${i.name}</td>
          <td style="text-align: center">${i.quantity}</td>
          <td style="text-align: right">${brl(i.unit_price)}</td>
          <td style="text-align: right; font-weight: bold;">${brl(i.quantity * i.unit_price)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals-area">
    <div class="totals-table">
      <div class="total-row">
        <span class="total-label">Subtotal</span>
        <span class="total-value">${brl(total)}</span>
      </div>
      <div class="total-row grand-total">
        <span class="total-label">TOTAL</span>
        <span class="total-value">${brl(total)}</span>
      </div>
    </div>
  </div>

  ${notes ? `<div class="notes"><span class="info-label">Observações e Condições</span><br/>${notes.replace(/\n/g, '<br/>')}</div>` : ''}

  <div class="footer">
    Este documento é uma proposta comercial e não possui validade fiscal.<br/>
    Preços e condições válidos por 7 dias a contar da data de emissão.
  </div>
</body>
</html>`;

    setPreviewContent(html);
    setShowPreview(true);
  };

  const printSettings = useMemo(() => {
    try {
      const saved = localStorage.getItem(`print_settings_${cid}`);
      if (saved) return JSON.parse(saved);
    } catch { /* ignore */ }
    return { receiptWidth: "280", fontSizePx: 12, lineHeight: 1.35, boldStrength: 0.4 };
  }, [cid]);

  const generateReceipt = (source?: Quotation) => {
    const srcItems: QuotationItem[] = source ? (source.items as QuotationItem[]) : items;
    const srcNotes = source ? (source.notes || "") : notes;
    const srcCustomerName = source ? (source.customer_name || "") : (customer?.name || "");
    const srcCustomerPhone = source ? "" : (customer?.phone || "");
    const srcTotal = source ? Number(source.total) : total;
    if (srcItems.length === 0) {
      toast.error("Adicione pelo menos um produto");
      return;
    }
    const now = source
      ? new Date(source.created_at).toLocaleString("pt-BR")
      : new Date().toLocaleString("pt-BR");
    const company = companyQ.data as any;
    const companyName = (company?.name || "ORÇAMENTO").trim();
    const companyAddr = (company?.address || company?.endereco || "").trim();
    const companyPhone = (company?.phone || "").trim();
    const numero = source
      ? source.id.substring(0, 8).toUpperCase()
      : editingId
      ? editingId.substring(0, 8).toUpperCase()
      : Math.floor(Math.random() * 1000000).toString().padStart(6, "0");
    const headerHtml = `<div class="header-text">${companyName}</div>${companyAddr ? `<div class="company-sub">${companyAddr}</div>` : ""}${companyPhone ? `<div class="company-sub">Tel: ${companyPhone}</div>` : ""}`;
    const customerHtml = srcCustomerName
      ? `<div class="divider"></div><div style="font-size: 10px;"><div class="bold">CLIENTE:</div><div>${srcCustomerName}</div>${srcCustomerPhone ? `<div>Tel: ${srcCustomerPhone}</div>` : ""}</div>`
      : "";
    const itemsHtml = `<table style="margin-top: 5px;"><thead><tr><th style="text-align: left">PROD</th><th style="text-align: left">QTD</th><th style="text-align: right">TOTAL</th></tr></thead><tbody>${srcItems.map(i => `<tr><td>${i.name}</td><td>${i.quantity}</td><td style="text-align: right">${brl(i.quantity * i.unit_price)}</td></tr>`).join("")}</tbody></table>`;
    const notesHtml = srcNotes
      ? `<div class="divider"></div><div style="font-size: 10px;"><div class="bold">OBSERVAÇÕES:</div><div>${srcNotes.replace(/\n/g, "<br/>")}</div></div>`
      : "";
    const style = receiptStyle({
      widthPx: printSettings.receiptWidth || "280",
      fontSizePx: printSettings.fontSizePx,
      lineHeight: printSettings.lineHeight,
      boldStrength: printSettings.boldStrength,
    });
    const html = `<html><head><title>Orçamento</title><style>${style}</style></head><body><h2>ORÇAMENTO</h2>${headerHtml}<div class="divider"></div><div class="center">Data: ${now}</div><div class="center">Nº ${numero}</div>${customerHtml}<div class="divider"></div>${itemsHtml}<div class="divider"></div><div class="row bold mt"><span>TOTAL:</span> <span>${brl(srcTotal)}</span></div>${notesHtml}<div class="footer"><div>Válido por 7 dias.</div><div>Documento sem valor fiscal.</div></div></body></html>`;
    setPreviewContent(html);
    setShowPreview(true);
  };


  const handleEdit = (q: Quotation) => {
    setEditingId(q.id);
    setItems(q.items as QuotationItem[]);
    setNotes(q.notes || "");
    const partner = partnersQ.data?.find(p => p.id === q.customer_id);
    setCustomer(partner || null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (id: string) => {
    if (await confirm({
      title: "Excluir orçamento?",
      description: "Esta ação não pode ser desfeita.",
      confirmLabel: "Excluir",
      variant: "destructive"
    })) {
      deleteMutation.mutate(id);
    }
  };

  const clearQuotation = async () => {
    if (items.length === 0 && !editingId) return;
    if (await confirm({
      title: editingId ? "Cancelar edição?" : "Limpar orçamento?",
      description: editingId ? "As alterações não salvas serão perdidas." : "Todos os itens adicionados serão removidos.",
      confirmLabel: editingId ? "Sair" : "Limpar",
      variant: "destructive"
    })) {
      resetForm();
    }
  };

  return (
    <div className="container p-4 lg:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeading 
          icon={FileText}
          title={editingId ? "Editar Orçamento" : "Geração de Orçamentos"} 
          subtitle={editingId ? "Atualize os dados do orçamento selecionado" : "Crie orçamentos profissionais para seus clientes com opção de ajuste de preços"}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={clearQuotation} disabled={items.length === 0 && !editingId}>
            <Trash2 className="size-4 mr-2" />
            {editingId ? "Cancelar" : "Limpar"}
          </Button>
          <Button 
            className="bg-brand-orange hover:bg-brand-orange/90 text-white" 
            onClick={() => saveMutation.mutate()} 
            disabled={items.length === 0 || saveMutation.isPending}
          >
            <Save className="size-4 mr-2" />
            {saveMutation.isPending ? "Salvando..." : (editingId ? "Atualizar" : "Salvar")}
          </Button>
          <Button variant="outline" onClick={() => generateReceipt()} disabled={items.length === 0}>
            <Receipt className="size-4 mr-2" />
            Imprimir Cupom
          </Button>
          <Button className="bg-brand-red hover:bg-brand-red/90 text-white" onClick={generatePDF} disabled={items.length === 0}>
            <Printer className="size-4 mr-2" />
            Gerar PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-4 sm:p-6 border-brand-red/10 shadow-sm space-y-4">
            <div className="flex items-center gap-2">
              <Package className="size-5 text-muted-foreground" />
              <h3 className="font-bold">Adicionar Produtos</h3>
            </div>
            
            <div className="grid sm:grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-12 border-dashed border-2 hover:border-brand-red hover:text-brand-red"
                onClick={() => setProductPickerOpen(true)}
              >
                <Search className="size-4 mr-2" />
                Pesquisar Produtos
              </Button>
              <Button
                variant="outline"
                className="h-12 border-dashed border-2 hover:border-brand-orange hover:text-brand-orange"
                onClick={() => setCustomOpen(true)}
              >
                <PackagePlus className="size-4 mr-2" />
                Adicionar produto avulso
              </Button>
            </div>


            <EntitySelectorDialog
              open={productPickerOpen}
              onOpenChange={setProductPickerOpen}
              title="Buscar Produto"
              items={(productsQ.data ?? []).map(p => ({
                id: p.id,
                name: `${p.name} (${p.sku}) - ${brl(p.sale_price || 0)}`
              }))}
              onSelect={addItem}
            />
          </Card>

          <Card className="p-4 sm:p-6 border-brand-red/20 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 rounded-lg bg-brand-red/10 text-brand-red">
                <ShoppingCart className="size-5" />
              </div>
              <h2 className="text-lg font-bold">Itens do Orçamento {editingId && <span className="text-muted-foreground font-normal ml-2"># {editingId.substring(0,8)}</span>}</h2>
            </div>

            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="w-[120px]">SKU</TableHead>
                    <TableHead>Produto</TableHead>
                    <TableHead className="w-[100px] text-center">Qtd</TableHead>
                    <TableHead className="w-[140px] text-right">Preço Unit.</TableHead>
                    <TableHead className="w-[140px] text-right">Total</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="h-48 text-center text-muted-foreground">
                        <div className="flex flex-col items-center gap-2">
                          <Package className="size-8 opacity-20" />
                          <p>Nenhum produto adicionado ao orçamento.</p>
                          <p className="text-xs">Use a busca acima para encontrar e adicionar produtos.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    items.map((item) => (
                      <TableRow key={item.product_id} className="group hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-xs">{item.sku}</TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateItem(item.product_id, { quantity: Number(e.target.value) })}
                            className="h-8 w-16 mx-auto text-center"
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-xs text-muted-foreground">R$</span>
                            <Input
                              value={formatCurrencyInput(item.unit_price.toFixed(2))}
                              onChange={(e) => updateItem(item.product_id, { unit_price: parseCurrencyInput(e.target.value) })}
                              className="h-8 w-28 text-right font-medium"
                            />
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-bold text-brand-red">
                          {brl(item.quantity * item.unit_price)}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-brand-red hover:bg-brand-red/10"
                            onClick={() => removeItem(item.product_id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-4 sm:p-6 border-brand-red/10 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="size-5 text-muted-foreground" />
              <h3 className="font-bold">Observações Adicionais</h3>
            </div>
            <textarea
              className="w-full min-h-[100px] p-3 rounded-md border border-input bg-background text-sm focus:ring-1 focus:ring-brand-red"
              placeholder="Ex: Condições de pagamento, validade, frete..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-4 sm:p-6 border-brand-red/20 shadow-sm">
            <div className="flex items-center gap-2 mb-6">
              <div className="p-2 rounded-lg bg-brand-orange/10 text-brand-orange">
                <Calculator className="size-5" />
              </div>
              <h2 className="text-lg font-bold">Resumo</h2>
            </div>
            
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-muted-foreground text-sm">Quantidade de Itens:</span>
                <span className="font-bold">{items.length}</span>
              </div>
              <div className="flex justify-between items-center py-4 bg-muted/20 px-4 rounded-lg">
                <span className="text-lg font-bold">Total:</span>
                <span className="text-2xl font-black text-brand-red">{brl(total)}</span>
              </div>
            </div>
          </Card>

          <Card className="p-4 sm:p-6 border-brand-red/10 shadow-sm space-y-4">
             <div className="flex items-center gap-2">
                <User className="size-5 text-muted-foreground" />
                <h3 className="font-bold">Cliente</h3>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  className="flex-1 justify-start text-left font-normal overflow-hidden h-12"
                  onClick={() => setCustomerPickerOpen(true)}
                >
                  <div className="flex flex-col items-start truncate">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Cliente Selecionado</span>
                    <span className="truncate">{customer?.name || "Consumidor Final"}</span>
                  </div>
                </Button>
                <Button 
                  variant="outline" 
                  size="icon"
                  className="shrink-0 h-12 w-12 border-brand-orange hover:bg-brand-orange/10 text-brand-orange"
                  title="Cadastro Rápido"
                  onClick={() => setQuickCustomerOpen(true)}
                >
                  <UserPlus className="size-5" />
                </Button>
              </div>

              <EntitySelectorDialog
                open={customerPickerOpen}
                onOpenChange={setCustomerPickerOpen}
                title="Selecionar Cliente"
                items={partnersQ.data ?? []}
                selectedId={customer?.id}
                onSelect={(id) => {
                  const partner = partnersQ.data?.find(p => p.id === id);
                  if (partner) setCustomer(partner);
                }}
                allowClear
                clearLabel="Consumidor Final"
              />

              {customer && (
                <Button variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={() => setCustomer(null)}>
                  Remover cliente
                </Button>
              )}
          </Card>
        </div>
      </div>

      {quotationsQ.data && quotationsQ.data.length > 0 && (
        <Card className="p-4 sm:p-6 border-brand-red/10 shadow-sm mt-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="p-2 rounded-lg bg-brand-red/10 text-brand-red">
              <FileText className="size-5" />
            </div>
            <h2 className="text-lg font-bold">Orçamentos Salvos</h2>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[100px]">Número</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[80px] text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotationsQ.data.map((q: Quotation) => (
                  <TableRow key={q.id}>
                    <TableCell className="font-mono text-xs">#{q.id.substring(0, 8).toUpperCase()}</TableCell>
                    <TableCell className="text-sm">
                      {new Date(q.created_at).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="font-medium">{q.customer_name || "Consumidor Final"}</TableCell>
                    <TableCell className="text-right font-bold text-brand-red">{brl(q.total)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(q)}>
                            <Edit className="size-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => generateReceipt(q)}>
                            <Receipt className="size-4 mr-2" />
                            Imprimir Cupom
                          </DropdownMenuItem>

                          <DropdownMenuItem 
                            className="text-brand-red focus:text-brand-red"
                            onClick={() => handleDelete(q.id)}
                          >
                            <Trash2 className="size-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar produto avulso</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Nome do produto</Label>
              <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Ex: Serviço de instalação" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Quantidade</Label>
                <Input type="number" min="1" value={customQty} onChange={(e) => setCustomQty(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Valor unitário</Label>
                <Input value={customPriceRaw} onChange={(e) => setCustomPriceRaw(formatCurrencyInput(e.target.value))} className="text-right" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomOpen(false)}>Cancelar</Button>
            <Button className="bg-brand-orange hover:bg-brand-orange/90 text-white" onClick={addCustomItem}>Adicionar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        <Dialog open={quickCustomerOpen} onOpenChange={setQuickCustomerOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cadastro Rápido de Cliente</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="custName">Nome Completo</Label>
                <Input 
                  id="custName" 
                  value={quickCustName} 
                  onChange={(e) => setQuickCustName(e.target.value)}
                  placeholder="Nome do cliente"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="custPhone">Telefone</Label>
                  <Input 
                    id="custPhone" 
                    value={quickCustPhone} 
                    onChange={(e) => setQuickCustPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="custDoc">CPF/CNPJ</Label>
                  <Input 
                    id="custDoc" 
                    value={quickCustDoc} 
                    onChange={(e) => setQuickCustDoc(maskCpfCnpj(e.target.value))}
                    placeholder="000.000.000-00"
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setQuickCustomerOpen(false)}>Cancelar</Button>
              <Button 
                className="bg-brand-red hover:bg-brand-red/90 text-white"
                onClick={handleQuickCustomer}
                disabled={isCreatingCustomer}
              >
                {isCreatingCustomer ? "Cadastrando..." : "Cadastrar e Selecionar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <PrintPreviewDialog
        open={showPreview}
        onOpenChange={setShowPreview}
        title="Visualização do Orçamento"
        content={previewContent}
      />
    </div>
  );
}
