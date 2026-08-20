import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  Check,
  CircleDollarSign,
  Eye,
  Globe2,
  HelpCircle,
  Landmark,
  LoaderCircle,
  LockKeyhole,
  MailCheck,
  Menu,
  Megaphone,
  Moon,
  PieChart,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  Sun,
  WalletCards,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, ApiError, type AuthResult } from "@/lib/api";
import { currencyName } from "@/lib/currencies";
import { setPageMetadata } from "@/lib/page-metadata";
import AccessibleDialog from "@/components/ui/accessible-dialog";

export type LandingLanguage = "fr" | "en";
type Theme = "light" | "dark";
type AuthMode = "signin" | "signup";

const countries = [
  { code: "CI", fr: "Côte d'Ivoire", en: "Cote d'Ivoire", currency: "XOF" },
  { code: "SN", fr: "Sénégal", en: "Senegal", currency: "XOF" },
  { code: "BJ", fr: "Bénin", en: "Benin", currency: "XOF" },
  { code: "BF", fr: "Burkina Faso", en: "Burkina Faso", currency: "XOF" },
  { code: "TG", fr: "Togo", en: "Togo", currency: "XOF" },
  { code: "ML", fr: "Mali", en: "Mali", currency: "XOF" },
  { code: "NE", fr: "Niger", en: "Niger", currency: "XOF" },
  { code: "GN", fr: "Guinée", en: "Guinea", currency: "GNF" },
  { code: "CM", fr: "Cameroun", en: "Cameroon", currency: "XAF" },
  { code: "GA", fr: "Gabon", en: "Gabon", currency: "XAF" },
  { code: "CG", fr: "Congo", en: "Congo", currency: "XAF" },
  { code: "CD", fr: "République démocratique du Congo", en: "Democratic Republic of the Congo", currency: "CDF" },
  { code: "GH", fr: "Ghana", en: "Ghana", currency: "GHS" },
  { code: "NG", fr: "Nigeria", en: "Nigeria", currency: "NGN" },
  { code: "MA", fr: "Maroc", en: "Morocco", currency: "MAD" },
  { code: "TN", fr: "Tunisie", en: "Tunisia", currency: "TND" },
  { code: "FR", fr: "France", en: "France", currency: "EUR" },
  { code: "BE", fr: "Belgique", en: "Belgium", currency: "EUR" },
  { code: "CH", fr: "Suisse", en: "Switzerland", currency: "CHF" },
  { code: "CA", fr: "Canada", en: "Canada", currency: "CAD" },
  { code: "US", fr: "États-Unis", en: "United States", currency: "USD" },
  { code: "GB", fr: "Royaume-Uni", en: "United Kingdom", currency: "GBP" },
] as const;
const availableCurrencies = [...new Set(countries.map((country) => country.currency))].sort();

interface LandingPageProps {
  onDemo: (language: LandingLanguage) => void;
  onAuthenticated: (language: LandingLanguage, result: AuthResult) => void;
}

