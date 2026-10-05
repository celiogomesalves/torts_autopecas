import { RefreshCw, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { useState } from "react";

interface PageHeadingProps {
  icon: LucideIcon;
  title: string;
  subtitle?: React.ReactNode;
  iconClassName?: string;
  className?: string;
  showRefresh?: boolean;
  gradientTitle?: boolean | "accent";
}

/**
 * Bloco padrão de identidade da página: ícone (em badge laranja) + título + subtítulo.
 * Use diretamente dentro do header existente da página, deixando as ações ao lado.
 *
 * Exemplo:
 *   <div className="flex flex-wrap items-end justify-between gap-3">
 *     <PageHeading icon={BarChart3} title="Relatórios" subtitle="Análises por período" />
 *     <div>...ações...</div>
 *   </div>
 */
export function PageHeading({
  icon: Icon,
  title,
  subtitle,
  iconClassName,
  className,
  showRefresh = true,
  gradientTitle = false,
}: PageHeadingProps) {
  const qc = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await qc.refetchQueries();
      toast.success("Dados atualizados!");
    } catch (error) {
      toast.error("Erro ao atualizar dados.");
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className={cn("flex items-center md:items-start gap-3", className)}>
      <div className="flex size-9 md:size-11 shrink-0 items-center justify-center rounded-lg md:rounded-xl bg-brand-orange/10 text-brand-orange transition-all duration-300 hover:bg-brand-orange/20 hover:shadow-[0_0_12px_oklch(0.74_0.18_52/0.25)]">
        <Icon className={cn("size-5 md:size-6 transition-transform duration-300 group-hover:scale-110", iconClassName)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className={cn(
            "text-xl md:text-2xl font-bold tracking-tight",
            gradientTitle === "accent" ? "gradient-text-accent" : gradientTitle ? "gradient-text" : ""
          )}>{title}</h1>
          {showRefresh && (
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-brand-orange hover:bg-brand-orange/10"
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Atualizar dados desta página"
            >
              <RefreshCw className={cn("size-3.5", isRefreshing && "animate-spin")} />
            </Button>
          )}
        </div>
        {subtitle && (
          <div className="text-xs md:text-sm text-muted-foreground break-words">{subtitle}</div>
        )}
      </div>
    </div>
  );
}
