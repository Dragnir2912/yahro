# Modèle de menaces Yahro

## Actifs sensibles

- Identifiants, mots de passe hashés et jetons de session.
- Transactions, soldes, budgets, revenus et dettes.
- Adresses email, profil et préférences.
- Pièces jointes et relevés importés.
- Clés de chiffrement, secrets de signature et accès à la base.
- Journaux d'audit et sauvegardes.

## Frontières de confiance

- Navigateur vers API.
- API vers PostgreSQL.
- API vers service SMTP.
- API vers stockage de fichiers futur.
- Tâche de sauvegarde vers stockage de sauvegarde.
- Webhook externe vers API future.

## Menaces prioritaires

### Vol de compte

Risques : brute force, credential stuffing, reset détourné, session volée et fixation de session.

Contrôles : Argon2id, rate limiting par IP et compte, réponses génériques, confirmation email, jetons à usage unique hashés, rotation des refresh tokens, cookie HttpOnly, expiration courte, révocation et préparation MFA.

### Fuite entre espaces

Risques : IDOR, oubli du filtre tenant, rôle falsifié et cache partagé.

Contrôles : espace extrait du jeton signé, vérification de membership sur chaque requête, filtre tenant côté application, RLS PostgreSQL, clés de cache préfixées par tenant et tests négatifs inter-tenant.

### Injection et entrées hostiles

Risques : injection SQL, CSV formula injection, XSS stockée, path traversal et payload excessif.

Contrôles : ORM et paramètres SQL, Zod strict, échappement des cellules CSV, React sans HTML arbitraire, noms de fichiers générés, limites de taille et profondeur JSON.

### Import malveillant

Risques : faux type MIME, fichier trop volumineux, zip bomb, CSV pathologique et contenu déclenchant une formule.

Contrôles : un fichier maximum, limite 5 Mo, détection par signature et structure, traitement en mémoire borné, limite de lignes et colonnes, aucune exécution de contenu et neutralisation des cellules exportées.

### Altération financière

Risques : modification non autorisée, double soumission, suppression cachée et concurrence sur les soldes.

Contrôles : rôles, transactions PostgreSQL, idempotency keys, montants décimaux, suppression logique, audit append-only et verrouillage optimiste pour les opérations sensibles.

### Exposition par les logs et erreurs

Risques : stack trace, mots de passe, jetons, cookies ou données financières dans les logs.

Contrôles : redaction Pino, erreurs publiques génériques, request ID, détails réservés au serveur et interdiction des logs de corps de requête.

### Perte de données

Risques : erreur humaine, corruption, ransomware et sauvegarde incomplète à cause de RLS.

Contrôles : sauvegardes automatisées chiffrées, rôle de sauvegarde dédié, `row_security=off` pour échouer si des lignes sont filtrées, rétention, contrôle d'intégrité et tests réguliers de restauration.

### Catégories et taux de change

Risques : accès à un détail personnel appartenant à un autre utilisateur, arbre cyclique, doublons trompeurs, modification destructive de l'historique, taux distant indisponible, obsolète, mal formé ou trop volumineux, et manipulation d'un taux personnalisé.

Contrôles : RLS et vérification explicite du propriétaire, profondeur maximale, type entrée ou sortie cohérent dans toute la branche, unicité des noms normalisés par parent, archivage ou fusion avec audit au lieu d'une suppression physique, URL HTTPS fixe pour le fournisseur officiel, délai maximal, taille de réponse bornée, validation stricte, cache daté, source et date visibles, calcul décimal PostgreSQL, version optimiste et journalisation des taux personnalisés.

## Règles non négociables

- Refus par défaut pour les autorisations.
- Aucun identifiant d'espace accepté aveuglément depuis le corps ou les paramètres.
- Aucun secret dans le frontend, les logs ou Git.
- Aucun jeton d'authentification dans localStorage ou sessionStorage.
- Aucune route métier sans validation et vérification d'autorisation.
- Aucune mise en production sans HTTPS, migrations contrôlées, sauvegarde et test de restauration.
- Toute exception de sécurité doit être documentée, limitée dans le temps et approuvée.
