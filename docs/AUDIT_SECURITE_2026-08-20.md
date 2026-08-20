# Audit de sécurité boîte blanche — Yahro

**Périmètre** : `Gestion Budget/` (frontend React/Vite + API Fastify/Drizzle/PostgreSQL 17), état du 20 août 2026.
**Référentiels** : OWASP Top 10 (2021), OWASP API Security Top 10 (2023), OWASP ASVS L2, CWE Top 25.
**Méthode** : lecture exhaustive de `backend/src/**`, `backend/migrations/**`, `src/**`, configuration Docker/npm/env. Aucun test dynamique (voir §5).
**Exclus de l'analyse** : `node_modules/`, `dist/`, `backend/dist/` (artefacts de build), `src/components/ui/saa-s-template.tsx` et `landing-page.tsx` lus en survol (aucun sink XSS détecté par recherche systématique).

---

## 1. Synthèse exécutive

Yahro est, de loin, la base de code la plus disciplinée que l'on rencontre à ce stade de maturité : isolation multi-espace à trois niveaux réellement implémentée (filtre applicatif + clés étrangères composites + RLS `FORCE` avec rôle PostgreSQL `NOBYPASSRLS`), Argon2id, rotation de refresh tokens avec détection de réutilisation, MFA TOTP chiffrée en AES-256-GCM, validation Zod `.strict()` sur **chaque** route, verrouillage optimiste, audit append-only, aucune injection SQL exploitable, aucun sink XSS. Je n'ai trouvé **aucune faille d'isolation inter-tenant ni aucun IDOR exploitable** dans le build actuel — c'est rare et c'est à souligner.

Les vrais risques sont ailleurs : dans la **couche périmétrique** (rate limiting contournable ou auto-DoS selon la configuration du proxy, aucune limitation par compte), dans la **chaîne d'approvisionnement** (100 % des dépendances en `"latest"`), dans la **gestion des secrets** (`.env` réels synchronisés vers OneDrive/ENSEA), et dans une **faille structurelle latente** de révocation de session qui ne se déclenchera qu'à l'ouverture des espaces partagés — c'est-à-dire à la phase 3 déjà planifiée.

**Note de risque global : 6,5 / 10** (10 = excellent). Fondations solides, périmètre et cycle de vie à durcir avant toute ouverture publique.

**Les trois choses à corriger avant tout le reste**
1. **Y-02** — `TRUST_PROXY` booléen : soit les limites d'authentification sont contournables via `X-Forwarded-For`, soit elles s'appliquent globalement et créent un déni de service. Il n'existe aucune configuration correcte du paramètre actuel derrière le reverse proxy exigé par `SECURITY.md`.
3. **Y-01** — La révocation de session (reset, changement de mot de passe, `logout-all`, désactivation MFA) est filtrée par RLS sur un seul espace. Non exploitable aujourd'hui, garanti exploitable dès la première invitation.
2. **Y-06** — Les secrets réels (`JWT_SECRET`, `TOKEN_HASH_PEPPER`, `MFA_ENCRYPTION_KEY`, deux mots de passe PostgreSQL) sont dans un dossier synchronisé OneDrive. Ils doivent être considérés comme brûlés et tournés.

---

## 2. Phase 0 — Cartographie

### 2.1 Points d'entrée

**Non authentifiés (7)**

| Méthode | Route | Limite dédiée | Contrôles |
|---|---|---|---|
| GET | `/health/live`, `/health/ready` | — (global 120/min) | aucun |
| POST | `/api/auth/register` | 5 / 15 min / IP | Zod strict, réponse 202 uniforme |
| POST | `/api/auth/login` | 5 / 15 min / IP | Argon2id + `dummyHash` anti-timing |
| POST | `/api/auth/mfa/verify` | 5 / 15 min / IP | challenge 5 min, 5 tentatives max |
| POST | `/api/auth/refresh` | — | cookie + `assertTrustedOrigin` |
| POST | `/api/auth/logout` | — | cookie + `assertTrustedOrigin` |
| POST | `/api/auth/verify-email` | — | jeton opaque 32 o, HMAC-SHA256 peppered |
| POST | `/api/auth/reset-password` | — | idem, à usage unique |
| POST | `/api/auth/request-password-reset` | 3 / 30 min / IP | réponse 202 uniforme |
| POST | `/api/auth/resend-verification` | 3 / 30 min / IP | réponse 202 uniforme |

**Authentifiés — compte (9)** : `GET/PATCH /api/auth/me`, `POST /api/auth/change-password`, `GET/DELETE /api/auth/sessions[/:id]`, `POST /api/auth/logout-all`, `GET /api/auth/mfa`, `POST /api/auth/mfa/setup|confirm|disable`.

**Authentifiés — métier (30)** : `accounts` (4), `categories` (4), `category-details` (4), `transactions` (4), `budgets` (4), `projects` (4), `projects/:id/expenses` (4), `currencies/convert` + `custom-rates` (4), `dashboard`, `notifications` (3), `audit-log`, `exports/transactions.csv`, `imports/preview`, `imports/commit`.

**Uploads** : `POST /api/imports/preview` et `/api/imports/commit` — multipart, 1 fichier, 5 Mo, 10 000 lignes, type réel vérifié (`file-type`), UTF-8 strict, rejet des octets nuls.

**Appels sortants (1)** : `https://data-api.ecb.europa.eu/service/data/EXR/...` — URL constante en dur (`currencies.ts:44`), timeout 8 s. **Aucune URL fournie par l'utilisateur n'est jamais fetchée → surface SSRF nulle.**

**Webhooks entrants / jobs planifiés / files** : **aucun**. Pas de Stripe, pas de facturation, pas de worker. Les domaines 10 (facturation) et 9 (SSRF) sont donc quasi vides — ce qui est une bonne nouvelle, mais aussi la raison pour laquelle ils n'apparaissent pas dans les constats.

### 2.2 Matrice des rôles

`VIEWER (1) < MEMBER (2) < ADMIN (3) < OWNER (4)` — `security/authorization.ts:4-18`.

| Opération | Rôle minimum | Vérifié où |
|---|---|---|
| Lecture comptes/transactions/budgets/catégories/dashboard/notifications | authentifié | RLS tenant |
| Création & modification comptes, transactions, budgets, catégories, détails, projets, dépenses projet, taux personnalisés, imports | `MEMBER` | `requireRole` + RLS |
| Archivage d'un compte | `ADMIN` | `finance.ts:204` |
| Lecture du journal d'audit | `ADMIN` | `insights.ts:253` |
| Suppression d'un budget | `MEMBER` | `finance.ts:669` — **incohérent** avec l'archivage de compte (ADMIN) |
| Changement de rôle, invitation, transfert de propriété | — | **non implémenté** |

**Point clé vérifié** : la RLS n'encode **pas** le rôle (`USING (tenant_id = current_tenant_id() AND current_membership_role(tenant_id) IS NOT NULL)`), donc un `VIEWER` passerait la RLS en écriture. La seule barrière est `requireRole` côté applicatif. J'ai vérifié une par une : **les 24 routes mutantes appellent toutes `requireRole`**, aucune n'est oubliée. Le contrôle tient, mais il repose sur une seule couche là où le reste du système en a trois.

**Point clé vérifié** : le rôle du JWT n'est jamais utilisé pour autoriser. `createAuthGuard` relit `memberships.role` en base à chaque requête (`authentication.ts:31-46`) → une rétrogradation ou une exclusion prend effet immédiatement. Excellent.

### 2.3 Trajet des données sensibles

| Donnée | Entrée | Stockage | Sortie |
|---|---|---|---|
| Mot de passe | POST JSON, `passwordSchema` (12–128) | `users.password_hash` Argon2id (19 MiB, t=2, p=1) | jamais |
| Confirmation de mot de passe | POST JSON | **jamais persistée** (comparaison Zod `.refine`) | jamais |
| Access token | — | mémoire navigateur (state React) | header `Authorization` |
| Refresh token | cookie | `refresh_sessions.token_hash` = HMAC-SHA256(pepper) | cookie `HttpOnly` / `SameSite=Strict` / `__Host-` en prod |
| Secret TOTP | généré serveur | `users.totp_secret_encrypted` AES-256-GCM + AAD `yahro:totp:v1` | une seule fois, à `mfa/setup` |
| Codes de récupération | générés serveur | `mfa_recovery_codes.code_hash` HMAC-SHA256 | une seule fois, à `mfa/confirm` |
| Jetons email/reset | générés serveur | `one_time_tokens.token_hash` HMAC | **URL de l'email** (voir Y-07) |
| Adresse IP | header | `ip_hash` = HMAC-SHA256(pepper) — pseudonymisée | jamais |
| Montants, soldes | POST JSON, `moneySchema` | `numeric(19,4)` | JSON + CSV échappé |
| Notes / descriptions | POST JSON | `text` / `varchar` | JSON + CSV échappé anti-formule |

### 2.4 Ce qui manque pour auditer complètement

- **Aucun test d'intégration HTTP** ni test négatif inter-tenant automatisé. Les 12 tests de `tests/security.test.ts` sont excellents mais purement unitaires (crypto, TOTP, parsing, rôles). L'affirmation de `SECURITY.md` ligne 40 (« un test réel a confirmé... ») n'est pas reproductible depuis le dépôt.
- **Aucune configuration de production** : pas de Dockerfile applicatif, pas d'IaC, pas de manifeste de déploiement, pas de configuration de reverse proxy, pas de pipeline CI. Les domaines 14 (infrastructure/CI-CD) et une partie du 12 (en-têtes servis au navigateur) sont donc **non auditables depuis le code** — voir §5.
- **Fonctionnalités promises mais absentes** : invitations, changement de rôle, transfert de propriété, changement d'email (le `purpose = 'CHANGE_EMAIL'` existe dans la contrainte SQL `0001:79` mais aucune route ne l'utilise), suppression de compte, export RGPD, notifications automatiques, transactions récurrentes.

---

## 3. Tableau récapitulatif