const text: Record<LandingLanguage, Record<string, string>> = {
  fr: {
    features: "Fonctionnalités",
    how: "Comment ça marche",
    security: "Sécurité",
    faq: "Questions fréquentes",
    signIn: "Se connecter",
    signUp: "Créer un compte",
    badge: "Nouveau - Le budget partagé arrive",
    headlineA: "Votre argent.",
    headlineB: "Enfin sous contrôle.",
    description:
      "Suivez vos dépenses, construisez des budgets réalistes et avancez vers vos projets - sans tableur compliqué.",
    start: "Commencer gratuitement",
    demo: "Voir la démo",
    noCard: "Gratuit en local - Sans carte bancaire",
    previewLabel: "Un aperçu de votre espace",
    trusted: "Pensé pour rendre vos finances plus simples, pas plus stressantes.",
    featureEyebrow: "Tout devient plus clair",
    featureTitle: "Les bons outils, sans le bruit.",
    featureDescription: "Une vue nette de votre argent pour prendre de meilleures décisions au quotidien.",
    smartBudget: "Budgets intelligents",
    smartBudgetText: "Fixez vos limites par catégorie et sachez exactement ce qu'il vous reste.",
    allAccounts: "Tous vos comptes",
    allAccountsText: "Comptes, espèces et épargne réunis dans une seule vue cohérente.",
    usefulAlerts: "Alertes utiles",
    usefulAlertsText: "Soyez prévenu avant de dépasser, pas quand il est déjà trop tard.",
    flowEyebrow: "Simple dès le premier jour",
    flowTitle: "Trois étapes. Une vision complète.",
    step1: "Ajoutez vos comptes",
    step1Text: "Commencez avec vos soldes actuels, sans connexion bancaire obligatoire.",
    step2: "Classez vos dépenses",
    step2Text: "Catégories personnalisables et import CSV pour gagner du temps.",
    step3: "Pilotez vos objectifs",
    step3Text: "Suivez vos budgets et votre progression mois après mois.",
    secureEyebrow: "Vos données vous appartiennent",
    secureTitle: "Conçu avec la confidentialité en tête.",
    secureText: "Vos données servent uniquement à votre suivi dans Yahro. L'application ne déclenche aucune opération bancaire et la démonstration reste sur votre appareil.",
    local: "Saisie manuelle",
    noTracking: "Aucun suivi publicitaire",
    exportAnytime: "Aucune opération bancaire",
    faqEyebrow: "Questions fréquentes",
    faqTitle: "L'essentiel, sans zone floue.",
    faqIntro: "Quelques réponses avant de commencer votre suivi avec Yahro.",
    faq1: "Yahro se connecte-t-il à ma banque ?",
    faq1Answer: "Non. Vous notez vous-même vos entrées, sorties et soldes. Yahro ne peut ni déplacer votre argent ni déclencher un paiement.",
    faq2: "Puis-je distinguer les espèces des paiements électroniques ?",
    faq2Answer: "Oui. Chaque opération peut être associée à des espèces, un compte bancaire, une carte, un portefeuille mobile ou une autre méthode électronique.",
    faq3: "Les budgets sont-ils uniquement mensuels ?",
    faq3Answer: "Non. Vous pouvez choisir un rythme hebdomadaire, toutes les deux semaines, mensuel, trimestriel, semestriel ou annuel selon votre besoin.",
    faq4: "Comment fonctionnent les devises et les taux de change ?",
    faq4Answer: "La devise est proposée selon votre pays, puis reste modifiable. Vous pouvez utiliser un taux de référence ou saisir votre propre taux pour refléter celui d'un organisme.",
    faq5: "Comment mon compte est-il protégé ?",
    faq5Answer: "Yahro combine la vérification de l'adresse email, des sessions contrôlées et une double authentification facultative par code. Un mot de passe unique reste indispensable.",
    ctaTitle: "Prêt à voir plus clair ?",
    ctaText: "Prenez deux minutes pour découvrir une façon plus sereine de gérer votre budget.",
    footer: "Votre budget, simplement.",
    privacy: "Confidentialité",
    terms: "Conditions",
    authTitleIn: "Bon retour parmi nous",
    authTitleUp: "Créez votre espace Yahro",
    authTextIn: "Connectez-vous pour retrouver votre tableau de bord.",
    authTextUp: "Commencez à organiser vos finances en quelques minutes.",
    email: "Adresse e-mail",
    password: "Mot de passe",
    firstName: "Prénom",
    lastName: "Nom",
    nickname: "Surnom affiché",
    nicknameHelp: "Utilisé dans Yahro. Si ce champ reste vide, votre prénom sera utilisé.",
    country: "Pays de résidence",
    currency: "Devise principale",
    currencyHelp: "Proposée selon votre pays, mais vous pouvez la modifier.",
    confirmPassword: "Confirmer le mot de passe",
    legalConsent: "J'accepte les conditions d'utilisation et la politique de confidentialité.",
    legalPrefix: "J'accepte les",
    legalAnd: "et la",
    forgot: "Mot de passe oublié ?",
    continue: "Continuer",
    or: "ou",
    demoSession: "Ouvrir une session de démonstration",
    switchToUp: "Pas encore de compte ?",
    switchToIn: "Déjà un compte ?",
    localNotice: "Connexion sécurisée à votre espace Yahro.",
    verificationSent: "Compte créé. Consultez votre email pour confirmer votre adresse.",
    checkEmailTitle: "Confirmez votre adresse email",
    checkEmailText: "Nous avons envoyé un lien de confirmation à",
    checkEmailHint: "Ouvrez le lien dans cet email pour activer votre compte. Pensez à vérifier les courriers indésirables.",
    resendEmail: "Renvoyer l'email",
    resendIn: "Renvoyer dans",
    emailResent: "Un nouveau lien de confirmation a été envoyé.",
    useAnotherEmail: "Utiliser une autre adresse",
    alreadyVerified: "Adresse déjà confirmée ? Se connecter",
    closeAuth: "Fermer",
    resetSent: "Si ce compte existe, un email de réinitialisation sera envoyé.",
    otpCode: "Code de vérification",
    otpHelp: "Saisissez le code à 6 chiffres de votre application ou un code de récupération.",
    totalBalance: "Solde total",
    income: "Revenus",
    expenses: "Dépenses",
    monthlyBudget: "Budget mensuel",
    recent: "Transactions récentes",
  },
  en: {
    features: "Features",
    how: "How it works",
    security: "Security",
    faq: "FAQ",
    signIn: "Sign in",
    signUp: "Create account",
    badge: "New - Shared budgets are coming",
    headlineA: "Your money.",
    headlineB: "Finally under control.",
    description:
      "Track spending, build realistic budgets and move toward your goals - without a complicated spreadsheet.",
    start: "Start for free",
    demo: "View demo",
    noCard: "Free locally - No credit card",
    previewLabel: "A preview of your space",
    trusted: "Built to make your finances simpler, not more stressful.",
    featureEyebrow: "Everything becomes clearer",
    featureTitle: "The right tools, without the noise.",
    featureDescription: "A clear view of your money so you can make better everyday decisions.",
    smartBudget: "Smart budgets",
    smartBudgetText: "Set limits by category and know exactly what you have left.",
    allAccounts: "All your accounts",
    allAccountsText: "Accounts, cash and savings brought together in one coherent view.",
    usefulAlerts: "Useful alerts",
    usefulAlertsText: "Get notified before you overspend, not when it's already too late.",
    flowEyebrow: "Simple from day one",
    flowTitle: "Three steps. One complete view.",
    step1: "Add your accounts",
    step1Text: "Start with current balances, with no mandatory bank connection.",
    step2: "Categorize spending",
    step2Text: "Custom categories and CSV import help you save time.",
    step3: "Drive your goals",
    step3Text: "Track your budgets and progress month after month.",
    secureEyebrow: "Your data belongs to you",
    secureTitle: "Designed with privacy in mind.",
    secureText: "Your data is used only for your tracking in Yahro. The application cannot perform banking transactions and demo data stays on your device.",
    local: "Manual entry",
    noTracking: "No advertising tracking",
    exportAnytime: "No banking transaction",
    faqEyebrow: "Frequently asked questions",
    faqTitle: "The essentials, with no grey areas.",
    faqIntro: "A few answers before you start tracking with Yahro.",
    faq1: "Does Yahro connect to my bank?",
    faq1Answer: "No. You record income, expenses and balances yourself. Yahro cannot move your money or initiate a payment.",
    faq2: "Can I separate cash from electronic payments?",
    faq2Answer: "Yes. Each transaction can be linked to cash, a bank account, a card, a mobile wallet or another electronic method.",
    faq3: "Are budgets monthly only?",
    faq3Answer: "No. You can choose weekly, biweekly, monthly, quarterly, half-yearly or yearly tracking to fit your needs.",
    faq4: "How do currencies and exchange rates work?",
    faq4Answer: "A currency is suggested from your country and remains editable. You may use a reference rate or enter your own rate to match an organization's rate.",
    faq5: "How is my account protected?",
    faq5Answer: "Yahro combines email verification, controlled sessions and optional code-based two-factor authentication. A unique password remains essential.",
    ctaTitle: "Ready to see things clearly?",
    ctaText: "Take two minutes to discover a calmer way to manage your budget.",
    footer: "Your budget, simply.",
    privacy: "Privacy",
    terms: "Terms",
    authTitleIn: "Welcome back",
    authTitleUp: "Create your Yahro space",
    authTextIn: "Sign in to return to your dashboard.",
    authTextUp: "Start organizing your finances in just a few minutes.",
    email: "Email address",
    password: "Password",
    firstName: "First name",
    lastName: "Last name",
    nickname: "Display nickname",
    nicknameHelp: "Used across Yahro. If left blank, your first name will be used.",
    country: "Country of residence",
    currency: "Main currency",
    currencyHelp: "Suggested from your country, but you can change it.",
    confirmPassword: "Confirm password",
    legalConsent: "I accept the terms of use and the privacy policy.",
    legalPrefix: "I accept the",
    legalAnd: "and the",
    forgot: "Forgot password?",
    continue: "Continue",
    or: "or",
    demoSession: "Open a demo session",
    switchToUp: "Don't have an account?",
    switchToIn: "Already have an account?",
    localNotice: "Secure connection to your Yahro space.",
    verificationSent: "Account created. Check your email to confirm your address.",
    checkEmailTitle: "Confirm your email address",
    checkEmailText: "We sent a confirmation link to",
    checkEmailHint: "Open the link in that email to activate your account. Remember to check your spam folder.",
    resendEmail: "Resend email",
    resendIn: "Resend in",
    emailResent: "A new confirmation link was sent.",
    useAnotherEmail: "Use another address",
    alreadyVerified: "Already confirmed? Sign in",
    closeAuth: "Close",
    resetSent: "If this account exists, a reset email will be sent.",
    otpCode: "Verification code",
    otpHelp: "Enter the 6-digit code from your authenticator app or a recovery code.",
    totalBalance: "Total balance",
    income: "Income",
    expenses: "Expenses",
    monthlyBudget: "Monthly budget",
    recent: "Recent transactions",
  },
};

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <a href="#top" className="yahro-touch-target flex items-center gap-2.5" aria-label="Yahro home">
      <span className="grid size-9 place-items-center overflow-hidden rounded-xl bg-[#ecefe5] p-1 dark:bg-white/8">
        <img src="/brand/yahro-mark.png" alt="" className="size-full object-contain" />
      </span>
      {!compact && <span className="font-[Manrope_Variable] text-[1.08rem] font-extrabold tracking-[-.05em]">yahro</span>}
    </a>
  );
}

