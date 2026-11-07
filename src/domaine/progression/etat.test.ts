import { expect, it } from 'vitest';
import type { ReglagesLeitner } from '../contenu/modele.js';
import type { Evenement, ResultatExamen } from '../journal/evenement.js';
import { ajouterJours } from '../journal/temps.js';
import {
  ETAT_NEUF,
  type EtatUnite,
  estDue,
  etatDe,
  etatsDesUnites,
  examensPasses,
  reponsesParJour,
  serie,
} from './etat.js';

/*
 * NE PAS METTRE DE `describe` DANS CE FICHIER : voir le commentaire de `../acces.test.ts` (Stryker
 * ne retrouve pas un test placé dans une suite).
 *
 * Données factices, écrites à la main (invariant 7).
 */

const LEITNER: ReglagesLeitner = { intervalles: [0, 1, 2, 4, 8, 16], nouvellesParSeance: 15 };

const U1 = 'abcd1234';
const U2 = 'efgh5678';
const EXAMEN_1 = 'exam0001';

const APPAREIL_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APPAREIL_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ID = (n: number): string => `01929f3a-5b3c-7000-8000-${String(n).padStart(12, '0')}`;

/** Une réponse, donnée à l'instant local `reponduA` (avec son décalage). */
function rep(
  n: number,
  unite: string,
  juste: boolean,
  reponduA: string,
  appareil = APPAREIL_A,
): Evenement {
  return {
    id: ID(n),
    cours: 'cm5r8t23',
    unite,
    type: 'reponse',
    resultat: { juste },
    repondu_a: reponduA,
    appareil,
    v: 1,
  };
}

const RESULTAT_EXAMEN: ResultatExamen = {
  points: 18,
  questions: 24,
  note: 4.5,
  minutes: 12,
  chapitres: 3,
};

/** Un examen, remis à l'instant local `reponduA`. */
function exam(
  n: number,
  reponduA: string,
  resultat: ResultatExamen = RESULTAT_EXAMEN,
  unite = EXAMEN_1,
): Evenement {
  return {
    id: ID(n),
    cours: 'cm5r8t23',
    unite,
    type: 'examen',
    resultat,
    repondu_a: reponduA,
    appareil: APPAREIL_A,
    v: 1,
  };
}

/** Une réponse juste ou fausse le `jour`, à 10 h (+02:00). */
const le = (jour: string): string => `${jour}T10:00:00.000+02:00`;

/** Toutes les permutations d'une liste. */
function permutations<T>(liste: readonly T[]): T[][] {
  if (liste.length <= 1) return [[...liste]];
  return liste.flatMap((element, i) =>
    permutations([...liste.slice(0, i), ...liste.slice(i + 1)]).map((reste) => [element, ...reste]),
  );
}

const etat = (
  boite: number,
  echeance: string | null,
  justes: number,
  fausses: number,
): EtatUnite => ({
  boite,
  echeance,
  justes,
  fausses,
});

it('etat_neuf_est_une_unite_jamais_vue', () => {
  expect(ETAT_NEUF).toEqual({ boite: 0, echeance: null, justes: 0, fausses: 0 });
  expect(etatDe(new Map(), U1)).toEqual(ETAT_NEUF);
  expect(etatsDesUnites([], LEITNER).size).toBe(0);

  const etats = etatsDesUnites([rep(1, U1, true, le('2026-10-17'))], LEITNER);
  expect(etatDe(etats, U1)).toEqual(etat(1, '2026-10-18', 1, 0));
  expect(etatDe(etats, U2)).toEqual(ETAT_NEUF);
  expect([...etats.keys()]).toEqual([U1]);
});

