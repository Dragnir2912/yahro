import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  Archive,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  CirclePause,
  CirclePlay,
  ListFilter,
  Plus,
  ReceiptText,
  WalletCards,
  X,
} from "lucide-react";
import { api, ApiError, type BudgetFrequency, type BudgetProject, type PaymentMethod, type ProjectExpense, type ProjectInput, type ProjectKind, type ProjectStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { currencyName, supportedCurrencies } from "@/lib/currencies";
import AccessibleDialog from "@/components/ui/accessible-dialog";
import { projectMessages } from "@/lib/i18n";

type Language = "fr" | "en";

interface ProjectsDashboardProps {
  accessToken?: string;
  language: Language;
  defaultCurrency: string;
}

const projectColors = ["#769450", "#D18A54", "#648A9A", "#9A7295", "#B16452", "#547D72"];

const demoProjects: BudgetProject[] = [
  {
    id: "demo-project-1",
    kind: "PROJECT",
    name: "Rénovation du salon",
    description: "Peinture, mobilier et éclairage.",
    status: "ACTIVE",
    totalBudget: "850000",
    spentAmount: "512000",
    expenseCount: 7,
    currency: "XOF",
    budgetFrequency: "ONE_TIME",
    lifetimeSpentAmount: "512000",
    cashSpentAmount: "112000",
    electronicSpentAmount: "400000",
    startDate: "2026-08-01T00:00:00.000Z",
    endDate: "2026-10-15T00:00:00.000Z",
    warningThreshold: 80,
    color: "#769450",
    version: 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  },
  {
    id: "demo-project-2",
    kind: "ACTIVITY",
    name: "Week-end a Grand-Bassam",
    description: "Transport, logement, repas et activités.",
    status: "PLANNED",
    totalBudget: "240000",
    spentAmount: "45000",
    expenseCount: 2,
    currency: "XOF",
    budgetFrequency: "WEEKLY",
    lifetimeSpentAmount: "45000",
    cashSpentAmount: "15000",
    electronicSpentAmount: "30000",
    startDate: "2026-09-12T00:00:00.000Z",
    endDate: "2026-09-14T00:00:00.000Z",
    warningThreshold: 75,
    color: "#648A9A",
    version: 1,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  },
];

const labels = {
  fr: {
    ...projectMessages.fr,
    title: "Projets et activités",
    newProject: "Nouveau projet",
    all: "Tous",
    active: "Actifs",
    totalBudget: "Budget total",
    spent: "Dépensé",
    remaining: "Restant",
    empty: "Aucun projet dans cette vue.",
    emptyHint: "Créez votre premier projet pour commencer son suivi.",
    project: "Projet",
    warning: "Seuil d'alerte atteint",
    loading: "Chargement des projets...",
    loadError: "Impossible de charger vos projets.",
    retry: "Réessayer",
    archive: "Archiver",
    noEndDate: "Sans date de fin",
    privateLabel: "Visible uniquement par vous",
  },
  en: {
    ...projectMessages.en,
    title: "Projects and activities",
    newProject: "New project",
    all: "All",
    active: "Active",
    totalBudget: "Total budget",
    spent: "Spent",
    remaining: "Remaining",
    empty: "No projects in this view.",
    emptyHint: "Create your first project to start tracking it.",
    project: "Project",
    warning: "Warning threshold reached",
    loading: "Loading projects...",
    loadError: "Unable to load your projects.",
    retry: "Retry",
    archive: "Archive",
    noEndDate: "No end date",
    privateLabel: "Visible only to you",
  },
} as const;

function formatMoney(value: string | number, currency: string, language: Language) {
  return new Intl.NumberFormat(language === "fr" ? "fr-FR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "XOF" ? 0 : 2,
  }).format(Number(value));
}

