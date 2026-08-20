import React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "outline";
  size?: "default" | "sm" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ variant = "default", size = "default", className, children, ...props }, ref) => {
  const variants = {
    default: "bg-[#1d1e19] text-white shadow-sm hover:bg-[#34352f] dark:bg-[#e9f5d6] dark:text-[#17200c] dark:hover:bg-[#dcebc3]",
    secondary: "bg-[#e8f2d8] text-[#34491c] hover:bg-[#dceac4] dark:bg-[#28331f] dark:text-[#dcebc3] dark:hover:bg-[#35442a]",
    ghost: "text-[#6d6f66] hover:bg-[#eeeeea] hover:text-[#1d1e19] dark:text-[#a8aaa1] dark:hover:bg-white/7 dark:hover:text-white",
    outline: "border border-[var(--yahro-border)] bg-[var(--yahro-surface)] text-[var(--yahro-text)] hover:bg-[#f5f5f1] dark:hover:bg-white/7",
  };
  const sizes = {
    default: "h-12 rounded-xl px-4 text-sm lg:h-11",
    sm: "h-12 rounded-lg px-3 text-sm lg:h-9",
    icon: "size-12 rounded-xl lg:size-10",
  };

  return <button ref={ref} className={cn("inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 active:scale-[.98]", variants[variant], sizes[size], className)} {...props}>{children}</button>;
});

Button.displayName = "Button";
export default Button;
