import { expect, test } from 'vitest';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { type Cellule, CLES_DE_DELAI, CLES_DE_MODE, dansLaFenetre } from './cellules.js';
import { coursDExemple, journalDeCours } from './cours-exemple.fixture.js';
import { journalSimule, reponseInventee } from './ecrire-journal.fixture.js';
import { type Mesures, mesures, reponsesDansLaFenetre } from './mesures.js';
import {
  journauxAuxReprises,
  journauxSurDeuxSemaines,
  reponseDecalee,
} from './reprises.fixture.js';
import { CLES_APRES_UNE_FAUTE, CLES_DE_VERDICT, reprisesVides } from './reprises.js';

const cours = coursDExemple();
const ID_DU_COURS = cours.cours.id;
const A = 'xyv4pn7g';
const B = 'xyv4pn7g:inverse';
const MS_PAR_JOUR = 86_400_000;
const JOUR_DU_RAPPORT = '2026-03-02';
const JOUR_DES_REPRISES = '2026-01-10';
const DEPUIS_DES_REPRISES = '2026-01-05';

const reference = (): Evenement[] =>
  journalDeCours(cours, { debut: '2026-02-01', jours: 28, parJour: 30, graine: 1, personne: 1 });

let rangCourant = 0;
/** Une réponse du jour `jour` de janvier 2026, à `heure` h et `seconde` s, au décalage nul. */
function r(jour: number, heure: number, seconde: number, unite: string, juste: boolean): Evenement {
  rangCourant += 1;
  return reponseInventee(
    Date.UTC(2026, 0, jour, heure, 0, seconde),
    rangCourant,
    unite,
    juste,
    ID_DU_COURS,
  );
}

/** Deux éléments écrits à la main, dont la borne du 05/01/2026 coupe un couple et un jour de faute. */
function journalDeLaBorne(): Evenement[] {
  return [
    r(4, 10, 0, A, false),
    r(4, 10, 1, A, true),
    r(5, 10, 0, A, true),
    r(5, 11, 0, B, false),
    r(5, 11, 1, B, true),
    r(5, 11, 2, B, true),
    r(6, 10, 0, B, true),
  ];
}

/** A répond faux au 05 local, juste au 04 local (plus tard dans le temps), puis juste au 06. */
function journalQuiRecule(): Evenement[] {
  rangCourant += 3;
  return [
    reponseDecalee(Date.UTC(2026, 0, 5, 12), rangCourant - 2, A, false, 0, ID_DU_COURS),
    reponseDecalee(Date.UTC(2026, 0, 6, 12), rangCourant - 1, A, true, -3000, ID_DU_COURS),
    reponseDecalee(Date.UTC(2026, 0, 7, 12), rangCourant, A, true, 0, ID_DU_COURS),
  ];
}

const cellule = (reponses: number, justes: number) => ({ reponses, justes });
const jourLePlusAncien = (journal: readonly Evenement[]): string =>
  journal.map((e) => e.repondu_a.slice(0, 10)).sort()[0] ?? '';

const sommeDes = (table: Record<'faute' | 'juste', Record<string, Cellule>>) => {
  const total = { reponses: 0, justes: 0 };
  for (const verdict of CLES_DE_VERDICT) {
    for (const c of Object.values(table[verdict])) {
      total.reponses += c.reponses;
      total.justes += c.justes;
    }
  }
  return total;
};

const somme = (nombres: Iterable<number>): number => [...nombres].reduce((s, n) => s + n, 0);

test('la_fenetre_compte_son_premier_jour_et_pas_la_veille', () => {
  expect(dansLaFenetre('2026-02-15', '2026-02-15')).toBe(true);
  expect(dansLaFenetre('2026-02-14', '2026-02-15')).toBe(false);
  expect(dansLaFenetre('2026-02-16', '2026-02-15')).toBe(true);
  expect(dansLaFenetre('1999-01-01', undefined)).toBe(true);

  const journal = reference();
  const dans = (depuis: string): Mesures => mesures(journal, cours, JOUR_DU_RAPPORT, depuis);
  const le15 = dans('2026-02-15');
  expect(reponsesDansLaFenetre(le15)).toBe(420);
  expect(somme(CLES_DE_MODE.map((cle) => le15.modes[cle].reponses))).toBe(420);
  expect(reponsesDansLaFenetre(dans('2026-02-16'))).toBe(390);
  const vide = dans('2026-03-01');
  expect(reponsesDansLaFenetre(vide)).toBe(0);
  for (const cle of CLES_DE_DELAI) expect(vide.delais[cle]).toEqual(cellule(0, 0));
  for (const cle of CLES_DE_MODE) expect(vide.modes[cle]).toEqual(cellule(0, 0));
  expect(vide.reprises).toEqual(reprisesVides());
  const sans = mesures(journal, cours, JOUR_DU_RAPPORT);
  expect(reponsesDansLaFenetre(sans)).toBe(sans.reponses);
});

