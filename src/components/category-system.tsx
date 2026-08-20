/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useMemo, useState } from "react";
import {
  Archive,
  ChevronRight,
  FolderTree,
  Layers3,
  ListChecks,
  LockKeyhole,
  Plus,
  Search,
  Tag,
} from "lucide-react";
import {
  ApiError,
  api,
  type CategoryType,
  type FinanceCategory,
  type PersonalCategoryDetail,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import { CategoryIcon, IconPicker, systemCategoryIconByKey } from "@/lib/category-icons";
import ConfirmDialog from "@/components/ui/confirm-dialog";
import AsyncErrorState from "@/components/ui/async-error-state";

type Language = "fr" | "en";

export interface CategorySelection {
  familyId: string;
  categoryId: string;
  personalDetailId?: string;
  familyName: string;
  categoryName?: string;
  personalDetailName?: string;
}

const englishNames: Record<string, string> = {
  "income.employment": "Employment",
  "income.business": "Business activity",
  "income.investments": "Investments",
  "income.support": "Support and transfers received",
  "income.exceptional": "Exceptional income",
  "expense.housing": "Housing and utilities",
  "expense.food": "Food",
  "expense.transport": "Transport",
  "expense.health": "Health and wellbeing",
  "expense.family": "Family and personal life",
  "expense.education": "Education and professional activity",
  "expense.leisure": "Leisure and lifestyle",
  "expense.financial": "Financial obligations",
  "expense.solidarity": "Gifts and solidarity",
  "expense.projects": "Projects and exceptional expenses",
  "income.employment.salary": "Main salary",
  "income.employment.bonus": "Bonus and benefit",
  "income.business.sales": "Sales",
  "income.business.fees": "Fees and assignments",
  "income.business.freelance": "Freelance activity",
  "income.investments.interest": "Interest",
  "income.investments.dividend": "Dividends",
  "income.investments.rent": "Rental income",
  "income.support.aid": "Aid and allowance",
  "income.support.refund": "Refund received",
  "income.support.family": "Family transfer received",
  "income.exceptional.gift": "Gift received",
  "income.exceptional.sale": "Personal resale",
  "income.exceptional.other": "Other exceptional income",
  "expense.housing.rent": "Rent or mortgage",
  "expense.housing.utilities": "Utilities and bills",
  "expense.housing.maintenance": "Home maintenance",
  "expense.housing.insurance": "Home insurance",
  "expense.food.groceries": "Groceries",
  "expense.food.dining": "Dining",
  "expense.food.snacks": "Snacks and drinks",
  "expense.transport.public": "Public transport",
  "expense.transport.fuel": "Fuel",
  "expense.transport.taxi": "Taxi and ride service",
  "expense.transport.maintenance": "Vehicle maintenance",
  "expense.health.care": "Consultations and care",
  "expense.health.pharmacy": "Pharmacy",
  "expense.health.insurance": "Health insurance",
  "expense.health.sport": "Sport and wellbeing",
  "expense.family.children": "Children and childcare",
  "expense.family.clothing": "Clothing",
  "expense.family.personal": "Personal care",
  "expense.family.pets": "Pets",
  "expense.education.tuition": "Tuition and training",
  "expense.education.books": "Books and supplies",
  "expense.education.tools": "Professional tools",
  "expense.leisure.outings": "Outings and events",
  "expense.leisure.subscriptions": "Leisure subscriptions",
  "expense.leisure.travel": "Travel and holidays",
  "expense.leisure.hobbies": "Personal hobbies",
  "expense.financial.taxes": "Taxes",
  "expense.financial.loans": "Loans and debt",
  "expense.financial.fees": "Bank fees",
  "expense.financial.insurance": "Other insurance",
  "expense.solidarity.gifts": "Gifts given",
  "expense.solidarity.donations": "Donations",
  "expense.solidarity.family": "Support for a relative",
  "expense.projects.events": "Personal event",
  "expense.projects.equipment": "Exceptional equipment",
  "expense.projects.unplanned": "Unexpected expense",
};

const demoFamilyRows = [
  ["income.employment", "Emploi", "INCOME", "#769450"],
  ["income.business", "Activité professionnelle", "INCOME", "#5F8D7A"],
  ["income.investments", "Placements", "INCOME", "#7799A6"],
  ["income.support", "Aides et transferts reçus", "INCOME", "#9A8DB5"],
  ["income.exceptional", "Entrées exceptionnelles", "INCOME", "#B58B4D"],
  ["expense.housing", "Logement et services", "EXPENSE", "#8D7B68"],
  ["expense.food", "Alimentation", "EXPENSE", "#DDA75B"],
  ["expense.transport", "Transport", "EXPENSE", "#7799A6"],
  ["expense.health", "Santé et bien-être", "EXPENSE", "#C77C72"],
  ["expense.family", "Famille et vie personnelle", "EXPENSE", "#B78383"],
  ["expense.education", "Éducation et activité professionnelle", "EXPENSE", "#6F8E9D"],
  ["expense.leisure", "Loisirs et mode de vie", "EXPENSE", "#A786A5"],
  ["expense.financial", "Obligations financières", "EXPENSE", "#9B7653"],
  ["expense.solidarity", "Dons et solidarité", "EXPENSE", "#A37D91"],
  ["expense.projects", "Projets et dépenses exceptionnelles", "EXPENSE", "#758F62"],
] as const;

const demoPostRows = [
  ["income.employment", "income.employment.salary", "Salaire principal"],
  ["income.employment", "income.employment.bonus", "Prime et avantage"],
  ["income.business", "income.business.sales", "Vente"],
  ["income.business", "income.business.fees", "Honoraires et mission"],
  ["income.investments", "income.investments.interest", "Intérêts"],
  ["income.investments", "income.investments.dividend", "Dividendes"],
  ["income.support", "income.support.aid", "Aide et allocation"],
  ["income.support", "income.support.refund", "Remboursement reçu"],
  ["income.exceptional", "income.exceptional.gift", "Cadeau reçu"],
  ["income.exceptional", "income.exceptional.sale", "Revente personnelle"],
  ["expense.housing", "expense.housing.rent", "Loyer ou mensualité"],
  ["expense.housing", "expense.housing.utilities", "Services et factures"],
  ["expense.housing", "expense.housing.maintenance", "Entretien du logement"],
  ["expense.food", "expense.food.groceries", "Courses alimentaires"],
  ["expense.food", "expense.food.dining", "Restaurant"],
  ["expense.food", "expense.food.snacks", "Collation et boisson"],
  ["expense.transport", "expense.transport.public", "Transport en commun"],
  ["expense.transport", "expense.transport.fuel", "Carburant"],
  ["expense.transport", "expense.transport.taxi", "Taxi et transport avec chauffeur"],
  ["expense.health", "expense.health.care", "Consultation et soins"],
  ["expense.health", "expense.health.pharmacy", "Pharmacie"],
  ["expense.health", "expense.health.sport", "Sport et bien-être"],
  ["expense.family", "expense.family.children", "Enfant et garde"],
  ["expense.family", "expense.family.clothing", "Vêtement"],
  ["expense.education", "expense.education.tuition", "Scolarité et formation"],
  ["expense.education", "expense.education.tools", "Outil professionnel"],
  ["expense.leisure", "expense.leisure.outings", "Sortie et événement"],
  ["expense.leisure", "expense.leisure.subscriptions", "Abonnement de loisir"],
  ["expense.leisure", "expense.leisure.travel", "Voyage et vacances"],
  ["expense.financial", "expense.financial.taxes", "Impôt et taxe"],
  ["expense.financial", "expense.financial.loans", "Crédit et dette"],
  ["expense.financial", "expense.financial.fees", "Frais bancaire"],
  ["expense.solidarity", "expense.solidarity.gifts", "Cadeau offert"],
  ["expense.solidarity", "expense.solidarity.family", "Soutien à un proche"],
  ["expense.projects", "expense.projects.events", "Événement personnel"],
  ["expense.projects", "expense.projects.unplanned", "Imprévu"],
] as const;

function makeDemoCategories(): FinanceCategory[] {
  const families = demoFamilyRows.map(([systemKey, name, type, color], index) => ({
    id: `demo-family-${systemKey}`,
    parentId: null,
    ownerUserId: null,
    name,
    type,
    level: 1 as const,
    systemKey,
    sortOrder: index * 10,
    color,
    icon: systemCategoryIconByKey[systemKey] ?? null,
    isSystem: true,
    version: 1,
  }));
  const parentByKey = new Map(families.map((family) => [family.systemKey, family]));
  const posts = demoPostRows.flatMap(([parentKey, systemKey, name], index) => {
    const parent = parentByKey.get(parentKey);
    if (!parent) return [];
    return [{
      id: `demo-post-${systemKey}`,
      parentId: parent.id,
      ownerUserId: null,
      name,
      type: parent.type,
      level: 2 as const,
      systemKey,
      sortOrder: index * 10,
      color: parent.color,
      icon: systemCategoryIconByKey[systemKey] ?? null,
      isSystem: true,
      version: 1,
    }];
  });
  return [...families, ...posts];
}

export const demoCategories = makeDemoCategories();
const demoDetails: PersonalCategoryDetail[] = [
  { id: "demo-detail-1", categoryId: "demo-post-expense.food.dining", name: "Déjeuner au travail", version: 1, createdAt: new Date().toISOString() },
  { id: "demo-detail-2", categoryId: "demo-post-expense.transport.taxi", name: "Trajet vers le bureau", version: 1, createdAt: new Date().toISOString() },
];

export function categoryName(category: FinanceCategory, language: Language) {
  if (language === "en" && category.systemKey) return englishNames[category.systemKey] ?? category.name;
  return category.name;
}

function errorMessage(error: unknown, language: Language) {
  if (error instanceof ApiError && error.code.includes("DUPLICATE")) {
    return language === "fr" ? "Ce nom existe déjà à cet endroit." : "This name already exists here.";
  }
  return language === "fr" ? "Une erreur est survenue. Réessayez." : "Something went wrong. Please try again.";
}

function useCategoryData(accessToken?: string) {
  const [categories, setCategories] = useState<FinanceCategory[]>(() => accessToken ? [] : demoCategories);
  const [details, setDetails] = useState<PersonalCategoryDetail[]>(() => accessToken ? [] : demoDetails);
  const [loading, setLoading] = useState(Boolean(accessToken));
  const [error, setError] = useState<string>();
  const [retryRevision, setRetryRevision] = useState(0);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      setLoading(true);
      setError(undefined);
      void Promise.all([api.categories(accessToken), api.categoryDetails(accessToken)])
        .then(([categoryResponse, detailResponse]) => {
          if (cancelled) return;
          setCategories(categoryResponse.data);
          setDetails(detailResponse.data);
        })
        .catch((cause: unknown) => {
          if (!cancelled) {
            setCategories([]);
            setDetails([]);
            setError(cause instanceof Error ? cause.message : "REQUEST_ERROR");
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [accessToken, retryRevision]);

  return { categories, setCategories, details, setDetails, loading, error, retry: () => setRetryRevision((current) => current + 1) };
}

export function CategoryPicker({
  accessToken,
  language,
  type,
  onChange,
}: {
  accessToken?: string;
  language: Language;
  type: CategoryType;
  onChange: (selection: CategorySelection | null) => void;
}) {
  const { categories, details, setDetails, loading, error, retry } = useCategoryData(accessToken);
  const [familyId, setFamilyId] = useState("");
  const [postId, setPostId] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [detailId, setDetailId] = useState("");
  const [detailText, setDetailText] = useState("");
  const [savingDetail, setSavingDetail] = useState(false);

  const families = useMemo(() => categories.filter((item) => item.type === type && item.level === 1), [categories, type]);
  const posts = useMemo(() => categories.filter((item) => item.type === type && item.level === 2 && item.parentId === familyId), [categories, familyId, type]);
  const detailOptions = useMemo(() => details.filter((item) => item.categoryId === postId), [details, postId]);
  const selectedFamily = families.find((item) => item.id === familyId);
  const selectedPost = posts.find((item) => item.id === postId);
  const selectedDetail = detailOptions.find((item) => item.id === detailId);

  useEffect(() => {
    if (!selectedFamily) {
      onChange(null);
      return;
    }
    onChange({
      familyId: selectedFamily.id,
      categoryId: selectedPost?.id ?? selectedFamily.id,
      personalDetailId: selectedDetail?.id,
      familyName: categoryName(selectedFamily, language),
      categoryName: selectedPost ? categoryName(selectedPost, language) : undefined,
      personalDetailName: selectedDetail?.name ?? (detailText.trim() || undefined),
    });
  }, [detailText, language, onChange, selectedDetail, selectedFamily, selectedPost]);

  const createDetail = async () => {
    const name = detailText.trim();
    if (!postId || !name) return;
    setSavingDetail(true);
    try {
      let created: PersonalCategoryDetail;
      if (accessToken) {
        created = (await api.createCategoryDetail(accessToken, { categoryId: postId, name })).data;
      } else {
        created = { id: `demo-detail-${Date.now()}`, categoryId: postId, name, version: 1, createdAt: new Date().toISOString() };
      }
      setDetails((current) => [...current, created]);
      setDetailId(created.id);
      setDetailText(created.name);
    } finally {
      setSavingDetail(false);
    }
  };

  return (
    <fieldset className="space-y-4">
      {error && <AsyncErrorState message={language === "fr" ? "Impossible de charger les catégories." : "Unable to load categories."} retryLabel={language === "fr" ? "Réessayer" : "Retry"} onRetry={retry} />}
      <legend className="text-sm font-semibold text-[#454740] dark:text-[#d7d8d1]">
        {language === "fr" ? "Classement" : "Classification"}
      </legend>
      <p className="text-xs leading-relaxed text-[var(--yahro-muted)]">
        {language === "fr"
          ? "Choisissez une famille. Le poste et le détail restent facultatifs."
          : "Choose a family. The post and personal detail remain optional."}
      </p>

      {loading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-[#f0f0eb] dark:bg-white/6" />
      ) : (
        <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto pr-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid-cols-3">
          {families.map((family) => {
            const selected = family.id === familyId;
            return (
              <button
                key={family.id}
                type="button"
                onClick={() => {
                  setFamilyId(family.id);
                  setPostId("");
                  setDetailId("");
                  setDetailText("");
                }}
                className={cn(
                  "min-h-16 rounded-xl border p-2.5 text-left text-xs font-semibold leading-snug transition-all",
                  selected
                    ? "border-[#789651] bg-[#eef5e4] text-[#3f5825] ring-2 ring-[#789651]/15 dark:border-[#91b363] dark:bg-[#293620] dark:text-[#d4e9b8]"
                    : "border-[#e1e1db] bg-[#fafaf7] text-[#66685f] hover:border-[#cddbb9] dark:border-white/8 dark:bg-[#191a16] dark:text-[#b9bbb3]",
                )}
              >
                <span className="mb-2 grid size-7 place-items-center rounded-lg bg-white/75 text-[#687d4d] shadow-sm dark:bg-white/7 dark:text-[#bad492]"><CategoryIcon name={family.icon} size={15} /></span>
                {categoryName(family, language)}
              </button>
            );
          })}
        </div>
      )}

      {selectedFamily && (
        <label className="block text-sm font-medium text-yahro-muted">
          {language === "fr" ? "Poste conseillé" : "Suggested post"}
          <select
            value={postId}
            onChange={(event) => {
              setPostId(event.target.value);
              setDetailId("");
              setDetailText("");
            }}
            className="mt-2 h-11 w-full rounded-xl border border-yahro-border bg-[#fafaf7] px-3 text-yahro-text dark:border-white/10 dark:bg-[#181914] dark:text-white"
          >
            <option value="">{language === "fr" ? "Famille seule" : "Family only"}</option>
            {posts.map((post) => <option key={post.id} value={post.id}>{categoryName(post, language)}</option>)}
          </select>
        </label>
      )}

      {selectedPost && (
        <div className="rounded-xl border border-dashed border-[#d7ddd0] p-3 dark:border-white/12">
          <button
            type="button"
            onClick={() => setAdvancedOpen((open) => !open)}
            className="flex w-full items-center justify-between text-left text-xs font-semibold text-[#667d49] dark:text-[#b2cf8c]"
          >
            <span className="flex items-center gap-2"><Tag size={14} />{language === "fr" ? "Ajouter un détail personnel" : "Add a personal detail"}</span>
            <span>{advancedOpen ? "-" : "+"}</span>
          </button>
          {advancedOpen && (
            <div className="mt-3">
              <div className="flex gap-2">
                <input
                  list={`details-${postId}`}
                  value={detailText}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDetailText(value);
                    setDetailId(detailOptions.find((detail) => detail.name.toLocaleLowerCase() === value.trim().toLocaleLowerCase())?.id ?? "");
                  }}
                  placeholder={language === "fr" ? "Ex. Déjeuner au travail" : "E.g. Lunch at work"}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-yahro-border bg-white px-3 text-sm dark:border-white/10 dark:bg-[#181914]"
                />
                <datalist id={`details-${postId}`}>
                  {detailOptions.map((detail) => <option key={detail.id} value={detail.name} />)}
                </datalist>
                <button
                  type="button"
                  onClick={() => void createDetail()}
                  disabled={!detailText.trim() || Boolean(detailId) || savingDetail}
                  className="rounded-lg bg-[#e9f2dc] px-3 text-xs font-bold text-[#4e692e] disabled:opacity-40 dark:bg-[#2d3b24] dark:text-[#c6dfa6]"
                >
                  {language === "fr" ? "Mémoriser" : "Save"}
                </button>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[var(--yahro-muted)]"><LockKeyhole size={12} />{language === "fr" ? "Ce détail reste privé et sera proposé lors des prochaines saisies." : "This detail stays private and will be suggested next time."}</p>
            </div>
          )}
        </div>
      )}
    </fieldset>
  );
}

export default function CategoryManager({ accessToken, language }: { accessToken?: string; language: Language }) {
  const { categories, setCategories, details, setDetails, loading, error, retry } = useCategoryData(accessToken);
  const [type, setType] = useState<CategoryType>("EXPENSE");
  const [familyId, setFamilyId] = useState("");
  const [postId, setPostId] = useState("");
  const [newPost, setNewPost] = useState("");
  const [newPostIcon, setNewPostIcon] = useState("apple");
  const [newDetail, setNewDetail] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [archiveTarget, setArchiveTarget] = useState<{ kind: "post"; item: FinanceCategory } | { kind: "detail"; item: PersonalCategoryDetail }>();

  const families = useMemo(() => categories.filter((item) => item.type === type && item.level === 1), [categories, type]);
  const selectedFamily = families.find((item) => item.id === familyId) ?? families[0];
  const posts = useMemo(() => {
    if (!selectedFamily) return [];
    const normalized = search.trim().toLocaleLowerCase();
    return categories.filter((item) => item.level === 2 && item.parentId === selectedFamily.id && (!normalized || categoryName(item, language).toLocaleLowerCase().includes(normalized)));
  }, [categories, language, search, selectedFamily]);
  const selectedPost = posts.find((item) => item.id === postId) ?? posts[0];
  const selectedDetails = details.filter((item) => item.categoryId === selectedPost?.id);

  const addPost = async () => {
    const name = newPost.trim();
    if (!selectedFamily || !name) return;
    setBusy(true);
    setNotice(undefined);
    try {
      let created: FinanceCategory;
      if (accessToken) {
        created = (await api.createCategory(accessToken, { parentId: selectedFamily.id, name, type, color: selectedFamily.color ?? undefined, icon: newPostIcon })).data;
      } else {
        created = { ...selectedFamily, id: `demo-custom-${Date.now()}`, parentId: selectedFamily.id, ownerUserId: "demo-user", name, icon: newPostIcon, level: 2, systemKey: null, isSystem: false, version: 1 };
      }
      setCategories((current) => [...current, created]);
      setPostId(created.id);
      setNewPost("");
      setNewPostIcon("apple");
      setNotice(language === "fr" ? "Poste personnel ajouté." : "Personal post added.");
    } catch (cause) {
      setNotice(errorMessage(cause, language));
    } finally {
      setBusy(false);
    }
  };

  const addDetail = async () => {
    const name = newDetail.trim();
    if (!selectedPost || !name) return;
    setBusy(true);
    setNotice(undefined);
    try {
      let created: PersonalCategoryDetail;
      if (accessToken) created = (await api.createCategoryDetail(accessToken, { categoryId: selectedPost.id, name })).data;
      else created = { id: `demo-detail-${Date.now()}`, categoryId: selectedPost.id, name, version: 1, createdAt: new Date().toISOString() };
      setDetails((current) => [...current, created]);
      setNewDetail("");
      setNotice(language === "fr" ? "Détail personnel mémorisé." : "Personal detail saved.");
    } catch (cause) {
      setNotice(errorMessage(cause, language));
    } finally {
      setBusy(false);
    }
  };

  const archivePost = async (post: FinanceCategory) => {
    if (post.isSystem) return;
    setBusy(true);
    try {
      if (accessToken) await api.archiveCategory(accessToken, post.id);
      setCategories((current) => current.filter((item) => item.id !== post.id));
      setPostId("");
    } catch (cause) {
      setNotice(errorMessage(cause, language));
    } finally {
      setBusy(false);
    }
  };

  const archiveDetail = async (detail: PersonalCategoryDetail) => {
    setBusy(true);
    try {
      if (accessToken) await api.archiveCategoryDetail(accessToken, detail.id);
      setDetails((current) => current.filter((item) => item.id !== detail.id));
    } catch (cause) {
      setNotice(errorMessage(cause, language));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="animate-fade-up space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[.13em] text-[var(--yahro-accent-text)] dark:text-[#9cbc73]">{language === "fr" ? "Organisation" : "Organisation"}</p>
          <h1 className="font-[Manrope_Variable] text-2xl font-extrabold tracking-[-.04em] sm:text-3xl">{language === "fr" ? "Postes et catégories" : "Posts and categories"}</h1>
          <p className="mt-2 max-w-2xl text-sm text-yahro-muted">{language === "fr" ? "Une ossature stable pour les analyses, avec vos précisions personnelles lorsque vous en avez besoin." : "A stable structure for reporting, with personal details whenever you need them."}</p>
        </div>
        <div className="inline-flex rounded-xl bg-[#e9e9e4] p-1 dark:bg-white/7">
          {(["EXPENSE", "INCOME"] as CategoryType[]).map((value) => (
            <button key={value} type="button" onClick={() => { setType(value); setFamilyId(""); setPostId(""); }} className={cn("h-12 rounded-lg px-4 text-sm font-bold sm:h-10", type === value ? "bg-white text-[#263019] shadow-sm dark:bg-[#303129] dark:text-white" : "text-[var(--yahro-muted)]")}>{value === "EXPENSE" ? (language === "fr" ? "Sorties" : "Expenses") : (language === "fr" ? "Entrées" : "Income")}</button>
          ))}
        </div>
      </div>

      {error && <AsyncErrorState message={language === "fr" ? "Impossible de charger vos catégories." : "Unable to load your categories."} retryLabel={language === "fr" ? "Réessayer" : "Retry"} onRetry={retry} />}

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: FolderTree, value: families.length, label: language === "fr" ? "Familles stables" : "Stable families" },
          { icon: Layers3, value: categories.filter((item) => item.type === type && item.level === 2).length, label: language === "fr" ? "Postes disponibles" : "Available posts" },
          { icon: Tag, value: details.length, label: language === "fr" ? "Détails privés" : "Private details" },
        ].map(({ icon: Icon, value, label }) => <article key={label} className="rounded-2xl border border-yahro-border bg-white p-4 dark:border-white/8 dark:bg-[#20211d]"><span className="grid size-9 place-items-center rounded-xl bg-[#edf4e3] text-[#668642] dark:bg-[#2a3822] dark:text-[#b6d68e]"><Icon size={17} /></span><p className="mt-4 font-[Manrope_Variable] text-2xl font-extrabold">{value}</p><p className="mt-1 text-xs text-[var(--yahro-muted)]">{label}</p></article>)}
      </div>

      <div className="grid min-h-[540px] overflow-hidden rounded-2xl border border-yahro-border bg-white dark:border-white/8 dark:bg-[#20211d] lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="border-b border-[#e7e7e1] p-4 dark:border-white/8 lg:border-b-0 lg:border-r">
          <p className="px-2 text-xs font-bold uppercase tracking-[.12em] text-[var(--yahro-muted)]">{language === "fr" ? "1. Familles" : "1. Families"}</p>
          <div className="mt-3 space-y-1">
            {families.map((family) => <button key={family.id} type="button" onClick={() => { setFamilyId(family.id); setPostId(""); }} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold", selectedFamily?.id === family.id ? "bg-[#eaf2de] text-[#405829] dark:bg-[#293620] dark:text-[#cee6af]" : "text-[#66685f] hover:bg-[#f4f4ef] dark:text-[#b4b6ad] dark:hover:bg-white/5")}><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/80 text-[#6d854e] shadow-sm dark:bg-white/7 dark:text-[#bfd99a]"><CategoryIcon name={family.icon} size={16} /></span><span className="flex-1">{categoryName(family, language)}</span><ChevronRight size={15} /></button>)}
          </div>
        </aside>

        <div className="p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 border-b border-[#e8e8e3] pb-5 dark:border-white/7 sm:flex-row sm:items-center">
            <div><p className="text-xs font-bold uppercase tracking-[.12em] text-[var(--yahro-muted)]">{language === "fr" ? "2. Postes" : "2. Posts"}</p><h2 className="mt-1 font-[Manrope_Variable] text-xl font-bold">{selectedFamily ? categoryName(selectedFamily, language) : ""}</h2></div>
            <label className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--yahro-muted)]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={language === "fr" ? "Rechercher un poste" : "Search posts"} className="h-10 w-full rounded-xl border border-yahro-border bg-[#fafaf7] pl-9 pr-3 text-sm dark:border-white/10 dark:bg-[#181914] sm:w-56" /></label>
          </div>

          {loading ? <div className="mt-5 h-48 animate-pulse rounded-2xl bg-[#f1f1ed] dark:bg-white/5" /> : (
            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,.72fr)]">
              <div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {posts.map((post) => <div key={post.id} className={cn("group flex min-h-16 items-center rounded-xl border transition-all", selectedPost?.id === post.id ? "border-[#9ab678] bg-[#f0f5e8] dark:border-[#66864a] dark:bg-[#29331f]" : "border-[#e5e5df] bg-[#fafaf7] hover:border-[#d1ddc1] dark:border-white/7 dark:bg-[#1a1b17]")}><button type="button" onClick={() => setPostId(post.id)} className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl p-3 text-left"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-[#6c894a] shadow-sm dark:bg-white/7"><CategoryIcon name={post.icon} size={17} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{categoryName(post, language)}</span><span className="mt-0.5 block text-[10px] text-[var(--yahro-muted)]">{post.isSystem ? (language === "fr" ? "Poste Yahro" : "Yahro post") : (language === "fr" ? "Poste personnel" : "Personal post")}</span></span></button>{!post.isSystem && <button type="button" onClick={() => setArchiveTarget({ kind: "post", item: post })} className="yahro-hover-action yahro-touch-target mr-2 grid size-11 shrink-0 place-items-center rounded-xl text-[#777970] opacity-60 hover:bg-[#f3e7e3] hover:text-[#a25543] focus-visible:opacity-100 sm:group-hover:opacity-100" aria-label={language === "fr" ? "Archiver" : "Archive"}><Archive size={15} /></button>}</div>)}
                </div>
                <div className="mt-4 rounded-xl border border-dashed border-[#d7ddd0] p-3 dark:border-white/12"><div className="flex gap-2"><input value={newPost} onChange={(event) => setNewPost(event.target.value)} placeholder={language === "fr" ? "Créer un poste personnel" : "Create a personal post"} className="h-10 min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" /><button type="button" onClick={() => void addPost()} disabled={!newPost.trim() || busy} className="inline-flex items-center gap-1 rounded-lg bg-[#e8f1da] px-3 text-xs font-bold text-[#4a642c] disabled:opacity-40 dark:bg-[#2e3b25] dark:text-[#c5dfa3]"><Plus size={14} />{language === "fr" ? "Ajouter" : "Add"}</button></div><p className="mb-2 mt-3 text-[11px] font-semibold text-[var(--yahro-muted)]">{language === "fr" ? "Choisir une icône pour ce poste" : "Choose an icon for this post"}</p><IconPicker value={newPostIcon} onChange={setNewPostIcon} language={language} /></div>
              </div>

              <aside className="rounded-2xl bg-[#f5f6f1] p-4 dark:bg-[#191a16]">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.1em] text-[#829165]"><ListChecks size={14} />{language === "fr" ? "3. Détails personnels" : "3. Personal details"}</p>
                <p className="mt-2 text-xs leading-relaxed text-[var(--yahro-muted)]">{selectedPost ? categoryName(selectedPost, language) : (language === "fr" ? "Sélectionnez un poste" : "Select a post")}</p>
                <div className="mt-4 space-y-2">
                  {selectedDetails.map((detail) => <div key={detail.id} className="group flex min-h-12 items-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm shadow-sm dark:bg-white/6"><Tag size={13} className="text-[#789653]" /><span className="min-w-0 flex-1 truncate">{detail.name}</span><button type="button" onClick={() => setArchiveTarget({ kind: "detail", item: detail })} className="yahro-hover-action yahro-touch-target grid size-11 place-items-center rounded-xl text-[#777970] opacity-60 hover:bg-[#f3e7e3] hover:text-[#a25543] focus-visible:opacity-100 group-hover:opacity-100" aria-label={language === "fr" ? "Archiver" : "Archive"}><Archive size={14} /></button></div>)}
                  {selectedPost && selectedDetails.length === 0 && <p className="rounded-lg border border-dashed border-[#d8dcd2] px-3 py-5 text-center text-xs text-[var(--yahro-muted)] dark:border-white/10">{language === "fr" ? "Aucun détail. Ce niveau est facultatif." : "No details. This level is optional."}</p>}
                </div>
                {selectedPost && <div className="mt-3 flex gap-2"><input value={newDetail} onChange={(event) => setNewDetail(event.target.value)} placeholder={language === "fr" ? "Votre précision" : "Your detail"} className="h-12 min-w-0 flex-1 rounded-lg border border-yahro-border bg-white px-3 text-base dark:border-white/10 dark:bg-[#20211d] sm:h-10 sm:text-sm" /><button type="button" onClick={() => void addDetail()} disabled={!newDetail.trim() || busy} className="grid size-12 place-items-center rounded-lg bg-[#20211d] text-white disabled:opacity-40 dark:bg-[#dcebc5] dark:text-[#202b13]" aria-label={language === "fr" ? "Ajouter" : "Add"}><Plus size={15} /></button></div>}
                <p className="mt-4 flex gap-2 text-[11px] leading-relaxed text-[var(--yahro-muted)]"><LockKeyhole size={13} className="mt-0.5 shrink-0" />{language === "fr" ? "Vos détails ne sont visibles que par vous, même dans un espace partagé." : "Your details are only visible to you, even in a shared workspace."}</p>
              </aside>
            </div>
          )}
          {notice && <p className="mt-4 rounded-xl bg-[#f0f3ea] px-4 py-3 text-xs text-[#5d7044] dark:bg-[#293321] dark:text-[#bdd79a]">{notice}</p>}
        </div>
      </div>
      <ConfirmDialog open={Boolean(archiveTarget)} title={archiveTarget?.kind === "post" ? (language === "fr" ? "Archiver ce poste personnel ?" : "Archive this personal post?") : (language === "fr" ? "Archiver ce détail personnel ?" : "Archive this personal detail?")} description={language === "fr" ? "Cet élément ne sera plus proposé dans les nouvelles saisies. Les opérations existantes restent conservées." : "This item will no longer be offered for new entries. Existing operations remain preserved."} confirmLabel={language === "fr" ? "Archiver" : "Archive"} cancelLabel={language === "fr" ? "Annuler" : "Cancel"} pending={busy} onClose={() => setArchiveTarget(undefined)} onConfirm={async () => { if (!archiveTarget) return; if (archiveTarget.kind === "post") await archivePost(archiveTarget.item); else await archiveDetail(archiveTarget.item); setArchiveTarget(undefined); }} />
    </section>
  );
}
