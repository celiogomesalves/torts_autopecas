export const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Formata número como "0.000,00" (sem símbolo de moeda).
export const brlNumber = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Converte string digitada (apenas dígitos contam) em número com 2 casas.
// Ex.: "12345" -> 123.45 ; "1.234,56" -> 1234.56
export const parseCurrencyInput = (raw: string): number => {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return 0;
  return Number(digits) / 100;
};

// Formata enquanto o usuário digita: aceita qualquer entrada e devolve "0.000,00".
export const formatCurrencyInput = (raw: string): string => brlNumber(parseCurrencyInput(raw));

export const dt = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
