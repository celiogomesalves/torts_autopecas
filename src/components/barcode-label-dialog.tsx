import { useEffect, useMemo, useRef, useState } from "react";
import JsBarcode from "jsbarcode";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Printer, Download, Search, X, Star } from "lucide-react";
import { brl } from "@/lib/format";
import { cn, normalize } from "@/lib/utils";
import type { Product } from "@/lib/db-types";
import {
  LabelTemplate,
  SYSTEM_TEMPLATES,
  STORAGE_KEY,
  DEFAULT_TEMPLATE_KEY,
  SETTINGS_STORAGE_KEY,
} from "./label-templates-config";
import { fetchBarcodeLabels } from "@/lib/barcode-labels";
import { toast } from "sonner";
import { appwrite as supabase } from "@/integrations/appwrite/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
  companyName?: string;
  companyId: string;
}

type BarcodeFormat = "CODE128" | "EAN13" | "CODE39";
type Orientation = "portrait" | "landscape";

export function BarcodeLabelDialog({
  open,
  onOpenChange,
  products,
  companyName,
  companyId,
}: Props) {
  const [format, setFormat] = useState<BarcodeFormat>("CODE128");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [customTemplates, setCustomTemplates] = useState<LabelTemplate[]>([]);
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [copies, setCopies] = useState(1);
  const [skipLabels, setSkipLabels] = useState(0);
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showSku, setShowSku] = useState(true);
  const [scale, setScale] = useState(1);
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [onlyWithStock, setOnlyWithStock] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const previewRef = useRef<HTMLDivElement>(null);

  // Reset ao fechar para garantir resync na próxima abertura
  useEffect(() => {
    if (!open) {
      setTemplatesLoading(true);
      setSelectedTemplateId("");
    }
  }, [open]);

  // Carrega configurações da UI + lista de templates da tabela barcode_labels
  useEffect(() => {
    if (!open || !companyId) return;

    setTemplatesLoading(true);

    const load = async () => {
      // 1) Templates da tabela (fonte da verdade do "favorito" via isDefault)
      let loadedTemplates: LabelTemplate[] = [];
      try {
        const list = await fetchBarcodeLabels(companyId);
        if (list.length > 0) {
          loadedTemplates = list;
          setCustomTemplates(list.filter((t) => !t.isSystem));
          (window as any).__barcode_system_templates_runtime = list.filter((t) => t.isSystem);
        } else {
          (window as any).__barcode_system_templates_runtime = null;
          // fallback localStorage
          const saved = localStorage.getItem(STORAGE_KEY(companyId));
          if (saved) {
            const parsed = JSON.parse(saved) as LabelTemplate[];
            setCustomTemplates(parsed);
            loadedTemplates = [...SYSTEM_TEMPLATES, ...parsed];
          } else {
            loadedTemplates = SYSTEM_TEMPLATES;
          }
        }
      } catch (e) {
        console.error("Error loading barcode_labels", e);
        (window as any).__barcode_system_templates_runtime = null;
        loadedTemplates = SYSTEM_TEMPLATES;
      }

      // 2) Configurações da UI
      let settings: any = null;
      try {
        const { data, error } = await supabase
          .from("company_settings" as any)
          .select("barcode_label_config" as any)
          .eq("company_id", companyId)
          .maybeSingle();

        if (error) throw error;

        if (data && (data as any).barcode_label_config) {
          settings = (data as any).barcode_label_config;
        } else {
          const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY(companyId));
          if (savedSettings) settings = JSON.parse(savedSettings);
        }

        if (settings) {
          if (settings.format) setFormat(settings.format);
          if (settings.orientation) setOrientation(settings.orientation);
          if (settings.copies) setCopies(settings.copies);
          if (settings.showName !== undefined) setShowName(settings.showName);
          if (settings.showPrice !== undefined) setShowPrice(settings.showPrice);
          if (settings.showSku !== undefined) setShowSku(settings.showSku);
          if (settings.scale) setScale(settings.scale);
        }
      } catch (e) {
        console.error("Error loading label settings", e);
      }

      // 3) Sincroniza dropdown com o favorito REAL (isDefault na tabela)
      // Prioridade: favorito real > default_template_id salvo > localStorage > primeiro template
      const favorite = loadedTemplates.find((t) => t.isDefault);
      const savedDefaultId =
        settings?.default_template_id ||
        localStorage.getItem(DEFAULT_TEMPLATE_KEY(companyId)) ||
        "";

      let chosenId = "";
      if (favorite) {
        chosenId = favorite.id;
      } else if (savedDefaultId && loadedTemplates.some((t) => t.id === savedDefaultId)) {
        chosenId = savedDefaultId;
      } else if (loadedTemplates[0]) {
        chosenId = loadedTemplates[0].id;
      }
      setSelectedTemplateId(chosenId);
      setTemplatesLoading(false);
    };

    void load();
  }, [open, companyId]);

  // Save to DB on change
  useEffect(() => {
    if (!open || !companyId) return;

    const saveSettings = async () => {
      const config = {
        format,
        orientation,
        copies,
        showName,
        showPrice,
        showSku,
        scale,
        custom_templates: customTemplates,
        default_template_id: selectedTemplateId,
      };

      try {
        console.log("Saving barcode label config to DB:", config);
        const { error } = await supabase.from("company_settings" as any).upsert(
          {
            company_id: companyId,
            barcode_label_config: config,
          } as any,
          {
            onConflict: "company_id",
          },
        );

        if (error) throw error;

        // Also update localStorage as a backup
        localStorage.setItem(SETTINGS_STORAGE_KEY(companyId), JSON.stringify(config));
      } catch (e) {
        console.error("Error saving label settings", e);
      }
    };

    // Debounce save to avoid too many DB calls
    const timeout = setTimeout(saveSettings, 1000);
    return () => clearTimeout(timeout);
  }, [
    format,
    orientation,
    copies,
    showName,
    showPrice,
    showSku,
    scale,
    customTemplates,
    selectedTemplateId,
    open,
    companyId,
  ]);

  const handleToggleDisplayField = (field: "name" | "price" | "sku") => {
    const currentState = {
      name: field === "name" ? !showName : showName,
      price: field === "price" ? !showPrice : showPrice,
      sku: field === "sku" ? !showSku : showSku,
    };

    // Pelo menos um deve estar selecionado
    if (!currentState.name && !currentState.price && !currentState.sku) {
      toast.error("Pelo menos um campo de exibição deve estar selecionado");
      return;
    }

    if (field === "name") setShowName(!showName);
    if (field === "price") setShowPrice(!showPrice);
    if (field === "sku") setShowSku(!showSku);
  };

  const allTemplates = useMemo(() => {
    const sysFromDb =
      typeof window !== "undefined"
        ? ((window as any).__barcode_system_templates_runtime as LabelTemplate[] | null)
        : null;
    const sys = sysFromDb && sysFromDb.length > 0 ? sysFromDb : SYSTEM_TEMPLATES;
    const combined = [...sys, ...customTemplates];
    return combined.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return 0;
    });
  }, [customTemplates]);
  const template = useMemo(() => {
    return (
      allTemplates.find((t) => t.id === selectedTemplateId) ||
      allTemplates.find((t) => t.isDefault) ||
      allTemplates[0]
    );
  }, [allTemplates, selectedTemplateId]);

  const handleSetDefault = async () => {
    if (!template || !companyId) return;
    setSelectedTemplateId(template.id);
    toast.success(`Modelo "${template.name}" definido como padrão`);
  };

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return products.filter((p) => {
      if (onlyActive && p.active === false) return false;
      if (onlyWithStock && Number(p.stock ?? 0) <= 0) return false;
      if (!q) return true;
      return (
        normalize(p.name).includes(q) ||
        normalize(p.sku).includes(q) ||
        normalize((p.brand ?? "").toString()).includes(q)
      );
    });
  }, [products, search, onlyActive, onlyWithStock]);

  const items = useMemo(() => {
    const arr: Product[] = [];
    for (const p of filtered) {
      for (let i = 0; i < copies; i++) arr.push(p);
    }
    return arr;
  }, [filtered, copies]);

  const getScale = () => {
    if (typeof window === "undefined" || !template) return 1;
    const containerWidth =
      (window.innerWidth < 768 ? window.innerWidth * 0.9 : window.innerWidth * 0.95) - 32;
    const pageWidthPx = template.pageWidthMm * 3.78;

    // Default dynamic scale
    let s = 1;
    if (pageWidthPx > containerWidth) {
      s = containerWidth / pageWidthPx;
    }

    // Apply user manual scale if it deviates from 1
    return s * (scale || 1);
  };

  const buildStyles = (isPrint = false) => {
    if (!template) return "";
    const scale = isPrint ? 1 : getScale();
    return `
      @page { 
        size: ${template.pageWidthMm}mm ${template.pageHeightMm}mm ${orientation}; 
        margin: 0; 
      }
      body { 
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; 
        margin: 0; 
        background: #f5f5f5;
      }
      .page {
        width: ${template.pageWidthMm}mm;
        height: ${template.pageHeightMm}mm;
        position: relative;
        background: white;
        margin: ${isPrint ? "0" : "10mm"} auto;
        box-shadow: ${isPrint ? "none" : "0 0 10px rgba(0,0,0,0.1)"};
        page-break-after: always;
        overflow: hidden;
        ${!isPrint && scale < 1 ? `transform: scale(${scale}); transform-origin: top center; margin-bottom: -${(1 - scale) * template.pageHeightMm * 3.78}px;` : ""}
      }
      @media print {
        body { background: none; margin: 0; }
        .page { margin: 0; box-shadow: none; }
      }
      .label {
        position: absolute;
        width: ${template.labelWidthMm}mm;
        height: ${template.labelHeightMm}mm;
        border: 1px dashed #ccc;
        padding: 1mm;
        text-align: center;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        box-sizing: border-box;
        overflow: hidden;
        gap: 0.1mm;
      }
      @media print {
        .label { border: none; }
      }
      .label .company { font-size: 5.5pt; color: #777; line-height: 1; margin-bottom: 0.2mm; }
      .label .name { font-weight: 600; font-size: 7.5pt; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; width: 100%; }
      .label .price { font-weight: 700; font-size: 10pt; line-height: 1; margin-top: 0.2mm; }
      .label .sku { font-size: 6pt; color: #555; line-height: 1; }
      /* Não esticar o SVG: manter dimensões nativas geradas pelo JsBarcode
         para preservar a proporção exata das barras (crítico para leitura). */
      .label svg { display: block; margin: 0.3mm auto; max-width: 100%; height: auto; }
    `;
  };

  const labelsPerPage = template ? template.cols * template.rows : 0;
  const pages = useMemo(() => {
    if (!template || labelsPerPage === 0) return [];

    // Create an array with nulls for skipped labels
    const allItems: (Product | null)[] = Array(skipLabels).fill(null);
    for (const p of filtered) {
      for (let i = 0; i < copies; i++) allItems.push(p);
    }

    const p: (Product | null)[][] = [];
    for (let i = 0; i < allItems.length; i += labelsPerPage) {
      p.push(allItems.slice(i, i + labelsPerPage));
    }
    return p;
  }, [filtered, copies, skipLabels, template, labelsPerPage]);

  useEffect(() => {
    if (!open || !template) return;
    requestAnimationFrame(() => {
      const nodes = previewRef.current?.querySelectorAll<SVGSVGElement>("svg[data-barcode]");
      const fallbackProducts: string[] = [];
      nodes?.forEach((svg) => {
        let value = (svg.getAttribute("data-value") || "").trim();
        if (!value) {
          svg.innerHTML = "";
          return;
        }

        const labelHeightPx = template.labelHeightMm * 3.78;
        const barHeight = Math.max(40, Math.round(labelHeightPx * 0.45));
        const moduleWidth = format === "CODE39" ? 1.8 : 2;
        const quietZone = Math.max(10, Math.round(moduleWidth * 12));

        let effectiveFormat: BarcodeFormat = format;
        let effectiveValue = value;

        if (format === "EAN13") {
          const digits = value.replace(/\D/g, "");
          if (digits.length === 12 || digits.length === 13) {
            effectiveValue = digits.slice(0, 13);
          } else {
            effectiveFormat = "CODE128";
            fallbackProducts.push(value);
          }
        }

        try {
          JsBarcode(svg, effectiveValue, {
            format: effectiveFormat,
            displayValue: true,
            fontSize: 11,
            font: "monospace",
            textMargin: 1,
            height: barHeight,
            margin: 4,
            marginLeft: quietZone,
            marginRight: quietZone,
            width: moduleWidth,
            background: "#ffffff",
            lineColor: "#000000",
          });
        } catch (err) {
          console.error("Erro ao gerar código de barras", value, err);
          svg.innerHTML = "";
        }
      });

      // Aviso único agregando os SKUs incompatíveis
      if (fallbackProducts.length > 0) {
        const unique = Array.from(new Set(fallbackProducts));
        const preview = unique.slice(0, 3).join(", ");
        const extra = unique.length > 3 ? ` e mais ${unique.length - 3}` : "";
        toast.warning("Códigos incompatíveis com EAN-13", {
          description: `${unique.length} código(s) não possuem 12 ou 13 dígitos numéricos e foram gerados como CODE128: ${preview}${extra}.`,
          id: "ean13-fallback",
        });
      }
    });
  }, [pages, format, showName, showPrice, showSku, open, template]);

  const handlePrint = () => {
    const html = previewRef.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=900,height=700");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Etiquetas</title>
<style>${buildStyles(true)}</style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  };

  const handleDownload = () => {
    const html = previewRef.current?.innerHTML;
    if (!html) return;
    const blob = new Blob(
      [
        `<!doctype html><html><head><meta charset="utf-8"><title>Etiquetas</title>
<style>${buildStyles(true)}</style></head><body>${html}</body></html>`,
      ],
      { type: "text/html" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `etiquetas-${new Date().toISOString().slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isDefault =
    typeof window !== "undefined" &&
    localStorage.getItem(DEFAULT_TEMPLATE_KEY(companyId)) === selectedTemplateId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[98vw] md:w-[95vw] lg:w-full max-h-[98vh] overflow-y-auto p-3 md:p-6">
        <DialogHeader className="mb-2">
          <DialogTitle className="text-lg md:text-xl">Etiquetas com código de barras</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Linha 1: controles principais */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Formato</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as BarcodeFormat)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CODE128">Code 128</SelectItem>
                  <SelectItem value="EAN13">EAN-13</SelectItem>
                  <SelectItem value="CODE39">Code 39</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 col-span-2 sm:col-span-1">
              <Label className="text-xs">Modelo</Label>
              <div className="flex gap-1">
                {templatesLoading ? (
                  <div className="flex-1 h-9 rounded-md border border-input bg-muted/40 px-3 flex items-center text-xs text-muted-foreground animate-pulse">
                    Carregando modelo favorito...
                  </div>
                ) : (
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger className="flex-1 h-9">
                      <SelectValue placeholder="Selecione um modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {allTemplates.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.isDefault && "⭐ "}
                          {t.code} · {t.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Orientação</Label>
              <Select value={orientation} onValueChange={(v) => setOrientation(v as Orientation)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="portrait">Retrato</SelectItem>
                  <SelectItem value="landscape">Paisagem</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Cópias</Label>
              <Input
                type="number"
                min={1}
                max={100}
                className="h-9"
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Escala</Label>
              <Select value={String(scale)} onValueChange={(v) => setScale(Number(v))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0.5">50%</SelectItem>
                  <SelectItem value="0.75">75%</SelectItem>
                  <SelectItem value="1">100%</SelectItem>
                  <SelectItem value="1.25">125%</SelectItem>
                  <SelectItem value="1.5">150%</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Linha 2: busca + filtros */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
            <div className="space-y-1">
              <Label>Buscar produtos</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Nome, SKU ou marca"
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex items-center gap-4 py-2 md:pb-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox checked={onlyActive} onCheckedChange={(v) => setOnlyActive(Boolean(v))} />
                <span>Ativos</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={onlyWithStock}
                  onCheckedChange={(v) => setOnlyWithStock(Boolean(v))}
                />
                <span>Estoque</span>
              </label>
            </div>
          </div>

          {/* Linha 3: toggles de conteúdo */}
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <span className="text-muted-foreground">Mostrar:</span>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={showName}
                onCheckedChange={() => handleToggleDisplayField("name")}
              />
              Nome
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox checked={showSku} onCheckedChange={() => handleToggleDisplayField("sku")} />
              SKU
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={showPrice}
                onCheckedChange={() => handleToggleDisplayField("price")}
              />
              Preço
            </label>
          </div>

          <div className="text-xs text-muted-foreground">
            {filtered.length} de {products.length} produto(s) · {items.length} etiqueta(s) ·{" "}
            {template?.code} · {template?.cols} col · {template?.labelWidthMm}×
            {template?.labelHeightMm} mm
          </div>

          <div className="bg-muted/30 rounded-lg p-1 md:p-4 min-h-[300px] md:min-h-[400px] max-h-[60vh] overflow-auto flex flex-col items-center border border-dashed border-muted-foreground/20">
            <style>{buildStyles(false)}</style>
            <div ref={previewRef}>
              {pages.length === 0 ? (
                <div className="text-center text-muted-foreground py-20">
                  Nenhum produto selecionado para gerar etiquetas.
                </div>
              ) : (
                pages.map((pageItems, pageIdx) => (
                  <div key={pageIdx} className="page">
                    {pageItems.map((p, itemIdx) => {
                      if (!p) return null;

                      const col = itemIdx % template.cols;
                      const row = Math.floor(itemIdx / template.cols);
                      const offsetX = (template as any).offsetX || 0;
                      const offsetY = (template as any).offsetY || 0;
                      const left =
                        template.marginLeftMm +
                        offsetX +
                        col * (template.labelWidthMm + template.gapXMm);
                      const top =
                        template.marginTopMm +
                        offsetY +
                        row * (template.labelHeightMm + template.gapYMm);

                      return (
                        <div
                          key={`${p.id}-${itemIdx}`}
                          className="label"
                          style={{
                            left: `${left}mm`,
                            top: `${top}mm`,
                          }}
                        >
                          {companyName && <div className="company">{companyName}</div>}
                          {showName && <div className="name">{p.name}</div>}
                          <svg data-barcode data-value={p.alternative_code?.trim() || ""} />
                          {/* Código Estoque renderizado como texto sob as barras (displayValue do JsBarcode) */}
                          {showPrice && <div className="price">{brl(Number(p.sale_price))}</div>}
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={items.length === 0}
            className="w-full sm:w-auto"
          >
            <Download className="size-4 mr-2" /> Baixar HTML
          </Button>
          <Button
            onClick={handlePrint}
            disabled={items.length === 0}
            className="w-full sm:w-auto bg-brand-orange hover:bg-brand-orange/90"
          >
            <Printer className="size-4 mr-2" /> Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
