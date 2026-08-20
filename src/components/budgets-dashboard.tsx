import React, { useEffect, useMemo, useState } from "react";
import { Archive, CalendarRange, CircleAlert, Plus, Target, TrendingDown, X } from "lucide-react";
import { CategoryPicker, categoryName, demoCategories, type CategorySelection } from "@/components/category-system";
import { api, type BudgetFrequency, type BudgetProgress, type FinanceBudget, type FinanceCategory } from "@/lib/api";
import { cn } from "@/lib/utils";
import { currencyName } from "@/lib/currencies";
import AccessibleDialog from "@/components/ui/accessible-dialog";

type Language = "fr" | "en";

const frequencies: BudgetFrequency[] = ["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"];

function frequencyLabel(value: BudgetFrequency, language: Language) {
  const labels: Record<BudgetFrequency, [string, string]> = {
    ONE_TIME: ["Une seule fois", "One time"],
    WEEKLY: ["Hebdomadaire", "Weekly"],
    BIWEEKLY: ["Toutes les deux semaines", "Every two weeks"],
    MONTHLY: ["Mensuel", "Monthly"],
    QUARTERLY: ["Trimestriel", "Quarterly"],
    SEMIANNUAL: ["Semestriel", "Semiannual"],
    ANNUAL: ["Annuel", "Annual"],
  };
  return labels[value][language === "fr" ? 0 : 1];
}

function formatMoney(value: number, currency: string, language: Language) {
  return new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(value);
}

function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function endForFrequency(startValue: string, frequency: BudgetFrequency) {
  const start = new Date(`${startValue}T00:00:00.000Z`);
  const end = new Date(start);
  if (frequency === "ONE_TIME") end.setUTCDate(end.getUTCDate() + 1);
  if (frequency === "WEEKLY") end.setUTCDate(end.getUTCDate() + 7);
  if (frequency === "BIWEEKLY") end.setUTCDate(end.getUTCDate() + 14);
  if (frequency === "MONTHLY") end.setUTCMonth(end.getUTCMonth() + 1);
  if (frequency === "QUARTERLY") end.setUTCMonth(end.getUTCMonth() + 3);
  if (frequency === "SEMIANNUAL") end.setUTCMonth(end.getUTCMonth() + 6);
  if (frequency === "ANNUAL") end.setUTCFullYear(end.getUTCFullYear() + 1);
  return dateInput(end);
}

const now = new Date();
const defaultStart = dateInput(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));

function demoBudgets(currency: string): FinanceBudget[] {
  const categories = ["expense.housing", "expense.food", "expense.transport", "expense.leisure"];
  const amounts = [1200, 700, 500, 400];
  return categories.map((key, index) => ({
    id: `demo-budget-${index}`,
    categoryId: `demo-family-${key}`,
    periodStart: `${defaultStart}T00:00:00.000Z`,
    periodEnd: `${endForFrequency(defaultStart, "MONTHLY")}T00:00:00.000Z`,
    amount: String(amounts[index]),
    currency,
    frequency: "MONTHLY",
    warningThreshold: 80,
    rolloverEnabled: false,
    notes: null,
    version: 1,
  }));
}