| ID | Titre | Domaine | Sévérité (CVSS 3.1) | Fichier:ligne | Confiance |
|---|---|---|---|---|---|
| **Y-01** | Révocation de session incomplète en multi-espace | 1, 2 | **Moyenne 6,8** `AV:N/AC:H/PR:L/UI:N/S:U/C:H/I:H/A:N` | `routes/auth.ts:814-817, 1009-1012, 1145-1148, 1209-1212` ; `migrations/0001:327-329` | **Confirmé** (latent) |
| **Y-02** | Rate limiting contournable ou auto-DoS via `TRUST_PROXY` | 11 | **Élevée 7,5** `AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N` | `app.ts:22,100` ; `config.ts:34` | **Confirmé** |
| **Y-03** | Aucune limitation ni verrouillage par compte | 2, 11 | **Moyenne 5,9** `AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N` | absence — `routes/auth.ts:562-606` | **Confirmé** |
| **Y-04** | Amplification du fournisseur de taux (stampede + épuisement du pool) | 11, 1 | **Moyenne 6,5** `AV:N/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:H` | `routes/currencies.ts:107-115, 54-88` | **Confirmé** |
| **Y-05** | 100 % des dépendances en `"latest"` | 6 | **Élevée 8,3** `AV:N/AC:H/PR:N/UI:R/S:C/C:H/I:H/A:H` | `package.json:14-39` ; `backend/package.json:21-49` | **Confirmé** |
| **Y-06** | Secrets réels dans un dossier synchronisé OneDrive | 5 | **Élevée 8,7** `AV:L/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H` (contexte dev) | `backend/.env:6,9,12,13,15` ; `.env:4,5` | **Confirmé** |
| **Y-07** | Jeton de réinitialisation en URL, aucun en-tête de sécurité côté SPA | 12, 2 | **Moyenne 5,3** `AV:N/AC:H/PR:N/UI:R/S:U/C:H/I:N/A:N` | `src/App.tsx:16-18` ; `services/email.ts:63` ; `index.html` | **Confirmé** |
| **Y-08** | RGPD : export, suppression, rétention et registre absents | 15 | **Réglementaire** (non exploitable) | absence — `docs/PRODUCT_SCOPE.md:34-35` | **Confirmé** |
| **Y-09** | Énumération de comptes par canal temporel à l'inscription | 2 | Faible 5,3 `AV:N/AC:L/PR:N/UI:N/C:L/I:N/A:N` | `routes/auth.ts:459-465` vs `467-558` | **À vérifier** (dynamique) |
| **Y-10** | Export CSV non borné, sans réauthentification ni limite | 11, 15 | Faible 4,3 `AV:N/AC:L/PR:L/UI:N/C:N/I:N/A:L` | `routes/insights.ts:274-309` | **Probable** |
| **Y-11** | Endpoints d'import non limités individuellement | 11 | Faible 4,3 `AV:N/AC:L/PR:L/UI:N/C:N/I:N/A:L` | `routes/imports.ts:173,228` | **Probable** |
| **Y-12** | Table de taux partagée entre tenants sans RLS | 1 | Faible 4,3 `AV:N/AC:H/PR:L/UI:N/C:N/I:L/A:L` | `migrations/0004:66-77, 225` | **Confirmé** (impact faible) |
| **Y-13** | Store de rate limiting en mémoire | 11 | Faible | `app.ts:95-102` | **Confirmé** |
| **Y-14** | Réutilisation du pepper comme secret cookie ; `COOKIE_DOMAIN` mort | 5, 12 | Informatif | `app.ts:94` ; `config.ts:83` vs `auth.ts:233-241` | **Confirmé** |

**Faux positifs écartés après vérification** (je les liste pour que vous sachiez qu'ils ont été regardés) : injection SQL (tout est paramétré, y compris les `sql\`\`` de Drizzle) ; XSS (aucun `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`) ; mass assignment (les 31 schémas Zod sont `.strict()`, testé en unitaire ligne 147-148) ; prototype pollution sur `imports.ts:75` (affectation directe de chaîne, non exploitable) ; `alg=none` (`algorithms: ["HS512"]` explicite, `tokens.ts:41`) ; CORS joker (interdit par `config.ts:48-50` et testé) ; CSRF sur les routes métier (Bearer, pas de cookie) ; jeton en `localStorage` (absent) ; path traversal sur les noms de fichiers importés (`path.basename` + filtrage de contrôle, `imports.ts:52-60`) ; injection de formule CSV à l'export (neutralisée, `insights.ts:45`).

---

## 4. Fiches détaillées

---

### Y-01 — Révocation de session incomplète en multi-espace

**Domaine** : 1 (isolation) + 2 (sessions) · **CWE-613** (Insufficient Session Expiration), **CWE-863** (Incorrect Authorization) · **OWASP A07:2021**, **API2:2023** · **Confiance : confirmé dans le code, latent dans le build actuel**

#### Cause racine

Deux décisions correctes prises séparément produisent ensemble un trou. D'un côté, la politique RLS des sessions est scopée par espace :

```sql
-- backend/migrations/0001_secure_foundation.sql:327-329
CREATE POLICY refresh_sessions_scope ON public.refresh_sessions
  USING (tenant_id = private.current_tenant_id() AND user_id = private.current_user_id() AND ...)
  WITH CHECK (tenant_id = private.current_tenant_id() AND user_id = private.current_user_id() AND ...);
```

De l'autre, les quatre opérations de révocation globale filtrent uniquement sur `user_id`, en s'appuyant implicitement sur le fait que la requête « touche toutes les sessions de l'utilisateur » :

```ts
// backend/src/routes/auth.ts:803-817  (reset-password)
await database.withSecurityContext({ userId: record.userId, tenantId: record.tenantId }, async (transaction) => {
  ...
  await transaction
    .update(users)
    .set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, record.userId));
  await transaction
    .update(refreshSessions)
    .set({ revokedAt: new Date(), revokeReason: "PASSWORD_RESET" })
    .where(and(eq(refreshSessions.userId, record.userId), isNull(refreshSessions.revokedAt)));   // ← RLS ajoute AND tenant_id = record.tenantId
```

Le `UPDATE` est silencieusement réduit par la RLS aux sessions du **seul** espace placé dans le contexte. Les sessions des autres espaces de l'utilisateur survivent.

Le garde-fou attendu — `session_version` — ne rattrape pas le coup, parce que **la table `refresh_sessions` ne porte pas de `session_version` et que la route de rafraîchissement ne la compare à rien** :

```ts
// backend/src/routes/auth.ts:695-701
const accessToken = await tokens.signAccessToken({
  userId: session.userId,
  tenantId: session.tenantId,
  role: session.role,
  sessionId: nextSessionId,
  sessionVersion: session.sessionVersion,   // ← valeur COURANTE lue dans users, jamais comparée à celle d'émission
});
```

`session_version` n'invalide donc que les access tokens déjà émis (15 min de durée de vie), jamais les refresh tokens. La révocation des refresh tokens repose entièrement sur `revoked_at`, qui vient d'être scopé par la RLS.

Les quatre points affectés, identiques dans leur forme : `reset-password` (`auth.ts:814-817`), `mfa/disable` (`auth.ts:1009-1012`), `change-password` (`auth.ts:1145-1148`), `logout-all` (`auth.ts:1209-1212`). Et `GET /api/auth/sessions` (`auth.ts:1163-1178`) étant lui aussi scopé, **l'utilisateur ne voit même pas la session résiduelle et ne peut pas la révoquer manuellement.**

#### Scénario d'exploitation

Prérequis : la victime appartient à ≥ 2 espaces (fonctionnalité « espaces familiaux / invitations », phase 3 de `PRODUCT_SCOPE.md:41-47`).

1. L'attaquant obtient un refresh token de la victime — vol de cookie sur un poste partagé, machine compromise, session laissée ouverte chez un tiers. Le cookie est valable 30 jours (`REFRESH_TOKEN_TTL_SECONDS=2592000`).
2. Le refresh token pointe vers `session_id` X, lié à `tenant_id` = **Espace B** (l'espace familial partagé, celui auquel la victime s'est jointe en second).
3. La victime détecte l'incident, ou reçoit simplement l'email « MFA activée » et réagit. Elle fait ce que l'application lui dit de faire : elle change son mot de passe, puis clique « Déconnecter toutes les sessions ».
4. Les deux opérations s'exécutent sous `withSecurityContext({ userId, tenantId: auth.tenantId })`, où `auth.tenantId` est l'espace **A** (son espace personnel, celui dans lequel elle est connectée). La RLS restreint le `UPDATE` à l'espace A. La session X de l'espace B reste `revoked_at IS NULL`.
5. La victime consulte `GET /api/auth/sessions` pour vérifier. Elle voit une liste propre — la session X n'y figure pas, la requête étant elle aussi scopée sur l'espace A.
6. L'attaquant appelle `POST /api/auth/refresh` avec son cookie. `private.lookup_refresh_session` est `SECURITY DEFINER` et ignore la RLS : elle retourne la session X, non révoquée, non expirée, avec `session_version` = la **nouvelle** valeur. Le token est roulé, un access token frais est émis avec la bonne `sv`.
7. `createAuthGuard` valide sans broncher. L'attaquant a un accès complet et durable à l'espace B — comptes, transactions, budgets, exports CSV — après un changement de mot de passe et un « déconnecter partout ».

#### Impact métier

C'est le pire scénario possible pour une application financière : le geste de remédiation que l'utilisateur exécute en confiance ne remédie à rien, et l'interface lui affiche activement une fausse confirmation (« Votre mot de passe a ete modifie. Toutes les anciennes sessions sont fermees. », `account-action-page.tsx:42`). L'espace persistant est précisément l'espace **partagé**, donc l'accès résiduel expose aussi les données financières des autres membres du foyer. En cas de litige, la promesse écrite dans `SECURITY.md:13` (« invalidation de toutes les sessions apres changement de mot de passe ») serait tenue pour un engagement non respecté.

**Exploitabilité aujourd'hui : nulle.** J'ai vérifié : la seule insertion dans `memberships` est celle de l'inscription (`auth.ts:498`), aucune route ne crée d'invitation, donc chaque utilisateur a exactement une appartenance et le `UPDATE` scopé couvre 100 % de ses sessions. La faille s'arme à la première ligne de code d'invitation.

#### Correctif

Deux verrous, parce qu'un seul ne suffit pas.

**1) Révoquer hors RLS, via une fonction `SECURITY DEFINER` dédiée** (nouvelle migration `0007`) :

```sql
-- backend/migrations/0007_session_revocation.sql
CREATE FUNCTION private.revoke_all_user_sessions(p_user_id uuid, p_reason varchar(80))
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
  WITH revoked AS (
    UPDATE public.refresh_sessions
    SET revoked_at = now(), revoke_reason = p_reason
    WHERE user_id = p_user_id AND revoked_at IS NULL
    RETURNING 1
  )
  SELECT count(*)::integer FROM revoked
$function$;

REVOKE ALL ON FUNCTION private.revoke_all_user_sessions(uuid, varchar) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.revoke_all_user_sessions(uuid, varchar) TO yahro_app;
```

Puis, aux quatre emplacements, remplacer le `transaction.update(refreshSessions)...` par :

```ts
// backend/src/routes/auth.ts — reset-password, ligne 814-817
await transaction.execute(
  sql`select private.revoke_all_user_sessions(${record.userId}::uuid, 'PASSWORD_RESET')`,
);
```

et de même avec `'MFA_DISABLED'` (l.1009), `'PASSWORD_CHANGED'` (l.1145), `'LOGOUT_ALL'` (l.1209), en utilisant `auth.userId` pour les trois dernières. L'appel reste dans la même transaction, donc l'atomicité est préservée.

**2) Lier le refresh token à la version de session** — c'est le verrou qui protège même si quelqu'un réintroduit un jour un `UPDATE` scopé :

