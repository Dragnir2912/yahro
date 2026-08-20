import React, { useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Crown,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FolderKanban,
  Globe2,
  Home,
  Landmark,
  Layers3,
  LockKeyhole,
  LogOut,
  Menu,
  Moon,
  PieChart,
  Plus,
  ReceiptText,
  Search,
  Settings,
  ShoppingBag,
  Sun,
  Target,
  Utensils,
  UserRound,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { currencyName } from "@/lib/currencies";
import MfaSettings from "@/components/mfa-settings";
import ProjectsDashboard from "@/components/projects-dashboard";
import CurrencyTools from "@/components/currency-tools";
import CategoryManager, { CategoryPicker, categoryName, type CategorySelection } from "@/components/category-system";
import BudgetsDashboard from "@/components/budgets-dashboard";
import { AccountsDashboard, AnalyticsDashboard, TransactionsDashboard } from "@/components/finance-pages";
import { api, type DashboardData, type FinanceAccount, type FinanceCategory, type FinanceTransaction } from "@/lib/api";
import { CategoryIcon } from "@/lib/category-icons";
import ProfileEditor, { ProfileAvatar, type ProfileUser } from "@/components/profile-settings";
import { featureAvailability, quickActionAvailability, type DashboardFeature } from "@/lib/features";
import { commonText } from "@/lib/i18n";
import AccessibleDialog from "@/components/ui/accessible-dialog";

const CashFlowChart = React.lazy(() => import("@/components/ui/cash-flow-chart"));

type Language = "fr" | "en";
type Theme = "light" | "dark";
type TransactionKind = "expense" | "income";
type PaymentMethod = "CASH" | "BANK_TRANSFER" | "BANK_CARD" | "MOBILE_MONEY" | "DIGITAL_WALLET" | "DIRECT_DEBIT" | "CHECK" | "OTHER";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "secondary" | "ghost" | "outline";
  size?: "default" | "sm" | "icon";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "default", size = "default", className, children, ...props }, ref) => {
    const variants = {
      default:
        "bg-[#1d1e19] text-white shadow-sm hover:bg-[#34352f] dark:bg-[#e9f5d6] dark:text-[#17200c] dark:hover:bg-[#dcebc3]",
      secondary:
        "bg-[#e8f2d8] text-[#34491c] hover:bg-[#dceac4] dark:bg-[#28331f] dark:text-[#dcebc3] dark:hover:bg-[#35442a]",
      ghost:
        "text-[#6d6f66] hover:bg-[#eeeeea] hover:text-[#1d1e19] dark:text-[#a8aaa1] dark:hover:bg-white/7 dark:hover:text-white",
      outline:
        "border border-[#dfdfd9] bg-white text-[#31322c] hover:bg-[#f5f5f1] dark:border-white/10 dark:bg-[#1d1e1a] dark:text-[#e9e9e4] dark:hover:bg-white/7",
    };
    const sizes = {
      default: "h-12 rounded-xl px-4 text-sm lg:h-11",
      sm: "h-12 rounded-lg px-3 text-sm lg:h-9",
      icon: "size-12 rounded-xl lg:size-10",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all disabled:pointer-events-none disabled:opacity-50 active:scale-[.98]",
          variants[variant],
          sizes[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

const copy: Record<Language, Record<string, string>> = {
  fr: {
    greeting: "Bonjour",
    subtitle: "Voici où en sont vos finances aujourd'hui.",
    overview: "Vue d'ensemble",
    transactions: "Transactions",
    budgets: "Budgets",
    categories: "Postes",
    projects: "Projets et activités",
    accounts: "Comptes",
    analytics: "Analyses",
    settings: "Paramètres",
    workspace: "Espace personnel",
    addTransaction: "Ajouter une transaction",
    totalBalance: "Solde total",
    monthlyIncome: "Revenus du mois",
    monthlySpending: "Dépenses du mois",
    savingsRate: "Taux d'épargne",
    compared: "par rapport au mois dernier",
    cashFlow: "Flux de trésorerie",
    lastSixMonths: "6 derniers mois",
    income: "Revenus",
    expenses: "Dépenses",
    budget: "Budget mensuel",
    budgetUsed: "du budget utilisé",
    remaining: "restants",
    viewBudgets: "Voir les budgets",
    recent: "Transactions récentes",
    viewAll: "Voir tout",
    today: "Aujourd'hui",
    yesterday: "Hier",
    quickActions: "Actions rapides",
    transfer: "Noter un transfert",
    import: "Importer un relevé",
    export: "Exporter les données",
    addAccount: "Ajouter un compte",
    notifications: "Notifications",
    language: "Langue",
    theme: "Apparence",
    light: "Clair",
    dark: "Sombre",
    available: "Disponible",
    name: "Libellé",
    amount: "Montant",
    type: "Type",
    cancel: "Annuler",
    add: "Ajouter",
    expense: "Dépense",
    incomeSingle: "Revenu",
    search: "Rechercher...",
    budgetAlert: "Vous avez utilisé 72 % de votre budget restaurants.",
    justNow: "À l'instant",
    profile: "Voir le profil",
    paymentMethod: "Moyen de paiement",
  },
  en: {
    greeting: "Good morning",
    subtitle: "Here's where your finances stand today.",
    overview: "Overview",
    transactions: "Transactions",
    budgets: "Budgets",
    categories: "Posts",
    projects: "Projects and activities",
    accounts: "Accounts",
    analytics: "Analytics",
    settings: "Settings",
    workspace: "Personal workspace",
    addTransaction: "Add transaction",
    totalBalance: "Total balance",
    monthlyIncome: "Monthly income",
    monthlySpending: "Monthly spending",
    savingsRate: "Savings rate",
    compared: "compared with last month",
    cashFlow: "Cash flow",
    lastSixMonths: "Last 6 months",
    income: "Income",
    expenses: "Expenses",
    budget: "Monthly budget",
    budgetUsed: "of budget used",
    remaining: "remaining",
    viewBudgets: "View budgets",
    recent: "Recent transactions",
    viewAll: "View all",
    today: "Today",
    yesterday: "Yesterday",
    quickActions: "Quick actions",
    transfer: "Record a transfer",
    import: "Import statement",
    export: "Export data",
    addAccount: "Add account",
    notifications: "Notifications",
    language: "Language",
    theme: "Appearance",
    light: "Light",
    dark: "Dark",
    available: "Available",
    name: "Label",
    amount: "Amount",
    type: "Type",
    cancel: "Cancel",
    add: "Add",
    expense: "Expense",
    incomeSingle: "Income",
    search: "Search...",
    budgetAlert: "You've used 72% of your dining budget.",
    justNow: "Just now",
    profile: "View profile",
    paymentMethod: "Payment method",
  },
};

const cashFlowData = [
  { month: "Mar", income: 3200, expenses: 2180 },
  { month: "Apr", income: 3600, expenses: 2420 },
  { month: "May", income: 3400, expenses: 2800 },
  { month: "Jun", income: 4200, expenses: 2640 },
  { month: "Jul", income: 3900, expenses: 3020 },
  { month: "Aug", income: 4520, expenses: 2840 },
];

const budgetCategories = [
  { label: "Logement", labelEn: "Housing", amount: 920, total: 1200, color: "bg-[#769450]" },
  { label: "Alimentation", labelEn: "Food", amount: 486, total: 700, color: "bg-[#dda75b]" },
  { label: "Transport", labelEn: "Transport", amount: 288, total: 500, color: "bg-[#7799a6]" },
  { label: "Loisirs", labelEn: "Leisure", amount: 164, total: 400, color: "bg-[#a786a5]" },
];

interface Transaction {
  id: number | string;
  merchant: string;
  category: string;
  categoryEn: string;
  amount: number;
  kind: TransactionKind;
  paymentMethod: PaymentMethod;
  date: string;
  icon: React.ReactNode;
  iconStyle: string;
}

const initialTransactions: Transaction[] = [
  {
    id: 1,
    merchant: "Carrefour Market",
    category: "Courses",
    categoryEn: "Groceries",
    amount: 84.3,
    kind: "expense",
    paymentMethod: "BANK_CARD",
    date: "today",
    icon: <ShoppingBag size={18} />,
    iconStyle: "bg-[#f1eadc] text-[#9b6c29] dark:bg-[#3c3020] dark:text-[#e7bb78]",
  },
  {
    id: 2,
    merchant: "Salaire - ENSEA",
    category: "Revenu",
    categoryEn: "Income",
    amount: 2450,
    kind: "income",
    paymentMethod: "BANK_TRANSFER",
    date: "today",
    icon: <Landmark size={18} />,
    iconStyle: "bg-[#e4efdb] text-[#547238] dark:bg-[#26351e] dark:text-[#a9cd83]",
  },
  {
    id: 3,
    merchant: "Orange Énergie",
    category: "Factures",
    categoryEn: "Bills",
    amount: 62.4,
    kind: "expense",
    paymentMethod: "MOBILE_MONEY",
    date: "yesterday",
    icon: <Zap size={18} />,
    iconStyle: "bg-[#f1eadc] text-[#a1722b] dark:bg-[#3c3020] dark:text-[#e7bb78]",
  },
  {
    id: 4,
    merchant: "La Terrasse",
    category: "Restaurant",
    categoryEn: "Dining",
    amount: 37.8,
    kind: "expense",
    paymentMethod: "CASH",
    date: "yesterday",
    icon: <Utensils size={18} />,
    iconStyle: "bg-[#ece6ef] text-[#86678a] dark:bg-[#352839] dark:text-[#c6a1cd]",
  },
];

const navItems = [
  { key: "overview", icon: Home },
  { key: "transactions", icon: ReceiptText },
  { key: "budgets", icon: Target },
  { key: "categories", icon: Layers3 },
  { key: "projects", icon: FolderKanban },
  { key: "accounts", icon: WalletCards },
  { key: "analytics", icon: PieChart },
] as const;

type DashboardNav = (typeof navItems)[number]["key"] | "settings";

function formatCurrency(value: number, language: Language, currency: string) {
  return new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function formatTransactionDate(value: string, language: Language, t: (key: string) => string) {
  if (value === "today" || value === "yesterday") return t(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-US", { dateStyle: "medium" }).format(date);
}

function paymentMethodLabel(method: PaymentMethod, language: Language) {
  const values: Record<PaymentMethod, [string, string]> = {
    CASH: ["Espèces", "Cash"],
    BANK_TRANSFER: ["Virement bancaire", "Bank transfer"],
    BANK_CARD: ["Carte bancaire", "Bank card"],
    MOBILE_MONEY: ["Mobile Money", "Mobile Money"],
    DIGITAL_WALLET: ["Portefeuille numérique", "Digital wallet"],
    DIRECT_DEBIT: ["Prélèvement bancaire", "Direct debit"],
    CHECK: ["Chèque", "Check"],
    OTHER: ["Autre moyen", "Other method"],
  };
  return values[method][language === "fr" ? 0 : 1];
}

function BrandMark() {
  return (
    <div className="grid size-9 place-items-center overflow-hidden rounded-xl bg-[#ecefe5] p-1 dark:bg-white/8">
      <img src="/brand/yahro-mark.png" alt="" className="size-full object-contain" />
    </div>
  );
}

function ThemeToggle({ theme, onChange, label }: { theme: Theme; onChange: () => void; label: string }) {
  return (
    <Button variant="ghost" size="icon" onClick={onChange} aria-label={label} title={label}>
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </Button>
  );
}

function ProfileDropdown({ language, onEdit, onSettings, onLogout, className }: { language: Language; onEdit: () => void; onSettings: () => void; onLogout?: () => void; className?: string }) {
  return <div role="menu" className={cn("z-50 w-56 rounded-2xl border border-[#dfdfd9] bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#20211d]", className)}><button type="button" role="menuitem" onClick={onEdit} className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold hover:bg-[#f1f1ed] dark:hover:bg-white/7"><UserRound size={16} />{language === "fr" ? "Modifier le profil" : "Edit profile"}</button><button type="button" role="menuitem" onClick={onSettings} className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold hover:bg-[#f1f1ed] dark:hover:bg-white/7"><Settings size={16} />{language === "fr" ? "Paramètres" : "Settings"}</button>{onLogout && <button type="button" role="menuitem" onClick={onLogout} className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-[#a05240] hover:bg-[#f7e9e5] dark:text-[#e9a191] dark:hover:bg-[#3b2723]"><LogOut size={16} />{language === "fr" ? "Déconnexion" : "Sign out"}</button>}</div>;
}

function SidebarFooter({ language, onSettings, onLogout, mobile = false }: { language: Language; onSettings: () => void; onLogout?: () => void; mobile?: boolean }) {
  return (
    <div className={cn("mt-auto pt-6", mobile && "pb-[calc(5.5rem+env(safe-area-inset-bottom))]")}>
      <div className={cn("mb-4 rounded-2xl bg-[#20211d] p-4 text-white dark:bg-[#292a24]", !mobile && "sidebar-promo")}>
        <div className="mb-3 grid size-8 place-items-center rounded-lg bg-white/10 text-[#d9efb9]"><Crown size={16} /></div>
        <p className="text-sm font-semibold">Yahro Plus</p>
        <p className="mt-1 text-[11px] leading-relaxed text-white/60">
          {language === "fr" ? "Automatisez vos finances et allez plus loin." : "Automate your finances and go further."}
        </p>
        <p className="mt-3 text-xs font-semibold text-[#d9efb9]/80">{commonText(language, "comingSoon")}</p>
      </div>
      <button type="button" onClick={onSettings} className="flex h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#6f7169] hover:bg-[#efefeb] dark:text-[#a3a59c] dark:hover:bg-white/6 lg:h-10">
        <Settings size={18} /> {language === "fr" ? "Paramètres" : "Settings"}
      </button>
      {onLogout && (
        <button type="button" onClick={onLogout} className="mt-1 flex h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-[#6f7169] hover:bg-[#f3e7e3] hover:text-[#9d4e3e] dark:text-[#a3a59c] dark:hover:bg-[#3b2723] dark:hover:text-[#e49a89] lg:h-10">
          <LogOut size={18} /> {language === "fr" ? "Déconnexion" : "Sign out"}
        </button>
      )}
    </div>
  );
}

function FeatureState({ language, label, status, onExitDemo }: { language: Language; label: string; status: "demo-preview" | "account-required" | "coming-soon"; onExitDemo?: () => void }) {
  const accountRequired = status === "account-required";
  return <section className="animate-soft-pop rounded-2xl border border-dashed border-[#cfd8c4] bg-white p-8 text-center dark:border-white/10 dark:bg-[#20211d] sm:p-12"><span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#edf4e3] text-[#668642] dark:bg-[#2a3822] dark:text-[#b6d68e]">{accountRequired ? <LockKeyhole size={22} /> : <Eye size={22} />}</span><h2 className="mt-4 font-[Manrope_Variable] text-xl font-bold">{label}</h2><p className="mx-auto mt-2 max-w-md text-sm text-[var(--yahro-muted)]">{accountRequired ? (language === "fr" ? "Cette section contient des préférences personnelles et nécessite un compte." : "This section contains personal preferences and requires an account.") : (language === "fr" ? "Cette fonction est visible dans la démo, mais nécessite un compte pour manipuler des données persistantes." : "This feature is visible in the demo, but requires an account to handle persistent data.")}</p>{onExitDemo && <button type="button" onClick={onExitDemo} className="mt-5 h-11 rounded-xl bg-[#20211d] px-5 text-sm font-semibold text-white dark:bg-[#dcebc5] dark:text-[#202b13]">{language === "fr" ? "Quitter la démo" : "Exit demo"}</button>}</section>;
}

function AddTransactionModal({
  language,
  t,
  accessToken,
  currency,
  onClose,
  onAdd,
  onNeedAccount,
}: {
  language: Language;
  t: (key: string) => string;
  accessToken?: string;
  currency: string;
  onClose: () => void;
  onAdd: (transaction: Transaction) => void;
  onNeedAccount: () => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<TransactionKind>("expense");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [categorySelection, setCategorySelection] = useState<CategorySelection | null>(null);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [loadingAccounts, setLoadingAccounts] = useState(Boolean(accessToken));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  React.useEffect(() => {
    if (!accessToken) return;
    let active = true;
    void api.accounts(accessToken)
      .then((response) => {
        if (!active) return;
        setAccounts(response.data);
        setAccountId((current) => current || response.data[0]?.id || "");
      })
      .catch(() => {
        if (active) setError(language === "fr" ? "Impossible de charger vos comptes." : "Unable to load your accounts.");
      })
      .finally(() => {
        if (active) setLoadingAccounts(false);
      });
    return () => { active = false; };
  }, [accessToken, language]);

  React.useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!name.trim() || !Number.isFinite(numericAmount) || numericAmount <= 0 || !categorySelection) return;
    if (accessToken && !accountId) return;
    setBusy(true);
    setError(undefined);
    try {
      const created = accessToken
        ? (await api.createTransaction(accessToken, {
            accountId,
            categoryId: categorySelection.categoryId,
            personalDetailId: categorySelection.personalDetailId,
            type: kind === "income" ? "INCOME" : "EXPENSE",
            paymentMethod,
            amount: numericAmount.toFixed(2),
            transactionDate: `${transactionDate}T12:00:00.000Z`,
            merchant: name.trim(),
            description: name.trim(),
            tags: [],
          })).data
        : undefined;
      onAdd({
      id: created?.id ?? Date.now(),
      merchant: name.trim(),
      category: [categorySelection.familyName, categorySelection.categoryName, categorySelection.personalDetailName].filter(Boolean).join(" / "),
      categoryEn: [categorySelection.familyName, categorySelection.categoryName, categorySelection.personalDetailName].filter(Boolean).join(" / "),
      amount: numericAmount,
      kind,
      paymentMethod,
      date: created?.transactionDate ?? "today",
      icon: <CategoryIcon name={undefined} size={18} />,
      iconStyle:
        kind === "income"
          ? "bg-[#e4efdb] text-[#547238] dark:bg-[#26351e] dark:text-[#a9cd83]"
          : "bg-[#ecebea] text-[#6f7069] dark:bg-white/8 dark:text-[#bcbdb7]",
      });
    } catch {
      setError(language === "fr" ? "Impossible d'enregistrer cette opération." : "Unable to save this operation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccessibleDialog titleId="transaction-dialog-title" descriptionId="transaction-dialog-description" onClose={onClose} overlayClassName="z-[80] bg-black/35" className="animate-soft-pop sm:max-w-2xl">
      <form
        onSubmit={(event) => void submit(event)}
        className="w-full"
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 id="transaction-dialog-title" className="font-[Manrope_Variable] text-lg font-bold text-[#20211d] dark:text-white">
              {t("addTransaction")}
            </h2>
            <p id="transaction-dialog-description" className="mt-1 text-sm text-[var(--yahro-muted)]">{language === "fr" ? "Notez ici une opération déjà réalisée" : "Record an operation that already happened"}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label={t("cancel")}>
            <X size={19} />
          </Button>
        </div>

        <label className="mb-4 block text-sm font-medium text-[#55574f] dark:text-[#c0c1ba]">
          {t("name")}
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={language === "fr" ? "Ex. Abonnement internet" : "E.g. Internet subscription"}
            className="mt-2 h-11 w-full rounded-xl border border-[#deded8] bg-[#fafaf7] px-3 text-[#20211d] placeholder:text-[var(--yahro-muted)] dark:border-white/10 dark:bg-[#181914] dark:text-white"
          />
        </label>

        {accessToken && (
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-[#55574f] dark:text-[#c0c1ba]">
              {language === "fr" ? "Compte de suivi" : "Tracking account"}
              <select value={accountId} onChange={(event) => setAccountId(event.target.value)} disabled={loadingAccounts || accounts.length === 0} className="mt-2 h-11 w-full rounded-xl border border-[#deded8] bg-[#fafaf7] px-3 text-[#20211d] dark:border-white/10 dark:bg-[#181914] dark:text-white">
                {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
            <label className="block text-sm font-medium text-[#55574f] dark:text-[#c0c1ba]">
              {language === "fr" ? "Date de l'opération" : "Operation date"}
              <input type="date" value={transactionDate} onChange={(event) => setTransactionDate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#deded8] bg-[#fafaf7] px-3 text-[#20211d] dark:border-white/10 dark:bg-[#181914] dark:text-white" />
            </label>
          </div>
        )}

        {accessToken && !loadingAccounts && accounts.length === 0 && (
          <button type="button" onClick={onNeedAccount} className="mb-4 w-full rounded-xl border border-[#dbe6cc] bg-[#edf4e3] px-4 py-3 text-left text-xs font-semibold text-[#405729] dark:border-[#35462a] dark:bg-[#25301f] dark:text-[#c9dfa9]">
            {language === "fr" ? "Ajoutez d'abord un compte de suivi pour pouvoir noter cette opération." : "Add a tracking account before recording this operation."}
          </button>
        )}

        <label className="mb-4 block text-sm font-medium text-[#55574f] dark:text-[#c0c1ba]">
          {t("amount")} - {currencyName(currency, language)}
          <div className="relative mt-2">
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
              className="h-11 w-full rounded-xl border border-[#deded8] bg-[#fafaf7] px-3 text-[#20211d] placeholder:text-[var(--yahro-muted)] dark:border-white/10 dark:bg-[#181914] dark:text-white"
            />
          </div>
        </label>

        <fieldset className="mb-6">
          <legend className="mb-2 text-sm font-medium text-[#55574f] dark:text-[#c0c1ba]">{t("type")}</legend>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#f1f1ed] p-1 dark:bg-[#181914]">
            {(["expense", "income"] as TransactionKind[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setKind(item)}
                className={cn(
                  "h-9 rounded-lg text-sm font-semibold transition-all",
                  kind === item
                    ? "bg-white text-[#20211d] shadow-sm dark:bg-[#2b2c27] dark:text-white"
                    : "text-[var(--yahro-muted)]",
                )}
              >
                {item === "expense" ? t("expense") : t("incomeSingle")}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="mb-6 rounded-2xl border border-[#e4e4de] p-4 dark:border-white/8">
          <CategoryPicker key={kind} accessToken={accessToken} language={language} type={kind === "income" ? "INCOME" : "EXPENSE"} onChange={setCategorySelection} />
        </div>

        <label className="mb-6 block text-sm font-medium text-[#55574f] dark:text-[#c0c1ba]">
          {t("paymentMethod")}
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="mt-2 h-11 w-full rounded-xl border border-[#deded8] bg-[#fafaf7] px-3 text-[#20211d] dark:border-white/10 dark:bg-[#181914] dark:text-white">
            {(["CASH", "BANK_TRANSFER", "BANK_CARD", "MOBILE_MONEY", "DIGITAL_WALLET", "DIRECT_DEBIT", "CHECK", "OTHER"] as PaymentMethod[]).map((method) => <option key={method} value={method}>{paymentMethodLabel(method, language)}</option>)}
          </select>
        </label>

        {error && <p className="mb-4 rounded-xl bg-[#f7e9e5] px-4 py-3 text-xs text-[#a05240] dark:bg-[#3b2723] dark:text-[#e9a191]">{error}</p>}

        <div className="flex gap-3">
          <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" className="flex-1" disabled={!name.trim() || Number(amount) <= 0 || !categorySelection || busy || Boolean(accessToken && !accountId)}>
            <Plus size={17} /> {busy ? (language === "fr" ? "Enregistrement..." : "Saving...") : t("add")}
          </Button>
        </div>
      </form>
    </AccessibleDialog>
  );
}

function StatCard({
  label,
  value,
  change,
  icon,
  positive = true,
  delay,
}: {
  label: string;
  value: string;
  change: string;
  icon: React.ReactNode;
  positive?: boolean;
  delay: string;
}) {
  return (
    <article
      className="animate-fade-up rounded-2xl border border-[#e1e1dc] bg-white p-5 shadow-[0_1px_2px_rgba(28,29,24,.02)] dark:border-white/8 dark:bg-[#20211d]"
      style={{ animationDelay: delay }}
    >
      <div className="mb-5 flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--yahro-muted)] dark:text-[#a5a79f]">{label}</span>
        <span className="grid size-8 place-items-center rounded-lg bg-[#f1f1ed] text-[#6b6d64] dark:bg-white/7 dark:text-[#b9bbb2]">
          {icon}
        </span>
      </div>
      <p className="font-[Manrope_Variable] text-[1.7rem] font-bold tracking-[-.04em] text-[#20211d] dark:text-[#f4f4ef]">{value}</p>
      <div className="mt-2 flex items-center gap-1.5 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold",
            positive
              ? "bg-[#e9f2df] text-[#527132] dark:bg-[#293820] dark:text-[#aace84]"
              : "bg-[#f5e5e1] text-[#a25140] dark:bg-[#412925] dark:text-[#e49a89]",
          )}
        >
          {positive ? <ArrowUpRight size={12} /> : <ArrowDownLeft size={12} />}
          {change}
        </span>
      </div>
    </article>
  );
}

export default function BudgetDashboard({ initialLanguage = "fr", onLogout, profile, onProfileUpdated, accessToken, defaultCurrency = "XOF" }: { initialLanguage?: Language; onLogout?: () => void; profile: ProfileUser; onProfileUpdated?: (profile: ProfileUser) => void; accessToken?: string; defaultCurrency?: string }) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [theme, setTheme] = useState<Theme>(() =>
    typeof window !== "undefined" && window.localStorage.getItem("yahro-theme") === "dark" ? "dark" : "light",
  );
  const [activeNav, setActiveNav] = useState<DashboardNav>("overview");
  const [appCurrency, setAppCurrency] = useState(defaultCurrency);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [dashboardData, setDashboardData] = useState<DashboardData>();
  const [financeCategories, setFinanceCategories] = useState<FinanceCategory[]>([]);
  const [financeRevision, setFinanceRevision] = useState(0);
  const [financeError, setFinanceError] = useState<string>();
  const [currentProfile, setCurrentProfile] = useState(profile);
  const [profileMenu, setProfileMenu] = useState<"sidebar" | "header" | null>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [cashFlowPeriod, setCashFlowPeriod] = useState<3 | 6>(6);
  const [periodMenuOpen, setPeriodMenuOpen] = useState(false);
  const nickname = currentProfile.nickname;

  const t = (key: string) => copy[language][key] ?? key;
  const activeAvailability = featureAvailability(activeNav as DashboardFeature, Boolean(accessToken));

  const reloadFinance = React.useCallback(async () => {
    if (!accessToken) return;
    try {
      const [dashboardResponse, transactionResponse, categoryResponse] = await Promise.all([
        api.dashboard(accessToken),
        api.transactions(accessToken, { limit: 40 }),
        api.categories(accessToken),
      ]);
      const categories = categoryResponse.data;
      const categoryMap = new Map(categories.map((item) => [item.id, item]));
      setDashboardData(dashboardResponse);
      setFinanceCategories(categories);
      setTransactions(transactionResponse.data.map((item: FinanceTransaction) => {
        const category = item.categoryId ? categoryMap.get(item.categoryId) : undefined;
        const family = category?.parentId ? categoryMap.get(category.parentId) : category;
        const path = [family ? categoryName(family, language) : undefined, category && category.id !== family?.id ? categoryName(category, language) : undefined].filter(Boolean).join(" / ");
        return {
          id: item.id,
          merchant: item.merchant || item.description,
          category: path || (language === "fr" ? "Sans catégorie" : "Uncategorized"),
          categoryEn: path || "Uncategorized",
          amount: Number(item.amount),
          kind: item.type === "INCOME" ? "income" : "expense",
          paymentMethod: item.paymentMethod,
          date: item.transactionDate,
          icon: <CategoryIcon name={category?.icon ?? family?.icon} size={18} />,
          iconStyle: item.type === "INCOME"
            ? "bg-[#e4efdb] text-[#547238] dark:bg-[#26351e] dark:text-[#a9cd83]"
            : "bg-[#ecebea] text-[#6f7069] dark:bg-white/8 dark:text-[#bcbdb7]",
        };
      }));
      setFinanceError(undefined);
    } catch {
      setFinanceError(language === "fr" ? "Certaines données financières n'ont pas pu être chargées." : "Some financial data could not be loaded.");
    }
  }, [accessToken, language]);

  React.useEffect(() => {
    const timeout = window.setTimeout(() => { void reloadFinance(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [reloadFinance, financeRevision]);

  const totals = useMemo(() => {
    if (accessToken && dashboardData) {
      const total = (type: "INCOME" | "EXPENSE") => Number(dashboardData.totals.find((item) => item.currency === appCurrency && item.type === type)?.amount ?? 0);
      const balance = dashboardData.accountBalances
        .filter((item) => item.currency === appCurrency && item.includeInNetWorth)
        .reduce((sum, item) => sum + Number(item.balance), 0);
      return { income: total("INCOME"), expenses: total("EXPENSE"), balance };
    }
    const income = transactions.filter((item) => item.kind === "income").reduce((sum, item) => sum + item.amount, 2070);
    const expenses = transactions.filter((item) => item.kind === "expense").reduce((sum, item) => sum + item.amount, 2218);
    return { income, expenses, balance: 12846 + income - expenses };
  }, [accessToken, appCurrency, dashboardData, transactions]);

  const savingsRate = totals.income > 0 ? Math.max(0, ((totals.income - totals.expenses) / totals.income) * 100) : 0;
  const visibleCashFlow = useMemo(() => {
    const source = !accessToken || !dashboardData ? cashFlowData : dashboardData.cashflow
      .filter((item) => item.currency === appCurrency)
      .map((item) => ({ month: new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-US", { day: "2-digit", month: "short" }).format(new Date(item.day)), income: Number(item.income), expenses: Number(item.expense) }));
    return source.slice(-cashFlowPeriod);
  }, [accessToken, appCurrency, cashFlowPeriod, dashboardData, language]);

  const visibleBudgets = useMemo(() => {
    if (!accessToken || !dashboardData) return budgetCategories.map((item) => ({ id: item.label, label: language === "fr" ? item.label : item.labelEn, amount: item.amount, total: item.total, icon: undefined as string | undefined }));
    const categoryMap = new Map(financeCategories.map((item) => [item.id, item]));
    return dashboardData.budgetProgress
      .filter((item) => item.currency === appCurrency)
      .map((item) => ({ id: item.id, label: categoryMap.get(item.categoryId) ? categoryName(categoryMap.get(item.categoryId)!, language) : item.categoryName, amount: Number(item.spent), total: Number(item.amount), icon: categoryMap.get(item.categoryId)?.icon ?? undefined }));
  }, [accessToken, appCurrency, dashboardData, financeCategories, language]);

  const budgetSpent = visibleBudgets.reduce((sum, item) => sum + item.amount, 0);
  const budgetTotal = visibleBudgets.reduce((sum, item) => sum + item.total, 0);
  const previousAmount = (type: "INCOME" | "EXPENSE") => Number(dashboardData?.previousTotals.find((item) => item.currency === appCurrency && item.type === type)?.amount ?? 0);
  const percentChange = (current: number, previous: number) => previous > 0 ? ((current - previous) / previous) * 100 : 0;
  const incomeChange = accessToken ? percentChange(totals.income, previousAmount("INCOME")) : 12.5;
  const expenseChange = accessToken ? percentChange(totals.expenses, previousAmount("EXPENSE")) : 4.2;
  const previousIncome = previousAmount("INCOME");
  const previousExpenses = previousAmount("EXPENSE");
  const previousSavingsRate = previousIncome > 0 ? Math.max(0, ((previousIncome - previousExpenses) / previousIncome) * 100) : 0;
  const savingsChange = accessToken ? savingsRate - previousSavingsRate : 5.1;
  const changeLabel = (value: number) => `${Math.abs(value).toLocaleString(language === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 1 })}%`;
  const alertBudget = visibleBudgets.find((item) => item.total > 0 && (item.amount / item.total) * 100 >= 80);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      document.documentElement.classList.toggle("dark", next === "dark");
      window.localStorage.setItem("yahro-theme", next);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#171813" : "#f5f5f1");
      return next;
    });
  };

  React.useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.lang = language;
  }, [theme, language]);

  const addTransaction = (transaction: Transaction) => {
    setTransactions((current) => [transaction, ...current]);
    setFinanceRevision((current) => current + 1);
    setAddOpen(false);
  };

  const selectNav = (key: DashboardNav) => {
    setActiveNav(key);
    setMobileMenuOpen(false);
  };

  return (
    <div data-session={accessToken ? "authenticated" : "demo"} className="min-h-screen bg-[#f5f5f1] text-[#20211d] transition-colors dark:bg-[#171813] dark:text-[#efefe9]">
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-[250px] flex-col overflow-y-auto overscroll-contain border-r border-[#e2e2dc] bg-[#fafaf7] px-4 py-5 dark:border-white/8 dark:bg-[#1b1c17] lg:flex">
        <div className="flex items-center gap-3 px-2">
          <BrandMark />
          <span className="font-[Manrope_Variable] text-lg font-extrabold tracking-[-.04em]">yahro</span>
        </div>

        <div className="relative mt-8"><button type="button" onClick={() => setProfileMenu((current) => current === "sidebar" ? null : "sidebar")} className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-[#e2e2dc] bg-white p-2.5 text-left transition-colors hover:border-[#cbd8b9] hover:bg-[#f6f8f1] dark:border-white/8 dark:bg-[#20211d] dark:hover:border-[#45563a] dark:hover:bg-[#242a20]" aria-expanded={profileMenu === "sidebar"} aria-haspopup="menu" aria-label={language === "fr" ? "Ouvrir le menu du profil" : "Open profile menu"}><ProfileAvatar profile={currentProfile} size="sm" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{nickname}</span><span className="block truncate text-[11px] text-[var(--yahro-muted)]">{t("workspace")}</span></span><ChevronDown size={15} className={cn("text-[var(--yahro-muted)] transition-transform", profileMenu === "sidebar" && "rotate-180")} /></button>{profileMenu === "sidebar" && <ProfileDropdown className="absolute left-0 top-full mt-2" language={language} onEdit={() => { setProfileMenu(null); setProfileEditorOpen(true); }} onSettings={() => { setProfileMenu(null); setActiveNav("settings"); }} onLogout={onLogout} />}</div>

        <nav className="mt-7 space-y-1" aria-label="Main navigation">
          {navItems.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => selectNav(key)}
              className={cn(
                "flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition-all",
                activeNav === key
                  ? "bg-[#e8f1da] text-[#3f5726] dark:bg-[#293620] dark:text-[#c5dfa3]"
                  : "text-[#6f7169] hover:bg-[#efefeb] hover:text-[#262721] dark:text-[#a3a59c] dark:hover:bg-white/6 dark:hover:text-white",
              )}
            >
              <Icon size={18} strokeWidth={activeNav === key ? 2.4 : 2} />
              {t(key)}
              {key === "budgets" && visibleBudgets.length > 0 && (
                <span className="ml-auto rounded-full bg-[#d3e6b5] px-2 py-0.5 text-[10px] font-bold text-[#4e672f] dark:bg-[#3a4d2c] dark:text-[#c9dfa9]">{visibleBudgets.length}</span>
              )}
            </button>
          ))}
        </nav>

        <SidebarFooter language={language} onSettings={() => selectNav("settings")} onLogout={onLogout} />
      </aside>

      <div className="lg:pl-[250px]">
        <header className="sticky top-0 z-40 flex min-h-[70px] items-center border-b border-[#e2e2dc]/90 bg-[#f5f5f1]/90 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur-xl dark:border-white/8 dark:bg-[#171813]/90 sm:px-7 lg:px-9">
          <div className="flex items-center gap-2 lg:hidden">
            <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(true)} aria-label="Open menu"><Menu size={20} /></Button>
            <BrandMark />
            <span className="hidden font-[Manrope_Variable] font-extrabold tracking-[-.04em] sm:inline">yahro</span>
          </div>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <label className="relative mr-1 hidden md:block">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--yahro-muted)]" />
              <input
                aria-label={t("search")}
                placeholder={t("search")}
                className="h-9 w-48 rounded-xl border border-[#dfdfd9] bg-white pl-9 pr-3 text-sm text-[#30312b] placeholder:text-[var(--yahro-muted)] dark:border-white/8 dark:bg-[#20211d] dark:text-white"
              />
            </label>

            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setNotificationsOpen((open) => !open)}
                aria-label={t("notifications")}
              >
                <Bell size={18} />
                {alertBudget && <span className="absolute right-2 top-2 size-2 rounded-full border-2 border-[#f5f5f1] bg-[#d26e51] dark:border-[#171813]" />}
              </Button>
              {notificationsOpen && (
                <div className="animate-soft-pop absolute right-0 top-12 w-[min(320px,calc(100vw-2rem))] rounded-2xl border border-[#dfdfd9] bg-white p-4 shadow-xl dark:border-white/10 dark:bg-[#20211d]">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-sm font-bold">{t("notifications")}</p>
                    <span className="rounded-full bg-[#e7f0da] px-2 py-0.5 text-[10px] font-bold text-[#587337] dark:bg-[#2c3b22] dark:text-[#b8d793]">{alertBudget ? 1 : 0}</span>
                  </div>
                  {alertBudget ? <div className="flex gap-3 rounded-xl bg-[#f6f7f1] p-3 dark:bg-white/5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#f1e6d7] text-[#a36c25] dark:bg-[#3c3020] dark:text-[#e2b270]"><Target size={16} /></span>
                    <div>
                      <p className="text-xs leading-relaxed text-[#55574f] dark:text-[#c0c2ba]">{language === "fr" ? `Vous avez utilisé ${Math.round((alertBudget.amount / alertBudget.total) * 100)} % du budget ${alertBudget.label}.` : `You have used ${Math.round((alertBudget.amount / alertBudget.total) * 100)}% of the ${alertBudget.label} budget.`}</p>
                      <p className="mt-1 text-[10px] text-[var(--yahro-muted)]">{t("justNow")}</p>
                    </div>
                  </div> : <p className="rounded-xl bg-[#f6f7f1] p-3 text-xs text-[var(--yahro-muted)] dark:bg-white/5">{language === "fr" ? "Aucune alerte budgétaire pour le moment." : "No budget alert at the moment."}</p>}
                </div>
              )}
            </div>

            <ThemeToggle theme={theme} onChange={toggleTheme} label={t("theme")} />

            <button
              type="button"
              onClick={() => setLanguage((current) => {
                const next = current === "fr" ? "en" : "fr";
                window.localStorage.setItem("yahro-language", next);
                return next;
              })}
              className="flex h-12 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-[#66685f] transition-colors hover:bg-[#eeeeea] lg:h-10 dark:text-[#b3b5ad] dark:hover:bg-white/7"
              aria-label={t("language")}
              title={t("language")}
            >
              <Globe2 size={17} /> {language.toUpperCase()}
            </button>

            <div className="mx-1 hidden h-6 w-px bg-[#dfdfd9] dark:bg-white/10 sm:block" />
            <div className="relative hidden sm:block"><button type="button" onClick={() => setProfileMenu((current) => current === "header" ? null : "header")} className="flex min-h-11 items-center gap-2 rounded-xl p-1 transition-colors hover:bg-[#eeeeea] dark:hover:bg-white/7" title={t("profile")} aria-expanded={profileMenu === "header"} aria-haspopup="menu"><ProfileAvatar profile={currentProfile} size="sm" /><ChevronDown size={14} className={cn("text-[var(--yahro-muted)] transition-transform", profileMenu === "header" && "rotate-180")} /></button>{profileMenu === "header" && <ProfileDropdown className="absolute right-0 top-full mt-2" language={language} onEdit={() => { setProfileMenu(null); setProfileEditorOpen(true); }} onSettings={() => { setProfileMenu(null); setActiveNav("settings"); }} onLogout={onLogout} />}</div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 pb-28 pt-7 sm:px-7 lg:px-9 lg:pb-10 lg:pt-9">
          <section className={cn("mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end", activeNav !== "overview" && "hidden")}>
            <div className="animate-fade-up">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[.13em] text-[#7c9a51] dark:text-[#9cbc73]">{t("overview")}</p>
              <h1 className="font-[Manrope_Variable] text-2xl font-extrabold tracking-[-.04em] text-[#20211d] dark:text-[#f4f4ef] sm:text-3xl">{t("greeting")}{nickname ? `, ${nickname}` : ""}</h1>
              <p className="mt-2 text-sm text-[var(--yahro-muted)] dark:text-[#a4a69d]">{t("subtitle")}</p>
            </div>
            <Button onClick={() => setAddOpen(true)} className="w-full sm:w-auto">
              <Plus size={17} /> {t("addTransaction")}
            </Button>
          </section>

          {activeNav !== "overview" && activeAvailability !== "available" && (
            <FeatureState language={language} label={t(activeNav)} status={activeAvailability} onExitDemo={!accessToken ? onLogout : undefined} />
          )}

          {activeNav === "settings" && accessToken && (
            <div className="animate-fade-up mb-7">
              <CurrencyTools accessToken={accessToken} language={language} defaultCurrency={appCurrency} onDefaultCurrencyChange={setAppCurrency} />
              <MfaSettings accessToken={accessToken} language={language} onSessionEnded={() => { void onLogout?.(); }} />
            </div>
          )}

          {activeNav === "categories" && <CategoryManager accessToken={accessToken} language={language} />}

          {activeNav === "budgets" && <BudgetsDashboard accessToken={accessToken} language={language} defaultCurrency={appCurrency} />}

          {activeNav === "projects" && <ProjectsDashboard accessToken={accessToken} language={language} defaultCurrency={appCurrency} />}

          {activeNav === "accounts" && accessToken && <AccountsDashboard accessToken={accessToken} language={language} defaultCurrency={appCurrency} onChanged={() => setFinanceRevision((current) => current + 1)} />}

          {activeNav === "transactions" && accessToken && <TransactionsDashboard accessToken={accessToken} language={language} onAdd={() => setAddOpen(true)} revision={financeRevision} />}

          {activeNav === "analytics" && accessToken && <AnalyticsDashboard dashboard={dashboardData} categories={financeCategories} language={language} currency={appCurrency} />}

          {financeError && activeNav === "overview" && <p className="mb-4 rounded-xl bg-[#f7e9e5] px-4 py-3 text-xs text-[#a05240] dark:bg-[#3b2723] dark:text-[#e9a191]">{financeError}</p>}

          <section className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4", activeNav !== "overview" && "hidden")}>
            <article className="animate-fade-up overflow-hidden rounded-2xl bg-[#20211d] p-5 text-white shadow-[0_12px_30px_rgba(29,30,25,.12)] dark:bg-[#dcebc5] dark:text-[#202b13]">
              <div className="mb-5 flex items-center justify-between">
                <span className="text-sm font-medium text-white/65 dark:text-[#53623e]">{t("totalBalance")}</span>
                <button type="button" onClick={() => setBalanceVisible((visible) => !visible)} className="grid size-12 place-items-center rounded-xl text-white/55 transition-colors hover:text-white lg:size-10 dark:text-[#60704b]" aria-label={balanceVisible ? (language === "fr" ? "Masquer le solde" : "Hide balance") : (language === "fr" ? "Afficher le solde" : "Show balance")}>
                  {balanceVisible ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>
              </div>
              <p className="font-[Manrope_Variable] text-[1.7rem] font-bold tracking-[-.04em]">
                {balanceVisible ? formatCurrency(totals.balance, language, appCurrency) : "********"}
              </p>
              <div className="mt-2 flex items-center gap-1.5 text-xs">
                <span className="inline-flex items-center gap-0.5 rounded-md bg-white/10 px-1.5 py-0.5 font-semibold text-[#d9efb9] dark:bg-[#40512e] dark:text-[#e4f4cd]"><WalletCards size={12} /> {accessToken ? dashboardData?.accountBalances.length ?? 0 : "8,2%"}</span>
                <span className="text-white/45 dark:text-[#647250]">{accessToken ? (language === "fr" ? "comptes suivis" : "tracked accounts") : t("compared")}</span>
              </div>
            </article>
            <StatCard label={t("monthlyIncome")} value={formatCurrency(totals.income, language, appCurrency)} change={changeLabel(incomeChange)} positive={incomeChange >= 0} icon={<ArrowDownLeft size={17} />} delay=".05s" />
            <StatCard label={t("monthlySpending")} value={formatCurrency(totals.expenses, language, appCurrency)} change={changeLabel(expenseChange)} positive={expenseChange <= 0} icon={<ArrowUpRight size={17} />} delay=".1s" />
            <StatCard label={t("savingsRate")} value={`${savingsRate.toLocaleString(language === "fr" ? "fr-FR" : "en-US", { maximumFractionDigits: 1 })}%`} change={changeLabel(savingsChange)} positive={savingsChange >= 0} icon={<CircleDollarSign size={17} />} delay=".15s" />
          </section>

          <section className={cn("mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.75fr)]", activeNav !== "overview" && "hidden")}>
            <article className="min-w-0 rounded-2xl border border-[#e1e1dc] bg-white p-5 dark:border-white/8 dark:bg-[#20211d] sm:p-6">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-[Manrope_Variable] font-bold tracking-[-.02em]">{t("cashFlow")}</h2>
                  <div className="mt-2 flex items-center gap-4 text-xs text-[var(--yahro-muted)]">
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#769450]" />{t("income")}</span>
                    <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[#b8b9b3] dark:bg-[#777a70]" />{t("expenses")}</span>
                  </div>
                </div>
                <div className="relative">
                  <Button variant="outline" size="sm" onClick={() => setPeriodMenuOpen((open) => !open)} aria-expanded={periodMenuOpen} aria-haspopup="menu">
                    {cashFlowPeriod === 3 ? (language === "fr" ? "3 derniers mois" : "Last 3 months") : t("lastSixMonths")} <ChevronDown size={14} />
                  </Button>
                  {periodMenuOpen && <div role="menu" className="absolute right-0 top-full z-20 mt-2 w-44 rounded-xl border border-[var(--yahro-border)] bg-[var(--yahro-surface)] p-1.5 shadow-xl">{([3, 6] as const).map((period) => <button key={period} type="button" role="menuitemradio" aria-checked={cashFlowPeriod === period} onClick={() => { setCashFlowPeriod(period); setPeriodMenuOpen(false); }} className="flex h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold hover:bg-[#f0f1eb] dark:hover:bg-white/7">{period === 3 ? (language === "fr" ? "3 derniers mois" : "Last 3 months") : t("lastSixMonths")}</button>)}</div>}
                </div>
              </div>
              <div className="h-[260px] w-full sm:h-[290px]">
                {activeNav === "overview" && <React.Suspense fallback={<div className="h-full animate-pulse rounded-xl bg-black/[.035] dark:bg-white/[.04]" aria-label={language === "fr" ? "Chargement du graphique" : "Loading chart"} />}><CashFlowChart data={visibleCashFlow} formatValue={(value) => formatCurrency(value, language, appCurrency)} /></React.Suspense>}
              </div>
            </article>

            <article className="rounded-2xl border border-[#e1e1dc] bg-white p-5 dark:border-white/8 dark:bg-[#20211d] sm:p-6">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-[Manrope_Variable] font-bold tracking-[-.02em]">{t("budget")}</h2>
                  <p className="mt-1 text-xs text-[var(--yahro-muted)]">{new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-US", { month: "long", year: "numeric" }).format(new Date())}</p>
                </div>
                <span className="grid size-9 place-items-center rounded-xl bg-[#eef4e5] text-[#668642] dark:bg-[#2a3822] dark:text-[#a9cc83]"><Target size={18} /></span>
              </div>

              <div className="mb-6 rounded-2xl bg-[#f4f5ef] p-4 dark:bg-[#191a16]">
                <div className="flex items-end justify-between">
                  <div><span className="font-[Manrope_Variable] text-2xl font-extrabold">{formatCurrency(budgetSpent, language, appCurrency)}</span><span className="text-sm text-[var(--yahro-muted)]"> / {formatCurrency(budgetTotal, language, appCurrency)}</span></div>
                  <span className="text-xs font-bold text-[#6d8b48]">{budgetTotal > 0 ? Math.round((budgetSpent / budgetTotal) * 100) : 0}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dedfd8] dark:bg-white/10"><div className="h-full rounded-full bg-[#769450]" style={{ width: `${budgetTotal > 0 ? Math.min(100, (budgetSpent / budgetTotal) * 100) : 0}%` }} /></div>
                <p className="mt-2 text-[11px] text-[var(--yahro-muted)]">{formatCurrency(Math.max(0, budgetTotal - budgetSpent), language, appCurrency)} {t("remaining")}</p>
              </div>

              <div className="space-y-4">
                {visibleBudgets.slice(0, 5).map((category) => {
                  const percentage = category.total > 0 ? Math.round((category.amount / category.total) * 100) : 0;
                  return (
                    <div key={category.id}>
                      <div className="mb-1.5 flex items-center justify-between text-xs">
                        <span className="flex items-center gap-2 font-medium text-[#55574f] dark:text-[#c5c7bf]">{category.icon && <CategoryIcon name={category.icon} size={14} />}{category.label}</span>
                        <span className="text-[var(--yahro-muted)]">{formatCurrency(category.amount, language, appCurrency)} / {formatCurrency(category.total, language, appCurrency)}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#ededE8] dark:bg-white/8"><div className="h-full rounded-full bg-[#769450]" style={{ width: `${Math.min(100, percentage)}%` }} /></div>
                    </div>
                  );
                })}
              </div>
              <Button variant="ghost" className="mt-5 w-full text-[#668642] dark:text-[#b4d38e]" onClick={() => setActiveNav("budgets")}>{t("viewBudgets")} <ArrowRight size={15} /></Button>
            </article>
          </section>

          <section className={cn("mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.75fr)]", activeNav !== "overview" && "hidden")}>
            <article className="overflow-hidden rounded-2xl border border-[#e1e1dc] bg-white dark:border-white/8 dark:bg-[#20211d]">
              <div className="flex items-center justify-between border-b border-[#e8e8e3] px-5 py-4 dark:border-white/7 sm:px-6">
                <h2 className="font-[Manrope_Variable] font-bold tracking-[-.02em]">{t("recent")}</h2>
                <button type="button" onClick={() => setActiveNav("transactions")} className="flex items-center gap-1 text-xs font-semibold text-[#6d8b48] dark:text-[#afd087]">{t("viewAll")} <ChevronRight size={14} /></button>
              </div>
              <div className="divide-y divide-[#eeeeea] dark:divide-white/6">
                {transactions.slice(0, 5).map((transaction) => (
                  <div key={transaction.id} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fafaf7] dark:hover:bg-white/[.025] sm:px-6">
                    <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", transaction.iconStyle)}>{transaction.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#33342e] dark:text-[#e8e8e3]">{transaction.merchant}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--yahro-muted)]">{language === "fr" ? transaction.category : transaction.categoryEn} - {formatTransactionDate(transaction.date, language, t)} - {paymentMethodLabel(transaction.paymentMethod, language)}</p>
                    </div>
                    <div className="text-right">
                      <p className={cn("text-sm font-bold", transaction.kind === "income" ? "text-[#638340] dark:text-[#a7ca7e]" : "text-[#33342e] dark:text-[#e4e4df]")}>{transaction.kind === "income" ? "+" : "-"}{formatCurrency(transaction.amount, language, appCurrency)}</p>
                      <p className="mt-0.5 text-[10px] text-[var(--yahro-muted)]">{transaction.kind === "income" ? t("incomeSingle") : t("expense")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-[#e1e1dc] bg-white p-5 dark:border-white/8 dark:bg-[#20211d] sm:p-6">
              <h2 className="font-[Manrope_Variable] font-bold tracking-[-.02em]">{t("quickActions")}</h2>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {[
                  { key: "transfer", icon: ArrowRight, status: quickActionAvailability.transfer },
                  { key: "import", icon: Download, status: quickActionAvailability.import },
                  { key: "export", icon: FileDown, status: quickActionAvailability.export },
                  { key: "addAccount", icon: CreditCard, status: accessToken ? "available" : quickActionAvailability.addAccount },
                ].map(({ key, icon: Icon, status }) => (
                  <button
                    key={key}
                    type="button"
                    disabled={status !== "available"}
                    onClick={() => { if (key === "addAccount") setActiveNav("accounts"); }}
                    className="group flex min-h-28 flex-col items-start justify-between rounded-2xl border border-[#e5e5df] bg-[#fafaf7] p-4 text-left transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-[#cfdcbc] enabled:hover:bg-[#f4f7ee] disabled:cursor-not-allowed disabled:opacity-65 dark:border-white/7 dark:bg-[#1a1b17] dark:enabled:hover:border-[#40532f] dark:enabled:hover:bg-[#222b1d]"
                  >
                    <span className="grid size-9 place-items-center rounded-xl bg-white text-[#6f8d4c] shadow-sm dark:bg-white/7 dark:text-[#afd087]"><Icon size={17} /></span>
                    <span><span className="block text-xs font-semibold leading-snug text-[#55574f] dark:text-[#bfc1b9]">{t(key)}</span>{status !== "available" && <span className="mt-1 block text-[10px] font-medium text-[var(--yahro-muted)]">{status === "account-required" ? commonText(language, "accountRequired") : commonText(language, "comingSoon")}</span>}</span>
                  </button>
                ))}
              </div>
            </article>
          </section>
        </main>
      </div>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-sm lg:hidden" onMouseDown={(event) => event.currentTarget === event.target && setMobileMenuOpen(false)}>
          <aside className="animate-soft-pop flex h-[100dvh] w-[min(300px,88vw)] flex-col overflow-y-auto overscroll-contain border-r border-[#e1e1dc] bg-[#fafaf7] px-5 pb-0 pt-[calc(1.25rem+env(safe-area-inset-top))] shadow-2xl dark:border-white/10 dark:bg-[#1b1c17]">
            <div className="mb-6 flex shrink-0 items-center justify-between">
              <div className="flex items-center gap-3"><BrandMark /><span className="font-[Manrope_Variable] text-lg font-extrabold tracking-[-.04em]">yahro</span></div>
              <Button variant="ghost" size="icon" onClick={() => setMobileMenuOpen(false)} aria-label="Close menu"><X size={20} /></Button>
            </div>
            <nav className="space-y-1">
              {navItems.map(({ key, icon: Icon }) => (
                <button key={key} type="button" onClick={() => selectNav(key)} className={cn("flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium", activeNav === key ? "bg-[#e8f1da] text-[#405729] dark:bg-[#293620] dark:text-[#c5dfa3]" : "text-[#6f7169] dark:text-[#a3a59c]")}>
                  <Icon size={18} /> {t(key)}
                </button>
              ))}
            </nav>
            <SidebarFooter mobile language={language} onSettings={() => selectNav("settings")} onLogout={onLogout} />
          </aside>
        </div>
      )}

      <nav className="fixed inset-x-3 z-50 flex min-h-16 items-center justify-around rounded-2xl border border-[#deded8] bg-white/95 px-2 shadow-[0_12px_35px_rgba(35,36,30,.14)] backdrop-blur-xl dark:border-white/10 dark:bg-[#20211d]/95 lg:hidden" style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom))" }} aria-label={language === "fr" ? "Navigation mobile" : "Mobile navigation"}>
        {navItems.slice(0, 4).map(({ key, icon: Icon }) => (
          <button key={key} type="button" onClick={() => selectNav(key)} className={cn("flex h-12 min-w-14 flex-col items-center justify-center gap-1 text-[10px] font-semibold", activeNav === key ? "text-[#597638] dark:text-[#b8d793]" : "text-[var(--yahro-muted)]")}>
            <Icon size={19} strokeWidth={activeNav === key ? 2.5 : 2} />
            {t(key)}
          </button>
        ))}
        <button type="button" onClick={() => setAddOpen(true)} className="grid size-12 place-items-center rounded-xl bg-[#20211d] text-white shadow-md dark:bg-[#dcebc5] dark:text-[#202b13]" aria-label={t("addTransaction")}><Plus size={20} /></button>
      </nav>

      {addOpen && <AddTransactionModal language={language} t={t} accessToken={accessToken} currency={appCurrency} onClose={() => setAddOpen(false)} onAdd={addTransaction} onNeedAccount={() => { setAddOpen(false); setActiveNav("accounts"); }} />}
      {profileEditorOpen && <ProfileEditor accessToken={accessToken} language={language} profile={currentProfile} onClose={() => setProfileEditorOpen(false)} onUpdated={(updated) => { setCurrentProfile(updated); setLanguage(updated.locale === "en" ? "en" : "fr"); if (updated.defaultCurrency) setAppCurrency(updated.defaultCurrency); onProfileUpdated?.(updated); }} />}
    </div>
  );
}
