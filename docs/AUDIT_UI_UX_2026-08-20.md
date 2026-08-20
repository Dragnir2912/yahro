# Audit UI / UX — Yahro

**Méthode réelle.** J'ai monté la stack complète dans un conteneur Linux : PostgreSQL, les 6 migrations, l'API Fastify, le build de production Vite servi par `vite preview`. J'ai créé un compte vérifié et l'ai peuplé (5 comptes, 19 transactions sur 2 mois, 6 budgets, 3 projets, 5 dépenses projet, 1 taux personnalisé), puis piloté l'app avec Playwright/Chromium : **366 captures** sur les 10 viewports demandés, mesures automatisées du DOM réel (débordements, tailles de police, cibles tactiles, ratios de contraste calculés pixel par pixel), CLS via `PerformanceObserver`, journal console et réseau, navigation clavier, zoom 125 % / 200 %, orientation paysage, et simulation des états de chargement, d'erreur et d'expiration de session.

**Tout ce qui est affirmé ci-dessous a été observé.** Les deux points que je n'ai pas pu trancher sont explicitement marqués « à vérifier ». Deux hypothèses que j'avais formulées se sont révélées fausses à la vérification et ne figurent donc pas dans le tableau — je les documente en §6 par honnêteté méthodologique.

**Limite de rendu.** Chromium uniquement. Safari/WebKit et Firefox/Gecko n'étaient pas installables ici : les constats spécifiques à ces moteurs (rendu de `<input type="date">`, `100dvh` sur iOS Safari, `backdrop-filter`) sont signalés comme non vérifiés.

---

## 1. Verdict global

L'interface est **visuellement aboutie et techniquement propre sur les fondamentaux** : zéro scroll horizontal parasite sur les 10 viewports, CLS ≤ 0,006 (excellent), aucune troncature sans ellipse, zoom 200 % sans casse, modale conforme (`role`, `aria-modal`, piège de focus, Échap), anneaux de focus présents partout, champs à 16 px sur mobile, `env(safe-area-inset-*)` correctement utilisé. Le travail de fond est là.

Ce qui coûte cher est ailleurs, et c'est grave pour un produit financier : **(1)** pendant le chargement — et indéfiniment si l'API échoue — l'app affiche des **données de démonstration inventées présentées comme le solde réel de l'utilisateur** ; **(2)** l'access token n'est jamais renouvelé et aucun 401 n'est intercepté, donc après 15 minutes ou dès l'ouverture d'un second onglet l'interface se fige sur des panneaux blancs sans le moindre message ; **(3)** un budget posé sur une famille affiche éternellement **0 %** alors que les dépenses existent.

**Note : 6/10.** Excellente exécution visuelle, défaillances de véracité et d'états.

---

## 2. Tableau des problèmes

