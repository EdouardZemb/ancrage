import { FSRS6_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-6';
import { expect, it } from 'vitest';
import type { ReglagesLeitner, ReglagesMemoire } from '../contenu/modele.js';
import { examenRemisDeTest, reponseDeTest } from '../evenements.fixture.js';
import { hasardDeterministe } from '../hasard.js';
import type { Evenement } from '../journal/evenement.js';
import { ajouterJours, jourDe } from '../journal/temps.js';
import { type EtatUnite, estDue, etatsDesUnites } from './etat.js';
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
    jour = etatsFsrs(journal, { retention: 0.9 }).get('u1')?.echeance ?? jour;
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
  expect(etats).toEqual(etatsFsrs(journal, { retention: 0.85 }));
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
  const duesFsrs = nombreDues(etatsFsrs(journal, { retention: 0.9 }), jour31);
  expect(duesFsrs).toBeLessThanOrEqual(duesLeitner + 6);
  expect(duesLeitner).toBe(9);
  expect(duesFsrs).toBe(1);
  // Les deux nombres, pour la revue : ils s'affichent si le test échoue, jamais autrement.
});

/** Le chapitre de chaque unité de carte (les deux sens d'une carte vont ensemble) ; un mot n'en a pas. */
const CHAPITRES: Record<string, string> = {
  a1: 'ch1',
  'a1:inverse': 'ch1',
  a2: 'ch1',
  b1: 'ch2',
  'b1:inverse': 'ch2',
};
const chapitreDe = (unite: string): string | undefined => CHAPITRES[unite];

/** Un journal qui mêle deux chapitres et un mot, avec des fautes et des jours qui s'écartent. */
function journalMele(): Evenement[] {
  const unites = ['a1', 'b1', 'mot1', 'a1:inverse', 'a2', 'b1:inverse'];
  const journal: Evenement[] = [];
  let n = 0;
  for (const [rang, unite] of unites.entries()) {
    for (const [passage, ecart] of [0, 1, 3, 8, 20].entries()) {
      n += 1;
      const juste = (rang + passage) % 4 !== 3;
      journal.push(repAMidi(n, unite, juste, ajouterJours(J0, ecart + rang)));
    }
  }
  return journal;
}

/** Les entrées de `etats` dont l'unité satisfait `garde`. */
function part(
  etats: ReadonlyMap<string, EtatUnite>,
  garde: (unite: string) => boolean,
): [string, EtatUnite][] {
  return [...etats].filter(([unite]) => garde(unite));
}

it('par chapitre : le chapitre nommé suit FSRS, le reste Leitner, chaque part égale à son algorithme seul', () => {
  const journal = journalMele();
  const memoire: ReglagesMemoire = {
    algorithme: 'par-chapitre',
    retention: 0.85,
    chapitres: ['ch1'],
  };
  const etats = ordonnanceurDe({ leitner: LEITNER, memoire, chapitreDe })(journal);
  const enFsrs = (unite: string): boolean => chapitreDe(unite) === 'ch1';
  const fsrsSeul = etatsFsrs(journal, { retention: 0.85 });
  const leitnerSeul = etatsDesUnites(journal, LEITNER);
  expect(part(etats, enFsrs)).toEqual(part(fsrsSeul, enFsrs));
  expect(part(etats, (unite) => !enFsrs(unite))).toEqual(
    part(leitnerSeul, (unite) => !enFsrs(unite)),
  );
  // Aucune unité n'est perdue ni ajoutée.
  expect(new Set(etats.keys())).toEqual(
    new Set(['a1', 'a1:inverse', 'a2', 'b1', 'b1:inverse', 'mot1']),
  );
  // Les deux algorithmes donnent des états différents sur ce journal : le partage se voit.
  expect(part(fsrsSeul, enFsrs)).not.toEqual(part(leitnerSeul, enFsrs));
  // Le mot et l'autre chapitre ne sont pas en FSRS.
  expect(etats.get('mot1')).toEqual(leitnerSeul.get('mot1'));
  expect(etats.get('b1')).toEqual(leitnerSeul.get('b1'));
  expect(etats.get('a1')).toEqual(fsrsSeul.get('a1'));
});

it('par chapitre : plusieurs chapitres, et un examen dans le journal', () => {
  const journal = [
    ...journalMele(),
    examenRemisDeTest('cm5r8t23', 3, `${ajouterJours(J0, 30)}T10:00:00.000+01:00`),
  ];
  const memoire: ReglagesMemoire = {
    algorithme: 'par-chapitre',
    retention: 0.9,
    chapitres: ['ch1', 'ch2'],
  };
  const etats = ordonnanceurDe({ leitner: LEITNER, memoire, chapitreDe })(journal);
  const fsrsSeul = etatsFsrs(journal, { retention: 0.9 });
  const leitnerSeul = etatsDesUnites(journal, LEITNER);
  for (const unite of ['a1', 'a1:inverse', 'a2', 'b1', 'b1:inverse']) {
    expect(etats.get(unite), unite).toEqual(fsrsSeul.get(unite));
  }
  expect(etats.get('mot1')).toEqual(leitnerSeul.get('mot1'));
  expect(etats.size).toBe(6);
});

