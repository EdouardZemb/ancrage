# ADR-0002 — Connexion : passkeys, et liens à usage unique générés par le propriétaire

- **Statut** : accepté le 2026-10-15
- **Contexte amont** : brief §2 point 4 et §4 point 2 ; réponses du 15/10 (2 : Edouard envoie
  lui-même les invitations ; 3 : Android d'abord, iOS pas prioritaire)

## Contexte

L'inscription se fait sur invitation, et Edouard décide qui entre. Il transmet lui-même les liens
(WhatsApp, SMS, messagerie). L'usage principal est une application web installée sur un téléphone
Android. Le public tient en une dizaine de personnes. La nLPD demande de collecter le minimum.

## Options

- **A. Lien magique par e-mail.** Il faut un envoi fiable (fournisseur, SPF, DKIM, DMARC) et
  stocker les adresses. Sur iPhone, le lien s'ouvre dans Safari et non dans l'application
  installée, qui a son propre stockage : la connexion n'y arrive pas.
- **B. Mot de passe.** Universel. Mais il faut stocker des empreintes, le mot de passe s'oublie, et
  sa réinitialisation demande un canal (e-mail ou Edouard).
- **C. Passkeys.** La personne déverrouille son téléphone, et c'est tout. Le serveur ne garde que
  des clés publiques. Sur Android, Google les synchronise entre les appareils de la personne. Il
  faut une solution de repli pour récupérer un compte ou ajouter un appareil.
- **D. Fournisseur externe.**
  - *Cloudflare Access* envoie lui-même les codes. Mais creche-planner a montré qu'une session
    expirée casse l'application installée (le service worker reçoit une redirection), et sa
    configuration vit hors du dépôt.
  - *Connexion Google* : Google apprend chaque connexion, et l'application en dépend.

## Décision

**Option C**, avec des liens à usage unique générés par le propriétaire comme seul canal de
secours. **Pas de mot de passe, pas d'e-mail.**

- **Invitation** : le propriétaire la crée dans l'écran d'administration. C'est un lien à usage
  unique, valable 7 jours, partagé par le menu de partage d'Android. La personne qui l'ouvre
  choisit un nom affiché et crée sa passkey. Le compte existe, la session est ouverte.
- **Connexion** : par passkey.
- **Session** : un jeton aléatoire dans un cookie `HttpOnly`, `Secure`, `SameSite=Lax`. Le serveur
  n'en garde que l'empreinte. Elle dure 180 jours et se prolonge à chaque usage. Chaque personne
  voit ses appareils et peut les déconnecter ; le propriétaire aussi.
- **Récupération et nouvel appareil** : le propriétaire génère un lien de connexion à usage
  unique, valable 24 heures, qui permet d'enregistrer une nouvelle passkey. Une personne déjà
  connectée peut s'en générer un pour son autre appareil.
- **Premier compte** : une commande lancée sur le serveur affiche le lien d'invitation du
  propriétaire.
- **Protections** :
  - les jetons d'invitation et de connexion font au moins 128 bits ;
  - ils sont stockés sous forme d'empreinte et comparés en temps constant ;
  - les routes d'invitation et de connexion ont une limite de débit.
- **Environnements** : l'identifiant de la partie de confiance WebAuthn est le nom d'hôte. Le
  staging et la prod ont donc des passkeys distinctes.
- **Tests** : le parcours complet tourne dans Playwright avec un authentificateur WebAuthn
  virtuel (Chromium). Il couvre invitation, passkey, déconnexion, reconnexion et lien de secours.

## Conséquences

- **Coût** : les parcours WebAuthn (une bibliothèque éprouvée, SimpleWebAuthn), l'écran de
  création des liens, la table des sessions.
- **Risques** :
  - un téléphone sans verrouillage d'écran, ou sans services Google, ne peut pas créer de
    passkey. Le propriétaire lui envoie alors un lien de connexion, ce qui reste rare avec des
    sessions de 180 jours ;
  - un téléphone perdu demande un lien d'Edouard. C'est acceptable pour une dizaine de personnes ;
  - iOS fonctionne en principe (passkeys iCloud) mais n'est pas testé à l'étape 1.
- **Difficile à changer** : peu de chose. Ajouter un mot de passe ou des codes par e-mail serait
  un ajout, pas une refonte, puisque l'identité ne dépend pas de la méthode de connexion.
- **Si l'e-mail arrive un jour** : un fournisseur transactionnel, SPF/DKIM/DMARC sur
  `<domaine>`, et des **codes à saisir** plutôt que des liens, à cause d'iOS.

## Révision

À rouvrir si la récupération manuelle devient une charge (au-delà d'une trentaine de personnes),
ou si une personne ne peut durablement pas utiliser de passkey.
