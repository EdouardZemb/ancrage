import type { UniteDeCarte } from '../cartes/unites.js';
import type { Exercice, FamilleExercices, Mot } from '../contenu/modele.js';
import type { CoursPrepare, ModuleServiDe } from '../cours/prepare.js';
import { type Hasard, melanger } from '../hasard.js';
import type { Evenement } from '../journal/evenement.js';
import { jourDe } from '../journal/temps.js';
import { type EtatUnite, estDue, etatDe, journalSansDoublon } from '../progression/etat.js';
import { type ElementFerme, elementsTirables, GENRES_FERMES, idDeLElement } from './feuilles.js';

/*
 * La séance du jour, « Heute » (M2) : une file qui mêle tout ce qui est dû aujourd'hui, quel que
 * soit le type de l'unité, puis quelques cartes neuves. Les neuves viennent du choix fait dans
 * Karteikarten (M2-P10), et `nouvelles_par_seance` y est un plafond par jour (M2-P9) : le quota de
 * la séance est ce que ce plafond laisse après les cartes déjà découvertes aujourd'hui
 * (`decouvertesLe`). Le domaine ne lit ni l'horloge ni le hasard : le jour, l'état de chaque unité
 * (que rend l'ordonnanceur du cours), les candidates, le quota et le hasard sont des paramètres.
 */

/** Le plafond d'une séance du jour. */
export const TAILLE_DE_SEANCE = 20;

/**
 * Un élément qui se pose seul, marqué par son genre. `id` est l'identifiant de l'unité du journal :
 * celui de l'unité de carte, du mot, du point, de l'exercice ou de la question de fiche.
 */
export type Posable =
  | { genre: 'carte'; id: string; unite: UniteDeCarte }
  | { genre: 'mot'; id: string; mot: Mot }
  | { genre: 'point'; id: string; schema: ModuleServiDe<'schema'>; rang: number }
  | { genre: 'exercice'; id: string; famille: FamilleExercices; exercice: Exercice }
  | { genre: 'fermee'; id: string; element: ElementFerme };

/**
 * Tout ce qui peut se poser seul dans le cours, dans son ordre : les cartes, les mots qui ont au
 * moins un segment, les points des schémas, les exercices, puis les questions fermées des feuilles.
 * Les genres de fiche qui ne se posent pas seuls (appariement, classement, trous, orthographe,
 * question ouverte) n'y sont pas.
 */
export function posablesDuCours(cours: CoursPrepare): Posable[] {
  const cartes = cours.unites.map((unite): Posable => ({ genre: 'carte', id: unite.id, unite }));
  const mots = (cours.morphologie?.mots ?? [])
    .filter((mot) => mot.segments.length > 0)
    .map((mot): Posable => ({ genre: 'mot', id: mot.id, mot }));
  const points = cours.schemas.flatMap((schema) =>
    schema.points.map((point, rang): Posable => ({ genre: 'point', id: point.id, schema, rang })),
  );
  const exercices = (cours.exercices?.familles ?? []).flatMap((famille) =>
    famille.exercices.map(
      (exercice): Posable => ({ genre: 'exercice', id: exercice.id, famille, exercice }),
    ),
  );
  const fermees = elementsTirables(cours.feuilles, GENRES_FERMES).map(
    ({ element }): Posable => ({ genre: 'fermee', id: idDeLElement(element), element }),
  );
  return [...cartes, ...mots, ...points, ...exercices, ...fermees];
}

/**
 * Les posables dus aujourd'hui, dans l'ordre du cours. Un état dont l'unité n'est plus dans le
 * cours n'y entre pas, puisqu'on part des posables.
 */
export function duesDuJour(
  posables: readonly Posable[],
  etats: ReadonlyMap<string, EtatUnite>,
  aujourdhui: string,
): Posable[] {
  return posables.filter((p) => estDue(etatDe(etats, p.id), aujourdhui));
}

/** Les cartes neuves du cours : celles que le journal n'a jamais vues (boîte 0). */
export function cartesNeuves(
  posables: readonly Posable[],
  etats: ReadonlyMap<string, EtatUnite>,
): Posable[] {
  return posables.filter((p) => p.genre === 'carte' && etatDe(etats, p.id).boite === 0);
}

/**
 * Les cartes de `cartes` découvertes le `jour` (M2-P9) : celles dont la première réponse du journal
 * est de ce jour (local), où qu'elle ait été donnée. La première est la plus ancienne, dans l'ordre
 * du journal sans doublon, et non la première arrivée. Une réponse à une autre unité, ou un
 * événement d'examen, ne compte pas.
 */
