// Helper para impressão do DANFE NFC-e a partir de um PDF em base64.
//
// Estratégia (em ordem):
// 1) Se o QZ Tray estiver habilitado nas preferências desta máquina, envia
//    direto para a impressora térmica configurada (cupom 80mm silencioso).
// 2) Senão, abre o PDF em nova aba e dispara window.print() pelo viewer.
// 3) Se popup foi bloqueado, cai num iframe oculto.
// 4) Último recurso: força download do arquivo.

import { qzEnabled, qzPrinterName, qzPrintHtml80mm, qzPrintPdfBase64 } from "@/lib/qz-print";
import { usbEnabled, usbStoredDevice, usbPrintNfceReceipt } from "@/lib/usb-print";
import { toast } from "sonner";
import { toDataURL } from "qrcode";

export type NfceReceipt80mm = {
  ref: string;
  ambiente?: string | null;
  company: {
    name: string;
    fantasyName?: string | null;
    cnpj?: string | null;
    ie?: string | null;
    address?: string | null;
  };
  sale: {
    number?: unknown;
    createdAt?: unknown;
    paymentMethod?: unknown;
    subtotal: number;
    discount: number;
    total: number;
  };
  customer: { name?: string | null; doc?: string | null };
  note: {
    numero?: unknown;
    serie?: unknown;
    chave?: string | null;
    protocolo?: string | null;
    emittedAt?: unknown;
    qrCodeUrl?: string | null;
  };
  items: Array<{
    name: string;
    code?: string | null;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  taxes?: {
    base: number;
    ibsUfRate: number;
    ibsUf: number;
    ibsMunRate: number;
    ibsMun: number;
    ibs: number;
    cbsRate: number;
    cbs: number;
    total: number;
  } | null;
};


function base64ToBlob(pdfBase64: string): Blob {
  const bin = atob(pdfBase64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "application/pdf" });
}

