import { useEffect, useState } from "react";
import { Ghost, Globe2, Moon, Sun } from "lucide-react";
import type { LandingLanguage } from "@/components/landing-page";
import { FlowButton } from "@/components/ui/flow-button";
import { setPageMetadata } from "@/lib/page-metadata";

interface Ghost404PageProps {
  onHome: () => void;
}

const copy = {
  fr: {
    title: "Page introuvable",
    description: "Cette adresse ne mène à aucune page de Yahro.",
    eyebrow: "Erreur 404",
    heading: "Oups, cette page s'est évaporée.",
    body: "Le lien est peut-être ancien, incomplet ou la page a été déplacée.",
    home: "Retour à l'accueil",
    help: "Que signifie l'erreur 404 ?",
    explanation: "Le code 404 signifie que le site fonctionne, mais qu'aucune page ne correspond à l'adresse demandée. Vous pouvez revenir à l'accueil sans risque pour vos données.",
    logo: "Accueil Yahro",
  },
  en: {
    title: "Page not found",
    description: "This address does not lead to a Yahro page.",
    eyebrow: "Error 404",
    heading: "Boo, this page vanished.",
    body: "The link may be old, incomplete, or the page may have moved.",
    home: "Back to home",
    help: "What does error 404 mean?",
    explanation: "A 404 code means the website is working, but no page matches the requested address. You can safely return home without affecting your data.",
    logo: "Yahro home",
  },
} as const;

export default function Ghost404Page({ onHome }: Ghost404PageProps) {
  const [language, setLanguage] = useState<LandingLanguage>(() => (window.localStorage.getItem("yahro-language") === "en" ? "en" : "fr"));
  const [theme, setTheme] = useState<"light" | "dark">(() => (window.localStorage.getItem("yahro-theme") === "dark" ? "dark" : "light"));
  const [helpOpen, setHelpOpen] = useState(false);
  const t = copy[language];

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.lang = language;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#080a07" : "#f7f7f3");
    setPageMetadata(`404 - ${t.title} | Yahro`, t.description);
  }, [language, theme, t]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem("yahro-theme", next);
  };

  const toggleLanguage = () => {
    const next = language === "fr" ? "en" : "fr";
    setLanguage(next);
    window.localStorage.setItem("yahro-language", next);
  };

  return (
    <main className="relative grid min-h-screen min-h-[100dvh] overflow-hidden bg-[#f7f7f3] px-5 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] text-[#20211d] transition-colors dark:bg-[#080a07] dark:text-[#f1f2ec] sm:px-8">
      <div className="pointer-events-none absolute left-1/2 top-1/2 size-[min(80vw,640px)] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(173,204,132,.22),transparent_65%)] blur-3xl dark:opacity-40" />

      <header className="relative z-10 flex h-12 items-center justify-between lg:h-11">
        <button type="button" onClick={onHome} className="yahro-touch-target flex items-center gap-2.5 rounded-xl pr-2" aria-label={t.logo}>
          <span className="grid size-10 place-items-center overflow-hidden rounded-xl bg-white p-1.5 shadow-sm dark:bg-white/8">
            <img src="/brand/yahro-mark.png" alt="" className="size-full object-contain" />
          </span>
          <span className="font-[Manrope_Variable] text-lg font-extrabold tracking-[-.05em]">yahro</span>
        </button>
        <div className="flex items-center gap-1">
          <button type="button" onClick={toggleTheme} className="yahro-touch-target grid size-12 place-items-center rounded-xl lg:size-10 text-[#696b63] hover:bg-black/5 dark:text-[#b2b4ac] dark:hover:bg-white/7" aria-label={theme === "light" ? "Mode sombre" : "Mode clair"}>
            {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button type="button" onClick={toggleLanguage} className="yahro-touch-target flex h-12 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-[#696b63] hover:bg-black/5 lg:h-10 dark:text-[#b2b4ac] dark:hover:bg-white/7" aria-label="Langue">
            <Globe2 size={17} />{language.toUpperCase()}
          </button>
        </div>
      </header>

      <section className="relative z-10 m-auto flex w-full max-w-2xl flex-col items-center py-12 text-center">
        <p className="mb-5 text-xs font-bold uppercase tracking-[.16em] text-[#728f4e] dark:text-[#a9ce7b]">{t.eyebrow}</p>
        <div className="flex items-center justify-center gap-[clamp(.45rem,2.5vw,1.4rem)]" aria-hidden="true">
          <span className="font-[Manrope_Variable] text-[clamp(5.5rem,21vw,10rem)] font-[750] leading-none tracking-[-.08em] text-[#2c2d27] dark:text-[#e8e9e2]">4</span>
          <span className="relative grid size-[clamp(5rem,17vw,8.5rem)] place-items-center">
            <span className="animate-ghost-float grid size-full place-items-center rounded-[42%_42%_32%_32%] border border-black/8 bg-white/85 text-[#7e9d56] shadow-[0_24px_60px_rgba(61,72,45,.14)] backdrop-blur-sm dark:border-white/10 dark:bg-white/7 dark:text-[#b8d991] dark:shadow-[0_24px_70px_rgba(0,0,0,.45)]">
              <Ghost className="size-[58%]" strokeWidth={1.45} />
            </span>
            <span className="animate-ghost-shadow absolute -bottom-5 h-2.5 w-[58%] rounded-full bg-black/10 blur-sm dark:bg-black/40" />
          </span>
          <span className="font-[Manrope_Variable] text-[clamp(5.5rem,21vw,10rem)] font-[750] leading-none tracking-[-.08em] text-[#2c2d27] dark:text-[#e8e9e2]">4</span>
        </div>

        <h1 className="mt-12 font-[Manrope_Variable] text-[clamp(2rem,6vw,3.6rem)] font-extrabold leading-tight tracking-[-.055em]">{t.heading}</h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--yahro-muted)] dark:text-[var(--yahro-muted)] sm:text-base">{t.body}</p>
        <FlowButton label={t.home} onClick={onHome} className="mt-8" />
        <button type="button" onClick={() => setHelpOpen((open) => !open)} aria-expanded={helpOpen} className="yahro-touch-target mt-5 flex items-center text-sm font-semibold text-[var(--yahro-muted)] underline decoration-black/20 underline-offset-4 hover:text-[#3d4f29] dark:text-[var(--yahro-muted)] dark:decoration-white/20 dark:hover:text-[#c8e4a4]">
          {t.help}
        </button>
        {helpOpen && <p className="animate-soft-pop mt-4 max-w-lg rounded-2xl border border-black/7 bg-white/70 px-5 py-4 text-left text-xs leading-relaxed text-[#686a62] shadow-sm dark:border-white/8 dark:bg-white/[.045] dark:text-[#b3b5ad]">{t.explanation}</p>}
      </section>
    </main>
  );
}
