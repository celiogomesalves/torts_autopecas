import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, CheckCircle2, ArrowLeft } from "lucide-react";
import { useBranding } from "@/hooks/use-branding";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      userId: typeof search.userId === "string" ? search.userId : "",
      secret: typeof search.secret === "string" ? search.secret : "",
      expire: typeof search.expire === "string" ? search.expire : "",
    };
  },
  head: () => ({
    meta: [
      { title: "Redefinir Senha — Tort´s Auto Peças" },
      { name: "description", content: "Crie uma nova senha de acesso com segurança." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const branding = useBranding();
  const { userId, secret } = Route.useSearch();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState(false);

  const isValidToken = Boolean(userId && secret);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValidToken) {
      toast.error("Link de recuperação inválido ou expirado.");
      return;
    }

    if (password.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }

    setBusy(true);
    const { error } = await (supabase.auth as any).updateRecovery({
      userId,
      secret,
      password,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message || "Erro ao redefinir senha. O link pode ter expirado.");
      return;
    }

    setSuccess(true);
    toast.success("Senha redefinida com sucesso!");
    setTimeout(() => {
      navigate({ to: "/login" });
    }, 2500);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background relative overflow-hidden">
      {/* Background ambient glows */}
      <div className="absolute -top-24 -right-24 size-96 rounded-full bg-brand-red/10 blur-[100px] pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 size-96 rounded-full bg-brand-orange/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-card/90 backdrop-blur-md p-8 shadow-2xl relative z-10">
        <div className="text-center space-y-2">
          <div className="size-12 rounded-xl bg-brand-red/10 border border-brand-red/20 mx-auto flex items-center justify-center text-brand-red">
            <KeyRound className="size-6" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-foreground">
            Redefinição de Senha
          </h2>
          <p className="text-sm text-muted-foreground">
            {branding.name} ERP Multiempresa
          </p>
        </div>

        {!isValidToken ? (
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm text-destructive leading-relaxed">
              <strong>Link inválido ou expirado.</strong>
              <p className="mt-1 text-xs opacity-90">
                Os parâmetros de recuperação não foram encontrados nesta URL. Solicite um novo link na tela de login.
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => navigate({ to: "/login" })}
            >
              <ArrowLeft className="size-4 mr-2" />
              Voltar para o Login
            </Button>
          </div>
        ) : success ? (
          <div className="space-y-4 py-4 text-center">
            <div className="size-14 rounded-full bg-green-500/10 border border-green-500/20 mx-auto flex items-center justify-center text-green-500">
              <CheckCircle2 className="size-7" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-foreground">Senha alterada com sucesso!</h3>
              <p className="text-xs text-muted-foreground">
                Você será redirecionado para a tela de login em alguns segundos...
              </p>
            </div>
            <Button
              className="w-full bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
              onClick={() => navigate({ to: "/login" })}
            >
              Ir para o Login Agora
            </Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova Senha (mín. 8 caracteres)</Label>
              <div className="relative">
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar Nova Senha</Label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                required
                minLength={8}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="w-full bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground font-semibold"
            >
              {busy ? "Salvando nova senha..." : "Salvar Nova Senha"}
            </Button>

            <div className="text-center pt-2">
              <Link
                to="/login"
                className="text-xs text-muted-foreground hover:text-brand-orange transition-colors inline-flex items-center gap-1"
              >
                <ArrowLeft className="size-3" />
                Voltar para o login
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
