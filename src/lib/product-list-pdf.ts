import { jsPDF } from "jspdf";

export interface ProductPdfRow {
  name: string;
  sku: string;
  category: string;
  brand: string;
  stock: number;
  description: string;
}

const DASH = "-";

export function summarizeDescription(text: string, maxLen = 120): string {
  const clean = (text || "").replace(/\s+/g, " ").trim();
  if (!clean) return DASH;
  if (clean.length <= maxLen) return clean;
  const cut = clean.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}...`;
}

/**
 * Gera um PDF compacto com a lista de produtos (para envio ao fornecedor).
 * Retorna a quantidade de linhas impressas.
 */
export function generateProductListPdf(
  rows: ProductPdfRow[],
  options: {
    companyName?: string;
    fileName?: string;
    showCategory?: boolean;
    showBrand?: boolean;
  } = {},
): number {
  const showCategory = options.showCategory !== false;
  const showBrand = options.showBrand !== false;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const left = 14;
  const right = pageWidth - 14;

  // Colunas (ajustadas conforme as colunas visíveis)
  const colName = left;
  const optionalCount = (showCategory ? 1 : 0) + (showBrand ? 1 : 0);
  const nameWidth = optionalCount === 2 ? 62 : optionalCount === 1 ? 90 : 125;
  const colSku = left + nameWidth + 2;
  let cursor = colSku + 30;
  const colCat = showCategory ? cursor : 0;
  if (showCategory) cursor += 32;
  const colBrand = showBrand ? cursor : 0;
  const colQty = right;

  const widths = {
    name: nameWidth,
    sku: 28,
    cat: 30,
    brand: 40,
    desc: right - left,
  };


  const now = new Date();

  const drawHeader = () => {
    let y = 16;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(options.companyName?.trim() || "Lista de Produtos", left, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(now.toLocaleString("pt-BR"), right, y, { align: "right" });
    y += 6;
    if (options.companyName?.trim()) {
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("Lista de Produtos", left, y);
      doc.setFont("helvetica", "normal");
      y += 5;
    }
    doc.setFontSize(8);
    doc.text(`Total de itens: ${rows.length}`, left, y);
    y += 5;
    return drawTableHead(y);
  };

  const drawTableHead = (yStart: number) => {
    let y = yStart;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Produto", colName, y);
    doc.text("Código", colSku, y);
    if (showCategory) doc.text("Categoria", colCat, y);
    if (showBrand) doc.text("Marca", colBrand, y);

    doc.text("Qtd.", colQty, y, { align: "right" });
    y += 2.5;
    doc.line(left, y, right, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    return y;
  };

  let y = drawHeader();

  rows.forEach((row) => {
    const descLines: string[] = doc.splitTextToSize(
      summarizeDescription(row.description),
      widths.desc,
    );
    const blockHeight = 5 + descLines.length * 3.6 + 3;

    if (y + blockHeight > pageHeight - 18) {
      doc.addPage();
      y = drawTableHead(16);
    }

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text(doc.splitTextToSize(row.name || DASH, widths.name)[0], colName, y);
    doc.setFont("helvetica", "normal");
    doc.text(doc.splitTextToSize(row.sku || DASH, widths.sku)[0], colSku, y);
    if (showCategory)
      doc.text(doc.splitTextToSize(row.category || DASH, widths.cat)[0], colCat, y);
    if (showBrand)
      doc.text(doc.splitTextToSize(row.brand || DASH, widths.brand)[0], colBrand, y);

    doc.text(String(row.stock), colQty, y, { align: "right" });
    y += 4.4;

    doc.setFontSize(7.5);
    doc.setTextColor(90);
    descLines.forEach((line) => {
      doc.text(line, colName, y);
      y += 3.6;
    });
    doc.setTextColor(0);
    y += 1.2;
    doc.setDrawColor(220);
    doc.line(left, y, right, y);
    doc.setDrawColor(0);
    y += 3;
  });

  // Rodapé com paginação
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFontSize(7.5);
    doc.setTextColor(120);
    doc.text(`Página ${i} de ${total}`, right, pageHeight - 8, { align: "right" });
    doc.setTextColor(0);
  }

  const stamp = now.toISOString().slice(0, 10);
  doc.save(options.fileName || `lista-produtos-${stamp}.pdf`);
  return rows.length;
}
