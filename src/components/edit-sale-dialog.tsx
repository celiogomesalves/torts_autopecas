import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Trash2, Plus, Minus, AlertTriangle } from "lucide-react";
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

export interface EditSalePayload {
  items: CartItem[];
  discount: number;
  reason: string;
  customer_id: string | null;
  payment_method: string | null;
  due_date: string | null;
  notes: string | null;
}

interface EditSaleDialogProps {
  sale: any;
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: EditSalePayload) => void;
  products: any[];
  partners?: { id: string; name: string }[];
  paymentMethods?: { id: string; name: string; requires_due_date?: boolean }[];
  isSaving?: boolean;
}

export function EditSaleDialog({
  sale,
  isOpen,
  onClose,
  onSave,
  products: _products,
  partners = [],
  paymentMethods = [],
  isSaving,
}: EditSaleDialogProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [discountRaw, setDiscountRaw] = useState("0,00");
  const [customerId, setCustomerId] = useState<string>("none");
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (sale) {
      setItems(sale.items || []);
      setDiscountRaw(formatCurrencyInput(String(sale.discount || 0)));
      setCustomerId(sale.customer_id || "none");
      setPaymentMethod(sale.payment_method || "");
      setDueDate(sale.due_date || "");
      setNotes((sale.notes || "").replace(/^Edição:\s*/, ""));
      setReason("");
    }
  }, [sale]);

  const selectedMethod = useMemo(
    () => paymentMethods.find((m) => m.name === paymentMethod),
    [paymentMethods, paymentMethod],
  );

  const updateQuantity = (productId: string, delta: number) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.product_id === productId) {
          const newQty = Math.max(0.1, item.quantity + delta);
          if (newQty > item.stock + item.quantity) {
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

  const requiresDueDate = selectedMethod?.requires_due_date;
  const canSave =
    items.length > 0 &&
    reason.trim().length >= 3 &&
    (!requiresDueDate || !!dueDate);

  return (
    <Dialog open={isOpen} onOpenChange={(o) => !o && !isSaving && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Editar Venda {sale?.number ? `#${sale.number}` : ""}
          </DialogTitle>
          <DialogDescription>
            Alterações geram auditoria e ajustes automáticos em estoque, caixa e financeiro.
          </DialogDescription>
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
              <Label>Cliente</Label>
              <Select value={customerId} onValueChange={setCustomerId}>
                <SelectTrigger>
                  <SelectValue placeholder="Consumidor final" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Consumidor final</SelectItem>
                  {partners.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethods.map((m) => (
                    <SelectItem key={m.id} value={m.name}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Desconto</Label>
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

            <div className="space-y-2">
              <Label>Vencimento {requiresDueDate && <span className="text-destructive">*</span>}</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label>Observações</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Observações da venda"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label>
                Motivo da edição <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Descreva por que esta venda está sendo alterada (mín. 3 caracteres)"
              />
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="size-3" />
                O motivo ficará registrado na timeline da venda.
              </p>
            </div>

            <div className="col-span-2 text-right space-y-1 border-t pt-3">
              <div className="text-sm text-muted-foreground">Subtotal: {brl(subtotal)}</div>
              {discount > 0 && (
                <div className="text-sm text-muted-foreground">Desconto: - {brl(discount)}</div>
              )}
              <div className="text-lg font-bold">Total: {brl(total)}</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button
            onClick={() =>
              onSave({
                items,
                discount,
                reason: reason.trim(),
                customer_id: customerId === "none" ? null : customerId,
                payment_method: paymentMethod || null,
                due_date: dueDate || null,
                notes: notes.trim() || null,
              })
            }
            disabled={!canSave || isSaving}
          >
            {isSaving ? "Salvando..." : "Salvar Alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