test('une_fenetre_qui_couvre_tout_le_journal_donne_les_memes_mesures', () => {
  const simule = journalSimule({ unites: 80, passages: 8, graine: 7, cours: ID_DU_COURS });
  const journaux: [Evenement[], string][] = [
    [reference(), JOUR_DU_RAPPORT],
    ...journauxAuxReprises(3, ID_DU_COURS).map((j): [Evenement[], string] => [
      j,
      JOUR_DES_REPRISES,
    ]),
    [simule, '2026-12-31'],
    [journalQuiRecule(), JOUR_DES_REPRISES],
  ];
  for (const [journal, aujourdhui] of journaux) {
    const sans = mesures(journal, cours, aujourdhui);
    expect(mesures(journal, cours, aujourdhui, jourLePlusAncien(journal))).toEqual(sans);
    expect(mesures(journal, cours, aujourdhui, '2000-01-01')).toEqual(sans);
  }
});

test('les_etats_la_charge_et_les_minutes_ne_dependent_pas_de_la_fenetre', () => {
  const cas: [Evenement[], string, string][] = [
    [reference(), JOUR_DU_RAPPORT, '2026-02-15'],
    ...journauxSurDeuxSemaines(3, ID_DU_COURS).map((j): [Evenement[], string, string] => [
      j,
      JOUR_DES_REPRISES,
      DEPUIS_DES_REPRISES,
    ]),
  ];
  for (const [journal, aujourdhui, depuis] of cas) {
    const sans = mesures(journal, cours, aujourdhui);
    const avec = mesures(journal, cours, aujourdhui, depuis);
    expect(reponsesDansLaFenetre(avec)).toBeLessThan(sans.reponses);
    for (const cle of [
      'premierJour',
      'dernierJour',
      'reponses',
      'parJour',
      'boites',
      'elements',
      'dues',
      'fautesParModule',
      'ecarts',
      'ecartMedian',
    ] as const) {
      expect(avec[cle], cle).toEqual(sans[cle]);
    }
  }
});

test('le_moment_d_une_reponse_de_la_fenetre_se_lit_sur_tout_le_journal', () => {
  const [entier] = journauxSurDeuxSemaines(3, ID_DU_COURS);
  const [copie] = journauxAuxReprises(3, ID_DU_COURS);
  if (entier === undefined || copie === undefined) throw new Error('journaux absents');
  const m = mesures(entier, cours, JOUR_DES_REPRISES, DEPUIS_DES_REPRISES);
  expect(m.delais.premiere.reponses).toBe(0);
  expect(mesures(copie, cours, JOUR_DES_REPRISES).delais.premiere.reponses).toBeGreaterThan(0);
  expect(reponsesDansLaFenetre(m)).toBe(copie.length);
});

test('les_reprises_d_une_fenetre_sont_celles_de_ses_seuls_jours', () => {
  const entiers = journauxSurDeuxSemaines(3, ID_DU_COURS);
  const copies = journauxAuxReprises(3, ID_DU_COURS);
  for (const [i, entier] of entiers.entries()) {
    const copie = copies[i] ?? [];
    const fenetre = mesures(entier, cours, JOUR_DES_REPRISES, DEPUIS_DES_REPRISES).reprises;
    const seule = mesures(copie, cours, JOUR_DES_REPRISES).reprises;
    const toutes = mesures(entier, cours, JOUR_DES_REPRISES).reprises;
    for (const cle of [
      'rangs',
      'espacements',
      'modes',
      'repartition',
      'apresUnJourDeFaute',
    ] as const) {
      expect(fenetre[cle], cle).toEqual(seule[cle]);
      expect(fenetre[cle], cle).not.toEqual(toutes[cle]);
    }
  }
});

test('un_couple_et_son_jour_de_faute_ne_se_coupent_pas_a_la_borne', () => {
  const journal = journalDeLaBorne();
  const { reprises } = mesures(journal, cours, JOUR_DES_REPRISES, DEPUIS_DES_REPRISES);
  expect(reprises.rangs.faute['rang-1']).toEqual(cellule(1, 1));
  expect(reprises.rangs.juste['rang-2']).toEqual(cellule(1, 1));
  expect(sommeDes(reprises.rangs)).toEqual(cellule(2, 2));
  expect(reprises.repartition.faute['reprises-2']).toBe(1);
  expect(reprises.repartition.juste['reprises-0']).toBe(2);
  expect(reprises.repartition.faute['reprises-1']).toBe(0);
  expect(somme(Object.values(reprises.repartition.faute))).toBe(1);
  expect(somme(Object.values(reprises.repartition.juste))).toBe(2);
  expect(reprises.apresUnJourDeFaute['apres-faute-2']).toEqual(cellule(1, 1));
  expect(reprises.apresUnJourDeFaute['apres-faute-1']).toEqual(cellule(0, 0));

  const entiere = mesures(journal, cours, JOUR_DES_REPRISES).reprises;
  expect(entiere.rangs.faute['rang-1']).toEqual(cellule(2, 2));
  expect(entiere.repartition.faute['reprises-1']).toBe(1);
  expect(entiere.apresUnJourDeFaute['apres-faute-1']).toEqual(cellule(1, 1));
});

