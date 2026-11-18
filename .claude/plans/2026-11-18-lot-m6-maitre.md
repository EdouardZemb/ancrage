# Lot M6 : les éléments rebelles — plan maître

**Issue :** ancrage#32.

**Objectif :** un élément raté encore et encore est repéré d'après le journal seul, ne revient plus
qu'une fois par jour dans « Heute », est marqué, montre une aide tirée du contenu, et figure dans
une liste « à reprendre » hors de toute séance. Trois succès de suite l'en sortent. Le rapport de
suivi compte ces éléments par chapitre.

**Le cadrage, accepté par Edouard le 18/11/2026 :**

- M6-C1. Tout élément que pose « Heute » peut être rebelle : une carte (chaque sens à part), un
  mot, un point de schéma, un exercice, une question fermée de fiche.
- M6-C2. Le seuil est un nombre de fautes après le premier succès : 4 par défaut, réglable par la
  clé facultative `rebelles.fautes` du manifeste. La mesure de M6-C8 peut corriger le défaut avant
  la tranche 2.
- M6-C3. « Une fois par séance du jour » veut dire une fois par jour : un rebelle manqué ne revient
  ni en fin de ronde ni dans « Nächste Runde ». Il revient le lendemain.
- M6-C4. L'aide s'affiche après la réponse, juste ou fausse, et toujours dans la liste.
- M6-C5. Une carte reçoit deux clés facultatives : `aide` (une phrase libre) et `confondu_avec`
  (l'identifiant d'une autre carte, dont on montre le recto et le verso). Les autres genres n'ont
  pas de clé nouvelle : on réemploie les morceaux du mot, la `regle` d'un exercice, la `correction`
  d'une affirmation et la `note` d'un schéma.
- M6-C6. La liste « à reprendre » remplace « Schwierige Karten » dans Fortschritt, pour tous les
  genres, avec la réponse et l'aide ; « Heute » y renvoie par un lien quand elle n'est pas vide.
- M6-C7. Trois réponses justes de suite sortent un élément de la liste, tous gestes confondus,
  Prüfung comprise, pré-test exclu. Ensuite, il ne redevient rebelle qu'en repassant le seuil.
- M6-C8. La mesure : la tranche 1 livre le calcul et la case du rapport. Edouard lance alors le
  rapport d'une personne sur une copie de la base de prod, avec la date de son accord, et ne
  rapporte à la session que le seuil qu'il retient, sans aucun chiffre de la personne.
- M6-C9. Le lot se fait en deux tranches d'implémentation : le calcul, la clé du manifeste et le
  rapport ; puis « Heute », la marque, l'aide et la liste.
- M6-C10. La marque est une étiquette « schwierig » sur la question, dans « Heute » et dans les
  onglets.

Rien de nouveau n'est gardé (invariant 5) : aucun mode nouveau au journal, et la notice ne change
pas. Le journal ne garde pas la réponse donnée (ADR-0007) : « confondu avec » ne vient que du
contenu, jamais d'une observation.

**Exécution :** chaque tranche d'implémentation a son plan, ajouté par sa propre PR de plan, et
s'exécute tâche par tâche (un agent par tâche, une relecture par tâche).

## Mécanismes annoncés

- `src/domaine/progression/fsrs.ts:87` — `export function revuesDuJournal` — la suite ordonnée des
  verdicts de chaque unité, avec leurs jours, se dérive déjà du journal, sans doublon ni pré-test.
- `src/domaine/seances/heute.ts:167` — `export function apresReponseDuJour` — dans « Heute », un
  élément manqué revient une fois en fin de ronde, quel qu'il soit.
- `src/domaine/progression/statistiques.ts:42` — `export function cartesDifficiles` — Fortschritt
  a déjà une liste de cartes difficiles, par nombre de fautes, sans aide ni règle de sortie.
- `src/domaine/contenu/schemas.ts:620` — `export const schemaDeCours = z.strictObject({` — le
  manifeste est strict : une image qui ignore une clé refuse le manifeste qui la porte.
- `src/domaine/cours/servi.ts:322` — `export function versCoursServi` — rien du manifeste ne part
  vers le client sans y être nommé (liste blanche).
- `src/outillage/memoire/mesures.ts:82` — `export function caseAdmise` — une case d'un rapport
  d'ensemble ne s'affiche qu'à trois personnes, vingt en tout et personne au-delà de 70 %.
- `docs/format-des-contenus.md:430` — `Exception : le cours d'exemple vit dans` — un cours monté
  ne reçoit une clé qu'une version après celle qui la connaît ; le cours d'exemple fait exception.

## Outils et cas limites

Aucun.

