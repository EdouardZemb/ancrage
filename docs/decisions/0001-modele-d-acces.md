# ADR-0001 — Modèle d'accès : des droits explicites par cours, rien d'implicite

- **Statut** : accepté le 2026-10-15
- **Contexte amont** : brief §2, points 4 à 6 ;
  [ADR-0010 de creche-planner](https://github.com/EdouardZemb/creche-planner/blob/main/docs/adr/0010-ecosysteme-applications-personnelles.md) §2

## Contexte

Ancrage sert d'abord l'apprenante, puis les élèves de sa classe, peut-être
leur enseignante. D'autres cours viendront, dont des cours **personnels** d'Edouard que personne
d'autre ne doit voir, même quand des personnes extérieures utilisent l'application. Il faut dire
qui voit quel cours, qui peut le modifier, et garantir l'étanchéité.

## Options

- **A. Un attribut de visibilité par cours** (`privé`, `classe`, `public`). Lisible, mais chaque
  cas nouveau (deux classes, une enseignante qui relit sans apprendre) ajoute une valeur et une
  branche de code.
- **B. Des droits explicites.** Une autorisation relie un *sujet* (une personne ou un groupe) à un
  cours, avec une *permission*. Pas de cas particulier : un cours personnel est un cours sans
  autre autorisation.
- **C. Des rôles globaux** (apprenant, éditeur) sans notion de cours. Insuffisant dès le second
  cours.

## Décision

**Option B.**

- **Personne** : un identifiant opaque (UUID) créé par l'application et un nom affiché. Aucune
  donnée personnelle ne sert de clé ; l'e-mail n'est pas collecté (ADR-0002). La traduction
  « personne authentifiée → identifiant » se fait à un seul endroit du code.
- **Rôle global** : un seul, `propriétaire` (Edouard). Il invite, crée les groupes, donne et
  retire les droits, et a tous les droits sur tous les cours, puisqu'il en est l'auteur.
- **Groupe** : un nom et des membres, par exemple « la classe ».
- **Permissions** : `apprendre` (voir le contenu, avoir sa progression), puis `relire` et
  `modifier` quand les fonctions qui en ont besoin arriveront. Les droits se cumulent ; il n'y a
  pas de droit négatif.
- **Retirer un droit** fait disparaître le cours pour la personne. Sa progression est conservée
  et réapparaît si le droit revient. Elle n'est effacée qu'avec le compte (ADR-0007).
- **Diffusion à un groupe** : un cours qui contient des éléments « à vérifier » (ADR-0003) ne
  peut être ouvert qu'à des personnes nommément, pas à un groupe, sauf dérogation écrite dans son
  manifeste. C'est la traduction du brief : « relu par l'enseignante avant diffusion à la
  classe ».

### Invariants

Repris dans `CLAUDE.md`, testés :

1. Une personne ne reçoit **aucune** information sur un cours où elle n'a pas de droit
   effectif : ni dans la liste, ni contenu, ni statistique, ni export. Pas même son existence :
   la réponse est identique à celle d'un cours inexistant.
2. Le contrôle est fait **côté serveur, à chaque requête, dans un seul module** (`acces`). Il est
   couvert par une matrice exhaustive personne × cours × action et par des tests de mutation
   (ADR-0010 §4).
3. Le contenu d'un cours ne sort que par l'API, après contrôle. Jamais comme fichier statique,
   jamais dans le code de l'application téléchargé par le navigateur.
4. Le cache hors-ligne d'un appareil ne contient que les cours autorisés pour la personne
   connectée, et il est vidé à la déconnexion.

## Conséquences

- **Coût** : une table d'autorisations, une table de groupes, un module de contrôle, et un écran
  d'administration minimal (inviter, grouper, donner un droit).
- **Limite assumée** : un appareil hors-ligne garde le contenu déjà en cache jusqu'à sa
  prochaine synchronisation. Un droit retiré prend effet à ce moment-là, pas avant.
- **Difficile à changer** : le principe « aucun accès implicite sauf le propriétaire », et la
  nature des sujets (personne, groupe). Ajouter une permission est facile.

## Révision

À rouvrir si quelqu'un d'autre que le propriétaire doit créer des cours personnels, si un cours
doit devenir public, ou si l'application a plusieurs propriétaires.
