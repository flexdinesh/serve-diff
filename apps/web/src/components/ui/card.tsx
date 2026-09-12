import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Card({
  className,
  size = "default",
  ...props
}: ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-[var(--space-6)] rounded-[var(--radius-lg)] border bg-card py-[var(--space-6)] text-card-foreground data-[size=sm]:gap-[var(--space-4)] data-[size=sm]:py-[var(--space-4)]",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min items-start gap-[var(--space-1)] px-[var(--space-6)] group-data-[size=sm]/card:px-[var(--space-4)] has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-[var(--weight-semibold)]", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn(
        "px-[var(--space-6)] group-data-[size=sm]/card:px-[var(--space-4)]",
        className,
      )}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex items-center px-[var(--space-6)] group-data-[size=sm]/card:px-[var(--space-4)]",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle };
