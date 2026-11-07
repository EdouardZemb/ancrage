# ADR-0005 — Pile technique : TypeScript partout, Preact, SQLite, un seul processus

- **Statut** : accepté le 2026-10-15 ; amendé le 2026-11-05 par l'ADR-0011 sur un seul point, la
  disposition du dépôt : `contenus/` est devenu `instance/contenu/`, à côté d'`exemple-contenu/`
- **Contexte amont** : brief §4 point 4 ;
  [ADR-0010 de creche-planner](https://github.com/EdouardZemb/creche-planner/blob/main/docs/adr/0010-ecosysteme-applications-personnelles.md) §4

## Contexte

Ce dont l'application a besoin :

- une application web installable, utilisable hors-ligne, rapide sur un réseau moyen ;
- une petite équipe : Edouard et Claude ;
- un seul serveur et une seule base, sans microservices.

Ce qui existe déjà :

- **le prototype** : 2 262 lignes de JavaScript sans framework, où la logique et l'affichage sont
  mêlés, et des tests qui tournent dans Node ;
- **creche-planner** : TypeScript, React 19 + Vite + vite-plugin-pwa, NestJS, Postgres avec
  Drizzle, Nx. L'outillage est connu, mais l'ensemble est surdimensionné ici.

L'ADR-0010 exige les mêmes familles de garde-fous que creche-planner, pas le même outillage.

## Options

- **A. TypeScript de bout en bout** : un serveur Node, une interface Preact construite par Vite,
  SQLite.
- **B. Garder le JavaScript du prototype** et lui ajouter une petite API. Le plus rapide
  aujourd'hui, mais l'administration et l'éditeur obligeront à refaire l'interface.
- **C. Python (Django ou FastAPI) avec HTMX.** L'administration est fournie, mais le hors-ligne
  est difficile et la logique de jugement des réponses serait écrite deux fois, côté serveur et
  côté téléphone.
- **D. Un métaframework (SvelteKit, Next).** Le rendu serveur ne sert à rien derrière une
  connexion et pour une application hors-ligne. C'est de la complexité en plus.
- **E. La pile de creche-planner.** Microservices, NATS, une base par service : sans objet ici.

## Décision

**Option A.**

- **Un dépôt, un seul paquet** (pnpm), sans outil de monorepo :
  - `src/domaine` : la logique pure, partagée entre client et serveur. Jugement des réponses,
    planification, règles d'accès, schémas de contenu ;
  - `src/serveur` : l'API, l'authentification, la base, le chargement du contenu ;
  - `src/client` : l'interface et le service worker ;
  - plus `contenus/`, `deploiement/` et `scripts/`.
- **Serveur** : Node 24 LTS. Le framework HTTP (Fastify) est un choix d'implémentation, pas une
  décision structurante.
- **Interface** : Preact avec Vite et vite-plugin-pwa (Workbox).
  - Preact pèse environ 4 ko, contre une cinquantaine pour React, et s'écrit de la même façon que
    le React de creche-planner.
  - La logique pédagogique du prototype passe **telle quelle** dans `src/domaine`. Ses vues sont
    réécrites en composants au comportement identique, ce que vérifient les tests repris et les
    tests de bout en bout.
  - **Polices hébergées par l'application** : le prototype les chargeait depuis Google Fonts. Ce
    serait une requête vers un tiers à chaque ouverture, et rien ne s'afficherait correctement
    hors-ligne.
- **Base** : SQLite en mode WAL, via Drizzle, avec des migrations SQL versionnées. Pourquoi pas
  Postgres :
  - pour une dizaine de personnes et un processus, SQLite suffit largement ;
  - pas de conteneur de plus ;
  - une sauvegarde se résume à copier un fichier ;
  - les tests tournent sur le même moteur que la production.
- **Conteneurs** : `app` (Node sert l'API et l'interface) et `cloudflared`. Pas de proxy inverse :
  le tunnel parle directement à `app`. Le seul port publié l'est sur `127.0.0.1`, pour la sonde
  de santé.
- **Tests** :
  - Vitest pour le domaine, et pour l'API sur une base SQLite en mémoire ;
  - Playwright en profil Android (Pixel 7, Chromium), avec un authentificateur WebAuthn virtuel ;
  - Stryker pour les tests de mutation sur le domaine ;
  - la validation du contenu.

## Conséquences

- **Une seule langue** pour le domaine, le serveur, l'interface, les tests et les scripts.
- **Le plus gros coût de l'étape 1** est la réécriture des vues. Il est accepté, parce que les
  écrans d'administration puis l'éditeur l'imposeraient de toute façon. La pédagogie, elle,
  n'est pas réécrite.
- **Difficile à changer** :
  - le langage : élevé ;
  - le framework d'interface et le moteur de base : moyen. Drizzle connaît aussi Postgres ; il
    faudrait copier les données et reprendre les migrations.

## Révision

- **Postgres** devient pertinent avec plusieurs processus écrivant en même temps, ou au-delà
  d'une centaine de personnes actives.
- **Un ADR à part** est nécessaire si l'éditeur demande une édition riche.
