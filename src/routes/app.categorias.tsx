import { makePrefetchLoader } from "@/lib/route-prefetch";
import { PageHeading } from "@/components/page-header";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import {
  fetchCategories,
  fetchProducts,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/db";
import { lookupNcmByCategory } from "@/lib/ncm-lookup.functions";
import { NcmInfoButton } from "@/components/ncm-info-button";
import { findSimilarNames, normalizeName } from "@/lib/string-similarity";
import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Tags, Pencil, Check, X, Sparkles, Loader2 } from "lucide-react";
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
  loader: makePrefetchLoader(["categories"]),
  component: CategoriesPage,
});

type Category = { id: string; name: string; ncm: string | null };

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
  const [ncm, setNcm] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingNcm, setEditingNcm] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [lookupBusy, setLookupBusy] = useState<"new" | "edit" | null>(null);
  const lookupNcm = useServerFn(lookupNcmByCategory);
  const confirm = useConfirm();

  const addMut = useMutation({
    mutationFn: () => createCategory(cid, name.trim(), undefined, undefined, ncm.trim() || null),
    onSuccess: () => {
      toast.success("Sucesso! Categoria criada.");
      setName("");
      setNcm("");
      qc.invalidateQueries({ queryKey: ["categories", cid] });
    },
    onError: (e: any) => {
      if (isDuplicateError(e)) toast.error(duplicateMessage("categoria"));
      else toast.error(e.message);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, name, ncm }: { id: string; name: string; ncm: string | null }) =>
      updateCategory(id, name, undefined, ncm),
    onSuccess: () => {
      toast.success("Sucesso! Categoria atualizada.");
      setEditingId(null);
      setEditingName("");
      setEditingNcm("");
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
    setEditingNcm(c.ncm || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingNcm("");
  };

  const saveEdit = async (id: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      toast.error("O nome não pode ficar vazio.");
      return;
    }
    const ncmTrim = editingNcm.trim();
    if (ncmTrim.length !== 8) {
      toast.error("Informe o NCM (8 dígitos). Use 'Buscar NCM' se não souber.");
      return;
    }
    if (isExactDuplicate(trimmed, id)) {
      toast.error(duplicateMessage("categoria"));
      return;
    }
    const sim = findSimilarNames(trimmed, categories, { excludeId: id });
    if (sim.length > 0) {
      const ok = await confirm({
        title: "Possível duplicidade",
        description: `Existem categorias parecidas: ${sim
          .slice(0, 3)
          .map((s) => `"${s.name}"`)
          .join(", ")}. Salvar mesmo assim?`,
        confirmLabel: "Salvar",
        variant: "default",
      });
      if (!ok) return;
    }
    updateMut.mutate({ id, name: trimmed, ncm: ncmTrim });
  };

  // Categorias com nome idêntico (após normalização) — usado para bloquear duplicidade.
  const isExactDuplicate = (n: string, ignoreId?: string | null) => {
    const target = normalizeName(n);
    return categories.some((c) => c.id !== ignoreId && normalizeName(c.name) === target);
  };

  const similarNew = useMemo(
    () => (name.trim() ? findSimilarNames(name, categories) : []),
    [name, categories],
  );

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (ncm.trim().length !== 8) {
      toast.error("Informe o NCM (8 dígitos). Use 'Buscar NCM' se não souber.");
      return;
    }
    if (isExactDuplicate(trimmed)) {
      toast.error(duplicateMessage("categoria"));
      return;
    }
    if (similarNew.length > 0) {
      const ok = await confirm({
        title: "Possível duplicidade",
        description: `Já existe(m) categoria(s) parecida(s): ${similarNew
          .slice(0, 3)
          .map((s) => `"${s.name}"`)
          .join(", ")}. Deseja cadastrar mesmo assim?`,
        confirmLabel: "Cadastrar",
        variant: "default",
      });
      if (!ok) return;
    }
    addMut.mutate();
  };

  const handleLookup = async (
    target: "new" | "edit",
    catName: string,
    setNcmFn: (v: string) => void,
  ) => {
    const trimmed = catName.trim();
    if (!trimmed) {
      toast.error("Informe o nome da categoria primeiro.");
      return;
    }
    setLookupBusy(target);
    try {
      const r = await lookupNcm({ data: { categoryName: trimmed, companyId: cid } });
      if (r.found && r.ncm) {
        setNcmFn(r.ncm);
        toast.success(`NCM encontrado: ${r.ncm}`, {
          description: r.description ?? "Confira se confere com o produto.",
        });
      } else {
        toast.warning("NCM não encontrado", {
          description:
            r.reason ??
            "Revise o nome da categoria (seja mais específico) ou informe o NCM manualmente.",
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na consulta de NCM.");
    } finally {
      setLookupBusy(null);
    }
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
        <PageHeading icon={Tags} title="Categorias" subtitle={`${filtered.length} cadastrado(s)`} />
        <PrintButton onClick={handlePrint} disabled={categories.length === 0} />
      </div>

      <Card className="p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAdd();
          }}
          className="grid gap-3 sm:grid-cols-[1fr_220px_auto] items-end"
        >
          <div className="space-y-2">
            <Label>Nova categoria</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              placeholder="Ex: FILTROS"
              required
            />
            {similarNew.length > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Semelhante a:{" "}
                {similarNew
                  .slice(0, 3)
                  .map((s) => s.name)
                  .join(", ")}
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              NCM <span className="text-destructive">*</span>
              <NcmInfoButton />
            </Label>
            <div className="flex gap-1">
              <Input
                value={ncm}
                onChange={(e) => setNcm(e.target.value.replace(/\D/g, "").slice(0, 8))}
                placeholder="00000000"
                inputMode="numeric"
                maxLength={8}
                required
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                title="Buscar NCM por IA"
                disabled={lookupBusy === "new" || !name.trim()}
                onClick={() => handleLookup("new", name, setNcm)}
              >
                {lookupBusy === "new" ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
              </Button>
            </div>
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
                    <div className="space-y-2">
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
                      <div className="flex gap-1">
                        <Input
                          value={editingNcm}
                          onChange={(e) =>
                            setEditingNcm(e.target.value.replace(/\D/g, "").slice(0, 8))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveEdit(c.id);
                            if (e.key === "Escape") cancelEdit();
                          }}
                          placeholder="NCM (obrigatório)"
                          inputMode="numeric"
                          maxLength={8}
                          className="h-8"
                          required
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 shrink-0"
                          title="Buscar NCM por IA"
                          disabled={lookupBusy === "edit" || !editingName.trim()}
                          onClick={() => handleLookup("edit", editingName, setEditingNcm)}
                        >
                          {lookupBusy === "edit" ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="font-medium truncate">{c.name.toUpperCase()}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                        <span>{count} produto(s)</span>
                        {c.ncm && (
                          <span className="inline-flex items-center rounded-sm bg-brand-green/10 text-brand-green px-1.5 py-0.5 text-[10px] font-medium tracking-wide">
                            NCM {c.ncm}
                          </span>
                        )}
                      </div>
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
