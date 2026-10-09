// Integração com QZ Tray (https://qz.io) para impressão direta no cupom 80mm
// usando a impressora térmica configurada localmente no Windows/macOS/Linux.
//
// QZ Tray roda como serviço local em wss://localhost:8181. Em modo "unsigned"
// (sem certificado digital), o próprio QZ exibe um diálogo de autorização
// na primeira conexão de cada origem — o usuário aceita uma vez e pronto.
//
// Configuração da impressora é por dispositivo (localStorage), pois cada
// estação pode ter uma impressora diferente.

// @ts-expect-error sem types oficiais
import qz from "qz-tray";

// Configuração de impressora é por dispositivo E por empresa (multi-tenant):
// cada loja conectada pode usar uma impressora padrão diferente na mesma máquina.
const LS_ENABLED_LEGACY = "qz.enabled";
const LS_PRINTER_LEGACY = "qz.printerName";
const COMPANY_KEY = "ap.currentCompanyId";

function currentCid(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(COMPANY_KEY);
  } catch {
    return null;
  }
}

function keyEnabled(cid?: string | null): string {
  const c = cid ?? currentCid();
  return c ? `qz.enabled.${c}` : LS_ENABLED_LEGACY;
}
function keyPrinter(cid?: string | null): string {
  const c = cid ?? currentCid();
  return c ? `qz.printerName.${c}` : LS_PRINTER_LEGACY;
}

// Migra valores antigos (globais) para a empresa atual na primeira leitura,
// para que usuários existentes não percam a configuração ao atualizar.
function migrateLegacy(cid: string) {
  try {
    const legacyEnabled = localStorage.getItem(LS_ENABLED_LEGACY);
    const legacyPrinter = localStorage.getItem(LS_PRINTER_LEGACY);
    const scopedEnabledKey = `qz.enabled.${cid}`;
    const scopedPrinterKey = `qz.printerName.${cid}`;
    if (legacyEnabled !== null && localStorage.getItem(scopedEnabledKey) === null) {
      localStorage.setItem(scopedEnabledKey, legacyEnabled);
    }
    if (legacyPrinter !== null && localStorage.getItem(scopedPrinterKey) === null) {
      localStorage.setItem(scopedPrinterKey, legacyPrinter);
    }
  } catch {
    /* noop */
  }
}

export function qzEnabled(cid?: string | null): boolean {
  if (typeof window === "undefined") return false;
  const c = cid ?? currentCid();
  if (c) migrateLegacy(c);
  return localStorage.getItem(keyEnabled(c)) === "1";
}
export function setQzEnabled(v: boolean, cid?: string | null) {
  localStorage.setItem(keyEnabled(cid), v ? "1" : "0");
}
export function qzPrinterName(cid?: string | null): string | null {
  if (typeof window === "undefined") return null;
  const c = cid ?? currentCid();
  if (c) migrateLegacy(c);
  return localStorage.getItem(keyPrinter(c));
}
export function setQzPrinterName(name: string | null, cid?: string | null) {
  if (name) localStorage.setItem(keyPrinter(cid), name);
  else localStorage.removeItem(keyPrinter(cid));
}

let configured = false;
type Resolver = (value?: unknown) => void;
type Rejecter = (reason?: unknown) => void;
type QzConnection = { readyState: number; sendData?: (obj: unknown) => void };
type QzWithConnection = { websocket?: { connection?: QzConnection | null } };

