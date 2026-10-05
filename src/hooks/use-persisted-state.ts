import { useCallback, useEffect, useState } from "react";

type Storage = "session" | "local";

/**
 * Estado persistido em sessionStorage (padrão) ou localStorage.
 * Útil para guardar a aba ativa, índice de carrossel, filtro selecionado etc.
 *
 * - session (padrão): some ao fechar a aba do navegador
 * - local: persiste entre sessões
 *
 * A chave deve ser estável e única por contexto (ex: prefixe com a página
 * e/ou companyId quando o estado for por empresa).
 */
export function usePersistedState<T>(
  key: string,
  initialValue: T,
  storage: Storage = "session",
): [T, (value: T | ((prev: T) => T)) => void] {
  const getStore = useCallback(() => {
    if (typeof window === "undefined") return null;
    return storage === "local" ? window.localStorage : window.sessionStorage;
  }, [storage]);

  const [state, setState] = useState<T>(() => {
    try {
      const store = getStore();
      if (!store) return initialValue;
      const raw = store.getItem(key);
      if (raw === null) return initialValue;
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      const store = getStore();
      if (!store) return;
      store.setItem(key, JSON.stringify(state));
    } catch {
      // ignora QuotaExceeded ou storage indisponível
    }
  }, [key, state, getStore]);

  return [state, setState];
}
