// Estilo padrão para todos os cupons (vendas, fechamento, movimentações,
// orçamentos). Mantém fonte, peso e espaçamento consistentes em qualquer
// navegador/impressora.
//
// Parâmetros ajustáveis por impressora (definidos em Configurações →
// Impressão), persistidos em localStorage `print_settings_${cid}`:
//
// - widthPx       Largura do cupom em px (280≈80mm, 200≈58mm)
// - fontSizePx    Tamanho da fonte base — controla densidade visual
// - lineHeight    Espaço entre linhas (LPI ~ 1/lineHeight)
// - boldStrength  Intensidade do negrito reforçado via text-shadow
//                 (0 = sem reforço, 0.3 = leve, 0.6 = pesado p/ térmicas claras)

export interface ReceiptStyleOptions {
  widthPx?: string | number;
  fontSizePx?: string | number;
  lineHeight?: string | number;
  boldStrength?: string | number;
}

export function receiptStyle(
  widthOrOpts: ReceiptStyleOptions | string | number = 280,
  legacyOpts: Omit<ReceiptStyleOptions, "widthPx"> = {},
): string {
  const opts: ReceiptStyleOptions =
    typeof widthOrOpts === "object" ? widthOrOpts : { widthPx: widthOrOpts, ...legacyOpts };

  const w = String(opts.widthPx ?? 280);
  const fs = Number(opts.fontSizePx ?? 12);
  const lh = Number(opts.lineHeight ?? 1.35);
  const bs = Number(opts.boldStrength ?? 0.4);

  const shadow =
    bs > 0 ? `text-shadow: ${bs}px 0 0 currentColor, -${bs}px 0 0 currentColor;` : "";

  // Tamanhos relativos para títulos/labels/itens
  const fsBig = Math.max(fs + 4, 14);
  const fsH = Math.max(fs + 3, 13);
  const fsSmall = Math.max(fs - 1, 9);

  return `
    @page { margin: 0; }
    * { box-sizing: border-box; }
    html, body { background: #fff; }
    body {
      font-family: 'Courier New', 'Consolas', 'Lucida Console', Courier, monospace;
      font-size: ${fs}px;
      line-height: ${lh};
      letter-spacing: 0;
      padding: 12px;
      width: ${w}px;
      margin: 0 auto;
      color: #000;
      font-weight: 900;
      ${shadow}
      -webkit-font-smoothing: none;
      -moz-osx-font-smoothing: grayscale;
      text-rendering: geometricPrecision;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1, h2, h3 {
      text-align: center;
      margin: 0 0 6px 0;
      font-size: ${fsH}px;
      text-transform: uppercase;
      font-weight: 900;
      letter-spacing: 0.5px;
    }
    .header-text { text-align: center; margin-bottom: 2px; font-weight: 900; }
    .company-sub { text-align: center; font-size: ${fsSmall + 1}px; margin-bottom: 1px; font-weight: 900; }
    .divider { border: 0; border-bottom: 2px dashed #000; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; margin-bottom: 3px; gap: 8px; }
    .bold { font-weight: 900; }
    .center { text-align: center; }
    .right { text-align: right; }
    .mt { margin-top: 10px; }
    .big { font-size: ${fsBig}px; font-weight: 900; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { text-align: left; border-bottom: 2px solid #000; font-size: ${fsSmall + 1}px; font-weight: 900; padding: 2px 0; }
    td { font-size: ${fsSmall + 1}px; padding: 3px 0; font-weight: 900; vertical-align: top; }
    .footer { margin-top: 18px; text-align: center; font-size: ${fsSmall + 1}px; font-weight: 900; }
    .signature { margin-top: 36px; border-top: 2px solid #000; width: 80%; margin-left: auto; margin-right: auto; }
    .review { margin-top: 14px; padding-top: 8px; border-top: 2px dashed #000; text-align: center; }
    .review-text { font-size: ${fs}px; font-weight: 900; margin-bottom: 2px; }
    .review-sub { font-size: ${fsSmall + 1}px; margin-bottom: 4px; font-weight: 900; }
    .review-qr { width: 110px; height: 110px; display: block; margin: 0 auto; }
  `;
}
