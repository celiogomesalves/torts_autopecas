// Impressão direta na térmica USB via WebUSB + ESC/POS.
//
// Alternativa ao QZ Tray sem depender de aplicativo local: o próprio
// navegador (Chrome/Edge/Opera) conversa com a impressora USB. O usuário
// autoriza o dispositivo uma vez (`navigator.usb.requestDevice`) e o
// pareamento fica salvo pelo browser. Nas próximas aberturas
// reconectamos via `navigator.usb.getDevices()`.
//
// Restrições conhecidas:
// - Não funciona em Firefox/Safari (WebUSB é Chromium-only).
// - Não funciona em impressoras compartilhadas em rede (só USB local).
// - Requer HTTPS (o preview e o domínio publicado já são HTTPS).
//
// Comandos ESC/POS de referência:
//   ESC @        -> init            (1B 40)
//   ESC ! n      -> print mode      (1B 21 nn)
//   ESC a n      -> alignment       (1B 61 nn) 0=esq 1=centro 2=dir
//   GS  V m      -> cut             (1D 56 mm)
//   GS  ( k ...  -> QR Code (nativo em quase todas térmicas ESC/POS)
//
// A escolha por texto puro (em vez de rasterizar HTML) mantém a impressão
// instantânea e evita dependências pesadas de renderização.

import type { NfceReceipt80mm } from "@/lib/print-danfe";

// ---------- Persistência de pareamento (por empresa) ----------

const COMPANY_KEY = "ap.currentCompanyId";
const LS_ENABLED_LEGACY = "usb.enabled";
const LS_DEVICE_LEGACY = "usb.deviceId";

function currentCid(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(COMPANY_KEY);
  } catch {
    return null;
  }
}
function keyEnabled(cid?: string | null) {
  const c = cid ?? currentCid();
  return c ? `usb.enabled.${c}` : LS_ENABLED_LEGACY;
}
function keyDevice(cid?: string | null) {
  const c = cid ?? currentCid();
  return c ? `usb.device.${c}` : LS_DEVICE_LEGACY;
}

export function usbEnabled(cid?: string | null): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(keyEnabled(cid)) === "1";
}
export function setUsbEnabled(v: boolean, cid?: string | null) {
  localStorage.setItem(keyEnabled(cid), v ? "1" : "0");
}

interface StoredDevice {
  vendorId: number;
  productId: number;
  serialNumber?: string | null;
  productName?: string | null;
}

export function usbStoredDevice(cid?: string | null): StoredDevice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(keyDevice(cid));
    return raw ? (JSON.parse(raw) as StoredDevice) : null;
  } catch {
    return null;
  }
}
export function setUsbStoredDevice(d: StoredDevice | null, cid?: string | null) {
  if (d) localStorage.setItem(keyDevice(cid), JSON.stringify(d));
  else localStorage.removeItem(keyDevice(cid));
}

