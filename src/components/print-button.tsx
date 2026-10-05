import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<typeof Button>, "children"> & {
  label?: string;
};

export function PrintButton({ label = "Imprimir", ...props }: Props) {
  return (
    <Button variant="outline" size="sm" {...props}>
      <Printer className="size-4 mr-2" />
      {label}
    </Button>
  );
}
