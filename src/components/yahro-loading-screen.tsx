import { useEffect, useState } from "react";

const messages = {
  fr: ["Préparation de votre espace", "Chargement de vos données", "Yahro est presque prêt"],
  en: ["Preparing your space", "Loading your data", "Yahro is almost ready"],
};

export default function YahroLoadingScreen({ language = "fr" }: { language?: "fr" | "en" }) {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setMessageIndex((current) => (current + 1) % messages[language].length), 2200);
    return () => window.clearInterval(timer);
  }, [language]);

  return (
    <div className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-[#f7f7f3] px-6 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-[#252720] dark:bg-[#11120f] dark:text-[#f0f1eb]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,rgba(173,207,128,.22),transparent_38%)] dark:bg-[radial-gradient(circle_at_50%_38%,rgba(118,148,80,.18),transparent_42%)]" />
      <div role="status" aria-live="polite" className="relative flex flex-col items-center text-center">
        <div className="relative grid size-20 place-items-center rounded-[1.6rem] border border-[#dfe4d7] bg-white shadow-[0_18px_55px_rgba(65,77,47,.14)] dark:border-white/10 dark:bg-[#20211d]">
          <span className="absolute inset-[-8px] animate-pulse rounded-[2rem] border border-[#b9d691]/45" />
          <img src="/brand/yahro-mark.png" alt="" className="size-14 object-contain" />
        </div>
        <p className="mt-6 font-[Manrope_Variable] text-xl font-extrabold tracking-[-.04em]">yahro</p>
        <p className="mt-2 min-h-5 text-sm text-[#73766d] dark:text-[#aeb0a7]">{messages[language][messageIndex]}</p>
        <div className="mt-5 flex gap-1.5" aria-hidden="true">
          {[0, 1, 2].map((item) => <span key={item} className="size-1.5 animate-pulse rounded-full bg-[#789653]" style={{ animationDelay: `${item * 180}ms` }} />)}
        </div>
      </div>
    </div>
  );
}