// Certificado público — pode ficar no bundle (é público por natureza).
// A chave privada correspondente vive como secret no servidor e é usada
// pela server function `signQzRequest`.
const QZ_CERTIFICATE = `-----BEGIN CERTIFICATE-----
MIIEMzCCAxugAwIBAgIUCMiEc647C+Hy/WjZwNd6epxxrlswDQYJKoZIhvcNAQEL
BQAwgagxCzAJBgNVBAYTAkJSMQswCQYDVQQIDAJTUDERMA8GA1UEBwwIU2FvUGF1
bG8xGTAXBgNVBAoMEFRvcnF1ZSBBdXRvcGVjYXMxCzAJBgNVBAsMAlRJMSQwIgYD
VQQDDBt0b3JxdWVhdXRvcGVjYXMubG92YWJsZS5hcHAxKzApBgkqhkiG9w0BCQEW
HGFkbWluQHRvcnF1ZWF1dG9wZWNhcy5jb20uYnIwHhcNMjYwNzA1MTIwMTUwWhcN
MzYwNzAyMTIwMTUwWjCBqDELMAkGA1UEBhMCQlIxCzAJBgNVBAgMAlNQMREwDwYD
VQQHDAhTYW9QYXVsbzEZMBcGA1UECgwQVG9ycXVlIEF1dG9wZWNhczELMAkGA1UE
CwwCVEkxJDAiBgNVBAMMG3RvcnF1ZWF1dG9wZWNhcy5sb3ZhYmxlLmFwcDErMCkG
CSqGSIb3DQEJARYcYWRtaW5AdG9ycXVlYXV0b3BlY2FzLmNvbS5icjCCASIwDQYJ
KoZIhvcNAQEBBQADggEPADCCAQoCggEBALcaW5W4eLXWHtSUT/5AY2wGiIUcOcuQ
34thMj8nF3qswRdMY00WroUzRKCf7WbPTKcnRUxg3wNwbO113f5Pya8vddJlmf1v
4V2ZCUI+gBIqZ8s35+ddxgl8EpqILY7UdZR8tL0GNQu9fu6UDFfiKULfkJTPVH5P
Rk1VGIQuhZV5w4XXyxWRBXJ0BSf7blmM/3ZxLmpIDgmZhU1tGLO8pg4WS25fjWhQ
CeBw1/d41oOi+zCDngzlROXqLntqWPMJYzrpA4OMHTaf+rrx1Z6tLDLHyh4B7PlO
JjWMsuGFf4C2QaOEWXZ2OODI4GlPuzOi6UMEWRu5fdUXMsNQHvpMFgECAwEAAaNT
MFEwHQYDVR0OBBYEFC3j/3tJ4Lluv+yDhHc9zZ4MAWEoMB8GA1UdIwQYMBaAFC3j
/3tJ4Lluv+yDhHc9zZ4MAWEoMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQEL
BQADggEBAHNQBSUoK1Mqw8Uu6pD9VXbPaJ9SWVtMPz4QGZBmRx0rEcSiIJNitTN9
SKOIEooZCgr2iDe8liq6tae79FyKF72uL4sYXYhEXLlt9kra5RGGOHd59gycdEdN
BOGPRwX99PBUsBCr902bbGuMD2oT7U/rJcaK9Hv+3l8xaB3xHjZP77X6rurwguIi
3PTRE6isgOpsBqs+rD0wz3kEaTtwL+uZghqxW/BZiEw2ssm2bikWM2gTbMf+REyf
kFlUAPfOyT0XVhHP0UfocyzDvdleun3dbf9tOcDaMV9nGXjQWwtZJswUOTCUGoKc
WRGggEPYEJnZt2vAm6yEg15PGmRRLEA=
-----END CERTIFICATE-----`;

function configureUnsigned() {
  if (configured) return;
  configured = true;
  // Sem isto, o qz-tray empacotado via Vite não atribui sendData a tempo
  // (a fila interna usa RSVP que pode não estar disponível em alguns bundles).
  qz.api.setPromiseType(
    (resolver: (resolve: Resolver, reject: Rejecter) => void) => new Promise(resolver),
  );
  // SHA-256 nativo do navegador, para evitar dependência extra (hash.js)
  qz.api.setSha256Type(async (data: string) => {
    const buf = new TextEncoder().encode(data);
    const hash = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  });
  // Modo signed — usa nosso certificado público + assinatura server-side.
  // Isso remove o diálogo de autorização a cada reconexão (basta instalar
  // o certificado no override.crt do QZ Tray de cada máquina, 1x).
  qz.security.setCertificatePromise((resolve: Resolver) => resolve(QZ_CERTIFICATE));
  qz.security.setSignatureAlgorithm("SHA512");
  qz.security.setSignaturePromise((toSign: string) => async (resolve: Resolver, reject: Rejecter) => {
    try {
      const { signQzRequest } = await import("./qz-sign.functions");
      const { signature } = await signQzRequest({ data: { toSign } });
      resolve(signature);
    } catch (e) {
      reject(e);
    }
  });
}

