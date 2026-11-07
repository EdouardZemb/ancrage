/*
 * Les règles d'accès (ADR-0001). Ce module est pur : il ne lit ni base ni requête, il répond à
 * « cette personne peut-elle faire cette action sur ce cours ? » à partir de ce qu'on lui donne.
 * Le contrôle côté serveur passe par `src/serveur/acces/`, qui l'appelle à chaque requête.
 */

/** `relire` et `modifier` viendront avec les fonctions qui en ont besoin. */
export type Permission = 'apprendre';

export type Action = 'lister' | 'lire' | 'administrer';

export interface Personne {
  id: string;
  /** Le seul rôle global : il a tous les droits sur tous les cours existants. */
  proprietaire: boolean;
  /** Les identifiants des groupes dont la personne est membre. */
  groupes: readonly string[];
}

export interface Autorisation {
  cours: string;
  permission: Permission;
  sujet: { type: 'personne' | 'groupe'; id: string };
}

/** Ce que les règles savent d'un cours : son identifiant et l'état de sa vérification. */
export interface CoursAcces {
  id: string;
  /** Le cours contient des éléments « à vérifier » (ADR-0003). */
  aVerifier: boolean;
  /** Le manifeste du cours autorise par écrit sa diffusion à un groupe malgré `aVerifier`. */
  derogation: boolean;
}

/**
 * Une autorisation `apprendre` de ce cours, pour la personne nommément ou pour l'un de ses
 * groupes. Le droit d'un groupe ne vaut que si le cours peut être ouvert à un groupe : un cours
 * « à vérifier » sans dérogation ne l'est pas (invariant 9, ADR-0001). Le contrôle se fait ici, à
 * chaque appel, et pas seulement quand le droit est donné (`ouvertureAutorisee`) : si un cours
 * déjà ouvert à un groupe gagne un élément « à vérifier », le groupe le perd aussitôt.
 */
function peutApprendre(
  personne: Personne,
  cours: CoursAcces,
  autorisations: readonly Autorisation[],
): boolean {
  const ouvertAuxGroupes = !(cours.aVerifier && !cours.derogation);
  return autorisations.some(
    (a) =>
      a.cours === cours.id &&
      a.permission === 'apprendre' &&
      ((a.sujet.type === 'personne' && a.sujet.id === personne.id) ||
        (ouvertAuxGroupes && a.sujet.type === 'groupe' && personne.groupes.includes(a.sujet.id))),
  );
}

/**
 * Sans personne ou sans cours, tout est refusé, même au propriétaire : un cours inconnu ne donne
 * lieu à aucune réponse. Le propriétaire peut tout. Les autres ont besoin d'une autorisation
 * `apprendre` sur ce cours pour `lister` et `lire`, nominative, ou par un groupe si le cours
 * peut être ouvert à un groupe (voir `peutApprendre`), et n'ont jamais `administrer`. Les droits se
 * cumulent, il n'y a pas de droit négatif. Une action inconnue est refusée.
 */
export function peut(
  personne: Personne | undefined,
  action: Action,
  cours: CoursAcces | undefined,
  autorisations: readonly Autorisation[],
): boolean {
  if (personne === undefined || cours === undefined) return false;
  if (personne.proprietaire) return true;
  if (action === 'lister' || action === 'lire') {
    return peutApprendre(personne, cours, autorisations);
  }
  return false;
}

/** Les cours que la personne peut lister, dans l'ordre reçu. */
export function coursVisibles<C extends CoursAcces>(
  personne: Personne | undefined,
  cours: readonly C[],
  autorisations: readonly Autorisation[],
): C[] {
  return cours.filter((c) => peut(personne, 'lister', c, autorisations));
}

export type RefusOuverture = 'cours_a_verifier_sans_derogation';

/**
 * Ouvrir un cours à un sujet. Un cours « à vérifier » ne s'ouvre pas à un groupe sans dérogation
 * écrite dans son manifeste ; il s'ouvre toujours à une personne nommément (ADR-0001). Rend la
 * raison du refus, ou `undefined` si l'ouverture est permise.
 */
export function ouvertureAutorisee(
  sujet: Autorisation['sujet'],
  cours: CoursAcces,
): RefusOuverture | undefined {
  if (sujet.type === 'groupe' && cours.aVerifier && !cours.derogation) {
    return 'cours_a_verifier_sans_derogation';
  }
  return undefined;
}
