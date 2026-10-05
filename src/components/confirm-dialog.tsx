import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "destructive" usa o estilo do botão de exclusão (vermelho da marca). */
  variant?: "default" | "destructive";
}

type ConfirmFn = (options?: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

interface PendingState extends Required<Omit<ConfirmOptions, "variant">> {
  variant: "default" | "destructive";
  resolve: (value: boolean) => void;
}

const DEFAULTS: Required<Omit<ConfirmOptions, "variant">> & { variant: "default" | "destructive" } =
  {
    title: "Tem certeza?",
    description: "Esta ação não pode ser desfeita.",
    confirmLabel: "Confirmar",
    cancelLabel: "Cancelar",
    variant: "destructive",
  };

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Garante que o resolve só aconteça uma vez por chamada (mesmo com cliques rápidos).
  const settledRef = useRef(false);

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      settledRef.current = false;
      setSubmitting(false);
      setPending({ ...DEFAULTS, ...options, resolve });
    });
  }, []);

  const close = (value: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    pending?.resolve(value);
    setPending(null);
    setSubmitting(false);
  };

  const handleConfirm = () => {
    if (submitting || settledRef.current) return;
    setSubmitting(true);
    close(true);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={!!pending}
        onOpenChange={(o) => {
          if (!o && !submitting) close(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting} onClick={() => close(false)}>
              {pending?.cancelLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={submitting}
              className={cn(
                pending?.variant === "destructive" && "bg-brand-red hover:bg-brand-red/90",
                submitting && "opacity-70 pointer-events-none",
              )}
              onClick={(e) => {
                e.preventDefault();
                handleConfirm();
              }}
            >
              {submitting ? "Processando..." : pending?.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm deve ser usado dentro de <ConfirmDialogProvider />");
  return ctx;
}
