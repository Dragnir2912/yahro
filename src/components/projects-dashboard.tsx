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
  ListChecks,
  Pencil,
  Plus,
  ReceiptText,
  WalletCards,
  X,
} from "lucide-react";
import { api, ApiError, type BudgetFrequency, type BudgetProject, type PaymentMethod, type ProjectBudgetLine, type ProjectExpense, type ProjectInput, type ProjectKind, type ProjectStatus } from "@/lib/api";
import { cn } from "@/lib/utils";
import { currencyFractionDigits, currencyName, formatCurrencyAmount, supportedCurrencies } from "@/lib/currencies";
import AccessibleDialog from "@/components/ui/accessible-dialog";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import { projectMessages } from "@/lib/i18n";
import { paymentMethodLabel } from "@/lib/payment-methods";

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
    budgetDetails: "Détail du budget",
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
    budgetDetails: "Budget details",
  },
} as const;

function formatDate(value: string, language: Language) {
  return new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function periodSpendLabel(frequency: BudgetFrequency, language: Language) {
  if (frequency === "ONE_TIME") return language === "fr" ? "Dépenses du projet" : "Project spending";
  return language === "fr" ? `Dépenses de la période ${frequencyLabel(frequency, language).toLocaleLowerCase("fr")}` : `${frequencyLabel(frequency, language)} period spending`;
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
  const [archiveTarget, setArchiveTarget] = useState<BudgetProject>();
  const [archivePending, setArchivePending] = useState(false);

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
        spent: result.spent + Number(project.lifetimeSpentAmount),
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
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.12em] text-[var(--yahro-accent-text)] dark:text-[#a9ca7f]">
            <BriefcaseBusiness size={15} /> {text.privateLabel}
          </div>
          <h2 className="font-[Manrope_Variable] text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">{text.title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-yahro-muted">{text.description}</p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#20211d] px-4 text-sm font-semibold text-white transition hover:bg-[#34352f] active:scale-[.98] dark:bg-[#dcebc5] dark:text-[#202b13]">
          <Plus size={17} /> {text.newProject}
        </button>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: text.totalBudget, value: totals.budget, icon: WalletCards },
          { label: language === "fr" ? "Dépensé depuis le début" : "Lifetime spending", value: totals.spent, icon: ReceiptText },
          { label: text.remaining, value: totals.budget - totals.spent, icon: CheckCircle2 },
        ].map(({ label, value, icon: Icon }) => (
          <article key={label} className="rounded-2xl border border-yahro-border bg-white p-4 dark:border-white/8 dark:bg-[#20211d]">
            <div className="flex items-center justify-between text-xs font-medium text-[var(--yahro-muted)] dark:text-[var(--yahro-muted)]"><span>{label}</span><Icon size={16} /></div>
            <p className={cn("mt-3 font-[Manrope_Variable] text-xl font-extrabold tracking-[-.03em]", value < 0 && "text-[#b45f4b]")}>{formatCurrencyAmount(value, summaryCurrency, language)}</p>
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
      {loading && <div className="grid min-h-56 place-items-center rounded-2xl border border-yahro-border bg-white text-sm text-[var(--yahro-muted)] dark:border-white/8 dark:bg-[#20211d]">{text.loading}</div>}

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
              <article key={project.id} className="overflow-hidden rounded-2xl border border-yahro-border bg-white shadow-[0_8px_24px_rgba(40,42,34,.04)] dark:border-white/8 dark:bg-[#20211d]">
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
                    <button type="button" onClick={() => setArchiveTarget(project)} className="yahro-hover-action yahro-touch-target grid size-12 shrink-0 place-items-center rounded-xl text-[var(--yahro-muted)] opacity-60 hover:bg-[#f4e9e5] hover:text-[#a95c4b] focus-visible:opacity-100 lg:size-10 dark:hover:bg-[#3b2925]" aria-label={text.archive} title={text.archive}><Archive size={16} /></button>
                  </div>

                  {project.description && <p className="mt-2 line-clamp-2 min-h-10 text-xs leading-relaxed text-[var(--yahro-muted)] dark:text-[var(--yahro-muted)]">{project.description}</p>}

                  <div className="mt-5 rounded-2xl bg-[#f5f6f1] p-4 dark:bg-[#191a16]">
                    <div className="flex items-end justify-between gap-3">
                      <div><p className="text-[10px] font-semibold uppercase tracking-[.08em] text-[var(--yahro-muted)]">{periodSpendLabel(project.budgetFrequency, language)}</p><p className="yahro-money mt-1 font-[Manrope_Variable] text-xl font-extrabold">{formatCurrencyAmount(spent, project.currency, language)}</p></div>
                      <p className="text-xs text-[var(--yahro-muted)]">/ {formatCurrencyAmount(budget, project.currency, language)}</p>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#dfe1d9] dark:bg-white/10"><div className={cn("h-full rounded-full transition-all", percentage >= 100 ? "bg-[#bd654f]" : percentage >= project.warningThreshold ? "bg-[#d19a4c]" : "bg-yahro-accent")} style={{ width: `${Math.min(percentage, 100)}%` }} /></div>
                    <div className="mt-2 flex justify-between text-[11px] text-[var(--yahro-muted)]"><span>{percentage}% {text.budgetUsed}</span><span>{formatCurrencyAmount(budget - spent, project.currency, language)}</span></div>
                    <div className="mt-3 grid grid-cols-2 gap-2 border-t border-[#e2e4dc] pt-3 text-[10px] dark:border-white/8"><div><span className="block text-[var(--yahro-muted)]">{language === "fr" ? "Espèces, cette période" : "Cash, this period"}</span><strong className="yahro-money mt-0.5 block text-[#4f5149] dark:text-[#d0d2ca]">{formatCurrencyAmount(project.cashSpentAmount, project.currency, language)}</strong></div><div><span className="block text-[var(--yahro-muted)]">{language === "fr" ? "Banque et électronique, cette période" : "Bank and electronic, this period"}</span><strong className="yahro-money mt-0.5 block text-[#4f5149] dark:text-[#d0d2ca]">{formatCurrencyAmount(project.electronicSpentAmount, project.currency, language)}</strong></div></div>
                  </div>

                  {alert && <div className={cn("mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold", alert === "exceeded" ? "bg-[#f8e9e5] text-[#a6503f] dark:bg-[#402824] dark:text-[#eda18f]" : "bg-[#fbf1df] text-[#9a6b24] dark:bg-[#3b3120] dark:text-[#e8bb72]")}><AlertTriangle size={14} />{alert === "exceeded" ? text.exceeded : text.warning}</div>}

                  <div className="mt-4 flex items-center justify-between gap-3 text-[11px] text-[var(--yahro-muted)]">
                    <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} />{formatDate(project.startDate, language)} - {project.endDate ? formatDate(project.endDate, language) : text.noEndDate}</span>
                    <span>{project.expenseCount} {text.expenses} {language === "fr" ? "depuis le début" : "since creation"}</span>
                  </div>

                  <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                    <button type="button" onClick={() => setExpenseProject(project)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#e7f0da] px-3 text-xs font-bold text-[#49632e] hover:bg-[#dceac7] dark:bg-[#2d3b24] dark:text-[#c8e0a9]"><ListChecks size={15} />{text.budgetDetails}</button>
                    <label className="relative">
                      <select value={project.status} onChange={(event) => void changeStatus(project, event.target.value as ProjectStatus)} className="h-10 appearance-none rounded-xl border border-[#e0e1da] bg-white pl-3 pr-8 text-xs font-semibold dark:border-white/10 dark:bg-[#1a1b17]">
                        <option value="PLANNED">{statusLabel("PLANNED", language)}</option>
                        <option value="ACTIVE">{statusLabel("ACTIVE", language)}</option>
                        <option value="PAUSED">{statusLabel("PAUSED", language)}</option>
                        <option value="COMPLETED">{statusLabel("COMPLETED", language)}</option>
                        <option value="CANCELLED">{statusLabel("CANCELLED", language)}</option>
                      </select>
                      {project.status === "ACTIVE" ? <CirclePlay size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--yahro-accent-text)]" /> : <CirclePause size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--yahro-muted)]" />}
                    </label>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {createOpen && <CreateProjectModal language={language} defaultCurrency={defaultCurrency} onClose={() => setCreateOpen(false)} onCreate={createProject} />}
      {expenseProject && <ProjectBudgetDialog accessToken={accessToken} language={language} project={expenseProject} onClose={() => setExpenseProject(null)} onAdded={registerExpense} />}
      <ConfirmDialog open={Boolean(archiveTarget)} title={language === "fr" ? "Archiver ce suivi ?" : "Archive this tracking item?"} description={language === "fr" ? `${archiveTarget?.name ?? "Ce projet"} ne figurera plus dans la liste active. Ses dépenses restent conservées.` : `${archiveTarget?.name ?? "This project"} will leave the active list. Its expenses remain preserved.`} confirmLabel={language === "fr" ? "Archiver" : "Archive"} cancelLabel={language === "fr" ? "Annuler" : "Cancel"} pending={archivePending} onClose={() => setArchiveTarget(undefined)} onConfirm={async () => { if (!archiveTarget) return; setArchivePending(true); try { await archiveProject(archiveTarget); setArchiveTarget(undefined); } finally { setArchivePending(false); } }} />
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
        <div className="mb-6 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--yahro-accent-text)]">Yahro</p><h2 id="project-dialog-title" className="mt-1 font-[Manrope_Variable] text-xl font-extrabold">{language === "fr" ? "Créer un projet ou une activité" : "Create a project or activity"}</h2></div><button type="button" onClick={onClose} className="yahro-touch-target grid size-12 place-items-center rounded-xl text-[var(--yahro-muted)] lg:size-10 hover:bg-[#ecece7] dark:hover:bg-white/7" aria-label={language === "fr" ? "Fermer" : "Close"}><X size={19} /></button></div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#eff0ea] p-1 dark:bg-[#151612]">{(["PROJECT", "ACTIVITY"] as ProjectKind[]).map((value) => <button key={value} type="button" onClick={() => setKind(value)} className={cn("h-10 rounded-lg text-sm font-semibold", kind === value ? "bg-white text-[#34491c] shadow-sm dark:bg-[#2a3323] dark:text-[#d5e9ba]" : "text-[var(--yahro-muted)]")}>{value === "PROJECT" ? (language === "fr" ? "Projet" : "Project") : (language === "fr" ? "Activité" : "Activity")}</button>)}</div>
          <Field label={language === "fr" ? "Nom" : "Name"}><input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="field" /></Field>
          <Field label={language === "fr" ? "Description" : "Description"}><textarea maxLength={2000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} className="field resize-none" /></Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
            <Field label={language === "fr" ? "Budget total" : "Total budget"}><input required inputMode="decimal" pattern="[0-9]+([.,][0-9]+)?" value={budget} onChange={(event) => setBudget(currencyFractionDigits(currency) === 0 ? event.target.value.replace(/\D/g, "") : event.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))} className="field" /></Field>
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

