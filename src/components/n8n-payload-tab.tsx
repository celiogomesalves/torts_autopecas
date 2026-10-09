import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, Webhook } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { ReportsEndpointStatus } from "@/components/reports-endpoint-status";

export function N8nPayloadTab() {
  const { currentCompanyId } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = `${today.slice(0, 7)}-01`;

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://<seu-dominio>";
  const endpoint = `${origin}/api/public/reports/sales`;
  const anon =
    (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ??
    "<SUPABASE_PUBLISHABLE_KEY>";

  const body = useMemo(
    () => ({
      companyId: currentCompanyId ?? "<COMPANY_ID>",
      from: firstDay,
      to: today,
      format: "pdf_base64",
      includePdf: true,
      includeNotesPdf: true,
      paymentMethods: [] as string[],
      paymentMethodIds: [] as string[],
    }),
    [currentCompanyId, firstDay, today],
  );
  const bodyStr = JSON.stringify(body, null, 2);
  const curl = `curl -X POST '${endpoint}' \\
  -H 'Content-Type: application/json' \\
  -H 'apikey: ${anon}' \\
  -d '${JSON.stringify(body)}'`;

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Falha ao copiar");
    }
  };

  return (
    <div className="space-y-4">
      <ReportsEndpointStatus />
      <Card className="p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Webhook className="size-5 text-primary" />
          <div>
            <h3 className="font-semibold">Payload para automação n8n</h3>
            <p className="text-xs text-muted-foreground">
              Referência do endpoint usado pelo fluxo do n8n. O preenchimento de
              período, formato e formas de pagamento fica na aba{" "}
              <strong>Contabilidade</strong>.
            </p>
          </div>
        </div>

        <div className="space-y-3 text-sm">
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs uppercase text-muted-foreground">
                Endpoint (POST)
              </Label>
              <Button size="sm" variant="ghost" onClick={() => copy(endpoint, "Endpoint")}>
                <Copy className="size-3 mr-1" /> Copiar
              </Button>
            </div>
            <code className="block bg-muted p-2 rounded text-xs break-all">{endpoint}</code>
          </div>

          <div>
            <Label className="text-xs uppercase text-muted-foreground">Headers</Label>
            <pre className="bg-muted p-2 rounded text-xs overflow-auto mt-1">{`Content-Type: application/json
apikey: ${anon}`}</pre>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs uppercase text-muted-foreground">Body (JSON)</Label>
              <Button size="sm" variant="ghost" onClick={() => copy(bodyStr, "Body")}>
                <Copy className="size-3 mr-1" /> Copiar
              </Button>
            </div>
            <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-48">
              {bodyStr}
            </pre>
            <p className="text-xs text-muted-foreground mt-1">
              Datas no formato <code>YYYY-MM-DD</code>. <code>paymentMethods</code> e{" "}
              <code>paymentMethodIds</code> vazios = todas as formas. Somente vendas{" "}
              <strong>concluídas</strong> entram no relatório — canceladas e devolvidas
              são ignoradas.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-xs uppercase text-muted-foreground">Exemplo cURL</Label>
              <Button size="sm" variant="ghost" onClick={() => copy(curl, "cURL")}>
                <Copy className="size-3 mr-1" /> Copiar
              </Button>
            </div>
            <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-48">{curl}</pre>
          </div>

          <div className="text-xs text-muted-foreground border-t pt-2 space-y-1">
            <p>
              <strong>format: "pdf"</strong> — resposta é o arquivo PDF binário do
              relatório de vendas (<code>application/pdf</code>). Nesse formato{" "}
              <strong>não é possível receber o PDF das notas</strong> na mesma resposta
              (headers <code>x-notes-count</code> / <code>x-notes-pdf-included: false</code>).
            </p>
            <p>
              <strong>format: "pdf_base64"</strong> — JSON com <code>pdfBase64</code>,{" "}
              <code>filename</code>, os totais e também{" "}
              <code>notesPdfBase64</code>, <code>notesFilename</code>,{" "}
              <code>notesCount</code> (PDF único com todas as notas do período).{" "}
              <strong>Use este formato para receber os dois PDFs.</strong>
            </p>
            <p>
              <strong>format: "notes_pdf"</strong> — retorna somente o PDF binário
              consolidado das notas fiscais autorizadas do período (até 4 notas por página).
            </p>
            <p>
              <strong>format: "json"</strong> — dados crus: <code>company</code>,{" "}
              <code>period</code>, <code>filters</code>, <code>totals</code>,{" "}
              <code>paymentSummary</code>, <code>accounting</code>, <code>sales</code> e{" "}
              <code>notesPdfBase64</code>.
            </p>
            <p>
              <strong>includePdf</strong> — gera o relatório de vendas em PDF.{" "}
              <strong>includeNotesPdf</strong> — gera o PDF consolidado das notas
              (padrão: segue o <code>includePdf</code>). Notas canceladas não entram.
            </p>
            <p>
              <strong>Autenticação</strong> — header <code>apikey</code> com a chave
              pública acima, ou <code>x-reports-secret</code> com o{" "}
              <code>REPORTS_API_KEY</code>.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