function BudgetModal({
  accessToken,
  language,
  currency,
  onClose,
  onCreated,
}: {
  accessToken?: string;
  language: Language;
  currency: string;
  onClose: () => void;
  onCreated: (budget: FinanceBudget) => void;
}) {
  const [selection, setSelection] = useState<CategorySelection | null>(null);
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<BudgetFrequency>("MONTHLY");
  const [periodStart, setPeriodStart] = useState(defaultStart);
  const [periodEnd, setPeriodEnd] = useState(endForFrequency(defaultStart, "MONTHLY"));
  const [threshold, setThreshold] = useState(80);
  const [rollover, setRollover] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const changeFrequency = (value: BudgetFrequency) => {
    setFrequency(value);
    setPeriodEnd(endForFrequency(periodStart, value));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selection || Number(amount) <= 0 || periodEnd <= periodStart) return;
    setBusy(true);
    setError(undefined);
    try {
      const input = {
        categoryId: selection.categoryId,
        periodStart: `${periodStart}T00:00:00.000Z`,
        periodEnd: `${periodEnd}T00:00:00.000Z`,
        amount,
        currency,
        frequency,
        warningThreshold: threshold,
        rolloverEnabled: rollover,
        notes: notes.trim() || undefined,
      };
      const created = accessToken
        ? (await api.createBudget(accessToken, input)).data
        : { id: `demo-budget-${Date.now()}`, ...input, notes: input.notes ?? null, version: 1 };
      onCreated(created);
    } catch {
      setError(language === "fr" ? "Ce budget existe peut-être déjà pour cette période." : "A budget may already exist for this period.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AccessibleDialog titleId="budget-dialog-title" descriptionId="budget-dialog-description" onClose={onClose} overlayClassName="z-[85]" className="sm:max-w-2xl">
      <form onSubmit={(event) => void submit(event)} className="w-full">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div><h2 id="budget-dialog-title" className="font-[Manrope_Variable] text-xl font-bold">{language === "fr" ? "Définir un budget" : "Set a budget"}</h2><p id="budget-dialog-description" className="mt-1 text-sm text-[var(--yahro-muted)]">{language === "fr" ? "Yahro suivra les opérations que vous noterez dans cette catégorie." : "Yahro will track the operations you record in this category."}</p></div>
          <button type="button" onClick={onClose} className="yahro-touch-target grid size-12 place-items-center rounded-xl text-[var(--yahro-muted)] hover:bg-[#eeeeea] lg:size-10 dark:hover:bg-white/7" aria-label={language === "fr" ? "Fermer" : "Close"}><X size={19} /></button>
        </div>

        <CategoryPicker accessToken={accessToken} language={language} type="EXPENSE" onChange={setSelection} />

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium text-[#55574f] dark:text-[#c0c1ba]">{language === "fr" ? "Montant prévu" : "Planned amount"} - {currencyName(currency, language)}<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#deded8] bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]" /></label>
          <label className="text-sm font-medium text-[#55574f] dark:text-[#c0c1ba]">{language === "fr" ? "Rythme" : "Frequency"}<select value={frequency} onChange={(event) => changeFrequency(event.target.value as BudgetFrequency)} className="mt-2 h-11 w-full rounded-xl border border-[#deded8] bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]">{frequencies.map((item) => <option key={item} value={item}>{frequencyLabel(item, language)}</option>)}</select></label>
          <label className="text-sm font-medium text-[#55574f] dark:text-[#c0c1ba]">{language === "fr" ? "Début" : "Start"}<input type="date" value={periodStart} onChange={(event) => { setPeriodStart(event.target.value); setPeriodEnd(endForFrequency(event.target.value, frequency)); }} className="mt-2 h-11 w-full rounded-xl border border-[#deded8] bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]" /></label>
          <label className="text-sm font-medium text-[#55574f] dark:text-[#c0c1ba]">{language === "fr" ? "Fin de la première période" : "End of first period"}<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-[#deded8] bg-[#fafaf7] px-3 dark:border-white/10 dark:bg-[#181914]" /></label>
        </div>

        <label className="mt-5 block text-sm font-medium text-[#55574f] dark:text-[#c0c1ba]">{language === "fr" ? `Alerte à ${threshold}%` : `Alert at ${threshold}%`}<input type="range" min="50" max="100" step="5" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} className="mt-2 w-full accent-[#769450]" /></label>
        <label className="mt-4 flex items-start gap-3 rounded-xl bg-[#f5f6f1] p-3 text-sm dark:bg-[#191a16]"><input type="checkbox" checked={rollover} onChange={(event) => setRollover(event.target.checked)} className="mt-0.5 size-4 accent-[#769450]" /><span><span className="font-semibold">{language === "fr" ? "Reporter le solde non utilisé" : "Roll over unused amount"}</span><span className="mt-0.5 block text-xs text-[var(--yahro-muted)]">{language === "fr" ? "Le report sera visible dans le suivi, sans créer de mouvement d'argent." : "The rollover will appear in tracking without creating any money movement."}</span></span></label>
        <label className="mt-4 block text-sm font-medium text-[#55574f] dark:text-[#c0c1ba]">{language === "fr" ? "Note facultative" : "Optional note"}<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={2} className="mt-2 w-full resize-none rounded-xl border border-[#deded8] bg-[#fafaf7] p-3 dark:border-white/10 dark:bg-[#181914]" /></label>
        {error && <p className="mt-4 rounded-xl bg-[#f8eae6] px-4 py-3 text-xs text-[#9c4f3d] dark:bg-[#3a2722] dark:text-[#e3a08f]">{error}</p>}
        <div className="mt-6 flex gap-3"><button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl border border-[#dfdfd9] text-sm font-semibold dark:border-white/10">{language === "fr" ? "Annuler" : "Cancel"}</button><button type="submit" disabled={!selection || Number(amount) <= 0 || periodEnd <= periodStart || busy} className="h-11 flex-1 rounded-xl bg-[#20211d] text-sm font-semibold text-white disabled:opacity-40 dark:bg-[#dcebc5] dark:text-[#202b13]"><Plus size={16} className="mr-2 inline" />{language === "fr" ? "Enregistrer le budget" : "Save budget"}</button></div>
      </form>
    </AccessibleDialog>
  );
}

export default function BudgetsDashboard({ accessToken, language, defaultCurrency }: { accessToken?: string; language: Language; defaultCurrency: string }) {
  const [categories, setCategories] = useState<FinanceCategory[]>(demoCategories);
  const [budgets, setBudgets] = useState<FinanceBudget[]>(() => demoBudgets(defaultCurrency));
  const [progress, setProgress] = useState<BudgetProgress[]>([
    { id: "demo-budget-0", categoryId: "demo-family-expense.housing", categoryName: "Logement", color: "#8D7B68", amount: "1200", currency: defaultCurrency, warningThreshold: 80, spent: "920" },
    { id: "demo-budget-1", categoryId: "demo-family-expense.food", categoryName: "Alimentation", color: "#DDA75B", amount: "700", currency: defaultCurrency, warningThreshold: 80, spent: "486" },
    { id: "demo-budget-2", categoryId: "demo-family-expense.transport", categoryName: "Transport", color: "#7799A6", amount: "500", currency: defaultCurrency, warningThreshold: 80, spent: "288" },
    { id: "demo-budget-3", categoryId: "demo-family-expense.leisure", categoryName: "Loisirs", color: "#A786A5", amount: "400", currency: defaultCurrency, warningThreshold: 80, spent: "164" },
  ]);
  const [loading, setLoading] = useState(Boolean(accessToken));
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!accessToken) return;
    const load = async () => {
      const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString();
      const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1)).toISOString();
      try {
        const [categoryResponse, budgetResponse, dashboardResponse] = await Promise.all([
          api.categories(accessToken),
          api.budgets(accessToken, start, end),
          api.dashboard(accessToken),
        ]);
        setCategories(categoryResponse.data);
        setBudgets(budgetResponse.data);
        setProgress(dashboardResponse.budgetProgress);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [accessToken]);

  const progressById = useMemo(() => new Map(progress.map((item) => [item.id, item])), [progress]);
  const totals = useMemo(() => budgets.filter((item) => item.currency === defaultCurrency).reduce((result, budget) => {
    const itemProgress = progressById.get(budget.id);
    result.planned += Number(budget.amount);
    result.spent += Number(itemProgress?.spent ?? 0);
    return result;
  }, { planned: 0, spent: 0 }), [budgets, defaultCurrency, progressById]);

  const archiveBudget = async (budget: FinanceBudget) => {
    if (accessToken) await api.deleteBudget(accessToken, budget.id);
    setBudgets((current) => current.filter((item) => item.id !== budget.id));
    setProgress((current) => current.filter((item) => item.id !== budget.id));
  };

  return (
    <section className="animate-fade-up space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="mb-1 text-xs font-semibold uppercase tracking-[.13em] text-[#7c9a51] dark:text-[#9cbc73]">{language === "fr" ? "Planification" : "Planning"}</p><h1 className="font-[Manrope_Variable] text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">{language === "fr" ? "Budgets" : "Budgets"}</h1><p className="mt-2 max-w-2xl text-sm text-[var(--yahro-muted)] dark:text-[#a4a69d]">{language === "fr" ? "Comparez vos limites aux dépenses que vous avez enregistrées. Yahro ne réalise aucune opération à votre place." : "Compare your limits with the expenses you recorded. Yahro never performs transactions on your behalf."}</p></div><button type="button" onClick={() => setModalOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#20211d] px-4 text-sm font-semibold text-white dark:bg-[#dcebc5] dark:text-[#202b13]"><Plus size={17} />{language === "fr" ? "Nouveau budget" : "New budget"}</button></div>

      <div className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-2xl bg-[#20211d] p-5 text-white dark:bg-[#dcebc5] dark:text-[#202b13]"><Target size={18} className="text-[#d4ebaF] dark:text-[#516538]" /><p className="mt-5 font-[Manrope_Variable] text-2xl font-extrabold">{formatMoney(totals.planned, defaultCurrency, language)}</p><p className="mt-1 text-xs text-white/55 dark:text-[#61704e]">{language === "fr" ? "Montant planifié" : "Planned amount"}</p></article>
        <article className="rounded-2xl border border-[#e1e1dc] bg-white p-5 dark:border-white/8 dark:bg-[#20211d]"><TrendingDown size={18} className="text-[#b77b4f]" /><p className="mt-5 font-[Manrope_Variable] text-2xl font-extrabold">{formatMoney(totals.spent, defaultCurrency, language)}</p><p className="mt-1 text-xs text-[var(--yahro-muted)]">{language === "fr" ? "Dépenses notées" : "Recorded expenses"}</p></article>
        <article className="rounded-2xl border border-[#e1e1dc] bg-white p-5 dark:border-white/8 dark:bg-[#20211d]"><CalendarRange size={18} className="text-[#6f8f9d]" /><p className="mt-5 font-[Manrope_Variable] text-2xl font-extrabold">{budgets.length}</p><p className="mt-1 text-xs text-[var(--yahro-muted)]">{language === "fr" ? "Budgets suivis" : "Tracked budgets"}</p></article>
      </div>

      {loading ? <div className="h-64 animate-pulse rounded-2xl bg-white dark:bg-white/5" /> : budgets.length === 0 ? <div className="rounded-2xl border border-dashed border-[#d9ddd3] bg-white p-12 text-center dark:border-white/10 dark:bg-[#20211d]"><Target size={26} className="mx-auto text-[#829665]" /><p className="mt-4 font-semibold">{language === "fr" ? "Aucun budget pour cette période" : "No budget for this period"}</p><p className="mt-1 text-xs text-[var(--yahro-muted)]">{language === "fr" ? "Créez une limite pour commencer le suivi." : "Create a limit to start tracking."}</p></div> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {budgets.map((budget) => {
            const itemProgress = progressById.get(budget.id);
            const spent = Number(itemProgress?.spent ?? 0);
            const amount = Number(budget.amount);
            const percent = amount > 0 ? Math.round((spent / amount) * 100) : 0;
            const category = categories.find((item) => item.id === budget.categoryId);
            const family = category?.level === 2 ? categories.find((item) => item.id === category.parentId) : category;
            const warning = percent >= budget.warningThreshold;
            return <article key={budget.id} className="rounded-2xl border border-[#e1e1dc] bg-white p-5 dark:border-white/8 dark:bg-[#20211d]"><div className="flex items-start gap-3"><span className="mt-1 size-3 shrink-0 rounded-full" style={{ backgroundColor: category?.color ?? itemProgress?.color ?? "#769450" }} /><div className="min-w-0 flex-1"><p className="text-sm font-bold">{category ? categoryName(category, language) : itemProgress?.categoryName ?? "Catégorie"}</p>{family && family.id !== category?.id && <p className="mt-0.5 text-[11px] text-[var(--yahro-muted)]">{categoryName(family, language)}</p>}</div><span className="rounded-lg bg-[#f0f1eb] px-2 py-1 text-[10px] font-bold text-[var(--yahro-muted)] dark:bg-white/7">{frequencyLabel(budget.frequency, language)}</span><button type="button" onClick={() => { if (window.confirm(language === "fr" ? "Archiver ce budget ?" : "Archive this budget?")) void archiveBudget(budget); }} className="yahro-touch-target grid size-11 place-items-center rounded-xl text-[#777970] hover:bg-[#f3e7e3] hover:text-[#a25543]" aria-label={language === "fr" ? "Archiver" : "Archive"}><Archive size={15} /></button></div><div className="mt-5 flex items-end justify-between"><p><span className="font-[Manrope_Variable] text-xl font-extrabold">{formatMoney(spent, budget.currency, language)}</span><span className="text-xs text-[var(--yahro-muted)]"> / {formatMoney(amount, budget.currency, language)}</span></p><span className={cn("text-xs font-bold", warning ? "text-[#b15d47]" : "text-[#668642]")}>{percent}%</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#ecece7] dark:bg-white/8"><div className={cn("h-full rounded-full", warning ? "bg-[#c66e56]" : "bg-[#769450]")} style={{ width: `${Math.min(percent, 100)}%` }} /></div>{warning && <p className="mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[#ad5a45]"><CircleAlert size={13} />{percent > 100 ? (language === "fr" ? "Limite dépassée selon les dépenses notées" : "Limit exceeded based on recorded expenses") : (language === "fr" ? "Seuil d'alerte atteint" : "Alert threshold reached")}</p>}</article>;
          })}
        </div>
      )}

      {modalOpen && <BudgetModal accessToken={accessToken} language={language} currency={defaultCurrency} onClose={() => setModalOpen(false)} onCreated={(budget) => { setBudgets((current) => [budget, ...current]); setModalOpen(false); }} />}
    </section>
  );
}