function ProjectBudgetDialog({ accessToken, language, project, onClose, onAdded }: { accessToken?: string; language: Language; project: BudgetProject; onClose: () => void; onAdded: (projectId: string, amount: string, paymentMethod: PaymentMethod) => void }) {
  const demoLines: ProjectBudgetLine[] = project.id === "demo-project-1" ? [
    { id: "demo-line-1", projectId: project.id, name: "Peinture et fournitures", plannedAmount: "250000", actualAmount: "185000", lifetimeActualAmount: "185000", expenseCount: 3, notes: null, sortOrder: 0, version: 1, createdAt: project.createdAt, updatedAt: project.updatedAt },
    { id: "demo-line-2", projectId: project.id, name: "Mobilier", plannedAmount: "420000", actualAmount: "287000", lifetimeActualAmount: "287000", expenseCount: 3, notes: null, sortOrder: 1, version: 1, createdAt: project.createdAt, updatedAt: project.updatedAt },
  ] : [];
  const [budgetLines, setBudgetLines] = useState<ProjectBudgetLine[]>(accessToken ? [] : demoLines);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(Boolean(accessToken));
  const [lineName, setLineName] = useState("");
  const [plannedAmount, setPlannedAmount] = useState("");
  const [lineNotes, setLineNotes] = useState("");
  const [editingLine, setEditingLine] = useState<ProjectBudgetLine | null>(null);
  const [confirmArchiveLineId, setConfirmArchiveLineId] = useState<string | null>(null);
  const [savingLine, setSavingLine] = useState(false);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [budgetLineId, setBudgetLineId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [spentAt, setSpentAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken) return;
    let active = true;
    Promise.all([api.projectBudgetLines(accessToken, project.id), api.projectExpenses(accessToken, project.id)])
      .then(([lineResponse, expenseResponse]) => {
        if (!active) return;
        setBudgetLines(lineResponse.data);
        setExpenses(expenseResponse.data);
      })
      .catch((loadError) => { if (active) setError(errorMessage(loadError, language)); })
      .finally(() => { if (active) setLoadingDetail(false); });
    return () => { active = false; };
  }, [accessToken, project.id, language]);

  const plannedTotal = budgetLines.reduce((sum, line) => sum + Number(line.plannedAmount), 0);
  const allocatedActual = budgetLines.reduce((sum, line) => sum + Number(line.actualAmount), 0);
  const actualTotal = Number(project.spentAmount);
  const unallocatedActual = Math.max(0, actualTotal - allocatedActual);
  const envelopeDifference = Number(project.totalBudget) - plannedTotal;

  const resetLineForm = () => {
    setLineName("");
    setPlannedAmount("");
    setLineNotes("");
    setEditingLine(null);
  };

  const submitBudgetLine = async (event: FormEvent) => {
    event.preventDefault();
    setSavingLine(true);
    setError("");
    try {
      if (editingLine) {
        if (accessToken) {
          const updated = await api.updateProjectBudgetLine(accessToken, project.id, editingLine.id, { name: lineName, plannedAmount, notes: lineNotes || null, version: editingLine.version });
          setBudgetLines((current) => current.map((line) => line.id === editingLine.id ? { ...line, ...updated } : line));
        } else {
          setBudgetLines((current) => current.map((line) => line.id === editingLine.id ? { ...line, name: lineName, plannedAmount, notes: lineNotes || null, version: line.version + 1 } : line));
        }
      } else {
        const input = { name: lineName, plannedAmount, notes: lineNotes || undefined, sortOrder: budgetLines.length };
        const created = accessToken ? await api.createProjectBudgetLine(accessToken, project.id, input) : { id: `demo-line-${Date.now()}`, projectId: project.id, ...input, notes: lineNotes || null, actualAmount: "0", lifetimeActualAmount: "0", expenseCount: 0, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        setBudgetLines((current) => [...current, created]);
      }
      resetLineForm();
    } catch (submitError) {
      setError(errorMessage(submitError, language));
    } finally {
      setSavingLine(false);
    }
  };

  const archiveBudgetLine = async (line: ProjectBudgetLine) => {
    setError("");
    try {
      if (accessToken) await api.archiveProjectBudgetLine(accessToken, project.id, line.id);
      setBudgetLines((current) => current.filter((item) => item.id !== line.id));
      if (budgetLineId === line.id) setBudgetLineId("");
      setConfirmArchiveLineId(null);
    } catch (archiveError) {
      setError(errorMessage(archiveError, language));
    }
  };

  const submitExpense = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const input = { budgetLineId: budgetLineId || null, description, amount, paymentMethod, spentAt: new Date(`${spentAt}T12:00:00.000Z`).toISOString(), notes: notes || undefined };
      const created = accessToken ? await api.createProjectExpense(accessToken, project.id, input) : { id: `demo-expense-${Date.now()}`, ...input, notes: notes || null, version: 1, createdAt: new Date().toISOString() };
      setExpenses((current) => [created, ...current]);
      onAdded(project.id, amount, paymentMethod);
      if (budgetLineId) {
        if (accessToken) {
          const refreshed = await api.projectBudgetLines(accessToken, project.id);
          setBudgetLines(refreshed.data);
        } else {
          setBudgetLines((current) => current.map((line) => line.id === budgetLineId ? { ...line, actualAmount: String(Number(line.actualAmount) + Number(amount)), lifetimeActualAmount: String(Number(line.lifetimeActualAmount) + Number(amount)), expenseCount: line.expenseCount + 1 } : line));
        }
      }
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
    <AccessibleDialog titleId="expense-dialog-title" descriptionId="expense-dialog-description" onClose={onClose} className="max-w-4xl border-white/20 bg-[#fafaf7] p-5 dark:border-white/10 dark:bg-[#1c1d19] sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--yahro-accent-text)]">{language === "fr" ? "Budget prévu et réalisé" : "Planned and actual budget"}</p><h2 id="expense-dialog-title" className="mt-1 font-[Manrope_Variable] text-xl font-extrabold">{project.name}</h2><p id="expense-dialog-description" className="mt-1 text-xs text-[var(--yahro-muted)]">{language === "fr" ? "Détaillez vos prévisions, puis rattachez les dépenses que vous avez réellement effectuées." : "Detail your estimates, then link the expenses you actually made."}</p></div><button type="button" onClick={onClose} className="yahro-touch-target grid size-12 place-items-center rounded-xl text-[var(--yahro-muted)] lg:size-10 hover:bg-[#ecece7] dark:hover:bg-white/7" aria-label={language === "fr" ? "Fermer" : "Close"}><X size={19} /></button></div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          <BudgetMetric label={language === "fr" ? "Enveloppe globale" : "Overall envelope"} value={formatCurrencyAmount(project.totalBudget, project.currency, language)} />
          <BudgetMetric label={language === "fr" ? "Total des lignes prévues" : "Planned lines total"} value={formatCurrencyAmount(plannedTotal, project.currency, language)} hint={envelopeDifference >= 0 ? (language === "fr" ? `${formatCurrencyAmount(envelopeDifference, project.currency, language)} non affecté` : `${formatCurrencyAmount(envelopeDifference, project.currency, language)} unallocated`) : (language === "fr" ? `Dépassement prévu de ${formatCurrencyAmount(Math.abs(envelopeDifference), project.currency, language)}` : `Planned overrun of ${formatCurrencyAmount(Math.abs(envelopeDifference), project.currency, language)}`)} warning={envelopeDifference < 0} />
          <BudgetMetric label={periodSpendLabel(project.budgetFrequency, language)} value={formatCurrencyAmount(actualTotal, project.currency, language)} hint={unallocatedActual > 0 ? (language === "fr" ? `${formatCurrencyAmount(unallocatedActual, project.currency, language)} sans ligne` : `${formatCurrencyAmount(unallocatedActual, project.currency, language)} without a line`) : undefined} />
        </div>

        {error && <p role="alert" className="mb-4 rounded-xl bg-[#f8e9e5] px-3 py-2 text-sm text-[#a6503f] dark:bg-[#402824] dark:text-[#eda18f]">{error}</p>}
        {loadingDetail ? <p className="rounded-2xl border border-yahro-border bg-white px-4 py-8 text-center text-sm text-[var(--yahro-muted)] dark:border-white/8 dark:bg-[#20211d]">{language === "fr" ? "Chargement du détail..." : "Loading details..."}</p> : <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl border border-yahro-border bg-white p-4 dark:border-white/8 dark:bg-[#20211d]" aria-labelledby="planned-lines-title">
            <div className="mb-4"><h3 id="planned-lines-title" className="flex items-center gap-2 text-sm font-extrabold"><ListChecks size={17} />{language === "fr" ? "Lignes budgétaires prévues" : "Planned budget lines"}</h3><p className="mt-1 text-xs text-[var(--yahro-muted)]">{language === "fr" ? "Ces montants détaillent l'enveloppe prévue pour chaque période." : "These amounts detail the envelope planned for each period."}</p></div>
            <form onSubmit={submitBudgetLine} className="rounded-xl bg-[#f3f4ee] p-3 dark:bg-[#181914]">
              <div className="grid gap-3 sm:grid-cols-2"><Field label={language === "fr" ? "Nom de la ligne" : "Line name"}><input required maxLength={160} value={lineName} onChange={(event) => setLineName(event.target.value)} className="field" placeholder={language === "fr" ? "Exemple: Transport" : "Example: Transport"} /></Field><Field label={language === "fr" ? "Montant prévu" : "Planned amount"}><input required inputMode="decimal" pattern="[0-9]+([.,][0-9]+)?" value={plannedAmount} onChange={(event) => setPlannedAmount(currencyFractionDigits(project.currency) === 0 ? event.target.value.replace(/\D/g, "") : event.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))} className="field" /></Field></div>
              <div className="mt-3"><Field label={language === "fr" ? "Note, facultative" : "Note, optional"}><input maxLength={2000} value={lineNotes} onChange={(event) => setLineNotes(event.target.value)} className="field" /></Field></div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">{editingLine && <button type="button" onClick={resetLineForm} className="h-10 rounded-xl px-3 text-xs font-bold text-[var(--yahro-muted)] hover:bg-black/5 dark:hover:bg-white/7">{language === "fr" ? "Annuler" : "Cancel"}</button>}<button disabled={savingLine} type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#20211d] px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-[#dcebc5] dark:text-[#202b13]"><Plus size={14} />{savingLine ? (language === "fr" ? "Enregistrement..." : "Saving...") : editingLine ? (language === "fr" ? "Mettre à jour" : "Update") : (language === "fr" ? "Ajouter la ligne prévue" : "Add planned line")}</button></div>
            </form>
            {budgetLines.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-yahro-border px-4 py-5 text-center text-xs text-[var(--yahro-muted)] dark:border-white/10">{language === "fr" ? "Aucune ligne prévue. Ajoutez le détail de votre enveloppe." : "No planned line yet. Add the details of your envelope."}</p> : <div className="mt-3 space-y-2">{budgetLines.map((line) => {
              const lineActual = Number(line.actualAmount);
              const linePlanned = Number(line.plannedAmount);
              const percentage = linePlanned > 0 ? Math.round((lineActual / linePlanned) * 100) : 0;
              return <article key={line.id} className="rounded-xl border border-[#e5e6df] p-3 dark:border-white/8"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-bold">{line.name}</p><p className="mt-1 text-[11px] text-[var(--yahro-muted)]">{formatCurrencyAmount(lineActual, project.currency, language)} {language === "fr" ? "réalisé sur" : "actual of"} {formatCurrencyAmount(linePlanned, project.currency, language)}</p></div><div className="flex shrink-0 items-center gap-1">{confirmArchiveLineId === line.id ? <><button type="button" onClick={() => void archiveBudgetLine(line)} className="h-9 rounded-lg bg-[#a6503f] px-2 text-[11px] font-bold text-white">{language === "fr" ? "Confirmer" : "Confirm"}</button><button type="button" onClick={() => setConfirmArchiveLineId(null)} className="h-9 rounded-lg px-2 text-[11px] font-bold text-[var(--yahro-muted)]">{language === "fr" ? "Annuler" : "Cancel"}</button></> : <><button type="button" onClick={() => { setEditingLine(line); setLineName(line.name); setPlannedAmount(line.plannedAmount); setLineNotes(line.notes ?? ""); }} className="yahro-touch-target grid size-11 place-items-center rounded-lg text-[var(--yahro-muted)] hover:bg-black/5 dark:hover:bg-white/7" aria-label={language === "fr" ? `Modifier ${line.name}` : `Edit ${line.name}`}><Pencil size={14} /></button><button type="button" onClick={() => setConfirmArchiveLineId(line.id)} className="yahro-touch-target grid size-11 place-items-center rounded-lg text-[var(--yahro-muted)] hover:bg-[#f7e9e5] hover:text-[#a6503f] dark:hover:bg-[#402824]" aria-label={language === "fr" ? `Archiver ${line.name}` : `Archive ${line.name}`}><Archive size={14} /></button></>}</div></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#e2e3dc] dark:bg-white/10"><div className={cn("h-full rounded-full", percentage > 100 ? "bg-[#bd654f]" : "bg-[#769450]")} style={{ width: `${Math.min(percentage, 100)}%` }} /></div><p className={cn("mt-1 text-right text-[10px] font-bold", percentage > 100 ? "text-[#b45f4b]" : "text-[var(--yahro-muted)]")}>{percentage}%</p></article>;
            })}</div>}
          </section>

          <section className="rounded-2xl border border-yahro-border bg-white p-4 dark:border-white/8 dark:bg-[#20211d]" aria-labelledby="actual-lines-title">
            <div className="mb-4"><h3 id="actual-lines-title" className="flex items-center gap-2 text-sm font-extrabold"><ReceiptText size={17} />{language === "fr" ? "Lignes budgétaires réalisées" : "Actual budget entries"}</h3><p className="mt-1 text-xs text-[var(--yahro-muted)]">{language === "fr" ? "Notez une dépense déjà réalisée. Yahro ne déclenche aucun paiement." : "Record an expense already made. Yahro does not initiate any payment."}</p></div>
            <form onSubmit={submitExpense} className="rounded-xl bg-[#f3f4ee] p-3 dark:bg-[#181914]">
              <div className="grid gap-3 sm:grid-cols-2"><Field label={language === "fr" ? "Libellé" : "Description"}><input required maxLength={160} value={description} onChange={(event) => setDescription(event.target.value)} className="field" /></Field><Field label={language === "fr" ? "Montant effectué" : "Actual amount"}><input required inputMode="decimal" pattern="[0-9]+([.,][0-9]+)?" value={amount} onChange={(event) => setAmount(currencyFractionDigits(project.currency) === 0 ? event.target.value.replace(/\D/g, "") : event.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))} className="field" /></Field><Field label={language === "fr" ? "Ligne prévue associée" : "Related planned line"}><select value={budgetLineId} onChange={(event) => setBudgetLineId(event.target.value)} className="field"><option value="">{language === "fr" ? "Non affectée" : "Unallocated"}</option>{budgetLines.map((line) => <option key={line.id} value={line.id}>{line.name}</option>)}</select></Field><Field label={language === "fr" ? "Moyen de paiement" : "Payment method"}><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="field">{(["CASH", "BANK_TRANSFER", "BANK_CARD", "MOBILE_MONEY", "DIGITAL_WALLET", "DIRECT_DEBIT", "CHECK", "OTHER"] as PaymentMethod[]).map((value) => <option key={value} value={value}>{paymentMethodLabel(value, language)}</option>)}</select></Field><Field label={language === "fr" ? "Date" : "Date"}><input required type="date" min={project.startDate.slice(0, 10)} max={project.endDate?.slice(0, 10)} value={spentAt} onChange={(event) => setSpentAt(event.target.value)} className="field" /></Field><Field label={language === "fr" ? "Note, facultative" : "Note, optional"}><input maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className="field" /></Field></div>
              <div className="mt-3 flex justify-end"><button disabled={saving} type="submit" className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#20211d] px-4 text-xs font-bold text-white disabled:opacity-50 dark:bg-[#dcebc5] dark:text-[#202b13]"><Plus size={14} />{saving ? (language === "fr" ? "Ajout..." : "Adding...") : (language === "fr" ? "Ajouter la ligne réalisée" : "Add actual entry")}</button></div>
            </form>
            <div className="mt-4"><h4 className="mb-2 text-xs font-bold uppercase tracking-[.08em] text-[var(--yahro-muted)]">{language === "fr" ? "Opérations récentes" : "Recent entries"}</h4>{expenses.length === 0 ? <p className="rounded-xl border border-dashed border-yahro-border px-4 py-5 text-center text-xs text-[var(--yahro-muted)] dark:border-white/10">{language === "fr" ? "Aucune dépense enregistrée." : "No recorded expense."}</p> : <div className="divide-y divide-[#e8e8e2] dark:divide-white/7">{expenses.map((expense) => { const line = budgetLines.find((item) => item.id === expense.budgetLineId); return <div key={expense.id} className="flex items-start justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{expense.description}</p><p className="mt-0.5 text-[11px] text-[var(--yahro-muted)]">{formatDate(expense.spentAt, language)} - {paymentMethodLabel(expense.paymentMethod, language)}</p><p className="mt-0.5 truncate text-[11px] text-[var(--yahro-accent-text)]">{line?.name ?? (language === "fr" ? "Non affectée" : "Unallocated")}</p></div><p className="yahro-money shrink-0 text-sm font-bold">{formatCurrencyAmount(expense.amount, project.currency, language)}</p></div>; })}</div>}</div>
          </section>
        </div>}
    </AccessibleDialog>
  );
}

function BudgetMetric({ label, value, hint, warning = false }: { label: string; value: string; hint?: string; warning?: boolean }) {
  return <div className="rounded-2xl border border-yahro-border bg-white p-3 dark:border-white/8 dark:bg-[#20211d]"><p className="text-[11px] font-semibold text-[var(--yahro-muted)]">{label}</p><p className={cn("yahro-money mt-1 font-[Manrope_Variable] text-base font-extrabold", warning && "text-[#b45f4b]")}>{value}</p>{hint && <p className={cn("mt-1 text-[10px] text-[var(--yahro-muted)]", warning && "text-[#b45f4b]")}>{hint}</p>}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-[#686a62] dark:text-[#b8bab2]">{label}</span>{children}</label>;
}
