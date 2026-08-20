# Yahro

Yahro est une application de gestion de budget personnel et familial. Le nom reunit les initiales YAH et le grec `rheo`, qui evoque le flux et le mouvement.

Le projet contient maintenant:

- un frontend React, TypeScript, Tailwind CSS et structure shadcn/ui;
- une landing page et un tableau de bord responsive en francais et en anglais;
- des themes clair et sombre;
- une API Fastify TypeScript;
- PostgreSQL 17 avec migrations, contraintes multi-espace et RLS force;
- authentification, MFA TOTP, sessions tournantes, comptes, categories, transactions, budgets, imports, exports, notifications et audit.

## Demarrage complet recommande

Prerequis: Node.js 22 ou plus recent, Docker Desktop demarre, puis `npm ci` a la racine et dans `backend`.

Depuis la racine du projet, une seule commande demarre PostgreSQL, applique les migrations, puis lance l'API et le frontend:

```powershell
npm.cmd run dev:all
```

Sous Windows, vous pouvez aussi double-cliquer sur `start-yahro.cmd` a la racine du projet.

La commande reutilise les services deja actifs et affiche un diagnostic clair si une etape echoue.

- Frontend: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:4000`
- PostgreSQL: `127.0.0.1:55432`
- Emails locaux: `backend/.dev-mail`

## Demarrage separe du frontend

Prerequis: Node.js 22 ou plus recent.

```bash
npm ci
npm run dev
```

Le frontend est disponible sur `http://127.0.0.1:5173`.

## Demarrage separe du backend

1. Copier `.env.example` vers `.env` et `backend/.env.example` vers `backend/.env`.
2. Remplacer toutes les valeurs `CHANGE_ME` par des valeurs aleatoires distinctes.
3. Demarrer PostgreSQL et appliquer la migration.
4. Lancer l'API.

```bash
docker compose up -d --wait
cd backend
npm ci
npm run db:migrate
npm run dev
```

L'API est disponible sur `http://127.0.0.1:4000`. Les emails de developpement sont captures dans `backend/.dev-mail` avec des permissions restreintes.

## Controles

Frontend:

```bash
npm run lint
npm test
npm run build
```

Backend:

```bash
cd backend
npm run build
npm test
npm audit --omit=dev
```

## Deploiement

Le paquet Render se trouve dans `render.yaml`. Une preproduction separee est definie dans `render.staging.yaml`.

- Guide complet: `docs/DEPLOYMENT_RENDER.md`
- Generation et rotation des secrets: `docs/SECRET_ROTATION.md`
- Verification publique: `npm run verify:deployment`
- Controle des fichiers sensibles suivis par Git: `npm run security:tracked-files`

## Structure

- Composants UI: `src/components/ui`
- Styles Tailwind: `src/index.css`
- Configuration shadcn: `components.json`
- API: `backend/src`
- Migration SQL: `backend/migrations`
- Catalogue fonctionnel: `docs/PRODUCT_SCOPE.md`
- Modele de menaces: `docs/THREAT_MODEL.md`
- Etat de securite: `SECURITY.md`

## Identite Yahro

- Logo final: `public/brand/yahro-mark.png`
- Source generee: `public/brand/yahro-mark-source.png`
- Favicon: `public/favicon.png`
- Couleurs: noir mineral `#171813`, vert sauge `#8DAA68`, or ancien `#B58B4D`, ivoire `#F7F7F3`

## Etat du produit

Le backend de fondation et les premiers domaines metier sont operationnels. L'inscription, la confirmation d'email, la connexion, la restauration de session, la reinitialisation du mot de passe et la MFA sont reliees au frontend. Le tableau de bord financier visible reste encore alimente par des donnees de demonstration. La prochaine tranche consiste a connecter ses indicateurs et a completer les ecrans Comptes, Transactions, Budgets et Imports.
