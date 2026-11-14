import type { CoursPrepare } from '../../domaine/cours/prepare.js';
import { memoireDuCours } from '../../domaine/cours/servi.js';
import type { Evenement } from '../../domaine/journal/evenement.js';

/*
 * Ce que l'ajustement apprend (M3) : ce que le rejeu lit, c'est-à-dire ce que FSRS planifiera. En
 * `par-chapitre`, ce sont les cartes des chapitres de FSRS : les mots, les points, les exercices, les
 * fiches et les autres cartes restent en Leitner et fausseraient les poids. En `fsrs`, FSRS planifie
 * tout le cours (`ordonnanceurDe`) : toutes les unités comptent. Sans `memoire` (Leitner), il n'y a
 * rien que FSRS planifie : toutes les cartes du cours servent, comme un chapitre choisi à la main.
 */

/** Les identifiants des modules de cartes du cours. */
export function modulesDeCartes(cours: CoursPrepare): string[] {
  return cours.cours.modules.filter((module) => module.type === 'cartes').map(({ id }) => id);
}

/**
 * Les chapitres dont l'ajustement lit les réponses : ceux que demande la commande ; sinon `chapitres`
 * du manifeste s'il est en `par-chapitre` ; sinon, en `fsrs`, `null` (toutes les unités du cours) ;
 * sinon (Leitner, ou pas de `memoire`) tous les modules de cartes. Un chapitre demandé qui n'est pas
 * un module de cartes du cours est rendu en `inconnu` (son identifiant).
 */
export function chapitresAAjuster(
  cours: CoursPrepare,
  demandes: readonly string[],
): { chapitres: ReadonlySet<string> | null } | { inconnu: string } {
  const cartes = modulesDeCartes(cours);
  const inconnu = demandes.find((chapitre) => !cartes.includes(chapitre));
  if (inconnu !== undefined) return { inconnu };
  if (demandes.length > 0) return { chapitres: new Set(demandes) };
  const memoire = memoireDuCours(cours.cours);
  if (memoire?.algorithme === 'par-chapitre' && memoire.chapitres !== undefined) {
    return { chapitres: new Set(memoire.chapitres) };
  }
  if (memoire?.algorithme === 'fsrs') return { chapitres: null };
  return { chapitres: new Set(cartes) };
}

/**
 * Ne garde des `journaux` que les réponses aux cartes des `chapitres` (`null` : tout le cours), et
 * compte celles qui sont écartées. Rien qui nomme une personne n'en sort : des journaux et un nombre.
 */
export function garderLesCartes(
  journaux: readonly (readonly Evenement[])[],
  cours: CoursPrepare,
  chapitres: ReadonlySet<string> | null,
): { journaux: Evenement[][]; ecartees: number } {
  if (chapitres === null) return { journaux: journaux.map((journal) => [...journal]), ecartees: 0 };
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