```sql
-- suite de 0007
ALTER TABLE public.refresh_sessions
  ADD COLUMN session_version integer NOT NULL DEFAULT 1 CHECK (session_version > 0);

DROP FUNCTION private.lookup_refresh_session(uuid);
CREATE FUNCTION private.lookup_refresh_session(p_id uuid)
RETURNS TABLE (
  id uuid, family_id uuid, user_id uuid, tenant_id uuid, token_hash varchar,
  expires_at timestamptz, revoked_at timestamptz,
  session_version integer, issued_session_version integer,
  status public.user_status, role public.membership_role
)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = pg_catalog, public
AS $function$
  SELECT s.id, s.family_id, s.user_id, s.tenant_id, s.token_hash, s.expires_at, s.revoked_at,
         u.session_version, s.session_version, u.status, m.role
  FROM public.refresh_sessions s
  JOIN public.users u ON u.id = s.user_id
  JOIN public.memberships m ON m.user_id = s.user_id AND m.tenant_id = s.tenant_id
  WHERE s.id = p_id
  LIMIT 1
$function$;
```

Côté API, écrire la version à l'émission (`issueSession`, `auth.ts:421-430`, et la rotation `auth.ts:683-692`) :

```ts
await transaction.insert(refreshSessions).values({
  id: sessionId,
  familyId,
  userId: user.id,
  tenantId: user.tenantId,
  sessionVersion: user.sessionVersion,   // ← ajout
  tokenHash: hashToken(secret, config.tokenHashPepper),
  ...
});
```

et refuser à la rotation (`auth.ts:667`) :

```ts
if (
  session.expiresAt <= new Date() ||
  session.status !== "ACTIVE" ||
  session.issuedSessionVersion !== session.sessionVersion   // ← ajout
) {
  clearRefreshCookie(reply, config);
  throw unauthorized();
}
```

**3) Rendre la liste des sessions honnête** — `GET /api/auth/sessions` doit lister toutes les sessions de l'utilisateur, pas celles d'un espace. Même approche : une fonction `private.list_user_sessions(uuid)` en `SECURITY DEFINER` qui ne retourne que `id`, `created_at`, `last_used_at`, `expires_at`, `tenant_id` — et `DELETE /api/auth/sessions/:id` doit vérifier `user_id` en `SECURITY DEFINER` plutôt que via la RLS.

**Compromis à signaler** : chaque fonction `SECURITY DEFINER` ajoutée est un contournement de RLS de plus. Celles-ci sont sûres parce qu'elles ne prennent qu'un `uuid` d'utilisateur déjà authentifié et n'exposent aucune donnée d'un autre utilisateur, mais elles doivent figurer dans une liste explicite auditée à chaque revue, au même titre que les cinq fonctions `lookup_*` existantes. Le point 2 (colonne `session_version`) invalide toutes les sessions actives lors du déploiement de la migration — à annoncer, ou à mitiger en initialisant `session_version` depuis `users` dans la migration :
`UPDATE public.refresh_sessions s SET session_version = u.session_version FROM public.users u WHERE u.id = s.user_id;`

