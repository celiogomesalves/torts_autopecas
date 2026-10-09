type FiscalItem = Record<string, string | number>;
type FiscalPayload = Record<string, unknown>;

export type NfceSchemaFailure = {
  path: string;
  field: string;
  rule: string;
  message: string;
};

const DEPRECATED_IBS_CBS_FIELDS = [
  "ibs_cbs_codigo_situacao_tributaria",
  "ibs_cbs_codigo_classificacao",
  "ibs_cbs_codigo_classificacao_tributaria",
  "ibs_aliquota",
] as const;

function decimal(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function itemPath(index: number, element: string) {
  return `NFe.infNFe.det[${index + 1}].imposto.IBSCBS.${element}`;
}

/**
 * Pré-valida a estrutura que a Focus converterá para o grupo XML IBSCBS.
 * A API recebe JSON e somente a Focus gera o XML; portanto esta validação
 * aplica localmente as restrições estruturais do leiaute NFe 4.00/RTC antes
 * de qualquer chamada externa.
 */
export function validateNfcePayloadAgainstSchema(payload: FiscalPayload): NfceSchemaFailure[] {
  const failures: NfceSchemaFailure[] = [];
  const items = Array.isArray(payload.items) ? (payload.items as FiscalItem[]) : [];

  items.forEach((item, index) => {
    for (const field of DEPRECATED_IBS_CBS_FIELDS) {
      if (field in item) {
        failures.push({
          path: itemPath(index, "gIBSCBS"),
          field,
          rule: "FOCUS-IBSCBS-NOME-CAMPO",
          message: `Campo não reconhecido pela Focus NFe. Ele pode gerar gIBSCBS sem os elementos obrigatórios CST/cClassTrib.`,
        });
      }
    }

    const cst = String(item.ibs_cbs_situacao_tributaria ?? "");
    if (!/^\d{3}$/.test(cst)) {
      failures.push({
        path: itemPath(index, "CST"),
        field: "ibs_cbs_situacao_tributaria",
        rule: "XSD-IBSCBS-CST",
        message: "CST deve existir antes de gIBSCBS e conter exatamente 3 dígitos.",
      });
    }

    const classification = String(item.ibs_cbs_classificacao_tributaria ?? "");
    if (!/^\d{6}$/.test(classification)) {
      failures.push({
        path: itemPath(index, "cClassTrib"),
        field: "ibs_cbs_classificacao_tributaria",
        rule: "XSD-IBSCBS-CCLASSTRIB",
        message: "cClassTrib é obrigatório entre CST e gIBSCBS e deve conter exatamente 6 dígitos.",
      });
    }

    const requiredDecimals: Array<[string, string, boolean]> = [
      ["ibs_cbs_base_calculo", "gIBSCBS.vBC", true],
      ["ibs_uf_aliquota", "gIBSCBS.gIBSUF.pIBSUF", false],
      ["ibs_uf_valor", "gIBSCBS.gIBSUF.vIBSUF", false],
      ["ibs_mun_aliquota", "gIBSCBS.gIBSMun.pIBSMun", false],
      ["ibs_mun_valor", "gIBSCBS.gIBSMun.vIBSMun", false],
      ["ibs_valor_total", "gIBSCBS.vIBS", false],
      ["cbs_aliquota", "gIBSCBS.gCBS.pCBS", false],
      ["cbs_valor", "gIBSCBS.gCBS.vCBS", false],
    ];

    for (const [field, xmlElement, positive] of requiredDecimals) {
      const value = decimal(item[field]);
      if (value === null || value < 0 || (positive && value <= 0)) {
        failures.push({
          path: itemPath(index, xmlElement),
          field,
          rule: "XSD-IBSCBS-VALOR-DECIMAL",
          message: positive
            ? "Campo obrigatório e deve ser um decimal maior que zero."
            : "Campo obrigatório e deve ser um decimal maior ou igual a zero.",
        });
      }
    }
  });

  return failures;
}

export function formatNfceSchemaFailures(failures: NfceSchemaFailure[]) {
  return failures
    .map(
      (failure, index) =>
        `${index + 1}. Campo: ${failure.field} | XML: ${failure.path} | Regra: ${failure.rule} | Falha: ${failure.message}`,
    )
    .join("\n");
}
