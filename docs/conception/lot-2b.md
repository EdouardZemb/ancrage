# Lot 2b — décisions et arbitrages

Le lot 2b (issue ancrage-donnees#122, milestone « Étape 2 — La classe ») solde ancrage-donnees#81, « Au prochain passage ». Il
rend aussi moins chère la CI d'une PR de documentation. Rien ne change pour l'apprenante, hors trois effets
voulus, qui tiennent tous à la mise à jour (2b-D5), et l'alerte de stockage que `definirMoi` garde.

Ce que le lot a livré :
- **une PR de documentation pure ne construit plus l'image** et ne lance plus le bout en bout
  (`src/outillage/documentation-seule.ts`) ;
- **la note des envois** : les réponses envoyées qu'une restauration aurait perdues repartent
  (R17, limites a et b du lot 1d) ;
- **les trois suites du lot 2a** : le rechargement attend les envois, et un compte occupé ou une
  fiche entamée retiennent la version ;
- **cinq fichiers découpés**, par des déplacements purs : `analyse.ts`, `depot.ts`, `Admin.tsx`,
  `Examen.tsx` et `synchro.test.ts` ;
- **les cases de ancrage-donnees#81**, chacune réglée, rayée avec sa raison ou portée par une autre issue.

Le plan a été supprimé à la clôture, comme le veut la méthode. Ce document garde, avec leurs
numéros, ce à quoi le code et les tests renvoient :
- les décisions du plan (« 2b-D<n> ») ;
- les arbitrages faits pendant l'exécution (« 2b-R<n> »).

**Le comportement, lui, est fixé par le code et les tests.**

La spécification est l'issue ancrage-donnees#122 : son corps, et son commentaire « Cadrage du 27/10/2026 ». Puis
ancrage-donnees#81, son corps et son commentaire du 23/10 (les suites du lot F1). Edouard a validé les décisions
avec le plan, le 28/10/2026.

## Les décisions du plan (28/10/2026)

1. **2b-D1, la CI d'une PR de documentation pure.**
   - **Ce qui en est** : une PR (événement `pull_request`) dont chaque chemin changé est de la
     documentation. Les renommages comptent par leurs deux noms (`git diff --name-only
     --no-renames HEAD^1 HEAD`). Sont de la documentation : `docs/**/*.md`, un `*.md` de la racine,
     `.claude/plans/**/*.md`, `.claude/skills/**/*.md` et `.github/pull_request_template.md`.
     `contenus/` n'en est jamais, même un `.md`.
   - **Dans le doute, tout tourne** : une liste vide, une erreur, un push sur `main`.
   - **Les jobs** : `verifier` calcule la sortie `docs_seules` et reste entier, comme `socle`.
     `image` et `deploiement` gardent leurs jobs, et sautent leurs étapes coûteuses par des `if:`
     d'étape : un job sauté n'est pas « vert » pour le garde de fusion. Une étape dit pourquoi
     dans le résumé.
   - **La preuve** : la PR brouillon ancrage-donnees#134, fermée sans fusion (`image` en 13 s au lieu de 2 min 28,
     `deploiement` en 5 s au lieu de 1 min 36), puis la PR de clôture du lot.
2. **2b-D2, les cases rayées**, chacune avec sa raison dans ancrage-donnees#81 :
   - un échec de `toJS()` autre qu'un alias : aucun n'est atteignable avec la bibliothèque `yaml`
     (2b-R1) ;
   - la garde des routes : rien à corriger tant qu'aucun crochet ne sert autre chose qu'un refus.
     La règle est écrite en tête d'`enregistrerAcces` ;
   - la garde `useRef` de la remise de l'Examen : un double clic ou le chrono qui expire pendant une
     remise repassent par `remettre` avant le rendu. Deux tests la tiennent ;
   - `ONGLETS_A_CHEMIN` : un garde-fou de type voulu ;
   - `useEtatDesElements`, qui écrit pendant le rendu : l'état se stabilise en un passage, et
     déplacer l'écriture risquerait l'ordre tiré de la réserve ;
   - le bandeau de l'erreur de rangement, qui s'efface à la réussite suivante : c'est voulu ;
   - l'e2e, les visites de l'étape 3 (l'étape ne visite plus d'onglet) et le nommage (aucun
     constat précis).
