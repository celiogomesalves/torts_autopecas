/**
 * Geração do PDF do Relatório de Vendas (uso server-only).
 * Recebe os dados já agregados pelo endpoint público e devolve os bytes do PDF.
 */

export interface SalesReportRow {
  id: string;
  number: number | null;
  created_at: string;
  customer: string | null;
  payment_method: string | null;
  subtotal: number;
  discount: number;
  total: number;
  status: string;
}

export interface SalesReportData {
  company: { id: string; name: string; cnpj: string | null };
  period: { from: string; to: string; label: string };
  totals: { count: number; subtotal: number; discount: number; total: number };
  paymentSummary: Array<{ method: string; count: number; total: number }>;
  sales: SalesReportRow[];
  meta?: { notesCount?: number; from?: string; to?: string };
}

const brl = (n: number) =>
  `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
};

const fmtBr = (iso?: string) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : String(iso);
};


export async function buildSalesReportPdf(data: SalesReportData): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 12;
  let y = M;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - M) {
      doc.addPage();
      y = M;
    }
  };

  // Cabeçalho
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("Relatório de Vendas", M, y + 4);
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(data.company.name, M, y);
  if (data.company.cnpj) {
    doc.text(`CNPJ: ${data.company.cnpj}`, pageW - M, y, { align: "right" });
  }
  y += 5;
  doc.text(data.period.label, M, y);
  doc.text(`Emitido em ${fmtDateTime(new Date().toISOString())}`, pageW - M, y, {
    align: "right",
  });
  y += 4;
  doc.setDrawColor(180);
  doc.line(M, y, pageW - M, y);
  y += 7;

  // Totais
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Totais do período", M, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Vendas: ${data.totals.count}`, M, y);
  doc.text(`Subtotal: ${brl(data.totals.subtotal)}`, M + 45, y);
  doc.text(`Descontos: ${brl(data.totals.discount)}`, M + 100, y);
  doc.setFont("helvetica", "bold");
  doc.text(`Total: ${brl(data.totals.total)}`, pageW - M, y, { align: "right" });
  y += 9;

  // Metadados
  const metaFrom = data.meta?.from ?? data.period.from;
  const metaTo = data.meta?.to ?? data.period.to;
  const notesCount = data.meta?.notesCount;
  ensureSpace(18);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Metadados", M, y);
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(
    `Intervalo de datas aplicado: ${fmtBr(metaFrom)} a ${fmtBr(metaTo)}`,
    M,
    y,
  );
  y += 4.5;
  doc.text(
    `Notas fiscais encontradas no período: ${notesCount ?? 0}`,
    M,
    y,
  );
  y += 9;



  // Resumo por forma de pagamento
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Resumo de Vendas por Forma de Pagamento", M, y);
  y += 6;

  const colMethod = M;
  const colCount = M + 95;
  const colPerc = M + 125;
  const colTotal = pageW - M;

  doc.setFontSize(9);
  doc.setFillColor(240, 240, 240);
  doc.rect(M, y - 4, pageW - M * 2, 6, "F");
  doc.text("Forma de pagamento", colMethod + 1, y);
  doc.text("Qtd", colCount, y);
  doc.text("%", colPerc, y);
  doc.text("Total", colTotal - 1, y, { align: "right" });
  y += 6;

  doc.setFont("helvetica", "normal");
  for (const p of data.paymentSummary) {
    ensureSpace(6);
    const perc = data.totals.total > 0 ? (p.total / data.totals.total) * 100 : 0;
    doc.text(String(p.method ?? "—").slice(0, 45), colMethod + 1, y);
    doc.text(String(p.count), colCount, y);
    doc.text(`${perc.toFixed(1)}%`, colPerc, y);
    doc.text(brl(p.total), colTotal - 1, y, { align: "right" });
    y += 5.5;
  }
  ensureSpace(8);
  doc.setDrawColor(200);
  doc.line(M, y - 3, pageW - M, y - 3);
  doc.setFont("helvetica", "bold");
  doc.text("Total geral", colMethod + 1, y + 1);
  doc.text(String(data.totals.count), colCount, y + 1);
  doc.text(brl(data.totals.total), colTotal - 1, y + 1, { align: "right" });
  y += 11;

  // Relatório resumido: sem listagem individual de vendas.


  // Rodapé com paginação
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text(`Página ${i} de ${pages}`, pageW - M, pageH - 6, { align: "right" });
    doc.setTextColor(0);
  }

  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}
