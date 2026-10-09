import { supabase } from "@/integrations/supabase/client";
import type { LabelTemplate } from "@/components/label-templates-config";

type Row = {
  id: string;
  company_id: string;
  code: string;
  name: string;
  page_width_mm: number;
  page_height_mm: number;
  margin_top_mm: number;
  margin_left_mm: number;
  cols: number;
  rows: number;
  label_width_mm: number;
  label_height_mm: number;
  gap_x_mm: number;
  gap_y_mm: number;
  border_radius_mm: number | null;
  font_size_pt: number | null;
  offset_x: number | null;
  offset_y: number | null;
  is_system: boolean;
  is_default: boolean;
};

export function rowToTemplate(r: Row): LabelTemplate {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    pageWidthMm: Number(r.page_width_mm),
    pageHeightMm: Number(r.page_height_mm),
    marginTopMm: Number(r.margin_top_mm),
    marginLeftMm: Number(r.margin_left_mm),
    cols: Number(r.cols),
    rows: Number(r.rows),
    labelWidthMm: Number(r.label_width_mm),
    labelHeightMm: Number(r.label_height_mm),
    gapXMm: Number(r.gap_x_mm),
    gapYMm: Number(r.gap_y_mm),
    borderRadiusMm: r.border_radius_mm == null ? undefined : Number(r.border_radius_mm),
    fontSizePt: r.font_size_pt == null ? undefined : Number(r.font_size_pt),
    offsetX: r.offset_x == null ? undefined : Number(r.offset_x),
    offsetY: r.offset_y == null ? undefined : Number(r.offset_y),
    isSystem: r.is_system,
    isDefault: r.is_default,
  };
}

export function templateToRow(t: LabelTemplate, companyId: string): Record<string, unknown> {
  return {
    company_id: companyId,
    code: t.code,
    name: t.name,
    page_width_mm: t.pageWidthMm,
    page_height_mm: t.pageHeightMm,
    margin_top_mm: t.marginTopMm,
    margin_left_mm: t.marginLeftMm,
    cols: t.cols,
    rows: t.rows,
    label_width_mm: t.labelWidthMm,
    label_height_mm: t.labelHeightMm,
    gap_x_mm: t.gapXMm,
    gap_y_mm: t.gapYMm,
    border_radius_mm: t.borderRadiusMm ?? null,
    font_size_pt: t.fontSizePt ?? null,
    offset_x: t.offsetX ?? 0,
    offset_y: t.offsetY ?? 0,
    is_system: false,
    is_default: t.isDefault ?? false,
  };
}

export async function fetchBarcodeLabels(companyId: string): Promise<LabelTemplate[]> {
  const { data, error } = await supabase
    .from("barcode_labels" as any)
    .select("*")
    .eq("company_id", companyId)
    .order("is_default", { ascending: false })
    .order("is_system", { ascending: false })
    .order("code", { ascending: true });
  if (error) throw error;
  return ((data as unknown as Row[]) || []).map(rowToTemplate);
}

export async function upsertBarcodeLabel(
  companyId: string,
  tpl: LabelTemplate,
): Promise<LabelTemplate> {
  const payload = templateToRow(tpl, companyId);
  const isExisting = tpl.id && !tpl.id.startsWith("custom-") && !tpl.id.startsWith("sys-");
  if (isExisting) {
    const { data, error } = await supabase
      .from("barcode_labels" as any)
      .update(payload)
      .eq("id", tpl.id)
      .eq("company_id", companyId)
      .select()
      .single();
    if (error) throw error;
    return rowToTemplate(data as unknown as Row);
  }
  const { data, error } = await supabase
    .from("barcode_labels" as any)
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return rowToTemplate(data as unknown as Row);
}

export async function deleteBarcodeLabel(companyId: string, id: string): Promise<void> {
  const { error } = await supabase
    .from("barcode_labels" as any)
    .delete()
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw error;
}

export async function setBarcodeLabelAsDefault(companyId: string, id: string): Promise<void> {
  // Clear all defaults for this company
  await supabase
    .from("barcode_labels" as any)
    .update({ is_default: false })
    .eq("company_id", companyId);

  // Set the new default
  const { error } = await supabase
    .from("barcode_labels" as any)
    .update({ is_default: true })
    .eq("id", id)
    .eq("company_id", companyId);

  if (error) throw error;
}