it('juste_monte_d_une_boite_et_repousse_l_echeance', () => {
  const evenements = [
    rep(1, U1, true, le('2026-10-17')),
    rep(2, U1, true, le('2026-10-18')),
    rep(3, U1, true, le('2026-10-20')),
    rep(4, U1, true, le('2026-10-24')),
  ];
  // Boîte 0 → 1 : revue dans 1 jour ; puis 2 jours, 4 jours, 8 jours.
  expect(etatDe(etatsDesUnites(evenements.slice(0, 1), LEITNER), U1)).toEqual(
    etat(1, '2026-10-18', 1, 0),
  );
  expect(etatDe(etatsDesUnites(evenements.slice(0, 2), LEITNER), U1)).toEqual(
    etat(2, '2026-10-20', 2, 0),
  );
  expect(etatDe(etatsDesUnites(evenements.slice(0, 3), LEITNER), U1)).toEqual(
    etat(3, '2026-10-24', 3, 0),
  );
  expect(etatDe(etatsDesUnites(evenements, LEITNER), U1)).toEqual(etat(4, '2026-11-01', 4, 0));
});

it('boite_plafonnee_a_5_echeance_a_16_jours', () => {
  const evenements = [1, 2, 3, 4, 5, 6, 7].map((n) =>
    rep(n, U1, true, le(`2026-10-${String(n).padStart(2, '0')}`)),
  );
  expect(etatDe(etatsDesUnites(evenements.slice(0, 5), LEITNER), U1)).toEqual(
    etat(5, '2026-10-21', 5, 0),
  );
  // Une sixième et une septième bonne réponse restent en boîte 5, à 16 jours.
  expect(etatDe(etatsDesUnites(evenements.slice(0, 6), LEITNER), U1)).toEqual(
    etat(5, '2026-10-22', 6, 0),
  );
  expect(etatDe(etatsDesUnites(evenements, LEITNER), U1)).toEqual(etat(5, '2026-10-23', 7, 0));
});

it('intervalles_du_cours_font_foi', () => {
  const leitner: ReglagesLeitner = { intervalles: [0, 3, 6, 9, 12, 30], nouvellesParSeance: 5 };
  const evenements = [1, 2, 3, 4, 5].map((n) => rep(n, U1, true, le(`2026-10-0${n}`)));
  expect(etatDe(etatsDesUnites(evenements.slice(0, 1), leitner), U1).echeance).toBe('2026-10-04');
  expect(etatDe(etatsDesUnites(evenements.slice(0, 2), leitner), U1).echeance).toBe('2026-10-08');
  expect(etatDe(etatsDesUnites(evenements.slice(0, 3), leitner), U1).echeance).toBe('2026-10-12');
  expect(etatDe(etatsDesUnites(evenements.slice(0, 4), leitner), U1).echeance).toBe('2026-10-16');
  expect(etatDe(etatsDesUnites(evenements, leitner), U1)).toEqual(etat(5, '2026-11-04', 5, 0));
});

it('faux_renvoie_en_boite_1_a_revoir_le_jour_meme', () => {
  const justes = [1, 2, 3].map((n) => rep(n, U1, true, le(`2026-10-0${n}`)));
  expect(etatDe(etatsDesUnites(justes, LEITNER), U1).boite).toBe(3);

  // Depuis la boîte 3 : retour en boîte 1, à revoir le jour de l'erreur ; les justes restent.
  const apres = etatsDesUnites([...justes, rep(4, U1, false, le('2026-10-10'))], LEITNER);
  expect(etatDe(apres, U1)).toEqual(etat(1, '2026-10-10', 3, 1));

  // Depuis une unité neuve.
  const neuve = etatsDesUnites([rep(5, U2, false, le('2026-10-12'))], LEITNER);
  expect(etatDe(neuve, U2)).toEqual(etat(1, '2026-10-12', 0, 1));

  // Plusieurs erreurs de suite comptent chacune ; une bonne réponse repart de la boîte 1.
  const suite = etatsDesUnites(
    [
      rep(6, U2, false, le('2026-10-12')),
      rep(7, U2, false, le('2026-10-13')),
      rep(8, U2, true, le('2026-10-14')),
    ],
    LEITNER,
  );
  expect(etatDe(suite, U2)).toEqual(etat(2, '2026-10-16', 1, 2));
});