export function isWebUsbSupported(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

// ---------- Pareamento e conexão ----------

type USBDeviceLike = any;

let cachedDevice: USBDeviceLike | null = null;
let cachedEndpoint: number | null = null;

function toStored(dev: USBDeviceLike): StoredDevice {
  return {
    vendorId: dev.vendorId,
    productId: dev.productId,
    serialNumber: dev.serialNumber ?? null,
    productName: dev.productName ?? null,
  };
}

export async function usbRequestDevice(cid?: string | null): Promise<StoredDevice> {
  if (!isWebUsbSupported()) throw new Error("Seu navegador não suporta WebUSB (use Chrome/Edge).");
  // Classe 7 = Printer. Muitas térmicas expõem só como "vendor-specific" (0xff),
  // por isso deixamos os filtros vazios para o usuário poder escolher.
  const device = await (navigator as any).usb.requestDevice({ filters: [{ classCode: 7 }, {}] });
  if (!device) throw new Error("Nenhuma impressora selecionada");
  const stored = toStored(device);
  setUsbStoredDevice(stored, cid);
  cachedDevice = device;
  cachedEndpoint = null;
  return stored;
}

async function findPairedDevice(cid?: string | null): Promise<USBDeviceLike | null> {
  if (!isWebUsbSupported()) return null;
  const target = usbStoredDevice(cid);
  if (!target) return null;
  const devices: USBDeviceLike[] = await (navigator as any).usb.getDevices();
  return (
    devices.find(
      (d) =>
        d.vendorId === target.vendorId &&
        d.productId === target.productId &&
        (target.serialNumber ? d.serialNumber === target.serialNumber : true),
    ) || null
  );
}

async function openDevice(dev: USBDeviceLike): Promise<number> {
  if (!dev.opened) {
    try {
      await dev.open();
    } catch (e: any) {
      const msg = String(e?.message || e || "");
      if (/Access denied/i.test(msg)) {
        throw new Error(
          "Acesso à impressora USB negado pelo sistema. O driver do Windows/macOS/Linux está segurando o dispositivo. " +
          "No Windows: use o Zadig para instalar o driver WinUSB nesta impressora, ou remova-a de 'Impressoras e Scanners'. " +
          "No Linux: garanta permissão de udev para o dispositivo. Depois recarregue a página e pareie novamente.",
        );
      }
      throw new Error(`Falha ao abrir a impressora USB: ${msg}`);
    }
  }
  if (!dev.configuration) await dev.selectConfiguration(1);
  const iface = dev.configuration.interfaces[0];
  const alt = iface.alternates[0];
  try {
    await dev.claimInterface(iface.interfaceNumber);
  } catch (e: any) {
    const msg = String(e?.message || e || "");
    if (/Access denied/i.test(msg)) {
      throw new Error(
        "Interface USB bloqueada pelo sistema operacional. Feche o spooler/driver do SO ou instale o driver WinUSB (Zadig) para esta impressora.",
      );
    }
    throw new Error(
      "Não foi possível reservar a impressora USB. Feche o driver do sistema (spooler) ou outro app que esteja usando-a.",
    );
  }
  const ep = alt.endpoints.find((e: any) => e.direction === "out");
  if (!ep) throw new Error("Impressora sem endpoint de saída USB (não é ESC/POS?).");
  return ep.endpointNumber;
}

async function getReadyDevice(cid?: string | null): Promise<{ device: USBDeviceLike; endpoint: number }> {
  if (cachedDevice && cachedEndpoint != null) {
    try {
      // valida se ainda está aberta
      if (!cachedDevice.opened) await cachedDevice.open();
      return { device: cachedDevice, endpoint: cachedEndpoint };
    } catch {
      cachedDevice = null;
      cachedEndpoint = null;
    }
  }
  const dev = await findPairedDevice(cid);
  if (!dev) throw new Error("Impressora USB não pareada. Clique em 'Parear impressora' para configurar.");
  const ep = await openDevice(dev);
  cachedDevice = dev;
  cachedEndpoint = ep;
  return { device: dev, endpoint: ep };
}

async function sendBytes(bytes: Uint8Array, cid?: string | null) {
  const { device, endpoint } = await getReadyDevice(cid);
  // Fragmenta em chunks de 4KB para evitar timeouts em USB2 lentos
  const CHUNK = 4096;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    await device.transferOut(endpoint, bytes.slice(i, i + CHUNK));
  }
}

// ---------- ESC/POS builder ----------

const enc = new TextEncoder();

function concat(parts: Array<Uint8Array | string | number[]>): Uint8Array {
  const chunks = parts.map((p) =>
    typeof p === "string" ? enc.encode(p) : p instanceof Uint8Array ? p : new Uint8Array(p),
  );
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

// Normaliza para ASCII para evitar problemas de code page entre marcas
function ascii(s: string): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x00-\x7f]/g, "?");
}

const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

