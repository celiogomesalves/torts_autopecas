// Utilitário de impressão genérico para listas/relatórios

export type PrintColumn<T> = {
  header: string;
  accessor: (row: T) => string | number | null | undefined;
  align?: "left" | "right" | "center";
  width?: string; // ex: "20%"
};

export type PrintListOptions<T> = {
  title: string;
  subtitle?: string;
  columns: PrintColumn<T>[];
  rows: T[];
  /** Linhas extras de resumo no rodapé (label/valor) */
  summary?: { label: string; value: string }[];
  /** Texto à direita do cabeçalho (ex: nome da empresa) */
  companyName?: string;
};

function escapeHtml(s: unknown): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function printList<T>(opts: PrintListOptions<T>) {
  const { title, subtitle, columns, rows, summary, companyName } = opts;
  const now = new Date().toLocaleString("pt-BR");

  const thead = columns
    .map(
      (c) =>
        `<th style="text-align:${c.align ?? "left"};${c.width ? `width:${c.width};` : ""}">${escapeHtml(c.header)}</th>`,
    )
    .join("");

  const tbody = rows
    .map((row) => {
      const tds = columns
        .map(
          (c) => `<td style="text-align:${c.align ?? "left"};">${escapeHtml(c.accessor(row))}</td>`,
        )
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  const summaryHtml =
    summary && summary.length
      ? `<div class="summary">${summary
          .map(
            (s) =>
              `<div class="summary-row"><span>${escapeHtml(s.label)}</span><strong>${escapeHtml(s.value)}</strong></div>`,
          )
          .join("")}</div>`
      : "";

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #111; padding: 16mm; font-size: 11pt; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 12px; }
  header h1 { margin: 0; font-size: 16pt; }
  header .subtitle { font-size: 10pt; color: #555; margin-top: 2px; }
  header .meta { font-size: 9pt; color: #555; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #ddd; font-size: 10pt; vertical-align: top; }
  th { background: #f3f4f6; text-transform: uppercase; font-size: 9pt; letter-spacing: 0.04em; }
  tr:nth-child(even) td { background: #fafafa; }
  .summary { margin-top: 16px; border-top: 2px solid #111; padding-top: 8px; display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
  .summary-row { display: flex; gap: 16px; font-size: 10pt; }
  .summary-row strong { min-width: 120px; text-align: right; }
  .empty { text-align: center; padding: 24px; color: #888; font-style: italic; }
  footer { margin-top: 24px; text-align: center; font-size: 8pt; color: #888; }
  @media print {
    body { padding: 10mm; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<div class="subtitle">${escapeHtml(subtitle)}</div>` : ""}
    </div>
    <div class="meta">
      ${companyName ? `<div><strong>${escapeHtml(companyName)}</strong></div>` : ""}
      <div>Emitido em ${escapeHtml(now)}</div>
      <div>${rows.length} registro(s)</div>
    </div>
  </header>
  ${
    rows.length === 0
      ? `<div class="empty">Nenhum registro para imprimir.</div>`
      : `<table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`
  }
  ${summaryHtml}
  <footer>Documento gerado pelo sistema</footer>
  <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 100); };</script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) {
    alert("Permita pop-ups para imprimir.");
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
