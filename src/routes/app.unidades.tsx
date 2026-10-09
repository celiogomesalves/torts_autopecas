import { makePrefetchLoader } from "@/lib/route-prefetch";
import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import { fetchUnits, fetchProducts, createUnit, updateUnit, deleteUnit } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Ruler, Pencil, Check, X } from "lucide-react";
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
import type { Unit } from "@/lib/db-types";
import { PrintButton } from "@/components/print-button";
import { printList } from "@/lib/print-list";

import { SearchInput } from "@/components/search-input";
import { matchSearch } from "@/lib/utils";

export const Route = createFileRoute("/app/unidades")({
  loader: makePrefetchLoader(["units"]),
  component: UnitsPage,
});

function UnitsPage() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();

  const unitsQ = useQuery({
    queryKey: ["units", cid],
    queryFn: () => fetchUnits(cid),
    enabled: !!cid,
  });
  const productsQ = useQuery({
    queryKey: ["products", cid],
    queryFn: () => fetchProducts(cid),
    enabled: !!cid,
  });

  const handlePrint = () => {
    printList({
      title: "Unidades de Medida",
      columns: [
        { header: "Sigla", accessor: (u: Unit) => u.abbreviation, width: "20%" },
        { header: "Descrição", accessor: (u: Unit) => u.description },
        {
          header: "Produtos",
          accessor: (u: Unit) => products.filter((p: any) => p.unit_id === u.id).length,
          align: "right",
          width: "15%",
        },
      ],
      rows: filtered,
    });
  };

  const [abbreviation, setAbbreviation] = useState("");
  const [description, setDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAbbr, setEditAbbr] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Unit | null>(null);

  const addMut = useMutation({
    mutationFn: () =>
      createUnit(cid, { abbreviation: abbreviation.trim(), description: description.trim() }),
    onSuccess: () => {
      toast.success("Sucesso! Unidade criada.");
      setAbbreviation("");
      setDescription("");
      qc.invalidateQueries({ queryKey: ["units", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      abbreviation,
      description,
    }: {
      id: string;
      abbreviation: string;
      description: string;
    }) => updateUnit(id, { abbreviation, description }),
    onSuccess: () => {
      toast.success("Sucesso! Unidade atualizada.");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["units", cid] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: deleteUnit,
    onSuccess: () => {
      toast.success("Sucesso! Unidade excluída.");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["units", cid] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setDeleteTarget(null);
    },
  });

  const units = unitsQ.data ?? [];
  const products = productsQ.data ?? [];

  const [search, setSearch] = useState("");
  const filtered = units.filter(
    (u) => matchSearch(u.abbreviation, search) || matchSearch(u.description, search),
  );

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const startEdit = (u: Unit) => {
    setEditingId(u.id);
    setEditAbbr(u.abbreviation);
    setEditDesc(u.description);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditAbbr("");
    setEditDesc("");
  };

  const saveEdit = (id: string) => {
    if (!editAbbr.trim() || !editDesc.trim()) {
      toast.error("Sigla e descrição são obrigatórias.");
      return;
    }
    updateMut.mutate({ id, abbreviation: editAbbr.trim(), description: editDesc.trim() });
  };

  const requestDelete = (u: Unit) => {
    if (u.abbreviation.toUpperCase() === "UN") {
      toast.error(
        'A unidade padrão "UN — Unidade" não pode ser excluída, pois é usada como padrão para novos produtos.',
      );
      return;
    }
    const count = products.filter((p) => (p as any).unit_id === u.id).length;
    if (count > 0) {
      toast.error(
        `Não é possível excluir "${u.abbreviation}": existem ${count} produto(s) vinculado(s) a esta unidade.`,
      );
      return;
    }
    setDeleteTarget(u);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading
          icon={Ruler}
          title="Unidades de Medida"
          subtitle="Cadastre as unidades de medida usadas nos seus produtos (ex: UN — Unidade, KG — Quilograma)"
        />
        <PrintButton onClick={handlePrint} disabled={units.length === 0} />
      </div>

      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (abbreviation.trim() && description.trim()) addMut.mutate();
            else toast.error("Informe sigla e descrição");
          }}
          className="grid gap-3 sm:grid-cols-[140px_1fr_auto] items-end"
        >
          <div className="space-y-2">
            <Label>Sigla</Label>
            <Input
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value.toUpperCase())}
              placeholder="UN"
              maxLength={10}
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Unidade, Quilograma, Litro"
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
        placeholder="Pesquisar unidades..."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {units.length === 0 && !unitsQ.isLoading && (
          <p className="text-sm text-muted-foreground">Nenhuma unidade cadastrada ainda.</p>
        )}
        {unitsQ.isLoading && <p>Carregando...</p>}
        {units.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma unidade encontrada para "{search}".
          </p>
        )}
        {paginated.map((u) => {
          const count = products.filter((p) => (p as any).unit_id === u.id).length;
          const isDefault = u.abbreviation.toUpperCase() === "UN";
          const isEditing = editingId === u.id;
          return (
            <Card key={u.id} className="p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="size-9 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center shrink-0">
                  <Ruler className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div className="grid grid-cols-[80px_1fr] gap-2">
                      <Input
                        value={editAbbr}
                        onChange={(e) => setEditAbbr(e.target.value.toUpperCase())}
                        className="h-8"
                        maxLength={10}
                      />
                      <Input
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit(u.id);
                          if (e.key === "Escape") cancelEdit();
                        }}
                        autoFocus
                        className="h-8"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="font-medium truncate">
                        <span className="font-semibold">{u.abbreviation}</span>
                        <span className="text-muted-foreground"> — {u.description}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{count} produto(s)</div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {isEditing ? (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => saveEdit(u.id)}
                      disabled={updateMut.isPending}
                    >
                      <Check className="size-4 text-brand-green" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={cancelEdit}>
                      <X className="size-4 text-muted-foreground" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="icon" onClick={() => startEdit(u)}>
                      <Pencil className="size-4 text-brand-orange" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => requestDelete(u)}
                      disabled={count > 0 || isDefault}
                      title={
                        isDefault
                          ? 'Unidade padrão "UN" não pode ser excluída'
                          : count > 0
                            ? "Existem produtos vinculados"
                            : "Excluir"
                      }
                    >
                      <Trash2
                        className={`size-4 ${count > 0 || isDefault ? "text-muted-foreground/50" : "text-brand-red"}`}
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
            <AlertDialogTitle>Excluir unidade</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a unidade{" "}
              <strong>
                "{deleteTarget?.abbreviation} — {deleteTarget?.description}"
              </strong>
              ? Esta ação não pode ser desfeita.
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