**Effort estimé** : 1 jour (migration + 6 emplacements + tests d'intégration).
**Références** : CWE-613, CWE-863, ASVS V3.3.1 / V3.3.2, OWASP A07:2021.

---

### Y-02 — Rate limiting contournable ou auto-DoS selon `TRUST_PROXY`

**Domaine** : 11 · **CWE-307** (Improper Restriction of Excessive Authentication Attempts), **CWE-348** (Use of Less Trusted Source) · **OWASP A07:2021**, **API4:2023** · **Confiance : confirmé**

#### Cause racine

Le paramètre est un booléen, et les deux valeurs possibles sont mauvaises en production.

```ts
// backend/src/config.ts:34
TRUST_PROXY: booleanFromString,
```
```ts
// backend/src/app.ts:21-27
const app = Fastify({
  trustProxy: config.trustProxy,
  ...
```
```ts
// backend/src/app.ts:95-102
await app.register(rateLimit, {
  global: true,
  max: 120,
  timeWindow: "1 minute",
  enableDraftSpec: true,
  keyGenerator: (request) => request.ip,       // ← seule clé de limitation
  ...
```

`SECURITY.md:58` exige de « placer l'API derrière un reverse proxy TLS ». Dans cette configuration :

- **`TRUST_PROXY=false`** (la valeur par défaut, et celle de `.env.example:25`) — Fastify prend l'IP de la socket, c'est-à-dire celle du proxy. **Tous les utilisateurs de la plateforme partagent une seule clé de limitation.** Les 5 tentatives de connexion / 15 min et les 3 demandes de reset / 30 min deviennent des quotas globaux : cinq personnes qui se trompent de mot de passe bloquent l'authentification pour tout le monde pendant un quart d'heure. Déni de service trivial et permanent, déclenchable par n'importe qui.
- **`TRUST_PROXY=true`** — Fastify passe `trust: () => true` à `proxy-addr`, qui remonte toute la chaîne `X-Forwarded-For` et retient l'entrée la plus à gauche. Cette entrée est **entièrement contrôlée par le client**.

#### Scénario d'exploitation (`TRUST_PROXY=true`)

1. L'attaquant cible `victime@exemple.fr`, dont l'adresse a fuité dans une brèche tierce (credential stuffing classique).
2. Il envoie des `POST /api/auth/login` en ajoutant un en-tête forgé, une valeur différente à chaque requête :
   ```http
   POST /api/auth/login HTTP/1.1
   Host: api.yahro.app
   Origin: https://app.yahro.app
   X-Forwarded-For: 203.0.113.7
   Content-Type: application/json

   {"email":"victime@exemple.fr","password":"Motdepasse2024!"}
   ```
3. `@fastify/rate-limit` calcule une clé différente à chaque valeur → le compteur reste à 1/5. **Aucune limite ne s'applique.** Il n'existe par ailleurs aucun compteur par compte (Y-03) et le statut `LOCKED` n'est jamais posé par aucun code (vérifié : `LOCKED` n'apparaît qu'en lecture, `auth.ts:307,570`).
4. Le seul plafond restant est le coût CPU d'Argon2id — 19 MiB / 2 passes, soit quelques dizaines de vérifications par seconde et par cœur. Largement suffisant pour dérouler une liste de mots de passe issus d'une brèche.
5. Effet de bord : le même en-tête forgé alimente `ipHash` dans `refresh_sessions.ip_hash` (`auth.ts:428`) et dans **chaque ligne du journal d'audit** (`auth.ts:296, 317, 343, 399, 439, 660, 750, 825, 939, 1020, 1156`). L'attaquant empoisonne donc la seule donnée d'origine dont disposera l'analyste post-incident, et peut même incriminer une IP arbitraire.

#### Impact métier

Prise de contrôle de comptes par force brute distribuée, sans détection possible puisque la piste d'audit est elle-même contaminée. Pour une application qui stocke soldes, dettes, revenus et pièces jointes bancaires, c'est le scénario n°1 du `THREAT_MODEL.md:23-27` — dont le contrôle annoncé (« rate limiting par IP et compte ») n'est en réalité implémenté ni par IP fiable, ni par compte.

#### Correctif

Remplacer le booléen par une liste explicite de proxies de confiance, et durcir la clé de limitation.

```ts
// backend/src/config.ts — remplacer TRUST_PROXY: booleanFromString
    TRUSTED_PROXIES: optionalString,   // ex: "10.0.0.0/8,127.0.0.1" ou "1" (nb de sauts)
```
```ts
// backend/src/config.ts — dans le superRefine, section production
    if (value.NODE_ENV === "production" && !value.TRUSTED_PROXIES) {
      context.addIssue({
        code: "custom",
        path: ["TRUSTED_PROXIES"],
        message: "TRUSTED_PROXIES must list the reverse proxy addresses in production",
      });
    }
```
```ts
// backend/src/config.ts — dans le retour de loadConfig, remplacer trustProxy
    trustProxy: parsed.TRUSTED_PROXIES
      ? (/^\d+$/.test(parsed.TRUSTED_PROXIES)
          ? Number(parsed.TRUSTED_PROXIES)
          : parsed.TRUSTED_PROXIES.split(",").map((entry) => entry.trim()).filter(Boolean))
      : false,
```

Fastify accepte directement un nombre de sauts ou une liste CIDR ; `proxy-addr` ne remontera alors la chaîne que jusqu'aux adresses déclarées, et une valeur forgée par le client sera ignorée.

Ensuite, ne pas dépendre uniquement de l'IP pour les routes d'authentification :

```ts
// backend/src/routes/auth.ts:562 — clé composite IP + compte
  app.post(
    "/api/auth/login",
    {
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "15 minutes",
          keyGenerator: (request) => {
            const body = request.body as { email?: unknown } | undefined;
            const account = typeof body?.email === "string"
              ? hashToken(normalizeEmail(body.email), config.tokenHashPepper).slice(0, 32)
              : "anonymous";
            return `login:${request.ip}:${account}`;
          },
        },
      },
    },
    async (request, reply) => {
```

À appliquer de la même manière à `/api/auth/request-password-reset`, `/api/auth/resend-verification` et `/api/auth/mfa/verify` (pour cette dernière, clé sur le hash du `mfaToken`).

**Compromis à signaler** : une clé composite IP + compte n'arrête pas à elle seule un attaquant qui dispose d'un pool d'IP — d'où Y-03 (compteur par compte, indépendant de l'IP) qui la complète. Par ailleurs, un `keyGenerator` qui lit `request.body` impose que le corps soit parsé avant le hook de limitation ; avec `@fastify/rate-limit` en mode global cela fonctionne (le hook est `onRequest` par défaut mais bascule sur `preHandler` quand un `keyGenerator` accède au corps) — **à valider par un test d'intégration**, sinon utiliser un hook `preHandler` manuel.

**Effort estimé** : 0,5 jour.
**Références** : CWE-307, CWE-348, ASVS V2.2.1, OWASP API4:2023.

---

### Y-03 — Aucune limitation ni verrouillage par compte

**Domaine** : 2, 11 · **CWE-307** · **OWASP A07:2021** · **Confiance : confirmé (par absence)**

#### Cause racine

`THREAT_MODEL.md:27` annonce « rate limiting par IP **et compte** ». Le code n'implémente que la première moitié. Recherche exhaustive dans `backend/src` et `backend/migrations` :

- Aucune colonne `failed_attempts`, `locked_until`, `last_failed_at` sur `users`.
- Le statut `LOCKED` existe dans l'énumération (`migrations/0001:7`, `db/schema.ts:25`) et est **lu** en deux endroits (`auth.ts:307` et `auth.ts:570`), mais **aucun code ne l'écrit jamais**. C'est une intention non câblée.
- Le seul compteur de tentatives du projet est `mfa_challenges.attempts` (`migrations/0002:13`), qui protège le second facteur mais pas le premier.

Conséquence : quelle que soit la correction apportée à Y-02, un attaquant disposant d'un pool d'IP (botnet résidentiel, ~10 € les 1 000 IP) obtient 5 tentatives par IP et par fenêtre de 15 minutes contre un compte donné, indéfiniment, sans jamais déclencher d'alerte ni de blocage.

#### Scénario d'exploitation

1. L'attaquant dispose de 2 000 IP résidentielles et d'une liste de 50 000 mots de passe classés par fréquence.
2. Il déroule 5 tentatives par IP par fenêtre, soit 10 000 essais par quart d'heure sur le compte `victime@exemple.fr`.
3. La liste complète est épuisée en 75 minutes. Le compte n'est jamais verrouillé, la victime n'est jamais notifiée, et rien dans `audit_logs` ne distingue ce flux d'un utilisateur maladroit — les échecs de connexion **ne sont d'ailleurs pas journalisés du tout** (seul `AUTH_LOGIN_SUCCESS` est écrit, `auth.ts:435` ; il n'existe aucun `AUTH_LOGIN_FAILED`).
4. Si la MFA est active, l'attaquant s'arrête au mur du second facteur — mais il connaît désormais le mot de passe, réutilisable ailleurs.

#### Impact métier

Compromission de compte pour tout utilisateur sans MFA (la MFA est optionnelle et rien n'incite à l'activer). Et, indépendamment de la réussite, **impossibilité de détecter l'attaque** : `SECURITY.md:60` liste « créer des alertes de sécurité » comme exigence, mais sans journalisation des échecs il n'y a littéralement rien à alerter.

#### Correctif

Trois éléments, dont le troisième est le plus important à court terme.

**1) Compteur d'échecs par compte** (migration `0007`) :

```sql
ALTER TABLE public.users
  ADD COLUMN failed_login_count integer NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  ADD COLUMN locked_until timestamptz;

CREATE FUNCTION private.register_login_failure(p_user_id uuid)
RETURNS timestamptz
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
  UPDATE public.users
  SET failed_login_count = failed_login_count + 1,
      locked_until = CASE
        WHEN failed_login_count + 1 >= 10
          THEN now() + (least(failed_login_count + 1 - 9, 12) * interval '5 minutes')
        ELSE locked_until
      END
  WHERE id = p_user_id
  RETURNING locked_until
$function$;

CREATE FUNCTION private.clear_login_failures(p_user_id uuid)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public
AS $function$
  UPDATE public.users SET failed_login_count = 0, locked_until = NULL WHERE id = p_user_id
$function$;

REVOKE ALL ON FUNCTION private.register_login_failure(uuid), private.clear_login_failures(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.register_login_failure(uuid), private.clear_login_failures(uuid) TO yahro_app;
```

Et dans `lookup_user_for_auth`, ajouter `u.locked_until` à la liste des colonnes retournées.

**2) Application dans `/api/auth/login`** — placer le contrôle **après** la vérification Argon2id, pour ne pas rendre le verrouillage observable sans mot de passe valide (sinon vous créez un oracle d'énumération et un vecteur de blocage de compte par un tiers) :

```ts
// backend/src/routes/auth.ts:566-575, version corrigée
      const input = parseBody(loginSchema, request.body);
      const user = await lookupUser(input.email);
      const passwordValid = await verifyPassword(user?.passwordHash ?? dummyHash, input.password).catch(() => false);

      if (!user || !passwordValid || user.status === "LOCKED" || user.status === "DELETED" || !user.tenantId || !user.role) {
        if (user) {
          await database.client`select private.register_login_failure(${user.id}::uuid)`;
          await database.withSecurityContext({ userId: user.id, tenantId: user.tenantId ?? user.id }, async (transaction) => {
            await transaction.insert(auditLogs).values({
              tenantId: user.tenantId,
              actorUserId: user.id,
              action: "AUTH_LOGIN_FAILED",
              entityType: "user",
              entityId: user.id,
              requestId: request.id,
              ipHash: hashToken(request.ip, config.tokenHashPepper),
            });
          });
        }
        throw new AppError(401, "INVALID_CREDENTIALS", "Invalid credentials");
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        throw new AppError(429, "ACCOUNT_TEMPORARILY_LOCKED", "Too many attempts. Try again later.");
      }
```

et, juste avant `issueSession` (l.594), `await database.client\`select private.clear_login_failures(${user.id}::uuid)\`;`.

**3) Journaliser les échecs** — c'est fait par le bloc ci-dessus. Ajouter dans la foulée `AUTH_MFA_CHALLENGE_FAILED` (déjà présent, `auth.ts:339`) à une future règle d'alerte.

**Compromis à signaler** : un verrouillage par compte est un vecteur de déni de service ciblé (un tiers bloque volontairement le compte de quelqu'un). C'est pourquoi le compteur ci-dessus n'incrémente **qu'après** un `lookupUser` réussi, applique un backoff exponentiel plafonné à 60 minutes plutôt qu'un blocage définitif, et laisse `POST /api/auth/request-password-reset` fonctionnel comme voie de sortie. Ne remplacez pas ce backoff par un `status = 'LOCKED'` permanent : vous transformeriez une gêne en incident support.

**Effort estimé** : 1 jour.
**Références** : CWE-307, ASVS V2.2.1 / V2.2.3, OWASP A07:2021.

---

### Y-04 — Amplification du fournisseur de taux : stampede et épuisement du pool

**Domaine** : 11 (DoS applicatif), 1 (ressource partagée) · **CWE-770** (Allocation of Resources Without Limits), **CWE-405** (Asymmetric Resource Consumption) · **OWASP API4:2023** · **Confiance : confirmé**

#### Cause racine

Le rafraîchissement des taux officiels est déclenché **de façon synchrone, dans le chemin de la requête utilisateur**, dès qu'un taux manque — et un taux manque pour tout code ISO à trois lettres qui n'existe pas dans la réponse BCE.

```ts
// backend/src/routes/currencies.ts:102-115
async function officialPair(database: Database, base: string, quote: string) {
  let baseRate = await latestOfficialRate(database, base);
  let quoteRate = await latestOfficialRate(database, quote);
  const staleCutoff = Date.now() - 18 * 60 * 60 * 1000;
  const isStale = [baseRate, quoteRate].some((record) => record && record.fetchedAt.getTime() < staleCutoff);
  if (!baseRate || !quoteRate || isStale) {          // ← « taux inconnu » et « taux périmé » traités pareil
    try {
      await refreshOfficialRates(database);          // ← fetch externe + ~35 UPSERT séquentiels
      baseRate = await latestOfficialRate(database, base);
      quoteRate = await latestOfficialRate(database, quote);
    } catch {
      if (!baseRate || !quoteRate) throw new AppError(503, ...);
    }
  }
```
```ts
// backend/src/routes/currencies.ts:80-88 — la boucle d'écriture, séquentielle
  for (const value of values) {
    await database.db
      .insert(officialExchangeRates)
      .values(value)
      .onConflictDoUpdate({ ... });
  }
```

Le schéma de validation n'aide pas : `currencySchema = z.string().regex(/^[A-Z]{3}$/)` (`validation.ts:12`) accepte les 17 576 combinaisons de trois majuscules, dont une trentaine seulement figurent dans le flux BCE. Aucun cache négatif, aucun verrou de type *single-flight*, aucune limite dédiée sur la route (donc le plafond global de 120 req/min/IP s'applique).

#### Scénario d'exploitation

1. L'attaquant crée un compte légitime et le vérifie (pas d'obstacle : l'inscription est ouverte).
2. Il envoie en boucle, depuis quelques IP :
   ```http
   GET /api/currencies/convert?base=QQQ&quote=EUR&amount=1 HTTP/1.1
   Authorization: Bearer <access token valide>
   ```
   `QQQ` passe la regex, n'existera jamais dans la réponse BCE.
3. Chaque requête déclenche : 2 `SELECT`, puis `refreshOfficialRates` → 1 requête HTTPS sortante vers `data-api.ecb.europa.eu` (jusqu'à 8 s), le parsing d'un CSV pouvant atteindre 2 Mo, puis **~35 `INSERT ... ON CONFLICT` séquentiels**, puis 2 `SELECT` de plus. Soit ~40 allers-retours SQL et une connexion sortante immobilisée, pour une requête utilisateur d'un octet utile.
4. Le pool est dimensionné à `max: 10` (`db/client.ts:9`). Une poignée de requêtes concurrentes le sature ; les requêtes légitimes de tous les autres tenants attendent, puis échouent sur `connect_timeout: 10` ou `requestTimeout: 15_000`.
5. Effet collatéral côté fournisseur : plusieurs centaines de requêtes/minute vers l'API de la BCE depuis une IP unique. Le blocage de l'IP du serveur est le résultat attendu — et il casse la conversion de devises **pour l'ensemble des tenants**, y compris après l'arrêt de l'attaque.

Le même effet se produit sans intention malveillante : au réveil du cache (18 h), N requêtes simultanées déclenchent N rafraîchissements en parallèle — c'est un *cache stampede* classique.

#### Impact métier

Indisponibilité de l'API pour tous les tenants pour un coût attaquant négligeable, et dégradation durable d'une fonction annoncée au catalogue (`PRODUCT_SCOPE.md:161` : « conversion multi-devise avec taux datés et source identifiable »). Sur un produit destiné à la zone XOF/XAF, où quasiment chaque montant affiché passe par une conversion, c'est une panne visible immédiatement.

#### Correctif

Trois changements dans `backend/src/routes/currencies.ts`.

**1) Refuser tôt les devises hors périmètre** — ajouter en tête de fichier :

```ts
const SUPPORTED_QUOTES = new Set([
  "EUR", "USD", "JPY", "BGN", "CZK", "DKK", "GBP", "HUF", "PLN", "RON", "SEK",
  "CHF", "ISK", "NOK", "TRY", "AUD", "BRL", "CAD", "CNY", "HKD", "IDR", "ILS",
  "INR", "KRW", "MXN", "MYR", "NZD", "PHP", "SGD", "THB", "ZAR", "XOF", "XAF",
]);
const supportedCurrencySchema = currencySchema.refine(
  (value) => SUPPORTED_QUOTES.has(value),
  "Unsupported currency",
);
```

et remplacer `pairSchema` (l.19) par :

```ts
const pairSchema = z
  .object({ base: supportedCurrencySchema, quote: supportedCurrencySchema, amount: amountSchema.default("1") })
  .strict();
```

Une devise inconnue est alors rejetée en 422 par Zod, sans toucher ni la base ni le réseau. Cela supprime à lui seul l'essentiel de l'amplification.

**2) Verrou *single-flight* + cache négatif** — remplacer l'appel direct à `refreshOfficialRates` :

```ts
let refreshInFlight: Promise<void> | null = null;
let lastRefreshFailureAt = 0;
const REFRESH_FAILURE_COOLDOWN_MS = 5 * 60 * 1000;

async function refreshOfficialRatesOnce(database: Database) {
  if (Date.now() - lastRefreshFailureAt < REFRESH_FAILURE_COOLDOWN_MS) {
    throw new AppError(503, "RATE_PROVIDER_UNAVAILABLE", "Exchange rates are temporarily unavailable");
  }
  refreshInFlight ??= refreshOfficialRates(database)
    .catch((error) => {
      lastRefreshFailureAt = Date.now();
      throw error;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}
```

puis, ligne 109, `await refreshOfficialRatesOnce(database);`.

**3) Une seule écriture au lieu de 35** — remplacer la boucle `for` (l.80-88) par un insert groupé :

```ts
  await database.db
    .insert(officialExchangeRates)
    .values(values)
    .onConflictDoUpdate({
      target: [
        officialExchangeRates.baseCurrency,
        officialExchangeRates.quoteCurrency,
        officialExchangeRates.rateDate,
        officialExchangeRates.source,
      ],
      set: { rate: sql`excluded.rate`, fetchedAt },
    });
```

