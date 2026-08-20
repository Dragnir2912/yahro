import React, { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CreditCard,
  Landmark,
  Plus,
  Search,
  Scale,
  Smartphone,
  Trash2,
  Undo2,
  WalletCards,
  X,
} from "lucide-react";
import { CategoryIcon } from "@/lib/category-icons";
import AccessibleDialog from "@/components/ui/accessible-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import AsyncErrorState from "@/components/ui/async-error-state";
import { currencyFractionDigits, currencyName, formatCurrencyAmount } from "@/lib/currencies";
import { categoryName } from "@/components/category-system";
import {
  api,
  type AccountType,
  type DashboardData,
  type FinanceAccount,
  type FinanceCategory,
  type FinanceTransaction,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { paymentMethodLabel } from "@/lib/payment-methods";

type Language = "fr" | "en";

const accountTypes: AccountType[] = ["CHECKING", "SAVINGS", "CASH", "MOBILE_MONEY", "CREDIT_CARD", "INVESTMENT", "DEBT", "OTHER"];

function accountTypeLabel(type: AccountType, language: Language) {
  const labels: Record<AccountType, [string, string]> = {
    CHECKING: ["Compte courant", "Checking account"],
    SAVINGS: ["Compte d'épargne", "Savings account"],
    CASH: ["Espèces", "Cash"],
    MOBILE_MONEY: ["Mobile Money", "Mobile Money"],
    CREDIT_CARD: ["Carte de crédit", "Credit card"],
    INVESTMENT: ["Compte de placement", "Investment account"],
    DEBT: ["Dette", "Debt"],
    OTHER: ["Autre compte de suivi", "Other tracking account"],
  };
  return labels[type][language === "fr" ? 0 : 1];
}

function AccountIcon({ type }: { type: AccountType }) {
  const Icon = type === "CASH" ? Banknote : type === "MOBILE_MONEY" ? Smartphone : type === "CREDIT_CARD" ? CreditCard : type === "CHECKING" || type === "SAVINGS" ? Landmark : WalletCards;
  return <Icon size={18} />;
}

function AccountModal({ accessToken, language, currency: currencyCode, onClose, onCreated }: { accessToken: string; language: Language; currency: string; onClose: () => void; onCreated: (account: FinanceAccount) => void }) {
  const currency = currencyName(currencyCode, language);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("CHECKING");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [openingBalanceDate, setOpeningBalanceDate] = useState(new Date().toISOString().slice(0, 10));
  const [include, setInclude] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !Number.isFinite(Number(openingBalance))) return;
    setBusy(true);
    setError(undefined);
    try {
      const response = await api.createAccount(accessToken, {
        name: name.trim(),
        type,
        currency: currencyCode,
        openingBalance,
        openingBalanceDate: `${openingBalanceDate}T00:00:00.000Z`,
        color: "#769450",
        icon: type.toLocaleLowerCase().replaceAll("_", "-"),
        includeInNetWorth: include,
      });
      onCreated(response.data);
    } catch {
      setError(language === "fr" ? "Impossible d'enregistrer ce compte de suivi." : "Unable to save this tracking account.");
    } finally {
      setBusy(false);
    }
  };

  return <AccessibleDialog titleId="account-dialog-title" descriptionId="account-dialog-description" onClose={onClose} overlayClassName="z-[85]" className="sm:max-w-lg"><form onSubmit={(event) => void submit(event)} className="w-full"><div className="mb-6 flex items-start justify-between"><div><h2 id="account-dialog-title" className="font-[Manrope_Variable] text-xl font-bold">{language === "fr" ? "Ajouter un compte de suivi" : "Add a tracking account"}</h2><p id="account-dialog-description" className="mt-1 text-sm text-[var(--yahro-muted)]">{language === "fr" ? "Yahro enregistre le solde indiqué sans se connecter à votre banque." : "Yahro records the balance you provide without connecting to your bank."}</p></div><button type="button" onClick={onClose} className="yahro-touch-target grid size-12 place-items-center rounded-xl lg:size-10 hover:bg-[#eeeeea] dark:hover:bg-white/7" aria-label={language === "fr" ? "Fermer" : "Close"}><X size={18} /></button></div><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">{language === "fr" ? "Nom du compte" : "Account name"}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={language === "fr" ? "Ex. Compte principal" : "E.g. Main account"} className="mt-2 h-11 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]" /></label><label className="text-sm font-medium">{language === "fr" ? "Type" : "Type"}<select value={type} onChange={(event) => setType(event.target.value as AccountType)} className="mt-2 h-11 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]">{accountTypes.map((item) => <option key={item} value={item}>{accountTypeLabel(item, language)}</option>)}</select></label><label className="text-sm font-medium">{language === "fr" ? "Solde de départ" : "Opening balance"}<div className="relative mt-2"><input type="text" inputMode="decimal" pattern="[0-9]+([.,][0-9]+)?" value={openingBalance} onChange={(event) => setOpeningBalance(currencyFractionDigits(currencyCode) === 0 ? event.target.value.replace(/\D/g, "") : event.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))} className="h-11 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 pr-14 dark:border-white/10 dark:bg-[#181914]" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--yahro-muted)]">{currency}</span></div></label><label className="text-sm font-medium">{language === "fr" ? "Date du solde" : "Balance date"}<input type="date" value={openingBalanceDate} onChange={(event) => setOpeningBalanceDate(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]" /></label></div><label className="mt-4 flex items-start gap-3 rounded-xl bg-[#f5f6f1] p-3 text-sm dark:bg-[#191a16]"><input type="checkbox" checked={include} onChange={(event) => setInclude(event.target.checked)} className="mt-0.5 size-4 accent-[#769450]" /><span><strong>{language === "fr" ? "Inclure dans le patrimoine net" : "Include in net worth"}</strong><small className="mt-0.5 block text-[var(--yahro-muted)]">{language === "fr" ? "Ce réglage influence uniquement les calculs et graphiques." : "This setting only affects calculations and charts."}</small></span></label>{error && <p className="mt-4 rounded-xl bg-[#f7e9e5] px-4 py-3 text-xs text-[#a05240]">{error}</p>}<div className="mt-6 flex gap-3"><button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-yahro-border text-sm font-semibold dark:border-white/10">{language === "fr" ? "Annuler" : "Cancel"}</button><button type="submit" disabled={!name.trim() || busy} className="h-11 flex-1 rounded-xl bg-[#20211d] text-sm font-semibold text-white disabled:opacity-40 dark:bg-[#dcebc5] dark:text-[#202b13]">{language === "fr" ? "Enregistrer" : "Save"}</button></div></form></AccessibleDialog>;
}

