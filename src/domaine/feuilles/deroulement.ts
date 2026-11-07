import { elementsDeTache, idsDeFeuille } from '../contenu/feuille.js';
import type { ElementDeFeuille, PartieDeFeuille, Tache } from '../contenu/modele.js';
import type { Evenement } from '../journal/evenement.js';
import { journalSansDoublon } from '../progression/etat.js';

/*
 * Le déroulé d'une feuille, dérivé du journal (F1-D3). Rien n'est stocké : la dernière réponse de
 * chaque élément se relit dans le journal, qui n'est jamais modifié (ADR-0004, invariant 5). Sa
 * date vient du même parcours (F3-D2).
 */

/** La dernière réponse d'un élément : son verdict et le moment où elle a été donnée. */
export interface DerniereReponse {
  juste: boolean;
  /** Le `repondu_a` de l'événement : l'heure locale de l'appareil qui a répondu (`jourDe`). */
  reponduA: string;
}

/**
 * La dernière réponse de chaque unité, avec son moment, dans l'ordre du journal et sans doublon,
 * comme `etatsDesUnites` : le premier événement d'un `id` fait foi. Un examen n'y compte pas. C'est
 * le seul parcours du journal : le verdict, le score, l'état et la vue des résultats en viennent
 * (F3-D2).
 */
export function dernieresReponsesDatees(
  evenements: readonly Evenement[],
): ReadonlyMap<string, DerniereReponse> {
  const dernieres = new Map<string, DerniereReponse>();
  for (const evenement of journalSansDoublon(evenements)) {
    if (evenement.type !== 'reponse') continue;
    dernieres.set(evenement.unite, {
      juste: evenement.resultat.juste,
      reponduA: evenement.repondu_a,
    });
  }
  return dernieres;
}

/** La dernière réponse de chaque unité (`true` : juste) : la projection de `dernieresReponsesDatees`. */
export function dernieresReponses(evenements: readonly Evenement[]): ReadonlyMap<string, boolean> {
  return new Map(
    [...dernieresReponsesDatees(evenements)].map(([unite, { juste }]) => [unite, juste]),
  );
}

/** Le score d'une feuille : ses éléments dont la dernière réponse est juste, sur tous ses éléments. */
export function scoreDeFeuille(
  feuille: { parties: readonly PartieDeFeuille[] },
  dernieres: ReadonlyMap<string, boolean>,
): { justes: number; total: number } {
  const ids = idsDeFeuille(feuille);
  return { justes: ids.filter((id) => dernieres.get(id) === true).length, total: ids.length };
}

/** Où en est une feuille : aucun, une partie ou tous ses éléments ont une dernière réponse. */
export type EtatDeFeuille = 'neuve' | 'entamee' | 'faite';

/**
 * L'état d'une feuille, lu dans le journal : un élément est « répondu » s'il a une dernière
 * réponse, juste ou fausse, où qu'elle ait été donnée (F1-D3). Une feuille sans élément est neuve.
 */
export function etatDeFeuille(
  feuille: { parties: readonly PartieDeFeuille[] },
  dernieres: ReadonlyMap<string, boolean>,
): EtatDeFeuille {
  const ids = idsDeFeuille(feuille);
  const repondus = ids.filter((id) => dernieres.has(id)).length;
  if (repondus === 0) return 'neuve';
  return repondus === ids.length ? 'faite' : 'entamee';
}

export type ModeDeDeroule = 'tout' | 'erreurs' | 'nouveaux';

/** La tâche réduite aux éléments que garde `garder` ; un classement garde toutes ses catégories. */
function garderLesElements(tache: Tache, garder: (element: ElementDeFeuille) => boolean): Tache {
  switch (tache.genre) {
    case 'appariement':
      return { ...tache, paires: tache.paires.filter(garder) };
    case 'classement':
      return { ...tache, elements: tache.elements.filter(garder) };
    case 'qcm':
      return { ...tache, questions: tache.questions.filter(garder) };
    case 'vrai-faux':
      return { ...tache, affirmations: tache.affirmations.filter(garder) };
    case 'trous':
      return { ...tache, phrases: tache.phrases.filter(garder) };
    case 'orthographe':
      return { ...tache, mots: tache.mots.filter(garder) };
    case 'ouverte':
      return { ...tache, questions: tache.questions.filter(garder) };
    default: {
      const _exhaustif: never = tache;
      return _exhaustif;
    }
  }
}

/**
 * Les tâches à faire, dans l'ordre du papier, avec le titre de leur partie. En mode `erreurs`,
 * chaque tâche ne garde que les éléments dont la dernière réponse est fausse : un élément jamais
 * répondu n'est pas une erreur, et une tâche sans élément restant disparaît. En mode `nouveaux`,
 * elle ne garde que les éléments jamais répondus, juste ou faux : la reprise d'une feuille entamée.
 */
export function tachesADerouler(
  feuille: { parties: readonly PartieDeFeuille[] },
  mode: ModeDeDeroule,
  dernieres: ReadonlyMap<string, boolean>,
): { partie: string; tache: Tache }[] {
  const garder = {
    erreurs: (element: ElementDeFeuille) => dernieres.get(element.id) === false,
    nouveaux: (element: ElementDeFeuille) => dernieres.get(element.id) === undefined,
  };
  return feuille.parties.flatMap((partie) =>
    partie.taches
      .map((tache) => (mode === 'tout' ? tache : garderLesElements(tache, garder[mode])))
      .filter((tache) => elementsDeTache(tache).length > 0)
      .map((tache) => ({ partie: partie.titre, tache })),
  );
}

/** Une tâche et ses éléments, chacun avec sa dernière réponse, pour la vue des résultats (F3-D2). */
export interface ResultatDeTache {
  partie: string;
  tache: Tache;
  /** Dans l'ordre du papier (`elementsDeTache`) ; `null` : jamais répondu. */
  elements: { id: string; derniere: DerniereReponse | null }[];
}

/**
 * Les résultats d'une feuille, dans l'ordre du papier, avec le titre de la partie de chaque tâche.
 * Une tâche sans élément disparaît, comme dans `tachesADerouler` : c'est le cas d'un genre inconnu
 * (F1-D11). Un `id` du journal qui n'est pas de la feuille n'y paraît pas.
 */
export function resultatsDeFeuille(
  feuille: { parties: readonly PartieDeFeuille[] },
  dernieres: ReadonlyMap<string, DerniereReponse>,
): ResultatDeTache[] {
  return tachesADerouler(feuille, 'tout', new Map()).map(({ partie, tache }) => ({
    partie,
    tache,
    elements: elementsDeTache(tache).map(({ id }) => ({ id, derniere: dernieres.get(id) ?? null })),
  }));
}