it('jour_local_de_l_evenement_fait_foi', () => {
  const evenements = [
    // 21:30 UTC le 17 : le 17 ici comme là-bas.
    rep(1, 'aaaaaaa1', true, '2026-10-17T23:30:00.000+02:00'),
    // 22:30 UTC le 16 : le 17 pour l'appareil.
    rep(2, 'aaaaaaa2', true, '2026-10-17T00:30:00.000+02:00'),
    // 03:30 UTC le 18 : le 17 pour l'appareil.
    rep(3, 'aaaaaaa3', true, '2026-10-17T23:30:00.000-04:00', APPAREIL_B),
    // Une erreur : à revoir le jour local.
    rep(4, 'aaaaaaa4', false, '2026-10-17T00:30:00.000+02:00'),
    rep(5, 'aaaaaaa5', false, '2026-10-17T23:30:00.000-04:00', APPAREIL_B),
  ];
  const etats = etatsDesUnites(evenements, LEITNER);
  expect(etatDe(etats, 'aaaaaaa1').echeance).toBe('2026-10-18');
  expect(etatDe(etats, 'aaaaaaa2').echeance).toBe('2026-10-18');
  expect(etatDe(etats, 'aaaaaaa3').echeance).toBe('2026-10-18');
  expect(etatDe(etats, 'aaaaaaa4').echeance).toBe('2026-10-17');
  expect(etatDe(etats, 'aaaaaaa5').echeance).toBe('2026-10-17');

  expect(reponsesParJour(evenements)).toEqual(new Map([['2026-10-17', 5]]));
});

it('sens_direct_et_sens_inverse_sont_deux_unites', () => {
  const etats = etatsDesUnites(
    [
      rep(1, U1, true, le('2026-10-17')),
      rep(2, `${U1}:inverse`, false, le('2026-10-17')),
      rep(3, `${U1}:inverse`, false, le('2026-10-17')),
    ],
    LEITNER,
  );
  expect(etatDe(etats, U1)).toEqual(etat(1, '2026-10-18', 1, 0));
  expect(etatDe(etats, `${U1}:inverse`)).toEqual(etat(1, '2026-10-17', 0, 2));
  expect(etats.size).toBe(2);
});

/** Six réponses venues de deux téléphones, aux décalages +02:00 et -04:00. */
const DEUX_APPAREILS: Evenement[] = [
  // 06:00 UTC
  rep(1, U1, true, '2026-10-17T08:00:00.000+02:00', APPAREIL_A),
  // 06:30 UTC
  rep(2, U1, true, '2026-10-17T02:30:00.000-04:00', APPAREIL_B),
  // 07:00 UTC
  rep(3, U1, false, '2026-10-17T09:00:00.000+02:00', APPAREIL_A),
  // 07:15 UTC
  rep(4, U1, true, '2026-10-17T03:15:00.000-04:00', APPAREIL_B),
  // 22:10 UTC le 17 : le 18 chez A, le 17 chez B ; même instant, l'id départage.
  rep(5, U2, true, '2026-10-18T00:10:00.000+02:00', APPAREIL_A),
  rep(6, U2, false, '2026-10-17T18:10:00.000-04:00', APPAREIL_B),
];

it('deux_appareils_meme_etat_quel_que_soit_l_ordre', () => {
  // L'état attendu, calculé à la main dans l'ordre des instants (puis des id).
  const attendu = new Map([
    [U1, etat(2, '2026-10-19', 3, 1)],
    [U2, etat(1, '2026-10-17', 1, 1)],
  ]);
  const jours = new Map([
    ['2026-10-17', 5],
    ['2026-10-18', 1],
  ]);

  const toutes = permutations(DEUX_APPAREILS);
  expect(toutes).toHaveLength(720);
  for (const ordre of toutes) {
    expect(etatsDesUnites(ordre, LEITNER)).toEqual(attendu);
    expect(reponsesParJour(ordre)).toEqual(jours);
  }

  // L'ordre des clés ne dépend pas non plus de l'arrivée.
  const inverse = [...DEUX_APPAREILS].reverse();
  expect([...etatsDesUnites(inverse, LEITNER).keys()]).toEqual([U1, U2]);
  expect([...reponsesParJour(inverse).keys()]).toEqual(['2026-10-17', '2026-10-18']);
});

