import { useCallback, useEffect, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { appwrite } from "@/integrations/appwrite/client";

const SESSION_KEY = "pdv_reservation_session_id";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "ssr";
  const existing = sessionStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id: string =
    (crypto as any).randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(SESSION_KEY, id);
  return id;
}

export interface ReservedRow {
  product_id: string;
  reserved: number;
}

/**
 * Reserva temporária de estoque no PDV.
 * - sessionId é único por aba (sessionStorage)
 * - heartbeat a cada 5min renova TTL das reservas dessa sessão
 * - libera reservas ao fechar a aba (best-effort)
 */
export function useStockReservation(companyId: string | undefined) {
  const sessionId = useMemo(() => getOrCreateSessionId(), []);
  const qc = useQueryClient();

  // Estoque reservado consolidado por produto (todos os caixas)
  const reservedQ = useQuery({
    queryKey: ["stock-reserved", companyId],
    queryFn: async (): Promise<ReservedRow[]> => {
      if (!companyId) return [];
      const { data, error } = await (appwrite as any)
        .from("product_reserved_stock")
        .select("product_id, reserved")
        .eq("company_id", companyId);
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") return [];
        throw error;
      }
      return (data as ReservedRow[]) ?? [];
    },
    enabled: !!companyId,
    refetchInterval: 30_000, // mantém UI sincronizada com outros caixas
  });

  // Reservas DESTA sessão (para sabermos quanto descontar do "reservado por outros")
  const mySessionQ = useQuery({
    queryKey: ["stock-reserved-mine", companyId, sessionId],
    queryFn: async (): Promise<ReservedRow[]> => {
      if (!companyId) return [];
      const { data, error } = await (appwrite as any)
        .from("stock_reservations")
        .select("product_id, quantity")
        .eq("company_id", companyId)
        .eq("session_id", sessionId)
        .gt("expires_at", new Date().toISOString());
      if (error) {
        if (error.code === "42P01" || error.code === "PGRST205") return [];
        throw error;
      }
      return ((data as any[]) ?? []).map((r) => ({
        product_id: r.product_id,
        reserved: Number(r.quantity),
      }));
    },
    enabled: !!companyId,
  });

  /** Mapa product_id -> reservado por OUTRAS sessões */
  const reservedByOthersMap = useMemo(() => {
    const all = new Map<string, number>();
    (reservedQ.data ?? []).forEach((r) => all.set(r.product_id, Number(r.reserved)));
    (mySessionQ.data ?? []).forEach((r) => {
      const total = all.get(r.product_id) ?? 0;
      all.set(r.product_id, Math.max(0, total - Number(r.reserved)));
    });
    return all;
  }, [reservedQ.data, mySessionQ.data]);

  const availableFor = useCallback(
    (productId: string, physicalStock: number) => {
      const others = reservedByOthersMap.get(productId) ?? 0;
      return Math.max(0, physicalStock - others);
    },
    [reservedByOthersMap],
  );

  const reserve = useCallback(
    async (productId: string, quantity: number) => {
      if (!companyId) return;
      const { error } = await (appwrite as any).rpc("reserve_stock", {
        _company: companyId,
        _product: productId,
        _session: sessionId,
        _quantity: quantity,
        _ttl_minutes: 15,
      });
      if (error) {
        if (error.code === "PGRST202" || error.message?.includes("schema cache")) return;
        throw new Error(error.message);
      }
      qc.invalidateQueries({ queryKey: ["stock-reserved", companyId] });
      qc.invalidateQueries({ queryKey: ["stock-reserved-mine", companyId, sessionId] });
    },
    [companyId, sessionId, qc],
  );

  const releaseAll = useCallback(async () => {
    if (!companyId) return;
    const { error } = await (appwrite as any).rpc("release_session_reservations", {
      _session: sessionId,
    });
    if (error && error.code !== "PGRST202")
      console.warn("release_session_reservations:", error.message);
    qc.invalidateQueries({ queryKey: ["stock-reserved", companyId] });
    qc.invalidateQueries({ queryKey: ["stock-reserved-mine", companyId, sessionId] });
  }, [companyId, sessionId, qc]);

  // Heartbeat: renova TTL a cada 5min enquanto a aba está viva
  const beatRef = useRef<number | null>(null);
  useEffect(() => {
    if (!companyId) return;
    const beat = async () => {
      const { error } = await (appwrite as any).rpc("touch_reservations", {
        _session: sessionId,
        _ttl_minutes: 15,
      });
      if (error && error.code !== "PGRST202") console.warn("touch_reservations:", error.message);
    };
    beatRef.current = window.setInterval(beat, 5 * 60_000);
    return () => {
      if (beatRef.current) window.clearInterval(beatRef.current);
    };
  }, [companyId, sessionId]);

  // Best-effort cleanup ao fechar a aba (apenas se carrinho estiver vazio é ideal,
  // mas chamamos sempre — o vendedor pode esvaziar o carrinho persistido na próxima sessão)
  useEffect(() => {
    const onUnload = () => {
      try {
        appwrite.rpc("release_session_reservations", { _session: sessionId });
      } catch {}
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [sessionId]);

  return {
    sessionId,
    reservedByOthersMap,
    availableFor,
    reserve,
    releaseAll,
    refetch: () => {
      qc.invalidateQueries({ queryKey: ["stock-reserved", companyId] });
      qc.invalidateQueries({ queryKey: ["stock-reserved-mine", companyId, sessionId] });
    },
  };
}
