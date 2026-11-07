# Décisions d'architecture (ADR)

Un fichier par décision : `NNNN-titre.md`, numéroté à partir de `0001`. Les décisions héritées du modèle sont à part, dans `docs/modele/decisions/` (préfixe `M-`), pour que leurs numéros ne se heurtent pas à ceux du projet.

**Un ADR ne se réécrit pas.** Si la décision change, un nouvel ADR remplace l'ancien : on ne modifie dans l'ancien que son statut, qui renvoie au nouveau.

## Format

Titre :

```
# ADR-NNNN — <Sujet> : <décision en une phrase>
```

En-tête :

- statut daté (proposé, accepté, remplacé par ADR-NNNN), avec la date ;
- contexte amont : l'ADR, l'issue ou le document dont celui-ci découle.

Sections, dans cet ordre :

1. **Contexte** : ce qui force à décider.
2. **Options** : les choix envisagés, avec leurs mérites et leurs défauts.
3. **Décision** : ce qui est retenu, et pourquoi.
4. **Conséquences** : ce qui change, dont une rubrique « Difficile à changer ».
5. **Révision** : quand et sur quel signe on reconsidérera la décision.

## Les copies expurgées

Avant le passage au public (M-0006 § 7), les noms de personnes, de lieux et de domaine qui figuraient dans les ADR 0001, 0002, 0003 et 0006 sont devenus des rôles : « l'apprenante », « la classe », « l'école », `<domaine>`. Dans les ADR 0008, 0009 et 0011, les renvois `#NNN` sont devenus des renvois `ancrage-donnees#NNN`. Dans l'ADR-0011, le chemin du cadrage suit son déplacement sous `instance/docs/`.

L'ADR-0001 a aussi été caviardé d'un nombre à la naissance, pour la confidentialité, sans toucher à la décision. Ce n'est pas une réécriture : la décision et sa date ne changent pas. L'original reste dans l'historique du dépôt de données.

## Les chemins `instance/` des ADR

Les ADR 0003, 0005 et 0011 nomment des chemins sous `instance/` (`instance/contenu/`,
`instance/references/`, `instance/docs/`, `instance/config/`). C'étaient ceux du dépôt d'avant la
scission (lot S3). Ils ne sont pas réécrits : au dépôt de données, `instance/` disparaît et chaque
chemin vaut son nom à la racine du dépôt de données (et non de ce dépôt public), `contenu/`, `references/`, `docs/` et `config/`. L'ADR-0011
l'avait prévu (« Révision »).

La phrase de l'ADR-0006 « dépôt privé, pas de protection » date d'avant la scission : le dépôt public a une règle de protection de GitHub.