it('par chapitre sans chapitreDe, ou sans chapitre nommé : tout Leitner', () => {
  const journal = journalMele();
  const memoire: ReglagesMemoire = {
    algorithme: 'par-chapitre',
    retention: 0.9,
    chapitres: ['ch1'],
  };
  const leitnerSeul = etatsDesUnites(journal, LEITNER);
  expect(ordonnanceurDe({ leitner: LEITNER, memoire })(journal)).toEqual(leitnerSeul);
  expect(ordonnanceurDe({ leitner: LEITNER, memoire, chapitreDe: () => 'ch9' })(journal)).toEqual(
    leitnerSeul,
  );
  expect(
    ordonnanceurDe({ leitner: LEITNER, memoire, chapitreDe: () => undefined })(journal),
  ).toEqual(leitnerSeul);
});

it('par chapitre : les paramètres et l’examen valent pour les chapitres en FSRS', () => {
  const journal = quatreJustesEspacees();
  const parametres = [...FSRS6_DEFAULT_WEIGHTS];
  parametres[2] = 12;
  // Quatre jours après la dernière réponse : le plafond y vaut deux jours.
  const examen = ajouterJours(jourDe(journal.at(-1)?.repondu_a ?? J0), 4);
  const retention = 0.9;
  const base: ReglagesMemoire = { algorithme: 'par-chapitre', retention, chapitres: ['ch1'] };
  const de = (memoire: ReglagesMemoire) =>
    ordonnanceurDe({ leitner: LEITNER, memoire, chapitreDe: () => 'ch1' })(journal).get('u1');
  const defaut = etatsFsrs(journal, { retention }).get('u1');
  expect(de({ ...base, parametres })).toEqual(
    etatsFsrs(journal, { retention, parametres }).get('u1'),
  );
  expect(de({ ...base, parametres })).not.toEqual(defaut);
  expect(de({ ...base, examen })).toEqual(etatsFsrs(journal, { retention, examen }).get('u1'));
  expect(de({ ...base, examen })).not.toEqual(defaut);
  expect(de({ ...base, parametres, examen })).toEqual(
    etatsFsrs(journal, { retention, parametres, examen }).get('u1'),
  );
});

it('fsrs : tout le cours, avec les paramètres et le plafond du cours', () => {
  const journal = quatreJustesEspacees();
  const parametres = [...FSRS6_DEFAULT_WEIGHTS];
  parametres[2] = 12;
  const examen = ajouterJours(J0, 30);
  const memoire: ReglagesMemoire = { algorithme: 'fsrs', retention: 0.9, parametres, examen };
  const attendu = etatsFsrs(journal, { retention: 0.9, parametres, examen });
  expect(ordonnanceurDe({ leitner: LEITNER, memoire })(journal)).toEqual(attendu);
  // Un chapitreDe donné n'y change rien : tout le cours suit FSRS.
  expect(ordonnanceurDe({ leitner: LEITNER, memoire, chapitreDe: () => 'ch9' })(journal)).toEqual(
    attendu,
  );
});

it('leitner et sans mémoire ignorent chapitreDe', () => {
  const journal = journalMele();
  const leitnerSeul = etatsDesUnites(journal, LEITNER);
  expect(ordonnanceurDe({ leitner: LEITNER, chapitreDe })(journal)).toEqual(leitnerSeul);
  expect(
    ordonnanceurDe({
      leitner: LEITNER,
      memoire: { algorithme: 'leitner', retention: 0.9 },
      chapitreDe,
    })(journal),
  ).toEqual(leitnerSeul);
});

/**
 * Un mois d'un chapitre de 45 cartes, tenu en Leitner : trois cartes neuves par jour, un jour sur
 * dix sans réponse, chaque carte due revue le jour même, sept réponses justes sur dix (le hasard
 * est à graine : le journal est toujours le même).
 */
function unMoisDeLeitner(): { journal: Evenement[]; lendemain: string } {
  const hasard = hasardDeterministe(20261112);
  const journal: Evenement[] = [];
  const unites = Array.from({ length: 45 }, (_, rang) => `c${String(rang).padStart(2, '0')}`);
  let introduites = 0;
  let n = 0;
  for (let jour = 0; jour < 30; jour++) {
    if (hasard() < 0.1) continue;
    const date = ajouterJours(J0, jour);
    const etats = etatsDesUnites(journal, LEITNER);
    const dues = unites.slice(0, introduites).filter((unite) => {
      const etat = etats.get(unite);
      return etat !== undefined && estDue(etat, date);
    });
    const neuves = unites.slice(introduites, introduites + 3);
    introduites += neuves.length;
    for (const unite of [...dues, ...neuves]) {
      n += 1;
      journal.push(repAMidi(n, unite, hasard() < 0.7, date));
    }
  }
  return { journal, lendemain: ajouterJours(J0, 30) };
}

it('le passage d’un chapitre après un mois : FSRS ne dépasse pas une fois et demie Leitner (M3-P9)', () => {
  const { journal, lendemain } = unMoisDeLeitner();
  const memoire: ReglagesMemoire = {
    algorithme: 'par-chapitre',
    retention: 0.9,
    chapitres: ['ch'],
  };
  const enFsrs = ordonnanceurDe({ leitner: LEITNER, memoire, chapitreDe: () => 'ch' })(journal);
  const duesLeitner = nombreDues(etatsDesUnites(journal, LEITNER), lendemain);
  const duesFsrs = nombreDues(enFsrs, lendemain);
  // Les deux nombres s'affichent dans le message de l'échec.
  const message = `dues en Leitner ${duesLeitner}, en FSRS ${duesFsrs}`;
  expect(duesLeitner, message).toBeGreaterThan(0);
  expect(duesFsrs, message).toBeLessThanOrEqual(Math.floor(duesLeitner * 1.5));
});
