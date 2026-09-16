import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export function Button({
  className,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { size?: "compact" }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center rounded-full text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-50",
        size === "compact" ? "h-8 px-4" : "h-10 px-5",
        className,
      )}
      {...props}
    />
  );
}