const CMD_INIT = new Uint8Array([ESC, 0x40]);
const CMD_ALIGN_LEFT = new Uint8Array([ESC, 0x61, 0x00]);
const CMD_ALIGN_CENTER = new Uint8Array([ESC, 0x61, 0x01]);
const CMD_BOLD_ON = new Uint8Array([ESC, 0x45, 0x01]);
const CMD_BOLD_OFF = new Uint8Array([ESC, 0x45, 0x00]);
const CMD_DBL_ON = new Uint8Array([ESC, 0x21, 0x30]);
const CMD_DBL_OFF = new Uint8Array([ESC, 0x21, 0x00]);
const CMD_CUT = new Uint8Array([GS, 0x56, 0x01]);
const CMD_FEED_3 = new Uint8Array([ESC, 0x64, 0x03]);

function qrCode(data: string, size = 8): Uint8Array {
  const store = new TextEncoder().encode(data);
  const len = store.length + 3;
  const pL = len & 0xff;
  const pH = (len >> 8) & 0xff;
  return concat([
    // model 2
    [GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00],
    // module size
    [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size],
    // error correction M
    [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31],
    // store data
    [GS, 0x28, 0x6b, pL, pH, 0x31, 0x50, 0x30],
    store,
    // print
    [GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30],
  ]);
}

