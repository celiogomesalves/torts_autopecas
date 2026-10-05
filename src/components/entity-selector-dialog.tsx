import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Check, Plus, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn, normalize, compareProductNames } from "@/lib/utils";

interface Item {
  id: string;
  name: string;
}

interface EntitySelectorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: Item[];
  selectedId?: string | null;
  onSelect: (id: string) => void;
  onCreateNew?: () => void;
  emptyMessage?: string;
  allowClear?: boolean;
  clearLabel?: string;
}

export function EntitySelectorDialog({
  open,
  onOpenChange,
  title,
  items,
  selectedId,
  onSelect,
  onCreateNew,
  emptyMessage = "Nenhum registro encontrado",
  allowClear = false,
  clearLabel = "Sem seleção",
}: EntitySelectorDialogProps) {
  const [search, setSearch] = useState("");
  const qc = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await qc.refetchQueries();
      toast.success("Lista atualizada!");
    } catch (e) {
      toast.error("Erro ao atualizar.");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (open) setSearch("");
  }, [open]);

  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) => compareProductNames(a.name, b.name));
    const term = normalize(search.trim());
    if (!term) return sorted;
    return sorted.filter((i) => normalize(i.name).includes(term));
  }, [items, search]);

  const handlePick = (id: string) => {
    onSelect(id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Atualizar lista"
          >
            <RefreshCw className={cn("size-4", isRefreshing && "animate-spin")} />
          </Button>
        </div>

        {onCreateNew && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 text-brand-red border-brand-red/30 hover:bg-brand-red/10 hover:text-brand-red"
            onClick={() => {
              onOpenChange(false);
              onCreateNew();
            }}
          >
            <Plus className="size-4" /> Cadastrar novo
          </Button>
        )}

        <div className="flex-1 overflow-y-auto -mx-6 px-6 border-t">
          {allowClear && (
            <button
              type="button"
              onClick={() => handlePick("none")}
              className={cn(
                "w-full text-left px-3 py-2.5 rounded-md text-sm flex items-center justify-between hover:bg-muted/60 transition-colors italic text-muted-foreground",
                (!selectedId || selectedId === "none") && "bg-muted",
              )}
            >
              {clearLabel}
              {(!selectedId || selectedId === "none") && (
                <Check className="size-4 text-brand-red" />
              )}
            </button>
          )}

          {filtered.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-8">{emptyMessage}</div>
          ) : (
            filtered.map((item) => {
              const isSelected = item.id === selectedId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handlePick(item.id)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-md text-sm flex items-center justify-between hover:bg-muted/60 transition-colors",
                    isSelected && "bg-brand-red/10 text-brand-red font-medium",
                  )}
                >
                  <span className="truncate">{item.name}</span>
                  {isSelected && <Check className="size-4 shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        <div className="text-xs text-muted-foreground text-center pt-1 border-t">
          {filtered.length} de {items.length} registro(s)
        </div>
      </DialogContent>
    </Dialog>
  );
}
