import React, { useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Printer, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { brl } from "@/lib/format";

interface PrintPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  content: string;
  onConfirm?: () => void;
  extras?: React.ReactNode;
}

export function PrintPreviewDialog({
  open,
  onOpenChange,
  title,
  content,
  onConfirm,
  extras,
}: PrintPreviewDialogProps) {

  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] max-w-2xl max-h-[95vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 sm:p-6 pb-3 shrink-0">
          <DialogTitle className="flex items-center gap-2 pr-8 text-base sm:text-lg">
            <Printer className="size-5 shrink-0" />
            <span className="min-w-0 truncate">{title}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6">
          <div className="relative bg-muted/30 rounded-md border p-2 sm:p-4 flex justify-center overflow-hidden h-[55vh] min-h-[280px] sm:h-[440px]">
            <iframe
              ref={iframeRef}
              title="Print Preview"
              className="w-full h-full border-none bg-white shadow-sm"
              srcDoc={content}
            />
          </div>
          {extras ? <div className="py-3">{extras}</div> : null}
        </div>

        <DialogFooter className="p-4 sm:p-6 pt-3 border-t shrink-0 grid grid-cols-1 sm:flex sm:flex-row sm:justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            <X className="size-4 mr-2" />
            Fechar
          </Button>
          <Button
            onClick={handlePrint}
            className="w-full sm:w-auto bg-brand-orange hover:bg-brand-orange/90"
          >
            <Printer className="size-4 mr-2" />
            Testar Impressão
          </Button>
          {onConfirm && (
            <Button
              onClick={onConfirm}
              className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white"
            >
              Confirmar e Finalizar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