| # | Prio | Écran | Contexte | Problème observé | Cause probable | Correctif |
|---|---|---|---|---|---|---|
| 1 | **P0** | Vue d'ensemble | Tous | Pendant le chargement de `/api/dashboard` et **en cas d'échec total**, l'app affiche `14 963,50 FCFA` de solde, `0 comptes suivis`, `Budget mensuel 1 858/2 800 (66 %)` — **données de démo**, alors que le réel est `2 480 600 FCFA` / 5 comptes | `totals`, `visibleBudgets`, `visibleCashFlow` retombent sur les tableaux de démo dès que `!dashboardData`, sans distinguer « pas connecté » de « en cours de chargement » | Introduire `financeLoading` et afficher des squelettes (§3.1) |
| 2 | **P0** | Toute l'app | Tous | Après ~15 min, ou dès qu'un 2ᵉ onglet est ouvert, chaque écran affiche un **panneau blanc permanent**. Mesuré : `401 /accounts`, `401 /transactions`, `401 /categories`, aucun message, aucun bouton | Aucun `setInterval` de renouvellement ; `expiresIn` reçu et jamais utilisé ; aucun `status === 401` dans tout `src/` | Renouvellement programmé + interception 401 globale (§3.2) |
| 3 | **P0** | Restauration de session | `npm run dev` | En dev, **100 % des ouvertures** renvoient sur la landing malgré un cookie valide. Séquence mesurée : 2× `POST /refresh` → le 2ᵉ déclenche la détection de réutilisation → famille révoquée → `401` | `React.StrictMode` double-invoque l'effet ; la rotation n'a aucune fenêtre de tolérance | Dédupliquer l'appel via une promesse partagée (§3.3) |
| 4 | **P1** | Budgets, Vue d'ensemble | Tous | Les 6 budgets affichent `0 FCFA / … — 0 %` et 6 barres vides, alors que 293 200 FCFA ont été dépensés dans ces familles. `spendingByCategory` le montre correctement | `budgetProgress` joint `transactions.category_id = budgets.category_id` : budget sur **famille** (niveau 1), dépense sur **poste** (niveau 2) → jointure vide | Agréger sur la descendance (§3.4) |
| 5 | **P1** | Vue d'ensemble | Tous | Le graphe « **6 derniers mois** » affiche `09 → 14 août`, soit **6 jours**. « 3 derniers mois » = 3 jours | `dashboard.cashflow` est en buckets **journaliers** ; `.slice(-cashFlowPeriod)` prend 6 éléments ; `api.dashboard()` est appelé sans plage | Demander la vraie plage et agréger par mois (§3.5) |
| 6 | **P1** | Vue d'ensemble | Tous | « Dépenses du mois 808 000 FCFA » avec une flèche **↙ vers le bas** et « 123 % » : les dépenses ont **augmenté** de 123 %, la flèche dit l'inverse | `StatCard` utilise `positive` pour piloter *à la fois* la couleur et la direction de la flèche | Découpler signe et sentiment (§3.6) |
| 7 | **P1** | Comptes, Transactions | Tactile | Boutons destructifs mesurés à **`opacity: 0`, 15×15 px, `pointer-events: auto`, atteignables au toucher et au clavier**. Aucune confirmation | `opacity-0 group-hover:opacity-100` : sans survol sur mobile, ils restent invisibles mais actifs | Rendre visible sur pointeur grossier + confirmation (§3.7) |
| 8 | **P1** | Budgets | Tous | L'icône « Archiver » d'un budget déclenche un `DELETE` **définitif** côté API, **sans confirmation**. À l'inverse, supprimer un taux de change (archivage réversible) affiche un `window.confirm` | Sémantique inversée entre libellé, icône et effet réel | Aligner verbe/icône/effet (§3.7) |
| 9 | **P1** | Toute l'app | Système en sombre | `prefers-color-scheme: dark` est **ignoré** : l'app s'ouvre en blanc. Aucun `matchMedia` dans `src/` | Thème initialisé depuis `localStorage` uniquement, défaut `"light"` | Lire la préférence système (§3.8) |
| 10 | **P1** | Toute l'app | iPad paysage 1180×820 | Cibles tactiles mesurées **sous 44 px** : nav latérale `217×40`, icônes d'en-tête `40×40`, filtres `66×32`, « Archiver » `15×15` | `.yahro-touch-target` n'agrandit qu'en `@media (max-width: 1023px)` : un iPad paysage à 1180 px est tactile mais hors de la règle | Conditionner sur `pointer: coarse` (§3.9) |
| 11 | **P1** | Transversal | Clair | Contrastes AA échoués sur des couleurs **codées en dur** hors tokens : `#92948c` = **3,07:1** (11×), `#85877f` = **3,64:1** (15×), et le vert de marque `#769450` = **3,43:1** en texte (25×), `#7c9a51` = **3,18:1** (8×). Les tokens officiels, eux, passent (`--yahro-muted #686a62` = 5,49:1) | Valeurs arbitraires Tailwind écrites à la main au lieu des variables | Remplacer par les tokens (§3.10) |
| 12 | **P1** | Vue d'ensemble | Téléphone paysage 667×375 | En-tête 70 px + barre basse 64 px = **36 % de la hauteur**. La barre translucide recouvre « Solde total » : le montant se lit **à travers** le flou. Aucune donnée financière avant défilement | Chrome fixe non adapté aux hauteurs < 420 px | Compacter en paysage (§3.11) |
| 13 | P2 | Landing | Tous | La maquette du héros est en **anglais** (« Overview », « Last 6 months », « Salary – ENSEA ») et en **euros** (`1 858 € / 2 800 €`, `-84,30 €`) sur une page française, pour un produit dont la devise par défaut est le XOF | Maquette statique jamais traduite | Traduire et passer en FCFA |
| 14 | P2 | Landing | Tous | Textes à **7 px** (`+ 8.2%`), 8 px (`app.yahro.local`, `Search…`), 9 px (`Overview`, `-84,30 €`) dans la maquette | Maquette rendue en DOM réel miniaturisé | Passer la maquette en image/SVG ou remonter à 11 px min |
| 15 | P2 | Modale transaction | Mobile | Champ montant `type="number" step="0.01"`, placeholder `0,00`, **aucun `inputmode`** — or le **XOF n'a pas de centimes** | Champ générique non adapté à la devise | `inputmode="decimal"` + pas de décimales pour XOF/XAF (§3.12) |
| 16 | P2 | Transversal | Tous | La même chaîne `F CFA` se lit « FCFA » sur les gros montants et « F CFA » sur les petits | `tracking-[-.04em]` (−1,088 px) écrase l'espace fine insécable | Neutraliser le letter-spacing sur le symbole |
| 17 | P2 | Projets, Taux | Tous | `window.confirm()` natif (non stylable, « 127.0.0.1 dit… » sur iOS) alors que `accessible-dialog.tsx` existe déjà dans le projet | Deux mécanismes de confirmation coexistent | Utiliser le composant maison partout |
| 18 | P2 | Vue d'ensemble | Clavier | Le `<svg>` Recharts capte un arrêt de tabulation **sans nom accessible** ni rôle | Recharts pose `tabindex="0"` sur sa surface | `role="img"` + `aria-label`, ou retirer du parcours |
| 19 | P2 | Toute l'app | Clavier | Aucun **lien d'évitement** : 10 arrêts dans la nav latérale avant d'atteindre le contenu, à chaque écran | Absent | Ajouter un « Aller au contenu » |
| 20 | P2 | Projets | Tous | Une carte affiche « DÉPENSÉ **0 FCFA** » et « **2 dépenses** » simultanément ; les tuiles de synthèse annoncent « Dépensé 1 099 500 FCFA » | La carte montre la période courante, la synthèse le cumul — sans que rien ne le dise | Libeller « Dépensé cette semaine » / « Depuis le début » |

---

## 3. Correctifs P0 et P1

### 3.1 — #1 · Ne jamais montrer de données de démo à un utilisateur connecté