function printViaIframe(url: string): boolean {
  try {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.src = url;
    iframe.onload = () => {
      setTimeout(() => {
        if (!iframe.isConnected) return;
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (e) {
          console.warn("iframe print ignorado", e);
        }
      }, 500);
    };

    document.body.appendChild(iframe);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function downloadFallback(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = `danfe-nfce-${Date.now()}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function brDate(value: unknown) {
  if (!value) return new Date().toLocaleString("pt-BR");
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("pt-BR");
}

function doc(value?: string | null) {
  const d = (value ?? "").replace(/\D/g, "");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return value ?? "";
}

async function buildReceiptHtml(data: NfceReceipt80mm) {
  const qr = data.note.qrCodeUrl
    ? await toDataURL(data.note.qrCodeUrl, { width: 190, margin: 1 })
    : "";
  const items = data.items
    .map(
      (it, idx) => `
    <tr><td colspan="4" class="desc">${idx + 1}. ${esc(it.name)}${it.code ? ` <span>(${esc(it.code)})</span>` : ""}</td></tr>
    <tr><td>${money(it.quantity)}</td><td>x</td><td>${money(it.unitPrice)}</td><td class="right">${money(it.total)}</td></tr>
  `,
    )
    .join("");
  const chave = (data.note.chave ?? "").replace(/^NFe/i, "").replace(/\D/g, "");
  const chaveFmt = chave ? chave.replace(/(.{4})/g, "$1 ").trim() : "";

  return `<!doctype html><html><head><meta charset="utf-8" />
  <style>
    @page{size:80mm auto;margin:0}*{box-sizing:border-box}body{margin:0;background:#fff;color:#000;font-family:Arial,'Helvetica Neue',sans-serif;font-size:10px;line-height:1.25}.cupom{width:72mm;margin:0 auto;padding:3mm 2mm}.center{text-align:center}.right{text-align:right}.bold{font-weight:700}.muted{font-size:9px}.line{border-top:1px dashed #000;margin:5px 0}.title{font-size:12px;font-weight:700}.company{font-size:11px;font-weight:700;text-transform:uppercase}.desc{padding-top:3px;word-break:break-word}.desc span{font-size:9px}table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:1px 0}.totals td{font-size:11px}.total td{font-size:13px;font-weight:700}.key{word-break:break-all;font-family:monospace;font-size:9px}.qr{width:36mm;height:36mm;margin:4px auto 1px;display:block}.cut{height:12mm}
  </style></head><body><main class="cupom">
    <section class="center">
      <div class="company">${esc(data.company.fantasyName || data.company.name)}</div>
      <div>${esc(data.company.name)}</div>
      ${data.company.cnpj ? `<div>CNPJ: ${esc(doc(data.company.cnpj))}${data.company.ie ? ` IE: ${esc(data.company.ie)}` : ""}</div>` : ""}
      ${data.company.address ? `<div>${esc(data.company.address)}</div>` : ""}
    </section>
    <div class="line"></div>
    <section class="center">
      <div class="title">DANFE NFC-e - Cupom Fiscal</div>
      <div class="muted">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
      ${data.ambiente === "homologacao" ? `<div class="bold">EMITIDA EM HOMOLOGAÇÃO - SEM VALOR FISCAL</div>` : ""}
    </section>
    <div class="line"></div>
    <table><thead><tr><td>Qtd</td><td></td><td>Vl Unit</td><td class="right">Total</td></tr></thead><tbody>${items}</tbody></table>
    <div class="line"></div>
    <table class="totals">
      <tr><td>Subtotal</td><td class="right">R$ ${money(data.sale.subtotal)}</td></tr>
      <tr><td>Desconto</td><td class="right">R$ ${money(data.sale.discount)}</td></tr>
      <tr class="total"><td>TOTAL</td><td class="right">R$ ${money(data.sale.total)}</td></tr>
      <tr><td>Pagamento</td><td class="right">${esc(data.sale.paymentMethod || "")}</td></tr>
    </table>
    ${
      data.taxes && data.taxes.total > 0
        ? `<div class="line"></div>
    <section>
      <div class="bold">Total dos Tributos (IBS/CBS)</div>
      <table class="totals">
        <tr><td>Base de cálculo</td><td class="right">R$ ${money(data.taxes.base)}</td></tr>
        <tr><td>IBS UF (${money(data.taxes.ibsUfRate)}%)</td><td class="right">R$ ${money(data.taxes.ibsUf)}</td></tr>
        <tr><td>IBS Mun. (${money(data.taxes.ibsMunRate)}%)</td><td class="right">R$ ${money(data.taxes.ibsMun)}</td></tr>
        <tr><td>CBS (${money(data.taxes.cbsRate)}%)</td><td class="right">R$ ${money(data.taxes.cbs)}</td></tr>
        <tr class="bold"><td>Total IBS+CBS</td><td class="right">R$ ${money(data.taxes.total)}</td></tr>
      </table>
      <div class="muted">Valor aproximado dos tributos - Lei 12.741/2012</div>
    </section>`
        : ""
    }
    <div class="line"></div>

    <section>
      <div>Consumidor: ${esc(data.customer.name || "Consumidor Final")}</div>
      ${data.customer.doc ? `<div>CPF/CNPJ: ${esc(doc(data.customer.doc))}</div>` : ""}
      <div>NFC-e nº ${esc(data.note.numero || "-")} Série ${esc(data.note.serie || "-")}</div>
      <div>Emissão: ${esc(brDate(data.note.emittedAt || data.sale.createdAt))}</div>
      ${data.note.protocolo ? `<div>Protocolo: ${esc(data.note.protocolo)}</div>` : ""}
      ${chaveFmt ? `<div>Chave de acesso:</div><div class="key">${esc(chaveFmt)}</div>` : ""}
    </section>
    ${qr ? `<img class="qr" src="${qr}" alt="QR Code NFC-e" />` : ""}
    ${data.note.qrCodeUrl ? `<div class="center muted">Consulte pela chave de acesso ou QR Code</div>` : ""}
    <div class="line"></div><div class="center muted">Ref: ${esc(data.ref)}</div><div class="cut"></div>
  </main></body></html>`;
}

/** Dispara print com segurança: ignora janelas fechadas/descarregadas. */
function safePrintWindow(w: Window | null | undefined) {
  try {
    if (!w || w.closed) return false;
    w.focus();
    w.print();
    return true;
  } catch (e) {
    console.warn("print ignorado (janela indisponível)", e);
    return false;
  }
}

function printReceiptViaBrowser(html: string) {
  const win = window.open("", "_blank", "width=420,height=700");
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => safePrintWindow(win), 350);
    return;
  }
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  iframe.contentDocument?.open();
  iframe.contentDocument?.write(html);
  iframe.contentDocument?.close();
  setTimeout(() => {
    if (!iframe.isConnected) return;
    safePrintWindow(iframe.contentWindow);
  }, 350);
}


// Considera o QZ "disponível" se estiver habilitado OU se houver uma
// impressora salva neste dispositivo (a seleção fica como padrão).
function shouldTryQz() {
  return qzEnabled() || !!qzPrinterName();
}
function shouldTryUsb() {
  return usbEnabled() && !!usbStoredDevice();
}

export async function printNfceReceipt80mm(data: NfceReceipt80mm) {
  // 1) WebUSB (ESC/POS) direto — mais rápido, sem app local
  if (shouldTryUsb()) {
    try {
      await usbPrintNfceReceipt(data);
      toast.success("Cupom enviado para a impressora USB");
      return;
    } catch (e: unknown) {
      console.error("WebUSB receipt print error", e);
      toast.error(`USB: ${errorMessage(e, "falha ao imprimir")}. Tentando alternativa.`);
    }
  }

  const html = await buildReceiptHtml(data);
  if (shouldTryQz()) {
    try {
      await qzPrintHtml80mm(html);
      toast.success("Cupom 80mm enviado para a impressora");
      return;
    } catch (e: unknown) {
      console.error("QZ Tray receipt print error", e);
      toast.error(
        `QZ Tray: ${errorMessage(e, "falha ao imprimir")}. Abrindo impressão 80mm no navegador.`,
      );
    }
  }
  printReceiptViaBrowser(html);
}

export async function printPdfBase64(pdfBase64: string) {
  // 0) QZ Tray disponível nesta máquina — imprime direto na térmica configurada
  if (shouldTryQz()) {
    try {
      await qzPrintPdfBase64(pdfBase64);
      toast.success("Cupom enviado para a impressora");
      return;
    } catch (e: any) {
      console.error("QZ Tray print error", e);
      toast.error(
        `QZ Tray: ${e?.message || "falha ao imprimir"}. Usando impressão pelo navegador.`,
      );
      // segue para fallback
    }
  }

  const blob = base64ToBlob(pdfBase64);
  const url = URL.createObjectURL(blob);

  // 1) Tenta abrir nova aba — caminho mais confiável para acionar o
  // diálogo nativo de impressão usando o viewer de PDF do navegador.
  const win = window.open(url, "_blank");
  if (win) {
    let printed = false;
    const triggerPrint = () => {
      if (printed) return;
      printed = safePrintWindow(win);
    };
    try {
      win.addEventListener("load", () => setTimeout(triggerPrint, 400));
    } catch {
      /* cross-origin/timing — ignora */
    }
    setTimeout(triggerPrint, 1200);

    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }

  // 2) Popup bloqueado — tenta iframe oculto
  if (printViaIframe(url)) {
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    return;
  }

  // 3) Último recurso — força download
  downloadFallback(url);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