it('union_de_deux_journaux_vaut_le_journal_entier', () => {
  // Chaque appareil a son journal ; le serveur les réunit, chacun rejoue l'ensemble.
  const chezA = DEUX_APPAREILS.filter((e) => e.appareil === APPAREIL_A);
  const chezB = DEUX_APPAREILS.filter((e) => e.appareil === APPAREIL_B);
  const entier = etatsDesUnites(DEUX_APPAREILS, LEITNER);
  expect(etatsDesUnites([...chezA, ...chezB], LEITNER)).toEqual(entier);
  expect(etatsDesUnites([...chezB, ...chezA], LEITNER)).toEqual(entier);
  // Chaque journal seul donne un autre état : la fusion compte.
  expect(etatsDesUnites(chezA, LEITNER)).not.toEqual(entier);
  expect(etatsDesUnites(chezB, LEITNER)).not.toEqual(entier);
});

it('examen_ne_compte_ni_comme_reponse_ni_dans_les_jours', () => {
  const evenements = [
    rep(1, U1, true, le('2026-10-16')),
    rep(2, U1, true, le('2026-10-16')),
    // Un examen d'une unité qui reçoit aussi des réponses, et un autre jour sans réponse.
    exam(3, le('2026-10-16'), RESULTAT_EXAMEN, U1),
    exam(4, le('2026-10-17')),
  ];
  const etats = etatsDesUnites(evenements, LEITNER);
  expect(etatDe(etats, U1)).toEqual(etat(2, '2026-10-18', 2, 0));
  expect(etatDe(etats, EXAMEN_1)).toEqual(ETAT_NEUF);
  expect([...etats.keys()]).toEqual([U1]);

  expect(reponsesParJour(evenements)).toEqual(new Map([['2026-10-16', 2]]));
  expect(reponsesParJour([exam(5, le('2026-10-17'))]).size).toBe(0);
  expect(etatsDesUnites([exam(6, le('2026-10-17'))], LEITNER).size).toBe(0);
});

