import { memo, useRef, useState, useCallback, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Barcode, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BarcodeSuggestion {
  id: string;
  label: string;
  sublabel?: string;
  payload: any;
}

interface BarcodeScanInputProps {
  onSubmit: (code: string) => void;
  /** Função de busca incremental (chamada após debounce). Retorna até N sugestões. */
  search?: (term: string) => BarcodeSuggestion[];
  /** Quando o usuário seleciona uma sugestão (clique ou Enter na lista). */
  onPick?: (s: BarcodeSuggestion) => void;
  placeholder?: string;
  autoFocus?: boolean;
  debounceMs?: number;
  maxSuggestions?: number;
}

/**
 * Input isolado para leitor óptico / código de estoque com busca incremental
 * + debounce + autocomplete. Mantém estado local para não re-renderizar a
 * página pai a cada tecla.
 *
 * Comportamento:
 * - Enter sem seleção ativa: dispara onSubmit(value) (caminho do leitor óptico).
 * - ↑/↓: navega sugestões. Enter na sugestão ativa: dispara onPick.
 * - Esc: fecha sugestões. Clique fora: fecha.
 */
function BarcodeScanInputInner({
  onSubmit,
  search,
  onPick,
  placeholder = "Código SKU…",
  autoFocus = false,
  debounceMs = 180,
  maxSuggestions = 8,
}: BarcodeScanInputProps) {
  const [value, setValue] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastKeyTs = useRef(0);

  // Debounce do termo digitado
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(value.trim()), debounceMs);
    return () => window.clearTimeout(t);
  }, [value, debounceMs]);

  const suggestions = useMemo<BarcodeSuggestion[]>(() => {
    if (!search || debounced.length < 2) return [];
    return search(debounced).slice(0, maxSuggestions);
  }, [search, debounced, maxSuggestions]);

  useEffect(() => {
    setActive(0);
  }, [suggestions]);

  // Fechar ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const submitCurrent = useCallback(() => {
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
    setValue("");
    setOpen(false);
  }, [value, onSubmit]);

  const pick = useCallback(
    (s: BarcodeSuggestion) => {
      if (onPick) onPick(s);
      else onSubmit(s.label);
      setValue("");
      setOpen(false);
      inputRef.current?.focus();
    },
    [onPick, onSubmit],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Detecção de leitor óptico: teclas em rajada (<30ms entre eventos) →
      // não abre dropdown para não atrapalhar.
      const now = performance.now();
      const isScanner = now - lastKeyTs.current < 30;
      lastKeyTs.current = now;

      if (e.key === "Enter") {
        if (open && suggestions[active]) {
          e.preventDefault();
          pick(suggestions[active]);
          return;
        }
        submitCurrent();
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (isScanner) return;
      if (e.key === "ArrowDown" && suggestions.length > 0) {
        e.preventDefault();
        setOpen(true);
        setActive((a) => (a + 1) % suggestions.length);
      } else if (e.key === "ArrowUp" && suggestions.length > 0) {
        e.preventDefault();
        setOpen(true);
        setActive((a) => (a - 1 + suggestions.length) % suggestions.length);
      }
    },
    [open, active, suggestions, pick, submitCurrent],
  );

  const clear = useCallback(() => {
    setValue("");
    setOpen(false);
    inputRef.current?.focus();
  }, []);

  const showDropdown = open && suggestions.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <Barcode className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className="pl-9 pr-9"
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      )}
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-md max-h-72 overflow-auto">
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(s)}
              className={cn(
                "w-full text-left px-3 py-2 text-sm flex flex-col gap-0.5 border-b last:border-b-0",
                i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
              )}
            >
              <span className="font-medium truncate">{s.label}</span>
              {s.sublabel && (
                <span className="text-xs text-muted-foreground truncate">{s.sublabel}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const BarcodeScanInput = memo(BarcodeScanInputInner);
