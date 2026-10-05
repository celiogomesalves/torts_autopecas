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
}

export function PrintPreviewDialog({
  open,
  onOpenChange,
  title,
  content,
  onConfirm,
}: PrintPreviewDialogProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handlePrint = () => {
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.print();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="size-5" />
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className="relative bg-muted/30 rounded-md border p-4 flex justify-center overflow-hidden h-[500px]">
          <iframe
            ref={iframeRef}
            title="Print Preview"
            className="w-full h-full border-none bg-white shadow-sm"
            srcDoc={content}
          />
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
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