C'est le correctif le plus important du lot. Aujourd'hui, `src/components/ui/saa-s-template.tsx` teste `!accessToken || !dashboardData` : pendant le chargement, `accessToken` est présent mais `dashboardData` encore vide, donc la branche démo s'exécute.

**a) Ajouter un état de chargement** — après la ligne 652 :

```ts
  const [financeError, setFinanceError] = useState<string>();
  const [financeLoading, setFinanceLoading] = useState(Boolean(accessToken));   // ← ajout
```

**b) Le piloter dans `reloadFinance`** (ligne 663) :

```ts
  const reloadFinance = React.useCallback(async () => {
    if (!accessToken) return;
    setFinanceLoading(true);                                    // ← ajout
    try {
      const [dashboardResponse, transactionResponse, categoryResponse] = await Promise.all([
        api.dashboard(accessToken),
        api.transactions(accessToken, { limit: 40 }),
        api.categories(accessToken),
      ]);
      // ... inchangé ...
      setFinanceError(undefined);
    } catch {
      setFinanceError(language === "fr" ? "Certaines données financières n'ont pas pu être chargées." : "Some financial data could not be loaded.");
    } finally {
      setFinanceLoading(false);                                 // ← ajout
    }
  }, [accessToken, language]);
```

**c) Neutraliser la démo dès qu'un token existe** — remplacer les trois retombées. Ligne 706, 720 et 727, le test `!accessToken || !dashboardData` devient `!accessToken` pour la démo, et le cas « connecté mais sans données » retourne des valeurs neutres :

```ts
  const totals = useMemo(() => {
    if (accessToken) {
      if (!dashboardData) return { income: 0, expenses: 0, balance: 0 };        // ← ajout
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
```

et de même : `visibleCashFlow` → `if (accessToken && !dashboardData) return [];`, `visibleBudgets` → `if (accessToken && !dashboardData) return [];`.

**d) Afficher un squelette plutôt qu'un zéro.** Un composant minimal, à placer près de `StatCard` :

```tsx
function StatSkeleton() {
  return (
    <article aria-hidden="true" className="rounded-2xl border border-[#e1e1dc] bg-white p-5 dark:border-white/8 dark:bg-[#20211d]">
      <div className="mb-5 flex items-center justify-between">
        <span className="h-4 w-24 animate-pulse rounded bg-[#ecece7] dark:bg-white/8" />
        <span className="size-8 animate-pulse rounded-lg bg-[#ecece7] dark:bg-white/8" />
      </div>
      <div className="h-8 w-36 animate-pulse rounded bg-[#ecece7] dark:bg-white/8" />
      <div className="mt-2 h-4 w-14 animate-pulse rounded bg-[#ecece7] dark:bg-white/8" />
    </article>
  );
}
```

puis, au rendu des trois `StatCard` (lignes 927-929) :

```tsx
{financeLoading && !dashboardData ? (
  <><StatSkeleton /><StatSkeleton /><StatSkeleton /></>
) : (
  <>
    <StatCard label={t("monthlyIncome")} … />
    <StatCard label={t("monthlySpending")} … />
    <StatCard label={t("savingsRate")} … />
  </>
)}
```

**e) Rendre l'erreur actionnable.** Le bandeau actuel (ligne ~696) n'offre aucune sortie :

```tsx
{financeError && (
  <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e8cdc6] bg-[#fbeeea] px-4 py-3 dark:border-[#5a3a33] dark:bg-[#2e1f1b]">
    <p className="text-sm text-[#8f4634] dark:text-[#e9a695]">{financeError}</p>
    <button type="button" onClick={() => void reloadFinance()}
      className="h-10 rounded-lg border border-[#d9b3aa] px-3 text-sm font-bold text-[#8f4634] hover:bg-[#f5ded8] dark:border-[#6d453c] dark:text-[#e9a695]">
      {language === "fr" ? "Réessayer" : "Retry"}
    </button>
  </div>
)}
```

*Compromis :* les squelettes rendent le premier affichage un peu moins « plein ». C'est le prix à payer pour ne plus mentir sur un solde. Le texte `#8f4634` sur `#fbeeea` monte le bandeau d'erreur à 5,1:1 (l'actuel est sous le seuil).

---

### 3.2 — #2 · Renouveler le token et intercepter les 401

Deux manques cumulés : aucun renouvellement programmé, aucune gestion du 401. Résultat mesuré : panneaux blancs définitifs.

**a) Exposer le 401 depuis la couche API** — `src/lib/api.ts`, après la classe `ApiError` :

```ts
let unauthorizedHandler: (() => void) | null = null;
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler;
  return () => { unauthorizedHandler = null; };
}
```

et dans `request()`, juste avant le `throw` :

```ts
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { code?: string; message?: string } | null;
    if (response.status === 401 && options.accessToken) unauthorizedHandler?.();   // ← ajout
    throw new ApiError(response.status, payload?.code ?? "REQUEST_ERROR", payload?.message ?? "Request failed");
  }
```

Le garde `options.accessToken` évite de déclencher sur le `401` normal de `/api/auth/refresh` à froid.

**b) Renouveler avant expiration et réagir au 401** — dans `src/App.tsx`, la session connectée devient :

