# Pistes : notées, pas engagées

Une piste devient une issue le jour où l'on décide de la travailler. Ce fichier n'est pas une
feuille de route. On n'y ajoute que ce qui n'a pas encore d'issue.

## Pédagogie (brief §6)

- **Effet de test et rappel actif** : privilégier la saisie à la reconnaissance, et mesurer ce
  que cela change.
- **Alternance des sujets** (*interleaving*) : seulement ciblée sur des termes que l'on confond.
  La méta-analyse de Brunmair et Richter (2019) est défavorable à l'alternance généralisée pour des
  mots : mêler les chapitres dans une même séance n'est pas la piste.
- **Apprendre de ses erreurs** : repérer les confusions récurrentes. Cela suppose de garder la
  réponse donnée, ce que l'on ne fait pas aujourd'hui (ADR-0007). À peser contre la minimisation.
- **Surcharge** : le plafond de nouvelles cartes par jour est fait pour la séance du jour (lot M2) ;
  reste à proposer des séances courtes pour les transports.
- **Sources d'inspiration** :
  - Anki : FSRS, paquets ;
  - RemNote : passage des notes aux cartes ;
  - Duolingo : micro-séances, séries ;
  - Quizlet : modes de jeu.

## Contenus

- **Les autres modules de la classe** : Informatik (ICDL), Praxisadministration,
  Tarif- und Versicherungswesen, Kommunikation.
- **Les 13 fiches `*-Lernkarte.md`** du dossier `fiches/` du prototype, à migrer comme modules `fiche`
  quand un affichage existera. Elles sont plus riches que les cartes et n'en sont pas dérivées.
- **Les cours personnels d'Edouard.**
- **Un éditeur de contenu pour l'enseignante** (réponse 6 du 15/10). Il demandera un ADR :
  stockage, relecture, versionnage.
- **Des trous à l'ordre libre** dans les feuilles : une phrase à deux trous accepterait
  les deux réponses dans l'un ou l'autre ordre (lot F1, F1-R12).
- **Une comparaison exacte pour un trou sans liste** : une phrase qui porte sur l'orthographe d'une
  lettre (c, k ou z) ne passerait plus par
  `canonique`, qui confond c, k et z (lot F1, F1-R19).
- **Plusieurs réponses admises pour un trou sans liste.** Un trou n'admet aujourd'hui qu'une
  réponse, si bien qu'un synonyme juste est compté faux. C'est le cas, dans la feuille de la
  Unit 3 :
  - d'un synonyme allemand du terme attendu ;
  - d'un adverbe de direction pour son équivalent savant ;
  - de la forme latine d'un mot pour son Wortstamm grec.

## Technique

- **iOS** : tester l'installation et les passkeys iCloud quand des élèves en auront besoin.
- **E-mail** : des codes à saisir plutôt que des liens, par un fournisseur transactionnel, avec
  SPF, DKIM et DMARC sur `<domaine>`. Seulement si la récupération manuelle des comptes
  devient lourde.
- **Préférences synchronisées** entre appareils.
- **Vue de classe pour l'enseignante** (progression agrégée) : elle demande une permission
  `relire` étendue et une réflexion nLPD (ADR-0007, clause de révision).
- **Lien avec le référentiel de compétences de l'écosystème** (ADR-0010 de creche-planner) :
  seulement quand ce référentiel existera.