**Compromis à signaler** : le verrou `refreshInFlight` est **par processus**. En déploiement multi-instance il ne protège pas la BCE d'un facteur N ; à ce stade, il faudra un verrou consultatif PostgreSQL (`pg_try_advisory_lock`) ou, mieux, sortir complètement le rafraîchissement du chemin requête et en faire une tâche planifiée quotidienne — c'est la cible à viser (voir plan §5, chantiers structurels). Par ailleurs, la liste `SUPPORTED_QUOTES` doit être maintenue si la BCE modifie son panier ; prévoyez une alerte si `refreshOfficialRates` retourne une devise absente de la liste.

**Note connexe** : le contrôle de taille de la réponse BCE (l.60-63) vérifie `content-length` **puis** bufferise avec `response.text()`. Si le serveur répond sans `content-length` (transfert chunké), la première vérification est inopérante et la seconde n'intervient qu'après téléchargement complet en mémoire. La source étant fixe et de confiance, l'impact est faible, mais un `for await` sur `response.body` avec compteur d'octets serait plus propre.

**Effort estimé** : 0,5 jour.
**Références** : CWE-770, CWE-405, ASVS V12.1, OWASP API4:2023.

---

### Y-05 — 100 % des dépendances déclarées en `"latest"`

**Domaine** : 6 · **CWE-1104** (Use of Unmaintained Third Party Components), **CWE-829** (Inclusion of Functionality from Untrusted Control Sphere) · **OWASP A06:2021** · **Confiance : confirmé**

#### Cause racine

Les deux manifestes n'expriment aucune contrainte de version. Sur 47 dépendances directes, **46 sont en `"latest"`** — la seule exception est `qrcode.react: "^4.2.0"`.

```json
// package.json:14-22
  "dependencies": {
    "@fontsource-variable/dm-sans": "latest",
    "@fontsource-variable/manrope": "latest",
    "lucide-react": "latest",
    "qrcode.react": "^4.2.0",
    "react": "latest",
    "react-dom": "latest",
    "recharts": "latest"
  },
```
```json
// backend/package.json:21-41
  "dependencies": {
    "@fastify/cookie": "latest",
    ...
    "jose": "latest",
    "nodemailer": "latest",
    "pdfkit": "latest",
    "postgres": "latest",
    "ulid": "latest",
    "zod": "latest"
  },
```

`"latest"` est un *dist-tag*, pas un intervalle sémantique. Toute exécution de `npm install` — la commande que le `README.md:16,38,55` demande explicitement, et non `npm ci` — réinterroge le registre et résout `latest` vers la version publiée la plus récente, franchissant les majeures sans avertissement. La dérive est déjà visible dans les lockfiles : `typescript` est résolu en **6.0.3** à la racine et en **7.0.2** dans `backend/`, et les deux `package-lock.json` ont été régénérés à des dates différentes.

Contexte aggravant : `SECURITY.md:38` affirme « audit npm sans vulnerabilite connue au 19 aout 2026 ». Cette affirmation n'a de valeur que pour l'arbre résolu ce jour-là ; le manifeste garantit qu'il changera. Deux paquets exécutent des scripts d'installation (`fsevents`, `esbuild` sous `tsx`), et l'arbre total compte **519 paquets** (277 + 242).

#### Scénario d'exploitation

C'est le scénario `event-stream` / `ua-parser-js` / `xz-utils`, appliqué à une surface de 519 paquets :

1. Un attaquant compromet le compte npm d'un mainteneur d'une dépendance transitive quelconque — l'une des ~470 que vous n'avez jamais choisies.
2. Il publie une version mineure contenant un script `postinstall` ou une charge dans le code de démarrage.
3. Vous, ou votre CI, ou un contributeur, exécutez `npm install` comme le README l'indique. `"latest"` résout vers la version piégée ; le nouveau `package-lock.json` l'entérine.
4. Le script s'exécute avec vos droits, sur une machine où `backend/.env` contient `JWT_SECRET`, `TOKEN_HASH_PEPPER`, `MFA_ENCRYPTION_KEY` et les identifiants PostgreSQL en clair (Y-06). Trois lignes de Node.js suffisent à les exfiltrer.
5. Avec `JWT_SECRET` l'attaquant forge des access tokens pour n'importe quel `userId`/`tenantId` ; avec `TOKEN_HASH_PEPPER` il calcule les hachages de refresh tokens et de jetons de reset ; avec `MFA_ENCRYPTION_KEY` il déchiffre tous les secrets TOTP. **L'intégralité du modèle de sécurité tombe.**

Aucune de ces étapes ne suppose une faille dans votre code.

#### Impact métier

Compromission totale et silencieuse, avec pour vecteur une commande de routine documentée dans votre propre README. Sur une application financière, cela signifie la lecture et la modification des données de tous les tenants, plus l'usurpation de n'importe quel compte. Impact secondaire, moins dramatique mais certain : les builds ne sont pas reproductibles, un `npm install` peut casser la compilation du jour au lendemain, et l'écart TypeScript 6/7 entre les deux paquets en est déjà le symptôme.

#### Correctif

**1) Épingler les versions exactes.** Depuis la racine, puis depuis `backend/` :

```bash
npm pkg get dependencies devDependencies      # relever l'arbre actuellement résolu
npx npm-check-updates --target latest --doctor  # optionnel, pour choisir en connaissance de cause
```

puis réécrire manuellement chaque `"latest"` par la version exacte issue du lockfile. Exemple pour `backend/package.json` (valeurs relevées dans `backend/package-lock.json`) :

```json
  "dependencies": {
    "@fastify/cookie": "11.1.2",
    "@fastify/cors": "11.3.0",
    "@fastify/helmet": "13.1.1",
    "@fastify/multipart": "10.1.1",
    "@fastify/rate-limit": "11.2.0",
    "@node-rs/argon2": "2.1.0",
    "csv-parse": "7.0.2",
    "dotenv": "17.4.2",
    "drizzle-orm": "0.45.2",
    "fastify": "5.12.1",
    "file-type": "22.0.2",
    "jose": "6.2.9",
    "nodemailer": "9.0.5",
    "postgres": "3.4.9",
    "ulid": "3.0.2",
    "zod": "4.4.3"
  },
```

**2) Supprimer les dépendances inutilisées.** Vérifié par recherche exhaustive dans `backend/src` et `backend/scripts` : `pdfkit`, `@types/pdfkit`, `fastify-plugin` et `fastify-type-provider-zod` ne sont **importés nulle part**. `pdfkit` à lui seul tire une arborescence de polices et de décodeurs d'images — c'est de la surface d'attaque pure. `npm uninstall pdfkit @types/pdfkit fastify-plugin fastify-type-provider-zod`.

**3) Verrouiller le comportement d'installation.** Créer `.npmrc` à la racine et dans `backend/` :

```ini
save-exact=true
ignore-scripts=true
audit-level=moderate
fund=false
```

`ignore-scripts=true` neutralise le vecteur `postinstall`. `@node-rs/argon2` fournit des binaires précompilés par plateforme via `optionalDependencies` et n'a pas besoin de script ; `esbuild` (sous `tsx`, uniquement en dev) peut en avoir besoin — si `npm run dev` casse, réinstallez ce seul paquet avec `npm rebuild esbuild`.

**4) Corriger le README.** Remplacer les trois occurrences de `npm install` (`README.md:16,38,55`) par `npm ci`, qui installe strictement l'arbre du lockfile et échoue si le manifeste diverge.

**5) Ajouter les garde-fous CI** — voir §5, court terme : `npm audit --audit-level=moderate`, Dependabot ou Renovate en mode groupé hebdomadaire, et `npm ci --ignore-scripts` dans le job de build.

**Compromis à signaler** : l'épinglage exact déplace le travail de mise à jour vers vous. Sans Dependabot/Renovate en face, vous échangez un risque d'injection contre un risque de dépendances périmées — qui est le CWE-1104 dans l'autre sens. Les deux mesures vont ensemble, ne faites pas la première sans la seconde.

**Effort estimé** : 0,5 jour pour l'épinglage + le nettoyage, 0,5 jour pour la CI.
**Références** : CWE-1104, CWE-829, ASVS V14.2, OWASP A06:2021, SLSA niveau 1.

---

### Y-06 — Secrets réels dans un dossier synchronisé OneDrive

**Domaine** : 5 · **CWE-522** (Insufficiently Protected Credentials), **CWE-538** (Insertion of Sensitive Information into Externally-Accessible File) · **OWASP A05:2021** · **Confiance : confirmé**

#### Cause racine

Le projet est situé sous `C:\Users\Ariel\OneDrive - ENSEA\Documents\Apps Perso\Gestion Budget`. Le chemin indique un OneDrive **rattaché au tenant Microsoft 365 de l'ENSEA**, pas à un compte personnel. Tout ce qui s'y trouve est répliqué vers l'infrastructure de l'école, avec historique de versions, corbeille, et accès administrateur du tenant.

Or `backend/.env` contient des valeurs réelles, générées et fonctionnelles :

```
# backend/.env:6
DATABASE_URL=postgresql://yahro_app:7tkL8FDcSE7Bp93-...@127.0.0.1:55432/yahro
# backend/.env:9
DATABASE_MIGRATION_URL=postgresql://yahro_owner:Ebe3e5rM8_nJYiVzRGhd4...@127.0.0.1:55432/yahro
# backend/.env:12-15
JWT_SECRET=jncYlioqMWiIwy6kqZfwc-nl1EkqJmCLI6s45vTHHY5f-...
TOKEN_HASH_PEPPER=Opr-eVapqmMGXqZuiuk49W6nGigl9Dzt0-jL6pcD96db...
MFA_ENCRYPTION_KEY=1ckHcKKhK39XZ37Ejyw-IO6nEddTdtQmPL60LLt7aAs
```

`.gitignore:3-5` couvre correctement `.env` et il n'existe **aucun répertoire `.git`** dans le projet — la fuite par Git n'a donc pas eu lieu, et c'est bien joué. Mais `.gitignore` n'a strictement aucun effet sur un client de synchronisation cloud. Le paragraphe « Regles de secrets » de `SECURITY.md:44-48` couvre Git, les sauvegardes et les variables `VITE_` ; il ne mentionne pas la synchronisation du poste de travail, qui est ici le canal d'exfiltration réel.

À noter aussi : `backend/.dev-mail/` (répertoire présent, actuellement vide) est destiné à capturer les emails de développement, **liens de réinitialisation à usage unique inclus** (`services/email.ts:35-43`). Il est couvert par `.gitignore:11`, et par rien d'autre. Chaque fichier qui y sera écrit sera synchronisé.

#### Scénario d'exploitation

