import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchTeam,
  updateMembershipCustomRole,
  removeMembership,
  rotateInvite,
  fetchMyCompanies,
  fetchSuperAdminIds,
  isSuperAdmin,
  fetchCompanyRoles,
  toggleMemberBlocked,
  hasPermission,
} from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SmartPagination } from "@/components/smart-pagination";
import {
  KeyRound,
  Trash2,
  RefreshCw,
  Users,
  Mail,
  User,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { cn, matchSearch } from "@/lib/utils";
import { SearchInput } from "@/components/search-input";

export const Route = createFileRoute("/app/equipe")({
  component: TeamPage,
});

function TeamPage() {
  const { user, currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();
  const confirm = useConfirm();

  const teamQ = useQuery({
    queryKey: ["team", cid],
    queryFn: () => fetchTeam(cid),
    enabled: !!cid,
  });
  const rolesQ = useQuery({
    queryKey: ["company-roles", cid],
    queryFn: () => fetchCompanyRoles(cid),
    enabled: !!cid,
  });
  const companiesQ = useQuery({
    queryKey: ["companies", user?.id],
    queryFn: fetchMyCompanies,
    enabled: !!user,
  });
  const permissionQ = useQuery({
    queryKey: ["perm-block", cid],
    queryFn: () => hasPermission(cid, "equipe", "edit"),
    enabled: !!cid,
  });
  const canBlock = !!permissionQ.data;
  const company = (companiesQ.data ?? []).find((c) => c.id === cid);
  const inviteCodeQ = useQuery({
    queryKey: ["invite-code", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { appwrite: appwrite } = await import("@/integrations/appwrite/client");
      const { data } = await appwrite.rpc("get_company_invite_code" as any, { _company: cid });
      return (data as string | null) ?? null;
    },
  });

  const superAdminsQ = useQuery({ queryKey: ["super-admin-ids"], queryFn: fetchSuperAdminIds });
  const meIsSuperQ = useQuery({
    queryKey: ["isSuperAdmin", user?.id],
    queryFn: isSuperAdmin,
    enabled: !!user,
  });
  const superAdminIds = new Set(superAdminsQ.data ?? []);
  const meIsSuper = !!meIsSuperQ.data;

  const roleMut = useMutation({
    mutationFn: ({ id, customRoleId }: { id: string; customRoleId: string }) =>
      updateMembershipCustomRole(id, customRoleId),
    onSuccess: () => {
      toast.success("Sucesso! Papel atualizado.");
      qc.invalidateQueries({ queryKey: ["team", cid] });
      qc.invalidateQueries({ queryKey: ["role-member-counts", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: removeMembership,
    onSuccess: () => {
      toast.success("Sucesso! Membro removido.");
      qc.invalidateQueries({ queryKey: ["team", cid] });
      qc.invalidateQueries({ queryKey: ["role-member-counts", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rotateMut = useMutation({
    mutationFn: () => rotateInvite(cid),
    onSuccess: () => {
      toast.success("Sucesso! Novo código gerado.");
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["invite-code", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const blockMut = useMutation({
    mutationFn: ({ id, blocked }: { id: string; blocked: boolean }) =>
      toggleMemberBlocked(id, blocked),
    onSuccess: (_, variables) => {
      toast.success(variables.blocked ? "Usuário bloqueado!" : "Usuário desbloqueado!");
      qc.invalidateQueries({ queryKey: ["team", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Esconde super admins (a menos que o próprio usuário também seja super admin)
  const team = (teamQ.data ?? []).filter((m) => meIsSuper || !superAdminIds.has(m.user_id));

  const [search, setSearch] = useState("");
  const filteredTeam = useMemo(
    () =>
      team.filter(
        (m) => matchSearch(m.profile?.name, search) || matchSearch(m.profile?.email, search),
      ),
    [team, search],
  );

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;
  const totalPages = Math.ceil(filteredTeam.length / pageSize);
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredTeam.slice(start, start + pageSize);
  }, [filteredTeam, currentPage, pageSize]);

  return (
    <div className="space-y-6">
      <PageHeading icon={Users} title="Equipe" subtitle="Membros, papéis e código de convite" />

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center">
              <KeyRound className="size-5" />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">
                Código de convite
              </div>
              <div className="font-mono text-2xl font-bold tracking-widest text-brand-orange">
                {inviteCodeQ.data ?? "—"}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => rotateMut.mutate()}
            disabled={rotateMut.isPending}
          >
            <RefreshCw className="size-4 mr-2" /> Gerar novo
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Compartilhe este código para que outros entrem na empresa pela tela de "Empresas".
        </p>
      </Card>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Users className="size-4" />
            <h3 className="font-semibold">Membros ({filteredTeam.length})</h3>
          </div>
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setCurrentPage(1);
            }}
            placeholder="Pesquisar membros..."
            className="sm:max-w-xs"
          />
        </div>
        <div className="hidden md:block rounded-md border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-44">Papel</TableHead>
                <TableHead className="text-right w-24">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teamQ.isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : paginated.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-10">
                    Sem membros.
                  </TableCell>
                </TableRow>
              ) : (
                paginated.map((m) => {
                  const isMe = m.user_id === user?.id;
                  const name = m.profile?.name || m.profile?.email || "Usuário";
                  const isBlocked = !!m.is_blocked;

                  return (
                    <TableRow key={m.id} className={cn(isBlocked && "opacity-60 bg-muted/30")}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="size-8">
                            <AvatarFallback className={cn(isBlocked && "bg-muted")}>
                              {name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium flex items-center gap-2">
                              {name}
                              {isMe && (
                                <span className="text-xs text-muted-foreground font-normal">
                                  (você)
                                </span>
                              )}
                              {isBlocked && (
                                <Badge
                                  variant="destructive"
                                  className="h-4 text-[10px] uppercase px-1"
                                >
                                  Bloqueado
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {m.profile?.email ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={m.custom_role_id || ""}
                          onValueChange={(v) => roleMut.mutate({ id: m.id, customRoleId: v })}
                          disabled={isMe || isBlocked}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Sem papel" />
                          </SelectTrigger>
                          <SelectContent>
                            {rolesQ.data?.map((r) => (
                              <SelectItem key={r.id} value={r.id}>
                                {r.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {!isMe && canBlock && !superAdminIds.has(m.user_id) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className={cn(
                                isBlocked
                                  ? "text-brand-green hover:text-brand-green/80"
                                  : "text-brand-orange hover:text-brand-orange/80",
                              )}
                              title={isBlocked ? "Desbloquear" : "Bloquear"}
                              onClick={async () => {
                                const action = isBlocked ? "desbloquear" : "bloquear";
                                if (
                                  await confirm({
                                    title: `${action.charAt(0).toUpperCase() + action.slice(1)} usuário?`,
                                    description: `Tem certeza que deseja ${action} "${name}"? ${isBlocked ? "O usuário voltará a ter acesso ao sistema." : "O usuário será desconectado e não poderá mais acessar o sistema nesta empresa."}`,
                                    confirmLabel: isBlocked ? "Desbloquear" : "Bloquear",
                                    variant: isBlocked ? "default" : "destructive",
                                  })
                                ) {
                                  blockMut.mutate({ id: m.id, blocked: !isBlocked });
                                }
                              }}
                            >
                              {isBlocked ? (
                                <ShieldCheck className="size-4" />
                              ) : (
                                <ShieldAlert className="size-4" />
                              )}
                            </Button>
                          )}
                          {!isMe && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={async () => {
                                if (
                                  await confirm({
                                    title: "Remover membro?",
                                    description: `Tem certeza que deseja remover "${name}" da equipe? Esta ação não pode ser desfeita.`,
                                    confirmLabel: "Remover",
                                  })
                                )
                                  removeMut.mutate(m.id);
                              }}
                            >
                              <Trash2 className="size-4 text-brand-red" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        <div className="md:hidden space-y-3">
          {teamQ.isLoading ? (
            <div className="text-center text-muted-foreground py-10">Carregando...</div>
          ) : paginated.length === 0 ? (
            <div className="text-center text-muted-foreground py-10">Sem membros.</div>
          ) : (
            paginated.map((m) => {
              const isMe = m.user_id === user?.id;
              const name = m.profile?.name || m.profile?.email || "Usuário";
              const isBlocked = !!m.is_blocked;

              return (
                <Card
                  key={m.id}
                  className={cn(
                    "p-4 space-y-3 border-l-4",
                    isBlocked
                      ? "border-l-destructive bg-muted/30 opacity-60"
                      : "border-l-brand-orange",
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <Avatar className="size-8">
                        <AvatarFallback>{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-bold text-base flex items-center gap-2">
                          {name}
                          {isMe && (
                            <span className="text-[10px] text-muted-foreground font-normal ml-1">
                              (você)
                            </span>
                          )}
                          {isBlocked && (
                            <Badge variant="destructive" className="h-4 text-[9px] uppercase px-1">
                              Bloqueado
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1 italic">
                          <Mail className="size-3" /> {m.profile?.email ?? "—"}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs border-t border-dashed pt-3">
                    <div className="w-32">
                      <Select
                        value={m.custom_role_id || ""}
                        onValueChange={(v) => roleMut.mutate({ id: m.id, customRoleId: v })}
                        disabled={isMe || isBlocked}
                      >
                        <SelectTrigger className="h-8 text-[10px]">
                          <SelectValue placeholder="Sem papel" />
                        </SelectTrigger>
                        <SelectContent>
                          {rolesQ.data?.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-1">
                      {!isMe && canBlock && (
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-8 px-2",
                            isBlocked
                              ? "text-brand-green border-brand-green/20"
                              : "text-brand-orange border-brand-orange/20",
                          )}
                          onClick={async () => {
                            const action = isBlocked ? "desbloquear" : "bloquear";
                            if (
                              await confirm({
                                title: `${action.charAt(0).toUpperCase() + action.slice(1)} usuário?`,
                                description: `Tem certeza que deseja ${action} "${name}"?`,
                                confirmLabel: isBlocked ? "Desbloquear" : "Bloquear",
                                variant: isBlocked ? "default" : "destructive",
                              })
                            ) {
                              blockMut.mutate({ id: m.id, blocked: !isBlocked });
                            }
                          }}
                        >
                          {isBlocked ? (
                            <ShieldCheck className="size-3 mr-1" />
                          ) : (
                            <ShieldAlert className="size-3 mr-1" />
                          )}
                          {isBlocked ? "Desbloquear" : "Bloquear"}
                        </Button>
                      )}
                      {!isMe && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 px-2 text-brand-red"
                          onClick={async () => {
                            if (
                              await confirm({
                                title: "Remover membro?",
                                description: `Tem certeza que deseja remover "${name}" da equipe? Esta ação não pode ser desfeita.`,
                                confirmLabel: "Remover",
                              })
                            )
                              removeMut.mutate(m.id);
                          }}
                        >
                          <Trash2 className="size-3 mr-1" /> Remover
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-4 border-t pt-4">
            <SmartPagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
