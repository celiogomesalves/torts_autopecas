/**
 * Code 128 aceita ASCII 0-127, mas para etiquetas (jsbarcode) e leitura confiável
 * restringimos a A-Z e 0-9 (Code 128 subset B/C amigável a leitores).
 */
const STOCK_CODE_MIN = 1;
const STOCK_CODE_MAX = 100;

export function isValidStockCode(code: string): boolean {
  const c = code.trim();
  return c.length >= STOCK_CODE_MIN && c.length <= STOCK_CODE_MAX;
}

/**
 * Valida e retorna mensagem de erro (ou null se ok). Usado em vendas/cadastro.
 */
export function validateStockCode(code: string): string | null {
  const c = code.trim();
  if (!c) return "Informe o Código Estoque.";
  if (c.length < STOCK_CODE_MIN) return `Código Estoque deve ter pelo menos ${STOCK_CODE_MIN} caracteres.`;
  if (c.length > STOCK_CODE_MAX) return `Código Estoque deve ter no máximo ${STOCK_CODE_MAX} caracteres.`;
  return null;
}

/**
 * Gera um código de estoque único compatível com Code 128
 * (apenas A-Z e 0-9). Recebe a lista de códigos já existentes para evitar colisão.
 */
export function generateStockCode(
  existingCodes: Iterable<string | null | undefined> = [],
  prefix: string = "EST"
): string {
  const existing = new Set<string>();
  for (const c of existingCodes) {
    if (c) existing.add(c.toUpperCase());
  }
  
  const cleanPrefix = prefix.trim().toUpperCase() || "EST";
  
  for (let i = 0; i < 20; i++) {
    const ts = Date.now().toString(36).toUpperCase();
    const rnd = Math.floor(Math.random() * 1679616).toString(36).toUpperCase().padStart(4, "0");
    const code = `${cleanPrefix}${ts}${rnd}`;
    if (!existing.has(code)) return code;
  }
  
  return `${cleanPrefix}${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}
