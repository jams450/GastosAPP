import { ComponentProps } from "react";
import { cn } from "@/lib/ui/cn";

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn(className)} {...props} />;
}
