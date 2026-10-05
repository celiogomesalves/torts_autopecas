import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { appwrite as supabase } from "@/integrations/appwrite/client";

const STORAGE_PREFIX = "ap.valuesHidden.";

/**
 * Controla a visibilidade de valores monetários por módulo.
 * - Apenas usuários com permissão `edit` no módulo podem alternar (ver/ocultar).
 * - Usuários sem permissão sempre veem mascarado (••••).
 * - Preferência (mostrar/ocultar) persistida por usuário+empresa+módulo no localStorage.
 */
export function useValueVisibility(module: string) {
  const { user, currentCompanyId } = useAuth();
  const cid = currentCompanyId;
  const storageKey = user && cid ? `${STORAGE_PREFIX}${user.id}.${cid}.${module}` : null;

  const permQ = useQuery({
    queryKey: ["has_permission", cid, module, "edit", user?.id],
    queryFn: async () => {
      if (!cid) return false;
      const { data, error } = await supabase.rpc("has_permission", {
        _company: cid,
        _module: module,
        _action: "edit",
      });
      if (error) return false;
      return Boolean(data);
    },
    enabled: !!cid && !!user,
    staleTime: 60_000,
  });

  const canToggle = permQ.data ?? false;

  // hidden = true por padrão (ocultar valores)
  const [hidden, setHidden] = useState<boolean>(true);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const saved = localStorage.getItem(storageKey);
      // Padrão: ocultar (true), a menos que haja uma preferência salva de mostrar (0)
      if (saved === "0") setHidden(false);
      else if (saved === "1") setHidden(true);
      else setHidden(true);
    } catch {
      setHidden(true);
    }
  }, [storageKey]);

  // Quem não pode revelar fica sempre oculto
  const effectiveHidden = !canToggle ? true : hidden;

  const toggle = () => {
    if (!canToggle) return;
    const next = !effectiveHidden;
    setHidden(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore */
      }
    }
  };

  const mask = (value: ReactNode) =>
    effectiveHidden ? <span className="tracking-widest">••••</span> : value;

  /** Para usar em inputs: retorna "••••" quando oculto, senão o valor original. */
  const maskInputValue = (value: string) => (effectiveHidden ? "••••" : value);

  return { hidden: effectiveHidden, canToggle, toggle, mask, maskInputValue };
}

/** Botão padrão do "olho" para alternar visibilidade. */
export function ValueVisibilityToggle({
  hidden,
  canToggle,
  onToggle,
  className,
}: {
  hidden: boolean;
  canToggle: boolean;
  onToggle: () => void;
  className?: string;
}) {
  if (!canToggle) return null;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onToggle}
      className={className}
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
    >
      {hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      <span className="ml-2 hidden sm:inline">
        {hidden ? "Mostrar valores" : "Ocultar valores"}
      </span>
    </Button>
  );
}
