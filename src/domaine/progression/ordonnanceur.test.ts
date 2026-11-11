import { expect, it } from 'vitest';
import type { ReglagesLeitner } from '../contenu/modele.js';
import { reponseDeTest } from '../evenements.fixture.js';
import type { Evenement } from '../journal/evenement.js';
import { ajouterJours } from '../journal/temps.js';
import { etatsDesUnites } from './etat.js';
import { etatsFsrs } from './fsrs.js';
import { ordonnanceurDe } from './ordonnanceur.js';

/*
 * NE PAS METTRE DE `describe` DANS CE FICHIER : voir le commentaire de `../acces.test.ts` (Stryker
 * ne retrouve pas un test placé dans une suite).
 *
 * Données factices, écrites à la main (invariant 7).
 */

const LEITNER: ReglagesLeitner = { intervalles: [0, 1, 2, 4, 8, 16], nouvellesParSeance: 15 };
const J0 = '2026-03-02';

/** Une réponse donnée à midi, heure locale, le `jour` dit. */
function repAMidi(n: number, unite: string, juste: boolean, jour: string): Evenement {
  return reponseDeTest(n, unite, juste, `${jour}T12:00:00.000+01:00`);
}

/** Quatre justes, chacune le jour d'échéance que rend FSRS à la précédente. */
function quatreJustesEspacees(): Evenement[] {
  const journal: Evenement[] = [];
  let jour = J0;
  for (let i = 0; i < 4; i++) {
    journal.push(repAMidi(i + 1, 'u1', true, jour));
    jour = etatsFsrs(journal, 0.9).get('u1')?.echeance ?? jour;
  }
  return journal;
}

it('sans réglage de mémoire, Leitner', () => {
  const journal = quatreJustesEspacees();
  expect(ordonnanceurDe({ leitner: LEITNER })(journal)).toEqual(etatsDesUnites(journal, LEITNER));
});

it('avec l’algorithme leitner, Leitner', () => {
  const journal = quatreJustesEspacees();
  const ordonnanceur = ordonnanceurDe({
    leitner: LEITNER,
    memoire: { algorithme: 'leitner', retention: 0.85 },
  });
  expect(ordonnanceur(journal)).toEqual(etatsDesUnites(journal, LEITNER));
});

it('avec l’algorithme fsrs, FSRS à la rétention du cours', () => {
  const journal = quatreJustesEspacees();
  const ordonnanceur = ordonnanceurDe({
    leitner: LEITNER,
    memoire: { algorithme: 'fsrs', retention: 0.85 },
  });
  const etats = ordonnanceur(journal);
  expect(etats).toEqual(etatsFsrs(journal, 0.85));
  expect(etats).not.toEqual(etatsDesUnites(journal, LEITNER));
});

/** Le nombre d'unités à revoir au jour dit (échéance atteinte ou dépassée). */
function nombreDues(etats: ReadonlyMap<string, { echeance: string | null }>, jour: string): number {
  let dues = 0;
  for (const { echeance } of etats.values()) {
    if (echeance !== null && echeance <= jour) dues += 1;
  }
  return dues;
}

it('le passage : FSRS ne charge pas beaucoup plus la révision que Leitner (M1-D8)', () => {
  // 60 unités, 2 introduites par jour pendant 30 jours. Chaque unité est répondue juste le jour de
  // son introduction, puis à chaque échéance que Leitner lui donne ; une sur cinq reçoit une faute
  // à sa deuxième révision.
  const journal: Evenement[] = [];
  const reponses = new Map<string, number>();
  let n = 0;
  const repondre = (unite: string, juste: boolean, jour: string): void => {
    n += 1;
    journal.push(repAMidi(n, unite, juste, jour));
    reponses.set(unite, (reponses.get(unite) ?? 0) + 1);
  };
  for (let j = 0; j < 31; j++) {
    const jour = ajouterJours(J0, j);
    const etats = etatsDesUnites(journal, LEITNER);
    for (let u = 0; u < 60; u++) {
      const unite = `u${String(u).padStart(2, '0')}`;
      if (u < 2 * j) {
        // Introduite un jour d'avant : à revoir si Leitner l'échoit.
        const echeance = etats.get(unite)?.echeance;
        if (echeance === undefined || echeance === null || echeance > jour) continue;
        // La deuxième révision est la troisième réponse de l'unité.
        const faute = u % 5 === 0 && reponses.get(unite) === 2;
        repondre(unite, !faute, jour);
      } else if (u < 2 * j + 2) {
        repondre(unite, true, jour);
      }
    }
  }
  const jour31 = ajouterJours(J0, 31);
  const duesLeitner = nombreDues(etatsDesUnites(journal, LEITNER), jour31);
  const duesFsrs = nombreDues(etatsFsrs(journal, 0.9), jour31);
  expect(duesFsrs).toBeLessThanOrEqual(duesLeitner + 6);
  expect(duesLeitner).toBe(9);
  expect(duesFsrs).toBe(1);
  // Les deux nombres, pour la revue : ils s'affichent si le test échoue, jamais autrement.
});