```tsx
  useEffect(() => {
    if (session?.kind !== "authenticated") return;
    let active = true;

    const renew = async () => {
      try {
        const { accessToken } = await api.refresh();
        if (active) setSession((current) =>
          current?.kind === "authenticated" ? { ...current, accessToken } : current);
      } catch {
        if (active) setSession(null);
      }
    };

    // ACCESS_TOKEN_TTL_SECONDS = 900 → on renouvelle à 12 min, avec 3 min de marge
    const timer = window.setInterval(() => { void renew(); }, 12 * 60 * 1000);
    const stop = onUnauthorized(() => { void renew(); });
    const onVisible = () => { if (document.visibilityState === "visible") void renew(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      window.clearInterval(timer);
      stop();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [session?.kind]);
```

`visibilitychange` couvre le cas mesuré des deux onglets : en revenant sur l'onglet resté en arrière-plan, il redemande un token frais au lieu d'échouer en silence.

**c) Squelette borné plutôt qu'infini.** Le panneau blanc observé vient d'un `loading` qui ne retombe jamais. Partout où le motif `loading ? <div className="h-52 animate-pulse …" /> : …` apparaît (`finance-pages.tsx:117` et `:149`, `budgets-dashboard.tsx`, `projects-dashboard.tsx`), ajouter un troisième cas d'erreur avec un bouton « Réessayer », sur le modèle du §3.1(e).

*Compromis :* un `setInterval` de 12 min garde un onglet en arrière-plan actif. Acceptable pour une SPA ; à combiner avec le `visibilitychange` pour ne pas renouveler inutilement un onglet jamais rouvert.

---

### 3.3 — #3 · Dédupliquer l'appel de restauration de session

Constaté en dev : `React.StrictMode` double-invoque l'effet, les deux `POST /api/auth/refresh` partent avec le **même** cookie, le second est vu comme une réutilisation, la famille entière est révoquée. Une promesse partagée règle le cas et protège aussi la production contre tout double appel concurrent.

Dans `src/lib/api.ts` :

```ts
let refreshInFlight: Promise<{ accessToken: string; expiresIn: number }> | null = null;

  refresh() {
    refreshInFlight ??= request<{ accessToken: string; expiresIn: number }>(
      "/api/auth/refresh", { method: "POST" },
    ).finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  },
```

*À noter :* cela corrige le symptôme côté client. La cause profonde — la rotation des refresh tokens n'a aucune fenêtre de tolérance, donc deux onglets légitimes se révoquent mutuellement — reste côté API et rejoint le constat Y-01 de l'audit de sécurité. Un correctif serveur durable consiste à accepter l'ancien jeton pendant quelques secondes après rotation plutôt que de révoquer immédiatement toute la famille.

---

### 3.4 — #4 · Budget sur une famille : agréger la descendance

Vérifié par appel API direct : les 6 budgets portent sur des catégories de **niveau 1**, les 19 transactions sur des catégories de **niveau 2**, `spent = 0` partout. `docs/PRODUCT_SCOPE.md:221` prévoit pourtant explicitement « appliquer les budgets aux familles **ou** aux postes ».

Dans `backend/src/routes/insights.ts`, la jointure `budgetProgress` (ligne ~157) doit matcher la catégorie **ou son parent** :

```ts
        .leftJoin(
          transactions,
          and(
            or(
              eq(transactions.categoryId, budgets.categoryId),
              sql`${transactions.categoryId} in (
                select c.id from ${categories} c
                where c.parent_id = ${budgets.categoryId} and c.tenant_id = ${auth.tenantId}
              )`,
            )!,
            eq(transactions.tenantId, auth.tenantId),
            eq(transactions.type, "EXPENSE"),
            isNull(transactions.deletedAt),
            gte(transactions.transactionDate, budgets.periodStart),
            lt(transactions.transactionDate, budgets.periodEnd),
          ),
        )
```

*Compromis :* si un utilisateur crée à la fois un budget « Alimentation » (famille) et un budget « Courses » (poste), la même dépense sera comptée dans les deux. C'est le comportement attendu d'un budget hiérarchique, mais il faut le dire dans l'interface — un simple libellé « inclut les postes rattachés » sous le montant du budget famille suffit.

*Solution de repli, purement front, si vous préférez ne pas toucher au SQL maintenant :* interdire la création d'un budget sur une famille dans `budgets-dashboard.tsx` en ne proposant que les catégories `level === 2`. Moins bon fonctionnellement, mais cela supprime immédiatement le « 0 % » mensonger.

---

### 3.5 — #5 · « 6 derniers mois » doit afficher 6 mois

Mesuré : l'API renvoie 14 buckets **journaliers** (`2026-08-01` → `2026-08-14`), le front en garde 6 et les étiquette « mois ».

**Front** — `src/lib/api.ts` transmet déjà la plage, il suffit de l'utiliser. Dans `saa-s-template.tsx`, `reloadFinance` :

```ts
      const now = new Date();
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (cashFlowPeriod - 1), 1));
      const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
      const [dashboardResponse, transactionResponse, categoryResponse] = await Promise.all([
        api.dashboard(accessToken, from.toISOString(), to.toISOString()),   // ← ajout des bornes
        api.transactions(accessToken, { limit: 40 }),
        api.categories(accessToken),
      ]);
```

(ajouter `cashFlowPeriod` aux dépendances du `useCallback`.)

Puis agréger par mois au lieu de tronquer (ligne 719) :

