import { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cn("rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-950", className)}
      {...props}
    />
  );
}
