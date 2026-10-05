import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Plus, Minus, Search } from "lucide-react";
import { brl, parseCurrencyInput, formatCurrencyInput } from "@/lib/format";
import { toast } from "sonner";

interface CartItem {
  product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price: number;
  stock: number;
}

interface EditSaleDialogProps {
  sale: any;
  isOpen: boolean;
  onClose: () => void;
  onSave: (items: CartItem[], discount: number, reason: string) => void;
  products: any[];
}

export function EditSaleDialog({ sale, isOpen, onClose, onSave, products }: EditSaleDialogProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [discountRaw, setDiscountRaw] = useState("0,00");

  useEffect(() => {
    if (sale) {
      setItems(sale.items || []);
      setDiscountRaw(formatCurrencyInput(String(sale.discount || 0)));
    }
  }, [sale]);

  const updateQuantity = (productId: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.product_id === productId) {
          const newQty = Math.max(0.1, item.quantity + delta);
          if (newQty > item.stock) {
            toast.error("Estoque insuficiente");
            return item;
          }
          return { ...item, quantity: newQty };
        }
        return item;
      }),
    );
  };

  const removeItem = (productId: string) => {
    setItems((prev) => prev.filter((item) => item.product_id !== productId));
  };

  const subtotal = items.reduce((acc, item) => acc + item.quantity * item.unit_price, 0);
  const discount = Math.min(parseCurrencyInput(discountRaw), subtotal);
  const total = Math.max(subtotal - discount, 0);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Itens da Venda {sale?.number ? `#${sale.number}` : ""}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produto</TableHead>
                <TableHead className="w-32 text-center">Quantidade</TableHead>
                <TableHead className="w-32 text-right">Preço</TableHead>
                <TableHead className="w-32 text-right">Total</TableHead>
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.product_id}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    <div className="text-xs text-muted-foreground">{item.sku}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.product_id, -1)}
                      >
                        <Minus className="size-3" />
                      </Button>
                      <span className="text-sm w-8 text-center">{item.quantity}</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => updateQuantity(item.product_id, 1)}
                      >
                        <Plus className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{brl(item.unit_price)}</TableCell>
                  <TableCell className="text-right">
                    {brl(item.quantity * item.unit_price)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeItem(item.product_id)}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="grid grid-cols-2 gap-4 border-t pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Desconto</label>
              <Input
                value={discountRaw}
                onChange={(e) => {
                  const val = parseCurrencyInput(e.target.value);
                  if (val > subtotal) {
                    setDiscountRaw(formatCurrencyInput(String(subtotal)));
                    toast.warning(`Desconto limitado ao subtotal: ${brl(subtotal)}`);
                  } else {
                    setDiscountRaw(formatCurrencyInput(e.target.value));
                  }
                }}
                className="text-right"
              />
            </div>
            <div className="space-y-1 text-right">
              <div className="text-sm text-muted-foreground">Subtotal: {brl(subtotal)}</div>
              {discount > 0 && (
                <div className="text-sm text-muted-foreground">Desconto: - {brl(discount)}</div>
              )}
              <div className="text-lg font-bold">Total: {brl(total)}</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            onClick={() => onSave(items, discount, sale?.editReason || "")}
            disabled={items.length === 0}
          >
            Salvar Alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
