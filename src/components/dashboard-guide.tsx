import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { dashboardGuideSteps } from "@/lib/dashboard-guide";

interface TargetRect {
  top: number;
  left: number;
  bottom: number;
  width: number;
  height: number;
}

function findGuideTarget(nav: string) {
  const elements = [...document.querySelectorAll<HTMLElement>(`[data-guide="${nav}"]`)];
  return elements.find((element) => {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

export default function DashboardGuide({ language, step, onStepChange, onClose }: { language: "fr" | "en"; step: number; onStepChange: (step: number) => void; onClose: (completed: boolean) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<TargetRect>();
  const [cardHeight, setCardHeight] = useState(290);
  const item = dashboardGuideSteps[step];
  const index = language === "fr" ? 0 : 1;
  const last = step === dashboardGuideSteps.length - 1;

  useLayoutEffect(() => {
    const element = findGuideTarget(item.nav);
    if (!element) {
      const missingTargetTimer = window.setTimeout(() => setTarget(undefined), 0);
      return () => window.clearTimeout(missingTargetTimer);
    }
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
    const update = () => {
      const rect = element.getBoundingClientRect();
      const padding = 7;
      setTarget({
        top: Math.max(8, rect.top - padding),
        left: Math.max(8, rect.left - padding),
        bottom: Math.min(window.innerHeight - 8, rect.bottom + padding),
        width: Math.min(window.innerWidth - 16, rect.width + padding * 2),
        height: Math.min(window.innerHeight - 16, rect.height + padding * 2),
      });
    };
    const timer = window.setTimeout(update, 320);
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { window.clearTimeout(timer); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [item.nav]);

  useEffect(() => { dialogRef.current?.focus(); }, [step]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const update = () => setCardHeight(dialog.getBoundingClientRect().height);
    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    observer.observe(dialog);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [step]);

  const cardWidth = Math.min(360, window.innerWidth - 24);
  const cardLeft = target ? Math.max(12, Math.min(window.innerWidth - cardWidth - 12, target.left + target.width / 2 - cardWidth / 2)) : Math.max(12, (window.innerWidth - cardWidth) / 2);
  const placeBelow = target ? target.bottom + cardHeight + 16 <= window.innerHeight - 16 : false;
  const cardTop = target ? (placeBelow ? Math.min(target.bottom + 16, window.innerHeight - cardHeight - 16) : Math.max(16, target.top - cardHeight - 16)) : Math.max(16, (window.innerHeight - cardHeight) / 2);

  return (
    <div className="fixed inset-0 z-[110]" role="presentation">
      <div className="absolute inset-0 bg-transparent" />
      {target && <div aria-hidden className="pointer-events-none fixed rounded-2xl border-2 border-[#a9cb7c] shadow-[0_0_0_9999px_rgba(14,16,12,.64),0_0_0_5px_rgba(169,203,124,.18),0_12px_36px_rgba(0,0,0,.18)] transition-[top,left,width,height] duration-300" style={{ top: target.top, left: target.left, width: target.width, height: target.height }} />}
      {!target && <div aria-hidden className="pointer-events-none absolute inset-0 bg-[#0e100c]/64" />}
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="guide-title" aria-describedby="guide-description" onKeyDown={(event) => { if (event.key === "Escape") onClose(false); }} className="fixed rounded-2xl border border-[#dfe3d8] bg-[#fafaf7] p-5 text-[#252720] shadow-[0_22px_65px_rgba(0,0,0,.28)] outline-none transition-[top,left] duration-300 dark:border-white/10 dark:bg-[#20211d] dark:text-[#f0f1eb]" style={{ top: cardTop, left: cardLeft, width: cardWidth, maxHeight: "calc(100dvh - 32px)", overflowY: "auto" }}>
        <div className="flex items-center justify-between gap-4"><span className="rounded-full bg-[#e7efdc] px-2.5 py-1 text-[11px] font-extrabold text-[#577336] dark:bg-[#2a3822] dark:text-[#c3dda3]">{step + 1} / {dashboardGuideSteps.length}</span><button type="button" onClick={() => onClose(false)} className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--yahro-muted)] hover:bg-black/5 dark:hover:bg-white/7" aria-label={language === "fr" ? "Fermer le guide" : "Close guide"}><X size={18} /></button></div>
        <h2 id="guide-title" className="mt-3 font-[Manrope_Variable] text-xl font-extrabold tracking-[-.035em]">{item.title[index]}</h2>
        <p id="guide-description" className="mt-2 text-sm leading-6 text-[var(--yahro-muted)]">{item.body[index]}</p>
        <p className="mt-3 border-l-2 border-[#8cac60] pl-3 text-xs font-semibold leading-5 text-[#53683b] dark:text-[#bdd49f]">{item.tip[index]}</p>
        <div className="mt-5 flex items-center justify-between gap-3"><button type="button" onClick={() => step === 0 ? onClose(false) : onStepChange(step - 1)} className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[var(--yahro-muted)] hover:bg-black/5 dark:hover:bg-white/7">{step > 0 && <ArrowLeft size={16} />}{step === 0 ? (language === "fr" ? "Passer" : "Skip") : (language === "fr" ? "Retour" : "Back")}</button><button type="button" onClick={() => last ? onClose(true) : onStepChange(step + 1)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#20211d] px-4 text-sm font-bold text-white dark:bg-[#dcebc5] dark:text-[#202b13]">{last && <Check size={16} />}{last ? (language === "fr" ? "Terminer" : "Finish") : (language === "fr" ? "Suivant" : "Next")}{!last && <ArrowRight size={16} />}</button></div>
      </div>
    </div>
  );
}
