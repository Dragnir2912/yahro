import type { ButtonHTMLAttributes } from "react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface FlowButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
}

export function FlowButton({ label, className, ...props }: FlowButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "group inline-flex h-12 items-center justify-center gap-3 rounded-xl bg-[#20211d] px-6 text-sm font-bold text-white shadow-[0_14px_35px_rgba(32,33,29,.18)] transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_42px_rgba(32,33,29,.24)] active:translate-y-0 dark:bg-[#e3edda] dark:text-[#1e2915]",
        className,
      )}
      {...props}
    >
      <span>{label}</span>
      <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
    </button>
  );
}
