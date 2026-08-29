import ProgressiveFluxLoader from "@/components/ui/progressive-flux-loader";

const phases = {
  fr: [
    { at: 0, label: "Ouverture de Yahro" },
    { at: 28, label: "Chargement de vos données" },
    { at: 62, label: "Préparation de votre espace" },
    { at: 86, label: "Presque prêt" },
    { at: 100, label: "Bienvenue" },
  ],
  en: [
    { at: 0, label: "Opening Yahro" },
    { at: 28, label: "Loading your data" },
    { at: 62, label: "Preparing your space" },
    { at: 86, label: "Almost ready" },
    { at: 100, label: "Welcome" },
  ],
};

export default function YahroLoadingScreen({ language = "fr" }: { language?: "fr" | "en" }) {
  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[#f7f7f3] px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-[#252720] dark:bg-[#11120f] dark:text-[#f0f1eb]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(173,207,128,.22),transparent_38%)] dark:bg-[radial-gradient(circle_at_50%_38%,rgba(118,148,80,.18),transparent_42%)]" />
      <div role="status" aria-live="polite" className="relative flex flex-col items-center text-center">
        <div className="relative grid size-20 place-items-center rounded-[1.6rem] border border-[#dfe4d7] bg-white shadow-[0_18px_55px_rgba(65,77,47,.14)] dark:border-white/10 dark:bg-[#20211d]">
          <span className="absolute inset-[-8px] animate-pulse rounded-[2rem] border border-[#b9d691]/45" />
          <img src="/brand/yahro-mark.png" alt="" className="size-14 object-contain" />
        </div>
        <p className="mt-6 font-[Manrope_Variable] text-xl font-extrabold tracking-[-.04em]">yahro</p>
        <ProgressiveFluxLoader phases={phases[language]} duration={8} className="mt-4 w-[min(82vw,24rem)]" barClassName="h-3.5" ariaLabel={language === "fr" ? "Chargement de Yahro" : "Loading Yahro"} />
      </div>
    </div>
  );
}
