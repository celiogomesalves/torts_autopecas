// Gera o DANFC-e em PDF (80mm) no mesmo estilo do cupom impresso na venda.
type ReceiptItem = {
  description: string;
  code?: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
};

export type NfceEmailPdfData = {
  companyName: string;
  fantasyName?: string | null;
  address?: string | null;
  cnpj?: string | null;
  ie?: string | null;
  ambiente?: string | null;
  ref?: string | null;
  numero?: string | number | null;
  serie?: string | number | null;
  chave?: string | null;
  protocolo?: string | null;
  emittedAt?: string | null;
  customerName?: string | null;
  customerDoc?: string | null;
  paymentMethod?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  items: ReceiptItem[];
};

const money = (value: number) =>
  Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatDoc = (value?: string | null) => {
  const d = String(value ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return value ?? "";
};

export async function buildNfceEmailPdf(data: NfceEmailPdfData): Promise<Uint8Array> {
  const { jsPDF } = await import("jspdf");
  const height = Math.max(170, 120 + data.items.length * 10);
  const doc = new jsPDF({ unit: "mm", format: [80, height] });
  const left = 4;
  const right = 76;
  let y = 7;

  const center = (text: string, size = 8, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, 70) as string[];
    doc.text(lines, 40, y, { align: "center" });
    y += lines.length * (size * 0.42) + 1;
  };
  const line = () => {
    doc.setLineDashPattern([0.7, 0.7], 0);
    doc.setDrawColor(0);
    doc.line(left, y, right, y);
    doc.setLineDashPattern([], 0);
    y += 3.5;
  };
  const row = (label: string, value: string, bold = false, size?: number) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size ?? (bold ? 10 : 8));
    doc.text(label, left, y);
    doc.text(value, right, y, { align: "right" });
    y += bold ? 5.5 : 4.2;
  };
  const text = (value: string, size = 7.5) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(value, 72) as string[];
    doc.text(lines, left, y);
    y += lines.length * (size * 0.42) + 0.8;
  };

  // Cabeçalho do emitente
  center((data.fantasyName || data.companyName || "Emitente").toUpperCase(), 10.5, true);
  if (data.fantasyName && data.companyName && data.fantasyName !== data.companyName)
    center(data.companyName, 7.5);
  if (data.cnpj)
    center(
      `CNPJ: ${formatDoc(data.cnpj)}${data.ie ? `   IE: ${data.ie}` : ""}`,
      7.5,
    );
  if (data.address) center(data.address, 7);
  line();

  center("DANFE NFC-e - Cupom Fiscal", 9.5, true);
  center("Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica", 6.5);
  if (data.ambiente === "homologacao")
    center("EMITIDA EM HOMOLOGAÇÃO - SEM VALOR FISCAL", 7.5, true);
  line();

  // Itens
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.text("Qtd x Vl Unit", left, y);
  doc.text("Total", right, y, { align: "right" });
  y += 4;
  data.items.forEach((item, index) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const description = `${index + 1}. ${item.description}${item.code ? ` (${item.code})` : ""}`;
    const lines = doc.splitTextToSize(description, 72) as string[];
    doc.text(lines, left, y);
    y += lines.length * 3.2;
    doc.text(`${money(item.quantity)} x ${money(item.unitPrice)}`, left, y);
    doc.text(money(item.total), right, y, { align: "right" });
    y += 4.2;
  });
  line();

  // Totais
  row("Subtotal", `R$ ${money(data.subtotal)}`);
  row("Desconto", `R$ ${money(data.discount)}`);
  row("TOTAL", `R$ ${money(data.total)}`, true, 12);
  if (data.paymentMethod) row("Pagamento", data.paymentMethod);
  line();

  // Consumidor e dados da nota
  text(`Consumidor: ${data.customerName || "Consumidor Final"}`);
  if (data.customerDoc) text(`CPF/CNPJ: ${formatDoc(data.customerDoc)}`);
  text(`NFC-e nº ${data.numero ?? "-"}  Série ${data.serie ?? "-"}`);
  if (data.emittedAt) text(`Emissão: ${new Date(data.emittedAt).toLocaleString("pt-BR")}`);
  if (data.protocolo) text(`Protocolo: ${data.protocolo}`);
  if (data.chave) {
    text("Chave de acesso:");
    doc.setFont("courier", "normal");
    doc.setFontSize(7);
    const chave = data.chave.replace(/^NFe/i, "").replace(/\D/g, "");
    const lines = doc.splitTextToSize(
      chave.replace(/(.{4})/g, "$1 ").trim(),
      72,
    ) as string[];
    doc.text(lines, left, y);
    y += lines.length * 3.2 + 1;
  }
  center("Consulte pela chave de acesso no portal da SEFAZ", 6.5);
  line();
  if (data.ref) center(`Ref: ${data.ref}`, 6.5);

  return new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
}
