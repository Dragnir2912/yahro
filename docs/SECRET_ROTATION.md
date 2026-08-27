# Génération et rotation des secrets Yahro

## Génération initiale

Exécuter cette commande sur une machine de confiance:

```powershell
npm.cmd run secrets:generate
```

Copier directement les quatre valeurs dans le gestionnaire de secrets Render. Ne pas les enregistrer dans un fichier, une capture, un ticket ou un message.

## Règles générales

- Utiliser des valeurs différentes en développement, préproduction et production.
- Effectuer une sauvegarde et vérifier sa restauration avant une rotation de base ou de MFA.
- Ne jamais remplacer plusieurs familles de secrets au cours de la même opération.
- Programmer les rotations sensibles dans une fenêtre de maintenance tant que Yahro ne dispose pas encore d'un trousseau multi-clé.
- Vérifier `/health/ready`, la connexion, la MFA et le renouvellement de session après chaque rotation.

## Mot de passe `yahro_app`

Sur Neon, le propriétaire de la base peut créer `yahro_app` sans nécessairement être autorisé à le modifier ensuite. La rotation doit donc être initiée dans Neon:

1. Activer le mode maintenance.
2. Dans Neon, ouvrir la gestion des rôles et réinitialiser le mot de passe de `yahro_app`.
3. Copier immédiatement ce nouveau mot de passe dans `YAHRO_APP_PASSWORD` sur Render.
4. Lancer manuellement un déploiement. `db:bootstrap` vérifie alors les restrictions du rôle et sa connexion réelle avant de démarrer l'API.
5. Vérifier la santé et une requête authentifiée.
6. Quitter le mode maintenance.

Sur un PostgreSQL local qui autorise `ALTER ROLE`, `db:bootstrap` peut toujours appliquer directement la valeur configurée.

Cette rotation provoque une courte interruption des anciennes instances. Une rotation sans interruption nécessitera deux rôles alternés, par exemple `yahro_app_a` et `yahro_app_b`.

## `JWT_SECRET`

Le changement invalide immédiatement les jetons d'accès existants. Les jetons de renouvellement restent utilisables et permettent d'obtenir un nouveau jeton après le déploiement.

1. Activer le mode maintenance.
2. Remplacer le secret sur toutes les instances.
3. Redéployer l'API.
4. Vérifier la restauration de session.
5. Quitter le mode maintenance.

Une rotation sans maintenance exigera un trousseau JWT avec identifiants de clé `kid`.

## `TOKEN_HASH_PEPPER`

Le changement invalide les jetons de renouvellement, les jetons à usage unique et les codes de récupération MFA existants.

1. Informer les utilisateurs d'une déconnexion globale.
2. Activer le mode maintenance.
3. Remplacer le pepper.
4. Révoquer toutes les sessions et supprimer les jetons à usage unique encore actifs.
5. Demander aux utilisateurs MFA de générer de nouveaux codes de récupération.
6. Redéployer puis vérifier les parcours d'authentification.

## `MFA_ENCRYPTION_KEY`

Ne pas remplacer directement cette valeur. Les secrets TOTP existants deviendraient indéchiffrables. Une migration versionnée doit d'abord déchiffrer chaque secret avec l'ancienne clé et le rechiffrer avec la nouvelle. Si l'ancienne clé est perdue, les utilisateurs concernés devront reconfigurer leur MFA après une procédure de récupération contrôlée.

## Identifiants du propriétaire de migration

Ces identifiants sont gérés par le fournisseur PostgreSQL, Neon pour le déploiement gratuit. Utiliser sa fonction de réinitialisation, mettre à jour `DATABASE_MIGRATION_URL`, vérifier une migration sans changement, puis retirer l'ancien identifiant seulement après confirmation qu'il n'est plus utilisé. Le propriétaire peut porter un nom différent de `yahro_owner`: le moteur de migration utilise automatiquement le rôle fourni par cette URL.
