import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/bloqueado")({
  component: BloqueadoPage,
});

function BloqueadoPage() {
  const navigate = useNavigate();
  const { setCurrentCompanyId } = useAuth();

  const signOut = async () => {
    setCurrentCompanyId(null);
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto size-20 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center shadow-inner">
          <ShieldAlert className="size-10" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Acesso Bloqueado
          </h1>
          <p className="text-muted-foreground">
            Seu acesso ao sistema foi suspenso pela administração. Nenhuma
            página ou requisição será permitida enquanto o bloqueio estiver
            ativo.
          </p>
        </div>
        <div className="bg-muted/50 p-4 rounded-lg border border-border text-sm text-left space-y-2">
          <p className="font-medium text-foreground">O que fazer agora?</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-1">
            <li>Entre em contato com a administração da sua empresa.</li>
            <li>Procure o suporte se acreditar que isso é um erro.</li>
          </ul>
        </div>
        <Button
          variant="outline"
          className="w-full"
          onClick={signOut}
        >
          Sair da conta
        </Button>
      </div>
    </div>
  );
}