3. **2b-D3, ce qui sort du lot**, rayé dans ancrage-donnees#81 avec le lien de l'issue qui le porte :
   - **ancrage-donnees#131, l'accessibilité** : neuf cases, qui changent ce que dit le lecteur d'écran, ce que fait
     le clavier ou, pour `.trou`, l'affichage ;
   - **ancrage-donnees#91, le quiz calibré** : les trois cases du Quiz ;
   - **ancrage-donnees#8, la relecture des contenus** : les trois cases de la Unit 1 ;
   - **ancrage-donnees#80, la relecture allemande** : le texte de `stockage_en_echec` ;
   - **ancrage-donnees#132, avec le deuxième cours** : les textes qui nomment les modules de ce cours, et
     « ← Accueil » ;
   - **ancrage-donnees#133, avec la prochaine migration** : les index sur `personne` dans `membre`, `session` et
     `passkey`, et ceux de `lien.personne` et `lien.cree_par` ;
   - **`modele-projet#49`** : un déploiement sur un dossier de données vide. L'application ne
     distingue pas un montage qui pointe à côté d'un premier démarrage ; la garde utile est dans
     `deploiement/`, géré par le modèle. Elle y est posée (modele-projet#52, le 28/10/2026) et
     arrivera ici avec la prochaine version du modèle, par `copier update`.
4. **2b-D4, la note des envois (R17, limites a et b)**, telle qu'ajustée pendant l'exécution
   (2b-R4 à 2b-R6) :
   - **la note** : un événement que le serveur accepte quitte la file pour la note de son cours,
     le champ optionnel `envoyes` de l'enregistrement `curseurs` (clé `[personne, cours]`). Le
     passage se fait dans une seule transaction sur `['file', 'curseurs']`
     (`confirmerLEnvoi`), et seul l'`id` vraiment retiré de la file est noté. La page et le service
     worker passent par le même code ;
   - **la lecture** : une lecture incrémentale menée jusqu'au bout doit rendre tous les `id` notés
     avant sa dernière page, puisque le serveur les avait acceptés. S'il en manque un, c'est traité
     comme un recul : relecture complète depuis 0, et R13 remet en file ce que le serveur n'a pas,
     et cela seulement. Une lecture partie de 0 en tient lieu ;
   - **le solde** : au bout d'une lecture, la note perd ce que le serveur a rendu. Après une
     relecture, elle perd aussi ce qu'elle attendait en vain, remis en file dans la même
     transaction (`solderLaNote`). Une lecture coupée ne la touche pas ;
   - **une entrée périmée** de la note est un `id` que le serveur a, mais sous la fenêtre de la
     lecture. Elle naît d'une lecture coupée, d'une confirmation qui note un `id` après le solde de
     la lecture qui l'a rendu, ou d'un arrêt de la page entre la fin d'une lecture et son solde.
     Elle coûte une relecture complète, jamais un renvoi en boucle ;
   - **le pire cas** : une relecture complète du journal du cours, parfois avec un envoi en trop,
     que le serveur ignore (un envoi du service worker accepté juste après la dernière page d'une
     relecture). Jamais une perte, jamais un doublon ;
   - **la base locale reste en `VERSION = 1`**. Le client de la version précédente ignore le champ ;
     s'il réécrit l'enregistrement sans lui, on retombe sur le comportement d'avant ;
   - **la note s'efface avec le curseur** : déconnexion, suppression du compte, autre personne,
     cours oublié. Une confirmation tardive, après une déconnexion ou la réservation du téléphone à
     une autre personne, recrée un enregistrement `curseurs` (curseur 0, et la note) pour une
     personne absente. C'est sans effet : il équivaut à aucun enregistrement ;
   - **la limite qui reste**, d'avant le lot : une réponse envoyée dont l'appareil n'a plus
     l'événement ne peut pas être remise en file. C'est une réponse restée en file après une
     déconnexion sans abandon (`viderSaufLesFiles`) ou après la réservation du téléphone à une autre
     personne (`reserverA`), ou d'un cours oublié puis rendu, si une restauration la perd avant que
     le téléphone l'ait relue.
5. **2b-D5, les trois suites du lot 2a**, sans perte de donnée journalisée :
   - **le rechargement attend les envois** en cours de la page, sur sa base
     (`attendreLesSynchronisations`), au plus `ATTENTE_DES_ENVOIS_MS` = 2 s. L'attente porte sur
     les synchronisations entières, lectures comprises. Une base qui ne s'ouvre pas n'a rien à
     attendre. Puis il relit la règle du moment (`peutAppliquer`), avec le même moment et la même
     absence : si une séance a commencé entre-temps, le rechargement est dû au moment permis
     suivant. Toujours un seul rechargement par chargement ;
   - **l'écran du compte occupé** déclare une séance `retenue` : déconnexion, export, suppression
     du compte, et aussi changement du nom ou de la langue, le temps d'une requête ;
   - **une fiche dont la tâche affichée est entamée** est une séance `journalisee` : au moins un
     élément n'est plus dans son état initial, à la valeur près. Une case vidée ou un terme rendu à
     la réserve ne comptent plus. Un terme choisi mais pas encore posé, ou une case visée, ne font
     pas une tâche entamée. « Weiter » oublie l'état de la tâche faite (2b-R7).

     Les états initiaux sont gardés à leur création, sans nouveau tirage, dans une `WeakMap` tenue
     par l'identité de l'objet (`tache.ts`). Un autre écrivain de `feuilles/<id>` la perdrait sans
     bruit, et la tâche ne compterait plus comme entamée : on retomberait sur le comportement d'avant
     le lot.

   Les écouteurs `install`, `activate` et `message` du service worker sont dans
   `sw-gestionnaires.ts`, testés sans worker. Chaque repli de la route statique (`addRoutes`
   absent ou refusé) laisse une trace `console.info`.
6. **2b-D6, les découpages**, des déplacements purs, sans test changé :
   - `analyse.ts` (1075 lignes → 791) : la résolution des feuilles va dans `analyse-feuilles.ts`,
     et les aides communes dans `analyse-commun.ts`, pour éviter un cycle ;
   - `depot.ts` (479 → 331) : les groupes, les membres et les autorisations vont dans
     `depot-droits.ts`, que la mutation suit. `creerDepot` garde son interface ;
   - `Admin.tsx` (393 → 127) : `AdminGroupes.tsx`, `AdminDroits.tsx` et `composants-admin.tsx` ;
   - `Examen.tsx` (591 → 321) : `examen-libelles.ts`, `ExamenReglages.tsx` et `ExamenMinuteur.tsx`
     (2b-R3) ;
   - `synchro.test.ts` (1496) : `synchro.fixture.ts`, puis un fichier par `describe`.
7. **2b-D7, le dessin.** `dessin.ts` refuse en plus les éléments `animate`, `animateMotion`,
   `animateTransform` et `set`, quelle que soit leur casse, et tout `url(…)` qui ne vise pas `#…`,
   en attribut comme en `style`. `url(#id)` reste admis. La revue finale l'a complété (2b-R8).
8. **2b-D8, le journal WebAuthn.** Le détail d'un échec garde le nom de l'erreur et son message,
   dont chaque segment entre guillemets devient `"…"`. Il reste tronqué à 200 caractères, et la
   réponse HTTP ne change pas.
9. **2b-D9, la version** : v0.8.1, avec l'accord d'Edouard. Du code serveur change, mais rien de ce
   que voit l'apprenante.

## Les arbitrages de l'exécution (28/10/2026)

L'exécution s'est faite par sous-agents, en cinq PR (ancrage-donnees#135, ancrage-donnees#137, ancrage-donnees#138, ancrage-donnees#139, ancrage-donnees#140), avec une revue
par tâche. Puis une revue finale de tout le lot, dont les correctifs sont dans ancrage-donnees#141. La session a
fusionné elle-même chaque PR.

- **2b-R1** : la case de `toJS()` est rayée. Les essais de la tâche 3 (alias inconnus, en avant,
  circulaires, `<<`, `__proto__`, `!!set`, `!!omap`, `!!binary`, `1e999999`, imbrication profonde)
  ne trouvent aucun échec atteignable autre qu'un alias.
- **2b-R2** : `aucun_moment_hors_des_trois` envoie aussi ses évènements à la fenêtre réelle de
  jsdom. Avant, sa moitié « fenêtre » ne pouvait pas échouer.
- **2b-R3** : `Examen.tsx` devait passer sous 350 lignes. Le chrono va aussi dans
  `ExamenMinuteur.tsx`, sans toucher au cœur de l'épreuve.
- **2b-R4** : 2b-D4 tel qu'écrit remettait en file les `id` notés non rendus. Une entrée périmée
  de la note (un `id` que le serveur a, sous la fenêtre de lecture) aurait été renvoyée à chaque
  synchronisation, sans fin. Un `id` noté non rendu déclenche donc la relecture complète qui
  existe (R11, R13), et R13 ne remet en file que ce qui manque vraiment au serveur. Le test
  `entree_perimee_de_la_note_ne_boucle_pas` le tient.
- **2b-R5** : la confirmation d'un envoi (retrait de la file, ajout à la note) se fait dans une
  seule transaction, et ne note que ce qu'elle retire : la page et le service worker ne
  s'écrasent pas.
- **2b-R6** : une lecture coupée ne touche pas la note. Si elle a dépassé des `id` notés, la
  synchronisation suivante fait une relecture complète.
- **2b-R7** : « Weiter » oublie l'état de la tâche finie (`Feuilles.tsx`). Sans cela, une fiche
  finie restait une séance au bilan. Aucune navigation ne remontre une tâche finie, et les
  résultats journalisés ne bougent pas.
- **2b-R8**, après la revue finale (ancrage-donnees#141) : le dessin n'admet plus que des éléments SVG d'une
  liste blanche (`g`, `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `text`,
  `tspan`, `textPath`, `defs`, `linearGradient`, `radialGradient`, `stop`, `pattern`, `clipPath`,
  `mask`, `marker`, `symbol`, `use`, `title`, `desc`). Il refuse aussi `@import`, `image-set(`,
  toute barre oblique inverse et toute référence nommée autre que `&amp;`, `&lt;`, `&gt;`, `&quot;`
  et `&apos;`, même sans « ; ».
  - La revue avait fait passer quatre chargements de l'API avec le cookie, tous permis par la CSP :
    `url&lpar;…)`, un échappement CSS (`u\72l(`), `image-set(` et `<style>@import`.
  - Puis une sonde dans Chromium a montré qu'un élément HTML (`img`, `table`, `meta`) mis dans le
    `<g>` du dessin sort du SVG : `<img src="/api/…">` fait la requête, et `<meta
    http-equiv="refresh">` emmène toute la page. Une liste noire ne pouvait pas tenir 2b-D7.
  - Aucun dessin existant n'en est touché. Un futur dessin qui a besoin d'un autre élément est
    refusé par la CI, et la liste s'élargit à ce moment-là.
  - Reste admis, sciemment : `src(…)`, la variante d'`url(…)` de CSS Values 4, qu'aucun moteur ne
    sert encore. Un moteur qui la servirait rouvrirait un chargement, depuis un dessin relu en PR.
- **La revue finale** a aussi corrigé des commentaires de la synchronisation et de la mise à jour,
  qui disaient plus que le code, et l'ordre des diapositives dans `/feuille` (`SKILL.md`).

## Les suites

- **Au registre** (`docs/registre.md`) :
  - LE-8, la leçon de 2b-R4 : une décision de plan qui bouclait, et des faux serveurs de test qui
    acceptaient sans rendre ;
  - LE-9, celle de 2b-R8 : une liste noire ne tenait pas le dessin ;
  - AM-2 : la transaction `.immediate()` d'`ajouterLot` (`depot-journal.ts`), qui garde les numéros
    du journal sans trou, n'est tenue par aucun test ;
  - AM-3 : `/feuille` ne borne pas les archives contenues dans le zip.
- **Les issues de 2b-D3 sans milestone** (ancrage-donnees#131, ancrage-donnees#132, ancrage-donnees#133) attendent un événement : la fin de
  l'ouverture à la classe, le deuxième cours, la prochaine migration (LE-6).
- **👤 La vérification**, sur le téléphone d'Edouard, au staging, une fois `/api/sante` à la
  révision de `main`. Elle est faite le 01/11/2026, et ses quatre étapes ont réussi :
  1. dans les Arbeitsblätter, écrire dans un trou sans « Prüfen » ; laisser arriver une version,
     quitter l'application moins de 30 minutes, puis revenir. Aucun rechargement, et le texte est
     là. Puis « Prüfen », « Weiter » jusqu'au bilan, et l'Übersicht : la version s'applique, et la
     révision du pied de page change ;
  2. faire quelques Karteikarten, puis quitter le cours pendant qu'une version attend. À la
     réouverture, l'en-tête dit « Gespeichert in deinem Konto », et l'Übersicht et le Fortschritt
     ont exactement ce nombre de plus ;
  3. en mode avion, répondre à trois cartes, fermer l'application, rétablir le réseau, puis
     rouvrir : « Gespeichert in deinem Konto », et exactement trois de plus ;
  4. une déconnexion, puis une reconnexion.
- **👤 L'étiquette v0.8.1**, avec l'accord d'Edouard, puis les étapes 3 et 4 en prod. Rien n'est à
  dire à l'apprenante. La 0.8.1 est en ligne le 02/11/2026, et les étapes 3 et 4 y ont réussi.
  - Les étapes 1 et 2 éprouvent la règle de la version installée, qui décide de la mise à jour. Au
    passage de la 0.8.0 à la 0.8.1, c'est la règle de la 0.8.0, sans 2b-D5 (LE-11).
  - Une tâche entamée avant « Prüfen » s'y perd au retour, chez l'apprenante comme chez Edouard.
    L'étiquette part donc à un moment où l'apprenante ne fait pas d'Arbeitsblatt.
  - L'étape 1 est refaite en prod le 02/11/2026, au passage de la 0.8.1 à la 0.8.2 (ancrage-donnees#156), et elle
    a réussi. L'étape 2, prouvée au staging, ne se refait pas.
- **Une preuve réelle de 2b-D4 reste à faire** : après une restauration, voir revenir sur le
  téléphone les réponses données depuis l'instantané. Les tests ne la font que contre un faux
  serveur. `restaurer.sh` ne restaure que la prod : une restauration du staging serait un geste 👤
  à écrire, à décider avec Edouard.
