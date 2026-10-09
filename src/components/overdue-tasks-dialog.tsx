import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { AlertTriangle, CalendarClock, Check, X } from "lucide-react";

type OverdueTask = {
  id: string;
  title: string;
  description: string | null;
  due_at: string;
  status: string;
};

export function useOverdueTasks(companyId?: string | null, userId?: string | null) {
  return useQuery({
    queryKey: ["overdue-tasks", companyId, userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_tasks" as any)
        .select("id, title, description, due_at, status")
        .eq("company_id", companyId!)
        .eq("user_id", userId!)
        .eq("status", "pending")
        .lt("due_at", new Date().toISOString())
        .order("due_at", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as OverdueTask[];
    },
    enabled: !!companyId && !!userId,
    staleTime: 30_000,
  });
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string | null;
  userId?: string | null;
  continueLabel?: string;
  onContinue?: () => void;
}

export function OverdueTasksDialog({
  open,
  onOpenChange,
  companyId,
  userId,
  continueLabel = "Fechar",
  onContinue,
}: Props) {
  const queryClient = useQueryClient();
  const tasksQ = useOverdueTasks(companyId, userId);
  const [busyId, setBusyId] = useState<string | null>(null);

  const tasks = tasksQ.data ?? [];

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["overdue-tasks", companyId, userId] });
    void queryClient.invalidateQueries({ queryKey: ["pending-tasks-count", companyId, userId] });
    void queryClient.invalidateQueries({ queryKey: ["user-tasks"] });
  };

  const mutate = async (id: string, patch: Record<string, unknown>, msg: string) => {
    setBusyId(id);
    try {
      const { error } = await supabase
        .from("user_tasks" as any)
        .update(patch as any)
        .eq("id", id);
      if (error) throw error;
      toast.success(msg);
      refresh();
      await tasksQ.refetch();
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível atualizar a tarefa.");
    } finally {
      setBusyId(null);
    }
  };

  const postponeToTomorrow = (task: OverdueTask) => {
    const base = new Date(task.due_at);
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(base.getHours(), base.getMinutes(), 0, 0);
    return mutate(task.id, { due_at: next.toISOString() }, "Compromisso reagendado para amanhã.");
  };

  const handleContinue = () => {
    onOpenChange(false);
    onContinue?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-brand-red" />
            Tarefas atrasadas
          </DialogTitle>
          <DialogDescription>
            Você tem {tasks.length} compromisso(s) vencido(s) e não finalizado(s). Conclua, reagende,
            cancele ou mantenha ativo para depois.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[45vh] pr-2">
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="rounded-lg border border-brand-red/30 bg-brand-red/5 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{task.title}</p>
                    {task.description && (
                      <p className="truncate text-xs text-muted-foreground">{task.description}</p>
                    )}
                  </div>
                  <Badge variant="destructive" className="shrink-0">
                    {new Date(task.due_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    disabled={busyId === task.id}
                    title="Marcar como concluído"
                    onClick={() => mutate(task.id, { status: "completed" }, "Tarefa concluída.")}
                  >
                    <Check className="mr-1 size-4" /> Concluir
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busyId === task.id}
                    title="Adiar por 1 dia"
                    onClick={() => postponeToTomorrow(task)}
                  >
                    <CalendarClock className="mr-1 size-4" /> Adiar 1 dia
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={busyId === task.id}
                    title="Cancelar tarefa"
                    onClick={() => mutate(task.id, { status: "cancelled" }, "Tarefa cancelada.")}
                  >
                    <X className="mr-1 size-4" /> Cancelar
                  </Button>
                </div>
              </div>
            ))}
            {tasks.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma tarefa atrasada. Tudo em dia!
              </p>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={handleContinue}>
            {continueLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