let connectPromise: Promise<void> | null = null;

function qzConnectionReady(): boolean {
  if (!qz.websocket.isActive()) return false;
  const conn = (qz as QzWithConnection).websocket?.connection;
  // Alguns builds do qz-tray expõem `sendData`, outros só o WebSocket cru
  // com `send`. Consideramos pronto assim que o socket estiver OPEN (1).
  if (!conn) return true; // isActive já garante socket aberto
  if (conn.readyState !== undefined && conn.readyState !== 1) return false;
  return true;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilQzReady(timeoutMs = 10_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (qzConnectionReady()) {
      // Faz uma chamada leve para confirmar handshake completo
      try {
        await qz.printers.getDefault();
        return;
      } catch {
        // ainda não pronto — aguarda um pouco
      }
    }
    if (!qz.websocket.isActive() && Date.now() - start > 500) break;
    await wait(100);
  }
  throw new Error(
    "QZ Tray conectou, mas ainda não ficou pronto para receber comandos. Tente novamente.",
  );
}

export async function qzConnect(): Promise<void> {
  configureUnsigned();
  if (qzConnectionReady()) return;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    if (!qz.websocket.isActive()) {
      try {
        // Tenta primeiro WSS (porta 8181) e depois WS (porta 8182) — algumas
        // instalações do QZ Tray só aceitam conexão insegura sem certificado.
        await qz.websocket.connect({ retries: 2, delay: 1 });
      } catch (e1) {
        try {
          await qz.websocket.connect({ retries: 2, delay: 1, usingSecure: false });
        } catch (e2) {
          const msg =
            "Não foi possível conectar ao QZ Tray. Verifique se o aplicativo " +
            "está em execução nesta máquina (ícone na bandeja do sistema) e " +
            "se a porta 8181/8182 não está bloqueada por firewall/antivírus.";
          console.error("[QZ] connect failed", { e1, e2 });
          throw new Error(msg);
        }
      }
    }
    await waitUntilQzReady();
  })().finally(() => {
    connectPromise = null;
  });

  return connectPromise;
}

export async function qzDisconnect(): Promise<void> {
  if (qz.websocket.isActive()) {
    try {
      await qz.websocket.disconnect();
    } catch {
      /* noop */
    }
  }
}

export async function qzListPrinters(): Promise<string[]> {
  await qzConnect();
  const list = await qz.printers.find();
  return Array.isArray(list) ? (list as string[]) : [list as string];
}

export async function qzFindDefaultPrinter(): Promise<string | null> {
  try {
    await qzConnect();
    const d = await qz.printers.getDefault();
    return d || null;
  } catch {
    return null;
  }
}

export async function qzPrintPdfBase64(pdfBase64: string, printerName?: string): Promise<void> {
  await qzConnect();
  const printer = printerName || qzPrinterName() || (await qzFindDefaultPrinter());
  if (!printer) throw new Error("Nenhuma impressora selecionada no QZ Tray");
  const config = qz.configs.create(printer, {
    scaleContent: true,
    rasterize: true,
  });
  await qz.print(config, [
    {
      type: "pixel",
      format: "pdf",
      flavor: "base64",
      data: pdfBase64,
    },
  ]);
}

export interface QzReceiptOptions {
  /** Largura do cupom em px (mesma usada na pré-visualização). 280 ≈ 80mm. */
  widthPx?: string | number;
  /** Largura do papel em mm. Se omitido, é derivada de widthPx (px * 80/280). */
  widthMm?: string | number;
  /** Densidade de impressão (DPI). Padrão 203 (térmicas 80mm comuns). */
  density?: number;
  printerName?: string;
}

