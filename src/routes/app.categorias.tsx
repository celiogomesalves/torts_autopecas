import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";
import {
  fetchCategories,
  fetchProducts,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Tags, Pencil, Check, X } from "lucide-react";
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
import { PrintButton } from "@/components/print-button";
import { printList } from "@/lib/print-list";

import { SearchInput } from "@/components/search-input";
import { matchSearch, isDuplicateError, duplicateMessage } from "@/lib/utils";

export const Route = createFileRoute("/app/categorias")({
  component: CategoriesPage,
});

type Category = { id: string; name: string };

function CategoriesPage() {
  const { currentCompanyId } = useAuth();
  const cid = currentCompanyId!;
  const qc = useQueryClient();

  const catsQ = useQuery({
    queryKey: ["categories", cid],
    queryFn: () => fetchCategories(cid),
    enabled: !!cid,
  });
  const productsQ = useQuery({
    queryKey: ["products", cid],
    queryFn: () => fetchProducts(cid),
    enabled: !!cid,
  });

  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);

  const addMut = useMutation({
    mutationFn: () => createCategory(cid, name.trim()),
    onSuccess: () => {
      toast.success("Sucesso! Categoria criada.");
      setName("");
      qc.invalidateQueries({ queryKey: ["categories", cid] });
    },
    onError: (e: any) => {
      if (isDuplicateError(e)) toast.error(duplicateMessage("categoria"));
      else toast.error(e.message);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateCategory(id, name),
    onSuccess: () => {
      toast.success("Sucesso! Categoria atualizada.");
      setEditingId(null);
      setEditingName("");
      qc.invalidateQueries({ queryKey: ["categories", cid] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
    },
    onError: (e: any) => {
      if (isDuplicateError(e)) toast.error(duplicateMessage("categoria"));
      else toast.error(e.message);
    },
  });

  const delMut = useMutation({
    mutationFn: deleteCategory,
    onSuccess: () => {
      toast.success("Sucesso! Categoria excluída.");
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["categories", cid] });
      qc.invalidateQueries({ queryKey: ["products", cid] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      setDeleteTarget(null);
    },
  });

  const categories = catsQ.data ?? [];
  const products = productsQ.data ?? [];

  const [search, setSearch] = useState("");
  const filtered = categories
    .filter((c) => matchSearch(c.name, search))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" }));

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 100;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handlePrint = () => {
    printList({
      title: "Categorias",
      subtitle: "Lista de categorias cadastradas",
      columns: [
        { header: "Nome", accessor: (c: Category) => c.name },
        {
          header: "Produtos",
          accessor: (c: Category) => products.filter((p) => p.category_id === c.id).length,
          align: "right",
          width: "20%",
        },
      ],
      rows: filtered,
    });
  };

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setEditingName(c.name);
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

  const requestDelete = (c: Category) => {
    const count = products.filter((p) => p.category_id === c.id).length;
    if (count > 0) {
      toast.error(
        `Não é possível excluir "${c.name}": existem ${count} produto(s) vinculado(s) a esta categoria.`,
      );
      return;
    }
    setDeleteTarget(c);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeading icon={Tags} title="Categorias" subtitle="Organize seus produtos por tipo" />
        <PrintButton onClick={handlePrint} disabled={categories.length === 0} />
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
            <Label>Nova categoria</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="Ex: FILTROS"
              required
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
        placeholder="Pesquisar categorias..."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma categoria criada ainda.</p>
        )}
        {categories.length > 0 && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma categoria encontrada para "{search}".
          </p>
        )}
        {paginated.map((c) => {
          const count = products.filter((p) => p.category_id === c.id).length;
          const isEditing = editingId === c.id;
          return (
            <Card key={c.id} className="p-4 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <div className="size-9 rounded-lg bg-brand-orange/15 text-brand-orange flex items-center justify-center shrink-0">
                  <Tags className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-muted-foreground mb-0.5">Descrição</div>
                  {isEditing ? (
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value.toUpperCase())}
                      required
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(c.id);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      autoFocus
                      className="h-8"
                    />
                  ) : (
                    <>
                      <div className="font-medium truncate">{c.name.toUpperCase()}</div>
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
                      onClick={() => saveEdit(c.id)}
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
                      onClick={() => startEdit(c)}
                      className="h-9 w-9"
                    >
                      <Pencil className="size-4 text-brand-orange" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => requestDelete(c)}
                      disabled={count > 0}
                      title={count > 0 ? "Existem produtos vinculados a esta categoria" : "Excluir"}
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
            <AlertDialogTitle>Excluir categoria</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a categoria{" "}
              <strong>"{deleteTarget?.name.toUpperCase()}"</strong>? Esta ação não pode ser
              desfeita.
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
