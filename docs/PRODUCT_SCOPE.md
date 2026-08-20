# Périmètre fonctionnel de Yahro

## Principes produit

Yahro doit aider une personne ou un foyer à comprendre ses finances, décider rapidement et garder le contrôle sans transformer la gestion du budget en travail comptable.

Le produit est conçu pour fonctionner localement maintenant et pour évoluer vers un SaaS multi-utilisateur plus tard. Chaque donnée métier appartient à un espace financier. Un utilisateur peut appartenir à plusieurs espaces sans mélange de données.

## Fonctionnalités essentielles

### Accueil et découverte

- Landing publique en français et en anglais.
- Modes clair et sombre.
- Présentation des bénéfices, de la confidentialité et des fonctions principales.
- Session de démonstration séparée des données réelles.
- Pages légales, confidentialité et conditions d'utilisation.

### Authentification et compte

- Inscription avec prenom, nom, surnom affiche, pays, adresse email, mot de passe et confirmation du mot de passe.
- Le prenom et le nom servent a l'identite du compte. Le surnom est le seul nom utilise dans l'interface courante.
- Langue, fuseau horaire et devise par defaut enregistres pour adapter les montants et les dates.
- Consentements aux conditions et a la politique de confidentialite dates et lies a leur version.
- Confirmation du mot de passe validee dans le navigateur et par l'API, mais jamais stockee.
- Confirmation obligatoire de l'adresse email.
- Connexion et déconnexion.
- Access token court conservé uniquement en mémoire.
- Refresh token tournant dans un cookie HttpOnly, Secure en production et SameSite Strict.
- Révocation de toutes les sessions après changement de mot de passe.
- Liste des appareils et sessions actives avec révocation individuelle.
- Mot de passe oublié et réinitialisation avec jeton à usage unique.
- Changement d'adresse email avec nouvelle confirmation.
- Suppression du compte avec période de grâce.
- Export complet des données personnelles.
- MFA TOTP avec QR code, OTP à 6 chiffres et codes de récupération à usage unique.
- Préparation future aux clés de sécurité et passkeys WebAuthn.

### Espaces financiers et collaboration

- Espace personnel créé à l'inscription.
- Espaces familiaux ou partagés.
- Invitations par email.
- Rôles Owner, Admin, Member et Viewer.
- Changement de rôle réservé aux administrateurs autorisés.
- Transfert de propriété avec confirmation renforcée.
- Historique des actions sensibles.

### Comptes et portefeuilles

- Comptes courants, épargne, espèces, mobile money, carte, investissement, dette et autres.
- Devise par compte.
- Solde initial et date de référence.
- Archivage sans perte d'historique.
- Réconciliation du solde avec un relevé.
- Transferts internes entre comptes liés par un identifiant commun.
- Vue de la valeur nette avec actifs et dettes.

### Transactions

- Revenus, dépenses et transferts.
- Ajout, modification, suppression logique et restauration.
- Catégorie, compte, date, bénéficiaire, note et tags.
- Transaction ventilée entre plusieurs catégories.
- Pièce jointe ou justificatif avec stockage sécurisé.
- Recherche plein texte et filtres combinables.
- Pagination par curseur.
- Détection des doublons.
- Transactions récurrentes et échéancier.
- Règles automatiques de catégorisation.
- Marquage comme vérifiée ou à contrôler.

### Catégories

- Catégories par défaut à la création d'un espace.
- Catégories personnalisées de revenus et de dépenses.
- Couleur et icône.
- Sous-catégories.
- Fusion et archivage avec réaffectation des transactions.

### Budgets

- Budgets mensuels par catégorie.
- Budget global mensuel.
- Report optionnel du montant non consommé.
- Budgets récurrents ou exceptionnels.
- Seuils d'alerte configurables.
- Comparaison prévu, engagé et réalisé.
- Historique des révisions du budget.
- Notes et objectifs liés au budget.

### Tableau de bord et analyses

- Solde total et valeur nette.
- Revenus, dépenses et taux d'épargne.
- Evolution de trésorerie.
- Dépenses par catégorie, compte et période.
- Progression des budgets.
- Comparaison avec le mois précédent et la moyenne mobile.
- Prévision de fin de mois à partir des opérations récurrentes.
- Tendances sur 3, 6 et 12 mois.
- Indicateurs personnalisables.
- Vue dédiée aux dettes et au remboursement.

### Objectifs financiers

- Objectifs d'épargne avec montant et date cible.
- Contributions manuelles ou automatiques.
- Simulation de date d'atteinte.
- Priorité et compte associé.
- Suivi visuel de progression.

### Import de données