```ts
  const visibleCashFlow = useMemo(() => {
    if (!accessToken) return cashFlowData.slice(-cashFlowPeriod);
    if (!dashboardData) return [];
    const byMonth = new Map<string, { month: string; income: number; expenses: number }>();
    const fmt = new Intl.DateTimeFormat(language === "fr" ? "fr-FR" : "en-US", { month: "short", year: "2-digit" });
    for (const item of dashboardData.cashflow) {
      if (item.currency !== appCurrency) continue;
      const date = new Date(item.day);
      const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
      const bucket = byMonth.get(key) ?? { month: fmt.format(date), income: 0, expenses: 0 };
      bucket.income += Number(item.income);
      bucket.expenses += Number(item.expense);
      byMonth.set(key, bucket);
    }
    return [...byMonth.values()].slice(-cashFlowPeriod);
  }, [accessToken, appCurrency, cashFlowPeriod, dashboardData, language]);
```

*Attention :* `rangeSchema` côté API plafonne la plage à **370 jours** — 6 mois passent sans problème. En revanche `api.dashboard()` sert aussi les tuiles « du mois » : élargir la plage changerait `totals`. Deux options : appeler `/api/dashboard` deux fois (mois courant pour les tuiles, 6 mois pour le graphe), ou ajouter un paramètre `granularity` côté API. La première est immédiate, la seconde est plus propre.

---

### 3.6 — #6 · La flèche doit dire le sens, la couleur le sentiment

`StatCard` (ligne 623) fait porter à `positive` la double charge de la couleur **et** de la direction. Résultat mesuré : « Dépenses 808 000, ↙ 123 % » alors que les dépenses ont augmenté.

```tsx
function StatCard({
  label, value, change, icon,
  positive = true,      // sentiment : vert ou rouge
  rising = true,        // ← ajout — sens réel de la variation
  delay,
}: { label: string; value: string; change: string; icon: React.ReactNode; positive?: boolean; rising?: boolean; delay: string }) {
```

et dans le badge :

```tsx
          {rising ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          <span className="sr-only">{rising ? "en hausse de" : "en baisse de"}</span>
          {change}
```

Aux trois appels (lignes 927-929) :

```tsx
<StatCard … positive={incomeChange >= 0}  rising={incomeChange >= 0}  … />
<StatCard … positive={expenseChange <= 0} rising={expenseChange >= 0} … />
<StatCard … positive={savingsChange >= 0} rising={savingsChange >= 0} … />
```

Penser à importer `ArrowDownRight` depuis `lucide-react`. Le `sr-only` ajoute au passage l'information de sens pour les lecteurs d'écran, aujourd'hui absente (la flèche est purement décorative).

---

### 3.7 — #7 et #8 · Actions destructives : visibles, cohérentes, confirmées

Mesures sur iPhone 15 (393×852, `hasTouch`) : 5 boutons `aria-label="Archiver"` à `opacity: 0`, `15×15 px`, `pointer-events: auto`, `tabIndex ≥ 0`, dont 3 atteignables par un tap au centre. Idem pour « Supprimer » sur Transactions.

La sémantique est en outre inversée :

| Action | Icône | Libellé | Effet réel | Confirmation |
|---|---|---|---|---|
| Transaction | `Archive` | « Supprimer » | suppression logique (réversible) | **aucune** |
| **Budget** | `Archive` | « Archiver » | **`DELETE` définitif** | **aucune** |
| Compte | `Archive` | « Archiver » | archivage (réversible) | **aucune** |
| Projet | `Archive` | « Archiver » | archivage (réversible) | `window.confirm` |
| Taux perso | `Trash2` | « Supprimer » | archivage (réversible) | `window.confirm` |

La ligne la plus dangereuse est celle qui a le libellé le plus doux et aucun garde-fou.

**a) Visibilité sur pointeur grossier** — dans `src/index.css` :

```css
/* Une action révélée au survol doit rester visible là où le survol n'existe pas */
@media (hover: none), (pointer: coarse) {
  .group .opacity-0.group-hover\:opacity-100 {
    opacity: 1;
  }
}
```

Plus propre à terme : remplacer `opacity-0 group-hover:opacity-100` par `opacity-60 group-hover:opacity-100 focus-visible:opacity-100`, qui règle aussi le cas du clavier.

**b) Taille et zone de confort** — `budgets-dashboard.tsx:225`, `finance-pages.tsx:117` et `:149`, le bouton n'a aucune classe de dimension :

```tsx
className="yahro-touch-target grid size-11 place-items-center rounded-xl text-[var(--yahro-muted)] hover:bg-[#f4e9e5] hover:text-[#a95c4b] lg:size-9 dark:hover:bg-[#3b2925]"
```

**c) Confirmation systématique, et vocabulaire aligné.** Le projet dispose déjà de `src/components/ui/accessible-dialog.tsx` : l'utiliser pour toutes les actions destructives, avec la règle simple — **« Archiver » quand c'est réversible, « Supprimer » quand ça ne l'est pas**, et l'icône qui suit (`Archive` vs `Trash2`). Pour le budget, le plus sûr est de basculer l'API sur un archivage réversible (`archived_at`) plutôt que de garder un `DELETE`; à défaut, la confirmation devient obligatoire et le libellé doit devenir « Supprimer définitivement ».

**d) Filet de sécurité.** Pour la suppression d'une transaction, une bande « Opération supprimée — **Annuler** » pendant 6 secondes vaut mieux qu'une modale : c'est le geste le plus fréquent de l'app.