## Effets cherchés

- Le manifeste admet `rebelles`, puis une carte `aide` et `confondu_avec` — le retour arrière, qui
  remet l'image précédente devant le contenu du jour — chaque tranche dit dans
  `docs/format-des-contenus.md` la version à partir de laquelle un cours monté peut les porter, et
  la PR de données qui les pose attend cette version.
- Le cours d'exemple porte ces clés — le chargeur, `coursDExemple` et les suites de bout en bout,
  qui lisent `exemple-contenu/kueche` ; la plupart des suites vitest lisent le cours en mémoire
  `exempleDeCours()`, qui les reçoit aussi — `corepack pnpm test`, `e2e` et `e2e:mise-a-jour` verts
  à chaque tranche.
- Le cours servi gagne des champs — l'application précachée de la version précédente, qui les
  reçoit sans les connaître — un test de `coursServiUtilisable` sur un cours servi qui les porte.
- L'instantané de référence gagne des champs — le dépôt de données, dont la CI compare
  `references/` au code de `main` — un test tient que le JSON de l'instantané d'un cours sans ces
  clés est celui d'avant.
- Un rebelle manqué ne revient plus le jour même — le cours de l'instance, sans PR de données : le
  défaut du seuil y joue dès la version qui porte la tranche 2 — dit dans la PR, et vérifié par
  Edouard sur un téléphone, au staging.
- « Schwierige Karten » disparaît de Fortschritt — l'apprenante, qui la connaît — la liste qui la
  remplace est au même endroit, et la PR le dit.

## Revues

- revue du plan de chaque tranche, avant son exécution : Tranche 1, Tranche 2
- revue de chaque tâche, dans la tranche qui la porte : Tranche 1, Tranche 2
- revue finale du lot : Tranche 3
- relecture des corrections de la revue finale : Tranche 3

---

### Tranche 1 · Le calcul, la clé `rebelles` et le rapport

Plan : `.claude/plans/2026-11-18-lot-m6-t1.md`.

- Un fichier de domaine dit, d'après le journal et un seuil, quelles unités sont rebelles.
- Le manifeste admet `rebelles.fautes`, validée, servie et lue sans rigueur par le client.
- Le rapport de suivi compte les rebelles par chapitre, et selon le seuil.
- Sortie : la mesure de M6-C8, par Edouard, puis le seuil par défaut confirmé ou corrigé.

### Tranche 2 · « Heute », la marque, l'aide et la liste

Plan à écrire à l'entrée de la tranche.

- Un rebelle ne passe qu'une fois par jour dans « Heute » (M6-C3), et sa question porte la marque
  « schwierig » (M6-C10).
- Une carte admet `aide` et `confondu_avec` ; chaque question montre son aide après la réponse
  (M6-C4, M6-C5).
- La liste « à reprendre » remplace « Schwierige Karten » dans Fortschritt, et « Heute » y renvoie
  (M6-C6).
- Sa première tâche pose le seuil par défaut que la mesure de M6-C8 a confirmé ou corrigé.
- À tenir dans son plan : `aide` est un texte du cours, qui entre dans `textesDuCours`, dans la
  liste à relire et dans la liste blanche d'une carte servie ; l'identifiant de `confondu_avec` se
  contrôle à l'analyse ; le statut d'une carte « vérifiée » qui gagne une `aide` se décide là.

### Tranche 3 · La revue finale du lot et ses corrections

- Une revue de tout le lot par un agent qui n'a écrit aucune tranche, sur la tête de `main` :
  contre l'issue, les invariants 1 à 9 et les décisions M6-C1 à M6-C10. Elle compare aussi chaque
  critère de l'issue à ce qui est livré, pour que tout écart soit déclaré (LE-23).
- Une PR de corrections, puis la relecture de ces corrections par le même agent.
- La mutation des fichiers de domaine du lot, à 90 % au moins.
- La vérification sur un téléphone Android, au staging, par Edouard.

### Tranche 4 · La clôture du lot

La PR de clôture, et elle seule :

- supprime ce plan maître et les plans de tranche de `.claude/plans/` ;
- reporte ce qui doit survivre dans `docs/conception/lot-m6.md` et dans « État » de `CLAUDE.md`, et
  écrit un ADR si une décision du lot est difficile à défaire ;
- relit le README d'après `docs/modele/documentation.md` ;
- porte au registre (`docs/registre.md`) les leçons du lot encore sans ligne, et les suites sans
  urgence à l'issue ancrage#11 ;
- porte « Closes #32 », ce qui ferme l'issue ;
- nomme la tête qu'a lue sa dernière relecture, par la ligne `Tête relue : <SHA>`.
