import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Printer } from "lucide-react";

interface PrintSelectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (printAll: boolean) => void;
  totalFound: number;
  totalCurrentPage: number;
}

export function PrintSelectionDialog({
  open,
  onOpenChange,
  onConfirm,
  totalFound,
  totalCurrentPage,
}: PrintSelectionDialogProps) {
  const [selection, setSelection] = React.useState<"all" | "page">("all");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="size-5 text-brand-red" />
            Opções de Impressão
          </DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <RadioGroup
            value={selection}
            onValueChange={(v) => setSelection(v as "all" | "page")}
            className="gap-4"
          >
            <div className="flex items-start space-x-3 space-y-0">
              <RadioGroupItem value="page" id="page" className="mt-1" />
              <Label htmlFor="page" className="font-normal cursor-pointer leading-tight">
                <div className="font-semibold text-sm">Apenas registros da página atual</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Imprime apenas os {totalCurrentPage} registros visíveis nesta página.
                </div>
              </Label>
            </div>
            <div className="flex items-start space-x-3 space-y-0">
              <RadioGroupItem value="all" id="all" className="mt-1" />
              <Label htmlFor="all" className="font-normal cursor-pointer leading-tight">
                <div className="font-semibold text-sm">Todos os registros encontrados</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Imprime todos os {totalFound} registros que correspondem aos filtros atuais.
                </div>
              </Label>
            </div>
          </RadioGroup>
        </div>
        <DialogFooter className="flex sm:justify-between gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-brand-red hover:bg-brand-red/90 text-brand-red-foreground"
            onClick={() => {
              onConfirm(selection === "all");
              onOpenChange(false);
            }}
          >
            <Printer className="size-4 mr-2" />
            Imprimir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
