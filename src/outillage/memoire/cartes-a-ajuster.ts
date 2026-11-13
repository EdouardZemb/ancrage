import type { CoursPrepare } from '../../domaine/cours/prepare.js';
import { memoireDuCours } from '../../domaine/cours/servi.js';
import type { Evenement } from '../../domaine/journal/evenement.js';

/*
 * Ce que l'ajustement apprend (M3) : seulement les réponses aux cartes que FSRS planifiera. Les mots,
 * les points, les exercices et les fiches restent en Leitner, et un chapitre de cartes qui reste en
 * Leitner (`par-chapitre`) ne compte pas non plus : leurs réponses n'ont pas la forme de ce que FSRS
 * rejoue, et fausseraient les poids.
 */

/** Les identifiants des modules de cartes du cours. */
export function modulesDeCartes(cours: CoursPrepare): string[] {
  return cours.cours.modules.filter((module) => module.type === 'cartes').map(({ id }) => id);
}

/**
 * Les chapitres dont l'ajustement lit les réponses : ceux que demande la commande ; sinon `chapitres`
 * du manifeste s'il est en `par-chapitre` ; sinon tous les modules de cartes du cours. Un chapitre
 * demandé qui n'est pas un module de cartes du cours est rendu en `inconnu` (son identifiant).
 */
export function chapitresAAjuster(
  cours: CoursPrepare,
  demandes: readonly string[],
): { chapitres: ReadonlySet<string> } | { inconnu: string } {
  const cartes = modulesDeCartes(cours);
  const inconnu = demandes.find((chapitre) => !cartes.includes(chapitre));
  if (inconnu !== undefined) return { inconnu };
  if (demandes.length > 0) return { chapitres: new Set(demandes) };
  const memoire = memoireDuCours(cours.cours);
  if (memoire?.algorithme === 'par-chapitre' && memoire.chapitres !== undefined) {
    return { chapitres: new Set(memoire.chapitres) };
  }
  return { chapitres: new Set(cartes) };
}

/**
 * Ne garde des `journaux` que les réponses aux cartes des `chapitres`, et compte celles qui sont
 * écartées. Rien qui nomme une personne n'en sort : des journaux et un nombre.
 */
export function garderLesCartes(
  journaux: readonly (readonly Evenement[])[],
  cours: CoursPrepare,
  chapitres: ReadonlySet<string>,
): { journaux: Evenement[][]; ecartees: number } {
  const unites = new Set(
    cours.unites.filter((unite) => chapitres.has(unite.module)).map((unite) => unite.id),
  );
  let ecartees = 0;
  const gardes = journaux.map((journal) =>
    journal.filter((evenement) => {
      const garde = unites.has(evenement.unite);
      if (!garde) ecartees += 1;
      return garde;
    }),
  );
  return { journaux: gardes, ecartees };
}
