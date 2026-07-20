import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  color,
  bg,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { color?: string; bg?: string }) {
  const style =
    color || bg
      ? { color: color, backgroundColor: bg ?? (color ? `${color}1A` : undefined) }
      : undefined;
  return (
    <span
      style={style}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium",
        !color && !bg && "bg-secondary text-secondary-foreground",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
