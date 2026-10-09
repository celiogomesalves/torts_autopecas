export const PATH_TO_MODULE: Record<string, string> = {
  "/app": "dashboard",
  "/app/vendas": "vendas",
  "/app/fechamento-caixa": "fechamento-caixa",
  "/app/estoque": "estoque",
  "/app/financeiro": "financeiro",
  "/app/fluxo-caixa": "financeiro",
  "/app/conciliacao": "financeiro",
  "/app/delivery": "delivery",
  "/app/notas-fiscais": "notas-fiscais",
  "/app/produtos": "produtos",
  "/app/categorias": "categorias",
  "/app/marcas": "marcas",
  "/app/unidades": "unidades",
  "/app/localizacoes": "localizacoes",
  "/app/parceiros": "parceiros",
  "/app/formas-pagamento": "formas-pagamento",
  "/app/relatorios": "relatorios",
  "/app/equipe": "equipe",
  "/app/configuracoes": "configuracoes",
  "/app/orcamentos": "vendas",
  "/app/agenda": "agenda",
};

export const getModuleFromPath = (path: string) => {
  if (path === "/app") return "dashboard";

  const sortedPaths = Object.keys(PATH_TO_MODULE)
    .filter((p) => p !== "/app")
    .sort((a, b) => b.length - a.length);

  for (const p of sortedPaths) {
    if (path === p || path.startsWith(p + "/") || path.startsWith(p + ".")) {
      return PATH_TO_MODULE[p];
    }
  }
  return "";
};
