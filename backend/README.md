# API Yahro

API Fastify TypeScript avec Drizzle et PostgreSQL 17.

## Modules disponibles

- inscription, verification d'email, connexion et recuperation de mot de passe;
- MFA TOTP, challenges limites, codes de recuperation et notifications de securite;
- refresh tokens tournants et gestion des sessions;
- profil, roles et espaces;
- comptes, categories, transactions et budgets;
- apercu et validation d'import CSV;
- tableau de bord, notifications, journal d'audit et export CSV;
- RLS force et cles composites pour l'isolation multi-espace.

## Variables requises

Copier `.env.example` vers `.env`. Les URL de base utilisent deux roles differents:

- `DATABASE_MIGRATION_URL`: proprietaire utilise uniquement pour les migrations;
- `DATABASE_URL`: role `yahro_app` sans privilege, utilise par le serveur HTTP.

Les secrets doivent contenir au moins 64 caracteres et ne doivent jamais etre commits.

## Commandes

```bash
npm ci
npm run db:migrate
npm run dev
```

Verification:

```bash
npm run build
npm test
npm run test:e2e:mfa
npm audit --omit=dev
```

## Routes principales

- `/api/auth/*`
- `/api/auth/mfa/*`
- `/api/accounts`
- `/api/categories`
- `/api/transactions`
- `/api/budgets`
- `/api/imports/csv/preview`
- `/api/imports/csv/commit`
- `/api/dashboard`
- `/api/notifications`
- `/api/audit-log`
- `/api/exports/transactions.csv`

Toutes les routes metier exigent un access token. Les routes cookie `refresh` et `logout` exigent aussi une origine explicitement autorisee.
