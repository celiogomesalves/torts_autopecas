import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createProduct,
  fetchCategories,
  fetchBrands,
  fetchStockLocations,
  fetchUnits,
} from "@/lib/db";
import { supabase as db } from "@/integrations/supabase/client";
import { maskCurrency, parseCurrency } from "@/lib/masks";
import { isDuplicateError, duplicateMessage } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  userId?: string;
  /** Localização sugerida (ex.: equipe da contagem). */
  defaultLocationId?: string | null;
  /** Quando informado, marca o item da contagem aberta como verificado após o cadastro. */
  countId?: string | null;
  onCreated?: (productId: string) => void;
}

export function QuickProductDialog({
  open,
  onOpenChange,
  companyId,
  userId,
  defaultLocationId,
  countId,
  onCreated,
}: Props) {
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sku, setSku] = useState("");
  const [brandId, setBrandId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [unit, setUnit] = useState<string>("UN");
  const [costPrice, setCostPrice] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [stock, setStock] = useState("0");
  const [minStock, setMinStock] = useState("0");
  const [ncm, setNcm] = useState("");

  const categoriesQ = useQuery({
    queryKey: ["categories", companyId],
    queryFn: () => fetchCategories(companyId),
    enabled: !!companyId && open,
  });
  const brandsQ = useQuery({
    queryKey: ["brands", companyId],
    queryFn: () => fetchBrands(companyId),
    enabled: !!companyId && open,
  });
  const locationsQ = useQuery({
    queryKey: ["stock_locations", companyId],
    queryFn: () => fetchStockLocations(companyId),
    enabled: !!companyId && open,
  });
  const unitsQ = useQuery({
    queryKey: ["units", companyId],
    queryFn: () => fetchUnits(companyId),
    enabled: !!companyId && open,
  });

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setSku("");
      setBrandId("");
      setCategoryId("");
      setLocationId(defaultLocationId || "");
      setUnit("UN");
      setCostPrice("");
      setSalePrice("");
      setStock("0");
      setMinStock("0");
      setNcm("");
    }
  }, [open, defaultLocationId]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Informe o nome do produto.");
      if (!sku.trim()) throw new Error("Informe o código (SKU).");
      const ncmDigits = ncm.replace(/\D/g, "");
      if (ncmDigits.length !== 8 || ncmDigits === "00000000") {
        throw new Error("Informe um NCM válido com 8 dígitos.");
      }

      if (!locationId) throw new Error("Selecione a localização no estoque.");

      const product = await createProduct(companyId, {
        sku: sku.trim(),
        name: name.trim().toUpperCase(),
        description: description.trim() || null,
        brand_id: brandId || null,
        category_id: categoryId || null,
        location_id: locationId || null,
        unit: unit || "UN",
        cost_price: parseCurrency(costPrice) || 0,
        sale_price: parseCurrency(salePrice) || 0,
        stock: Number(stock) || 0,
        min_stock: Number(minStock) || 0,
        ncm: ncmDigits,
        userId,
      });

      // Se houver uma contagem aberta, createProduct já criou o item.
      // Marcamos como verificado para já entrar contabilizado.
      if (countId) {
        await db
          .from("stock_count_items")
          .update({ verified: true, verified_at: new Date().toISOString() })
          .eq("count_id", countId)
          .eq("product_id", product.id);
      }

      return product;
    },
    onSuccess: (product) => {
      toast.success("Produto cadastrado e adicionado à contagem.");
      qc.invalidateQueries({ queryKey: ["products-paginated"] });
      qc.invalidateQueries({ queryKey: ["products", companyId] });
      qc.invalidateQueries({ queryKey: ["stock_count_items"] });
      onCreated?.(product.id);
      onOpenChange(false);
    },
    onError: (e: Error) => {
      if (isDuplicateError(e)) {
        toast.error(duplicateMessage("produto"));
      } else {
        toast.error(e.message || "Erro ao cadastrar produto.");
      }
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo produto na contagem</DialogTitle>
          <DialogDescription>
            Cadastro rápido. O produto será adicionado à contagem em andamento já como verificado.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate();
          }}
          className="grid gap-4 sm:grid-cols-2"
        >
          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="qp-name">Nome *</Label>
            <Input
              id="qp-name"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              autoFocus
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="qp-sku">Código / SKU *</Label>
            <Input id="qp-sku" value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label>Unidade</Label>
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(unitsQ.data || []).map((u) => (
                  <SelectItem key={u.id} value={u.abbreviation}>
                    {u.abbreviation} — {u.description}
                  </SelectItem>
                ))}
                {(unitsQ.data || []).length === 0 && <SelectItem value="UN">UN</SelectItem>}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Marca</Label>
            <Select
              value={brandId || "none"}
              onValueChange={(v) => setBrandId(v === "none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sem marca —</SelectItem>
                {(brandsQ.data || []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label>Categoria</Label>
            <Select
              value={categoryId || "none"}
              onValueChange={(v) => {
                const nextId = v === "none" ? "" : v;
                setCategoryId(nextId);
                const categoryNcm = String(
                  (categoriesQ.data || []).find((c) => c.id === nextId)?.ncm || "",
                ).replace(/\D/g, "");
                if (categoryNcm.length === 8) setNcm(categoryNcm);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sem categoria —</SelectItem>
                {(categoriesQ.data || []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="qp-ncm">NCM *</Label>
            <Input
              id="qp-ncm"
              value={ncm}
              onChange={(e) => setNcm(e.target.value.replace(/\D/g, "").slice(0, 8))}
              inputMode="numeric"
              maxLength={8}
              required
            />
          </div>

          <div className="sm:col-span-2 space-y-1">
            <Label>Localização *</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {(locationsQ.data || []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="sm:col-span-2 space-y-1">
            <Label htmlFor="qp-desc">Descrição</Label>
            <Textarea
              id="qp-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Preço de custo</Label>
            <Input
              value={costPrice}
              onChange={(e) => setCostPrice(maskCurrency(e.target.value))}
              inputMode="numeric"
            />
          </div>

          <div className="space-y-1">
            <Label>Preço de venda</Label>
            <Input
              value={salePrice}
              onChange={(e) => setSalePrice(maskCurrency(e.target.value))}
              inputMode="numeric"
            />
          </div>

          <div className="space-y-1">
            <Label>Estoque atual</Label>
            <Input
              type="number"
              min={0}
              step="any"
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label>Estoque mínimo</Label>
            <Input
              type="number"
              min={0}
              step="any"
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
            />
          </div>

          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saveMut.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saveMut.isPending}>
              {saveMut.isPending ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" /> Salvando…
                </>
              ) : (
                "Salvar e verificar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
