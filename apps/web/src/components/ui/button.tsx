import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--radius-md)] border border-transparent text-[length:var(--text-base)] font-[var(--weight-medium)] outline-none select-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-60 aria-invalid:border-destructive aria-invalid:ring-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-[var(--accent-hover)] active:bg-[var(--accent-hover)]",
        outline:
          "border-input bg-background text-foreground hover:bg-muted aria-expanded:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-muted aria-expanded:bg-muted",
        ghost:
          "text-[var(--text-secondary)] hover:bg-muted hover:text-foreground aria-expanded:bg-muted",
        destructive:
          "text-destructive hover:bg-muted focus-visible:ring-destructive",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-[var(--control-height)] gap-[var(--space-2)] px-[var(--space-3)]",
        xs: "h-[var(--control-compact)] gap-[var(--space-1)] rounded-[var(--radius-sm)] px-[var(--space-2)] text-[length:var(--text-sm)] [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-[var(--space-1)] px-[var(--space-2)] text-[length:var(--text-sm)] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-[var(--space-2)] px-[var(--space-3)]",
        icon: "size-[var(--control-height)] p-0",
        "icon-xs":
          "size-[var(--control-compact)] rounded-[var(--radius-sm)] p-0 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 p-0",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-size={size}
      data-variant={variant}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
