import { useEffect, useRef, useState, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

interface ClampedDescriptionProps {
  text: string;
  className?: string;
  buttonClassName?: string;
  expandable?: boolean; // true => expand inline; false => trigger onShowMore
  onShowMore?: () => void;
}

export function ClampedDescription({
  text,
  className,
  buttonClassName,
  expandable = false,
  onShowMore,
}: ClampedDescriptionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      setOverflows(el.scrollHeight - el.clientHeight > 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  const handleClick = (e: MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (expandable) setExpanded((v) => !v);
    else onShowMore?.();
  };

  return (
    <>
      <div ref={ref} className={cn("whitespace-pre-wrap", !expanded && "line-clamp-2", className)}>
        {text}
      </div>
      {overflows && (
        <button
          type="button"
          onClick={handleClick}
          className={cn("text-[11px] text-brand-red hover:underline mt-0.5", buttonClassName)}
        >
          {expandable
            ? expanded
              ? "Mostrar menos"
              : "Ver detalhes completos"
            : "Ver detalhes completos"}
        </button>
      )}
    </>
  );
}
