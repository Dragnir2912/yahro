# Déploiement gratuit de Yahro

Cette configuration est destinée à une bêta privée et aux tests. Elle utilise un seul service web Render pour servir l'interface et l'API sur la même adresse. Ce choix conserve les cookies de session en `SameSite=Strict` et évite de relâcher la protection contre les requêtes intersites.

## Services utilisés

- Render Free Web Service pour l'interface et l'API;
- Neon Free pour PostgreSQL;
- Brevo Free pour les courriels transactionnels sur le port 2525;
- le sous-domaine HTTPS `onrender.com` fourni par Render.

Le fichier à importer dans Render est `render.free.yaml`. Les fichiers `render.yaml` et `render.staging.yaml` restent réservés à une future infrastructure payante.

## 1. Créer la base Neon

1. Créer un compte sur https://neon.com et choisir l'offre Free.
2. Créer un projet PostgreSQL dans une région européenne proche de Frankfurt.
3. Ouvrir la section de connexion et sélectionner la connexion directe, non poolée.
4. Copier l'URL complète avec `sslmode=require`.
5. Conserver cette URL uniquement dans les secrets Render sous le nom `DATABASE_MIGRATION_URL`.

La connexion directe est requise pour les migrations et leurs verrous PostgreSQL. Au démarrage, Yahro crée automatiquement le rôle limité `yahro_app`, applique les migrations sous verrou, puis supprime les identifiants privilégiés de la mémoire du serveur avant d'accepter des requêtes.

## 2. Préparer Brevo

1. Créer un compte gratuit sur https://www.brevo.com.
2. Vérifier l'adresse qui enverra les courriels Yahro.
3. Dans la configuration SMTP, relever le nom d'utilisateur et générer une clé SMTP dédiée à Yahro.
4. Ne jamais utiliser le mot de passe du compte Brevo comme clé SMTP.

Le Blueprint configure déjà `smtp-relay.brevo.com`, le port 2525 et STARTTLS. La valeur `SMTP_FROM` doit utiliser l'adresse vérifiée, par exemple `Yahro <adresse-verifiee@example.com>`.

## 3. Générer les secrets Yahro

Dans PowerShell, à la racine du projet:

```powershell
npm.cmd run secrets:generate
```

Copier directement dans Render les valeurs suivantes:

- `JWT_SECRET`;
- `TOKEN_HASH_PEPPER`;
- `MFA_ENCRYPTION_KEY`.

Ne pas enregistrer ces valeurs dans Git, une capture, un document ou un fichier `.env` synchronisé. Render génère séparément `YAHRO_APP_PASSWORD`.

## 4. Créer le Blueprint Render

1. Se connecter à https://dashboard.render.com.
2. Choisir New, puis Blueprint.
3. Sélectionner le dépôt GitHub `Dragnir2912/yahro`.
4. Indiquer `render.free.yaml` comme chemin du Blueprint.
5. Renseigner les secrets demandés:

| Variable | Valeur |
|---|---|
| `DATABASE_MIGRATION_URL` | URL directe Neon complète |
| `JWT_SECRET` | Valeur générée localement |
| `TOKEN_HASH_PEPPER` | Valeur générée localement |
| `MFA_ENCRYPTION_KEY` | Valeur générée localement |
| `SMTP_USER` | Identifiant SMTP Brevo |
| `SMTP_PASSWORD` | Clé SMTP Brevo dédiée |
| `SMTP_FROM` | `Yahro <adresse vérifiée>` |

6. Vérifier que le service sélectionné est bien Free avant de confirmer.
7. Attendre la fin de la compilation et l'état sain de `/health/ready`.

Render fournit automatiquement l'adresse publique au serveur. Il n'est donc pas nécessaire de saisir `APP_ORIGIN`, `PUBLIC_API_ORIGIN` ou `VITE_API_URL` pour cette configuration à service unique.

## 5. Vérifier le déploiement

Remplacer l'adresse ci-dessous par celle affichée par Render:

```powershell
$env:DEPLOYMENT_FRONTEND_URL="https://yahro-free.onrender.com"
$env:DEPLOYMENT_API_URL="https://yahro-free.onrender.com"
npm.cmd run verify:deployment
```

Effectuer ensuite un parcours réel:

1. créer un compte de test;
2. recevoir et ouvrir le lien de confirmation;
3. se connecter et renouveler la page;
4. activer la double authentification;
5. créer une opération, un budget et un projet;
6. se déconnecter puis se reconnecter.

## Limites à connaître

- Render met le service en veille après une période d'inactivité. Le premier affichage suivant peut prendre environ une minute.
- Neon limite le stockage gratuit à 0,5 Go et applique des quotas de calcul et de transfert.
- Brevo limite l'offre gratuite à 300 courriels par jour.
- Les photos de profil sont limitées à 1 Mo sur ce déploiement. Pour préserver la base, privilégier les avatars intégrés pendant la bêta.
- La commande de préparation de la base s'exécute à chaque démarrage, car la commande de prédéploiement Render est payante. Les verrous PostgreSQL et le registre de migrations rendent cette opération répétable.
- Ce montage n'offre ni capacité garantie, ni montée en charge horizontale, ni sauvegarde de production indépendante.

Sans moyen de paiement, un quota dépassé provoque normalement une suspension du service concerné. Il ne faut toutefois activer aucune option payante ni enregistrer de carte avant d'avoir défini un plafond de dépense.
