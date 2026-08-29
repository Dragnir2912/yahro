import { useEffect, useRef } from "react";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { dashboardGuideSteps } from "@/lib/dashboard-guide";

export default function DashboardGuide({ language, step, onStepChange, onClose }: { language: "fr" | "en"; step: number; onStepChange: (step: number) => void; onClose: (completed: boolean) => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const item = dashboardGuideSteps[step];
  const index = language === "fr" ? 0 : 1;
  const last = step === dashboardGuideSteps.length - 1;

  useEffect(() => {
    dialogRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [step]);

  return (
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-[#11130e]/55 px-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] pt-[calc(.75rem+env(safe-area-inset-top))] backdrop-blur-sm sm:items-center sm:p-6">
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="guide-title" aria-describedby="guide-description" onKeyDown={(event) => { if (event.key === "Escape") onClose(false); }} className="w-full max-w-xl rounded-[1.5rem] border border-white/20 bg-[#fafaf7] p-5 shadow-2xl outline-none dark:border-white/10 dark:bg-[#20211d] sm:p-7">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2" aria-label={`${step + 1} / ${dashboardGuideSteps.length}`}>
            {dashboardGuideSteps.map((guideStep, guideIndex) => <span key={guideStep.nav} className={`h-1.5 rounded-full transition-all ${guideIndex === step ? "w-8 bg-[#6f8f49]" : guideIndex < step ? "w-3 bg-[#b7cd9a]" : "w-3 bg-[#dfe1da] dark:bg-white/12"}`} />)}
          </div>
          <button type="button" onClick={() => onClose(false)} className="grid size-11 shrink-0 place-items-center rounded-xl text-[var(--yahro-muted)] hover:bg-black/5 dark:hover:bg-white/7" aria-label={language === "fr" ? "Fermer le guide" : "Close guide"}><X size={19} /></button>
        </div>
        <p className="mt-5 text-xs font-bold uppercase tracking-[.12em] text-[#688646]">{language === "fr" ? `Étape ${step + 1} sur ${dashboardGuideSteps.length}` : `Step ${step + 1} of ${dashboardGuideSteps.length}`}</p>
        <h2 id="guide-title" className="mt-2 font-[Manrope_Variable] text-2xl font-extrabold tracking-[-.04em]">{item.title[index]}</h2>
        <p id="guide-description" className="mt-3 text-sm leading-6 text-[var(--yahro-muted)] sm:text-base">{item.body[index]}</p>
        <div className="mt-5 rounded-xl bg-[#edf4e3] px-4 py-3 text-sm text-[#40572a] dark:bg-[#293620] dark:text-[#c7dfa8]">{item.tip[index]}</div>
        <div className="mt-6 flex items-center justify-between gap-3">
          <button type="button" onClick={() => step === 0 ? onClose(false) : onStepChange(step - 1)} className="inline-flex h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-[var(--yahro-muted)] hover:bg-black/5 dark:hover:bg-white/7">{step > 0 && <ArrowLeft size={17} />}{step === 0 ? (language === "fr" ? "Passer" : "Skip") : (language === "fr" ? "Retour" : "Back")}</button>
          <button type="button" onClick={() => last ? onClose(true) : onStepChange(step + 1)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#20211d] px-5 text-sm font-bold text-white dark:bg-[#dcebc5] dark:text-[#202b13]">{last ? <Check size={17} /> : null}{last ? (language === "fr" ? "Terminer" : "Finish") : (language === "fr" ? "Suivant" : "Next")}{!last && <ArrowRight size={17} />}</button>
        </div>
      </div>
    </div>
  );
}