function money(v: unknown): string {
  return Number(v ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function brDate(v: unknown): string {
  if (!v) return new Date().toLocaleString("pt-BR");
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("pt-BR");
}
function pad(txt: string, cols: number, align: "l" | "r" = "l"): string {
  txt = ascii(txt).slice(0, cols);
  if (txt.length >= cols) return txt;
  return align === "l" ? txt.padEnd(cols) : txt.padStart(cols);
}
function row2(left: string, right: string, cols = 48): string {
  const l = ascii(left);
  const r = ascii(right);
  const space = Math.max(1, cols - l.length - r.length);
  return l + " ".repeat(space) + r + "\n";
}
function divider(cols = 48): string {
  return "-".repeat(cols) + "\n";
}

// ---------- Builders p/ os cupons do app ----------

export interface UsbPrintOptions {
  cols?: 32 | 42 | 48; // 58mm ≈ 32, 76mm ≈ 42, 80mm ≈ 48
}

export async function usbPrintNfceReceipt(data: NfceReceipt80mm, opts: UsbPrintOptions = {}) {
  const cols = opts.cols ?? 48;
  const parts: Array<Uint8Array | string> = [];
  parts.push(CMD_INIT);
  parts.push(CMD_ALIGN_CENTER);
  parts.push(CMD_BOLD_ON);
  parts.push(CMD_DBL_ON);
  parts.push(ascii(data.company.fantasyName || data.company.name) + "\n");
  parts.push(CMD_DBL_OFF);
  parts.push(ascii(data.company.name) + "\n");
  parts.push(CMD_BOLD_OFF);
  if (data.company.cnpj) parts.push(`CNPJ: ${ascii(data.company.cnpj)}\n`);
  if (data.company.address) parts.push(ascii(data.company.address) + "\n");
  parts.push(divider(cols));
  parts.push(CMD_BOLD_ON);
  parts.push("DANFE NFC-e - Cupom Fiscal\n");
  parts.push(CMD_BOLD_OFF);
  parts.push("Documento Auxiliar da NFC-e\n");
  if (data.ambiente === "homologacao") {
    parts.push(CMD_BOLD_ON);
    parts.push("EMITIDA EM HOMOLOGACAO\n");
    parts.push("SEM VALOR FISCAL\n");
    parts.push(CMD_BOLD_OFF);
  }
  parts.push(divider(cols));

  parts.push(CMD_ALIGN_LEFT);
  parts.push(pad("PROD", cols - 24) + pad("QT", 5, "r") + pad("UNIT", 9, "r") + pad("TOTAL", 10, "r") + "\n");
  data.items.forEach((it, i) => {
    const desc = `${i + 1}. ${it.name}${it.code ? ` (${it.code})` : ""}`;
    parts.push(ascii(desc).slice(0, cols) + "\n");
    parts.push(
      pad("", cols - 24) +
        pad(String(it.quantity), 5, "r") +
        pad(money(it.unitPrice), 9, "r") +
        pad(money(it.total), 10, "r") +
        "\n",
    );
  });

  parts.push(divider(cols));
  parts.push(row2("Subtotal", "R$ " + money(data.sale.subtotal), cols));
  parts.push(row2("Desconto", "R$ " + money(data.sale.discount), cols));
  parts.push(CMD_BOLD_ON);
  parts.push(CMD_DBL_ON);
  parts.push(row2("TOTAL", "R$ " + money(data.sale.total), cols / 2));
  parts.push(CMD_DBL_OFF);
  parts.push(CMD_BOLD_OFF);
  parts.push(row2("Pagamento", String(data.sale.paymentMethod || ""), cols));

  if (data.taxes && data.taxes.total > 0) {
    parts.push(divider(cols));
    parts.push(CMD_BOLD_ON);
    parts.push("Total dos Tributos (IBS/CBS)\n");
    parts.push(CMD_BOLD_OFF);
    parts.push(row2("Base de calculo", "R$ " + money(data.taxes.base), cols));
    parts.push(row2(`IBS UF (${money(data.taxes.ibsUfRate)}%)`, "R$ " + money(data.taxes.ibsUf), cols));
    parts.push(row2(`IBS Mun. (${money(data.taxes.ibsMunRate)}%)`, "R$ " + money(data.taxes.ibsMun), cols));
    parts.push(row2(`CBS (${money(data.taxes.cbsRate)}%)`, "R$ " + money(data.taxes.cbs), cols));
    parts.push(CMD_BOLD_ON);
    parts.push(row2("Total IBS+CBS", "R$ " + money(data.taxes.total), cols));
    parts.push(CMD_BOLD_OFF);
    parts.push("Valor aprox. tributos - Lei 12.741/2012\n");
  }


  parts.push(divider(cols));
  parts.push("Consumidor: " + ascii(data.customer.name || "Consumidor Final") + "\n");
  if (data.customer.doc) parts.push("CPF/CNPJ: " + ascii(data.customer.doc) + "\n");
  parts.push(`NFC-e no ${ascii(String(data.note.numero ?? "-"))} Serie ${ascii(String(data.note.serie ?? "-"))}\n`);
  parts.push("Emissao: " + brDate(data.note.emittedAt || data.sale.createdAt) + "\n");
  if (data.note.protocolo) parts.push("Protocolo: " + ascii(data.note.protocolo) + "\n");
  const chave = (data.note.chave ?? "").replace(/^NFe/i, "").replace(/\D/g, "");
  if (chave) {
    parts.push("Chave:\n");
    parts.push(chave.replace(/(.{4})/g, "$1 ").trim() + "\n");
  }
  parts.push(divider(cols));

  if (data.note.qrCodeUrl) {
    parts.push(CMD_ALIGN_CENTER);
    parts.push(qrCode(data.note.qrCodeUrl, 8));
    parts.push("\nConsulte pela chave ou QR Code\n");
    parts.push(CMD_ALIGN_LEFT);
  }
  parts.push(CMD_ALIGN_CENTER);
  parts.push(`Ref: ${ascii(data.ref)}\n`);
  parts.push(CMD_FEED_3);
  parts.push(CMD_CUT);

  await sendBytes(concat(parts));
}

export interface UsbDeliveryOrder {
  tipo?: string;
  sale_number?: unknown;
  id?: string | null;
  created_at?: unknown;
  customer_name?: string | null;
  address?: string | null;
  notes?: string | null;
  delivery_fee?: number | null;
  total?: number | null;
}
export interface UsbDeliveryItem {
  name: string;
  quantity: number;
  unit_price: number;
}

export async function usbPrintDeliveryOrder(args: {
  order: UsbDeliveryOrder;
  items: UsbDeliveryItem[];
  company: { name?: string | null; phone?: string | null } | null;
  footer?: string;
  opts?: UsbPrintOptions;
}) {
  const cols = args.opts?.cols ?? 48;
  const { order: o, items, company, footer } = args;
  const isDelivery = o.tipo !== "Retirada";
  const tipo = isDelivery ? "ENTREGA" : "RETIRADA";

  const parts: Array<Uint8Array | string> = [];
  parts.push(CMD_INIT);
  parts.push(CMD_ALIGN_CENTER);
  parts.push(CMD_BOLD_ON);
  parts.push(CMD_DBL_ON);
  parts.push(`PEDIDO ${tipo}\n`);
  parts.push(CMD_DBL_OFF);
  parts.push(CMD_BOLD_OFF);
  if (company?.name) parts.push(ascii(company.name) + "\n");
  if (company?.phone) parts.push("Tel: " + ascii(company.phone) + "\n");
  parts.push("Data: " + brDate(o.created_at) + "\n");
  parts.push(
    "Pedido: #" +
      ascii(String(o.sale_number ?? (o.id ? String(o.id).slice(0, 6) : "---"))) +
      "\n",
  );

  parts.push(divider(cols));
  parts.push(CMD_ALIGN_LEFT);
  parts.push(CMD_BOLD_ON);
  parts.push("CLIENTE:\n");
  parts.push(CMD_BOLD_OFF);
  parts.push(ascii(o.customer_name || "---") + "\n");
  if (isDelivery) {
    parts.push(CMD_BOLD_ON);
    parts.push("ENDERECO:\n");
    parts.push(CMD_BOLD_OFF);
    parts.push(ascii(o.address || "---") + "\n");
  }
  if (o.notes) {
    parts.push(CMD_BOLD_ON);
    parts.push("OBS:\n");
    parts.push(CMD_BOLD_OFF);
    parts.push(ascii(o.notes) + "\n");
  }

  parts.push(divider(cols));
  if (items.length === 0) {
    parts.push(CMD_ALIGN_CENTER);
    parts.push("(Sem itens vinculados)\n");
    parts.push(CMD_ALIGN_LEFT);
  } else {
    parts.push(pad("PROD", cols - 20) + pad("QT", 4, "r") + pad("UNIT", 7, "r") + pad("TOTAL", 9, "r") + "\n");
    for (const it of items) {
      parts.push(ascii(it.name).slice(0, cols) + "\n");
      parts.push(
        pad("", cols - 20) +
          pad(String(it.quantity), 4, "r") +
          pad(money(it.unit_price), 7, "r") +
          pad(money(it.quantity * it.unit_price), 9, "r") +
          "\n",
      );
    }
  }

  parts.push(divider(cols));
  const fee = Number(o.delivery_fee ?? 0);
  const total = Number(o.total ?? 0);
  const sub = isDelivery && fee > 0 ? total - fee : total;
  parts.push(row2("SUBTOTAL", "R$ " + money(sub), cols));
  if (isDelivery && fee > 0) parts.push(row2("TAXA ENTREGA", "R$ " + money(fee), cols));
  parts.push(CMD_BOLD_ON);
  parts.push(CMD_DBL_ON);
  parts.push(row2("TOTAL", "R$ " + money(total), cols / 2));
  parts.push(CMD_DBL_OFF);
  parts.push(CMD_BOLD_OFF);

  parts.push("\n");
  parts.push(CMD_ALIGN_CENTER);
  parts.push(ascii(footer || "Obrigado pelo pedido!") + "\n");
  parts.push(CMD_FEED_3);
  parts.push(CMD_CUT);

  await sendBytes(concat(parts));
}

export async function usbPrintTest(cid?: string | null) {
  const cols = 48;
  const parts: Array<Uint8Array | string> = [
    CMD_INIT,
    CMD_ALIGN_CENTER,
    CMD_BOLD_ON,
    CMD_DBL_ON,
    "TESTE DE IMPRESSAO\n",
    CMD_DBL_OFF,
    CMD_BOLD_OFF,
    "AutoPecas ERP - WebUSB\n",
    divider(cols),
    CMD_ALIGN_LEFT,
    `Data/Hora: ${new Date().toLocaleString("pt-BR")}\n`,
    "Status   : OK\n",
    divider(cols),
    CMD_ALIGN_CENTER,
    "Se voce esta lendo isto,\n",
    "a impressao esta funcionando!\n",
    CMD_FEED_3,
    CMD_CUT,
  ];
  await sendBytes(concat(parts), cid);
}
