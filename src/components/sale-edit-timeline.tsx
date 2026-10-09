import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Clock, User, Plus, Minus, ArrowRight, FileEdit } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Props {
  saleId: string | null;
}

export function SaleEditTimeline({ saleId }: Props) {
  const q = useQuery({
    queryKey: ["sale-edit-logs", saleId],
    enabled: !!saleId,
    queryFn: async () => {
      const sb = supabase as any;
      const { data, error } = await sb
        .from("sale_edit_logs")
        .select("id, created_at, reason, diff, edited_by, profiles:profiles!sale_edit_logs_edited_by_fkey(name, email)")
        .eq("sale_id", saleId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!saleId) return null;
  if (q.isLoading) {
    return <div className="text-sm text-muted-foreground py-2">Carregando histórico...</div>;
  }
  const logs = q.data ?? [];
  if (logs.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-2">
        Nenhuma alteração registrada nesta venda.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log: any) => {
        const d = log.diff || {};
        const itemsAdded = d.items_added || [];
        const itemsRemoved = d.items_removed || [];
        const itemsChanged = d.items_changed || [];
        const totals = d.totals || {};
        const totalChanged =
          totals.before && totals.after && Number(totals.before.total) !== Number(totals.after.total);
        const customerChanged =
          d.customer && (d.customer.before_id !== d.customer.after_id);
        const paymentChanged =
          d.payment && (d.payment.before !== d.payment.after);

        return (
          <div key={log.id} className="border-l-2 border-orange-300 pl-3 pb-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 font-medium text-foreground">
                <FileEdit className="size-3 text-orange-500" />
                <span>{format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
              </div>
              <div className="flex items-center gap-1 text-muted-foreground">
                <User className="size-3" />
                {log.profiles?.name || log.profiles?.email || "—"}
              </div>
            </div>

            {log.reason && (
              <div className="text-xs italic bg-orange-50 border border-orange-100 rounded px-2 py-1 text-orange-800">
                "{log.reason}"
              </div>
            )}

            <div className="space-y-1 text-xs">
              {itemsAdded.map((it: any, i: number) => (
                <div key={`a${i}`} className="flex items-center gap-1 text-green-700">
                  <Plus className="size-3" />
                  Adicionou {Number(it.quantity)}× {it.name} ({brl(Number(it.unit_price))})
                </div>
              ))}
              {itemsRemoved.map((it: any, i: number) => (
                <div key={`r${i}`} className="flex items-center gap-1 text-red-700">
                  <Minus className="size-3" />
                  Removeu {Number(it.quantity)}× {it.name} ({brl(Number(it.unit_price))})
                </div>
              ))}
              {itemsChanged.map((it: any, i: number) => (
                <div key={`c${i}`} className="flex items-center gap-1 text-amber-700">
                  <ArrowRight className="size-3" />
                  {it.name}: qtd {Number(it.qty_before)} → {Number(it.qty_after)}
                  {Number(it.price_before) !== Number(it.price_after) && (
                    <> · preço {brl(Number(it.price_before))} → {brl(Number(it.price_after))}</>
                  )}
                </div>
              ))}

              {totalChanged && (
                <div className="flex items-center gap-1 text-foreground">
                  <ArrowRight className="size-3" />
                  Total: {brl(Number(totals.before.total))} → <strong>{brl(Number(totals.after.total))}</strong>
                </div>
              )}

              {customerChanged && (
                <div className="flex items-center gap-1 text-foreground">
                  <ArrowRight className="size-3" />
                  Cliente: {d.customer.before_name || "Consumidor final"} → {d.customer.after_name || "Consumidor final"}
                </div>
              )}

              {paymentChanged && (
                <div className="flex items-center gap-1 text-foreground">
                  <ArrowRight className="size-3" />
                  Pagamento: {d.payment.before || "—"} → {d.payment.after || "—"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
