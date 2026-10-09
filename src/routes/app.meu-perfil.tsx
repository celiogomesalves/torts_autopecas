import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageHeading } from "@/components/page-header";
import { toast } from "sonner";
import {
  Loader2,
  User,
  KeyRound,
  UserCircle,
  Mail,
  Phone,
  MapPin,
  Lock,
  Save,
  Eye,
  EyeOff,
  ShieldCheck,
  Bell,
  BellOff,
} from "lucide-react";
import {
  checkNotificationSubscription,
  registerPushNotifications,
  unsubscribePushNotifications,
} from "@/lib/push-notifications";

export const Route = createFileRoute("/app/meu-perfil")({
  component: MyProfilePage,
});

function formatPhone(value: string) {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function MyProfilePage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [showPw1, setShowPw1] = useState(false);
  const [showPw2, setShowPw2] = useState(false);

  const [pushActive, setPushActive] = useState(false);
  const [checkingPush, setCheckingPush] = useState(true);
  const [togglingPush, setTogglingPush] = useState(false);

  useEffect(() => {
    (async () => {
      const active = await checkNotificationSubscription();
      setPushActive(active);
      setCheckingPush(false);
    })();
  }, []);

  const handlePushToggle = async () => {
    if (!user) return;
    setTogglingPush(true);
    if (pushActive) {
      const success = await unsubscribePushNotifications();
      if (success) {
        setPushActive(false);
        toast.success("Notificações desativadas para este dispositivo.");
      } else {
        toast.error("Erro ao desativar notificações.");
      }
    } else {
      const success = await registerPushNotifications(user.id);
      if (success) {
        setPushActive(true);
        toast.success("Notificações ativadas com sucesso neste dispositivo!");
      } else {
        toast.error("Não foi possível ativar as notificações push neste dispositivo.", {
          description:
            "Verifique se você permitiu notificações nas configurações do seu navegador.",
        });
      }
    }
    setTogglingPush(false);
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await (supabase.from("profiles") as any)
        .select("name, phone, address")
        .eq("id", user.id)
        .maybeSingle();
      if (error) {
        toast.error("Erro ao carregar perfil", { description: error.message });
      } else if (data) {
        setName(data.name ?? "");
        setPhone(formatPhone(data.phone ?? ""));
        setAddress(data.address ?? "");
      }
      setLoading(false);
    })();
  }, [user]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      toast.error("Informe seu nome");
      return;
    }
    setSavingProfile(true);
    const { error } = await (supabase.from("profiles") as any)
      .update({ name: name.trim(), phone: phone.trim() || null, address: address.trim() || null })
      .eq("id", user.id);
    setSavingProfile(false);
    if (error) {
      toast.error("Erro ao salvar", { description: error.message });
    } else {
      toast.success("Perfil atualizado");
    }
  };

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw1.length < 6) {
      toast.error("A senha deve ter ao menos 6 caracteres");
      return;
    }
    if (pw1 !== pw2) {
      toast.error("As senhas não coincidem");
      return;
    }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: pw1 });
    setSavingPassword(false);
    if (error) {
      toast.error("Erro ao alterar senha", { description: error.message });
    } else {
      setPw1("");
      setPw2("");
      toast.success("Senha alterada com sucesso");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const iconInputClass = "pl-9";

  return (
    <div className="space-y-6">
      <PageHeading
        icon={UserCircle}
        title="Meu Perfil"
        subtitle="Gerencie suas informações pessoais e segurança da conta"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Dados Pessoais */}
        <Card>
          <CardHeader className="flex-row items-start gap-3 space-y-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-orange/10 text-brand-orange">
              <User className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle>Dados Pessoais</CardTitle>
              <CardDescription>Seu nome, contato e endereço</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Nome Completo</Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className={iconInputClass}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>E-mail (não alterável)</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={user?.email ?? ""} disabled className={iconInputClass} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone / WhatsApp</Label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="(00) 00000-0000"
                    inputMode="tel"
                    maxLength={16}
                    className={iconInputClass}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Endereço</Label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rua, Número, Bairro, Cidade - UF"
                    className={iconInputClass}
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={savingProfile}
                className="w-full bg-brand-orange text-white hover:bg-brand-orange/90"
              >
                {savingProfile ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                Salvar Alterações
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Segurança */}
        <Card>
          <CardHeader className="flex-row items-start gap-3 space-y-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
              <KeyRound className="size-5" />
            </div>
            <div className="min-w-0">
              <CardTitle>Segurança</CardTitle>
              <CardDescription>Altere sua senha de acesso</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={savePassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="pw1">Nova Senha</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="pw1"
                    type={showPw1 ? "text" : "password"}
                    value={pw1}
                    onChange={(e) => setPw1(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                    className="pl-9 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw1((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPw1 ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pw2">Confirmar Nova Senha</Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="pw2"
                    type={showPw2 ? "text" : "password"}
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    autoComplete="new-password"
                    placeholder="Repita a nova senha"
                    className="pl-9 pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw2((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPw2 ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                disabled={savingPassword}
                variant="outline"
                className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                {savingPassword ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Lock className="size-4" />
                )}
                Alterar Senha
              </Button>

              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground flex gap-2">
                <ShieldCheck className="size-4 shrink-0 text-brand-orange mt-0.5" />
                <span>
                  <strong className="text-foreground">Dica:</strong> Use uma senha forte com letras,
                  números e caracteres especiais para maior segurança. Após alterar, você continuará
                  logado nesta sessão.
                </span>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Preferências do Aplicativo */}
      <Card>
        <CardHeader className="flex-row items-start gap-3 space-y-0">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
            {pushActive ? <Bell className="size-5" /> : <BellOff className="size-5" />}
          </div>
          <div className="min-w-0">
            <CardTitle>Notificações Push</CardTitle>
            <CardDescription>
              Receba alertas de estoque, atualizações de entregas e avisos importantes em tempo real
              neste dispositivo.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Status das Notificações</p>
              <p className="text-xs text-muted-foreground">
                {pushActive
                  ? "Ativadas para este navegador/dispositivo."
                  : "Desativadas. Clique no botão ao lado para ativar."}
              </p>
            </div>
            <Button
              onClick={handlePushToggle}
              disabled={checkingPush || togglingPush}
              variant={pushActive ? "outline" : "default"}
              className={
                pushActive
                  ? "border-muted-foreground/30 hover:bg-muted"
                  : "bg-brand-orange text-white hover:bg-brand-orange/90"
              }
            >
              {checkingPush || togglingPush ? (
                <Loader2 className="size-4 animate-spin" />
              ) : pushActive ? (
                <>
                  <BellOff className="size-4 mr-2" />
                  Desativar
                </>
              ) : (
                <>
                  <Bell className="size-4 mr-2" />
                  Ativar Notificações
                </>
              )}
            </Button>
          </div>
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <span className="block mb-1">
              <strong className="text-foreground">Nota sobre compatibilidade:</strong>
            </span>
            <span>
              As notificações dependem das permissões do navegador e do suporte a Service Workers.
              No iOS, certifique-se de adicionar este aplicativo à Tela de Início (como PWA)
              primeiro e ter o iOS 16.4 ou posterior.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
