import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";



export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

export type StepAction = {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "secondary" | "destructive";
};

export type ProgressStep = {
  id: string;
  label: string;
  status: StepStatus;
  /** 0-100. If omitted while running, an animated indeterminate progress is shown. */
  progress?: number;
  detail?: string;
  /** Ações extras exibidas dentro do passo (ex.: "Tentar novamente" quando error). */
  actions?: StepAction[];
};

interface Props {
  open: boolean;
  steps: ProgressStep[];
  title?: string;
  description?: string;
  successMessage?: string;
  errorMessage?: string;
  partialMessage?: string;
  onClose: () => void;
}



/** Estima um progresso animado para etapas "running" sem progresso definido. */
function useFakeProgress(running: boolean) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!running) {
      setV(0);
      return;
    }
    setV(8);
    const id = setInterval(() => {
      setV((cur) => (cur >= 90 ? 90 : cur + Math.max(1, (95 - cur) / 18)));
    }, 350);
    return () => clearInterval(id);
  }, [running]);
  return v;
}

function StepRow({ step }: { step: ProgressStep }) {
  const fake = useFakeProgress(step.status === "running" && step.progress == null);
  const value =
    step.status === "done"
      ? 100
      : step.status === "error" || step.status === "skipped"
      ? 0
      : step.progress != null
      ? step.progress
      : fake;

  const Icon =
    step.status === "done"
      ? CheckCircle2
      : step.status === "error"
      ? XCircle
      : step.status === "running"
      ? Loader2
      : Circle;

  const color =
    step.status === "done"
      ? "text-green-600"
      : step.status === "error"
      ? "text-destructive"
      : step.status === "running"
      ? "text-brand-red"
      : "text-muted-foreground";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${color} ${step.status === "running" ? "animate-spin" : ""}`} />
        <span className={`text-sm font-medium ${step.status === "pending" ? "text-muted-foreground" : ""}`}>
          {step.label}
        </span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">
          {step.status === "skipped" ? "—" : `${Math.round(value)}%`}
        </span>
      </div>
      <Progress value={value} className="h-1.5" />
      {step.detail && (
        <span className={`text-xs ${step.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
          {step.detail}
        </span>
      )}
      {step.status === "error" && step.actions && step.actions.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1">
          {step.actions.map((a, i) => (
            <Button
              key={i}
              size="sm"
              variant={a.variant ?? "outline"}
              onClick={a.onClick}
            >
              {a.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function SaleProgressDialog({
  open,
  steps,
  title = "Processando venda",
  description = "Acompanhe cada etapa do processamento abaixo.",
  successMessage = "Operação concluída com sucesso.",
  errorMessage = "Operação não concluída. Verifique os passos acima.",
  partialMessage = "Operação concluída parcialmente. Verifique os passos acima.",
  onClose,
}: Props) {
  const allFinished =
    steps.length > 0 &&
    steps.every((s) => s.status === "done" || s.status === "error" || s.status === "skipped");
  const hasError = steps.some((s) => s.status === "error");
  const hasSkipped = steps.some((s) => s.status === "skipped");

  // Fecha automaticamente após 1.5s quando todas as etapas terminaram sem erro.
  useEffect(() => {
    if (!open || !allFinished || hasError) return;
    const t = setTimeout(() => onClose(), 1500);
    return () => clearTimeout(t);
  }, [open, allFinished, hasError, onClose]);

  const summaryTone: "success" | "error" | "warning" | null = !allFinished
    ? null
    : hasError
    ? "error"
    : hasSkipped
    ? "warning"
    : "success";
  const summaryText =
    summaryTone === "success"
      ? successMessage
      : summaryTone === "error"
      ? errorMessage
      : summaryTone === "warning"
      ? partialMessage
      : "";
  const summaryClass =
    summaryTone === "success"
      ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
      : summaryTone === "error"
      ? "border-destructive/40 bg-destructive/10 text-destructive"
      : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400";

  return (
    <Dialog open={open} onOpenChange={(o) => (!o && allFinished ? onClose() : undefined)}>
      <DialogContent
        className="sm:max-w-md"
        onInteractOutside={(e) => {
          if (!allFinished) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!allFinished) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 py-2">
          {steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </div>
        {allFinished && summaryTone && (
          <div className={`rounded-md border p-3 text-sm ${summaryClass}`}>{summaryText}</div>
        )}
        {allFinished && (
          <div className="flex justify-end gap-2">
            <Button onClick={onClose} variant={hasError ? "destructive" : "default"}>
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


