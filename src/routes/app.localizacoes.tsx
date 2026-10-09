import { makePrefetchLoader } from "@/lib/route-prefetch";
import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchStockLocations,
  fetchProducts,
  createStockLocation,
  updateStockLocation,
  deleteStockLocation,
} from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, MapPin, Pencil, Check, X } from "lucide-react";
import { SmartPagination } from "@/components/smart-pagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { StockLocation } from "@/lib/db-types";
import { PrintButton } from "@/components/print-button";
import { printList } from "@/lib/print-list";

import { SearchInput } from "@/components/search-input";
import { matchSearch } from "@/lib/utils";

export const Route = createFileRoute("/app/localizacoes")({
  loader: makePrefetchLoader(["locations"]),
  component: LocalizacoesPage,
});

function LocalizacoesPage() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();

  const locsQ = useQuery({
    queryKey: ["stock_locations", cid],
    queryFn: () => fetchStockLocations(cid),
    enabled: !!cid,
  });

  const productsQ = useQuery({
    queryKey: ["products", cid],
    queryFn: () => fetchProducts(cid),
    enabled: !!cid,
  });

  const handlePrint = () => {
    printList({
      title: "Localizações de Estoque",
      subtitle: "Lista de localizações cadastradas",
      columns: [
        { header: "Nome", accessor: (l: StockLocation) => l.name },
        {
          header: "Produtos",
          accessor: (l: StockLocation) => products.filter((p) => p.location_id === l.id).length,
          align: "right",
          width: "20%",
        },
      ],
      rows: filtered,
    });
  };

  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<StockLocation | null>(null);

  const addMut = useMutation({
    mutationFn: () => createStockLocation(cid, name.trim()),
    onSuccess: () => {
      toast.success("Sucesso! Localização criada.");
      setName("");
      qc.invalidateQueries({ queryKey: ["stock_locations", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateStockLocation(id, { name }),
    onSuccess: () => {
      toast.success("Sucesso! Localização atualizada.");
      setEditingId(null);
      setEditingName("");
      qc.invalidateQueries({ queryKey: ["stock_locations", cid] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: deleteStockLocation,
    onSuccess: () => {
      toast.success("Sucesso! Localização excluída.");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["stock_locations", cid] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setDeleteTarget(null);
    },
  });

  const locations = locsQ.data ?? [];
  const products = productsQ.data ?? [];

  const [search, setSearch] = useState("");
  const filtered = locations.filter((l) => matchSearch(l.name, search));

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const startEdit = (l: StockLocation) => {
    setEditingId(l.id);
    setEditingName(l.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const saveEdit = (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error("O nome não pode ficar vazio.");
      return;
    }
    updateMut.mutate({ id, name: trimmed });
  };

  const requestDelete = (l: StockLocation) => {
    const count = products.filter((p) => p.location_id === l.id).length;
    if (count > 0) {
      toast.error(
        `Não é possível excluir "${l.name}": existem ${count} produto(s) vinculado(s) a esta localização.`,
      );
      return;
    }
    setDeleteTarget(l);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          icon={MapPin}
          title="Localizações"
          subtitle="Gerencie os locais onde seus produtos são armazenados"
        />
        <PrintButton onClick={handlePrint} disabled={locations.length === 0} />
      </div>

      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) addMut.mutate();
          }}
          className="grid gap-3 sm:grid-cols-[1fr_auto] items-end"
        >
          <div className="space-y-2">
            <Label>Nova localização</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="Ex: PRATELEIRA A1"
            />
          </div>
          <Button
            type="submit"
            disabled={addMut.isPending}
            className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground w-full sm:w-auto"
          >
            <Plus className="size-4 mr-2" /> Adicionar
          </Button>
        </form>
      </Card>

      <SearchInput
        value={search}
        onChange={(v) => {
          setSearch(v);
          setCurrentPage(1);
        }}
        placeholder="Pesquisar localizações..."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locations.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma localização criada ainda.</p>
        )}
        {locations.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma localização encontrada para "{search}".
          </p>
        )}
        {paginated.map((l) => {
          const count = products.filter((p) => p.location_id === l.id).length;
          const isEditing = editingId === l.id;
          return (
            <Card key={l.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center shrink-0">
                  <MapPin className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-0.5">Descrição</div>
                  {isEditing ? (
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(l.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      autoFocus
                      className="h-8"
                    />
                  ) : (
                    <>
                      <div className="font-medium truncate">{l.name}</div>
                      <div className="text-xs text-muted-foreground">{count} produto(s)</div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-end gap-1 shrink-0 border-t pt-2">
                {isEditing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => saveEdit(l.id)}
                      disabled={updateMut.isPending}
                      className="h-9 w-9"
                    >
                      <Check className="size-4 text-brand-green" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={cancelEdit} className="h-9 w-9">
                      <X className="size-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => startEdit(l)}
                      className="h-9 w-9"
                    >
                      <Pencil className="size-4 text-brand-orange" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => requestDelete(l)}
                      disabled={count > 0}
                      title={
                        count > 0 ? "Existem produtos vinculados a esta localização" : "Excluir"
                      }
                      className="h-9 w-9"
                    >
                      <Trash2
                        className={`size-4 ${count > 0 ? "text-muted-foreground/50" : "text-brand-red"}`}
                      />
                    </Button>
                  </>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-center">
          <SmartPagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
          />
        </div>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir localização</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a localização <strong>"{deleteTarget?.name}"</strong>?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && delMut.mutate(deleteTarget.id)}
              className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