- Import CSV limité à 5 Mo.
- Vérification du type réel du fichier et de son encodage.
- Assistant de correspondance des colonnes.
- Choix du séparateur, du format de date et du signe des montants.
- Aperçu avant import.
- Validation ligne par ligne.
- Détection et résolution des doublons.
- Import atomique ou partiel avec rapport d'erreurs.
- Historique des imports et annulation contrôlée.

### Export et portabilité

- Export CSV filtré.
- Rapport PDF mensuel.
- Export complet JSON pour la portabilité.
- Téléchargement protégé par authentification récente pour les données sensibles.

### Alertes et notifications

- Dépassement imminent ou effectif d'un budget.
- Solde faible.
- Transaction inhabituelle.
- Echéance récurrente proche.
- Objectif en retard ou atteint.
- Notifications dans l'application.
- Préférences email et fréquence de résumé.
- Marquage lu, non lu et archivage.

### Paramètres

- Nom, avatar, langue et fuseau horaire.
- Devise principale et formats régionaux.
- Premier jour du mois budgétaire.
- Préférences de notification.
- Confidentialité, sessions et sécurité.
- Gestion des espaces et membres.
- Import, export et suppression des données.

## Fonctionnalités avancées pertinentes

- Calendrier financier des revenus, factures et échéances.
- Détection des abonnements et hausse de prix.
- Scénarios de type "que se passe-t-il si".
- Prévision de trésorerie à 30, 60 et 90 jours.
- Conseils automatiques basés uniquement sur des données agrégées et avec consentement explicite.
- Synchronisation bancaire future par fournisseur Open Banking.
- Conversion multi-devise avec taux datés et source identifiable.
- Mode hors ligne avec synchronisation conflictuelle contrôlée.
- Widgets personnalisables.
- Raccourcis clavier et accessibilité WCAG 2.2 AA.

## Administration future du SaaS

- Plans et limites par espace.
- Facturation sans exposition des données financières au prestataire de paiement.
- Webhooks signés et idempotents.
- Feature flags.
- Support avec accès temporaire, explicite et audité.
- Tableau de santé sans données financières en clair.
- Conservation configurable et purge vérifiable.

## Ordre de réalisation

### Phase 1

- Socle sécurité, base de données, authentification et espaces.
- Comptes, catégories, transactions et budgets.
- Dashboard avec données réelles.

### Phase 2

- Import CSV, exports, notifications et paramètres.
- Sessions actives, récupération de mot de passe et audit utilisateur.

### Phase 3

- Récurrence, objectifs, règles de catégorisation et collaboration familiale.
- Pièces jointes et rapports avancés.

### Phase 4

- Synchronisation bancaire, prévisions avancées, MFA et facturation SaaS.

## Projets, activités et devises

- Un projet ou une activité est privé à son propriétaire, même dans un espace partagé.
- Chaque projet peut être budgétisé une seule fois, chaque semaine, toutes les deux semaines, chaque mois, chaque trimestre, chaque semestre ou chaque année.
- Le suivi distingue la période courante du cumul depuis la création du projet.
- Chaque dépense précise son moyen de paiement : espèces, virement bancaire, carte bancaire, Mobile Money, portefeuille numérique, prélèvement, chèque ou autre moyen.
- La devise principale est suggérée à partir du pays, puis reste modifiable par l'utilisateur.
- Les conversions affichent toujours le taux, sa source et sa date.
- Un taux personnalisé privé peut remplacer le taux officiel pour une paire de devises donnée.

## Ossature recommandée pour les postes

La classification utilise trois niveaux fonctionnels, mais ne demande pas trois choix à chaque saisie.

1. `Famille` : niveau système stable et obligatoire, commun aux rapports et aux budgets globaux.
2. `Poste` : niveau recommandé, filtré selon la famille et personnalisable par l'utilisateur.
3. `Détail personnel` : précision facultative, privée et réutilisable, présentée comme une étiquette avec saisie automatique plutôt que comme une branche supplémentaire obligatoire.

Principes d'interface :

- Afficher d'abord la famille et le poste. Le détail personnel reste replié sous une action de précision.
- Proposer les postes récents et fréquents avant la liste complète.
- Autoriser une transaction avec la famille seule lorsqu'aucun poste pertinent n'existe encore.
- Appliquer les budgets aux familles ou aux postes. Le détail personnel sert surtout à la recherche et à l'analyse détaillée.
- Archiver ou fusionner un poste au lieu de le supprimer, afin de préserver l'historique.
- Empêcher les doublons normalisés dans un même parent et limiter la profondeur à ces trois niveaux.

Familles de sortie initiales : logement et services, alimentation, transport, santé et bien-être, famille et vie personnelle, éducation et activité professionnelle, loisirs et mode de vie, obligations financières, dons et solidarité, projets et dépenses exceptionnelles.

Familles d'entrée initiales : emploi, activité professionnelle, placements, aides et transferts, entrées exceptionnelles.
