/**
 * Geração de um PDF único reunindo várias notas fiscais emitidas no período.
 * Layout: até 4 notas por página (grade 2x2). Notas extensas usam colunas
 * internas e, se necessário, ocupam meia página ou a página inteira — sempre
 * tentando manter todo o conteúdo da nota na mesma página.
 */

export interface FiscalNoteItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface FiscalNoteDoc {
  id: string;
  numero: string | null;
  serie: string | null;
  chave: string | null;
  status: string;
  tipo_operacao: string | null;
  emitted_at: string | null;
  customer_name: string | null;
  customer_doc: string | null;
  sale_number: number | null;
  protocolo?: string | null;
  ambiente?: string | null;
  ref?: string | null;
  total: number;
  items: FiscalNoteItem[];
}

export interface FiscalNotesPdfData {
  company: { name: string; cnpj: string | null };
  period: { from: string; to: string; label: string };
  notes: FiscalNoteDoc[];
}

const brl = (n: number) =>
  `R$ ${Number(n || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const fmtDateTime = (iso: string | null) => {
  if (!iso) return "—";
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

export async function buildFiscalNotesPdf(data: FiscalNotesPdfData): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 8;
  const GAP = 4;
  const HEADER_H = 12;

  const gridX = M;
  const gridY = M + HEADER_H;
  const gridW = pageW - M * 2;
  const gridH = pageH - gridY - M - 6;
  const cellW = (gridW - GAP) / 2;
  const cellH = (gridH - GAP) / 2;

  const LH = 3.2; // altura de linha para itens
  const HEAD_LINES = 9; // linhas fixas de cabeçalho da nota
  const FOOT_LINES = 3; // totais + chave

  let page = 0;
  // slots ocupados na página atual (0..3 => TL, TR, BL, BR)
  let slot = 0;

  const drawPageHeader = () => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text("Notas Fiscais Emitidas", M, M + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(data.company.name, M, M + 8.5);
    doc.text(data.period.label, pageW - M, M + 4, { align: "right" });
    if (data.company.cnpj) {
      doc.text(`CNPJ: ${data.company.cnpj}`, pageW - M, M + 8.5, { align: "right" });
    }
    doc.setDrawColor(180);
    doc.line(M, M + 10, pageW - M, M + 10);
  };

  const newPage = () => {
    if (page > 0) doc.addPage();
    page += 1;
    slot = 0;
    drawPageHeader();
  };

  newPage();

  /** Quantidade de linhas de item que cabem numa área com N colunas. */
  const capacity = (h: number, cols: number) =>
    Math.max(0, Math.floor((h - (HEAD_LINES + FOOT_LINES + 1) * LH - 4) / LH)) * cols;

  const drawNote = (note: FiscalNoteDoc, x: number, y: number, w: number, h: number) => {
    doc.setDrawColor(160);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, w, h, 1.5, 1.5, "S");

    const px = x + 2.5;
    let cy = y + 4.5;
    const innerW = w - 5;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    const isCancel = String(note.status).toLowerCase() === "cancelada";
    const isDev = String(note.tipo_operacao ?? "").toLowerCase() === "devolucao";
    doc.text(`NFC-e ${note.numero ?? "—"} / Série ${note.serie ?? "—"}`, px, cy);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    const tag = isCancel ? "CANCELADA" : isDev ? "DEVOLUÇÃO" : "AUTORIZADA";
    doc.text(tag, x + w - 2.5, cy, { align: "right" });
    cy += LH + 0.6;

    doc.setFontSize(6.8);
    doc.text(`Emissão: ${fmtDateTime(note.emitted_at)}`, px, cy);
    if (note.sale_number != null) {
      doc.text(`Venda #${note.sale_number}`, x + w - 2.5, cy, { align: "right" });
    }
    cy += LH;

    const cliente = (note.customer_name ?? "Consumidor final").slice(0, 60);
    doc.text(`Cliente: ${cliente}`, px, cy);
    cy += LH;
    if (note.customer_doc) {
      doc.text(`Doc: ${note.customer_doc}`, px, cy);
      cy += LH;
    }
    if (note.protocolo || note.ambiente) {
      const amb = String(note.ambiente ?? "").toLowerCase().startsWith("prod")
        ? "Produção"
        : note.ambiente
          ? "Homologação"
          : null;
      const parts = [
        note.protocolo ? `Protocolo: ${note.protocolo}` : null,
        amb ? `Ambiente: ${amb}` : null,
      ].filter(Boolean);
      doc.text(parts.join("  •  "), px, cy, { maxWidth: innerW });
      cy += LH;
    }
    if (note.ref) {
      doc.text(`Ref: ${String(note.ref).slice(0, 44)}`, px, cy);
      cy += LH;
    }
    doc.text(`Itens: ${note.items.length}`, px, cy);
    cy += LH;

    doc.setDrawColor(210);
    doc.line(px, cy - 1.6, x + w - 2.5, cy - 1.6);
    cy += 0.6;


    // Itens (com colunas internas se necessário)
    const availH = y + h - cy - (FOOT_LINES + 1) * LH - 2;
    const rowsPerCol = Math.max(1, Math.floor(availH / LH));
    const cols = note.items.length > rowsPerCol ? (note.items.length > rowsPerCol * 2 ? 3 : 2) : 1;
    const colW = (innerW - (cols - 1) * 3) / cols;

    doc.setFontSize(6.2);
    let shown = note.items;
    const maxRows = rowsPerCol * cols;
    let overflow = 0;
    if (shown.length > maxRows) {
      overflow = shown.length - (maxRows - 1);
      shown = shown.slice(0, maxRows - 1);
    }

    shown.forEach((it, i) => {
      const c = Math.floor(i / rowsPerCol);
      const r = i % rowsPerCol;
      const ix = px + c * (colW + 3);
      const iy = cy + r * LH;
      const qty = `${Number(it.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}x`;
      const unit = brl(it.unitPrice).replace("R$ ", "");
      const value = brl(it.total).replace("R$ ", "");
      const prefix = `${qty} ${unit}`;
      const maxDesc = Math.max(6, Math.floor(colW / 1.25) - prefix.length - value.length);
      const desc = String(it.description ?? "").slice(0, maxDesc);
      doc.text(`${prefix} ${desc}`, ix, iy);
      doc.text(value, ix + colW, iy, { align: "right" });
    });

    if (overflow > 0) {
      const i = shown.length;
      const c = Math.floor(i / rowsPerCol);
      const r = i % rowsPerCol;
      doc.setFont("helvetica", "italic");
      doc.text(`+ ${overflow} itens`, px + c * (colW + 3), cy + r * LH);
      doc.setFont("helvetica", "normal");
    }

    // Rodapé da nota
    let fy = y + h - 2.5;
    if (note.chave) {
      doc.setFontSize(5.4);
      doc.setTextColor(110);
      const chave = note.chave.replace(/\s+/g, "");
      doc.text(chave.replace(/(.{4})/g, "$1 ").trim(), px, fy, { maxWidth: innerW });
      doc.setTextColor(0);
      fy -= LH + 0.4;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.text(`Total: ${brl(note.total)}`, x + w - 2.5, fy, { align: "right" });
    doc.setFont("helvetica", "normal");

    if (isCancel) {
      doc.setDrawColor(190, 60, 60);
      doc.setLineWidth(0.4);
      doc.line(x + 2, y + 2, x + w - 2, y + h - 2);
      doc.setLineWidth(0.2);
    }
  };

  for (const note of data.notes) {
    // Decide quantos slots a nota precisa para caber inteira na página
    const fitsQuarter = note.items.length <= capacity(cellH, 2);
    const fitsHalf = note.items.length <= capacity(cellH, 3);
    const needed = fitsQuarter ? 1 : fitsHalf ? 2 : 4;

    // Blocos de 2 e 4 slots precisam iniciar em linha
    if (needed === 2 && slot % 2 !== 0) slot += 1;
    if (needed === 4 && slot !== 0) slot = 4;
    if (slot + needed > 4) newPage();

    const col = slot % 2;
    const row = Math.floor(slot / 2);
    const x = gridX + col * (cellW + GAP);
    const y = gridY + row * (cellH + GAP);

    if (needed === 1) drawNote(note, x, y, cellW, cellH);
    else if (needed === 2) drawNote(note, gridX, y, gridW, cellH);
    else drawNote(note, gridX, gridY, gridW, gridH);

    slot += needed;
    if (slot >= 4 && note !== data.notes[data.notes.length - 1]) {
      newPage();
    }
  }

  if (data.notes.length === 0) {
    doc.setFontSize(10);
    doc.text("Nenhuma nota fiscal emitida no período.", M, gridY + 8);
  }

  const somaNotas = data.notes.reduce((s, n) => s + Number(n.total || 0), 0);
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
      `${data.notes.length} nota(s) — Total: ${brl(somaNotas)} — Página ${i} de ${pages}`,
      pageW - M,
      pageH - 4,
      { align: "right" },
    );
    doc.setTextColor(0);
  }

  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}
