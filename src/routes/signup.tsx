import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { appwrite as supabase } from "@/integrations/appwrite/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { useBranding } from "@/hooks/use-branding";

export const Route = createFileRoute("/signup")({
  head: () => ({ meta: [{ title: "Criar conta — AutoPeças ERP" }] }),
  component: SignupPage,
});

function SignupPage() {
  const navigate = useNavigate();
  const branding = useBranding();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("Senha deve ter ao menos 6 caracteres");
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/empresas`,
        data: { name },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (!data.session) {
      toast.success("Conta criada! Verifique seu e-mail para confirmar.");
      navigate({ to: "/login" });
      return;
    }
    toast.success("Conta criada!");
    navigate({ to: "/empresas" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-8 shadow-2xl"
      >
        <div>
          <h2 className="text-2xl font-bold">Criar conta</h2>
          <p className="text-sm text-muted-foreground">Comece a usar o {branding.name} ERP</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Senha (mín. 6)</Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
        <Button
          type="submit"
          disabled={busy}
          className="w-full bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
        >
          {busy ? "Criando..." : "Criar conta"}
        </Button>
        <p className="text-sm text-muted-foreground text-center">
          Já tem conta?{" "}
          <Link to="/login" className="text-brand-orange hover:underline">
            Entrar
          </Link>
        </p>
      </form>
    </div>
  );
}
