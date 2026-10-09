// Helper de impressão do cupom de Pedido de Delivery.
// Reusa o mesmo estilo (`receiptStyle`) usado no cupom de vendas para manter
// padronização visual e suporte a térmicas 58/80mm via QZ Tray.

import { supabase } from "@/integrations/supabase/client";
import { receiptStyle } from "@/lib/receipt-style";
import { brl } from "@/lib/format";
import { qzEnabled, qzPrinterName, qzPrintHtml80mm } from "@/lib/qz-print";
import { usbEnabled, usbStoredDevice, usbPrintDeliveryOrder } from "@/lib/usb-print";
import type { DeliveryOrder } from "@/lib/db-types";

export interface DeliveryPrintSettings {
  autoPrintNew?: boolean;
  receiptWidth?: string;
  fontSizePx?: string;
  lineHeight?: string;
  boldStrength?: string;
  header?: string;
  footerMessage?: string;
}

const DEFAULTS: Required<Pick<DeliveryPrintSettings, "receiptWidth" | "fontSizePx" | "lineHeight" | "boldStrength" | "footerMessage">> = {
  receiptWidth: "280",
  fontSizePx: "12",
  lineHeight: "1.35",
  boldStrength: "0.4",
  footerMessage: "Obrigado pelo pedido!",
};

export function getDeliveryPrintSettings(cid: string): DeliveryPrintSettings {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`delivery_print_settings_${cid}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setDeliveryPrintSettings(cid: string, s: DeliveryPrintSettings) {
  try {
    localStorage.setItem(`delivery_print_settings_${cid}`, JSON.stringify(s));
  } catch {
    /* noop */
  }
}

export function getSalePrintSettings(cid: string): DeliveryPrintSettings {
  // Reaproveita as configs visuais do cupom de venda quando existirem.
  try {
    const raw = localStorage.getItem(`print_settings_${cid}`);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

interface OrderItemLike {
  name: string;
  quantity: number;
  unit_price: number;
}

async function loadOrderContext(cid: string, o: DeliveryOrder) {
  const [companyRes, itemsRes] = await Promise.all([
    supabase
      .from("companies")
      .select("name, phone")
      .eq("id", cid)
      .maybeSingle(),
    o.sale_id
      ? supabase
          .from("sale_items")
          .select("quantity, unit_price, product_id, products(name)")
          .eq("sale_id", o.sale_id)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const items: OrderItemLike[] = ((itemsRes as any).data || []).map((it: any) => ({
    name: it.products?.name || "Item",
    quantity: Number(it.quantity || 0),
    unit_price: Number(it.unit_price || 0),
  }));

  return { company: (companyRes as any).data || null, items };
}

export function buildDeliveryOrderHtml(args: {
  o: DeliveryOrder;
  items: OrderItemLike[];
  company: { name?: string | null; phone?: string | null } | null;
  settings: DeliveryPrintSettings;
}) {
  const { o, items, company, settings } = args;
  const merged = { ...DEFAULTS, ...settings };
  const isDelivery = (o as any).tipo !== "Retirada"; // tolera ausência do campo
  const tipoLabel = isDelivery ? "ENTREGA" : "RETIRADA";

  const headerHtml = company?.name
    ? `<div class="header-text">${company.name}</div>${company?.phone ? `<div class="company-sub">Tel: ${company.phone}</div>` : ""}`
    : "";

  const itemsHtml =
    items.length > 0
      ? `<table style="margin-top: 5px;"><thead><tr><th style="text-align:left">PROD</th><th style="text-align:center">QTD</th><th style="text-align:right">UNIT</th><th style="text-align:right">TOTAL</th></tr></thead><tbody>${items
          .map(
            (i) =>
              `<tr><td>${i.name}</td><td style="text-align:center">${i.quantity}</td><td style="text-align:right">${brl(i.unit_price)}</td><td style="text-align:right">${brl(i.quantity * i.unit_price)}</td></tr>`,
          )
          .join("")}</tbody></table>`
      : `<div class="center" style="margin-top:6px">(Sem itens vinculados)</div>`;

  const fee = Number((o as any).delivery_fee ?? 0);
  const total = Number(o.total || 0);
  const subtotal = isDelivery && fee > 0 ? total - fee : total;

  const totalsHtml = `
    <div class="divider"></div>
    <div class="row"><span>SUBTOTAL:</span><span>${brl(subtotal)}</span></div>
    ${isDelivery && fee > 0 ? `<div class="row"><span>TAXA ENTREGA:</span><span>${brl(fee)}</span></div>` : ""}
    <div class="row bold mt big"><span>TOTAL:</span><span>${brl(total)}</span></div>
  `;

  const customerHtml = `
    <div class="divider"></div>
    <div class="bold">CLIENTE:</div>
    <div>${o.customer_name || "---"}</div>
    ${isDelivery ? `<div class="bold mt">ENDEREÇO:</div><div>${o.address || "---"}</div>` : ""}
    ${o.notes ? `<div class="bold mt">OBS:</div><div>${o.notes}</div>` : ""}
  `;

  const created = o.created_at ? new Date(o.created_at).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR");

  return `<html><head><title>Pedido Delivery</title><style>${receiptStyle({
    widthPx: merged.receiptWidth,
    fontSizePx: merged.fontSizePx,
    lineHeight: merged.lineHeight,
    boldStrength: merged.boldStrength,
  })}</style></head><body>
    <h2>PEDIDO ${tipoLabel}</h2>
    ${headerHtml}
    <div class="center">Data: ${created}</div>
    <div class="center">Pedido: #${o.sale_number || (o.id ? String(o.id).slice(0, 6) : "---")}</div>
    ${customerHtml}
    <div class="divider"></div>
    ${itemsHtml}
    ${totalsHtml}
    <div class="footer"><div>${merged.footerMessage}</div></div>
  </body></html>`;
}

function fallbackBrowserPrint(html: string) {
  try {
    const win = window.open("", "_blank");
    if (win) {
      win.document.write(
        html +
          `<script>window.onload = function() { window.print(); setTimeout(() => window.close(), 500); };</script>`,
      );
      win.document.close();
      return;
    }
  } catch {
    /* fallback abaixo */
  }
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow?.document;
  if (!doc) return;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    try {
      iframe.contentWindow?.print();
    } catch {
      /* noop */
    }
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* noop */
      }
    }, 1500);
  }, 300);
}

export async function printDeliveryOrder(cid: string, o: DeliveryOrder) {
  const settings = { ...getSalePrintSettings(cid), ...getDeliveryPrintSettings(cid) };
  const { company, items } = await loadOrderContext(cid, o);

  // 1) WebUSB (ESC/POS) — impressão direta, sem app local
  if (usbEnabled(cid) && usbStoredDevice(cid)) {
    try {
      await usbPrintDeliveryOrder({
        order: o as any,
        items,
        company,
        footer: settings.footerMessage,
      });
      return;
    } catch (e) {
      console.error("[USB] auto-print delivery falhou, tentando alternativa", e);
    }
  }

  const html = buildDeliveryOrderHtml({ o, items, company, settings });
  if (qzEnabled(cid) && qzPrinterName(cid)) {
    try {
      await qzPrintHtml80mm(html, { widthPx: settings.receiptWidth || "280" });
      return;
    } catch (e) {
      console.error("[QZ] auto-print delivery falhou, caindo para navegador", e);
    }
  }
  fallbackBrowserPrint(html);
}
