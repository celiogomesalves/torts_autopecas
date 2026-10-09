// Utilitários de similaridade de strings (acentos/case-insensitive).

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m = a.length;
  const n = b.length;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

export function similarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na && !nb) return 1;
  const max = Math.max(na.length, nb.length);
  if (max === 0) return 1;
  return 1 - levenshtein(na, nb) / max;
}

/** Retorna nomes considerados semelhantes (>= 0.8 ou contidos). Exclui exatos. */
export function findSimilarNames(
  target: string,
  pool: { id: string; name: string }[],
  opts: { threshold?: number; excludeId?: string | null } = {},
): { id: string; name: string }[] {
  const threshold = opts.threshold ?? 0.8;
  const nt = normalizeName(target);
  if (!nt) return [];
  return pool
    .filter((p) => p.id !== opts.excludeId)
    .map((p) => {
      const np = normalizeName(p.name);
      const exact = np === nt;
      const contains = !exact && (np.includes(nt) || nt.includes(np));
      const score = similarity(target, p.name);
      return { p, exact, contains, score };
    })
    .filter((x) => !x.exact && (x.contains || x.score >= threshold))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.p);
}
