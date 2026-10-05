import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tags, Plus, Minus, Pencil, Trash2, Eye, Printer, Save, X, Copy, Star } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import {
  fetchBarcodeLabels,
  upsertBarcodeLabel,
  deleteBarcodeLabel,
  setBarcodeLabelAsDefault,
} from "@/lib/barcode-labels";

export type LabelTemplate = {
  id: string;
  code: string; // Ex: "A4350", "VL15", "0420"
  name: string; // descrição amigável
  pageWidthMm: number;
  pageHeightMm: number;
  marginTopMm: number;
  marginLeftMm: number;
  cols: number;
  rows: number;
  labelWidthMm: number;
  labelHeightMm: number;
  gapXMm: number;
  gapYMm: number;
  borderRadiusMm?: number;
  fontSizePt?: number;
  offsetX?: number;
  offsetY?: number;
  isSystem?: boolean;
  isDefault?: boolean;
};

// Modelos baseados na imagem de referência (Pimaco / Avery padrões brasileiros)
export const SYSTEM_TEMPLATES: LabelTemplate[] = [
  {
    id: "sys-0101",
    code: "0101",
    name: "1 etiqueta — 215,9 × 279,4 mm",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 0,
    marginLeftMm: 0,
    cols: 1,
    rows: 1,
    labelWidthMm: 215.9,
    labelHeightMm: 279.4,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-0201",
    code: "0201",
    name: "2 etiquetas — 212,73 × 138,11 mm",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 1.5,
    marginLeftMm: 1.5,
    cols: 1,
    rows: 2,
    labelWidthMm: 212.73,
    labelHeightMm: 138.11,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-0202",
    code: "0202",
    name: "4 etiquetas — 106,36 × 138,11 mm",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 1.5,
    marginLeftMm: 1.5,
    cols: 2,
    rows: 2,
    labelWidthMm: 106.36,
    labelHeightMm: 138.11,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-0203",
    code: "0203",
    name: "6 etiquetas — 84,7 × 101,6 mm",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 12.7,
    marginLeftMm: 23.5,
    cols: 2,
    rows: 3,
    labelWidthMm: 84.7,
    labelHeightMm: 101.6,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-0204",
    code: "0204",
    name: "8 etiquetas — 59,27 × 85,73 mm",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 12.7,
    marginLeftMm: 23.5,
    cols: 2,
    rows: 4,
    labelWidthMm: 59.27,
    labelHeightMm: 85.73,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-0205",
    code: "0205",
    name: "10 etiquetas — 101,6 × 50,8 mm",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 12.7,
    marginLeftMm: 4.7,
    cols: 2,
    rows: 5,
    labelWidthMm: 101.6,
    labelHeightMm: 50.8,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-0207E",
    code: "0207E",
    name: "14 etiquetas — 33,9 × 101,6 mm",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 12.7,
    marginLeftMm: 4.7,
    cols: 2,
    rows: 7,
    labelWidthMm: 101.6,
    labelHeightMm: 33.9,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-0210",
    code: "0210",
    name: "20 etiquetas — 101,6 × 25,4 mm",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 12.7,
    marginLeftMm: 4.7,
    cols: 2,
    rows: 10,
    labelWidthMm: 101.6,
    labelHeightMm: 25.4,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-0310",
    code: "0310",
    name: "30 etiquetas — 66,7 × 25,4 mm",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 12.7,
    marginLeftMm: 4.7,
    cols: 3,
    rows: 10,
    labelWidthMm: 66.7,
    labelHeightMm: 25.4,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-0420",
    code: "0420",
    name: "80 etiquetas — 38,1 × 21,2 mm",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 12.7,
    marginLeftMm: 4.7,
    cols: 4,
    rows: 20,
    labelWidthMm: 38.1,
    labelHeightMm: 21.2,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-0512",
    code: "0512",
    name: "60 etiquetas — 38,1 × 21,2 mm",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 12.7,
    marginLeftMm: 4.7,
    cols: 5,
    rows: 12,
    labelWidthMm: 38.1,
    labelHeightMm: 21.2,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-VL15",
    code: "VL15",
    name: "15 etiquetas — 148 × 17 mm (lombada)",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 12.7,
    marginLeftMm: 33.9,
    cols: 1,
    rows: 15,
    labelWidthMm: 148,
    labelHeightMm: 17,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-VL10",
    code: "VL10",
    name: "10 etiquetas — 99,1 × 67,7 mm",
    pageWidthMm: 215.9,
    pageHeightMm: 279.4,
    marginTopMm: 12.7,
    marginLeftMm: 8.4,
    cols: 2,
    rows: 5,
    labelWidthMm: 99.1,
    labelHeightMm: 67.7,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4148",
    code: "A4148",
    name: "96 etiquetas — 17 × 31 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 8,
    marginLeftMm: 8,
    cols: 8,
    rows: 12,
    labelWidthMm: 17,
    labelHeightMm: 31,
    gapXMm: 1,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4149",
    code: "A4149",
    name: "126 etiquetas — 26 × 15 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 13.5,
    marginLeftMm: 9,
    cols: 7,
    rows: 18,
    labelWidthMm: 26,
    labelHeightMm: 15,
    gapXMm: 0,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4160",
    code: "A4160",
    name: "21 etiquetas — 63,5 × 38,1 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 15.1,
    marginLeftMm: 7.2,
    cols: 3,
    rows: 7,
    labelWidthMm: 63.5,
    labelHeightMm: 38.1,
    gapXMm: 2.5,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4161",
    code: "A4161",
    name: "18 etiquetas — 63,5 × 46,6 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 11.5,
    marginLeftMm: 7.2,
    cols: 3,
    rows: 6,
    labelWidthMm: 63.5,
    labelHeightMm: 46.6,
    gapXMm: 2.5,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4162",
    code: "A4162",
    name: "16 etiquetas — 99,1 × 34 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 13,
    marginLeftMm: 4.7,
    cols: 2,
    rows: 8,
    labelWidthMm: 99.1,
    labelHeightMm: 34,
    gapXMm: 2.5,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4163",
    code: "A4163",
    name: "14 etiquetas — 99,1 × 38,1 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 8.5,
    marginLeftMm: 4.7,
    cols: 2,
    rows: 7,
    labelWidthMm: 99.1,
    labelHeightMm: 38.1,
    gapXMm: 2.5,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4164",
    code: "A4164",
    name: "12 etiquetas — 63,5 × 72 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 8.5,
    marginLeftMm: 7.2,
    cols: 3,
    rows: 4,
    labelWidthMm: 63.5,
    labelHeightMm: 72,
    gapXMm: 2.5,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4165",
    code: "A4165",
    name: "8 etiquetas — 99,1 × 67,7 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 12.7,
    marginLeftMm: 4.7,
    cols: 2,
    rows: 4,
    labelWidthMm: 99.1,
    labelHeightMm: 67.7,
    gapXMm: 2.5,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4166",
    code: "A4166",
    name: "6 etiquetas — 99,1 × 93,1 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 11.5,
    marginLeftMm: 4.7,
    cols: 2,
    rows: 3,
    labelWidthMm: 99.1,
    labelHeightMm: 93.1,
    gapXMm: 2.5,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4350",
    code: "A4350",
    name: "10 etiquetas — 99,1 × 55,8 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 13.5,
    marginLeftMm: 4.7,
    cols: 2,
    rows: 5,
    labelWidthMm: 99.1,
    labelHeightMm: 55.8,
    gapXMm: 2.5,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4354",
    code: "A4354",
    name: "22 etiquetas — 25,4 × 99 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 13.5,
    marginLeftMm: 4.7,
    cols: 2,
    rows: 11,
    labelWidthMm: 99,
    labelHeightMm: 25.4,
    gapXMm: 2.5,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4355",
    code: "A4355",
    name: "27 etiquetas — 31 × 63,5 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 13.5,
    marginLeftMm: 7.2,
    cols: 3,
    rows: 9,
    labelWidthMm: 63.5,
    labelHeightMm: 31,
    gapXMm: 2.5,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4356",
    code: "A4356",
    name: "33 etiquetas — 25,4 × 63,5 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 13.5,
    marginLeftMm: 7.2,
    cols: 3,
    rows: 11,
    labelWidthMm: 63.5,
    labelHeightMm: 25.4,
    gapXMm: 2.5,
    gapYMm: 0,
    isSystem: true,
  },
  {
    id: "sys-A4651",
    code: "A4651",
    name: "65 etiquetas — 38,1 × 21,2 mm",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 10.7,
    marginLeftMm: 4.7,
    cols: 5,
    rows: 13,
    labelWidthMm: 38.1,
    labelHeightMm: 21.2,
    gapXMm: 2.5,
    gapYMm: 0,
    isSystem: true,
  },
];

