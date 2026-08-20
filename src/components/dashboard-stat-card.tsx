import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Language = "fr" | "en";

export function DashboardStatCard({ label, value, change, icon, positive = true, rising = true, language, delay }: { label: string; value: string; change: string; icon: ReactNode; positive?: boolean; rising?: boolean; language: Language; delay: string }) {
  return (
    <article className="animate-fade-up rounded-2xl border border-[var(--yahro-border)] bg-[var(--yahro-surface)] p-5 shadow-[0_1px_2px_rgba(28,29,24,.02)]" style={{ animationDelay: delay }}>
      <div className="mb-5 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--yahro-muted)]">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg bg-[#f1f1ed] text-[#6b6d64] dark:bg-white/7 dark:text-[#b9bbb2]">{icon}</span>
      </div>
      <p className="yahro-money font-[Manrope_Variable] text-[1.7rem] font-bold text-[var(--yahro-text)]">{value}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold", positive ? "bg-[#e9f2df] text-[#527132] dark:bg-[#293820] dark:text-[#aace84]" : "bg-[#f5e5e1] text-[#a25140] dark:bg-[#412925] dark:text-[#e49a89]")}>
          {rising ? <ArrowUpRight size={12} aria-hidden="true" /> : <ArrowDownRight size={12} aria-hidden="true" />}
          <span className="sr-only">{language === "fr" ? (rising ? "en hausse de" : "en baisse de") : (rising ? "up by" : "down by")}</span>
          {change}
        </span>
      </div>
    </article>
  );
}

export function DashboardStatSkeleton() {
  return <article aria-hidden="true" className="rounded-2xl border border-[var(--yahro-border)] bg-[var(--yahro-surface)] p-5"><div className="mb-5 flex items-center justify-between"><span className="h-4 w-24 animate-pulse rounded bg-[#ecece7] dark:bg-white/8" /><span className="size-8 animate-pulse rounded-lg bg-[#ecece7] dark:bg-white/8" /></div><div className="h-8 w-36 animate-pulse rounded bg-[#ecece7] dark:bg-white/8" /><div className="mt-2 h-4 w-14 animate-pulse rounded bg-[#ecece7] dark:bg-white/8" /></article>;
}
