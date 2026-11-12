# Lot M1 — décisions et arbitrages

Le lot M1 (issue ancrage#5, milestone « Le parcours et la mémoire ») a donné à l'application un
ordonnanceur de révisions par cours, et y a fait entrer FSRS à côté de Leitner. C'est le premier
lot de la suite ouverte par ancrage-donnees#106, « le parcours ». Il ne livre que le moteur : pour
l'apprenante, rien ne change, puisque le cours de l'instance reste en Leitner. Le lot a livré :
- **l'adaptateur FSRS** (ancrage#7) : `etatsFsrs` rejoue le journal avec FSRS-6, par `ts-fsrs`
  6.0.0, et rend le même `EtatUnite` que Leitner. L'ADR-0012 dit le choix ;
- **le réglage** (ancrage#8) : la clé facultative `memoire` du manifeste, qui traverse l'analyse,
  la forme servie et l'instantané de référence ;
- **l'ordonnanceur** (ancrage#9) : `ordonnanceurDe` choisit Leitner ou FSRS d'après ce réglage, et
  le client l'appelle. Le cours d'exemple passe en FSRS ;
- **la revue finale**, faite avant la fusion de ancrage#9, qui y a fait corriger un défaut critique
  (M1-R4).

Son plan (ancrage#6) a été supprimé à la clôture, comme le veut la méthode. Ce document en garde
deux choses, avec leurs numéros, parce que le code et l'ADR-0012 y renvoient :
- les décisions du cadrage (« M1-D<n> ») ;
- les arbitrages faits pendant l'exécution (« M1-R<n> »).

Il dit ce qui a été décidé, et pourquoi. **Le comportement, lui, est fixé par le code et les
tests.** La spécification est le commentaire « Cadrage (11/11/2026) » de ancrage#5.

## Les décisions du cadrage (11/11/2026)

Edouard a pris les défauts des sept questions du cadrage, puis a validé la spec et le plan, le
11/11/2026. Quand un arbitrage en a précisé une, la ligne le dit.

1. **M1-D1, l'interface.** L'ordonnanceur est une fonction pure du journal, qui rend pour chaque
   unité son échéance, un niveau de 0 à 5, et ses comptes de réponses justes et fausses. Leitner en
   est la première réalisation, sans changement de comportement : ses tests passent tels quels.
   M1-R2 dit la forme prise dans le code.
2. **M1-D2, FSRS.** La seconde réalisation enveloppe `ts-fsrs`. Une réponse juste vaut « Good »,
   une fausse « Again ». Poids par défaut, rétention visée 0,9, aucune dispersion aléatoire : deux
   appareils au même journal donnent le même état (ADR-0004). Les événements `examen` restent
   ignorés ; les `reponse` qu'un examen écrit comptent.
3. **M1-D3, plusieurs réponses le même jour.** Elles sont rejouées dans l'ordre du journal
   (`repondu_a`, puis `id`). Une faute rend l'unité due le jour même, comme en Leitner. Le cadrage
   disait « avec les étapes courtes de la bibliothèque » : M1-R1 s'en écarte, au même résultat.
4. **M1-D4, le niveau affiché.** Les six « Fächer » restent à l'écran. En FSRS, le niveau se dérive
   de la stabilité, par des seuils en jours tenus par un test (`boiteDeStabilite`) : 0, jamais
   vue ; 1, moins de 2 jours ; 2, moins de 4 ; 3, moins de 8 ; 4, moins de 21 ; 5, 21 jours et
   plus. « Sûres » garde son sens : niveaux 4 et 5. Le poids du quiz lit ce niveau.
5. **M1-D5, le réglage.** Le manifeste gagne `memoire: { algorithme: "leitner" | "fsrs",
   retention }`, facultatif ; `retention` va de 0,80 à 0,95, et vaut 0,90 par défaut. Sans
   `memoire`, c'est Leitner. `leitner.intervalles` et `leitner.nouvelles_par_seance` restent : les
   nouveautés par séance valent pour les deux algorithmes.
6. **M1-D6, la compatibilité.** La clé est un ajout à la forme servie. L'application précachée de
   la version précédente l'ignore, et calcule encore en Leitner jusqu'à sa mise à jour : deux
   appareils peuvent, pendant ce temps, ne pas afficher les mêmes échéances. C'est accepté,
   puisque l'état est dérivé et que rien n'est écrit. M1-R6 dit ce qu'il en est du contenu monté.
7. **M1-D7, une réponse juste au quiz compte autant qu'une carte retrouvée**, comme avant. La
   recherche dit qu'une reconnaissance devrait compter moins ; il faudrait noter le mode
   d'exercice au journal. La question se rouvre avec le lot du rappel actif.
8. **M1-D8, la validation se fait sur des journaux inventés**, écrits à la main (invariant 7),
   jamais sur le journal d'une personne. Parmi eux, un journal de 60 unités apprises en 30 jours au
   rythme de Leitner, rejoué en FSRS : au jour 31, 9 unités sont dues en Leitner, et 1 en FSRS
   (`ordonnanceur.test.ts`).
9. **M1-D9, l'ADR.** L'ADR-0012, « L'ordonnancement des révisions », dit l'interface, FSRS, la
   note binaire et le déterminisme. L'ADR-0004 ne se réécrit pas.
10. **M1-D10, la mutation.** `fsrs.ts` et `ordonnanceur.ts` entrent dans le groupe `domaine`. La
    bibliothèque n'est pas mutée.

## Les relevés (11/11/2026)

- **La mutation**, au poste : `ordonnanceur.ts` à 100 %, `fsrs.ts` à 93,75 %. Ses trois survivants
  sont tenus pour équivalents ; l'un d'eux est la date de création d'une carte neuve, que rien ne
  lit.
- **Le poids du client** : la somme gzip des `.js` de `dist/client` passe de 122 043 à 130 841
  octets, soit 8 798 de plus.
- **La bibliothèque** : `ts-fsrs` est sous licence MIT ; sa seule dépendance,
  `@open-spaced-repetition/srs-kit`, sous BSD-3-Clause.

## Les arbitrages de l'exécution (11/11/2026)

- **M1-R1, pas d'étapes courtes** : l'adaptateur coupe les étapes d'apprentissage de la
  bibliothèque (`enableShortTerm: false`, aucune étape de réapprentissage), et compte en jours
  entiers. C'est un écart à la lettre de M1-D3. Le résultat voulu est tenu autrement : après une
  faute, l'unité est due le jour même ; après une réponse juste, elle revient au plus tôt le
  lendemain. Trois tests comparent un journal à un état écrit en dur ; ils sont à relire à chaque
  montée de version de `ts-fsrs`.
- **M1-R2, `EtatUnite` et sa `boite` restent** : M1-D1 nommait un `EtatDeMemoire` et un champ
  `niveau`. Le code garde le type et le champ que lisent déjà les écrans, pour ne rien changer en
  Leitner. `Ordonnanceur` est `(evenements) => ReadonlyMap<string, EtatUnite>`, et
  `ordonnanceurDe({ leitner, memoire })` y enferme les réglages. L'ADR-0012 le dit.
- **M1-R3, aucun plafond d'intervalle** : la planification vers un examen est hors du lot. Une
  unité bien sue peut donc revenir tard : la revue a vu environ 75 jours après cinq réponses
  justes. C'est à trancher avant qu'un cours monté passe en FSRS (« Les suites »).
- **M1-R4, le jour d'une unité ne recule jamais** (revue finale) :
  - **Le cas** : le jour d'une réponse est son jour local. Un appareil qui change de fuseau, ou
    deux appareils sur des fuseaux différents, peuvent donner à une unité un jour antérieur à celui
    de sa réponse précédente, alors que le journal est trié par instant.
  - **Le défaut** : la bibliothèque levait alors une exception, et le cours serait devenu
    inutilisable pour la personne dès le client branché.
  - **La règle** : dans le rejeu, une réponse prend le plus tardif de son jour local et du jour de
    la réponse précédente de la même unité. Deux tests le tiennent.
  - La session avait d'abord classé ce constat mineur ; la leçon est au registre (LE-14).
- **M1-R5, un réglage illisible vaut un réglage absent** : `memoireDuCours` lit le réglage servi,
  et rend `undefined` pour un algorithme inconnu ou une rétention hors bornes. Un client plus
  ancien ou plus récent que le serveur ne refuse donc pas le cours : il reste en Leitner.
  `CoursServi.memoire` est typé `unknown`, pour que personne ne le lise sans passer par là.
- **M1-R6, un cours monté ne reçoit `memoire` qu'une version après** celle qui connaît la clé : le
  schéma du manifeste est strict, et l'image précédente, remise en service par un retour arrière,
  refuserait le contenu (invariant 8). `docs/format-des-contenus.md` le dit.
- **M1-R7, l'exemple passe en FSRS dans la même version** : il vit dans l'image, donc l'image
  précédente porte son propre exemple. La règle de M1-R6 vise le contenu monté. Les tests gardent
  un cours en Leitner.
- **M1-R8, les revues** : chaque tâche a eu sa revue, sauf la troisième, relue avec le lot entier
  par la revue finale, sur le modèle le plus capable, avant sa fusion. Les deux vagues de
  corrections (34 et 64 lignes) ont été relues par la session qui menait le lot, sans agent de
  re-revue. C'est un écart à la méthode, pris pour ne pas payer deux fois la même lecture.

## Les limites

- **La note binaire.** Aucune mesure publiée ne dit ce que FSRS perd sans les notes « Hard » et
  « Easy ». Leitner reste disponible par une ligne du manifeste.
- **Deux appareils de versions différentes** n'affichent pas les mêmes échéances tant que l'un
  d'eux garde l'application d'avant (M1-D6).
- **Les poids de FSRS sont ceux par défaut** : rien n'est ajusté sur l'historique d'une personne.

## Les suites

- **Au registre** (`docs/registre.md`) : AM-4, le hook `cours-absent` qui lit mal une commande
  d'envoi ; LE-14, le constat de revue classé trop bas (M1-R4).
- **Dans « Au prochain passage » (ancrage#11)** : la mesure du rejeu sur un téléphone et le plafond
  d'intervalle, avant qu'un cours monté passe en FSRS ; le hook ; les remarques mineures des
  revues.
- **La vérification sur Android** :
  - 👤 au staging, où le cours de l'instance est resté en Leitner : rien ne doit avoir changé ;
  - FSRS n'est vérifié qu'au poste, sur le cours d'exemple, par les tests et le bout en bout. Le
    staging ne le montre pas. Il se vérifiera sur un téléphone au passage d'un cours monté, qui
    est une PR du dépôt de données, au plus tôt une version après celle de ce lot.
- **Le lot suivant** : la séance composée « Heute », qui lira `ordonnanceurDe` pour tous les
  éléments d'un cours.