it('serie_compte_depuis_hier_si_rien_aujourd_hui', () => {
  const aujourdhui = '2026-10-17';
  const jours = (...entrees: [string, number][]): Map<string, number> => new Map(entrees);

  // Réponses aujourd'hui, hier et avant-hier.
  expect(serie(jours(['2026-10-17', 2], ['2026-10-16', 1], ['2026-10-15', 4]), aujourdhui)).toBe(3);
  // Rien encore aujourd'hui : la série d'hier tient, et ne casse pas.
  expect(serie(jours(['2026-10-16', 1], ['2026-10-15', 4]), aujourdhui)).toBe(2);
  expect(serie(jours(['2026-10-16', 1]), aujourdhui)).toBe(1);
  // Aujourd'hui seulement.
  expect(serie(jours(['2026-10-17', 1]), aujourdhui)).toBe(1);
  // Ni aujourd'hui ni hier : la série est rompue, même si l'avant-veille compte.
  expect(serie(jours(['2026-10-15', 2], ['2026-10-14', 2]), aujourdhui)).toBe(0);
  expect(serie(jours(), aujourdhui)).toBe(0);
  // Un trou s'arrête là, avant ou après aujourd'hui.
  expect(serie(jours(['2026-10-17', 1], ['2026-10-15', 1]), aujourdhui)).toBe(1);
  expect(serie(jours(['2026-10-16', 1], ['2026-10-14', 1]), aujourdhui)).toBe(1);
  // Un jour à zéro est un jour sans réponse.
  expect(serie(jours(['2026-10-16', 0], ['2026-10-15', 3]), aujourdhui)).toBe(0);
  expect(serie(jours(['2026-10-17', 0], ['2026-10-16', 2]), aujourdhui)).toBe(1);
  expect(serie(jours(['2026-10-17', 1], ['2026-10-16', 0], ['2026-10-15', 3]), aujourdhui)).toBe(1);
  // Les jours à venir ne comptent pas.
  expect(serie(jours(['2026-10-18', 5], ['2026-10-17', 1]), aujourdhui)).toBe(1);
  expect(serie(jours(['2026-10-18', 5]), aujourdhui)).toBe(0);

  // Les frontières de mois et d'année.
  const novembre = jours(
    ['2026-11-02', 1],
    ['2026-11-01', 1],
    ['2026-10-31', 1],
    ['2026-10-30', 1],
  );
  expect(serie(novembre, '2026-11-02')).toBe(4);
  expect(serie(jours(['2026-02-28', 1], ['2026-02-27', 1]), '2026-03-01')).toBe(2);
  expect(serie(jours(['2026-12-31', 1], ['2026-12-30', 1]), '2027-01-01')).toBe(2);

  // Une longue série, puis la même avec un trou au dixième jour avant aujourd'hui.
  const longue = new Map<string, number>();
  for (let i = 0; i < 40; i++) longue.set(ajouterJours(aujourdhui, -i), 1);
  expect(serie(longue, aujourdhui)).toBe(40);
  longue.delete(ajouterJours(aujourdhui, -10));
  expect(serie(longue, aujourdhui)).toBe(10);
});

it('reponses_par_jour', () => {
  const evenements = [
    rep(1, U1, true, '2026-10-17T00:30:00.000+02:00'),
    rep(2, U2, false, '2026-10-17T23:30:00.000+02:00'),
    rep(3, U1, true, '2026-10-17T23:30:00.000-04:00', APPAREIL_B),
    rep(4, `${U1}:inverse`, true, '2026-10-16T08:00:00.000+02:00'),
    rep(5, U2, true, '2026-10-16T08:00:01.000+02:00'),
    rep(6, U2, true, '2026-10-01T08:00:00.000+02:00'),
    exam(7, '2026-10-17T12:00:00.000+02:00'),
  ];
  expect(reponsesParJour(evenements)).toEqual(
    new Map([
      ['2026-10-01', 1],
      ['2026-10-16', 2],
      ['2026-10-17', 3],
    ]),
  );
  expect(reponsesParJour([]).size).toBe(0);
});

it('est_due_selon_la_boite_et_l_echeance', () => {
  const aujourdhui = '2026-10-17';
  // Une unité jamais vue n'est pas due : elle est neuve.
  expect(estDue(ETAT_NEUF, aujourdhui)).toBe(false);
  // Échéance passée, du jour, à venir.
  expect(estDue(etat(1, '2026-10-16', 1, 0), aujourdhui)).toBe(true);
  expect(estDue(etat(1, '2026-10-17', 1, 0), aujourdhui)).toBe(true);
  expect(estDue(etat(1, '2026-10-18', 1, 0), aujourdhui)).toBe(false);
  expect(estDue(etat(5, '2026-09-30', 9, 0), aujourdhui)).toBe(true);
  expect(estDue(etat(5, '2027-01-01', 9, 0), aujourdhui)).toBe(false);
  // Les jours se comparent comme des dates, pas comme des nombres.
  expect(estDue(etat(2, '2026-09-30', 2, 0), '2026-10-01')).toBe(true);
  expect(estDue(etat(2, '2026-10-01', 2, 0), '2026-09-30')).toBe(false);
  // Boîte 0 : jamais due, même avec une échéance passée.
  expect(estDue(etat(0, '2026-10-01', 0, 0), aujourdhui)).toBe(false);
  // Sans échéance : jamais due.
  expect(estDue(etat(3, null, 3, 0), aujourdhui)).toBe(false);

  // Une erreur est à revoir le jour même ; une bonne réponse, pas avant l'échéance.
  const faux = etatDe(etatsDesUnites([rep(1, U1, false, le('2026-10-17'))], LEITNER), U1);
  expect(estDue(faux, aujourdhui)).toBe(true);
  expect(estDue(faux, '2026-10-16')).toBe(false);
  const juste = etatDe(etatsDesUnites([rep(2, U2, true, le('2026-10-17'))], LEITNER), U2);
  expect(estDue(juste, aujourdhui)).toBe(false);
  expect(estDue(juste, '2026-10-18')).toBe(true);
});