export const STORAGE_KEY = (cid: string) => `label_templates_${cid}`;
export const DEFAULT_TEMPLATE_KEY = (cid: string) => `default_label_template_${cid}`;
export const SETTINGS_STORAGE_KEY = (cid: string) => `label_settings_${cid}`;

interface Props {
  companyId: string;
}

export function LabelTemplatesConfig({ companyId }: Props) {
  const [allFromDb, setAllFromDb] = useState<LabelTemplate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<LabelTemplate | null>(null);
  const [previewing, setPreviewing] = useState<LabelTemplate | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const confirm = useConfirm();

  const reload = async () => {
    try {
      const list = await fetchBarcodeLabels(companyId);
      setAllFromDb(list);
    } catch (e) {
      console.error("Error loading templates", e);
      toast.error("Erro ao carregar modelos do banco. Execute SCHEMA_PATCH_BARCODE_LABELS.sql.");
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Modelos do sistema: vêm da tabela; se vazio, usa SYSTEM_TEMPLATES como fallback
  const systemTemplates = useMemo(() => {
    const fromDb = allFromDb.filter((t) => t.isSystem);
    return fromDb.length > 0 ? fromDb : SYSTEM_TEMPLATES;
  }, [allFromDb]);

  const customTemplates = useMemo(() => allFromDb.filter((t) => !t.isSystem), [allFromDb]);

  const allTemplates = useMemo(
    () => [...systemTemplates, ...customTemplates],
    [systemTemplates, customTemplates],
  );

  const handleSave = async (tpl: LabelTemplate) => {
    if (!tpl.code.trim() || !tpl.name.trim()) {
      toast.error("Código e nome são obrigatórios");
      return;
    }
    try {
      const isUpdate = tpl.id && !tpl.id.startsWith("custom-") && !tpl.id.startsWith("sys-");
      await upsertBarcodeLabel(companyId, tpl);
      await reload();
      toast.success(isUpdate ? "Modelo atualizado" : "Modelo criado");
      setShowDialog(false);
      setEditing(null);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao salvar modelo");
    }
  };

  const handleDelete = async (tpl: LabelTemplate) => {
    const ok = await confirm({
      title: "Excluir modelo?",
      description: `Remover "${tpl.name}" permanentemente?`,
      confirmLabel: "Excluir",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await deleteBarcodeLabel(companyId, tpl.id);
      await reload();
      toast.success("Modelo removido");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao remover modelo");
    }
  };

  const handlePrintSpecs = (tpl: LabelTemplate) => {
    printTemplateSpecs(tpl);
  };

  const handleSetDefault = async (tpl: LabelTemplate) => {
    try {
      await setBarcodeLabelAsDefault(companyId, tpl.id);
      await reload();
      toast.success(`${tpl.name} definido como padrão`);
    } catch (e) {
      console.error(e);
      toast.error("Erro ao definir como padrão");
    }
  };

  const handleDuplicate = async (tpl: LabelTemplate) => {
    const ok = await confirm({
      title: "Duplicar modelo?",
      description: `Deseja criar uma cópia de "${tpl.name}"?`,
      confirmLabel: "Duplicar",
    });
    if (!ok) return;

    const copy: LabelTemplate = {
      ...tpl,
      id: `custom-${Date.now()}`,
      code: `${tpl.code}-COPY`,
      name: `${tpl.name} (cópia)`,
      isSystem: false,
    };
    setEditing(copy);
    setShowDialog(true);
  };

  const newTemplate = (): LabelTemplate => ({
    id: `custom-${Date.now()}`,
    code: "",
    name: "",
    pageWidthMm: 210,
    pageHeightMm: 297,
    marginTopMm: 10,
    marginLeftMm: 10,
    cols: 3,
    rows: 8,
    labelWidthMm: 60,
    labelHeightMm: 30,
    gapXMm: 2,
    gapYMm: 2,
    borderRadiusMm: 1,
    fontSizePt: 7,
    offsetX: 0,
    offsetY: 0,
    isSystem: false,
  });

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center">
              <Tags className="size-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold">Modelos de Etiquetas</h3>
              <p className="text-sm text-muted-foreground">
                Configure formulários de etiquetas para impressão de códigos de barras
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              setEditing(newTemplate());
              setShowDialog(true);
            }}
            className="gap-2 bg-brand-orange hover:bg-brand-orange/90"
          >
            <Plus className="size-4" /> Novo Modelo
          </Button>
        </div>

        <div className="space-y-6">
          {allFromDb.some((t) => t.isDefault) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h4 className="text-sm font-semibold text-brand-orange">Favorito</h4>
                <Star className="size-3 fill-brand-orange text-brand-orange" />
              </div>
              <TemplateGrid
                templates={allFromDb.filter((t) => t.isDefault)}
                onPreview={setPreviewing}
                onEdit={(t) => {
                  setEditing(t);
                  setShowDialog(true);
                }}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onPrintSpecs={handlePrintSpecs}
                onSetDefault={handleSetDefault}
              />
            </div>
          )}

          <div>
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-sm font-semibold">Modelos Padrão</h4>
              <Badge variant="secondary">
                {systemTemplates.filter((t) => !t.isDefault).length}
              </Badge>
            </div>
            <TemplateGrid
              templates={systemTemplates.filter((t) => !t.isDefault)}
              onPreview={setPreviewing}
              onDuplicate={handleDuplicate}
              onPrintSpecs={handlePrintSpecs}
              onSetDefault={handleSetDefault}
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <h4 className="text-sm font-semibold">Modelos Personalizados</h4>
              <Badge variant="secondary">
                {customTemplates.filter((t) => !t.isDefault).length}
              </Badge>
            </div>
            {customTemplates.filter((t) => !t.isDefault).length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Nenhum modelo personalizado. Clique em "Novo Modelo" para criar.
              </p>
            ) : (
              <TemplateGrid
                templates={customTemplates.filter((t) => !t.isDefault)}
                onPreview={setPreviewing}
                onEdit={(t) => {
                  setEditing(t);
                  setShowDialog(true);
                }}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                onPrintSpecs={handlePrintSpecs}
                onSetDefault={handleSetDefault}
              />
            )}
          </div>
        </div>
      </Card>

      {editing && (
        <TemplateEditorDialog
          open={showDialog}
          onOpenChange={(o) => {
            setShowDialog(o);
            if (!o) setEditing(null);
          }}
          template={editing}
          onSave={handleSave}
        />
      )}

      {previewing && (
        <TemplatePreviewDialog template={previewing} onClose={() => setPreviewing(null)} />
      )}
    </div>
  );
}

