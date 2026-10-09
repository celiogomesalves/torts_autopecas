/**
 * Corpo do e-mail enviado à contabilidade (usado pelo endpoint e pelo webhook).
 */

const fmtBr = (iso: string) => {
  const [y, m, d] = String(iso).split("-");
  return d ? `${d}/${m}/${y}` : String(iso);
};

// Saudação conforme o horário de Brasília (manhã / tarde / noite).
export function greetingByTime(date: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(date),
  );
  if (hour < 12) return "bom dia";
  if (hour < 18) return "boa tarde";
  return "boa noite";
}

export interface AccountingEmailParams {
  recipientName: string;
  from: string;
  to: string;
  companyName: string;
  senderName?: string;
  includePdf: boolean;
}

function render({
  recipientName,
  from,
  to,
  companyName,
  senderName,
  includePdf,
  bold,
}: AccountingEmailParams & { bold: (s: string) => string }): string {
  const dest = recipientName?.trim() || "responsável";
  const sender = (senderName ?? companyName)?.trim() || companyName;
  const periodo = `${fmtBr(from)} à ${fmtBr(to)}`;

  const anexos = includePdf
    ? "os arquivos XML's das emissões de notas fiscais e o resumo das vendas"
    : "os arquivos XML's das emissões de notas fiscais";

  return `Olá ${bold(dest)}, ${greetingByTime()}!

Segue em anexo ${anexos} referente ao período de ${periodo} da ${bold(companyName)}.

Peço a gentileza de validá-los e qualquer detalhe nos retorne.

Atenciosamente,

${bold(sender)}.`;
}

export function buildAccountingEmailBody(params: AccountingEmailParams): string {
  return render({ ...params, bold: (s) => s });
}

/** Versão HTML (parágrafos em <br>) com destaques em negrito. */
export function buildAccountingEmailBodyHtml(params: AccountingEmailParams): string {
  const escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const marker = "\u0000";
  const text = render({
    ...params,
    bold: (s) => `${marker}${s}${marker}`,
  });
  const parts = escape(text).split(marker);
  const html = parts
    .map((p, i) => (i % 2 === 1 ? `<strong>${p}</strong>` : p))
    .join("");
  return html.replace(/\n/g, "<br>");
}

export function buildAccountingEmailSubject(
  companyName: string,
  from: string,
  to: string,
): string {
  return `Documentos fiscais ${fmtBr(from)} a ${fmtBr(to)} — ${companyName}`;
}