function DashboardPreview({ language }: { language: LandingLanguage }) {
  const t = (key: string) => text[language][key];
  const bars = [42, 60, 48, 75, 58, 84, 72, 88, 76, 93, 82, 96];
  return (
    <div className="relative mx-auto w-full max-w-[1120px] overflow-hidden rounded-[22px] border border-black/10 bg-[#f6f6f2] text-[#22231e] shadow-[0_35px_100px_rgba(31,33,26,.22)] dark:border-white/10 dark:bg-[#171813] dark:text-[#efefe9] dark:shadow-[0_35px_120px_rgba(0,0,0,.7)]">
      <div className="flex h-12 items-center border-b border-black/8 bg-white/80 px-4 dark:border-white/8 dark:bg-[#1d1e1a]">
        <div className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#ff6b5f]" /><span className="size-2.5 rounded-full bg-[#f4bc4f]" /><span className="size-2.5 rounded-full bg-[#62c554]" /></div>
        <div className="mx-auto flex h-6 w-52 items-center rounded-md bg-black/[.04] px-2 text-[8px] text-[var(--yahro-muted)] dark:bg-white/5">app.yahro.local</div>
      </div>
      <div className="grid min-h-[460px] grid-cols-[180px_1fr] max-md:grid-cols-[64px_1fr] sm:min-h-[510px]">
        <aside className="border-r border-black/7 bg-white/50 p-3 dark:border-white/7 dark:bg-[#1b1c17]">
          <div className="mb-7 flex items-center gap-2 px-2"><Logo compact /><span className="font-[Manrope_Variable] text-xs font-extrabold max-md:hidden">yahro</span></div>
          {[WalletCards, ReceiptText, PieChart, BarChart3].map((Icon, index) => (
            <div key={index} className={cn("mb-1 flex h-9 items-center gap-2 rounded-lg px-2 text-[9px]", index === 0 ? "bg-[#e7f0d9] text-[#48612d] dark:bg-[#293620] dark:text-[#c6dfa4]" : "text-[var(--yahro-muted)]")}>
              <Icon size={13} /><span className="max-md:hidden">{["Overview", "Transactions", "Budgets", "Analytics"][index]}</span>
            </div>
          ))}
        </aside>
        <div className="min-w-0 p-4 sm:p-6">
          <div className="mb-5 flex items-center justify-between">
            <div><p className="font-[Manrope_Variable] text-base font-extrabold sm:text-xl">Dashboard</p><p className="mt-1 text-[8px] text-[var(--yahro-muted)] sm:text-[10px]">August 2026 - Personal workspace</p></div>
            <div className="flex items-center gap-2"><span className="hidden h-7 w-36 items-center rounded-lg bg-white px-2 text-[8px] text-[var(--yahro-muted)] shadow-sm dark:bg-white/5 sm:flex">Search...</span><span className="grid size-7 place-items-center rounded-lg bg-white dark:bg-white/5"><BellRing size={12} /></span></div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            {[
              { label: t("totalBalance"), value: "14 963,50 €", accent: true },
              { label: t("income"), value: "4 520 €" },
              { label: t("expenses"), value: "2 402 €" },
              { label: "Savings", value: "36,8 %" },
            ].map((stat) => (
              <div key={stat.label} className={cn("rounded-xl border p-3 sm:p-4", stat.accent ? "border-[#20211d] bg-[#20211d] text-white dark:border-[#dcebc5] dark:bg-[#dcebc5] dark:text-[#202b13]" : "border-black/7 bg-white dark:border-white/7 dark:bg-[#20211d]")}>
                <p className={cn("text-[8px] sm:text-[10px]", stat.accent ? "opacity-55" : "text-[var(--yahro-muted)]")}>{stat.label}</p>
                <p className="mt-2 font-[Manrope_Variable] text-sm font-extrabold tracking-[-.04em] sm:text-lg">{stat.value}</p>
                <p className="mt-1 text-[7px] font-bold text-[#769450]">+ 8.2%</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[1.45fr_.75fr]">
            <div className="rounded-xl border border-black/7 bg-white p-3 dark:border-white/7 dark:bg-[#20211d] sm:p-4">
              <div className="mb-3 flex items-center justify-between"><p className="text-[10px] font-bold sm:text-xs">Cash flow</p><p className="text-[8px] text-[var(--yahro-muted)]">Last 6 months</p></div>
              <div className="flex h-28 items-end gap-1.5 border-b border-black/6 dark:border-white/7 sm:h-36 sm:gap-2">
                {bars.map((height, index) => <div key={index} className="group relative flex-1"><div className="absolute bottom-0 w-full rounded-t-sm bg-[#dce9ca] dark:bg-[#35452a]" style={{ height: `${Math.max(18, height - 24)}%` }} /><div className="absolute bottom-0 w-full rounded-t-sm bg-[#779850]" style={{ height: `${height}%`, opacity: .88 }} /></div>)}
              </div>
            </div>
            <div className="rounded-xl border border-black/7 bg-white p-3 dark:border-white/7 dark:bg-[#20211d] sm:p-4">
              <div className="flex items-center justify-between"><p className="text-[10px] font-bold sm:text-xs">{t("monthlyBudget")}</p><PieChart size={13} className="text-[#769450]" /></div>
              <div className="mx-auto my-3 grid size-20 place-items-center rounded-full bg-[conic-gradient(#769450_0_66%,#e8e9e3_66%)] dark:bg-[conic-gradient(#90b566_0_66%,#353730_66%)] sm:size-24"><div className="grid size-14 place-items-center rounded-full bg-white text-center dark:bg-[#20211d] sm:size-17"><span className="text-sm font-extrabold">66%</span></div></div>
              <p className="text-center text-[8px] text-[var(--yahro-muted)]">1 858 € / 2 800 €</p>
            </div>
          </div>
          <div className="mt-3 rounded-xl border border-black/7 bg-white p-3 dark:border-white/7 dark:bg-[#20211d] sm:p-4">
            <p className="mb-2 text-[10px] font-bold sm:text-xs">{t("recent")}</p>
            {[{name:"Carrefour Market",value:"-84,30 €"},{name:"Salary - ENSEA",value:"+2 450 €"}].map((item, index) => <div key={item.name} className="flex items-center gap-2 border-t border-black/5 py-2 first:border-0 dark:border-white/6"><span className={cn("grid size-6 place-items-center rounded-md", index ? "bg-[#e4efdb] text-[#668645]" : "bg-[#f1eadc] text-[#a17028]")}>{index ? <Landmark size={11} /> : <ReceiptText size={11} />}</span><span className="flex-1 text-[8px] sm:text-[9px]">{item.name}</span><span className={cn("text-[8px] font-bold sm:text-[9px]", index > 0 && "text-[#668645]")}>{item.value}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthDialog({ mode, language, onModeChange, onClose, onDemo, onAuthenticated }: { mode: AuthMode; language: LandingLanguage; onModeChange: (mode: AuthMode) => void; onClose: () => void; onDemo: () => void; onAuthenticated: (result: AuthResult) => void }) {
  const t = (key: string) => text[language][key];
  const isSignIn = mode === "signin";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [countryCode, setCountryCode] = useState("CI");
  const [currency, setCurrency] = useState("XOF");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const formRef = React.useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => setResendCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      if (mfaToken) {
        const verified = await api.verifyMfa(mfaToken, mfaCode);
        const profile = await api.me(verified.accessToken);
        onAuthenticated({ accessToken: verified.accessToken, expiresIn: verified.expiresIn, user: profile.user, tenant: profile.tenant });
      } else if (isSignIn) {
        const result = await api.login(email, password);
        if ("mfaRequired" in result) {
          setMfaToken(result.mfaToken);
          setPassword("");
          setMessage({ tone: "success", text: t("otpHelp") });
        } else {
          const profile = await api.me(result.accessToken);
          onAuthenticated({ ...result, user: profile.user, tenant: profile.tenant });
        }
      } else {
        if (password !== passwordConfirmation) {
          setMessage({ tone: "error", text: language === "fr" ? "Les deux mots de passe ne correspondent pas." : "The two passwords do not match." });
          return;
        }
        if (!legalAccepted) {
          setMessage({ tone: "error", text: language === "fr" ? "Vous devez accepter les conditions et la politique de confidentialité." : "You must accept the terms and privacy policy." });
          return;
        }
        await api.register({
          email,
          password,
          passwordConfirmation,
          firstName,
          lastName,
          nickname: nickname.trim() || firstName.trim(),
          countryCode,
          locale: language,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Abidjan",
          currency,
          acceptTerms: true,
          acceptPrivacy: true,
        });
        setPassword("");
        setPasswordConfirmation("");
        setVerificationEmail(email.trim());
        setResendCooldown(30);
        setMessage(null);
      }
    } catch (error) {
      const code = error instanceof ApiError ? error.code : "NETWORK_ERROR";
      if (code === "EMAIL_NOT_VERIFIED") {
        setPassword("");
        setVerificationEmail(email.trim());
        setResendCooldown(0);
        setMessage(null);
        return;
      }
      const errorText = code === "INVALID_MFA_CODE"
        ? language === "fr" ? "Code incorrect, expiré ou déjà utilisé." : "The code is invalid, expired or already used."
        : code === "EMAIL_NOT_VERIFIED"
        ? language === "fr" ? "Confirmez votre adresse email avant de vous connecter." : "Confirm your email before signing in."
        : code === "INVALID_CREDENTIALS"
          ? language === "fr" ? "Adresse email ou mot de passe incorrect." : "Invalid email or password."
          : code === "VALIDATION_ERROR"
            ? language === "fr" ? "Vérifiez les informations saisies et réessayez." : "Check the information entered and try again."
          : language === "fr" ? "Impossible de contacter Yahro. Vérifiez votre connexion et réessayez." : "Yahro could not be reached. Check your connection and try again.";
      setMessage({ tone: "error", text: errorText });
    } finally {
      setPending(false);
    }
  };

  const resendVerification = async () => {
    if (!verificationEmail || resendCooldown > 0) return;
    setPending(true);
    setMessage(null);
    try {
      await api.resendVerification(verificationEmail);
      setResendCooldown(30);
      setMessage({ tone: "success", text: t("emailResent") });
    } catch {
      setMessage({ tone: "error", text: language === "fr" ? "Le renvoi a échoué. Réessayez plus tard." : "The resend failed. Please try again later." });
    } finally {
      setPending(false);
    }
  };

  const requestReset = async () => {
    if (!email) {
      setMessage({ tone: "error", text: language === "fr" ? "Saisissez d'abord votre adresse email." : "Enter your email address first." });
      return;
    }
    setPending(true);
    try {
      await api.requestPasswordReset(email);
      setMessage({ tone: "success", text: t("resetSent") });
    } catch {
      setMessage({ tone: "error", text: language === "fr" ? "La demande a échoué. Réessayez plus tard." : "The request failed. Please try again later." });
    } finally {
      setPending(false);
    }
  };

  const advanceSignup = () => {
    setMessage(null);
    if (!formRef.current?.reportValidity()) return;
    if (password !== passwordConfirmation) {
      setMessage({ tone: "error", text: language === "fr" ? "Les deux mots de passe ne correspondent pas." : "The two passwords do not match." });
      return;
    }
    setSignupStep(2);
    window.requestAnimationFrame(() => {
      const dialog = formRef.current?.closest<HTMLElement>("[role='dialog']");
      dialog?.scrollTo({ top: 0, behavior: "smooth" });
      formRef.current?.querySelector<HTMLElement>("[name='country']")?.focus();
    });
  };

  return (
    <AccessibleDialog
      titleId="auth-dialog-title"
      descriptionId="auth-dialog-description"
      onClose={onClose}
      overlayClassName="z-[100] bg-black/50 backdrop-blur-md sm:p-5"
      className={cn("animate-soft-pop border-black/8 bg-[#fbfbf8] dark:border-white/10 dark:bg-[#1d1e1a] sm:p-8", verificationEmail ? "sm:max-w-[500px]" : isSignIn ? "sm:max-w-[450px]" : "sm:max-w-[620px]")}
    >
        <div className="mb-7 flex items-center justify-between"><Logo /><button type="button" onClick={onClose} className="yahro-touch-target group grid size-12 place-items-center rounded-full border border-black/8 bg-white/75 text-[var(--yahro-muted)] shadow-sm transition-all hover:-translate-y-0.5 hover:border-black/14 hover:bg-white hover:text-[#252620] hover:shadow-md active:translate-y-0 dark:border-white/10 dark:bg-white/5 dark:text-[#b9bbb3] dark:hover:border-white/18 dark:hover:bg-white/10 dark:hover:text-white lg:size-10" aria-label={t("closeAuth")}><X size={17} strokeWidth={2} className="transition-transform duration-200 group-hover:rotate-90" /></button></div>
        {verificationEmail ? (
          <div className="pb-1 text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-[#e8f1da] text-[#5d7d39] dark:bg-[#293820] dark:text-[#b8d793]"><MailCheck size={30} /></span>
            <h2 id="auth-dialog-title" className="mt-6 font-[Manrope_Variable] text-2xl font-extrabold tracking-[-.04em]">{t("checkEmailTitle")}</h2>
            <p id="auth-dialog-description" className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-[var(--yahro-muted)]">{t("checkEmailText")}<strong className="mt-1 block break-all text-[#252620] dark:text-[#f0f1eb]">{verificationEmail}</strong></p>
            <p className="mx-auto mt-5 max-w-md rounded-2xl border border-black/7 bg-white/70 px-4 py-3 text-xs leading-relaxed text-[var(--yahro-muted)] dark:border-white/8 dark:bg-white/[.035] dark:text-[#afb1a9]">{t("checkEmailHint")}</p>
            {message && <p role="status" className={cn("mt-4 rounded-xl px-3 py-2 text-xs", message.tone === "success" ? "bg-[#edf3e4] text-[#607247] dark:bg-[#27331f] dark:text-[#b5ca98]" : "bg-[#f5e5e1] text-[#a25140] dark:bg-[#412925] dark:text-[#e49a89]")}>{message.text}</p>}
            <button type="button" disabled={pending || resendCooldown > 0} onClick={resendVerification} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#20211d] text-sm font-bold text-white transition-transform active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-55 dark:bg-[#dcebc5] dark:text-[#202b13]">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={15} />}{resendCooldown > 0 ? `${t("resendIn")} ${resendCooldown} s` : t("resendEmail")}</button>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => { setVerificationEmail(null); setMessage(null); setResendCooldown(0); }} className="h-10 rounded-xl border border-black/10 bg-white text-xs font-bold hover:bg-[#f5f5f1] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8">{t("useAnotherEmail")}</button>
              <button type="button" onClick={() => { setVerificationEmail(null); setMessage(null); setResendCooldown(0); onModeChange("signin"); }} className="h-10 rounded-xl px-3 text-xs font-bold text-[#668744] hover:bg-[#edf3e4] dark:text-[#acd082] dark:hover:bg-[#27331f]">{t("alreadyVerified")}</button>
            </div>
          </div>
        ) : (
          <>
        {isSignIn && !mfaToken && <span className="mx-auto mb-5 grid size-13 place-items-center rounded-[18px] bg-[#e8f1da] text-[#5d7d39] dark:bg-[#293820] dark:text-[#b8d793]"><LockKeyhole size={23} /></span>}
        <h2 id="auth-dialog-title" className={cn("font-[Manrope_Variable] text-2xl font-extrabold tracking-[-.04em]", isSignIn && !mfaToken && "text-center text-[28px]")}>{mfaToken ? t("otpCode") : t(isSignIn ? "authTitleIn" : "authTitleUp")}</h2>
        <p id="auth-dialog-description" className={cn("mt-2 text-sm leading-relaxed text-[var(--yahro-muted)]", isSignIn && !mfaToken && "text-center")}>{mfaToken ? t("otpHelp") : t(isSignIn ? "authTextIn" : "authTextUp")}</p>
        {!isSignIn && !mfaToken && <div className="mt-5" aria-label={language === "fr" ? `Étape ${signupStep} sur 2` : `Step ${signupStep} of 2`}><div className="mb-2 flex justify-between text-xs font-semibold text-[var(--yahro-muted)]"><span>{language === "fr" ? `Étape ${signupStep} sur 2` : `Step ${signupStep} of 2`}</span><span>{signupStep === 1 ? (language === "fr" ? "Votre identité" : "Your identity") : (language === "fr" ? "Vos préférences" : "Your preferences")}</span></div><div className="grid grid-cols-2 gap-2" aria-hidden="true"><span className="h-1.5 rounded-full bg-[#789751]" /><span className={cn("h-1.5 rounded-full", signupStep === 2 ? "bg-[#789751]" : "bg-black/10 dark:bg-white/10")} /></div></div>}
        <form ref={formRef} className="mt-6" onSubmit={submit}>
          {mfaToken ? (
            <label className="mb-5 block text-xs font-semibold">{t("otpCode")}<input data-autofocus type="text" required minLength={6} maxLength={32} inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} placeholder="123456" className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-center font-mono text-lg tracking-[.18em] dark:border-white/10 dark:bg-[#171813]" /></label>
          ) : (
            <>
              {!isSignIn && signupStep === 1 && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-semibold">{t("firstName")}<input data-autofocus name="given-name" type="text" required minLength={1} maxLength={80} autoComplete="given-name" value={firstName} onChange={(event) => setFirstName(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-base font-normal dark:border-white/10 dark:bg-[#171813] sm:h-11 sm:text-sm" /></label>
                    <label className="block text-sm font-semibold">{t("lastName")}<input name="family-name" type="text" required minLength={1} maxLength={80} autoComplete="family-name" value={lastName} onChange={(event) => setLastName(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-base font-normal dark:border-white/10 dark:bg-[#171813] sm:h-11 sm:text-sm" /></label>
                  </div>
                  <label className="mt-4 block text-sm font-semibold">{t("nickname")} <span className="font-normal text-[var(--yahro-muted)]">({language === "fr" ? "facultatif" : "optional"})</span><input name="nickname" type="text" maxLength={40} autoComplete="nickname" value={nickname} onChange={(event) => setNickname(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-base font-normal dark:border-white/10 dark:bg-[#171813] sm:h-11 sm:text-sm" /><span className="mt-1.5 block font-normal text-[var(--yahro-muted)]">{t("nicknameHelp")}</span></label>
                </>
              )}
              {!isSignIn && signupStep === 2 && <div className="mb-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-sm font-semibold">{t("country")}<select data-autofocus name="country" required autoComplete="country" value={countryCode} onChange={(event) => { const nextCode = event.target.value; setCountryCode(nextCode); setCurrency(countries.find((country) => country.code === nextCode)?.currency ?? "XOF"); }} className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-base font-normal dark:border-white/10 dark:bg-[#171813] sm:h-11 sm:text-sm">{countries.map((country) => <option key={country.code} value={country.code}>{country[language]}</option>)}</select></label>
                <label className="block text-sm font-semibold">{t("currency")}<select name="currency" required value={currency} onChange={(event) => setCurrency(event.target.value)} className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-base font-normal dark:border-white/10 dark:bg-[#171813] sm:h-11 sm:text-sm">{availableCurrencies.map((code) => <option key={code} value={code}>{currencyName(code, language)}</option>)}</select><span className="mt-1.5 block font-normal text-[var(--yahro-muted)]">{t("currencyHelp")}</span></label>
              </div>}
              {(isSignIn || signupStep === 1) && <>
                <label className="mb-4 block text-sm font-semibold">{t("email")}<input data-autofocus={isSignIn || undefined} name="email" type="email" required inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="vous@exemple.com" className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-base font-normal placeholder:text-[var(--yahro-muted)] dark:border-white/10 dark:bg-[#171813] sm:h-11 sm:text-sm" /></label>
                <div className={cn("mb-5 grid gap-4", !isSignIn && "sm:grid-cols-2")}><label className="block text-sm font-semibold">{t("password")}<input name="password" type="password" required minLength={isSignIn ? 1 : 12} maxLength={128} autoComplete={isSignIn ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="************" className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-base font-normal placeholder:text-[var(--yahro-muted)] dark:border-white/10 dark:bg-[#171813] sm:h-11 sm:text-sm" /></label>{!isSignIn && <label className="block text-sm font-semibold">{t("confirmPassword")}<input name="password-confirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} placeholder="************" className="mt-2 h-12 w-full rounded-xl border border-black/10 bg-white px-3 text-base font-normal placeholder:text-[var(--yahro-muted)] dark:border-white/10 dark:bg-[#171813] sm:h-11 sm:text-sm" /></label>}</div>
              </>}
              {!isSignIn && signupStep === 2 && <label className="mb-5 flex min-h-12 cursor-pointer items-start gap-3 text-xs leading-relaxed text-[#666860] dark:text-[#b7b9b1]"><input type="checkbox" required checked={legalAccepted} onChange={(event) => setLegalAccepted(event.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#6f904b]" /><span>{t("legalPrefix")} <a href="/conditions" target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="font-semibold text-[#5f7e3e] underline underline-offset-2 dark:text-[#acd082]">{t("terms").toLocaleLowerCase(language)}</a> {t("legalAnd")} <a href="/confidentialite" target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="font-semibold text-[#5f7e3e] underline underline-offset-2 dark:text-[#acd082]">{t("privacy").toLocaleLowerCase(language)}</a>.</span></label>}
              {isSignIn && <button type="button" disabled={pending} onClick={requestReset} className="-mt-2 mb-5 block text-xs font-semibold text-[#668744] hover:underline disabled:opacity-50">{t("forgot")}</button>}
            </>
          )}
          {message && <p role="status" className={cn("mb-4 rounded-xl px-3 py-2 text-xs", message.tone === "success" ? "bg-[#edf3e4] text-[#607247] dark:bg-[#27331f] dark:text-[#b5ca98]" : "bg-[#f5e5e1] text-[#a25140] dark:bg-[#412925] dark:text-[#e49a89]")}>{message.text}</p>}
          {!isSignIn && !mfaToken && signupStep === 2 && <button type="button" onClick={() => { setSignupStep(1); setMessage(null); }} className="mb-3 flex h-12 w-full items-center justify-center rounded-xl border border-black/10 text-sm font-bold hover:bg-black/[.035] dark:border-white/10 dark:hover:bg-white/5">{language === "fr" ? "Retour" : "Back"}</button>}
          <button type={!isSignIn && !mfaToken && signupStep === 1 ? "button" : "submit"} onClick={!isSignIn && !mfaToken && signupStep === 1 ? advanceSignup : undefined} disabled={pending} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#20211d] text-sm font-bold text-white transition-transform active:scale-[.98] disabled:opacity-60 dark:bg-[#dcebc5] dark:text-[#202b13]">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <ArrowRight size={16} />}{t("continue")}</button>
        </form>
        <div className="my-5 flex items-center gap-3"><span className="h-px flex-1 bg-black/8 dark:bg-white/8" /><span className="text-[10px] uppercase tracking-widest text-[var(--yahro-muted)]">{t("or")}</span><span className="h-px flex-1 bg-black/8 dark:bg-white/8" /></div>
        <button type="button" onClick={onDemo} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white text-sm font-bold hover:bg-[#f5f5f1] dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/8"><Eye size={16} />{t("demoSession")}</button>
        <p className="mt-5 text-center text-xs text-[var(--yahro-muted)]">{t(isSignIn ? "switchToUp" : "switchToIn")} <button type="button" onClick={() => onModeChange(isSignIn ? "signup" : "signin")} className="font-bold text-[#5f7e3e] hover:underline dark:text-[#acd082]">{t(isSignIn ? "signUp" : "signIn")}</button></p>
        <p className="mt-4 rounded-xl bg-[#edf3e4] px-3 py-2 text-center text-[10px] text-[#607247] dark:bg-[#27331f] dark:text-[#b5ca98]">{t("localNotice")}</p>
          </>
        )}
    </AccessibleDialog>
  );
}

export default function LandingPage({ onDemo, onAuthenticated }: LandingPageProps) {
  const [language, setLanguage] = useState<LandingLanguage>(() => (window.localStorage.getItem("yahro-language") === "en" ? "en" : "fr"));
  const [theme, setTheme] = useState<Theme>(() => (window.localStorage.getItem("yahro-theme") === "dark" ? "dark" : "light"));
  const [menuOpen, setMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const t = (key: string) => text[language][key];

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.lang = language;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#080a07" : "#f7f7f3");
    setPageMetadata(
      language === "fr" ? "Yahro - Votre argent, enfin sous contrôle" : "Yahro - Your money, finally under control",
      language === "fr" ? "Suivez vos dépenses, vos budgets et vos projets dans un espace personnel sécurisé, sans connexion bancaire obligatoire." : "Track spending, budgets and projects in a secure personal space, with no mandatory bank connection.",
    );
  }, [theme, language]);

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
  const enterDemo = () => onDemo(language);
  const heroCtaRef = React.useRef<HTMLButtonElement>(null);
  const [showStickyCta, setShowStickyCta] = useState(false);

  useEffect(() => {
    const target = heroCtaRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setShowStickyCta(!entry.isIntersecting), { threshold: 0.4 });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <div id="top" className="min-h-screen overflow-hidden bg-[#f7f7f3] text-[#191a16] transition-colors dark:bg-[#080a07] dark:text-[#f4f4ef]">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-black/7 bg-[#f7f7f3]/82 pt-[env(safe-area-inset-top)] backdrop-blur-xl dark:border-white/8 dark:bg-[#080a07]/82">
        <nav className="mx-auto grid h-[72px] max-w-[1600px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 px-5 sm:px-8">
          <Logo />
          <div className="hidden min-w-0 items-center justify-center gap-6 min-[1340px]:flex min-[1500px]:gap-8">
            <a href="#features" className="text-sm font-medium text-[var(--yahro-muted)] transition-colors hover:text-[#1d1e19] dark:text-[var(--yahro-muted)] dark:hover:text-white">{t("features")}</a>
            <a href="#how" className="text-sm font-medium text-[var(--yahro-muted)] transition-colors hover:text-[#1d1e19] dark:text-[var(--yahro-muted)] dark:hover:text-white">{t("how")}</a>
            <a href="#security" className="text-sm font-medium text-[var(--yahro-muted)] transition-colors hover:text-[#1d1e19] dark:text-[var(--yahro-muted)] dark:hover:text-white">{t("security")}</a>
            <a href="#faq" className="text-sm font-medium text-[var(--yahro-muted)] transition-colors hover:text-[#1d1e19] dark:text-[var(--yahro-muted)] dark:hover:text-white">{t("faq")}</a>
          </div>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={toggleTheme} className="yahro-touch-target grid size-12 place-items-center rounded-xl text-[#696b63] hover:bg-black/5 dark:text-[#b2b4ac] dark:hover:bg-white/7 min-[1340px]:size-10" aria-label={theme === "light" ? "Dark mode" : "Light mode"}>{theme === "light" ? <Moon size={17} /> : <Sun size={17} />}</button>
            <button type="button" onClick={toggleLanguage} className="yahro-touch-target flex h-12 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-[#696b63] hover:bg-black/5 dark:text-[#b2b4ac] dark:hover:bg-white/7 min-[1340px]:h-10" aria-label="Language"><Globe2 size={16} />{language.toUpperCase()}</button>
            <button type="button" onClick={() => setAuthMode("signin")} className="ml-1 hidden h-12 rounded-xl px-3 text-sm font-semibold text-[#55574f] hover:bg-black/5 dark:text-[#d1d2cc] dark:hover:bg-white/7 sm:block min-[1340px]:h-10">{t("signIn")}</button>
            <button type="button" onClick={() => setAuthMode("signup")} className="hidden h-12 rounded-xl bg-[#20211d] px-4 text-sm font-bold text-white shadow-sm transition-all hover:-translate-y-0.5 dark:bg-[#f0f1eb] dark:text-[#141510] sm:block min-[1340px]:h-10">{t("signUp")}</button>
            <button type="button" onClick={() => setMenuOpen((open) => !open)} className="yahro-touch-target ml-1 grid size-12 place-items-center rounded-xl min-[1340px]:hidden" aria-label="Menu">{menuOpen ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </nav>
        {menuOpen && <div className="animate-soft-pop border-t border-black/6 bg-[#f7f7f3] px-5 py-4 dark:border-white/7 dark:bg-[#10110e] min-[1340px]:hidden"><div className="mx-auto flex max-w-[1320px] flex-col gap-1">{[["features", "#features"],["how", "#how"],["security", "#security"],["faq", "#faq"]].map(([key,href]) => <a key={key} href={href} onClick={() => setMenuOpen(false)} className="flex min-h-12 items-center rounded-xl px-3 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/6">{t(key)}</a>)}<div className="mt-2 grid grid-cols-2 gap-2 border-t border-black/7 pt-3 dark:border-white/7"><button type="button" onClick={() => setAuthMode("signin")} className="h-12 rounded-xl border border-black/10 text-sm font-bold dark:border-white/10">{t("signIn")}</button><button type="button" onClick={() => setAuthMode("signup")} className="h-12 rounded-xl bg-[#20211d] text-sm font-bold text-white dark:bg-[#e9eadf] dark:text-[#171813]">{t("signUp")}</button></div></div></div>}
      </header>

      <main>
        <section className="relative px-5 pb-10 pt-[calc(8rem+env(safe-area-inset-top))] sm:px-8 sm:pt-[calc(10rem+env(safe-area-inset-top))] lg:pt-[calc(11rem+env(safe-area-inset-top))]">
          <div className="pointer-events-none absolute left-1/2 top-12 h-[620px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(174,205,132,.18),transparent_65%)] opacity-60 blur-3xl dark:opacity-25" />
          <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
            <a href="#features" className="yahro-touch-target animate-fade-up mb-7 inline-flex items-center gap-2 rounded-full border border-black/10 bg-white/70 px-3.5 py-2 text-[11px] font-semibold text-[#696b63] shadow-sm backdrop-blur-md transition-transform hover:scale-[1.02] dark:border-white/10 dark:bg-white/5 dark:text-[#b8bab1]"><Megaphone size={13} className="text-[#73944b]" />{t("badge")}<ArrowRight size={12} /></a>
            <h1 className="animate-fade-up font-[Manrope_Variable] text-[clamp(2.65rem,7vw,6.2rem)] font-[650] leading-[.96] tracking-[-.065em]" style={{animationDelay:".05s"}}><span className="block">{t("headlineA")}</span><span className="mt-2 block bg-gradient-to-b from-[#262721] via-[#454740] to-[#84867e] bg-clip-text text-transparent dark:from-white dark:via-white dark:to-white/45">{t("headlineB")}</span></h1>
            <p className="animate-fade-up mt-7 max-w-2xl text-base leading-relaxed text-[var(--yahro-muted)] dark:text-[var(--yahro-muted)] sm:text-lg" style={{animationDelay:".1s"}}>{t("description")}</p>
            <div className="animate-fade-up mt-8 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row" style={{animationDelay:".15s"}}><button ref={heroCtaRef} type="button" onClick={() => setAuthMode("signup")} className="group flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-[#30312b] to-[#171813] px-6 text-sm font-bold text-white shadow-[0_12px_30px_rgba(30,31,26,.2)] transition-all hover:-translate-y-0.5 dark:from-white dark:to-[#d5d6d0] dark:text-[#171813] dark:shadow-[0_12px_40px_rgba(255,255,255,.12)] sm:w-auto">{t("start")}<ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" /></button><button type="button" onClick={enterDemo} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-black/10 bg-white/60 px-6 text-sm font-bold backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/9 sm:w-auto"><Eye size={16} />{t("demo")}</button></div>
            <p className="mt-4 flex items-center gap-1.5 text-[11px] text-[var(--yahro-muted)]"><Check size={13} className="text-[#769450]" />{t("noCard")}</p>
          </div>

          <div className="relative mx-auto mt-16 max-w-[1220px] sm:mt-20">
            <div className="pointer-events-none absolute left-1/2 top-[-90px] h-[300px] w-[80%] -translate-x-1/2 rounded-[50%] bg-[radial-gradient(ellipse,rgba(202,139,65,.38),rgba(119,153,80,.14)_38%,transparent_70%)] blur-3xl dark:bg-[radial-gradient(ellipse,rgba(207,127,51,.5),rgba(98,128,63,.2)_38%,transparent_70%)]" />
            <p className="relative mb-4 text-center text-[10px] font-semibold uppercase tracking-[.18em] text-[var(--yahro-muted)]">{t("previewLabel")}</p>
            <div className="relative [mask-image:linear-gradient(to_bottom,black_80%,transparent_100%)]"><DashboardPreview language={language} /></div>
          </div>
        </section>

        <section className="border-y border-black/6 bg-white/45 px-5 py-8 text-center dark:border-white/6 dark:bg-white/[.025] sm:px-8"><p className="text-sm text-[var(--yahro-muted)] dark:text-[#9c9e96]">{t("trusted")}</p></section>

        <section id="features" className="scroll-mt-24 px-5 py-24 sm:px-8 lg:py-32">
          <div className="mx-auto max-w-[1180px]"><div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#759450]">{t("featureEyebrow")}</p><h2 className="mt-4 font-[Manrope_Variable] text-3xl font-extrabold tracking-[-.05em] sm:text-5xl">{t("featureTitle")}</h2><p className="mt-4 text-[var(--yahro-muted)] dark:text-[#9fa199] sm:text-lg">{t("featureDescription")}</p></div>
            <div className="mt-12 grid gap-4 md:grid-cols-3">{[
              {icon:PieChart,title:"smartBudget",body:"smartBudgetText",tone:"bg-[#e8f1da] text-[#5b7837] dark:bg-[#293620] dark:text-[#b8d793]"},
              {icon:WalletCards,title:"allAccounts",body:"allAccountsText",tone:"bg-[#e4ecef] text-[#577584] dark:bg-[#243238] dark:text-[#9bc0ce]"},
              {icon:BellRing,title:"usefulAlerts",body:"usefulAlertsText",tone:"bg-[#f2eadc] text-[#9a6c2a] dark:bg-[#3a3020] dark:text-[#e2b371]"},
            ].map(({icon:Icon,title,body,tone}) => <article key={title} className="group rounded-[24px] border border-black/8 bg-white/70 p-6 transition-all hover:-translate-y-1 hover:shadow-xl dark:border-white/8 dark:bg-white/[.035]"><span className={cn("grid size-11 place-items-center rounded-2xl",tone)}><Icon size={20} /></span><h3 className="mt-10 font-[Manrope_Variable] text-lg font-bold">{t(title)}</h3><p className="mt-3 text-sm leading-relaxed text-[var(--yahro-muted)] dark:text-[#9fa199]">{t(body)}</p></article>)}</div>
          </div>
        </section>

        <section id="how" className="scroll-mt-24 bg-[#20211d] px-5 py-24 text-white dark:bg-[#11120f] sm:px-8 lg:py-32"><div className="mx-auto max-w-[1180px]"><p className="text-xs font-bold uppercase tracking-[.15em] text-[#acd17f]">{t("flowEyebrow")}</p><h2 className="mt-4 max-w-2xl font-[Manrope_Variable] text-3xl font-extrabold tracking-[-.05em] sm:text-5xl">{t("flowTitle")}</h2><div className="mt-14 grid gap-8 md:grid-cols-3">{[["01","step1","step1Text"],["02","step2","step2Text"],["03","step3","step3Text"]].map(([num,title,body],index) => <article key={num} className="relative border-t border-white/15 pt-6"><span className="text-xs font-bold text-[#acd17f]">{num}</span><h3 className="mt-8 font-[Manrope_Variable] text-xl font-bold">{t(title)}</h3><p className="mt-3 text-sm leading-relaxed text-white/50">{t(body)}</p>{index < 2 && <ArrowRight className="absolute -right-5 top-5 hidden text-white/15 md:block" size={18} />}</article>)}</div></div></section>

        <section id="security" className="scroll-mt-24 px-5 py-24 sm:px-8 lg:py-32"><div className="mx-auto grid max-w-[1180px] items-center gap-12 rounded-[32px] border border-black/8 bg-white/65 p-7 dark:border-white/8 dark:bg-white/[.035] md:grid-cols-[.8fr_1.2fr] sm:p-12"><div className="relative mx-auto grid size-56 place-items-center rounded-full bg-[#edf3e4] dark:bg-[#222d1c]"><div className="absolute inset-5 rounded-full border border-[#bbd09d] dark:border-[#435a32]" /><div className="absolute inset-10 rounded-full border border-[#d2e0bd] dark:border-[#344628]" /><span className="relative grid size-20 place-items-center rounded-[26px] bg-[#20211d] text-[#dff3bd] shadow-xl dark:bg-[#dff3bd] dark:text-[#20211d]"><ShieldCheck size={34} /></span></div><div><p className="text-xs font-bold uppercase tracking-[.15em] text-[#759450]">{t("secureEyebrow")}</p><h2 className="mt-4 font-[Manrope_Variable] text-3xl font-extrabold tracking-[-.05em] sm:text-4xl">{t("secureTitle")}</h2><p className="mt-4 leading-relaxed text-[var(--yahro-muted)] dark:text-[var(--yahro-muted)]">{t("secureText")}</p><div className="mt-7 flex flex-wrap gap-2">{[[LockKeyhole,"local"],[Eye,"noTracking"],[ArrowRight,"exportAnytime"]].map(([Icon,key]) => { const I=Icon as typeof LockKeyhole; return <span key={key as string} className="inline-flex items-center gap-2 rounded-full border border-black/8 bg-white px-3 py-2 text-xs font-semibold dark:border-white/8 dark:bg-white/5"><I size={14} className="text-[#759450]" />{t(key as string)}</span>; })}</div></div></div></section>

        <section id="faq" className="scroll-mt-24 border-y border-black/6 bg-white/40 px-5 py-24 dark:border-white/6 dark:bg-white/[.02] sm:px-8 lg:py-32">
          <div className="mx-auto grid max-w-[1180px] gap-12 lg:grid-cols-[.75fr_1.25fr]">
            <div><span className="grid size-11 place-items-center rounded-2xl bg-[#e7f0d9] text-[#587539] dark:bg-[#293620] dark:text-[#badb92]"><HelpCircle size={21} /></span><p className="mt-6 text-xs font-bold uppercase tracking-[.15em] text-[#759450]">{t("faqEyebrow")}</p><h2 className="mt-4 font-[Manrope_Variable] text-3xl font-extrabold tracking-[-.05em] sm:text-5xl">{t("faqTitle")}</h2><p className="mt-4 text-[var(--yahro-muted)] dark:text-[#9fa199]">{t("faqIntro")}</p></div>
            <div className="grid gap-3">{[1,2,3,4,5].map((number) => <details key={number} className="group rounded-2xl border border-black/7 bg-[#f9f9f6] p-5 open:shadow-sm dark:border-white/8 dark:bg-white/[.035]"><summary className="cursor-pointer list-none pr-8 text-sm font-bold marker:hidden">{t(`faq${number}`)}<span className="float-right -mr-7 text-lg font-normal text-[#7c9a51] transition-transform group-open:rotate-45" aria-hidden="true">+</span></summary><p className="mt-4 border-t border-black/6 pt-4 text-sm leading-relaxed text-[var(--yahro-muted)] dark:border-white/7 dark:text-[#a5a79f]">{t(`faq${number}Answer`)}</p></details>)}</div>
          </div>
        </section>

        <section className="px-5 pb-24 sm:px-8"><div className="relative mx-auto max-w-[1180px] overflow-hidden rounded-[32px] bg-[#dcebc5] px-6 py-16 text-center text-[#202b13] sm:px-12"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,.8),transparent_55%)]" /><div className="relative"><CircleDollarSign className="mx-auto mb-5" size={30} /><h2 className="font-[Manrope_Variable] text-3xl font-extrabold tracking-[-.05em] sm:text-5xl">{t("ctaTitle")}</h2><p className="mx-auto mt-4 max-w-xl text-sm text-[#54633f] sm:text-base">{t("ctaText")}</p><button type="button" onClick={() => setAuthMode("signup")} className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-[#20211d] px-6 text-sm font-bold text-white transition-transform hover:-translate-y-0.5">{t("start")}<ArrowRight size={16} /></button></div></div></section>
      </main>

      <footer className="border-t border-black/7 px-5 py-8 dark:border-white/7 sm:px-8"><div className="mx-auto flex max-w-[1180px] flex-col items-center justify-between gap-5 sm:flex-row"><div className="flex items-center gap-4"><Logo /><span className="hidden text-xs text-[var(--yahro-muted)] md:inline">{t("footer")}</span></div><div className="flex flex-wrap items-center justify-center gap-5 text-xs text-[var(--yahro-muted)]"><a href="/confidentialite" className="hover:text-current hover:underline">{t("privacy")}</a><a href="/conditions" className="hover:text-current hover:underline">{t("terms")}</a><a href="#faq" className="hover:text-current hover:underline">{t("faq")}</a><span>(c) 2026 Yahro</span></div></div></footer>

      {!authMode && showStickyCta && <div className="fixed inset-x-3 z-40 sm:hidden" style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}><button type="button" onClick={() => setAuthMode("signup")} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#20211d] px-5 text-sm font-bold text-white shadow-[0_14px_40px_rgba(20,21,17,.3)] dark:bg-[#e3edda] dark:text-[#1e2915]">{t("start")}<ArrowRight size={16} /></button></div>}

      {authMode && <AuthDialog key={authMode} mode={authMode} language={language} onModeChange={setAuthMode} onClose={() => setAuthMode(null)} onDemo={enterDemo} onAuthenticated={(result) => onAuthenticated(language, result)} />}
    </div>
  );
}