export function decouvertesLe(
  evenements: readonly Evenement[],
  jour: string,
  cartes: ReadonlySet<string>,
): number {
  const vues = new Set<string>();
  let decouvertes = 0;
  for (const evenement of journalSansDoublon(evenements)) {
    if (evenement.type !== 'reponse' || !cartes.has(evenement.unite)) continue;
    if (vues.has(evenement.unite)) continue;
    vues.add(evenement.unite);
    if (jourDe(evenement.repondu_a) === jour) decouvertes++;
  }
  return decouvertes;
}

/** Les cartes neuves d'une séance du jour : les candidates (le choix de Karteikarten) et le quota. */
export interface NeuvesDuJour {
  /** Les posables de genre `carte` du choix ; seules celles en boîte 0 entrent dans la séance. */
  candidates: readonly Posable[];
  /** Le plafond du jour moins les cartes découvertes aujourd'hui, au moins 0. */
  quota: number;
}

/** La séance du jour : la file à poser, les éléments déjà revenus une fois, le compte des réponses. */
export interface SeanceDuJour {
  file: Posable[];
  /** Les identifiants des éléments manqués, remis en fin de file une fois (M2-P3). */
  revenus: readonly string[];
  faites: number;
  justes: number;
}

/**
 * Les échéances sont des `AAAA-MM-JJ` : la comparaison de chaînes les classe, sans dépendre de la
 * langue de l'appareil (jamais `localeCompare`).
 */
function parEcheance(etats: ReadonlyMap<string, EtatUnite>) {
  // Stryker disable next-line StringLiteral: une due a toujours une échéance (`estDue`), le repli
  // ne sert que le typage (équivalent).
  const echeanceDe = (p: Posable): string => etatDe(etats, p.id).echeance ?? '';
  return (a: Posable, b: Posable): number => {
    const x = echeanceDe(a);
    const y = echeanceDe(b);
    if (x < y) return -1;
    if (x > y) return 1;
    return 0;
  };
}

/**
 * La file du jour (M2-P2) : les dues, mélangées puis triées par échéance croissante d'un tri stable
 * (à échéance égale, le hasard départage), les `TAILLE_DE_SEANCE` premières gardées puis mélangées
 * pour l'ordre de passage ; ensuite, dans la place qui reste, au plus `neuves.quota` cartes
 * neuves des `neuves.candidates`, mélangées (M2-P9, M2-P10).
 */
export function composerSeance(
  posables: readonly Posable[],
  etats: ReadonlyMap<string, EtatUnite>,
  aujourdhui: string,
  neuves: NeuvesDuJour,
  hasard: Hasard,
): SeanceDuJour {
  const dues = melanger(duesDuJour(posables, etats, aujourdhui), hasard).sort(parEcheance(etats));
  const gardees = melanger(dues.slice(0, TAILLE_DE_SEANCE), hasard);
  const places = Math.max(0, Math.min(neuves.quota, TAILLE_DE_SEANCE - gardees.length));
  const tirees = melanger(cartesNeuves(neuves.candidates, etats), hasard).slice(0, places);
  return { file: [...gardees, ...tirees], revenus: [], faites: 0, justes: 0 };
}

/**
 * La séance après une réponse à l'élément de tête. Juste : il sort. Faux : il va en fin de file une
 * fois ; manqué une seconde fois, il sort (M2-P3). Une file vide ne change pas.
 */
export function apresReponseDuJour(seance: SeanceDuJour, juste: boolean): SeanceDuJour {
  const [tete, ...reste] = seance.file;
  if (tete === undefined) return seance;
  const faites = seance.faites + 1;
  const justes = seance.justes + (juste ? 1 : 0);
  if (juste || seance.revenus.includes(tete.id)) {
    return { ...seance, file: reste, faites, justes };
  }
  return { file: [...reste, tete], revenus: [...seance.revenus, tete.id], faites, justes };
}

/**
 * Le bilan d'une séance finie : les éléments passés et ceux qui sont finalement justes. Un élément
 * manqué revient une fois (M2-P3) et reçoit alors deux réponses : on retire de `faites` autant de
 * réponses que d'éléments revenus. Une réponse juste sort l'élément, donc `justes` compte des
 * éléments.
 */
export function bilanDuJour(seance: SeanceDuJour): { elements: number; justes: number } {
  return { elements: seance.faites - seance.revenus.length, justes: seance.justes };
}
