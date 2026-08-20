import { useEffect, useState } from "react";
import { ArrowLeft, Globe2, Moon, ShieldCheck, Sun } from "lucide-react";
import type { LandingLanguage } from "@/components/landing-page";
import { setPageMetadata } from "@/lib/page-metadata";

type LegalKind = "privacy" | "terms";

interface LegalPageProps {
  kind: LegalKind;
  onHome: () => void;
}

const copy = {
  fr: {
    home: "Accueil",
    privacy: "Confidentialité",
    terms: "Conditions d'utilisation",
    updated: "Version de développement mise à jour le 20 août 2026",
    back: "Retour à l'accueil",
    privacyIntro: "Cette page explique de façon simple quelles données Yahro utilise et pourquoi. Yahro est un outil de suivi: il ne réalise aucune opération bancaire.",
    privacySections: [
      ["Données concernées", "Les informations de compte, vos préférences, votre photo ou avatar facultatif, les données financières que vous saisissez manuellement et les informations techniques nécessaires à la sécurité des sessions."],
      ["Utilisation", "Ces données servent à authentifier votre compte, personnaliser votre espace, enregistrer votre suivi budgétaire et protéger l'accès à l'application."],
      ["Sécurité", "Les mots de passe ne sont pas conservés en clair. Yahro applique une authentification renforcée, une vérification par email, la double authentification facultative et des contrôles de session."],
      ["Partage et publicité", "Yahro ne vend pas vos données et n'intègre aucun suivi publicitaire. Aucun accès à un compte bancaire n'est requis pour noter vos opérations."],
      ["Vos choix", "Vous gardez la maîtrise des informations de profil et des données saisies. Les modalités complètes d'accès, d'export et de suppression seront publiées avant l'ouverture de Yahro au public."],
    ],
    termsIntro: "Ces conditions décrivent le cadre d'utilisation de la version de développement de Yahro.",
    termsSections: [
      ["Objet", "Yahro permet de noter et d'organiser des informations financières personnelles afin d'en faciliter le suivi. Yahro n'est ni une banque, ni un service de paiement, ni un conseiller financier."],
      ["Exactitude des informations", "Vous restez responsable des montants, catégories, taux de change personnalisés et autres informations que vous saisissez."],
      ["Protection du compte", "Vous devez utiliser un mot de passe unique, protéger vos codes de récupération et signaler tout accès suspect. La double authentification est vivement recommandée."],
      ["Usage autorisé", "L'application ne doit pas être utilisée pour contourner la loi, accéder au compte d'une autre personne ou compromettre la sécurité du service."],
      ["Évolution du service", "Cette version est encore en développement. Les fonctions et ces conditions peuvent évoluer avant une mise à disposition publique."],
    ],
  },
  en: {
    home: "Home",
    privacy: "Privacy",
    terms: "Terms of use",
    updated: "Development version updated on August 20, 2026",
    back: "Back to home",
    privacyIntro: "This page explains in plain language which data Yahro uses and why. Yahro is a tracking tool: it does not perform banking transactions.",
    privacySections: [
      ["Data involved", "Account information, preferences, your optional photo or avatar, financial data you enter manually, and technical information required to secure sessions."],
      ["Use", "This data is used to authenticate your account, personalize your space, store your budget tracking and protect access to the application."],
      ["Security", "Passwords are not stored in plain text. Yahro uses strengthened authentication, email verification, optional two-factor authentication and session controls."],
      ["Sharing and advertising", "Yahro does not sell your data and includes no advertising tracking. Access to a bank account is not required to record transactions."],
      ["Your choices", "You retain control of your profile information and entered data. Complete access, export and deletion procedures will be published before Yahro opens to the public."],
    ],
    termsIntro: "These terms describe the framework for using the development version of Yahro.",
    termsSections: [
      ["Purpose", "Yahro lets you record and organize personal financial information for easier tracking. Yahro is not a bank, payment service or financial adviser."],
      ["Information accuracy", "You remain responsible for amounts, categories, custom exchange rates and other information you enter."],
      ["Account protection", "Use a unique password, protect recovery codes and report suspicious access. Two-factor authentication is strongly recommended."],
      ["Authorized use", "The application must not be used to evade the law, access another person's account or compromise the service's security."],
      ["Service changes", "This version is still in development. Features and these terms may change before public availability."],
    ],
  },
} as const;