1. Un administrateur du tenant M365 de l'ENSEA, un processus de eDiscovery, un outil de DLP, ou un compte compromis ayant accès au OneDrive de l'utilisateur lit `backend/.env`.
2. Il dispose de `JWT_SECRET`. Il forge un access token HS512 valide pour n'importe quel couple `(userId, tenantId)` : l'algorithme, l'issuer (`yahro-api`) et l'audience (`yahro-web`) sont en clair dans `security/tokens.ts:20-21,31`, et `sessionVersion` est facile à obtenir par essais successifs à partir de 1.
3. Il dispose de `TOKEN_HASH_PEPPER`. Il peut calculer le hachage de n'importe quel refresh token ou jeton de reset, et donc reconnaître ou forger des entrées de `refresh_sessions` et `one_time_tokens`.
4. Il dispose de `MFA_ENCRYPTION_KEY`. Toute copie de la table `users` lui livre les secrets TOTP en clair — la MFA de tous les comptes devient inopérante.
5. Il dispose du mot de passe `yahro_owner`, propriétaire du schéma. Ce rôle **peut désactiver la RLS** : `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`. Les trois couches d'isolation multi-espace, qui sont la plus grande réussite de ce projet, tombent en une commande.

Le point 5 mérite d'être souligné : `SECURITY.md:24` insiste à juste titre sur le fait que le rôle d'exécution n'a ni `SUPERUSER` ni `BYPASSRLS`. C'est exact et c'est bien. Mais le mot de passe du rôle **propriétaire** est stocké à côté, dans le même fichier, dans le même dossier synchronisé.

#### Impact métier

Aujourd'hui, l'exposition porte sur une base de développement locale — l'impact direct est donc contenu. Ce qui est grave, c'est que **le schéma d'organisation est déjà en place** : le jour où une instance de recette ou de production existera, ses secrets suivront le même chemin, dans le même dossier, par la même habitude. Et les cinq valeurs actuelles doivent de toute façon être considérées comme compromises, ne serait-ce que parce qu'elles ont transité par cet audit.

#### Correctif

**1) Immédiat — sortir le projet de la zone synchronisée.** Déplacer le dossier vers un chemin local non synchronisé, par exemple `C:\dev\yahro`, et vérifier dans OneDrive → Paramètres → Compte → Choisir des dossiers que le nouveau chemin n'est pas couvert. Si le déplacement n'est pas envisageable dans l'immédiat, exclure au minimum les fichiers sensibles via un point de jonction, ou renommer le dossier en `Gestion Budget.nosync` selon le comportement de votre client.

**2) Immédiat — tourner les cinq secrets.**

```powershell
# JWT_SECRET, TOKEN_HASH_PEPPER, POSTGRES_OWNER_PASSWORD, YAHRO_APP_PASSWORD : 64 octets base64url
node -e "console.log(require('crypto').randomBytes(64).toString('base64url'))"
# MFA_ENCRYPTION_KEY : exactement 32 octets base64url
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

**Attention à l'ordre des opérations** — la rotation n'est pas neutre :
- `TOKEN_HASH_PEPPER` : invalide **tous** les refresh tokens, jetons de vérification et jetons de reset existants (ils sont hachés avec l'ancien pepper). Tout le monde devra se reconnecter. Acceptable ici, à planifier en production.
- `MFA_ENCRYPTION_KEY` : les secrets TOTP existants deviennent **indéchiffrables** et les comptes MFA seront irrécupérables. Sur la base de dev, videz simplement les colonnes : `UPDATE public.users SET mfa_enabled = false, totp_secret_encrypted = NULL, totp_last_used_step = NULL; DELETE FROM public.mfa_recovery_codes;`. En production, il faudra une rotation versionnée (préfixe `v2.` dans `encryptTotpSecret`, déchiffrement acceptant `v1.` et `v2.`) — le format actuel, qui porte déjà un `v1.`, a été conçu pour ça, servez-vous-en.
- `POSTGRES_OWNER_PASSWORD` / `YAHRO_APP_PASSWORD` : nécessitent un `ALTER ROLE ... PASSWORD` avant mise à jour des deux `.env`, ou une recréation du volume Docker.

**3) Court terme — ajouter la règle manquante à `SECURITY.md`**, après la ligne 44 :

```markdown
- Ne jamais placer le projet, un `.env`, une sauvegarde ou le repertoire `.dev-mail`
  dans un dossier synchronise vers un service cloud tiers (OneDrive, Dropbox,
  Google Drive, iCloud). Le `.gitignore` ne protege pas de la synchronisation.
```

**4) Production — gestionnaire de secrets.** `SECURITY.md:48` le prévoit déjà. Injectez les valeurs par variables d'environnement depuis Azure Key Vault, AWS Secrets Manager ou Doppler ; ne matérialisez jamais de `.env` sur disque en production.

**5) Optionnel mais utile — détection.** Ajouter `gitleaks` ou `trufflehog` au pipeline CI (§5, court terme). Cela n'aurait pas attrapé ce cas précis, mais attrapera le jour où quelqu'un committera un secret par mégarde.

**Effort estimé** : 2 heures (déplacement + rotation dev), 0,5 jour pour la rotation versionnée MFA à prévoir avant production.
**Références** : CWE-522, CWE-538, ASVS V6.4, V14.1.3, OWASP A05:2021.

---

### Y-07 — Jeton de réinitialisation en URL, sans en-têtes de sécurité côté SPA

**Domaine** : 12 (en-têtes), 2 (sessions) · **CWE-598** (Use of GET Request Method With Sensitive Query Strings), **CWE-1004**, **CWE-693** (Protection Mechanism Failure) · **OWASP A05:2021** · **Confiance : confirmé**

#### Cause racine

Le jeton de reset — une valeur de 32 octets qui autorise à elle seule le changement du mot de passe — est transporté dans la *query string*, lue directement par le SPA :

```ts
// backend/src/services/email.ts:62-69
    sendPasswordReset(to, token) {
      const url = `${origin}/reset-password?token=${encodeURIComponent(token)}`;
```
```ts
// src/App.tsx:16-18
  const path = window.location.pathname;
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const accountAction = path === "/verify-email" ? "verify-email" : path === "/reset-password" ? "reset-password" : null;
```

Le jeton n'est retiré de l'URL qu'à la toute fin, dans le callback `onDone` que l'utilisateur déclenche manuellement en cliquant « Retour a l'accueil » (`App.tsx:47-50`, `account-action-page.tsx:77`). Entre-temps, il reste dans la barre d'adresse, dans l'historique du navigateur, dans les suggestions d'auto-complétion, et dans les journaux d'accès de tout ce qui sert le SPA (CDN, reverse proxy, hébergeur statique).

Deuxième moitié du problème : `@fastify/helmet` protège les réponses de **l'API** (`app.ts:72-82`), mais le frontend est un bundle Vite servi statiquement, et rien ne lui applique d'en-têtes. `index.html` ne contient ni `<meta name="referrer">`, ni CSP, ni la moindre directive. Il n'y a donc **aucune politique de référent** sur la page qui détient le jeton dans son URL — c'est-à-dire la valeur par défaut du navigateur, `strict-origin-when-cross-origin`, qui protège l'URL complète en cross-origin mais pas en same-origin, et qui ne protégera plus rien le jour où un script tiers (analytics, Sentry, une police distante, une iframe de support) sera ajouté à la page.

#### Scénario d'exploitation

1. La victime demande une réinitialisation. Elle reçoit `https://app.yahro.app/reset-password?token=eyJh...`.
2. Elle clique. Le SPA charge et le jeton est dans l'URL, valable 30 minutes (`PASSWORD_RESET_TTL_SECONDS=1800`).
3. Trois canaux de fuite, par ordre de probabilité :
   - **Journaux de l'hébergeur.** Netlify, Vercel, CloudFront, nginx : tous journalisent la ligne de requête complète par défaut. Le jeton se retrouve en clair dans des journaux souvent conservés 30 à 90 jours et accessibles à toute l'équipe, voire exportés vers un SIEM tiers.
   - **`Referer`.** Le jour où la page charge une ressource tierce — et c'est une question de temps, pas de principe — l'URL complète part chez ce tiers. Aujourd'hui les polices sont bien empaquetées localement (`@fontsource-variable`), donc le risque est latent, pas actif.
   - **Historique partagé.** Poste familial, navigateur synchronisé entre appareils, capture d'écran d'assistance : le jeton reste visible dans la barre d'adresse tant que l'utilisateur ne clique pas sur « Retour a l'accueil ».
4. Quiconque récupère le jeton dans les 30 minutes appelle `POST /api/auth/reset-password` — route sans authentification et **sans limite dédiée** — et prend le contrôle du compte. La MFA ne l'arrête pas : `reset-password` (`auth.ts:793-830`) ne demande aucun second facteur, contrairement à `change-password` (`auth.ts:1109-1119`) qui, lui, l'exige correctement.

Ce dernier point est le plus important : **la réinitialisation par email contourne intégralement la MFA.** C'est un choix défendable (c'est le compromis classique récupération/sécurité), mais il fait du jeton de reset le maillon le plus faible de toute la chaîne d'authentification, et il n'est donc pas au bon endroit dans une URL.

#### Impact métier

Prise de contrôle complète d'un compte à partir d'une ligne de journal ou d'un historique de navigateur, sans exploitation d'aucune faille logique. Sur une application financière, l'attaquant accède ensuite à l'export CSV complet (`/api/exports/transactions.csv`, lui aussi sans réauthentification, cf. Y-10).

#### Correctif

**1) Nettoyer l'URL immédiatement, avant tout rendu.** Dans `src/App.tsx`, remplacer les lignes 16-18 :

```ts
// src/App.tsx:16-18, version corrigée
const [initialLocation] = useState(() => {
  const path = window.location.pathname;
  const value = new URLSearchParams(window.location.search).get("token") ?? "";
  if (value) window.history.replaceState({}, "", path);   // ← le jeton quitte l'URL tout de suite
  return { path, token: value };
});
const { path, token } = initialLocation;
const accountAction = path === "/verify-email" ? "verify-email" : path === "/reset-password" ? "reset-password" : null;
```

Le `useState` avec initialiseur paresseux garantit que la lecture n'a lieu qu'une fois, avant le premier rendu et avant tout effet — donc avant qu'une éventuelle ressource tierce puisse émettre un `Referer`.

**2) Politique de référent au niveau du document.** Dans `index.html`, après la ligne 5 :

```html
    <meta name="referrer" content="no-referrer" />
```

**3) En-têtes de sécurité sur l'hébergement du SPA.** Ils ne peuvent pas venir de helmet : à configurer chez l'hébergeur. Exemple pour Netlify (`public/_headers`) ou l'équivalent nginx / Cloudflare :

```
/*
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Content-Security-Policy: default-src 'self'; connect-src 'self' https://api.yahro.app; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'
  Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
  Permissions-Policy: geolocation=(), camera=(), microphone=(), payment=()
```

`style-src 'unsafe-inline'` est requis par Tailwind en runtime ; c'est le seul assouplissement nécessaire et il est sans danger tant qu'il n'y a pas de sink XSS — ce qui est le cas ici.

**4) Désactiver la journalisation des query strings** sur le reverse proxy ou l'hébergeur pour les chemins `/reset-password` et `/verify-email`.