// Mantém compat com chamadas antigas (string = printerName).
export async function qzPrintHtml80mm(
  html: string,
  printerOrOpts?: string | QzReceiptOptions,
): Promise<void> {
  const opts: QzReceiptOptions =
    typeof printerOrOpts === "string" ? { printerName: printerOrOpts } : printerOrOpts || {};

  await qzConnect();
  const printer =
    opts.printerName || qzPrinterName() || (await qzFindDefaultPrinter());
  if (!printer) throw new Error("Nenhuma impressora selecionada no QZ Tray");

  // Converte px → mm usando a referência 280px = 80mm (mantém a mesma
  // proporção do preview do navegador, evitando divergências visuais).
  const px = Number(opts.widthPx ?? 280) || 280;
  const widthMm = Number(opts.widthMm ?? (px * 80) / 280) || 80;

  const config = qz.configs.create(printer, {
    units: "mm",
    size: { width: widthMm },
    margins: 0,
    scaleContent: true,
    rasterize: true,
    density: opts.density ?? 203,
  });
  await qz.print(config, [{ type: "pixel", format: "html", flavor: "plain", data: html }]);
}

// Imprime um cupom de teste (ESC/POS raw) — útil para validar a impressora
// térmica 80mm sem precisar emitir uma NFC-e real.
export async function qzPrintTestReceipt(printerName?: string): Promise<void> {
  await qzConnect();
  const printer = printerName || qzPrinterName() || (await qzFindDefaultPrinter());
  if (!printer) throw new Error("Nenhuma impressora selecionada no QZ Tray");
  const config = qz.configs.create(printer, { encoding: "CP860" });
  const ESC = "\x1B";
  const GS = "\x1D";
  const now = new Date().toLocaleString("pt-BR");
  const lines = [
    ESC + "@", // init
    ESC + "a" + "\x01", // center
    ESC + "!" + "\x30", // double size
    "TESTE DE IMPRESSAO\n",
    ESC + "!" + "\x00",
    "AutoPecas ERP - QZ Tray\n",
    "--------------------------------\n",
    ESC + "a" + "\x00", // left
    `Impressora: ${printer}\n`,
    `Data/Hora : ${now}\n`,
    "Largura   : 80mm (cupom)\n",
    "Status    : OK\n",
    "--------------------------------\n",
    ESC + "a" + "\x01",
    "Se voce esta lendo isto,\n",
    "a impressao esta funcionando!\n\n\n",
    GS + "V" + "\x01", // partial cut
  ];
  await qz.print(config, [{ type: "raw", format: "plain", data: lines.join("") }]);
}

// Auto-reconexão: tenta conectar no boot do app (se habilitado) e re-conecta
// quando o WebSocket cair. Idempotente — pode ser chamado várias vezes.
let bootstrapped = false;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReconnect(attempt = 1) {
  if (reconnectTimer) return;
  const delay = Math.min(30_000, 2_000 * attempt);
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (!qzEnabled()) return;
    try {
      await qzConnect();
      // sucesso — listeners abaixo vão re-armar em desconexões futuras
    } catch {
      scheduleReconnect(Math.min(attempt + 1, 10));
    }
  }, delay);
}

export function qzBootstrapAutoReconnect() {
  if (bootstrapped || typeof window === "undefined") return;
  bootstrapped = true;
  configureUnsigned();
  try {
    qz.websocket.setClosedCallbacks(() => {
      if (qzEnabled()) scheduleReconnect(1);
    });
    qz.websocket.setErrorCallbacks(() => {
      if (qzEnabled() && !qz.websocket.isActive()) scheduleReconnect(1);
    });
  } catch {
    /* noop */
  }
  if (qzEnabled()) {
    qzConnect().catch(() => scheduleReconnect(1));
  }
  // re-tenta quando a aba volta ao foco
  window.addEventListener("online", () => {
    if (qzEnabled() && !qz.websocket.isActive()) scheduleReconnect(1);
  });
  window.addEventListener("visibilitychange", () => {
    if (!document.hidden && qzEnabled() && !qz.websocket.isActive()) {
      scheduleReconnect(1);
    }
  });
}
