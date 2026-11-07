# Lot 1f — décisions et arbitrages

Le lot 1f (issue ancrage-donnees#65, v0.5.1) a soldé les suites non bloquantes du lot 1e, pour que le code soit
plus sûr à faire évoluer avant l'étape 2. Rien n'a changé pour l'apprenante, qui utilise la prod depuis le
18/10/2026 :
- la prochaine migration est préparée : l'additivité se dérive de la base d'avant, et le démarrage
  du serveur se teste ;
- des tests prouvent ce qu'ils annoncent (suppression, export, liens, déconnexion, bout en bout) ;
- une porte de duplication (jscpd) tourne en CI, et les 59 copies trouvées sont retirées ;
- quelques corrections visibles : le cookie effacé sur un 404, une erreur par fiche dans
  l'administration, « ← Accueil » dans le filet, un magasin de limitation de débit qui oublie
  l'adresse, « cet appareil » ;
- la mutation couvre l'export, la purge et la suppression, et les alertes Dependabot sont
  fermées.

Son plan a été supprimé à la clôture, comme le veut la méthode. Ce document en garde deux choses,
avec leurs numéros, parce que le code et les tests y renvoient :
- les décisions du plan (« 1f-D<n> ») ;
- les arbitrages faits pendant l'exécution (« 1f-R<n> »).

Il dit ce qui a été décidé, et pourquoi. **Le comportement, lui, est fixé par le code et les
tests.**

## Les décisions du plan (20/10/2026)

Elles reprennent les réponses d'Edouard aux sept questions du cadrage (commentaire du 20/10/2026
sur ancrage-donnees#65 : « OK pour tous les défauts »). Quand un arbitrage en a précisé une, la ligne le dit.

1. **1f-D1, rien ne change pour l'apprenante** :
   - ni migration, ni route ou champ de réponse retirés, ni en-tête rendu obligatoire ;
   - le texte de la notice (`src/client/notice.ts`) et `NOTICE_VERSION` ne changent pas ;
   - le lot finit par la v0.5.1, avec l'accord d'Edouard.
2. **1f-D2, hors du lot, à l'étape 2** : l'effacement des autres appareils après une suppression
   (`compte_supprime`), et le resserrement de la phrase de la notice sur l'adresse IP. Ces deux
   points changent la notice, qui changera de toute façon pour la classe.
3. **1f-D3, le code aléatoire de l'appareil reste après la déconnexion**, comme la notice le dit.
4. **1f-D4, porte de duplication** : jscpd `^5.4.1` en CI (`corepack pnpm duplication`), sur
   `src/`, `e2e/` et `scripts/`, tests compris, hors `scripts/modele/` (géré par le modèle).
   - Il refuse toute copie de 10 lignes ou plus (`minLines: 10`, `threshold: 0`). Au sens de
     jscpd, c'est 10 lignes **et** 50 jetons, son seuil par défaut.
   - Une exception se marque dans le code, entre `// jscpd:ignore-start — <raison>` et
     `// jscpd:ignore-end`. Il n'en reste aucune à la clôture.
   - C'est la porte du motif AM-1 du registre (1f-R7).
5. **1f-D5, dépendances** : `qs` monte en 6.16 ou plus, et esbuild est forcé en `^0.25.12` sous
   `@esbuild-kit/core-utils`, par `pnpm.overrides` (1f-R11).
6. **1f-D6, l'essai du rejeu à la main** est fait par Edouard, depuis sa fiche
   (`2026-10-20-ancrage-essai-rejeu-du-registre.md`). Il ne bloque pas le lot.
7. **1f-D7, additivité des migrations, dérivée de la base d'avant** (`verifierAdditivite`,
   `src/serveur/base/schema.fixture.ts`) :
   - les tables comparées sont celles qui existent avant de migrer, sans liste écrite à la main ;
   - `NOMBRE_DE_MIGRATIONS` est lu dans `meta/_journal.json` ;
   - un seul test paramétré couvre chaque version : une migration ajoutée a son test sans rien
     écrire ;
   - aucune migration ne contient `DROP` ni `RENAME`.

   Ce que « additif » permet est précisé par 1f-R1 et 1f-R12.
8. **1f-D8, le démarrage du serveur devient testable** : `demarrerServeur`
   (`src/serveur/serveur.ts`) fait ce que faisait `servir`. `main.ts` ne garde que la lecture de
   la configuration, les contenus et les signaux (1f-R2).
9. **1f-D9, le magasin de limitation de débit oublie une adresse à la fin de sa fenêtre**
   (`MagasinQuiOublie`, `src/serveur/comptes/magasin-debit.ts`). Il compte comme le magasin par
   défaut et garde le même plafond de 5000 clés (1f-R9). La notice reste vraie (« au plus tard au
   redémarrage ») et ne change pas.
10. **1f-D10, administration** :
    - chaque fiche de personne a son état d'échec, affiché dans la fiche (1f-R8) ;
    - « Supprimer le compte » ne s'affiche que face à un serveur du lot 1e ou plus récent, comme
      les passkeys : `personne.passkeys !== undefined`.
11. **1f-D11, le filet de l'écran offre « ← Accueil »** (`retour_accueil`), sauf sur l'accueil
    lui-même.
12. **1f-D12, un 404 « personne disparue » efface le cookie de session**, sur `PATCH /api/moi`,
    `DELETE /api/moi` et `GET /api/moi/export`, par `fermerSession`.