**5) À considérer — sortir le jeton de la query string.** Deux options, par ordre de robustesse :
- placer le jeton dans le **fragment** (`/reset-password#token=...`), qui n'est jamais transmis au serveur ni journalisé — modification triviale côté `email.ts:63` (`#token=`) et `App.tsx` (`new URLSearchParams(window.location.hash.slice(1))`) ;
- ou raccourcir agressivement la durée de vie du jeton de reset (`PASSWORD_RESET_TTL_SECONDS`, plancher actuel 600 s côté schéma) et exiger une confirmation supplémentaire.

**Compromis à signaler** : le fragment casse les clients email qui « prévisualisent » les liens, et certains clients réécrivent les URL — testez avant de généraliser. La CSP `default-src 'self'` cassera l'ajout futur d'un outil d'analytics ou de Sentry ; c'est le comportement voulu, mais prévenez l'équipe pour éviter qu'elle ne la desserre en urgence. Enfin, le point 1 modifie l'URL avant que React ne monte : vérifiez que `onDone` (`App.tsx:47-50`) fonctionne toujours, son `replaceState` devient redondant mais reste inoffensif.

**Effort estimé** : 0,5 jour (dont l'essentiel en configuration d'hébergement).
**Références** : CWE-598, CWE-693, ASVS V3.1.1, V14.4, OWASP A05:2021.

---

### Y-08 — RGPD : export, suppression, rétention et registre absents

**Domaine** : 15 · **Confiance : confirmé** · Constat réglementaire, non exploitable techniquement.

#### Cause racine

`docs/PRODUCT_SCOPE.md:34-35` engage explicitement « Suppression du compte avec période de grâce » et « Export complet des données personnelles ». Aucune des deux n'existe :

- **Droit d'accès / portabilité (art. 15, 20)** — aucune route d'export du dossier personnel. `/api/exports/transactions.csv` n'exporte que les transactions d'une plage ≤ 370 jours : ni profil, ni comptes, ni budgets, ni projets, ni sessions, ni journal d'audit.
- **Droit à l'effacement (art. 17)** — aucune route de suppression. La colonne `users.deleted_at` existe (`migrations/0001:27`) et est **lue** par `lookup_user_for_auth` (`migrations/0003:55`), mais **aucun code ne l'écrit**. Il n'existe aucun moyen, même manuel via l'interface, de supprimer un compte.
- **Rectification (art. 16)** — partielle : `PATCH /api/auth/me` couvre le profil, mais le changement d'adresse email n'existe pas. Le `purpose = 'CHANGE_EMAIL'` est pourtant prévu dans la contrainte `CHECK` (`migrations/0001:79`) — l'intention est là, le code ne suit pas.
- **Limitation de conservation (art. 5.1.e)** — aucune purge nulle part : ni des `one_time_tokens` consommés, ni des `refresh_sessions` révoquées, ni des `mfa_challenges` expirés, ni des `audit_logs` (qui sont par construction `append-only` et donc croissent indéfiniment).
- **Registre des traitements (art. 30) et base légale** — absents de `docs/`. Les consentements sont correctement horodatés et versionnés (`users.terms_accepted_at`, `privacy_version`, etc. — c'est bien fait), mais il n'existe aucun document décrivant finalités, durées, destinataires et sous-traitants.
- **Sous-traitants (art. 28)** — deux au minimum sont déjà dans l'architecture : le fournisseur SMTP (`services/email.ts`) et la Banque centrale européenne (`currencies.ts:44`, destinataire d'aucune donnée personnelle, mais à documenter). Aucun n'est listé.

À l'inverse, deux points sont **exemplaires** et méritent d'être notés : la minimisation à l'inscription (identité, surnom, pays, préférences régionales — rien de superflu) et la pseudonymisation systématique des adresses IP par HMAC (`ip_hash`), qui est au-dessus de ce que fait la majorité des SaaS.

#### Impact métier

Pas d'impact technique. Impact réglementaire immédiat dès qu'un compte tiers existe : une demande d'effacement ne peut pas être honorée, ce qui expose à une réclamation CNIL (ou l'ARTCI en Côte d'Ivoire). Impact secondaire, opérationnel : sans purge, `audit_logs` et `refresh_sessions` croissent sans limite, ce qui devient un problème de coût et de performance à moyen terme.

#### Correctif

Ce n'est pas un correctif ponctuel mais un lot de travail. Par ordre de priorité réglementaire :

**1) Export complet (art. 15/20)** — une route `GET /api/account/export` produisant un JSON de toutes les tables portant `user_id` ou appartenant au tenant personnel, protégée par réauthentification récente (cf. Y-10) et limitée à 1 requête / 24 h.

**2) Suppression avec période de grâce (art. 17)** — `DELETE /api/account`, exigeant mot de passe + second facteur, qui positionne `users.deleted_at = now() + interval '30 days'` et `status = 'DELETED'`, révoque toutes les sessions (via `private.revoke_all_user_sessions` de Y-01), puis une tâche planifiée qui, passé le délai, anonymise ou supprime. Attention : `transactions_creator_membership_fk` et `import_jobs_creator_membership_fk` sont en `ON DELETE RESTRICT` (`migrations/0001:141,173`) — une suppression physique de l'utilisateur sera **bloquée** s'il a créé la moindre transaction. Prévoyez l'anonymisation (`first_name`, `last_name`, `nickname`, `email` remplacés par des valeurs neutres, `password_hash` invalidé) plutôt qu'un `DELETE`, ce qui est de toute façon la bonne réponse quand des données comptables partagées existent.

**3) Purge et rétention** — une tâche planifiée quotidienne :

```sql
DELETE FROM public.one_time_tokens WHERE expires_at < now() - interval '30 days';
DELETE FROM public.mfa_challenges  WHERE expires_at < now() - interval '7 days';
DELETE FROM public.refresh_sessions WHERE expires_at < now() - interval '90 days';
-- audit_logs : archivage froid au-dela de 12 mois, jamais de DELETE
```
Le rôle `yahro_app` a déjà les `GRANT DELETE` nécessaires sur les trois premières tables (`migrations/0001:426`), et **pas** sur `audit_logs` — cohérent avec l'immuabilité voulue.

**4) Documentation** — `docs/PRIVACY.md` : finalités, base légale (exécution du contrat pour les données financières, consentement pour les conseils automatiques mentionnés en `PRODUCT_SCOPE.md:159`), durées de conservation, destinataires, sous-traitants, procédure d'exercice des droits, délai de réponse.

**Compromis à signaler** : dans un espace **partagé**, la suppression du compte d'un membre ne peut pas emporter les transactions communes sans détruire la comptabilité des autres — c'est précisément pourquoi l'anonymisation est la bonne réponse, et c'est un point à écrire noir sur blanc dans la politique de confidentialité avant d'ouvrir les espaces partagés.

**Effort estimé** : 3 à 5 jours (export 1 j, suppression 2 j, purge 0,5 j, documentation 1 j).
**Références** : RGPD art. 5, 15, 16, 17, 20, 28, 30 ; ASVS V8.3.

---

### Y-09 à Y-14 — Constats de moindre gravité

**Y-09 — Énumération de comptes par canal temporel à l'inscription** *(à vérifier dynamiquement)*
La réponse est uniforme (202, message identique, `auth.ts:464` et `558`), et le hachage Argon2id est exécuté dans les deux branches (`auth.ts:460`) — c'est bien pensé. Mais la branche « nouveau compte » exécute ensuite une transaction de **52 insertions** (1 user + 1 tenant + 1 membership + 15 familles + 34 postes + 1 jeton + 1 audit, `auth.ts:473-549`), là où la branche « compte existant » n'en fait qu'une ou deux (`auth.ts:302-320`). L'écart de latence devrait être de plusieurs dizaines de millisecondes, largement mesurable. Limité à 5 requêtes / 15 min / IP — mais voir Y-02.
*Correctif* : soit précalculer les catégories par défaut dans une fonction SQL unique et rapide, soit — plus simple et plus robuste — répondre 202 immédiatement et exécuter la création en tâche de fond après la réponse. *Effort : 0,5 j.* **CWE-208**, ASVS V2.2.3.

**Y-10 — Export CSV non borné, sans réauthentification** *(probable)*
`insights.ts:274-309` : jusqu'à 370 jours de transactions, sans pagination, matérialisées intégralement en mémoire (`rows.map(...).join("\r\n")`) avant envoi. Aucune limite de débit dédiée, aucune exigence d'authentification récente — alors que `SECURITY.md:56` et `PRODUCT_SCOPE.md:130` la prévoient tous deux explicitement. Un access token volé (15 min de validité) suffit à aspirer l'historique financier complet.
*Correctif* : ajouter `{ config: { rateLimit: { max: 5, timeWindow: "1 hour" } } }` sur la route ; exiger une authentification récente (ajouter un claim `auth_time` au JWT dans `tokens.ts:24-38` et refuser au-delà de 5 minutes) ; passer en streaming avec `reply.raw` plutôt qu'en chaîne unique. *Effort : 0,5 j.* **CWE-770**, ASVS V8.3.4.

**Y-11 — Endpoints d'import non limités individuellement** *(probable)*
`imports.ts:173` et `228` : 5 Mo, 10 000 lignes, parsing CSV synchrone (`csv-parse/sync`, qui **bloque l'event loop**), puis jusqu'à 40 lots d'insertion. Seul le plafond global de 120 req/min/IP s'applique. Un client peut monopoliser la boucle d'événements et le pool de connexions.
*Correctif* : `{ config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }` sur les deux routes ; envisager `csv-parse` en mode flux pour ne plus bloquer. *Effort : 2 h.* **CWE-400**.

**Y-12 — Table de taux partagée entre tenants, sans RLS** *(confirmé, impact faible)*
`public.official_exchange_rates` est la seule table métier sans `ENABLE ROW LEVEL SECURITY` (`migrations/0004:66-77`), et `yahro_app` y a `SELECT, INSERT, UPDATE` (`migrations/0004:225`). C'est un choix cohérent — ce sont des données de référence globales, sans `tenant_id`. Le point d'attention est qu'elle est **écrite depuis le chemin de requête d'un utilisateur quelconque** (`currencies.ts:80-88`, hors `withSecurityContext`) : une altération du flux BCE, ou un bug de parsing, se propage instantanément aux conversions de tous les tenants. Aucun `DELETE` n'est accordé, ce qui limite les dégâts, et la validation ligne à ligne (`currencies.ts:66-72`) est correcte.
*Correctif* : déplacer l'écriture dans une tâche planifiée exécutée par un rôle dédié en écriture seule sur cette table (cf. Y-04, point 3 du plan structurel), et retirer `INSERT, UPDATE` à `yahro_app`. *Effort : 0,5 j (avec Y-04).*

**Y-13 — Store de rate limiting en mémoire** *(confirmé)*
`app.ts:95-102` : `@fastify/rate-limit` sans `redis`. Les compteurs sont par processus et disparaissent au redémarrage — un attaquant peut provoquer un redémarrage (ou simplement attendre un déploiement) pour repartir de zéro, et toute mise à l'échelle horizontale divise les limites par le nombre d'instances.
*Correctif* : brancher un store Redis dès la première instance de production. *Effort : 2 h.*

**Y-14 — Réutilisation du pepper comme secret cookie, `COOKIE_DOMAIN` mort** *(informatif)*
`app.ts:94` : `await app.register(cookie, { secret: config.tokenHashPepper, ... })`. Aucun cookie n'est en réalité signé (`setRefreshCookie`, `auth.ts:233-241`, n'utilise pas `signed: true`), le secret n'est donc jamais employé — mais la réutilisation d'un secret cryptographique entre deux usages est une mauvaise habitude à ne pas laisser s'installer. Par ailleurs, `config.cookieDomain` est parsé (`config.ts:83`) et documenté (`.env.example:24`) mais **jamais lu** — ce qui est en réalité correct, puisque le préfixe `__Host-` utilisé en production (`auth.ts:230`) *interdit* l'attribut `Domain`. Le paramètre est donc trompeur plutôt que dangereux.
*Correctif* : `secret: undefined` sur `@fastify/cookie` tant qu'aucun cookie signé n'existe ; supprimer `COOKIE_DOMAIN` de `config.ts` et des deux `.env.example`, ou documenter en commentaire pourquoi il est volontairement ignoré. *Effort : 15 min.*

