import type { Hasard } from '../hasard.js';
import { melanger } from '../hasard.js';
import type { Evenement } from '../journal/evenement.js';
import { jourDe, joursEntre } from '../journal/temps.js';
import { type EtatUnite, estDue, etatDe, journalDesRevisions } from '../progression/etat.js';
import { type Posable, type SeanceDuJour, TAILLE_DE_SEANCE } from './heute.js';
import { ouvertureDe } from './planning.js';
import { etapeEnCours, type PlanningDuJour } from './semestre.js';

/*
 * Les révisions de la séance du jour à une étape de révision (M4, C-D8 à C-D11) : des éléments déjà
 * vus des étapes ouvertes, que l'ordonnanceur ne rend pas dus aujourd'hui, repris à la moitié de
 * leur intervalle, tour à tour entre les étapes. Une révision est une réponse comme une autre. Le
 * domaine ne lit ni l'horloge ni le hasard : le jour et le hasard sont des paramètres.
 */

/**
 * Les révisions du jour (C-D8 à C-D10) : `[]` hors d'une étape de révision ; sinon les révisables
 * des étapes ouvertes (vus, pas dus, sans réponse aujourd'hui, et à la moitié au moins de leur
 * intervalle depuis leur dernière réponse au journal des révisions), tour à tour, les plus fragiles
 * d'abord, au plus `Math.max(0, TAILLE_DE_SEANCE - répondus)`, `répondus` étant les éléments du
 * cours répondus aujourd'hui.
 */
export function revisionsDuJour(
  posables: readonly Posable[],
  modules: ReadonlyMap<string, string>,
  journal: {
    etats: ReadonlyMap<string, EtatUnite>;
    evenements: readonly Evenement[];
    aujourdhui: string;
  },
  lu: PlanningDuJour,
): Posable[] {
  const { etats, evenements, aujourdhui } = journal;
  const courante = etapeEnCours(lu, aujourdhui);
  if (courante?.genre !== 'revision') return [];

  // Le jour de la dernière réponse de chaque unité (le journal est dans son ordre), et les unités
  // répondues aujourd'hui. Un pré-test n'y entre pas (B-D9).
  const derniere = new Map<string, string>();
  const repondues = new Set<string>();
  for (const evenement of journalDesRevisions(evenements)) {
    // Stryker disable next-line ConditionalExpression: un examen a pour unité celle de son module,
    // qu'aucun posable ne porte : l'ignorer ou non est sans effet (équivalent).
    if (evenement.type !== 'reponse') continue;
    const jour = jourDe(evenement.repondu_a);
    derniere.set(evenement.unite, jour);
    if (jour === aujourdhui) repondues.add(evenement.unite);
  }
  const repondus = posables.filter(({ id }) => repondues.has(id)).length;
  const nombre = Math.max(0, TAILLE_DE_SEANCE - repondus);

  const revisable = (p: Posable): boolean => {
    const etat = etatDe(etats, p.id);
    const jour = derniere.get(p.id);
    // Stryker disable next-line ConditionalExpression,LogicalOperator: une unité en boîte 1 au
    // moins a une réponse au journal et, non due, une échéance ; ces gardes ne servent que le
    // typage (équivalent).
    if (etat.boite < 1 || jour === undefined || etat.echeance === null) return false;
    if (estDue(etat, aujourdhui) || repondues.has(p.id)) return false;
    return 2 * joursEntre(jour, aujourdhui) >= joursEntre(jour, etat.echeance);
  };

  // Chaque étape ouverte prend ses révisables, les plus fragiles d'abord : la boîte croissante,
  // puis l'échéance croissante (des `AAAA-MM-JJ` se classent comme des chaînes), puis l'ordre du
  // cours, le tri étant stable. Un élément que deux étapes citent n'est pris qu'une fois.
  const deja = new Set<string>();
  const parEtape = lu.planning.etapes
    .filter((etape) => ouvertureDe(etape, lu.depart) <= aujourdhui)
    .map((etape) => {
      // Un posable sans module (`undefined`) n'est dans aucune étape.
      const citees = new Set<string | undefined>(etape.modules);
      const choisies = posables
        .filter((p) => citees.has(modules.get(p.id)) && !deja.has(p.id) && revisable(p))
        .sort((a, b) => {
          const x = etatDe(etats, a.id);
          const y = etatDe(etats, b.id);
          if (x.boite !== y.boite) return x.boite - y.boite;
          // Un révisable a une échéance : le repli ne sert que le typage.
          return joursEntre(y.echeance ?? aujourdhui, x.echeance ?? aujourdhui);
        });
      for (const { id } of choisies) deja.add(id);
      return choisies;
    });

  // Tour à tour : une par étape à chaque tour, dans l'ordre du planning.
  const tours = Math.max(0, ...parEtape.map((choisies) => choisies.length));
  const melees = Array.from({ length: tours }, (_, rang) =>
    parEtape.flatMap((choisies) => choisies.slice(rang, rang + 1)),
  ).flat();
  return melees.slice(0, nombre);
}

/** La séance avec ses révisions, autant que ses places le permettent, mêlées aux dues (C-D11). */
export function avecRevisions(
  seance: SeanceDuJour,
  revisions: readonly Posable[],
  etats: ReadonlyMap<string, EtatUnite>,
  hasard: Hasard,
): SeanceDuJour {
  const prises = revisions.slice(0, Math.max(0, TAILLE_DE_SEANCE - seance.file.length));
  if (prises.length === 0) return seance;
  // Les cartes neuves restent en fin de file, comme dans `composerSeance` (M2-P2).
  const neuve = (p: Posable): boolean => etatDe(etats, p.id).boite === 0;
  const dues = seance.file.filter((p) => !neuve(p));
  const neuves = seance.file.filter(neuve);
  return { ...seance, file: [...melanger([...dues, ...prises], hasard), ...neuves] };
}
