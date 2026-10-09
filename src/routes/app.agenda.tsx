import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchUserTasks, createUserTask, updateUserTask, deleteUserTask, isSuperAdmin, isAdmin, fetchTeam } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format, startOfDay, endOfDay, isPast, isToday, addDays, parseISO, addWeeks, addMonths, isBefore } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus, Calendar as CalendarIcon, Clock, CheckCircle2, Circle, AlertCircle, Trash2, ChevronLeft, ChevronRight, Filter, RefreshCw, Search, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-dialog";

export const Route = createFileRoute("/app/agenda")({
  component: AgendaPage,
});

function AgendaPage() {
  const { user, currentCompanyId } = useAuth();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterUser, setFilterUser] = useState<string>(user?.id || "all");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const superAdminQ = useQuery({ queryKey: ["is-super-admin"], queryFn: isSuperAdmin });
  const adminQ = useQuery({ 
    queryKey: ["is-admin", currentCompanyId], 
    queryFn: () => isAdmin(currentCompanyId!),
    enabled: !!currentCompanyId 
  });
  
  const isManager = !!adminQ.data || !!superAdminQ.data;

  const { data: team = [] } = useQuery({
    queryKey: ["team", currentCompanyId],
    queryFn: () => fetchTeam(currentCompanyId!),
    enabled: !!currentCompanyId && isManager,
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["user-tasks", currentCompanyId, filterUser],
    queryFn: () => fetchUserTasks(currentCompanyId!, filterUser === "all" ? null : filterUser),
    enabled: !!currentCompanyId && !!user,
  });

  const createMutation = useMutation({
    mutationFn: createUserTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-tasks"] });
      toast.success("Compromisso criado!");
      setIsModalOpen(false);
      setEditingTask(null);
    },
    onError: (error: any) => {
      console.error("Mutation error:", error);
      toast.error(`Erro ao criar compromisso: ${error.message || "Erro desconhecido"}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, task }: { id: string; task: any }) => updateUserTask(id, task),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-tasks"] });
      toast.success("Compromisso atualizado!");
      setIsModalOpen(false);
      setEditingTask(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUserTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["user-tasks"] });
      toast.success("Compromisso removido");
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const dateStr = formData.get("date") as string;
    const timeStr = formData.get("time") as string;
    
    const dueAtDate = new Date(`${dateStr}T${timeStr}:00`);
    const dueAt = dueAtDate.toISOString();
    
    const reminderMinutes = parseInt(formData.get("reminder_minutes") as string || "10");
    const reminderAt = reminderMinutes > 0 
      ? new Date(dueAtDate.getTime() - reminderMinutes * 60000).toISOString()
      : null;

    const recurrenceType = formData.get("recurrence_type") as any || "none";
    const recurrenceEndAt = formData.get("recurrence_end_at") 
      ? new Date(formData.get("recurrence_end_at") as string + "T23:59:59").toISOString()
      : null;

    const taskUserId = isManager && formData.get("assigned_user_id") 
      ? (formData.get("assigned_user_id") as string)
      : user!.id;

    const baseTask: any = {
      company_id: currentCompanyId!,
      user_id: taskUserId,
      title: formData.get("title") as string,
      description: (formData.get("description") as string) || null,
      due_at: dueAt,
      reminder_at: reminderAt,
      status: editingTask?.status || "pending",
    };

    if (recurrenceType && recurrenceType !== "none") {
      baseTask.recurrence_type = recurrenceType;
      if (recurrenceEndAt) baseTask.recurrence_end_at = recurrenceEndAt;
    }

    if (editingTask) {
      updateMutation.mutate({ id: editingTask.id, task: baseTask });
    } else if (recurrenceType !== "none") {
      const tasksToCreate: any[] = [];
      let nextDue = dueAtDate;
      const limitDate = recurrenceEndAt
        ? parseISO(recurrenceEndAt)
        : addMonths(dueAtDate, 12);

      while (true) {
        const nextReminder =
          reminderMinutes > 0
            ? new Date(nextDue.getTime() - reminderMinutes * 60000).toISOString()
            : null;

        tasksToCreate.push({
          ...baseTask,
          due_at: nextDue.toISOString(),
          reminder_at: nextReminder,
        });

        if (recurrenceType === "daily") nextDue = addDays(nextDue, 1);
        else if (recurrenceType === "weekly") nextDue = addWeeks(nextDue, 1);
        else if (recurrenceType === "monthly") nextDue = addMonths(nextDue, 1);

        if (isBefore(limitDate, nextDue)) break;
        if (tasksToCreate.length >= 100) break;
      }
      createMutation.mutate(tasksToCreate);
    } else {
      createMutation.mutate(baseTask);
    }

  };

  const filteredTasks = [...tasks]
    .filter(t => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          t.title?.toLowerCase().includes(q) || 
          t.description?.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const dateA = parseISO(a.due_at).getTime();
      const dateB = parseISO(b.due_at).getTime();
      return sortOrder === "asc" ? dateA - dateB : dateB - dateA;
    });

  const tasksByDay = filteredTasks.filter(t => {
    const d = parseISO(t.due_at);
    return format(d, "yyyy-MM-dd") === format(selectedDate, "yyyy-MM-dd");
  });

  const statusMap: any = {
    pending: { label: "Pendente", color: "bg-brand-orange/10 text-brand-orange border-brand-orange/20", icon: Circle },
    completed: { label: "Concluído", color: "bg-green-500/10 text-green-500 border-green-500/20", icon: CheckCircle2 },
    cancelled: { label: "Cancelado", color: "bg-muted text-muted-foreground border-border", icon: AlertCircle },
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground">Gerencie seus compromissos e tarefas.</p>
        </div>
        <Dialog open={isModalOpen} onOpenChange={(open) => {
          setIsModalOpen(open);
          if (!open) setEditingTask(null);
        }}>
          <DialogTrigger asChild>
            <Button className="bg-brand-red hover:bg-brand-red/90 shadow-lg shadow-brand-red/20">
              <Plus className="mr-2 size-4" /> Novo Compromisso
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <form onSubmit={handleSubmit}>
              <DialogHeader>
                <DialogTitle>{editingTask?.id ? "Editar Compromisso" : "Novo Compromisso"}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                {isManager && (
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Responsável</label>
                    <Select name="assigned_user_id" defaultValue={editingTask?.user_id || user?.id}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o responsável" />
                      </SelectTrigger>
                      <SelectContent>
                        {team.map((m: any) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.profile?.name || m.profile?.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Título</label>
                  <Input name="title" required defaultValue={editingTask?.title} placeholder="Ex: Reunião com fornecedor" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Data</label>
                    <Input name="date" type="date" required defaultValue={editingTask ? format(parseISO(editingTask.due_at), "yyyy-MM-dd") : format(selectedDate, "yyyy-MM-dd")} />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Horário</label>
                    <Input name="time" type="time" required defaultValue={editingTask ? format(parseISO(editingTask.due_at), "HH:mm") : format(new Date(), "HH:mm")} />
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Antecedência do Lembrete</label>
                  <Select name="reminder_minutes" defaultValue={editingTask?.reminder_at ? 
                    String(Math.round((parseISO(editingTask.due_at).getTime() - parseISO(editingTask.reminder_at).getTime()) / 60000)) 
                    : "10"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tempo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Sem lembrete</SelectItem>
                      <SelectItem value="5">5 minutos antes</SelectItem>
                      <SelectItem value="10">10 minutos antes</SelectItem>
                      <SelectItem value="30">30 minutos antes</SelectItem>
                      <SelectItem value="60">1 hora antes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Recorrência</label>
                    <Select name="recurrence_type" defaultValue={editingTask?.recurrence_type || "none"}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Não repete</SelectItem>
                        <SelectItem value="daily">Diária</SelectItem>
                        <SelectItem value="weekly">Semanal</SelectItem>
                        <SelectItem value="monthly">Mensal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium">Repetir até</label>
                    <Input 
                      name="recurrence_end_at" 
                      type="date" 
                      defaultValue={editingTask?.recurrence_end_at ? format(parseISO(editingTask.recurrence_end_at), "yyyy-MM-dd") : ""} 
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Descrição (opcional)</label>
                  <Textarea name="description" defaultValue={editingTask?.description} placeholder="Detalhes do compromisso..." />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingTask?.id ? "Salvar Alterações" : "Criar Compromisso"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-border/40 shadow-sm overflow-hidden">
            <CardContent className="p-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                locale={ptBR}
                className="rounded-md border-none"
              />
            </CardContent>
          </Card>

          <Card className="border-border/40 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Filter className="size-4 text-brand-orange" /> Filtros
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Status</label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os Status</SelectItem>
                    <SelectItem value="pending">Pendentes</SelectItem>
                    <SelectItem value="completed">Concluídos</SelectItem>
                    <SelectItem value="cancelled">Cancelados</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {isManager && (
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Usuário</label>
                  <Select value={filterUser} onValueChange={setFilterUser}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Usuários</SelectItem>
                      {team.map((m: any) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.profile?.name || m.profile?.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">Ordenação</label>
                <Select value={sortOrder} onValueChange={(v: any) => setSortOrder(v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asc">Mais próximas primeiro</SelectItem>
                    <SelectItem value="desc">Mais distantes primeiro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-8 space-y-4">
          <Card className="border-border/40 shadow-sm">
            <CardContent className="p-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar tarefas por título ou descrição..." 
                  className="pl-9 bg-muted/30 border-none h-9 text-sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <CalendarIcon className="size-5 text-brand-red" />
              Tarefas de {isToday(selectedDate) ? "Hoje" : format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
            </h2>
            <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-widest">
              {tasksByDay.length} {tasksByDay.length === 1 ? "tarefa" : "tarefas"}
            </Badge>
          </div>

          <div className="space-y-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-orange mb-4"></div>
                <p>Carregando agenda...</p>
              </div>
            ) : tasksByDay.length === 0 ? (
              <Card className="border-dashed border-2 bg-muted/30">
                <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CalendarIcon className="size-12 mb-4 opacity-20" />
                  <p className="text-sm">Nenhum compromisso para este dia.</p>
                  <Button variant="link" onClick={() => setIsModalOpen(true)} className="text-brand-orange">
                    Agendar um novo
                  </Button>
                </CardContent>
              </Card>
            ) : (
              tasksByDay.map((task) => {
                const StatusIcon = statusMap[task.status].icon;
                const isOverdue = task.status === "pending" && isPast(parseISO(task.due_at));
                
                return (
                  <Card key={task.id} className={cn(
                    "group transition-all hover:shadow-md border-l-4",
                    task.status === "completed" ? "border-l-green-500 opacity-70" : 
                    isOverdue ? "border-l-red-500 bg-red-50/30" : "border-l-brand-orange"
                  )}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <h3 className={cn("font-semibold", task.status === "completed" && "line-through text-muted-foreground")}>
                                {task.title}
                                {task.recurrence_type && task.recurrence_type !== 'none' && (
                                  <RefreshCw className="size-3 text-muted-foreground ml-1 inline" />
                                )}
                              </h3>
                            <Badge variant="outline" className={cn("text-[9px] px-1.5 h-4", statusMap[task.status].color)}>
                              {statusMap[task.status].label}
                            </Badge>
                            {isOverdue && (
                              <Badge variant="destructive" className="text-[9px] px-1.5 h-4">Atrasado</Badge>
                            )}
                            {filterUser === "all" && task.profile && (
                              <Badge variant="secondary" className="text-[9px] px-1.5 h-4 font-normal">
                                {task.profile.name || task.profile.email}
                              </Badge>
                            )}
                          </div>
                          {task.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2">{task.description}</p>
                          )}
                          <div className="flex items-center gap-4 pt-1">
                            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                              <Clock className="size-3.5 text-brand-orange" />
                              {format(parseISO(task.due_at), "HH:mm")}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {task.status === "pending" && (
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="size-8 text-green-500 hover:text-green-600 hover:bg-green-50"
                              title="Marcar como concluído"
                              onClick={() => updateMutation.mutate({ id: task.id, task: { status: "completed" } })}
                            >
                              <CheckCircle2 className="size-4" />
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="size-8 text-muted-foreground hover:text-foreground"
                            title="Editar compromisso"
                            onClick={() => {
                              setEditingTask(task);
                              setIsModalOpen(true);
                            }}
                          >
                            <CalendarIcon className="size-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="size-8 text-muted-foreground hover:text-brand-red hover:bg-brand-red/5"
                            title="Excluir compromisso"
                            onClick={async () => {
                              if (await confirm({
                                title: "Remover compromisso?",
                                description: "Esta ação não pode ser desfeita.",
                                confirmLabel: "Remover",
                                variant: "destructive"
                              })) {
                                deleteMutation.mutate(task.id);
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
