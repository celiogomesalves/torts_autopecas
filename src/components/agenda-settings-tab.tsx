import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Volume2, Save, Music } from "lucide-react";
import { toast } from "sonner";

export function AgendaSettingsTab() {
  const { currentCompanyId, user } = useAuth();
  const qc = useQueryClient();
  const cid = currentCompanyId!;
  const uid = user?.id;

  const { data: settings, isLoading } = useQuery({
    queryKey: ["user-agenda-settings", cid, uid],
    queryFn: async () => {
      // Tenta buscar configurações específicas do usuário primeiro
      const { data: userSet, error: userErr } = await supabase
        .from("user_settings" as any)
        .select("*" as any)
        .eq("user_id", uid)
        .eq("company_id", cid)
        .maybeSingle();
      
      if (!userErr && userSet) {
        const res = userSet as any;
        return {
          agenda_alert_sound_enabled: res?.agenda_alert_sound_enabled ?? true,
          agenda_alert_sound_type: res?.agenda_alert_sound_type ?? "bell",
          is_personal: true
        };
      }

      // Fallback para configurações da empresa
      const { data: compSet, error: compErr } = await supabase
        .from("company_settings")
        .select("agenda_alert_sound_enabled, agenda_alert_sound_type" as any)
        .eq("company_id", cid)
        .maybeSingle();
      
      const res = compSet as any;
      return {
        agenda_alert_sound_enabled: res?.agenda_alert_sound_enabled ?? true,
        agenda_alert_sound_type: res?.agenda_alert_sound_type ?? "bell",
        is_personal: false
      };
    },
    enabled: !!cid && !!uid,
  });

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundType, setSoundType] = useState("bell");

  useEffect(() => {
    if (settings) {
      setSoundEnabled(settings.agenda_alert_sound_enabled);
      setSoundType(settings.agenda_alert_sound_type);
    }
  }, [settings]);

  const saveMut = useMutation({
    mutationFn: async () => {
      // Primeiro tenta buscar se já existe
      const { data: existing } = await supabase
        .from("user_settings" as any)
        .select("id")
        .eq("user_id", uid)
        .eq("company_id", cid)
        .maybeSingle();

      const payload = {
        user_id: uid,
        company_id: cid,
        agenda_alert_sound_enabled: soundEnabled,
        agenda_alert_sound_type: soundType,
        updated_at: new Date().toISOString(),
      };

      let error;
      if (existing) {
        const { error: updateError } = await supabase
          .from("user_settings" as any)
          .update(payload as any)
          .eq("id", (existing as any).id);
        error = updateError;
      } else {
        const { error: insertError } = await supabase
          .from("user_settings" as any)
          .insert(payload as any);
        error = insertError;
      }
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações pessoais da agenda salvas");
      qc.invalidateQueries({ queryKey: ["user-agenda-settings", cid, uid] });
    },
    onError: (e: any) => {
      console.error("Erro ao salvar configurações da agenda:", e);
      if (e.message?.includes("unique constraint") || e.code === "23505") {
        toast.error("Erro ao salvar: Estas configurações já existem. Tente recarregar a página.");
      } else {
        toast.error("Erro ao salvar: " + e.message);
      }
    },
  });

  const soundOptions = [
    { value: "bell", label: "Sino (Padrão)", url: "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" },
    { value: "chime", label: "Carrilhão", url: "https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3" },
    { value: "digital", label: "Digital", url: "https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3" },
    { value: "notification", label: "Notificação", url: "https://assets.mixkit.co/active_storage/sfx/2357/2357-preview.mp3" },
  ];

  const playPreview = (type: string) => {
    const option = soundOptions.find(o => o.value === type);
    if (option) {
      const audio = new Audio(option.url);
      audio.volume = 0.5;
      audio.play().catch(e => console.warn("Erro ao tocar som:", e));
    }
  };

  if (isLoading) return <Card className="p-10 text-center text-muted-foreground">Carregando...</Card>;

  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-10 rounded-lg bg-brand-red/15 text-brand-red flex items-center justify-center">
            <Calendar className="size-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold">Recursos Pessoais da Agenda</h3>
            <p className="text-sm text-muted-foreground">
              {settings?.is_personal 
                ? "Configurações personalizadas para sua conta." 
                : "Exibindo padrão da empresa. Salve para personalizar."}
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
            <div className="space-y-0.5">
              <Label className="text-base">Tocar sons de alerta</Label>
              <p className="text-sm text-muted-foreground">
                Emitir um aviso sonoro quando houver lembretes de tarefas
              </p>
            </div>
            <Switch
              checked={soundEnabled}
              onCheckedChange={setSoundEnabled}
            />
          </div>

          {soundEnabled && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
              <Label>Tipo de som do alerta</Label>
              <div className="flex items-center gap-3">
                <Select value={soundType} onValueChange={setSoundType}>
                  <SelectTrigger className="max-w-[250px]">
                    <SelectValue placeholder="Selecione o som" />
                  </SelectTrigger>
                  <SelectContent>
                    {soundOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <Music className="size-3" />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => playPreview(soundType)}
                  title="Ouvir demonstração"
                >
                  <Volume2 className="size-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-border flex justify-end">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="gap-2">
              <Save className="size-4" />
              {saveMut.isPending ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