test('un_jour_de_faute_suivi_d_un_jour_qui_recule_sous_la_borne_ne_compte_pas', () => {
  const journal = journalQuiRecule();
  const m = mesures(journal, cours, JOUR_DES_REPRISES, DEPUIS_DES_REPRISES);
  for (const cle of CLES_APRES_UNE_FAUTE) {
    expect(m.reprises.apresUnJourDeFaute[cle]).toEqual(cellule(0, 0));
    expect(somme(Object.values(m.reprises.apresParMoment[cle]))).toBe(0);
    expect(somme(Object.values(m.reprises.apresParMode[cle]))).toBe(0);
  }
  expect(reponsesDansLaFenetre(m)).toBe(2);
  expect(somme(CLES_DE_MODE.map((cle) => m.modes[cle].reponses))).toBe(2);
  const sans = mesures(journal, cours, JOUR_DES_REPRISES);
  expect(sans.reprises.apresUnJourDeFaute['apres-faute-0']).toEqual(cellule(1, 1));
});

test('dans_la_fenetre_les_reprises_font_la_case_meme_jour_et_l_apres_faute_reste_dans_ses_lignes', () => {
  const simule = journalSimule({ unites: 80, passages: 8, graine: 7, cours: ID_DU_COURS });
  const duMilieu = simule[Math.floor(simule.length / 2)]?.repondu_a.slice(0, 10) ?? '';
  const [deuxSemaines] = journauxSurDeuxSemaines(3, ID_DU_COURS);
  const cas: [Evenement[], string, string][] = [
    [reference(), JOUR_DU_RAPPORT, '2026-02-15'],
    [deuxSemaines ?? [], JOUR_DES_REPRISES, DEPUIS_DES_REPRISES],
    [deuxSemaines ?? [], JOUR_DES_REPRISES, '2026-01-06'],
    [simule, '2026-12-31', duMilieu],
    [journalDeLaBorne(), JOUR_DES_REPRISES, DEPUIS_DES_REPRISES],
    [journalQuiRecule(), JOUR_DES_REPRISES, DEPUIS_DES_REPRISES],
  ];
  let reprisesVues = 0;
  let joursDeFauteVus = 0;
  for (const [journal, aujourdhui, depuis] of cas) {
    const m = mesures(journal, cours, aujourdhui, depuis);
    const memeJour = m.delais['meme-jour'];
    for (const table of [m.reprises.rangs, m.reprises.espacements, m.reprises.modes]) {
      expect(sommeDes(table)).toEqual(memeJour);
    }
    expect(somme(Object.values(m.reprises.repartition).flatMap((c) => Object.values(c)))).toBe(
      reponsesDansLaFenetre(m) - memeJour.reponses,
    );
    for (const cle of CLES_APRES_UNE_FAUTE) {
      const mesure = m.reprises.apresUnJourDeFaute[cle].reponses;
      expect(somme(Object.values(m.reprises.apresParMoment[cle]))).toBe(mesure);
      expect(somme(Object.values(m.reprises.apresParMode[cle]))).toBe(mesure);
      joursDeFauteVus += mesure;
    }
    for (const moment of CLES_DE_DELAI) {
      const apres = somme(CLES_APRES_UNE_FAUTE.map((c) => m.reprises.apresParMoment[c][moment]));
      expect(apres, moment).toBeLessThanOrEqual(m.delais[moment].reponses);
    }
    for (const mode of CLES_DE_MODE) {
      const apres = somme(CLES_APRES_UNE_FAUTE.map((c) => m.reprises.apresParMode[c][mode]));
      expect(apres, mode).toBeLessThanOrEqual(m.modes[mode].reponses);
    }
    reprisesVues += memeJour.reponses;
  }
  expect(reprisesVues).toBeGreaterThan(0);
  expect(joursDeFauteVus).toBeGreaterThan(0);
});

test('les_journaux_aux_reprises_decales_sont_les_memes_a_sept_jours_pres', () => {
  const normaux = journauxAuxReprises(3, ID_DU_COURS);
  const decales = journauxAuxReprises(3, ID_DU_COURS, -7);
  expect(journauxAuxReprises(3, ID_DU_COURS, 0)).toEqual(normaux);
  for (const [i, normal] of normaux.entries()) {
    const decale = decales[i] ?? [];
    expect(decale.length).toBe(normal.length);
    const ids = new Set(normal.map((e) => e.id));
    for (const [rang, e] of normal.entries()) {
      const d = decale[rang];
      expect(d?.unite).toBe(e.unite);
      expect(d?.resultat).toEqual(e.resultat);
      expect(Date.parse(e.repondu_a) - Date.parse(d?.repondu_a ?? '')).toBe(7 * MS_PAR_JOUR);
      expect(ids.has(d?.id ?? '')).toBe(false);
    }
  }
});
