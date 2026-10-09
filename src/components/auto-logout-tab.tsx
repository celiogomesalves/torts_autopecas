import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Clock, Save, Building2, Search } from "lucide-react";
import { toast } from "sonner";

type Row = {
  company_id: string;
  company_name: string;
  auto_logout_enabled: boolean;
  auto_logout_time: string | null; // HH:MM(:SS)
  last_forced_logout_at: string | null;
  force_logout_at: string | null;
};

export function AutoLogoutTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [drafts, setDrafts] = useState<Record<string, { enabled: boolean; time: string }>>({});

  const q = useQuery({
    queryKey: ["auto-logout-companies"],
    queryFn: async (): Promise<Row[]> => {
      const { data: companies, error: eC } = await supabase
        .from("companies")
        .select("id,name,approved")
        .eq("approved", true)
        .order("name");
      if (eC) throw eC;
      const ids = (companies || []).map((c) => c.id);
      if (ids.length === 0) return [];
      const { data: settings, error: eS } = await supabase
        .from("company_settings" as any)
        .select(
          "company_id, auto_logout_enabled, auto_logout_time, last_forced_logout_at, force_logout_at",
        )
        .in("company_id", ids);
      if (eS) throw eS;
      const map = new Map<string, any>();
      (settings || []).forEach((s: any) => map.set(s.company_id, s));
      return (companies || []).map((c) => {
        const s = map.get(c.id) || {};
        return {
          company_id: c.id,
          company_name: c.name,
          auto_logout_enabled: Boolean(s.auto_logout_enabled),
          auto_logout_time: s.auto_logout_time ?? null,
          last_forced_logout_at: s.last_forced_logout_at ?? null,
          force_logout_at: s.force_logout_at ?? null,
        };
      });
    },
  });

  const saveMut = useMutation({
    mutationFn: async (payload: { companyId: string; enabled: boolean; time: string }) => {
      const time = payload.enabled ? normalizeTime(payload.time) : null;
      if (payload.enabled && !time) throw new Error("Horário inválido (use HH:MM)");
      const { error } = await supabase
        .from("company_settings" as any)
        .update({
          auto_logout_enabled: payload.enabled,
          auto_logout_time: time,
        })
        .eq("company_id", payload.companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      qc.invalidateQueries({ queryKey: ["auto-logout-companies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const forceNowMut = useMutation({
    mutationFn: async (companyId: string) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("company_settings" as any)
        .update({ force_logout_at: now, last_forced_logout_at: now })
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sessões desta empresa serão encerradas em instantes");
      qc.invalidateQueries({ queryKey: ["auto-logout-companies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(() => {
    const list = q.data || [];
    if (!search.trim()) return list;
    const s = search.trim().toLowerCase();
    return list.filter((r) => r.company_name.toLowerCase().includes(s));
  }, [q.data, search]);

  const getDraft = (r: Row) => {
    const d = drafts[r.company_id];
    return {
      enabled: d ? d.enabled : r.auto_logout_enabled,
      time: d ? d.time : (r.auto_logout_time?.slice(0, 5) ?? "23:59"),
    };
  };

  const setDraft = (id: string, patch: Partial<{ enabled: boolean; time: string }>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { enabled: patch.enabled ?? prev[id]?.enabled ?? false, time: patch.time ?? prev[id]?.time ?? "23:59" },
    }));
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Clock className="size-4 text-brand-orange" />
            <h3 className="font-semibold">Encerramento automático de sessões</h3>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Fuso: America/Sao_Paulo. Todo dia no horário definido, todas as sessões da empresa são
            encerradas. Funciona mesmo com o sistema fechado.
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar empresa..."
            className="pl-8"
          />
        </div>
      </div>

      {q.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="size-4 animate-spin" /> Carregando empresas...
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-8">
          Nenhuma empresa encontrada.
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const draft = getDraft(r);
            const dirty =
              draft.enabled !== r.auto_logout_enabled ||
              draft.time !== (r.auto_logout_time?.slice(0, 5) ?? "23:59");
            return (
              <div
                key={r.company_id}
                className="flex flex-col md:flex-row md:items-center gap-3 border rounded-lg p-3 bg-card"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Building2 className="size-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.company_name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Último disparo:{" "}
                      {r.last_forced_logout_at
                        ? new Date(r.last_forced_logout_at).toLocaleString("pt-BR")
                        : "—"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={draft.enabled}
                    onCheckedChange={(v) => setDraft(r.company_id, { enabled: v })}
                    id={`toggle-${r.company_id}`}
                  />
                  <Label htmlFor={`toggle-${r.company_id}`} className="text-sm">
                    {draft.enabled ? "Ativo" : "Desativado"}
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    value={draft.time}
                    onChange={(e) => setDraft(r.company_id, { time: e.target.value })}
                    disabled={!draft.enabled}
                    className="w-28"
                  />
                  {dirty ? (
                    <Badge variant="outline" className="text-brand-orange border-brand-orange/40">
                      Alterado
                    </Badge>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 md:justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => forceNowMut.mutate(r.company_id)}
                    disabled={forceNowMut.isPending}
                  >
                    Encerrar agora
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      saveMut.mutate({
                        companyId: r.company_id,
                        enabled: draft.enabled,
                        time: draft.time,
                      })
                    }
                    disabled={!dirty || saveMut.isPending}
                    className="bg-brand-orange hover:bg-brand-orange/90"
                  >
                    <Save className="size-4 mr-1" /> Salvar
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function normalizeTime(v: string): string | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(v.trim());
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00`;
}
