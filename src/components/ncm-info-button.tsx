import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function NcmInfoButton({ className }: { className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={"h-6 w-6 text-muted-foreground hover:text-foreground " + (className ?? "")}
          title="O que é NCM?"
          aria-label="O que é NCM?"
        >
          <HelpCircle className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-72 text-sm space-y-2">
        <p className="font-medium">O que é NCM?</p>
        <p className="text-muted-foreground">
          NCM (Nomenclatura Comum do Mercosul) é um código de <strong>8 dígitos</strong> que
          identifica fiscalmente o produto. É usado para calcular impostos e emitir notas
          fiscais (NF-e/NFC-e).
        </p>
        <p className="text-muted-foreground">
          Exemplo: <span className="font-mono">8421.23.00</span> (filtro de óleo).
        </p>
        <p className="text-xs text-muted-foreground">
          Dica: se não souber, use o botão <strong>Buscar por IA</strong> ao lado.
        </p>
      </PopoverContent>
    </Popover>
  );
}