function formatDate(value: string, language: Language) {
  return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function statusLabel(status: ProjectStatus, language: Language) {
  const values: Record<ProjectStatus, [string, string]> = {
    PLANNED: ["Planifie", "Planned"],
    ACTIVE: ["Actif", "Active"],
    PAUSED: ["En pause", "Paused"],
    COMPLETED: ["Termine", "Completed"],
    CANCELLED: ["Annule", "Cancelled"],
  };
  return values[status][language === "fr" ? 0 : 1];
}

function frequencyLabel(frequency: BudgetFrequency, language: Language) {
  const values: Record<BudgetFrequency, [string, string]> = {
    ONE_TIME: ["Ponctuel", "One-time"],
    WEEKLY: ["Hebdomadaire", "Weekly"],
    BIWEEKLY: ["Toutes les 2 semaines", "Every 2 weeks"],
    MONTHLY: ["Mensuel", "Monthly"],
    QUARTERLY: ["Trimestriel", "Quarterly"],
    SEMIANNUAL: ["Semestriel", "Every 6 months"],
    ANNUAL: ["Annuel", "Yearly"],
  };
  return values[frequency][language === "fr" ? 0 : 1];
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

function errorMessage(error: unknown, language: Language) {
  if (error instanceof ApiError && error.code === "VERSION_CONFLICT") {
    return language === "fr" ? "Le projet a été modifié. Rechargez puis réessayez." : "The project changed. Refresh and try again.";
  }
  return language === "fr" ? "L'opération n'a pas pu être terminée." : "The operation could not be completed.";
}

export default function ProjectsDashboard({ accessToken, language, defaultCurrency }: ProjectsDashboardProps) {
  const text = labels[language];
  const [projects, setProjects] = useState<BudgetProject[]>(accessToken ? [] : demoProjects);
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "PLANNED" | "COMPLETED">("ALL");
  const [loading, setLoading] = useState(Boolean(accessToken));
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [expenseProject, setExpenseProject] = useState<BudgetProject | null>(null);

  const loadProjects = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError("");
    try {
      const response = await api.projects(accessToken);
      setProjects(response.data);
    } catch (loadError) {
      setError(errorMessage(loadError, language));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    api.projects(accessToken)
      .then((response) => { if (active) setProjects(response.data); })
      .catch((loadError) => { if (active) setError(errorMessage(loadError, language)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accessToken, language]);

  const visibleProjects = projects.filter((project) => filter === "ALL" || project.status === filter);
  const totals = useMemo(
    () => projects.reduce(
      (result, project) => ({
        budget: result.budget + Number(project.totalBudget),
        spent: result.spent + Number(project.spentAmount),
      }),
      { budget: 0, spent: 0 },
    ),
    [projects],
  );
  const summaryCurrency = projects[0]?.currency ?? "XOF";

  const createProject = async (input: ProjectInput) => {
    if (accessToken) {
      const created = await api.createProject(accessToken, input);
      setProjects((current) => [created, ...current]);
      return;
    }
    const now = new Date().toISOString();
    setProjects((current) => [{
      ...input,
      id: `demo-${Date.now()}`,
      description: input.description ?? null,
      status: input.status ?? "PLANNED",
      endDate: input.endDate ?? null,
      warningThreshold: input.warningThreshold ?? 80,
      color: input.color ?? projectColors[0],
      spentAmount: "0",
      lifetimeSpentAmount: "0",
      cashSpentAmount: "0",
      electronicSpentAmount: "0",
      expenseCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    }, ...current]);
  };

  const changeStatus = async (project: BudgetProject, status: ProjectStatus) => {
    setError("");
    try {
      if (accessToken) {
        const updated = await api.updateProject(accessToken, project.id, { status, version: project.version });
        setProjects((current) => current.map((item) => item.id === project.id ? { ...item, ...updated } : item));
      } else {
        setProjects((current) => current.map((item) => item.id === project.id ? { ...item, status, version: item.version + 1 } : item));
      }
    } catch (statusError) {
      setError(errorMessage(statusError, language));
    }
  };

  const archiveProject = async (project: BudgetProject) => {
    const confirmation = language === "fr" ? `Archiver ${project.name} ?` : `Archive ${project.name}?`;
    if (!window.confirm(confirmation)) return;
    setError("");
    try {
      if (accessToken) await api.archiveProject(accessToken, project.id);
      setProjects((current) => current.filter((item) => item.id !== project.id));
    } catch (archiveError) {
      setError(errorMessage(archiveError, language));
    }
  };

  const registerExpense = (projectId: string, amount: string, paymentMethod: PaymentMethod) => {
    setProjects((current) => current.map((project) => project.id === projectId ? {
      ...project,
      spentAmount: String(Number(project.spentAmount) + Number(amount)),
      lifetimeSpentAmount: String(Number(project.lifetimeSpentAmount) + Number(amount)),
      cashSpentAmount: String(Number(project.cashSpentAmount) + (paymentMethod === "CASH" ? Number(amount) : 0)),
      electronicSpentAmount: String(Number(project.electronicSpentAmount) + (paymentMethod === "CASH" ? 0 : Number(amount))),
      expenseCount: project.expenseCount + 1,
    } : project));
    setExpenseProject((current) => current?.id === projectId ? {
      ...current,
      spentAmount: String(Number(current.spentAmount) + Number(amount)),
      lifetimeSpentAmount: String(Number(current.lifetimeSpentAmount) + Number(amount)),
      cashSpentAmount: String(Number(current.cashSpentAmount) + (paymentMethod === "CASH" ? Number(amount) : 0)),
      electronicSpentAmount: String(Number(current.electronicSpentAmount) + (paymentMethod === "CASH" ? 0 : Number(amount))),
      expenseCount: current.expenseCount + 1,
    } : current);
  };

  return (
    <section className="animate-fade-up">
      <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-[#789850] dark:text-[#a9ca7f]">
            <BriefcaseBusiness size={15} /> {text.privateLabel}
          </div>
          <h2 className="font-[Manrope_Variable] text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">{text.title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-[var(--yahro-muted)] dark:text-[#a4a69d]">{text.description}</p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#20211d] px-4 text-sm font-semibold text-white transition hover:bg-[#34352f] active:scale-[.98] dark:bg-[#dcebc5] dark:text-[#202b13]">
          <Plus size={17} /> {text.newProject}
        </button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: text.totalBudget, value: totals.budget, icon: WalletCards },
          { label: text.spent, value: totals.spent, icon: ReceiptText },
          { label: text.remaining, value: totals.budget - totals.spent, icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-2xl border border-[#e1e1dc] bg-white p-4 dark:border-white/8 dark:bg-[#20211d]">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--yahro-muted)] dark:text-[var(--yahro-muted)]"><span>{label}</span><Icon size={16} /></div>
            <p className={cn("mt-3 font-[Manrope_Variable] text-xl font-extrabold tracking-[-.03em]", value < 0 && "text-[#b45f4b]")}>{formatMoney(value, summaryCurrency, language)}</p>
          </article>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--yahro-muted)]"><ListFilter size={15} /></span>
        {([
          ["ALL", text.all],
          ["ACTIVE", text.active],
          ["PLANNED", text.planned],
          ["COMPLETED", text.completed],
        ] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setFilter(value)} className={cn("h-12 rounded-xl px-3 text-sm font-semibold transition sm:h-10 sm:text-xs", filter === value ? "bg-[#dfeccc] text-[#435b29] dark:bg-[#314225] dark:text-[#d0e7b2]" : "border border-[#e0e0da] bg-white text-[var(--yahro-muted)] hover:bg-[#f2f3ed] dark:border-white/8 dark:bg-[#20211d] dark:text-[#acafa6]")}>{label}</button>
        ))}
      </div>

      {error && <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-[#ebc8bf] bg-[#fbefec] px-4 py-3 text-sm text-[#985141] dark:border-[#653d34] dark:bg-[#3a2723] dark:text-[#efb1a2]"><span>{error}</span><button type="button" onClick={() => void loadProjects()} className="font-bold underline">{text.retry}</button></div>}
      {loading && <div className="grid min-h-56 place-items-center rounded-2xl border border-[#e1e1dc] bg-white text-sm text-[var(--yahro-muted)] dark:border-white/8 dark:bg-[#20211d]">{text.loading}</div>}

      {!loading && visibleProjects.length === 0 && (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-[#d6d8cf] bg-white/60 px-6 text-center dark:border-white/12 dark:bg-white/[.025]">
          <div><BriefcaseBusiness className="mx-auto mb-3 text-[#8da76a]" size={30} /><p className="font-bold">{text.empty}</p><p className="mt-1 text-sm text-[var(--yahro-muted)]">{text.emptyHint}</p></div>
        </div>
      )}

      {!loading && visibleProjects.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {visibleProjects.map((project) => {
            const spent = Number(project.spentAmount);
            const budget = Number(project.totalBudget);
            const percentage = budget > 0 ? Math.round((spent / budget) * 100) : 0;
            const alert = percentage >= 100 ? "exceeded" : percentage >= project.warningThreshold ? "warning" : null;
            return (
              <article key={project.id} className="overflow-hidden rounded-2xl border border-[#e1e1dc] bg-white shadow-[0_8px_24px_rgba(40,42,34,.04)] dark:border-white/8 dark:bg-[#20211d]">
                <div className="h-1.5" style={{ backgroundColor: project.color }} />
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-[#f0f2ea] px-2 py-1 text-[10px] font-bold uppercase tracking-[.08em] text-[#69745c] dark:bg-white/7 dark:text-[#b8c4ab]">{project.kind === "PROJECT" ? text.project : text.activity}</span>
                        <span className="rounded-lg bg-[#edf2f4] px-2 py-1 text-[10px] font-bold text-[#5e7883] dark:bg-[#253239] dark:text-[#a9c4cf]">{frequencyLabel(project.budgetFrequency, language)}</span>
                        <span className="text-[11px] font-semibold text-[var(--yahro-muted)]">{statusLabel(project.status, language)}</span>
                      </div>
                      <h3 className="truncate font-[Manrope_Variable] text-lg font-extrabold tracking-[-.03em]">{project.name}</h3>
                    </div>
                    <button type="button" onClick={() => { if (window.confirm(language === "fr" ? "Archiver ce projet ou cette activité ?" : "Archive this project or activity?")) void archiveProject(project); }} className="yahro-touch-target grid size-12 shrink-0 place-items-center rounded-xl text-[var(--yahro-muted)] hover:bg-[#f4e9e5] hover:text-[#a95c4b] lg:size-10 dark:hover:bg-[#3b2925]" aria-label={text.archive} title={text.archive}><Archive size={16} /></button>
                  </div>

                  {project.description && <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-relaxed text-[var(--yahro-muted)] dark:text-[var(--yahro-muted)]">{project.description}</p>}

                  <div className="mt-5 rounded-2xl bg-[#f5f6f1] p-4 dark:bg-[#191a16]">
                    <div className="flex items-end justify-between gap-3">
                      <div><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--yahro-muted)]">{text.spent}</p><p className="mt-1 font-[Manrope_Variable] text-xl font-extrabold">{formatMoney(spent, project.currency, language)}</p></div>
                      <p className="text-xs text-[var(--yahro-muted)]">/ {formatMoney(budget, project.currency, language)}</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dfe1d9] dark:bg-white/10"><div className={cn("h-full rounded-full transition-all", percentage >= 100 ? "bg-[#bd654f]" : percentage >= project.warningThreshold ? "bg-[#d19a4c]" : "bg-[#769450]")} style={{ width: `${Math.min(percentage, 100)}%` }} /></div>
                    <div className="mt-2 flex justify-between text-[11px] text-[var(--yahro-muted)]"><span>{percentage}% {text.budgetUsed}</span><span>{formatMoney(budget - spent, project.currency, language)}</span></div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#e2e4dc] pt-3 text-[10px] dark:border-white/8"><div><span className="block text-[var(--yahro-muted)]">{language === "fr" ? "Espèces" : "Cash"}</span><strong className="mt-0.5 block text-[#4f5149] dark:text-[#d0d2ca]">{formatMoney(project.cashSpentAmount, project.currency, language)}</strong></div><div><span className="block text-[var(--yahro-muted)]">{language === "fr" ? "Banque et électronique" : "Bank and electronic"}</span><strong className="mt-0.5 block text-[#4f5149] dark:text-[#d0d2ca]">{formatMoney(project.electronicSpentAmount, project.currency, language)}</strong></div></div>
                  </div>

                  {alert && <div className={cn("mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold", alert === "exceeded" ? "bg-[#f8e9e5] text-[#a6503f] dark:bg-[#402824] dark:text-[#eda18f]" : "bg-[#fbf1df] text-[#9a6b24] dark:bg-[#3b3120] dark:text-[#e8bb72]")}><AlertTriangle size={14} />{alert === "exceeded" ? text.exceeded : text.warning}</div>}

                  <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-[var(--yahro-muted)]">
                    <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} />{formatDate(project.startDate, language)} - {project.endDate ? formatDate(project.endDate, language) : text.noEndDate}</span>
                    <span>{project.expenseCount} {text.expenses}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                    <button type="button" onClick={() => setExpenseProject(project)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#e7f0da] px-3 text-xs font-bold text-[#49632e] hover:bg-[#dceac7] dark:bg-[#2d3b24] dark:text-[#c8e0a9]"><Plus size={15} />{text.addExpense}</button>
                    <label className="relative">
                      <select value={project.status} onChange={(event) => void changeStatus(project, event.target.value as ProjectStatus)} className="h-10 appearance-none rounded-xl border border-[#e0e1da] bg-white pl-3 pr-8 text-xs font-semibold dark:border-white/10 dark:bg-[#1a1b17]">
                        <option value="PLANNED">{statusLabel("PLANNED", language)}</option>
                        <option value="ACTIVE">{statusLabel("ACTIVE", language)}</option>
                        <option value="PAUSED">{statusLabel("PAUSED", language)}</option>
                        <option value="COMPLETED">{statusLabel("COMPLETED", language)}</option>
                        <option value="CANCELLED">{statusLabel("CANCELLED", language)}</option>
                      </select>
                      {project.status === "ACTIVE" ? <CirclePlay size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[#789850]" /> : <CirclePause size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--yahro-muted)]" />}
                    </label>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {createOpen && <CreateProjectModal language={language} defaultCurrency={defaultCurrency} onClose={() => setCreateOpen(false)} onCreate={createProject} />}
      {expenseProject && <ExpenseModal accessToken={accessToken} language={language} project={expenseProject} onClose={() => setExpenseProject(null)} onAdded={registerExpense} />}
    </section>
  );
}

function CreateProjectModal({ language, defaultCurrency, onClose, onCreate }: { language: Language; defaultCurrency: string; onClose: () => void; onCreate: (input: ProjectInput) => Promise<void> }) {
  const [kind, setKind] = useState<ProjectKind>("PROJECT");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [budgetFrequency, setBudgetFrequency] = useState<BudgetFrequency>("ONE_TIME");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [warningThreshold, setWarningThreshold] = useState(80);
  const [color, setColor] = useState(projectColors[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onCreate({
        kind,
        name,
        description: description || undefined,
        status: "PLANNED",
        totalBudget: budget,
        currency,
        budgetFrequency,
        startDate: new Date(`${startDate}T00:00:00.000Z`).toISOString(),
        endDate: endDate ? new Date(`${endDate}T23:59:59.000Z`).toISOString() : null,
        warningThreshold,
        color,
      });
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError, language));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccessibleDialog titleId="project-dialog-title" onClose={onClose} className="max-w-xl border-white/20 bg-[#fafaf7] p-5 dark:border-white/10 dark:bg-[#1c1d19] sm:p-7">
        <div className="mb-6 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[#789850]">Yahro</p><h2 id="project-dialog-title" className="mt-1 font-[Manrope_Variable] text-xl font-extrabold">{language === "fr" ? "Créer un projet ou une activité" : "Create a project or activity"}</h2></div><button type="button" onClick={onClose} className="yahro-touch-target grid size-12 place-items-center rounded-xl text-[var(--yahro-muted)] lg:size-10 hover:bg-[#ecece7] dark:hover:bg-white/7" aria-label={language === "fr" ? "Fermer" : "Close"}><X size={19} /></button></div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#eff0ea] p-1 dark:bg-[#151612]">{(["PROJECT", "ACTIVITY"] as ProjectKind[]).map((value) => <button key={value} type="button" onClick={() => setKind(value)} className={cn("h-10 rounded-lg text-sm font-semibold", kind === value ? "bg-white text-[#34491c] shadow-sm dark:bg-[#2a3323] dark:text-[#d5e9ba]" : "text-[var(--yahro-muted)]")}>{value === "PROJECT" ? (language === "fr" ? "Projet" : "Project") : (language === "fr" ? "Activité" : "Activity")}</button>)}</div>
          <Field label={language === "fr" ? "Nom" : "Name"}><input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="field" /></Field>
          <Field label={language === "fr" ? "Description" : "Description"}><textarea maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="field resize-none" /></Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <Field label={language === "fr" ? "Budget total" : "Total budget"}><input required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,4})?" value={budget} onChange={(event) => setBudget(event.target.value.replace(",", "."))} className="field" /></Field>
            <Field label={language === "fr" ? "Devise" : "Currency"}><select value={currency} onChange={(event) => setCurrency(event.target.value)} className="field">{supportedCurrencies.map((code) => <option key={code} value={code}>{currencyName(code, language)}</option>)}</select></Field>
          </div>
          <Field label={language === "fr" ? "Fréquence du budget" : "Budget frequency"}><select value={budgetFrequency} onChange={(event) => setBudgetFrequency(event.target.value as BudgetFrequency)} className="field">{(["ONE_TIME", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "ANNUAL"] as BudgetFrequency[]).map((value) => <option key={value} value={value}>{frequencyLabel(value, language)}</option>)}</select></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={language === "fr" ? "Date de début" : "Start date"}><input required type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="field" /></Field>
            <Field label={language === "fr" ? "Date de fin, facultative" : "End date, optional"}><input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} className="field" /></Field>
          </div>
          <Field label={`${language === "fr" ? "Seuil d'alerte" : "Warning threshold"}: ${warningThreshold}%`}><input type="range" min={50} max={100} step={5} value={warningThreshold} onChange={(event) => setWarningThreshold(Number(event.target.value))} className="w-full accent-[#769450]" /></Field>
          <Field label={language === "fr" ? "Couleur" : "Color"}><div className="flex flex-wrap gap-2">{projectColors.map((value) => <button key={value} type="button" onClick={() => setColor(value)} className={cn("size-8 rounded-full border-2 transition", color === value ? "scale-110 border-[#20211d] dark:border-white" : "border-transparent")} style={{ backgroundColor: value }} aria-label={value} />)}</div></Field>
          {error && <p role="alert" className="rounded-xl bg-[#f8e9e5] px-3 py-2 text-sm text-[#a6503f] dark:bg-[#402824] dark:text-[#eda18f]">{error}</p>}
          <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onClose} className="h-11 rounded-xl px-4 text-sm font-semibold text-[#6f7169] hover:bg-[#eeeeea] dark:hover:bg-white/7">{language === "fr" ? "Annuler" : "Cancel"}</button><button disabled={saving} type="submit" className="h-11 rounded-xl bg-[#20211d] px-5 text-sm font-semibold text-white disabled:opacity-50 dark:bg-[#dcebc5] dark:text-[#202b13]">{saving ? (language === "fr" ? "Création..." : "Creating...") : (language === "fr" ? "Créer" : "Create")}</button></div>
        </form>
    </AccessibleDialog>
  );
}

function ExpenseModal({ accessToken, language, project, onClose, onAdded }: { accessToken?: string; language: Language; project: BudgetProject; onClose: () => void; onAdded: (projectId: string, amount: string, paymentMethod: PaymentMethod) => void }) {
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    api.projectExpenses(accessToken, project.id).then((response) => setExpenses(response.data)).catch((loadError) => setError(errorMessage(loadError, language)));
  }, [accessToken, project.id, language]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const input = { description, amount, paymentMethod, spentAt: new Date(`${spentAt}T12:00:00.000Z`).toISOString(), notes: notes || undefined };
      const created = accessToken ? await api.createProjectExpense(accessToken, project.id, input) : { id: `demo-expense-${Date.now()}`, ...input, notes: notes || null, version: 1, createdAt: new Date().toISOString() };
      setExpenses((current) => [created, ...current]);
      onAdded(project.id, amount, paymentMethod);
      setDescription("");
      setAmount("");
      setNotes("");
    } catch (submitError) {
      setError(errorMessage(submitError, language));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AccessibleDialog titleId="expense-dialog-title" onClose={onClose} className="max-w-2xl border-white/20 bg-[#fafaf7] p-5 dark:border-white/10 dark:bg-[#1c1d19] sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.12em]" style={{ color: project.color }}>{language === "fr" ? "Suivi du budget" : "Budget tracking"}</p><h2 id="expense-dialog-title" className="mt-1 font-[Manrope_Variable] text-xl font-extrabold">{project.name}</h2><p className="mt-1 text-xs text-[var(--yahro-muted)]">{formatMoney(project.spentAmount, project.currency, language)} / {formatMoney(project.totalBudget, project.currency, language)}</p></div><button type="button" onClick={onClose} className="yahro-touch-target grid size-12 place-items-center rounded-xl text-[var(--yahro-muted)] lg:size-10 hover:bg-[#ecece7] dark:hover:bg-white/7" aria-label={language === "fr" ? "Fermer" : "Close"}><X size={19} /></button></div>
        <form onSubmit={submit} className="rounded-2xl border border-[#e1e1dc] bg-white p-4 dark:border-white/8 dark:bg-[#20211d]">
          <div className="grid gap-3 sm:grid-cols-2"><Field label={language === "fr" ? "Libellé" : "Description"}><input required maxLength={160} value={description} onChange={(event) => setDescription(event.target.value)} className="field" /></Field><Field label={language === "fr" ? "Montant" : "Amount"}><input required inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,4})?" value={amount} onChange={(event) => setAmount(event.target.value.replace(",", "."))} className="field" /></Field><Field label={language === "fr" ? "Moyen de paiement" : "Payment method"}><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="field">{(["CASH", "BANK_TRANSFER", "BANK_CARD", "MOBILE_MONEY", "DIGITAL_WALLET", "DIRECT_DEBIT", "CHECK", "OTHER"] as PaymentMethod[]).map((value) => <option key={value} value={value}>{paymentMethodLabel(value, language)}</option>)}</select></Field><Field label={language === "fr" ? "Date" : "Date"}><input required type="date" value={spentAt} onChange={(event) => setSpentAt(event.target.value)} className="field" /></Field><Field label={language === "fr" ? "Note, facultative" : "Note, optional"}><input maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className="field" /></Field></div>
          {error && <p role="alert" className="mt-3 rounded-xl bg-[#f8e9e5] px-3 py-2 text-sm text-[#a6503f] dark:bg-[#402824] dark:text-[#eda18f]">{error}</p>}
          <div className="mt-3 flex justify-end"><button disabled={saving} type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#20211d] px-4 text-sm font-semibold text-white disabled:opacity-50 dark:bg-[#dcebc5] dark:text-[#202b13]"><Plus size={15} />{saving ? (language === "fr" ? "Ajout..." : "Adding...") : (language === "fr" ? "Enregistrer la dépense" : "Save expense")}</button></div>
        </form>
        <div className="mt-5"><h4 className="mb-3 text-sm font-bold">{language === "fr" ? "Dépenses récentes" : "Recent expenses"}</h4>{expenses.length === 0 ? <p className="rounded-xl bg-[#f0f1eb] px-4 py-5 text-center text-xs text-[var(--yahro-muted)] dark:bg-white/5">{language === "fr" ? "Aucune dépense enregistrée." : "No recorded expenses."}</p> : <div className="divide-y divide-[#e8e8e2] dark:divide-white/7">{expenses.map((expense) => <div key={expense.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{expense.description}</p><p className="mt-0.5 text-[11px] text-[var(--yahro-muted)]">{formatDate(expense.spentAt, language)} - {paymentMethodLabel(expense.paymentMethod, language)}</p></div><p className="text-sm font-bold">{formatMoney(expense.amount, project.currency, language)}</p></div>)}</div>}</div>
    </AccessibleDialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#686a62] dark:text-[#b8bab2]">{label}</span>{children}</label>;
}
