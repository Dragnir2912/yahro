# Evaluation et traitement de l'audit de securite du 20 aout 2026

Ce document indique ce qui a ete confirme dans `AUDIT_SECURITE_2026-08-20.md`, ce qui a ete corrige et ce qui necessite encore une decision d'exploitation ou de produit. Il ne remplace pas un test d'intrusion independant.

## Corrections appliquees

| Reference | Evaluation | Traitement |
| --- | --- | --- |
| Y-01 | Confirme | La version de securite est enregistree dans chaque session. Le rafraichissement compare la version emise a la version courante. La consultation et la revocation utilisent des fonctions PostgreSQL controlees qui couvrent tous les espaces de l'utilisateur. |
| Y-02 | Confirme | La confiance booleenne dans tous les proxys a ete supprimee. `TRUSTED_PROXIES` n'accepte que des adresses IP ou plages CIDR explicites. Le blocage progressif par compte complete les quotas par adresse IP. |
| Y-03 | Confirme | Cinq echecs declenchent un blocage temporaire progressif, jusqu'a une heure. Les echecs sont journalises et les compteurs sont remis a zero apres une authentification valide. |
| Y-04 | Confirme | Les demandes de taux officiels sont limitees aux devises prises en charge. La reponse distante est lue avec une limite reelle de deux megaoctets, un seul rafraichissement peut etre actif et les taux sont ecrits en lot. |
| Y-05 | Confirme | Toutes les dependances directes sont figees a leur version installee. Les dependances serveur inutilisees ont ete retirees. Les installations documentees utilisent `npm ci`. |
| Y-07 | Confirme | Le jeton de confirmation ou de reinitialisation est retire de l'URL avant le premier rendu. Une politique `no-referrer` et des en-tetes de securite pour l'hebergement statique ont ete ajoutes. La route de reinitialisation a maintenant son propre quota. |
| Y-09 | Probable et mesurable | Les reponses publiques d'inscription, de recuperation et de renvoi utilisent un temps minimal avec une petite variation aleatoire. Le message reste identique que le compte existe ou non. |
| Y-10 | Confirme | L'export exige une authentification datant de moins de dix minutes, est limite a cinq demandes par heure et refuse plus de 50 000 lignes. |
| Y-11 | Confirme | Les routes d'apercu et de validation des imports ont chacune une limite de dix demandes par heure. |
| Y-14 | Confirme | Le plugin de cookies n'utilise plus le pepper comme secret de signature inutile. Le domaine de cookie configurable a ete retire pour conserver la semantique stricte du cookie `__Host-`. |

## Risques reduits mais encore ouverts

| Reference | Etat restant | Action requise avant production |
| --- | --- | --- |
| Y-06 | Le projet et les secrets locaux sont toujours dans un dossier OneDrive. Le rapport peut contenir des valeurs sensibles. | Deplacer le projet hors du dossier synchronise, assainir les copies du rapport et remplacer tous les secrets et mots de passe concernes. Cette operation ne peut pas etre automatisee sans interrompre la base, les sessions et potentiellement la MFA. |
| Y-08 | Les principes de conservation sont documentes, mais le produit ne fournit pas encore l'export complet du compte ni sa suppression ou anonymisation. | Definir les durees legales, le comportement des espaces partages et la reauthentification, puis construire les parcours et la purge planifiee. Ne pas revendiquer une conformite RGPD complete avant cela. |
| Y-12 | Les ecritures de taux sont maintenant bornees et regroupees, mais elles sont encore declenchees par l'API. | Avant plusieurs instances, utiliser une tache planifiee et un role PostgreSQL reserve aux donnees de reference. |
| Y-13 | Le quota en memoire convient a une seule instance. | Configurer un stockage partage, par exemple Redis, avant tout deploiement horizontal. |

## Verification executee

- Migration `0008_security_hardening.sql` appliquee sur PostgreSQL.
- Compilation TypeScript du frontend et du backend reussie.
- Lint frontend reussi.
- 18 tests frontend et 15 tests backend reussis.
- Parcours E2E MFA, liste de sessions et deconnexion globale reussi.
- Parcours E2E projets, isolation, devises officielles et taux personnalises reussi.
- Audit npm de production du frontend et du backend: aucune vulnerabilite connue signalee au moment du controle.

Le test E2E des categories refuse volontairement de s'executer sur la base locale actuelle car son nom ne contient pas `test` ou `e2e`. Cette protection evite de lancer un scenario destructif sur une base de developpement contenant des donnees utiles.
