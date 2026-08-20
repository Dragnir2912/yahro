# Securite de Yahro

## Etat actuel

Le backend implemente deja les controles suivants:

- mots de passe hashes avec Argon2id;
- confirmation d'email et reinitialisation par jetons aleatoires a usage unique;
- access token signe HS512, court et destine a rester en memoire;
- refresh token tournant dans un cookie HttpOnly, SameSite Strict et Secure en production;
- detection de reutilisation d'un refresh token et revocation de sa famille;
- revocation individuelle ou globale des sessions;
- invalidation de toutes les sessions apres changement de mot de passe;
- double authentification TOTP conforme au pas de 30 secondes de RFC 6238;
- secret TOTP chiffre par AES-256-GCM avec une cle dediee;
- code OTP refuse apres une premiere utilisation dans la meme fenetre;
- cinq essais maximum par challenge MFA de cinq minutes;
- dix codes de recuperation a usage unique, stockes uniquement sous forme de HMAC;
- mot de passe et second facteur obligatoires pour desactiver la MFA;
- revocation des autres sessions a l'activation et de toutes les sessions a la desactivation;
- controle des roles Owner, Admin, Member et Viewer;
- isolation par espace a trois niveaux: filtres applicatifs, cles etrangeres composites et PostgreSQL RLS;
- verification de l'appartenance utilisateur dans les politiques RLS;
- role PostgreSQL d'execution sans superuser, sans creation de role et sans BYPASSRLS;
- validation stricte Zod et limites de taille sur les requetes;
- confirmation du mot de passe exigee a l'inscription et jamais persistee;
- collecte initiale limitee aux donnees necessaires: identite, surnom, pays et preferences regionales;
- date et version des consentements legaux conservees pour assurer leur tracabilite;
- CORS limite aux origines explicites, aucun joker;
- en-tetes de securite, CSP restrictive et HSTS en production;
- limitation globale et renforcee des routes d'authentification;
- blocage temporaire progressif apres cinq mots de passe incorrects et journalisation des echecs;
- revocation des sessions et verification de leur version a l'echelle de tous les espaces de l'utilisateur;
- liste de proxys de confiance explicite par adresse IP ou plage CIDR, sans confiance globale;
- import CSV limite, decode UTF-8 strict, rejet des fichiers binaires et controle ligne par ligne;
- export CSV protege contre l'injection de formules, limite a 50 000 lignes, soumis a quota et a une authentification recente;
- fournisseur de taux limite aux devises prises en charge, lecture bornee, rafraichissement unique et ecriture groupee;
- suppression immediate des jetons a usage unique de la barre d'adresse et politique de referent stricte;
- versions exactes des dependances conservees dans les manifestes et les fichiers de verrouillage;
- journal d'audit immuable en base;
- redaction des mots de passe, cookies et tokens dans les journaux;
- redaction explicite de la confirmation du mot de passe dans les journaux;
- erreurs publiques generiques sans stack ni detail SQL;
- audit npm sans vulnerabilite connue au 19 aout 2026.

La migration a ete executee sur `postgres:17-alpine`. Un test reel a confirme qu'un utilisateur voit les donnees de son espace et aucune ligne d'un autre espace, meme si un identifiant de tenant different est force dans le contexte SQL.

## Regles de secrets

- Ne jamais commiter `.env`, une sauvegarde, une cle ou un fichier de capture email.
- Generer un `JWT_SECRET`, un `TOKEN_HASH_PEPPER` et deux mots de passe PostgreSQL differents et aleatoires.
- Ne jamais reutiliser les secrets de developpement en recette ou en production.
- Ne placer aucun secret dans une variable commencant par `VITE_`, car elle est publique dans le navigateur.
- Utiliser un gestionnaire de secrets en production et prevoir la rotation.
- Ne pas conserver le projet, `.env`, `.dev-mail`, les sauvegardes ou les journaux dans OneDrive, Dropbox, Google Drive ou un autre dossier synchronise.
- Un secret copie dans un rapport, une capture, un ticket ou un dossier synchronise doit etre considere comme compromis et remplace.

## Etat operationnel au 20 aout 2026

Le code ne peut pas corriger seul l'emplacement local actuel du projet ni remplacer les secrets sans interrompre la base et les sessions. Avant toute exposition sur Internet, le proprietaire doit:

1. deplacer le projet hors de `OneDrive - ENSEA` vers un dossier local non synchronise;
2. remplacer les mots de passe PostgreSQL, `JWT_SECRET`, `TOKEN_HASH_PEPPER` et `MFA_ENCRYPTION_KEY`;
3. invalider les sessions existantes et reconfigurer la MFA si la cle de chiffrement est remplacee;
4. supprimer ou assainir toute copie du rapport d'audit contenant des valeurs reelles;
5. definir `TRUSTED_PROXIES` uniquement avec les adresses ou plages CIDR du reverse proxy effectivement utilise.

## Exigences avant production

Les points suivants restent obligatoires avant une ouverture publique:

- terminer les tests d'integration HTTP avec une base PostgreSQL ephemere en CI;
- ajouter WebAuthn ou des passkeys comme facteur resistant au phishing;
- exiger une authentification recente pour le changement d'email et la suppression de compte;
- brancher un service email avec SPF, DKIM et DMARC;
- placer l'API derriere un reverse proxy TLS correctement configure;
- configurer des sauvegardes chiffrees, hors site et testees par restauration;
- centraliser les journaux sans donnees financieres en clair et creer des alertes de securite;
- executer un SAST, un scanner de secrets, un audit de dependances et un DAST en CI;
- faire realiser une revue de securite independante avant le SaaS;
- definir la conservation, la purge, la reponse aux incidents et la notification des utilisateurs.
- fournir l'export complet des donnees personnelles et la suppression ou anonymisation du compte;
- utiliser un stockage partage pour les quotas avant un deploiement avec plusieurs instances;
- publier une CSP complete sur le frontend via les en-tetes de l'hebergeur;
- deplacer le rafraichissement des taux officiels vers une tache planifiee avec un role PostgreSQL dedie.

## Controle local

```bash
cd backend
npm run build
npm test
npm run test:e2e:mfa
npm audit --omit=dev
```

Le frontend doit aussi passer `npm run lint`, `npm test` et `npm run build` a la racine.

## Signalement

Ne pas publier une vulnerabilite contenant des donnees reelles dans une issue publique. Documenter le scenario, l'impact, la version et les etapes de reproduction minimales, puis utiliser un canal prive defini avant la mise en ligne.
