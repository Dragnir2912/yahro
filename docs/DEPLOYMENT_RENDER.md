# Déploiement de Yahro sur Render

## Architecture livrée

Le fichier `render.yaml` crée les ressources de production suivantes:

- le frontend statique `yahro-web`;
- l'API `yahro-api`;
- PostgreSQL 17 `yahro-postgres`.

Le fichier `render.staging.yaml` crée une préproduction entièrement séparée sur la branche `staging`. Les données, les domaines, le service de courriel et les secrets doivent être différents entre les deux environnements.

Redis, le worker et le stockage objet seront ajoutés lorsque leur code métier sera implémenté. Le Blueprint ne déclare pas de ressource inutilisée et évite ainsi un coût prématuré.

## Préparation du dépôt

Le dépôt Git local est initialisé sur `main`. Avant le premier envoi distant:

```powershell
npm.cmd run security:tracked-files
git status --short
```

Créer ensuite un dépôt distant privé, puis ajouter son URL comme `origin`. Ne jamais ajouter `.env`, `backend/.env`, `.dev-mail` ou une sauvegarde.

## Secrets à préparer

Exécuter:

```powershell
npm.cmd run secrets:generate
```

Le Blueprint génère automatiquement `YAHRO_APP_PASSWORD`. Les trois autres valeurs produites doivent être fournies à Render:

- `JWT_SECRET`;
- `TOKEN_HASH_PEPPER`;
- `MFA_ENCRYPTION_KEY`.

La procédure de rotation se trouve dans `docs/SECRET_ROTATION.md`.

## Domaines recommandés

Choisir un domaine avant le déploiement public:

```text
app.votre-domaine.com
api.votre-domaine.com
staging.votre-domaine.com
api-staging.votre-domaine.com
```

Pour la production, fournir les valeurs suivantes pendant la création du Blueprint:

```text
VITE_API_URL=https://api.votre-domaine.com
APP_ORIGIN=https://app.votre-domaine.com
PUBLIC_API_ORIGIN=https://api.votre-domaine.com
```

Pour la préproduction, utiliser uniquement les domaines de préproduction. Le cookie de renouvellement utilise `SameSite=Strict`. Le frontend et l'API doivent donc rester sous le même domaine principal.

### Ordre de configuration DNS

1. Déployer d'abord avec les domaines temporaires fournis par Render.
2. Ajouter `api.votre-domaine.com` au service API dans Render.
3. Créer chez le fournisseur DNS l'enregistrement demandé par Render et attendre la validation HTTPS.
4. Ajouter `app.votre-domaine.com` au site statique et valider son enregistrement DNS.
5. Remplacer les trois variables d'origine par les domaines définitifs.
6. Dans `render.yaml`, remplacer `connect-src 'self' https:` par `connect-src 'self' https://api.votre-domaine.com`.
7. Redéployer l'API, puis le frontend, car `VITE_API_URL` est intégrée lors de la compilation.
8. Exécuter la vérification après déploiement depuis les domaines définitifs.

Ne pas conserver `https:` dans la directive CSP après le choix du domaine. Cette valeur facilite le premier déploiement, mais une origine API exacte réduit davantage les possibilités d'exfiltration en cas de faille dans le frontend.

## Service de courriel

Fournir `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` et `SMTP_FROM`. Ajuster `SMTP_PORT` et `SMTP_SECURE` selon le fournisseur. Configurer SPF, DKIM et DMARC avant les invitations réelles.

## Création du Blueprint de production

1. Dans Render, choisir New puis Blueprint.
2. Sélectionner le dépôt privé.
3. Utiliser `render.yaml`.
4. Renseigner les variables marquées `sync: false`.
5. Vérifier que toutes les ressources sont dans la région Frankfurt.
6. Lancer la synchronisation du Blueprint.
7. Attendre le passage de `/health/ready` à l'état sain.
8. Ajouter les domaines personnalisés dans les deux services.
9. Configurer les enregistrements DNS demandés par Render.
10. Redéployer le frontend après confirmation de `VITE_API_URL`.

Avant chaque déploiement, Render exécute `npm run db:prepare`. Cette commande crée ou durcit le rôle `yahro_app`, puis applique les migrations sous un verrou PostgreSQL. L'API dérive ensuite sa connexion limitée et supprime les secrets du propriétaire de son environnement mémoire avant d'écouter le réseau.

## Préproduction

1. Créer une branche distante `staging` à partir de `main`.
2. Créer un second Blueprint en choisissant `render.staging.yaml`.
3. Utiliser des domaines, une base, un SMTP et des secrets différents.
4. Limiter l'accès à la préproduction depuis Render ou un proxy d'accès. L'en-tête `noindex` ne constitue pas une protection d'accès.
5. Protéger l'environnement de production dans Render.
6. Déployer d'abord chaque version sur `staging`.
7. Exécuter la vérification publique et un parcours manuel inscription, confirmation, connexion, MFA et création d'opération.
8. Fusionner vers `main` uniquement après validation.

## Vérification après déploiement

Depuis PowerShell:

```powershell
$env:DEPLOYMENT_FRONTEND_URL="https://app.votre-domaine.com"
$env:DEPLOYMENT_API_URL="https://api.votre-domaine.com"
npm.cmd run verify:deployment
```

La commande contrôle la disponibilité, PostgreSQL, les routes protégées, CORS, HSTS, CSP et les principaux en-têtes. Le workflow GitHub `Deployment check` permet d'exécuter le même contrôle manuellement depuis GitHub Actions.

Compléter avec un compte de test dédié et vérifier:

- inscription, confirmation du courriel et connexion;
- code OTP, MFA TOTP et codes de récupération;
- renouvellement de session et déconnexion;
- modification du profil et avatar;
- création d'un compte financier, d'une catégorie, d'un budget, d'un projet et d'une opération;
- import valide, rejet d'un fichier invalide et respect de la taille maximale;
- erreur 404, affichage mobile, mode clair, mode sombre et changement de langue;
- absence d'erreurs inattendues dans les journaux Render;
- restauration d'une sauvegarde PostgreSQL en préproduction.

Ne jamais utiliser un compte de production pour les tests destructifs.

## Retour arrière

- Utiliser le rollback Render seulement pour le code applicatif.
- Ne pas modifier une migration déjà appliquée.
- Concevoir les futures migrations selon la méthode ajout, bascule, retrait.
- Restaurer PostgreSQL uniquement après confirmation d'une corruption ou perte de données.
- Conserver le site en maintenance pendant toute restauration.

## Passage à plusieurs instances

Avant de changer `numInstances` de 1 à 2:

1. implémenter Redis pour les quotas partagés;
2. sortir les courriels, imports et exports du processus HTTP;
3. tester la charge en préproduction;
4. définir le budget global de connexions PostgreSQL;
5. vérifier la révocation des sessions entre deux instances.

Ne pas activer plusieurs instances avant ces contrôles. Le quota actuel est local à chaque processus.
