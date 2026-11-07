# Lot 2c — décisions et arbitrages

Le lot 2c (issue ancrage-donnees#79, milestone « Étape 2 — La classe ») a soldé les deux cases encore ouvertes de
ancrage-donnees#79, avant l'ouverture du cours à la classe (ancrage-donnees#9). Rien n'a changé pour l'apprenante, qui utilise la prod
depuis le 18/10/2026 :
- le module `acces` est muté en entier : sa moitié serveur, `src/serveur/acces/index.ts`, rejoint
  sa moitié pure, `src/domaine/acces.ts` (ancrage-donnees#151) ;
- la porte de l'invariant 3, `contenus:client`, trouve un texte de cours sous toutes les écritures
  d'une chaîne JavaScript, mélanges compris (ancrage-donnees#152) ;
- la revue finale a ajouté les tests qui manquaient (ancrage-donnees#155).

Le lot ne touche que des tests et des outils. Il n'a pas d'étiquette propre : la suivante
l'emporte (2c-D9).

Son plan a été supprimé à la clôture, comme le veut la méthode. Ce document en garde deux choses,
avec leurs numéros, parce que le code, les tests et `.github/dependabot.yml` y renvoient :
- les décisions du plan (« 2c-D<n> ») ;
- les arbitrages faits pendant l'exécution (« 2c-R<n> »).

Il dit ce qui a été décidé, et pourquoi. **Le comportement, lui, est fixé par le code et les
tests.**

## Les décisions du plan (01/11/2026)

Edouard les a validées le 01/11/2026 (« ok pour les défauts », sur la PR du plan, ancrage-donnees#146). Quand un
arbitrage en a précisé une, la ligne le dit.

1. **2c-D1, le périmètre** : les deux cases ouvertes de ancrage-donnees#79. La liste imprimable de ancrage-donnees#8, que ancrage-donnees#79
   rangeait dans ce lot, a été faite à part, à la demande d'Edouard (ancrage-donnees#147). Les deux cases déjà
   cochées de ancrage-donnees#79 (la liste blanche du contenu servi, la garde de `resoudreModule`) l'avaient été
   au lot F1.
2. **2c-D2, ce qui est muté** : `src/serveur/acces/index.ts`, et lui seul. `session.ts` et les
   routes restent hors de la mutation : l'ADR-0001 vise le module `acces`, et sa moitié pure était
   déjà mutée.
3. **2c-D3, le seuil** : il reste global, à 90 % (`thresholds.break`). `index.ts` vise au moins
   90 % dans le rapport. Chaque mutant qui survit est nommé ici, avec sa raison, et un mutant
   tuable ne reste jamais (voir « Le relevé de la mutation »).
4. **2c-D4, la version de Stryker et ses contournements** : la 10.1.1 doublait la durée de la
   mutation en CI. Elle n'est montée que si, réglée, elle revient dans la marge de 2c-D8 ; sinon,
   Stryker reste en 10.0.x, et une règle `ignore` commentée de Dependabot écarte les 10.1. Chaque
   contournement (`plugins`, `tsconfigFile`, l'absence de `describe`) est relu par un essai.
   Stryker est resté en 10.0.x (2c-R3).
5. **2c-D5, la recherche par décodage** : on décode le fichier servi, puis on y cherche le texte
   brut. On n'énumère pas les formes de chaque texte, qui manqueraient les mélanges : un texte qui
   a un « ü » et un guillemet s'écrit avec deux échappements dans la même chaîne.
6. **2c-D6, les limites de la recherche** : elles sont écrites ici (« Les limites de la
   recherche ») et dans le commentaire de `client.ts`, sans être traitées. Vite 8 n'en produit
   aucune.
7. **2c-D7, l'iPhone** : hors du lot. Une case s'ajoute à ancrage-donnees#9 : avant l'ouverture, demander à la
   classe qui a un iPhone, et tester l'installation et la passkey sur le premier.
8. **2c-D8, la durée de la mutation en CI** : environ 12 minutes avant le lot, et le lot accepte
   jusqu'à 5 minutes de plus. Les chemins de `mutation.yml` ne s'élargissent pas au-delà de ce que
   les tests du fichier importent directement.
9. **2c-D9, l'étiquette** : pas d'étiquette propre au lot.

## Le relevé de la mutation (01-02/11/2026)

Sur le poste, environ trois fois plus lent que la CI : les durées valent par comparaison.

| `index.ts` | Mutants | Tués | Délais dépassés | Survivants | Sans couverture | Score |
|---|---|---|---|---|---|---|
| Avant (tests rangés sous `describe`) | 128 | 9 | 42 | 74 | 3 | 39,84 % |
| Après le lot | 128 | 124 | 0 | 3 | 1 | 96,88 % |

La passe complète compte 756 mutants, à 98,41 %. En CI, le job `mutation` prenait 11 min 35 s à
12 min 47 s pour 628 mutants (ancrage-donnees#147). Pour les 756 du lot, il a pris 14 min 19 s (ancrage-donnees#151), puis
17 min 12 s (ancrage-donnees#155) pour les mêmes mutants. 2c-D8 est tenue de justesse, et le délai du job
(20 minutes) n'est plus loin : c'est une suite du lot (ancrage-donnees#156).

Les mutants qui survivent n'ont pas de test qui les tue :
- **`index.ts:153`**, `acces === undefined ||` devenu `false ||` : équivalent.
  `CLASSEMENTS.has(undefined)` est faux, et la route est refusée de toute façon.
- **`index.ts:186`**, `typeof id === 'string' ?` devenu `true ?` : équivalent. Les clés de
  `parId` sont des chaînes : `Map.get` d'une valeur qui n'en est pas une rend `undefined`, comme
  la branche écartée.
- **`index.ts:188`**, `cours === undefined ||` devenu `false ||` : équivalent. `peut` refuse un
  cours absent avant tout autre contrôle (`src/domaine/acces.ts:70`). Cette règle est tenue par
  `src/domaine/acces.test.ts` et par la mutation du domaine.
- **`index.ts:108`**, sans couverture : la valeur par défaut `''` de
  `const [premierSegment = ''] = …split('/')`. `split` rend toujours un élément au moins : la
  valeur ne sert qu'au typage (`noUncheckedIndexedAccess`), et aucun test ne peut l'atteindre.

Stryker 10.0.0 contre 10.1.1, sur le même poste et les mêmes 628 mutants :
- la 10.0.0 en passe 438 en 8 minutes ;
- la 10.1.1 en passe 287 en 10 minutes, soit une projection d'environ 1 h 50 contre 36 min 30 s ;
- trois réglages ne la rattrapent pas : `pool: forks` fait pire, `coverageAnalysis: all` dépasse le
  délai du test initial, et `concurrency: 2` divise le débit par deux, sans gain par processus.

La cause n'est pas trouvée.

## Les arbitrages de l'exécution (01-02/11/2026)

- **2c-R1** : le plan citait la PR Dependabot ancrage-donnees#144 (la paire Stryker 10.1.1). Elle avait été
  fermée le 01/11, et ancrage-donnees#149 la remplaçait. ancrage-donnees#149 s'est fermée à la fusion de ancrage-donnees#151.
- **2c-R2** : quatre cas d'échappement du plan avaient été enregistrés décodés : trois cas de
  `desechapperJs` et le « ß » du mélange. Un paramètre d'outil de Claude décode la séquence
  « barre oblique inverse, u, quatre chiffres hexadécimaux », et les cas étaient devenus
  « für → für ». Les tests suivent l'interface du plan, et le plan a été corrigé par un script dans
  ancrage-donnees#152. Les cas des tests sont bâtis par une constante `BARRE`, et leurs octets ont été relus. La
  leçon est au registre (LE-10).
- **2c-R3** : Stryker reste en 10.0.x (2c-D4). `package.json` garde `^10.0.0`, et le verrou fige la
  10.0.0. La règle `ignore` de Dependabot écarte les 10.1.x de `@stryker-mutator/core` et de
  `@stryker-mutator/vitest-runner`. Elle se retire quand une version corrige, après une nouvelle
  mesure. `plugins` et `tsconfigFile` servent encore : sans le premier, « Cannot find TestRunner
  plugin vitest » ; sans le second, « ts.parseConfigFileTextToJson is not a function ».
- **2c-R4** : la règle sans `describe` (1f-R10) reste, sans preuve qu'elle serve encore. L'essai
  « à plat, sans test ajouté » n'a pas été fait : le saut de 39,8 % à 90,6 % mêle l'aplatissement
  et les tests ajoutés. Un indice va dans les deux sens : pour les survivants, Stryker énumère des
  tests rangés dans une suite, sans qu'on sache s'il leur attribue leurs résultats. L'essai isolé
  est une suite du lot.
- **2c-R5** : les mutants équivalents de `index.ts` ne sont pas annotés `// Stryker disable`. C'est
  contraire à l'usage de `src/domaine/seances/feuilles.ts` et de
  `src/serveur/comptes/suppression.ts`, mais conforme à 2c-D3, qui les nomme ici, et au plan, qui
  figeait `index.ts`.
- **2c-R6** : `mutation.yml` se déclenche aussi sur `src/serveur/cours-factices.fixture.ts` et sur
  `src/serveur/comptes/jetons.ts`, que `acces.test.ts` importe directement (2c-D8, 1f-R13). Le
  second a été ajouté par la revue finale.
- **2c-R7** : pour atteindre la branche `default` du `preHandler`, un test réécrit
  `routeOptions.config` dans un crochet d'essai. Si Fastify gelait un jour cet objet, la réponse
  serait un 500 et le test, qui attend un 404, échouerait bruyamment, jamais en faux vert.
- **2c-R8** (revue finale) : la recherche des octets bruts est tenue par un test. Un fichier
  d'UTF-8 invalide (l'octet `0xFF`, puis une barre et un texte de cours qui commence par « n »)
  n'est trouvé que par elle : le décodage fait de la barre et du « n » un saut de ligne. Les formes
  que `desechapperJs` promet sont toutes dans la table de ses tests, la continuation par CRLF,
  U+2028 et U+2029 comprise.
- **2c-R9** : une barre suivie de « 0 » puis d'un chiffre donne le chiffre (la règle « tout autre »
  du plan). esbuild n'émet jamais d'octal, interdit en module ES, et la recherche n'en est pas
  affectée.
- **2c-R10** : le décodage porte sur tout le fichier, code hors des chaînes compris. C'est le côté
  sûr pour une porte : un faux constat est possible, un texte manqué ne l'est pas, et le vrai
  client ne donne aucun constat.

## Les limites de la recherche (2c-D6)

`contenus:client` ne trouve pas un texte de cours :
- écrit en entités HTML (`&uuml;`) ;
- coupé par une concaténation (`"Kardio" + "logie"`) ;
- dans une autre normalisation Unicode (NFD) ;
- écrit avec les échappements de CSS (une barre suivie de un à six chiffres hexadécimaux et d'une
  espace facultative) ;
- écrit sous une forme entre accolades à plus de six chiffres, ou en octal hérité.

Vite 8 n'en produit aucune.

## Les suites

- **Au registre** (`docs/registre.md`) : LE-10, la récidive du piège de LE-2. Un paramètre d'outil
  de Claude décode les échappements, et quatre cas du plan, le ledger et un heredoc l'ont subi.
- **L'essai de 2c-R4**, **la nouvelle mesure de Stryker** (2c-R3) et **la durée du job `mutation`**
  attendent dans « Au prochain passage : suites du lot 2c » (ancrage-donnees#156).
- **La case iPhone de ancrage-donnees#9** (2c-D7) est posée.
- **Vérifié sur Android** : sans objet. Le lot ne change ni le client ni le serveur servi, seulement
  des tests, des outils de CI et la porte `contenus:client`, qui tourne sur le client construit.