---

## 5. Plan de remédiation priorisé

### Quick wins — moins d'un jour chacun

| # | Action | Constat | Effort |
|---|---|---|---|
| 1 | Déplacer le projet hors OneDrive + tourner les 5 secrets | Y-06 | 2 h |
| 2 | Remplacer `TRUST_PROXY` booléen par une liste CIDR / nb de sauts | Y-02 | 3 h |
| 3 | Restreindre `pairSchema` aux devises réellement supportées | Y-04 | 1 h |
| 4 | Verrou *single-flight* + cache négatif + insert groupé sur les taux | Y-04 | 3 h |
| 5 | Épingler les 46 dépendances `"latest"` ; `.npmrc` avec `save-exact` + `ignore-scripts` | Y-05 | 3 h |
| 6 | Supprimer `pdfkit`, `@types/pdfkit`, `fastify-plugin`, `fastify-type-provider-zod` | Y-05 | 30 min |
| 7 | Remplacer `npm install` par `npm ci` dans les 3 occurrences du README | Y-05 | 10 min |
| 8 | `history.replaceState` immédiat sur le jeton + `<meta name="referrer" content="no-referrer">` | Y-07 | 1 h |
| 9 | Limites dédiées sur `/api/exports/transactions.csv` et les 2 routes d'import | Y-10, Y-11 | 1 h |
| 10 | Journaliser `AUTH_LOGIN_FAILED` dans le journal d'audit | Y-03 | 1 h |
| 11 | `secret: undefined` sur `@fastify/cookie` ; retirer `COOKIE_DOMAIN` | Y-14 | 15 min |
| 12 | Ajouter la règle « pas de dossier synchronisé » à `SECURITY.md` | Y-06 | 15 min |

**Total : environ 2 jours.** Les points 1, 2 et 5 sont non négociables.

### Court terme — 1 à 2 semaines

| # | Action | Constat | Effort |
|---|---|---|---|
| 13 | Migration `0007` : `private.revoke_all_user_sessions` + colonne `refresh_sessions.session_version` + contrôle à la rotation + liste de sessions inter-espaces | Y-01 | 1 j |
| 14 | Compteur d'échecs par compte avec backoff exponentiel plafonné | Y-03 | 1 j |
| 15 | Clés de limitation composites IP + compte sur les 4 routes d'authentification | Y-02 | 0,5 j |
| 16 | Authentification récente (claim `auth_time`) exigée pour l'export | Y-10 | 0,5 j |
| 17 | En-têtes de sécurité + CSP sur l'hébergement du SPA | Y-07 | 0,5 j |
| 18 | Tests d'intégration HTTP sur PostgreSQL éphémère, avec **tests négatifs inter-tenant** et un test explicite « après reset, aucun refresh token ne survit, tous espaces confondus » | Y-01, §2.4 | 3 j |
| 19 | CI : `npm ci --ignore-scripts`, `npm audit --audit-level=moderate`, `gitleaks`, Dependabot groupé hebdomadaire | Y-05, Y-06 | 1 j |
| 20 | Store Redis pour le rate limiting | Y-13 | 2 h |
| 21 | Réponse 202 immédiate à l'inscription, création du tenant en tâche de fond | Y-09 | 0,5 j |

**Total : environ 8 à 9 jours.**

### Chantiers structurels

| # | Chantier | Constat | Effort |
|---|---|---|---|
| 22 | **Conformité RGPD** : export complet, suppression avec période de grâce et anonymisation, purge planifiée, `docs/PRIVACY.md`, registre des traitements | Y-08 | 3–5 j |
| 23 | **Sortir le rafraîchissement des taux du chemin requête** : tâche planifiée quotidienne, rôle PostgreSQL dédié, retrait de `INSERT/UPDATE` à `yahro_app` sur `official_exchange_rates` | Y-04, Y-12 | 2 j |
| 24 | **Avant les espaces partagés** : concevoir invitations, changement de rôle et transfert de propriété *avec* Y-01 déjà corrigé, et durcir la RLS pour qu'elle encode le rôle en écriture (ne pas laisser `requireRole` seul face à un `VIEWER`) | §2.2, Y-01 | 5 j |
| 25 | **Rotation versionnée de `MFA_ENCRYPTION_KEY`** (le format `v1.` est déjà prévu pour ça) et procédure de rotation documentée pour les 5 secrets | Y-06 | 1 j |
| 26 | **Observabilité de sécurité** : centralisation des journaux sans données financières, alertes sur `AUTH_LOGIN_FAILED`, `AUTH_REFRESH_REUSE_DETECTED`, `AUTH_MFA_CHALLENGE_FAILED` | Y-03, `SECURITY.md:60` | 3 j |
| 27 | **WebAuthn / passkeys** et vérification des mots de passe compromis (HIBP k-anonymity) à l'inscription et au reset | `SECURITY.md:55` | 5 j |
| 28 | **Sauvegardes chiffrées hors site avec test de restauration**, en tenant compte de `row_security=off` pour le rôle de sauvegarde | `THREAT_MODEL.md:63` | 3 j |
| 29 | **Idempotency-Key** : l'en-tête est déjà autorisé en CORS (`app.ts:90`) mais n'est traité nulle part ; `POST /api/transactions` reste sujet à la double soumission | Y-16 | 2 j |
| 30 | **DAST + revue de sécurité indépendante** avant ouverture publique | `SECURITY.md:61-62` | — |

---

## 6. Angles morts

Ce que je **n'ai pas pu** vérifier depuis le code seul, et ce qu'il me faudrait.

**Vérifiable uniquement en dynamique**
1. **La RLS se comporte-t-elle réellement comme le SQL le laisse penser ?** J'ai lu les politiques et je les crois correctes, mais je n'ai pas exécuté les migrations ni tenté une lecture inter-tenant. Y-01 en particulier repose sur mon interprétation du filtrage RLS d'un `UPDATE` — c'est le comportement standard de PostgreSQL, mais cela mérite un test. *Il me faudrait : un `docker compose up` avec deux comptes, deux espaces, et un utilisateur membre des deux.*
2. **Y-09 (énumération temporelle)** — mesurable seulement au chronomètre, sur 200 requêtes contre une adresse existante puis inexistante.
3. **Y-02** — le comportement exact de `proxy-addr` avec `trustProxy: true` doit être confirmé par un `curl -H "X-Forwarded-For: 1.2.3.4"` répété au-delà du quota.
4. **Le `keyGenerator` accédant à `request.body`** (mon correctif Y-02) fonctionne-t-il avec `@fastify/rate-limit` en mode global ? À valider avant de l'adopter.
5. **Comportement des cookies `SameSite=Strict` en cross-origin** — la configuration de développement (`localhost:5173` → `127.0.0.1:4000`) est *cross-site* au sens des navigateurs ; le refresh peut échouer silencieusement sur Chrome/Safari. À tester, et à trancher pour la production (API en sous-domaine du frontend, ou passage en `SameSite=Lax` avec double-submit).

**Non auditable depuis ce dépôt**
6. **Toute l'infrastructure et la CI/CD** — pas de Dockerfile applicatif, pas d'IaC, pas de pipeline, pas de configuration de reverse proxy, pas de politique IAM, pas de configuration de bucket. Le domaine 14 est intégralement hors périmètre. *Il me faudrait : le Dockerfile de production, les manifestes de déploiement, la configuration nginx/Traefik, les fichiers de workflow CI.*
7. **La configuration de production réelle** — les valeurs de `NODE_ENV`, `APP_ORIGIN`, `TRUST_PROXY`, `SMTP_*` en recette et en production. `config.ts:51-61` impose HTTPS et SMTP en production, ce qui est un bon garde-fou, mais je n'ai vu aucune instance déployée.
8. **La configuration SPF / DKIM / DMARC** du domaine expéditeur, et le fournisseur SMTP retenu — l'usurpation d'un email « Yahro » de réinitialisation est un vecteur de phishing direct sur ce produit.
9. **Le durcissement PostgreSQL au-delà du script d'init** — `pg_hba.conf`, chiffrement au repos, rôle de sauvegarde, `row_security=off`. Le `docker-init.sh` est correct (`NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`, `statement_timeout=10s`) mais ne couvre que le rôle applicatif.
10. **`src/components/ui/saa-s-template.tsx` (57 Ko) et `landing-page.tsx` (48 Ko)** — lus en recherche ciblée (aucun `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write`, aucun accès `localStorage` hors préférence de langue), pas ligne à ligne. Le risque résiduel XSS y est faible mais non nul.

**Les 8 questions qui m'aideraient le plus**
1. Quel est l'horizon d'ouverture des **espaces partagés / invitations** ? C'est le déclencheur de Y-01 et l'échéance qui conditionne tout le plan.
2. Où l'API et le SPA seront-ils hébergés, et **quel reverse proxy** ? Y-02 et Y-07 dépendent entièrement de cette réponse.
3. **Front et API partageront-ils un domaine parent** (`app.yahro.app` / `api.yahro.app`) ? Cela décide de la viabilité de `SameSite=Strict` et du préfixe `__Host-`.
4. Existe-t-il déjà une **instance de recette ou de production** avec des données réelles, même de test ? Si oui, la rotation de secrets (Y-06) change de nature et d'urgence.
5. Le fichier `backend/.env` que j'ai lu a-t-il **déjà servi ailleurs** que sur votre poste ?
6. Y a-t-il un **pipeline CI**, même embryonnaire, sur lequel greffer les contrôles du point 19 ?
7. Combien d'**utilisateurs réels** aujourd'hui, et sur quel volume de transactions ? Cela calibre l'urgence de Y-10 et Y-11.
8. Souhaitez-vous que je produise directement les **patchs** des quick wins 1 à 12 sous forme de diffs applicables, plutôt que d'extraits ?

---

*Rapport établi le 20 août 2026 par revue manuelle exhaustive du code source. Aucune vulnérabilité listée n'est théorique : chacune est ancrée sur un extrait de code cité avec son chemin et sa ligne. Les constats marqués « À vérifier » ou « Probable » sont explicitement identifiés comme tels et n'ont pas été comptés dans la note globale au même titre que les constats confirmés.*