---

### 3.8 — #9 · Respecter `prefers-color-scheme`

Aucun `matchMedia` dans `src/`. Le thème part de `localStorage` et retombe sur `"light"` : un utilisateur en mode sombre reçoit une interface blanche.

`saa-s-template.tsx`, ligne 639 :

```ts
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "light";
    const stored = window.localStorage.getItem("yahro-theme");
    if (stored === "dark" || stored === "light") return stored;               // choix explicite prioritaire
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
```

Le même correctif est à appliquer dans `landing-page.tsx` (`toggleTheme` ligne 607) pour que la page publique suive la même règle.

Compléter dans `index.html` pour éviter le flash blanc au chargement :

```html
    <meta name="theme-color" content="#f7f7f4" media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content="#080a07" media="(prefers-color-scheme: dark)" />
```

*Compromis :* une préférence stockée doit continuer de primer sur le système — c'est ce que fait le code ci-dessus. Ne pas écrire dans `localStorage` au démarrage, uniquement sur clic du bouton, sinon la préférence système est figée dès la première visite.

---

### 3.9 — #10 · Cibles tactiles : viser le pointeur, pas la largeur

La règle actuelle (`index.css:104`) agrandit les cibles en dessous de 1024 px. Un iPad en paysage fait 1180 px : tactile, mais hors de la règle. Mesures à ce viewport : nav latérale `217×40`, icônes d'en-tête `40×40`, filtres `66×32`, « Archiver » `15×15`.

```css
/* Remplacer @media (max-width: 1023px) */
@media (pointer: coarse) {
  .yahro-touch-target {
    min-width: 48px;
    min-height: 48px;
  }
  /* la navigation latérale et les filtres passent aussi au format confortable */
  nav[aria-label="Main navigation"] > button,
  aside nav > button {
    min-height: 48px;
  }
}
```

Et retirer la classe `h-10` des boutons de nav (ligne 786) au profit de `min-h-10`, pour laisser la règle ci-dessus opérer sans conflit de spécificité.

Restent à traiter à la main les liens inline mesurés à 16 px de haut (« Conditions », « Confidentialité », « Voir tout », « Mot de passe oublié ? ») : leur ajouter `inline-flex min-h-11 items-center` suffit.

---

### 3.10 — #11 · Contrastes : revenir aux tokens

Les tokens du design system passent AA. Ce sont les valeurs écrites à la main qui échouent. Ratios calculés sur fond blanc :

| Couleur | Occurrences | Sur blanc | Sur `#f7f7f3` | Verdict |
|---|---|---|---|---|
| `--yahro-muted` `#686a62` | token | **5,49** | 5,11 | ✅ |
| `--yahro-subtle` `#707269` | token | 4,88 | 4,55 | ✅ (4,47 sur `#f5f5f1` — limite) |
| `#92948c` | 11 | **3,07** | 2,86 | ❌ |
| `#85877f` | 15 | **3,64** | 3,39 | ❌ |
| `#7c7e76` | 1 | 4,12 | 3,83 | ❌ |
| `#769450` (vert de marque, en texte) | 25 | **3,43** | 3,19 | ❌ |
| `#7c9a51` | 8 | **3,18** | 2,96 | ❌ |
| `#789850` | 3 | 3,28 | 3,05 | ❌ |

Deux passes mécaniques :

```bash
# 1. les gris hors token deviennent le token
cd src && grep -rl '#92948c\|#85877f\|#7c7e76' . \
  | xargs sed -i 's/text-\[#92948c\]/text-[var(--yahro-muted)]/g; s/text-\[#85877f\]/text-[var(--yahro-muted)]/g; s/text-\[#7c7e76\]/text-[var(--yahro-muted)]/g'
```

Pour le vert, il faut **deux** valeurs distinctes : la teinte de marque reste `#769450` pour les aplats, les icônes et les bordures (3:1 suffit pour un élément non textuel), et une variante assombrie sert au **texte**. Ajouter dans `index.css` :

```css
:root {
  --yahro-accent: #769450;        /* aplats, icônes, bordures — inchangé */
  --yahro-accent-text: #4f6b30;   /* texte sur fond clair — 6,1:1 */
}
.dark {
  --yahro-accent-text: #b8d793;   /* texte sur fond sombre */
}
```