export function AccountsDashboard({ accessToken, language, defaultCurrency, onChanged }: { accessToken: string; language: Language; defaultCurrency: string; onChanged?: () => void }) {
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData>();
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<FinanceAccount>();
  const [archivePending, setArchivePending] = useState(false);
  const [error, setError] = useState<string>();

  const reload = React.useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const [accountResponse, dashboardResponse] = await Promise.all([api.accounts(accessToken), api.dashboard(accessToken)]);
      setAccounts(accountResponse.data);
      setDashboard(dashboardResponse);
    } catch {
      setAccounts([]);
      setDashboard(undefined);
      setError(language === "fr" ? "Impossible de charger vos comptes." : "Unable to load your accounts.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, language]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void reload(); }, 0);
    return () => window.clearTimeout(timeout);
  }, [reload]);
  const balances = new Map(dashboard?.accountBalances.map((item) => [item.id, item.balance]) ?? []);

  return <><section className="animate-fade-up space-y-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[.13em] text-[var(--yahro-accent-text)]">{language === "fr" ? "Suivi manuel" : "Manual tracking"}</p><h1 className="font-[Manrope_Variable] text-2xl font-extrabold sm:text-3xl">{language === "fr" ? "Comptes" : "Accounts"}</h1><p className="mt-2 text-sm text-[var(--yahro-muted)]">{language === "fr" ? "Reproduisez vos comptes pour suivre leurs soldes. Aucune opération bancaire n'est exécutée." : "Mirror your accounts to track balances. No banking operation is performed."}</p></div><button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#20211d] px-4 text-sm font-semibold text-white dark:bg-[#dcebc5] dark:text-[#202b13]"><Plus size={17} />{language === "fr" ? "Ajouter un compte" : "Add account"}</button></div>{error && <AsyncErrorState message={error} retryLabel={language === "fr" ? "Réessayer" : "Retry"} onRetry={() => void reload()} />}{loading ? <div className="h-56 animate-pulse rounded-2xl bg-white dark:bg-white/5" /> : accounts.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d8ddd0] bg-white p-12 text-center dark:border-white/10 dark:bg-[#20211d]"><WalletCards size={28} className="mx-auto text-[#789653]" /><h2 className="mt-4 font-bold">{language === "fr" ? "Commencez par un compte de suivi" : "Start with a tracking account"}</h2><p className="mt-1 text-xs text-[var(--yahro-muted)]">{language === "fr" ? "Vous pourrez ensuite y noter vos entrées et sorties." : "You can then record income and expenses in it."}</p></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{accounts.map((account) => <article key={account.id} className="group rounded-2xl border border-yahro-border bg-white p-5 dark:border-white/8 dark:bg-[#20211d]"><div className="flex items-start justify-between"><span className="yahro-touch-target grid size-12 place-items-center rounded-xl bg-[#edf4e3] text-[#668642] dark:bg-[#2b3823] dark:text-[#bddb98] lg:size-10"><AccountIcon type={account.type} /></span><button type="button" onClick={() => setArchiveTarget(account)} className="yahro-hover-action yahro-touch-target grid size-11 place-items-center rounded-xl text-[#777970] opacity-60 hover:bg-[#f3e7e3] hover:text-[#a25543] focus-visible:opacity-100 sm:group-hover:opacity-100" aria-label={language === "fr" ? "Archiver" : "Archive"}><Archive size={15} /></button></div><p className="mt-5 text-sm font-bold">{account.name}</p><p className="mt-1 text-xs text-[var(--yahro-muted)]">{accountTypeLabel(account.type, language)}</p><p className="yahro-money mt-5 font-[Manrope_Variable] text-2xl font-extrabold">{formatCurrencyAmount(balances.get(account.id) ?? account.openingBalance, account.currency, language)}</p><p className="mt-1 text-[11px] text-[var(--yahro-muted)]">{language === "fr" ? "Solde calculé selon vos saisies" : "Balance calculated from your entries"}</p></article>)}</div>}{modalOpen && <AccountModal accessToken={accessToken} language={language} currency={defaultCurrency} onClose={() => setModalOpen(false)} onCreated={(account) => { setAccounts((current) => [...current, account]); setModalOpen(false); void reload(); onChanged?.(); }} />}</section><ConfirmDialog open={Boolean(archiveTarget)} title={language === "fr" ? "Archiver ce compte ?" : "Archive this account?"} description={language === "fr" ? "Le compte disparaîtra de votre suivi courant. Les opérations déjà notées restent conservées." : "The account will leave your current tracking. Existing recorded operations are preserved."} confirmLabel={language === "fr" ? "Archiver" : "Archive"} cancelLabel={language === "fr" ? "Annuler" : "Cancel"} pending={archivePending} onClose={() => setArchiveTarget(undefined)} onConfirm={async () => { if (!archiveTarget) return; setArchivePending(true); try { await api.archiveAccount(accessToken, archiveTarget.id); setArchiveTarget(undefined); await reload(); onChanged?.(); } finally { setArchivePending(false); } }} /></>;
}

