import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normaliza string para busca: remove acentos, pontuação leve (apóstrofos,
 * aspas, hífens), colapsa espaços e converte para minúsculo.
 * Ex: "Bomba d' água  UB 147" -> "bomba dagua ub 147"
 *     "Bomba d'água UB 147"   -> "bomba dagua ub 147"
 */
export function normalize(str: string | null | undefined): string {
  if (!str) return "";
  return (
    str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      // Remove apóstrofos e aspas (retas e curvas) sem deixar espaço
      .replace(/['’‘`´"”“]/g, "")
      // Substitui demais pontuações/símbolos por espaço
      .replace(/[.,;:!?\-_/\\()\[\]{}]/g, " ")
      // Colapsa múltiplos espaços
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * Verifica se `text` contém `query` ignorando acentos e maiúsculas/minúsculas.
 * Suporta combinação de palavras: todas as palavras da query devem aparecer no texto,
 * em qualquer ordem. Ex: matchSearch("BOSCH FREIOS", "freios bosch") => true
 */
export function matchSearch(text: string | null | undefined, query: string): boolean {
  const normalizedText = normalize(text);
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return true;
  const words = normalizedQuery.split(" ").filter(Boolean);
  return words.every((w) => normalizedText.includes(w));
}

/**
 * Detecta erro de duplicidade (constraint UNIQUE) em qualquer fonte:
 * Postgres (23505), Supabase, mensagens textuais comuns.
 */
export function isDuplicateError(error: unknown): boolean {
  if (!error) return false;
  const e = error as any;
  if (e.code === "23505" || e.code === 23505) return true;
  const msg = String(e.message || e.error_description || e).toLowerCase();
  return (
    msg.includes("duplicate key") ||
    msg.includes("already exists") ||
    msg.includes("unique constraint") ||
    msg.includes("violates unique") ||
    msg.includes("já cadastrad") ||
    msg.includes("já existe")
  );
}

/**
 * Mensagem padronizada de duplicidade exibida ao usuário.
 * Ex: duplicateMessage("marca") => "Duplicidade encontrada: esta marca já está cadastrada."
 */
export function duplicateMessage(entity: string): string {
  return `Duplicidade encontrada: este(a) ${entity} já está cadastrado(a).`;
}

/**
 * Comparador alfabético padrão para nomes de produto/entidade em todo o sistema.
 * - Trata null/undefined como string vazia
 * - Aplica .trim() para ignorar espaços invisíveis
 * - Usa pt-BR com numeric:true e sensitivity:base (ignora acentos/caixa, ordena números)
 */
export function compareProductNames(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return (a ?? "").trim().localeCompare((b ?? "").trim(), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}
