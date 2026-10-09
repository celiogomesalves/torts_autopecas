import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Props = {
  area?: "empresa" | "fiscal" | "integracoes" | "webhooks";
};

const COPY: Record<NonNullable<Props["area"]>, { title: string; desc: string }> = {
  empresa: {
    title: "Atenção: alterações nos dados da empresa",
    desc: "CNPJ, razão social, endereço e regime tributário são usados na emissão de notas fiscais e em integrações. Alterações incorretas podem invalidar NFC-e/NF-e e bloquear vendas.",
  },
  fiscal: {
    title: "Atenção: configurações fiscais críticas",
    desc: "CSC, token Focus NFe, ambiente (homologação/produção), CFOP e demais parâmetros impactam diretamente a emissão de notas fiscais. Alterações incorretas podem rejeitar notas na SEFAZ.",
  },
  integracoes: {
    title: "Atenção: alterações em integrações",
    desc: "Webhooks, chaves de API e tokens controlam a comunicação com serviços externos (Focus NFe, n8n, etc). Alterações podem interromper emissão de notas, sincronização e automações.",
  },
  webhooks: {
    title: "Atenção: alterações em webhooks",
    desc: "URLs e segredos de webhook controlam o recebimento de callbacks fiscais e integrações. Alterações incorretas podem deixar notas com status desatualizado.",
  },
};

export function SensitiveSettingsWarning({ area = "fiscal" }: Props) {
  const c = COPY[area];
  return (
    <Alert variant="destructive" className="border-amber-500/50 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100 [&>svg]:text-amber-600">
      <AlertTriangle className="size-4" />
      <AlertTitle>{c.title}</AlertTitle>
      <AlertDescription>{c.desc}</AlertDescription>
    </Alert>
  );
}
