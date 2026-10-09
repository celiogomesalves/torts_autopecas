import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { hasPermission } from "@/lib/db";

interface AdminAuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (reason: string) => void;
  title?: string;
  description?: string;
  requireReason?: boolean;
  /** When true, skips email/password authentication and only asks for a reason. */
  skipAuth?: boolean;
  module?: string;
  action?: "view" | "create" | "edit" | "delete";
}

export function AdminAuthDialog({
  isOpen,
  onClose,
  onSuccess,
  title = "Autorização Requerida",
  description = "Informe seu login e senha para autorizar esta ação.",
  requireReason = false,
  skipAuth = false,
  module,
  action = "edit",
}: AdminAuthDialogProps) {
  const { user, currentCompanyId } = useAuth();
  const cid = currentCompanyId;
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
  }, [user?.email, isOpen]);

  const handleAuth = async () => {
    if (requireReason && !reason.trim()) {
      toast.error("Informe o motivo desta ação.");
      return;
    }

    if (skipAuth) {
      onSuccess(reason);
      setReason("");
      onClose();
      return;
    }

    if (!email || !password) {
      toast.error("Informe login e senha.");
      return;
    }

    setIsLoading(true);
    try {
      // Re-autentica para verificar se a senha está correta e se o usuário tem permissão
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw new Error("Login ou senha incorretos.");

      // Se um módulo foi fornecido, validamos a permissão específica
      if (module && cid) {
        const allowed = await hasPermission(cid, module, action);
        if (!allowed) {
          throw new Error(
            `Este usuário não tem permissão para ${action === "delete" ? "excluir" : "editar"} no módulo ${module}.`,
          );
        }
      } else {
        // Fallback legado ou quando não há módulo: verifica se é admin/gerente
        const { data: membership, error: memError } = await supabase
          .from("memberships")
          .select("role")
          .eq("user_id", data.user.id)
          .single();

        if (memError || !membership) {
          throw new Error("Usuário não encontrado ou sem permissão.");
        }

        if (membership.role !== "admin" && membership.role !== "gerente") {
          throw new Error("Apenas administradores ou gerentes podem autorizar esta ação.");
        }
      }

      onSuccess(reason);
      setPassword("");
      setReason("");
      onClose();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {!skipAuth && (
            <div className="grid gap-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@exemplo.com"
                autoComplete="email"
              />
              <p className="text-xs text-muted-foreground">
                Confirme sua senha, ou digite o e-mail e a senha de um
                administrador/gerente para autorizar.
              </p>
            </div>
          )}
          {requireReason && (
            <div className="grid gap-2">
              <Label htmlFor="reason">Motivo</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex: Erro no lançamento, Devolução..."
                onKeyDown={(e) => e.key === "Enter" && skipAuth && handleAuth()}
              />
            </div>
          )}
          {!skipAuth && (
            <div className="grid gap-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAuth()}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleAuth} disabled={isLoading}>
            {isLoading ? "Verificando..." : skipAuth ? "Confirmar" : "Autorizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