13. **1f-D13, « cet appareil »** : `compte_supprime_appareil_non_efface` est le seul texte à
    changer (fr et de). « avec ton téléphone » (`invitation_intro`) reste, car c'est bien le
    téléphone qui déverrouille la passkey. Le texte allemand changé (n° 228) est dans la liste de
    relecture.
14. **1f-D14, découpages** :
    - la section des liens de `depot.ts` passe dans `depot-liens.ts`, et `depot.ts` réexporte ses
      types (1f-R5) ;
    - `Compte.tsx` perd ses sections « Se déconnecter » et « Mes données » (1f-R6) ;
    - `deploiement/lib.sh` ne change pas : `verifier_copie` et `rejouer_registre` ont des contrats
      différents, et les fusionner toucherait la restauration, qui garde les données de l'apprenante.
15. **1f-D15, tests « simultanés »** : better-sqlite3 est synchrone, donc aucun test du dépôt ne
    produit une vraie course. Ces tests sont renommés pour dire ce qu'ils prouvent (« depuis deux
    connexions ») ; le test de route garde son `Promise.all`, qui entrelace réellement les
    requêtes.

## Les arbitrages de l'exécution (20-21/10/2026)

- **1f-R1** : « additif » accepte ce que l'invariant 8 accepte : une colonne ajoutée facultative
  ou avec un défaut, et un index ajouté sur une table existante (sauf 1f-R12). Sans cela, la
  première migration de l'étape 2 qui ajoute une colonne aurait été refusée.
- **1f-R2** : `demarrerServeur` accepte aussi `options.journal`, pour une sortie de test propre.
  Un échec de démarrage ferme tout ce qui est ouvert (purge, application, base) sans masquer
  l'erreur d'origine.
- **1f-R3** : `asc(cours)` reste dans le tri de l'export. Il est inobservable (le regroupement suit
  `coursVisibles`, et le tri par numéro suffit dans chaque cours) et ne coûte rien. Stryker n'a
  pas de mutateur pour un argument d'`orderBy` : il ne pouvait ni le confirmer ni l'infirmer.
- **1f-R4** : après une déconnexion dont l'effacement local échoue, l'appareil reste à la personne
  (`moiLocal`), pour qu'elle puisse retenter la déconnexion, qui retente l'effacement. Oublier la
  personne demanderait l'IndexedDB qui vient d'échouer.
- **1f-R5** : `creerDepotLiens(base, maintenant)` reçoit l'horloge de `creerDepot`, sans la
  recopier.
- **1f-R6** : l'état de la déconnexion vit dans `useDeconnexion()`, appelé par `Compte` : le choix
  de la langue partage l'action et remet l'abandon à zéro.
- **1f-R7** : `.jscpd.json` ignore les déclarations `import` (`ignorePattern`) : une liste
  d'imports n'est pas une copie de logique, et deux fichiers voisins peuvent avoir les mêmes.
  Aucune marque `jscpd:ignore` ne reste.
- **1f-R8** : dans l'administration, le lien de secours reste un état de la section : un seul lien
  secret visible à la fois, comme avant. L'action en cours (`occupe`) est propre à chaque fiche.
- **1f-R9** : `MagasinQuiOublie` évince en LRU, comme le magasin du greffon (une adresse utilisée
  rajeunit), sans réarmer sa minuterie : une adresse est oubliée à la fin de sa fenêtre, comptée
  depuis son premier appel. Une fenêtre trop longue pour `setTimeout` (plus de 2^31-1 ms) est
  refusée, plutôt que de désactiver la limite sans bruit. Un test différentiel compare chaque pas
  au `LocalStore` de `@fastify/rate-limit`.
- **1f-R10** : les fichiers de test mutés n'utilisent pas `describe` : le lanceur Vitest de
  Stryker ne retrouve pas un test rangé dans une suite, et tout mutant survivrait. Le seuil de
  mutation (90 %) est global : le score par fichier se lit dans le rapport.
- **1f-R11** : `qs` vient de Stryker (`typed-rest-client`), et n'est pas une dépendance directe :
  il passe par `pnpm.overrides`. L'override d'esbuild franchit le `~0.18.20` que déclare
  `@esbuild-kit/core-utils` ; drizzle-kit fonctionne avec. Il est à retirer quand drizzle-kit
  abandonnera `@esbuild-kit`. Ni l'un ni l'autre n'entre dans l'image.
- **1f-R12** (revue finale) : `verifierAdditivite` refuse un index UNIQUE nouveau qui porte une
  colonne d'avant d'une table d'avant, et un déclencheur nouveau posé sur une table d'avant :
  l'image précédente les « voit », car ils peuvent refuser ses écritures après un retour arrière.
  Un index UNIQUE sur des colonnes nouvelles seulement, un déclencheur sur une table nouvelle et
  une vue nouvelle restent permis.
- **1f-R13** (revue finale) : `mutation.yml` se déclenche aussi sur les fichiers que les sources
  mutées et leurs tests importent directement ; la passe du lundi rattrape le reste. Son délai
  est de 20 minutes, pour une passe de 9 minutes en CI.
- **1f-R14** (revue finale) : les signaux d'arrêt se branchent une fois le serveur démarré. Un
  arrêt reçu pendant le démarrage tue le processus sans fermeture propre, ce qui est sans danger :
  SQLite en WAL se rétablit.