export default function LegalPage({ kind, onHome }: LegalPageProps) {
  const [language, setLanguage] = useState<LandingLanguage>(() => (window.localStorage.getItem("yahro-language") === "en" ? "en" : "fr"));
  const [theme, setTheme] = useState<"light" | "dark">(() => (window.localStorage.getItem("yahro-theme") === "dark" ? "dark" : "light"));
  const t = copy[language];
  const title = kind === "privacy" ? t.privacy : t.terms;
  const intro = kind === "privacy" ? t.privacyIntro : t.termsIntro;
  const sections = kind === "privacy" ? t.privacySections : t.termsSections;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.lang = language;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#080a07" : "#f7f7f3");
    setPageMetadata(`${title} | Yahro`, intro);
  }, [intro, language, theme, title]);

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
    <div className="min-h-screen bg-[#f7f7f3] text-yahro-text transition-colors dark:bg-[#080a07] dark:text-[#f1f2ec]">
      <header className="border-b border-black/7 bg-[#f7f7f3]/90 pt-[env(safe-area-inset-top)] backdrop-blur-xl dark:border-white/8 dark:bg-[#080a07]/90">
        <div className="mx-auto flex h-[72px] max-w-5xl items-center px-5 sm:px-8">
          <button type="button" onClick={onHome} className="flex items-center gap-2.5 rounded-xl" aria-label={t.home}>
            <span className="grid size-9 place-items-center overflow-hidden rounded-xl bg-white p-1 shadow-sm dark:bg-white/8"><img src="/brand/yahro-mark.png" alt="" className="size-full object-contain" /></span>
            <span className="font-[Manrope_Variable] text-lg font-extrabold tracking-[-.05em]">yahro</span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={toggleTheme} className="yahro-touch-target grid size-12 place-items-center rounded-xl lg:size-10 text-[#696b63] hover:bg-black/5 dark:text-[#b2b4ac] dark:hover:bg-white/7" aria-label={theme === "light" ? "Mode sombre" : "Mode clair"}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
          <button type="button" onClick={toggleLanguage} className="yahro-touch-target flex h-12 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-[#696b63] hover:bg-black/5 lg:h-10 dark:text-[#b2b4ac] dark:hover:bg-white/7" aria-label="Langue"><Globe2 size={17} />{language.toUpperCase()}</button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-20">
        <nav aria-label="Fil d'Ariane" className="flex items-center gap-2 text-xs text-[var(--yahro-muted)]">
          <button type="button" onClick={onHome} className="hover:text-[#506a34] hover:underline">{t.home}</button><span>/</span><span aria-current="page">{title}</span>
        </nav>
        <div className="mt-8 max-w-3xl">
          <span className="grid size-12 place-items-center rounded-2xl bg-[#e7f0d9] text-[#587539] dark:bg-[#293620] dark:text-[#badb92]"><ShieldCheck size={23} /></span>
          <h1 className="mt-6 font-[Manrope_Variable] text-4xl font-extrabold tracking-[-.055em] sm:text-6xl">{title}</h1>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[.1em] text-[#859072] dark:text-[#99ad82]">{t.updated}</p>
          <p className="mt-7 text-base leading-relaxed text-[#686a62] dark:text-[#b0b2aa] sm:text-lg">{intro}</p>
        </div>
        <div className="mt-12 grid max-w-3xl gap-4">
          {sections.map(([heading, body]) => <section key={heading} className="rounded-2xl border border-black/7 bg-white/65 p-6 dark:border-white/8 dark:bg-white/[.035]"><h2 className="font-[Manrope_Variable] text-lg font-bold">{heading}</h2><p className="mt-3 text-sm leading-relaxed text-[var(--yahro-muted)] dark:text-[#a5a79f]">{body}</p></section>)}
        </div>
        <button type="button" onClick={onHome} className="mt-10 inline-flex h-11 items-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-bold hover:bg-[#f0f1eb] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/9"><ArrowLeft size={16} />{t.back}</button>
      </main>
    </div>
  );
}