export function TransactionsDashboard({ accessToken, language, onAdd, revision = 0 }: { accessToken: string; language: Language; onAdd: () => void; revision?: number }) {
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinanceAccount[]>([]);
  const [categories, setCategories] = useState<FinanceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"ALL" | "INCOME" | "EXPENSE">("ALL");
  const [undoItem, setUndoItem] = useState<FinanceTransaction>();
  const [error, setError] = useState<string>();
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(undefined);
      void Promise.all([api.transactions(accessToken, { limit: 100 }), api.accounts(accessToken), api.categories(accessToken)]).then(([transactionResponse, accountResponse, categoryResponse]) => {
        if (!active) return;
        setTransactions(transactionResponse.data);
        setAccounts(accountResponse.data);
        setCategories(categoryResponse.data);
      }).catch(() => { if (active) { setTransactions([]); setError(language === "fr" ? "Impossible de charger les opérations." : "Unable to load operations."); } }).finally(() => { if (active) setLoading(false); });
    }, 0);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [accessToken, language, retryRevision, revision]);

  useEffect(() => {
    if (!undoItem) return;
    const timeout = window.setTimeout(() => setUndoItem(undefined), 7000);
    return () => window.clearTimeout(timeout);
  }, [undoItem]);

  const accountMap = useMemo(() => new Map(accounts.map((item) => [item.id, item])), [accounts]);
  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  const visible = transactions.filter((item) => (type === "ALL" || item.type === type) && `${item.description} ${item.merchant ?? ""}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));

  return <section className="animate-fade-up space-y-5"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[.13em] text-[var(--yahro-accent-text)]">{language === "fr" ? "Historique déclaré" : "Recorded history"}</p><h1 className="font-[Manrope_Variable] text-2xl font-extrabold sm:text-3xl">{language === "fr" ? "Opérations notées" : "Recorded operations"}</h1><p className="mt-2 text-sm text-[var(--yahro-muted)]">{language === "fr" ? "Toutes les entrées et sorties que vous avez renseignées manuellement." : "All income and expenses you entered manually."}</p></div><button type="button" onClick={onAdd} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#20211d] px-4 text-sm font-semibold text-white dark:bg-[#dcebc5] dark:text-[#202b13]"><Plus size={17} />{language === "fr" ? "Noter une opération" : "Record an operation"}</button></div>{error && <AsyncErrorState message={error} retryLabel={language === "fr" ? "Réessayer" : "Retry"} onRetry={() => setRetryRevision((current) => current + 1)} />}<div className="flex flex-col gap-3 rounded-2xl border border-yahro-border bg-white p-4 dark:border-white/8 dark:bg-[#20211d] sm:flex-row"><label className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--yahro-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={language === "fr" ? "Rechercher une opération" : "Search operations"} className="h-12 w-full rounded-xl border border-yahro-border bg-[#fafaf7] pl-9 pr-3 text-base dark:border-white/10 dark:bg-[#181914] sm:h-10 sm:text-sm" /></label><div className="inline-flex rounded-xl bg-[#f0f0eb] p-1 dark:bg-white/7">{(["ALL", "EXPENSE", "INCOME"] as const).map((value) => <button key={value} type="button" onClick={() => setType(value)} className={cn("h-12 rounded-lg px-3 text-sm font-bold sm:h-9 sm:text-xs", type === value ? "bg-white shadow-sm dark:bg-[#303129]" : "text-[var(--yahro-muted)]")}>{value === "ALL" ? (language === "fr" ? "Tout" : "All") : value === "EXPENSE" ? (language === "fr" ? "Sorties" : "Expenses") : (language === "fr" ? "Entrées" : "Income")}</button>)}</div></div>{loading ? <div className="h-52 animate-pulse rounded-2xl bg-white dark:bg-white/5" /> : visible.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d8ddd0] bg-white p-12 text-center dark:border-white/10 dark:bg-[#20211d]"><p className="font-semibold">{language === "fr" ? "Aucune opération enregistrée" : "No recorded operation"}</p></div> : <div className="overflow-hidden rounded-2xl border border-yahro-border bg-white dark:border-white/8 dark:bg-[#20211d]"><div className="divide-y divide-[#ecece7] dark:divide-white/7">{visible.map((item) => { const category = item.categoryId ? categoryMap.get(item.categoryId) : undefined; const account = accountMap.get(item.accountId); return <article key={item.id} className="group flex items-center gap-3 px-4 py-4 sm:px-5"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#eef3e7] text-[#668642] dark:bg-[#2a3722] dark:text-[#bddb98]"><CategoryIcon name={category?.icon} size={18} /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{item.merchant || item.description}</p><p className="mt-1 truncate text-[11px] text-[var(--yahro-muted)]">{category ? categoryName(category, language) : (language === "fr" ? "Sans catégorie" : "Uncategorized")} - {account?.name ?? "Compte"} - {paymentMethodLabel(item.paymentMethod, language)}</p></div><div className="text-right"><p className={cn("yahro-money text-sm font-extrabold", item.type === "INCOME" ? "text-[#668642] dark:text-[#acd184]" : "text-[#33342e] dark:text-[#e8e8e3]")}>{item.type === "INCOME" ? "+" : "-"}{formatCurrencyAmount(item.amount, item.currency, language)}</p><p className="mt-1 text-[10px] text-[var(--yahro-muted)]">{new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-US", { dateStyle: "medium" }).format(new Date(item.transactionDate))}</p></div><button type="button" onClick={async () => { await api.deleteTransaction(accessToken, item.id); setTransactions((current) => current.filter((transaction) => transaction.id !== item.id)); setUndoItem(item); }} className="yahro-hover-action yahro-touch-target ml-1 grid size-11 place-items-center rounded-xl text-[#777970] opacity-60 hover:bg-[#f3e7e3] hover:text-[#a25543] focus-visible:opacity-100 sm:group-hover:opacity-100" aria-label={language === "fr" ? "Supprimer" : "Delete"}><Trash2 size={15} /></button></article>; })}</div></div>}{undoItem && <div role="status" className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 z-[95] flex w-[min(92vw,420px)] -translate-x-1/2 items-center justify-between gap-4 rounded-2xl bg-[#20211d] px-4 py-3 text-sm text-white shadow-2xl dark:bg-[#e8eadf] dark:text-yahro-text lg:bottom-6"><span>{language === "fr" ? "Opération supprimée" : "Operation deleted"}</span><button type="button" onClick={async () => { const item = undoItem; await api.restoreTransaction(accessToken, item.id); setTransactions((current) => [item, ...current]); setUndoItem(undefined); }} className="yahro-touch-target inline-flex min-h-11 items-center gap-2 rounded-xl px-3 font-bold text-[#cbeaa2] dark:text-[#49642d]"><Undo2 size={16} />{language === "fr" ? "Annuler" : "Undo"}</button></div>}</section>;
}

export function AnalyticsDashboard({ dashboard, categories, language, currency, loading = false }: { dashboard?: DashboardData; categories: FinanceCategory[]; language: Language; currency: string; loading?: boolean }) {
  const categoryMap = useMemo(() => new Map(categories.map((item) => [item.id, item])), [categories]);
  if (loading && !dashboard) return <section className="animate-fade-up space-y-5"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[.13em] text-[var(--yahro-accent-text)]">{language === "fr" ? "Données réelles" : "Live data"}</p><h1 className="font-[Manrope_Variable] text-2xl font-extrabold sm:text-3xl">{language === "fr" ? "Analyse du mois" : "Monthly analysis"}</h1></div><div className="h-64 animate-pulse rounded-2xl bg-[var(--yahro-surface)]" aria-label={language === "fr" ? "Chargement des analyses" : "Loading analytics"} /></section>;
  const spending = (dashboard?.spendingByCategory ?? []).filter((item) => item.currency === currency);
  const maximum = Math.max(1, ...spending.map((item) => Number(item.amount)));
  const income = Number(dashboard?.totals.find((item) => item.currency === currency && item.type === "INCOME")?.amount ?? 0);
  const expenses = Number(dashboard?.totals.find((item) => item.currency === currency && item.type === "EXPENSE")?.amount ?? 0);
  const saved = income - expenses;

  const summaries = [
    { label: language === "fr" ? "Entrées" : "Income", value: income, icon: <ArrowDownLeft size={17} /> },
    { label: language === "fr" ? "Sorties" : "Expenses", value: expenses, icon: <ArrowUpRight size={17} /> },
    { label: language === "fr" ? "Écart" : "Difference", value: saved, icon: <Scale size={17} /> },
  ];

  return <section className="animate-fade-up space-y-5"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[.13em] text-[var(--yahro-accent-text)]">{language === "fr" ? "Données réelles" : "Live data"}</p><h1 className="font-[Manrope_Variable] text-2xl font-extrabold sm:text-3xl">{language === "fr" ? "Analyse du mois" : "Monthly analysis"}</h1><p className="mt-2 text-sm text-yahro-muted">{language === "fr" ? "Une lecture de vos opérations enregistrées, sans connexion ni exécution bancaire." : "A view of your recorded operations, without any bank connection or execution."}</p></div><div className="grid gap-4 sm:grid-cols-3">{summaries.map((item) => <article key={item.label} className="rounded-2xl border border-yahro-border bg-white p-5 dark:border-white/8 dark:bg-[#20211d]"><span className="grid size-9 place-items-center rounded-xl bg-[#edf4e3] text-[#668642] dark:bg-[#2b3823] dark:text-[#bddb98]">{item.icon}</span><p className="mt-4 text-xs font-semibold text-[var(--yahro-muted)]">{item.label}</p><p className="mt-1 font-[Manrope_Variable] text-2xl font-extrabold">{formatCurrencyAmount(item.value, currency, language)}</p></article>)}</div><article className="rounded-2xl border border-yahro-border bg-white p-5 dark:border-white/8 dark:bg-[#20211d] sm:p-6"><h2 className="font-[Manrope_Variable] font-bold">{language === "fr" ? "Sorties par poste" : "Expenses by post"}</h2>{spending.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-[#d8ddd0] px-4 py-10 text-center text-sm text-[var(--yahro-muted)] dark:border-white/10">{language === "fr" ? "Aucune sortie enregistrée pour cette période." : "No expense recorded for this period."}</p> : <div className="mt-5 space-y-4">{spending.map((item) => { const category = categoryMap.get(item.categoryId); const amount = Number(item.amount); return <div key={`${item.categoryId}-${item.currency}`}><div className="mb-2 flex items-center justify-between gap-4 text-xs"><span className="flex min-w-0 items-center gap-2 font-semibold"><span className="grid size-7 shrink-0 place-items-center rounded-lg bg-[#edf4e3] text-[#668642] dark:bg-[#2b3823] dark:text-[#bddb98]"><CategoryIcon name={category?.icon} size={14} /></span><span className="truncate">{category ? categoryName(category, language) : item.name}</span></span><strong>{formatCurrencyAmount(amount, currency, language)}</strong></div><div className="h-2 overflow-hidden rounded-full bg-[#ecece7] dark:bg-white/8"><div className="h-full rounded-full bg-yahro-accent" style={{ width: `${Math.max(3, (amount / maximum) * 100)}%` }} /></div></div>; })}</div>}</article></section>;
}