it('examens_passes_dans_l_ordre_avec_le_jour_local', () => {
  const premier = { ...RESULTAT_EXAMEN, note: 3.5, points: 14 };
  const second = { ...RESULTAT_EXAMEN, note: 5, points: 21, minutes: 9 };
  const evenements = [
    // 23:00 UTC le 16 : le 16 chez l'appareil, mais après l'autre examen.
    exam(3, '2026-10-16T23:00:00.000+00:00', second),
    rep(1, U1, true, le('2026-10-16')),
    // 22:30 UTC le 16 : le 17 chez l'appareil, mais avant l'autre examen.
    exam(2, '2026-10-17T00:30:00.000+02:00', premier),
  ];
  expect(examensPasses(evenements)).toEqual([
    { jour: '2026-10-17', resultat: premier },
    { jour: '2026-10-16', resultat: second },
  ]);
  expect(examensPasses([rep(1, U1, true, le('2026-10-16'))])).toEqual([]);
  expect(examensPasses([])).toEqual([]);

  // Sans dépendre de l'ordre d'arrivée.
  const trois = [
    exam(10, '2026-10-10T09:00:00.000+02:00', premier),
    exam(11, '2026-10-12T09:00:00.000-04:00', second),
    rep(12, U1, true, le('2026-10-11')),
  ];
  const attendu = [
    { jour: '2026-10-10', resultat: premier },
    { jour: '2026-10-12', resultat: second },
  ];
  for (const ordre of permutations(trois)) expect(examensPasses(ordre)).toEqual(attendu);
});

// F1 : les fonctions dérivées dédoublonnent elles-mêmes par `id`, le premier fait foi, comme chez le
// serveur : un événement reçu deux fois (une page relue, une file renvoyée) ne compte qu'une fois.
it('evenement_present_deux_fois_ne_change_rien', () => {
  const juste = rep(1, U1, true, le('2026-10-16'));
  const faux = rep(2, U1, false, le('2026-10-17'));
  const examen = exam(3, le('2026-10-17'));
  const journal = [juste, faux, examen];
  const doubles = [juste, faux, examen, juste, examen, faux];

  expect(etatsDesUnites(doubles, LEITNER)).toEqual(etatsDesUnites(journal, LEITNER));
  expect(reponsesParJour(doubles)).toEqual(reponsesParJour(journal));
  expect(examensPasses(doubles)).toEqual(examensPasses(journal));

  // À `id` égal, le premier fait foi, même si le second dit autre chose.
  const autreReponse = { ...juste, resultat: { juste: false } } as Evenement;
  expect(etatsDesUnites([juste, autreReponse], LEITNER)).toEqual(etatsDesUnites([juste], LEITNER));
  expect(etatsDesUnites([autreReponse, juste], LEITNER)).toEqual(
    etatsDesUnites([autreReponse], LEITNER),
  );
  const autreJour = { ...juste, repondu_a: le('2026-10-18') };
  expect(reponsesParJour([juste, autreJour])).toEqual(new Map([['2026-10-16', 1]]));
  const autreExamen = { ...examen, resultat: { ...RESULTAT_EXAMEN, note: 6 } } as Evenement;
  expect(examensPasses([examen, autreExamen])).toEqual(examensPasses([examen]));
});