function TemplateGrid({
  templates,
  onPreview,
  onEdit,
  onDelete,
  onDuplicate,
  onPrintSpecs,
  onSetDefault,
}: {
  templates: LabelTemplate[];
  onPreview: (t: LabelTemplate) => void;
  onEdit?: (t: LabelTemplate) => void;
  onDelete?: (t: LabelTemplate) => void;
  onDuplicate: (t: LabelTemplate) => void;
  onPrintSpecs: (t: LabelTemplate) => void;
  onSetDefault: (t: LabelTemplate) => void;
}) {
  const sortedTemplates = useMemo(() => {
    return [...templates].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return 0;
    });
  }, [templates]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {sortedTemplates.map((t) => (
        <div
          key={t.id}
          className={`border rounded-md p-3 bg-card transition-colors hover:border-brand-orange/40 ${t.isDefault ? "border-brand-orange ring-1 ring-brand-orange/20" : "border-border"}`}
        >
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-brand-orange">{t.code}</span>
                <Badge variant="outline" className="text-[10px] py-0">
                  {t.cols * t.rows} et.
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.name}</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                {t.labelWidthMm} × {t.labelHeightMm} mm
              </p>
            </div>
            <MiniLabelPreview template={t} />
          </div>
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border">
            <Button
              size="sm"
              variant="ghost"
              className={`h-7 px-2 ${t.isDefault ? "text-brand-orange" : "text-muted-foreground"}`}
              onClick={() => onSetDefault(t)}
              title={t.isDefault ? "Favorito" : "Marcar como favorito"}
            >
              <Star className={`size-3 ${t.isDefault ? "fill-current" : ""}`} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 flex-1"
              onClick={() => onPreview(t)}
            >
              <Eye className="size-3 mr-1" /> Prévia
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => onPrintSpecs(t)}
              title="Imprimir configurações"
            >
              <Printer className="size-3" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2"
              onClick={() => onDuplicate(t)}
              title="Duplicar"
            >
              <Copy className="size-3" />
            </Button>
            {onEdit && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => onEdit(t)}
                title="Editar"
              >
                <Pencil className="size-3" />
              </Button>
            )}
            {onDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-destructive hover:text-destructive"
                onClick={() => onDelete(t)}
                title="Excluir"
              >
                <Trash2 className="size-3" />
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function MiniLabelPreview({ template }: { template: LabelTemplate }) {
  const scale = 40 / Math.max(template.pageWidthMm, template.pageHeightMm);
  return (
    <div
      className="border border-border bg-white shrink-0"
      style={{
        width: template.pageWidthMm * scale,
        height: template.pageHeightMm * scale,
        position: "relative",
      }}
    >
      {Array.from({ length: template.rows }).map((_, r) =>
        Array.from({ length: template.cols }).map((__, c) => (
          <div
            key={`${r}-${c}`}
            className="bg-brand-orange/30 border border-brand-orange/40 absolute"
            style={{
              left: (template.marginLeftMm + c * (template.labelWidthMm + template.gapXMm)) * scale,
              top: (template.marginTopMm + r * (template.labelHeightMm + template.gapYMm)) * scale,
              width: template.labelWidthMm * scale,
              height: template.labelHeightMm * scale,
            }}
          />
        )),
      )}
    </div>
  );
}

function TemplateEditorDialog({
  open,
  onOpenChange,
  template,
  onSave,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  template: LabelTemplate;
  onSave: (t: LabelTemplate) => void;
}) {
  const [form, setForm] = useState<LabelTemplate>(template);

  useEffect(() => {
    setForm(template);
  }, [template]);

  const update = <K extends keyof LabelTemplate>(k: K, v: LabelTemplate[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const num = (v: string) => Number(v.replace(",", ".")) || 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {template.isSystem === false && customTemplateExists(template) ? "Editar" : "Novo"}{" "}
            Modelo de Etiqueta
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Código</Label>
                <Input
                  value={form.code}
                  onChange={(e) => update("code", e.target.value.toUpperCase())}
                  placeholder="Ex: A4350"
                />
              </div>
              <div className="space-y-1">
                <Label>Nome</Label>
                <Input
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Descrição"
                />
              </div>
            </div>

            <fieldset className="border border-border rounded-md p-3 space-y-2">
              <legend className="text-xs font-semibold px-1">Folha (mm)</legend>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Largura"
                  value={form.pageWidthMm}
                  onChange={(v) => update("pageWidthMm", num(v))}
                />
                <Field
                  label="Altura"
                  value={form.pageHeightMm}
                  onChange={(v) => update("pageHeightMm", num(v))}
                />
              </div>
            </fieldset>

            <fieldset className="border border-border rounded-md p-3 space-y-2">
              <legend className="text-xs font-semibold px-1">Margens e Deslocamento (mm)</legend>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Topo"
                  value={form.marginTopMm}
                  onChange={(v) => update("marginTopMm", num(v))}
                />
                <Field
                  label="Esquerda"
                  value={form.marginLeftMm}
                  onChange={(v) => update("marginLeftMm", num(v))}
                />
                <Field
                  label="Ajuste X"
                  value={form.offsetX || 0}
                  onChange={(v) => update("offsetX", num(v))}
                />
                <Field
                  label="Ajuste Y"
                  value={form.offsetY || 0}
                  onChange={(v) => update("offsetY", num(v))}
                />
              </div>
            </fieldset>

            <fieldset className="border border-border rounded-md p-3 space-y-2">
              <legend className="text-xs font-semibold px-1">Grade</legend>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Colunas" value={form.cols} onChange={(v) => update("cols", num(v))} />
                <Field label="Linhas" value={form.rows} onChange={(v) => update("rows", num(v))} />
              </div>
            </fieldset>

            <fieldset className="border border-border rounded-md p-3 space-y-2">
              <legend className="text-xs font-semibold px-1">Etiqueta (mm)</legend>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Largura"
                  value={form.labelWidthMm}
                  onChange={(v) => update("labelWidthMm", num(v))}
                />
                <Field
                  label="Altura"
                  value={form.labelHeightMm}
                  onChange={(v) => update("labelHeightMm", num(v))}
                />
                <Field
                  label="Espaço X"
                  value={form.gapXMm}
                  onChange={(v) => update("gapXMm", num(v))}
                />
                <Field
                  label="Espaço Y"
                  value={form.gapYMm}
                  onChange={(v) => update("gapYMm", num(v))}
                />
                <Field
                  label="Arredondar"
                  value={form.borderRadiusMm || 0}
                  onChange={(v) => update("borderRadiusMm", num(v))}
                />
                <Field
                  label="Fonte (pt)"
                  value={form.fontSizePt || 7}
                  onChange={(v) => update("fontSizePt", num(v))}
                />
              </div>
            </fieldset>
          </div>

          <div className="space-y-3">
            <div className="text-xs font-semibold">Prévia</div>
            <div className="bg-muted/30 rounded-md p-4 flex justify-center items-center min-h-[400px]">
              <LargePreview template={form} />
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              Total: {form.cols * form.rows} etiquetas/folha · {form.labelWidthMm} ×{" "}
              {form.labelHeightMm} mm
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="size-4 mr-2" /> Cancelar
          </Button>
          <Button onClick={() => onSave(form)} className="bg-brand-orange hover:bg-brand-orange/90">
            <Save className="size-4 mr-2" /> Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function customTemplateExists(t: LabelTemplate) {
  return t.id?.startsWith("custom-");
}

function Field({
  label,
  value,
  onChange,
  step = 0.1,
}: {
  label: string;
  value: number;
  onChange: (v: string) => void;
  step?: number;
}) {
  const adjust = (delta: number) => {
    const next = Math.max(0, Number((value + delta).toFixed(2)));
    onChange(next.toString());
  };

  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => adjust(-step)}
        >
          <Minus className="size-3" />
        </Button>
        <Input
          type="number"
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 text-center px-1 text-xs"
        />
        <Button
          variant="outline"
          size="icon"
          className="size-7 shrink-0"
          onClick={() => adjust(step)}
        >
          <Plus className="size-3" />
        </Button>
      </div>
    </div>
  );
}

function LargePreview({ template }: { template: LabelTemplate }) {
  const max = 350;
  const scale = max / Math.max(template.pageWidthMm, template.pageHeightMm);
  return (
    <div
      className="border-2 border-border bg-white shadow-md relative"
      style={{
        width: template.pageWidthMm * scale,
        height: template.pageHeightMm * scale,
      }}
    >
      {Array.from({ length: template.rows }).map((_, r) =>
        Array.from({ length: template.cols }).map((__, c) => (
          <div
            key={`${r}-${c}`}
            className="bg-brand-orange/20 border border-brand-orange/60 absolute flex items-center justify-center text-brand-orange font-mono"
            style={{
              left:
                (template.marginLeftMm +
                  (template.offsetX || 0) +
                  c * (template.labelWidthMm + template.gapXMm)) *
                scale,
              top:
                (template.marginTopMm +
                  (template.offsetY || 0) +
                  r * (template.labelHeightMm + template.gapYMm)) *
                scale,
              width: template.labelWidthMm * scale,
              height: template.labelHeightMm * scale,
              borderRadius: (template.borderRadiusMm || 0) * scale,
              fontSize: (template.fontSizePt || 7) * (scale * 0.3527), // rough pt to scale
            }}
          >
            {r === 0 && c === 0 && "ABC"}
          </div>
        )),
      )}
    </div>
  );
}

function TemplatePreviewDialog({
  template,
  onClose,
}: {
  template: LabelTemplate;
  onClose: () => void;
}) {
  const handlePrintTest = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    const labels = Array.from({ length: template.cols * template.rows }, (_, i) => i);
    win.document.write(`
      <html>
        <head>
          <title>Teste — ${template.code}</title>
          <style>
            @page { size: ${template.pageWidthMm}mm ${template.pageHeightMm}mm; margin: 0; }
            body { margin: 0; padding: 0; font-family: 'Courier New', monospace; }
            .sheet { position: relative; width: ${template.pageWidthMm}mm; height: ${template.pageHeightMm}mm; }
            .label {
              position: absolute;
              border: 1px dashed #999;
              box-sizing: border-box;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: ${template.fontSizePt || 7}pt;
              text-align: center;
              padding: 1mm;
              overflow: hidden;
              border-radius: ${template.borderRadiusMm || 0}mm;
            }
          </style>
        </head>
        <body>
          <div class="sheet">
            ${labels
              .map((i) => {
                const r = Math.floor(i / template.cols);
                const c = i % template.cols;
                const left =
                  template.marginLeftMm +
                  (template.offsetX || 0) +
                  c * (template.labelWidthMm + template.gapXMm);
                const top =
                  template.marginTopMm +
                  (template.offsetY || 0) +
                  r * (template.labelHeightMm + template.gapYMm);
                return `<div class="label" style="left:${left}mm;top:${top}mm;width:${template.labelWidthMm}mm;height:${template.labelHeightMm}mm">
                  ${template.code}<br/>${i + 1}
                </div>`;
              })
              .join("")}
          </div>
          <script>
            window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };
          </script>
        </body>
      </html>
    `);
    win.document.close();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Prévia — <span className="font-mono text-brand-orange">{template.code}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <Stat label="Folha" value={`${template.pageWidthMm} × ${template.pageHeightMm} mm`} />
            <Stat
              label="Etiqueta"
              value={`${template.labelWidthMm} × ${template.labelHeightMm} mm`}
            />
            <Stat label="Grade" value={`${template.cols} × ${template.rows}`} />
            <Stat label="Total" value={`${template.cols * template.rows} et./folha`} />
          </div>

          <div className="bg-muted/30 rounded-md p-4 flex justify-center">
            <LargePreview template={template} />
          </div>

          <p className="text-xs text-muted-foreground text-center">{template.name}</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <X className="size-4 mr-2" /> Fechar
          </Button>
          <Button variant="outline" onClick={() => printTemplateSpecs(template)}>
            <Printer className="size-4 mr-2" /> Imprimir Configurações
          </Button>
          <Button onClick={handlePrintTest} className="bg-brand-orange hover:bg-brand-orange/90">
            <Printer className="size-4 mr-2" /> Imprimir Teste
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function printTemplateSpecs(t: LabelTemplate) {
  const win = window.open("", "_blank");
  if (!win) return;
  const total = t.cols * t.rows;
  const rows: Array<[string, string]> = [
    ["Código", t.code],
    ["Nome", t.name],
    ["Tipo", t.isSystem ? "Modelo do sistema" : "Personalizado"],
    ["Folha (L × A)", `${t.pageWidthMm} × ${t.pageHeightMm} mm`],
    ["Etiqueta (L × A)", `${t.labelWidthMm} × ${t.labelHeightMm} mm`],
    ["Colunas × Linhas", `${t.cols} × ${t.rows}`],
    ["Total por folha", `${total} etiquetas`],
    ["Margem superior", `${t.marginTopMm} mm`],
    ["Margem esquerda", `${t.marginLeftMm} mm`],
    ["Espaço horizontal (gap X)", `${t.gapXMm} mm`],
    ["Espaço vertical (gap Y)", `${t.gapYMm} mm`],
    ["Raio da borda", `${t.borderRadiusMm ?? 0} mm`],
    ["Tamanho da fonte", `${t.fontSizePt ?? 7} pt`],
    ["Offset X / Y", `${t.offsetX ?? 0} / ${t.offsetY ?? 0} mm`],
  ];

  const previewScale = 2; // px per mm
  const labelsHtml = Array.from({ length: total }, (_, i) => {
    const r = Math.floor(i / t.cols);
    const c = i % t.cols;
    const left =
      (t.marginLeftMm + (t.offsetX || 0) + c * (t.labelWidthMm + t.gapXMm)) * previewScale;
    const top =
      (t.marginTopMm + (t.offsetY || 0) + r * (t.labelHeightMm + t.gapYMm)) * previewScale;
    return `<div class="lbl" style="left:${left}px;top:${top}px;width:${t.labelWidthMm * previewScale}px;height:${t.labelHeightMm * previewScale}px;border-radius:${(t.borderRadiusMm || 0) * previewScale}px"></div>`;
  }).join("");

  win.document.write(`
    <html>
      <head>
        <title>Configurações — ${t.code}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { box-sizing: border-box; }
          body { margin: 0; font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #111; }
          h1 { font-size: 18pt; margin: 0 0 4px; }
          h2 { font-size: 11pt; margin: 16px 0 6px; color: #ea580c; text-transform: uppercase; letter-spacing: .5px; }
          .sub { color: #666; font-size: 10pt; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 10pt; }
          td { border: 1px solid #ddd; padding: 6px 8px; }
          td.k { background: #fafafa; width: 45%; font-weight: 600; }
          .preview { border: 1px solid #ccc; position: relative; background: #fff; margin-top: 4px; }
          .lbl { position: absolute; background: rgba(234,88,12,.15); border: 1px solid rgba(234,88,12,.6); }
          .footer { margin-top: 24px; font-size: 8pt; color: #999; text-align: center; }
        </style>
      </head>
      <body>
        <h1>${t.name}</h1>
        <div class="sub">Código <strong>${t.code}</strong> · ${total} etiquetas por folha</div>

        <h2>Especificações</h2>
        <table>
          ${rows.map(([k, v]) => `<tr><td class="k">${k}</td><td>${v}</td></tr>`).join("")}
        </table>

        <h2>Layout da folha</h2>
        <div class="preview" style="width:${t.pageWidthMm * previewScale}px;height:${t.pageHeightMm * previewScale}px">
          ${labelsHtml}
        </div>

        <div class="footer">Gerado em ${new Date().toLocaleString("pt-BR")}</div>
        <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500); };</script>
      </body>
    </html>
  `);
  win.document.close();
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-md p-2 bg-card">
      <div className="text-[10px] text-muted-foreground uppercase">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}