puis remplacer `text-[#7c9a51]`, `text-[#769450]`, `text-[#789850]` par `text-[var(--yahro-accent-text)]`. Les libellés concernés sont les suréminences (« VUE D'ENSEMBLE », « SUIVI MANUEL », « HISTORIQUE DÉCLARÉ »), « Visible uniquement par vous » et « Erreur 404 ».

*Compromis :* `#4f6b30` est visiblement plus sombre que la teinte de marque. C'est inévitable — aucun vert à 3,4:1 ne peut servir de texte courant. La marque reste intacte partout où elle n'est pas du texte.

---

### 3.11 — #12 · Téléphone en paysage

Mesuré à 667×375 : en-tête 70 px + barre basse 64 px = 36 % de la hauteur, et la barre translucide recouvre le montant du solde, qui se lit à travers le flou.

```css
/* index.css */
@media (max-height: 460px) and (orientation: landscape) {
  header { height: 52px; }
  nav[aria-label="Navigation mobile"],
  nav[aria-label="Mobile navigation"] {
    min-height: 52px;
  }
  /* les libellés disparaissent, les icônes restent */
  nav[aria-label="Navigation mobile"] button span,
  nav[aria-label="Mobile navigation"] button span { display: none; }
  /* fond pleinement opaque : le flou ne suffit pas à isoler du contenu */
  nav[aria-label="Navigation mobile"],
  nav[aria-label="Mobile navigation"] { background-color: #ffffff; }
}
.dark nav[aria-label="Navigation mobile"] { background-color: #20211d; }
```

Le point le plus important est l'opacité : `bg-white/95` + `backdrop-blur-xl` laisse transparaître les gros chiffres. Sur une barre qui recouvre un solde bancaire, il faut un fond opaque.

---

### 3.12 — #15 · Champ montant adapté à la devise

Le XOF et le XAF n'ont pas de subdivision. Le champ propose pourtant `step="0.01"` et un placeholder `0,00`, et `type="number"` sans `inputmode` refuse la virgule dans plusieurs navigateurs en locale française.

Dans `AddTransactionModal` (`saa-s-template.tsx`, ~ligne 500) :

```tsx
const zeroDecimalCurrencies = new Set(["XOF", "XAF", "JPY", "GNF", "CDF"]);
const decimals = zeroDecimalCurrencies.has(currency) ? 0 : 2;

<input
  type="text"
  inputMode="decimal"
  pattern="[0-9]*[.,]?[0-9]*"
  step={decimals === 0 ? "1" : "0.01"}
  placeholder={decimals === 0 ? "0" : "0,00"}
  value={amount}
  onChange={(event) => setAmount(event.target.value.replace(",", "."))}
  className="field"
/>
```

`type="text"` + `inputMode="decimal"` affiche le bon pavé numérique sur iOS et Android tout en acceptant la virgule française, ce que `type="number"` ne fait pas de façon fiable.

---

## 4. Quick wins

Cinq corrections, meilleur rapport impact/effort, environ **une journée au total**.

| # | Action | Effort | Gain |
|---|---|---|---|
| 1 | **§3.1(c)** — trois conditions `!accessToken \|\| !dashboardData` → `!accessToken`, plus retour neutre. **~10 lignes** | 30 min | Supprime immédiatement le solde inventé, le défaut le plus coûteux du produit |
| 2 | **§3.3** — promesse partagée sur `api.refresh()`. **6 lignes** | 15 min | Débloque votre propre `npm run dev`, où la session ne se restaure jamais |
| 3 | **§3.6** — prop `rising` sur `StatCard`. **5 lignes** | 20 min | Corrige un chiffre qui dit le contraire de la réalité sur l'écran d'accueil |
| 4 | **§3.10** — `sed` sur les 27 gris hors token + variable `--yahro-accent-text` | 1 h | Passe la majorité des échecs AA, sans toucher au design |
| 5 | **§3.8** — lecture de `prefers-color-scheme`. **4 lignes** | 15 min | Un utilisateur en mode sombre cesse de recevoir une page blanche |

---

## 5. Dettes structurelles

**Tokens de design contournés.** Le système existe (`--yahro-surface`, `--yahro-muted`, `--yahro-border`, `--yahro-accent`…) et il est bon — mais il est court-circuité partout par des valeurs arbitraires Tailwind. Relevé sur `src/` : **25** `#769450`, **15** `#85877f`, **11** `#92948c`, **8** `#7c9a51`, sans compter les dizaines de `#e1e1dc`, `#f0f1eb`, `#20211d` qui dupliquent `--yahro-border`, `--yahro-canvas` et `--yahro-text`. Tant que ces littéraux subsistent, chaque correction de contraste ou de thème devra être refaite à la main. Étendre le thème dans `@theme` de Tailwind v4 et interdire les couleurs littérales par une règle ESLint est le seul moyen de tenir la ligne.

**Quatre implémentations du formatage monétaire.** `formatCurrency` dans `saa-s-template.tsx:305` (`minimumFractionDigits: value % 1 === 0 ? 0 : 2`), `formatMoney` dans `budgets-dashboard.tsx:24`, dans `finance-pages.tsx:33` et dans `projects-dashboard.tsx` (`maximumFractionDigits: 2`). Elles divergent déjà sur les décimales et divergeront davantage. À rassembler dans `src/lib/currencies.ts`, avec la connaissance des devises sans subdivision (§3.12) — c'est aussi là que se règle #16.

**Un composant de 62 Ko.** `saa-s-template.tsx` fait **1 100 lignes** et contient le shell, la navigation, les cartes de statistiques, le graphe, la modale d'ajout, l'éditeur de profil et le panneau de notifications. C'est ce qui rend un correctif de 10 lignes risqué. Extraire au minimum `AddTransactionModal`, `StatCard`, `ProfileEditor` et le shell de navigation dans des fichiers dédiés.

**Deux mécanismes de confirmation.** `window.confirm()` natif dans `projects-dashboard.tsx` et `currency-tools.tsx`, `accessible-dialog.tsx` maison partout ailleurs — et rien du tout sur les actions les plus destructrices. Un seul composant `<ConfirmDialog>` doit servir de passage obligé.

**Deux jeux de données de démonstration mêlés au code de production.** `budgetCategories`, `cashFlowData` et les transactions factices vivent dans le même fichier que le rendu réel, et c'est précisément ce qui produit le défaut #1. À isoler dans `src/lib/demo-data.ts`, importé uniquement par la branche démo.

**Breakpoints hétérogènes.** Le projet mélange les échelles Tailwind (`sm:`, `lg:`, `xl:`) et des seuils sur mesure (`min-[1340px]:` dans `landing-page.tsx`, `max-width: 1023px` et `max-height: 760px` dans `index.css`). Le tableau de bord bascule en tiroir à 1024 px, la landing à 1340 px : deux définitions du « mobile » dans la même app. À unifier, et surtout à découpler de la question tactile (§3.9), qui relève de `pointer`, pas de la largeur.

**Aucun test de rendu.** Rien n'aurait empêché « 6 derniers mois = 6 jours » ni le solde de démo d'atteindre la production. Trois tests Playwright — le dashboard connecté n'affiche jamais `14 963`, l'axe du graphe contient bien 6 mois distincts, un budget famille consomme les dépenses de ses postes — auraient couvert les trois défauts les plus graves de cet audit.

---

## 6. Ce que j'ai vérifié et qui va bien

À signaler, parce que ces points sont souvent défaillants et qu'ici ils ne le sont pas :

- **Aucun scroll horizontal** sur les 10 viewports, en clair comme en sombre, sur les 15 écrans. Le seul élément dépassant est un halo décoratif `pointer-events-none`.
- **CLS entre 0 et 0,006** partout (seuil « bon » : 0,1).
- **Zoom 125 % et 200 %** : aucun débordement, mise en page intacte.
- **Modale conforme** : `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, focus déplacé à l'intérieur, 20 éléments focusables piégés, Échap ferme.
- **Anneaux de focus présents sur les 26 arrêts de tabulation** testés.
- **Champs à 16 px sur mobile** (`[role="dialog"] input { font-size: 16px }`) : pas de zoom involontaire sur iOS.
- **`env(safe-area-inset-bottom)`** correctement appliqué à la barre basse et au CTA collant de la landing.
- **Aucune troncature brutale** : partout `text-overflow: ellipsis` avec `min-w-0` sur les conteneurs flex.
- **La barre fixe ne masque rien** : `padding-bottom: 112px` sur le conteneur principal, le dernier bloc s'arrête 57 px au-dessus de la barre.
- **États vides et squelettes** présents sur Comptes, Transactions, Budgets et Projets.
- **Console propre** : aucune erreur JS, aucune ressource 404 sur l'ensemble de la campagne. Le seul `401` observé en session déconnectée est le `/api/auth/refresh` attendu.

**Deux hypothèses que j'ai formulées et qui se sont révélées fausses** — je les signale pour que vous sachiez qu'elles ont été testées et écartées : *(a)* j'ai d'abord mesuré 15 arrêts de tabulation « sans anneau de focus », avant de comprendre que `transition-all` anime `outline-width` sur 150 ms et que je mesurais trop tôt ; après stabilisation, **0 arrêt sans focus visible**. *(b)* j'ai cru à deux chaînes de devise différentes (« FCFA » / « F CFA ») ; l'inspection des codepoints montre une chaîne unique `F CFA`, dont l'espace fine est écrasée par `letter-spacing: -1.088px` sur les gros montants — le défaut est réel mais la cause est typographique, pas textuelle (#16).

---

## 7. Points à trancher avec vous

1. **`<input type="date">` affiche `08/20/2026`** dans mon environnement. Le format de ce champ suit la locale du **navigateur/OS**, pas celle de la page — je ne peux pas conclure que vous voyez le format américain sur votre machine. Si c'est le cas chez vos utilisateurs, il faudra un sélecteur de date maison. **Confirmez-vous le format affiché chez vous ?**
2. **Safari iOS et Firefox non testés** (moteurs non installables ici). Trois points méritent une vérification manuelle : le rendu de `backdrop-blur-xl` sur la barre basse, `min-height: 100dvh` avec la barre d'adresse dynamique, et le comportement du clavier virtuel dans la modale d'ajout.
3. **La maquette du héros** (§#13) est-elle un placeholder assumé avant les vraies captures produit, ou destinée à rester ? Cela change l'effort : traduire, ou remplacer par une capture réelle en FCFA.
4. **Budget famille** (§3.4) : préférez-vous l'agrégation hiérarchique côté API, ou interdire les budgets sur les familles ? La première respecte `PRODUCT_SCOPE.md:221`, la seconde se fait en 10 minutes côté front.

---

*Audit réalisé le 20 août 2026 sur le build de production, stack complète en fonctionnement, 366 captures et mesures automatisées. Chaque constat cite l'écran, le viewport et la mesure qui le fonde.*

---

### Note en marge, hors périmètre UI

En montant la stack, j'ai dû rendre `yahro_owner` **SUPERUSER** pour que l'inscription fonctionne. Avec un `yahro_owner` non-superuser, `private.current_membership_role` (SECURITY DEFINER) interroge `public.memberships`, qui est en `FORCE ROW LEVEL SECURITY` ; la politique `memberships_select` rappelle cette même fonction, et PostgreSQL s'arrête sur `stack depth limit exceeded`. Votre `docker-compose.yml` masque le problème parce que l'image `postgres` crée `POSTGRES_USER` en superuser. Conséquence : **le modèle de sécurité dépend aujourd'hui d'un superuser**, ce qui le rend inopérant sur un PostgreSQL managé (RDS, Azure, Neon, Supabase), où ce privilège n'existe pas. À traiter avant tout déploiement hors Docker local.
