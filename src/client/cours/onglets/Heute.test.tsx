// @vitest-environment happy-dom
import { createHash } from 'node:crypto';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAPITRE_1, CHAPITRE_2, coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import { type CoursServi, memoireDuCours } from '../../../domaine/cours/servi.js';
import type { Evenement } from '../../../domaine/journal/evenement.js';
import { type SensChoisi, unitesDuChoix } from '../../../domaine/seances/cartes.js';
import {
  duesDuJour,
  type Posable,
  posablesDuCours,
  type SeanceDuJour,
  TAILLE_DE_SEANCE,
} from '../../../domaine/seances/heute.js';
import { departDuPlanning, planningDuCours } from '../../../domaine/seances/planning.js';
import { neuvesDuJour } from '../../../domaine/seances/rythme.js';
import {
  AUJOURDHUI_DE_TEST,
  contexteDeTest,
  rendreDansLeCours,
  rendreDansUnCoursVivant,
  reponseDeTest,
} from '../contexte-cours.fixture.js';
import {
  type ContexteCours,
  ContexteDuCours,
  etatDOngletSur,
  type PredicatsDeSeance,
  seanceDansLaMemoire,
} from '../contexte-cours.js';
import { heuteEnCours } from '../seances-en-cours.js';
import { formater, TEXTES_COURS } from '../textes-cours.js';
import { cleDuJour, type EtatDeHeute, Heute, questionDe } from './Heute.js';
import { boutons, progression, texteDe } from './onglets.fixture.js';
import type { EtatDuPretest } from './PretestDeHeute.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

// Les unités du cours de test dont les tests parlent (données factices, écrites à la main).
const HERZ = 'c1000001';
const LEBER = 'c1000002';
const GASTRITIS = 'w0000001';
const MITTE = 'q0000002';
const ARTIKEL = 'e1000001';
const QCM = 'fb000007';

const IL_Y_A_UNE_SEMAINE = '2026-10-10';
const JOURS_DE_LA_SEMAINE = 7;

/** Les unités manquées il y a une semaine : à revoir aujourd'hui. */
function manquees(...unites: string[]) {
  return unites.map((unite, n) => reponseDeTest(n, unite, false, IL_Y_A_UNE_SEMAINE));
}

function coursSans(...types: CoursServi['modules'][number]['type'][]): CoursServi {
  const servi = coursServiDeTest();
  return { ...servi, modules: servi.modules.filter((module) => !types.includes(module.type)) };
}

function coursAvecNouvelles(nouvelles: number): CoursServi {
  const servi = coursServiDeTest();
  return { ...servi, leitner: { ...servi.leitner, nouvellesParSeance: nouvelles } };
}

/** Un contexte à la mémoire donnée, au hasard constant : « zerlegen », et le premier tirage. */
function contexteDe(
  options: {
    cours?: CoursServi;
    evenements?: Evenement[];
    memoire?: Map<string, unknown>;
    aujourdhui?: string;
  } = {},
): ContexteCours {
  const contexte = contexteDeTest(options);
  contexte.hasard = () => 0;
  return contexte;
}

/** Le contexte, avec ce chapitre choisi dans Karteikarten. */
function avecChapitre(contexte: ContexteCours, chapitre: string): ContexteCours {
  contexte.preferences = {
    ...contexte.preferences,
    cartes: { ...contexte.preferences.cartes, chapitre, saisie: false },
  };
  return contexte;
}

function posable(contexte: ContexteCours, id: string): Posable {
  const trouve = posablesDuCours(contexte.cours).find((p) => p.id === id);
  if (trouve === undefined) throw new Error(`Aucun posable ${id}`);
  return trouve;
}

function sensDe(contexte: ContexteCours, id: string): string | undefined {
  return contexte.cours.unites.find((unite) => unite.id === id)?.sens;
}

/** La clé qu'aurait la séance du contexte : les dues, les neuves du jour, le quota. */
function cleDe(contexte: ContexteCours): string {
  const posables = posablesDuCours(contexte.cours);
  const dues = duesDuJour(posables, contexte.etats, contexte.aujourdhui);
  const { chapitre, sens } = contexte.preferences.cartes;
  const planning = planningDuCours(contexte.cours.cours);
  const neuves = neuvesDuJour(
    contexte.cours,
    posables,
    { etats: contexte.etats, evenements: contexte.evenements, aujourdhui: contexte.aujourdhui },
    { chapitre, sens },
    planning === undefined
      ? undefined
      : {
          planning,
          depart: departDuPlanning(contexte.evenements, contexte.aujourdhui),
          examen: memoireDuCours(contexte.cours.cours)?.examen,
        },
  );
  return cleDuJour(contexte.aujourdhui, dues, neuves.candidates, neuves.quota);
}

/** La mémoire de l'onglet, amorcée avec une file écrite à la main : le premier élément est posé. */
function amorcer(contexte: ContexteCours, memoire: Map<string, unknown>, ids: string[]): void {
  const file = ids.map((id) => posable(contexte, id));
  const seance: SeanceDuJour = { file, revenus: [], faites: 0, justes: 0 };
  const etat: EtatDeHeute = {
    cle: cleDe(contexte),
    seance,
    question: questionDe(file[0], contexte.cours, contexte.hasard),
    repondue: null,
  };
  memoire.set('heute', etat);
}

/** Une séance d'une seule carte, Herz, posée sur l'écran. */
function poserLaCarteSeule(): { contexte: ContexteCours; memoire: Map<string, unknown> } {
  const memoire = new Map<string, unknown>();
  const contexte = contexteDe({ memoire });
  amorcer(contexte, memoire, [HERZ]);
  rendreDansLeCours(<Heute />, contexte);
  return { contexte, memoire };
}

function etatGarde(memoire: Map<string, unknown>): EtatDeHeute {
  return memoire.get('heute') as EtatDeHeute;
}

function fileDe(memoire: Map<string, unknown>): string[] {
  return etatGarde(memoire).seance.file.map(({ id }) => id);
}

function cliquer(libelle: string): void {
  fireEvent.click(screen.getByRole('button', { name: libelle }));
}

function choisir(option: string): void {
  const choisie = boutons().find((x) => texteDe(x) === option);
  if (choisie === undefined) throw new Error(`Pas d'option « ${option} »`);
  fireEvent.click(choisie);
}

function sensDuMorpheme(contexte: ContexteCours, id: string): string {
  return contexte.cours.morphologie?.morphemes.find((m) => m.id === id)?.sens ?? '';
}

/** Le cours de test, avec ces champs de manifeste en plus (planning, mémoire). */
function coursAvec(champs: { planning?: unknown; memoire?: unknown }): CoursServi {
  return { ...coursServiDeTest(), ...champs };
}

const SEMAINES = {
  etapes: [
    { titre: 'Woche 1', semaine: 1, modules: [CHAPITRE_1] },
    { titre: 'Woche 2', semaine: 2, modules: [CHAPITRE_2] },
  ],
};

/** Une étape 2 datée du 18/10, le lendemain du jour de test. */
const SEANCES = {
  etapes: [
    { titre: 'Tag 1', seance: '2026-10-17', modules: [CHAPITRE_1] },
    { titre: 'Tag 2', seance: '2026-10-18', modules: [CHAPITRE_2] },
  ],
};

/** Un événement plus ancien, sur une unité hors du cours : seul le départ du planning change. */
const PLUS_ANCIEN = reponseDeTest(0, 'zz000000', true, IL_Y_A_UNE_SEMAINE);

function duChapitre(contexte: ContexteCours, chapitre: string): Set<string> {
  return new Set(unitesDuChoix(contexte.cours, chapitre, 'mix').map(({ id }) => id));
}

function memoireAvecExamen(examen: string) {
  return { algorithme: 'fsrs', retention: 0.9, examen };
}

const COMPTE_A_REBOURS = /Prüfung/;

/** Les trois écrans de l'onglet, chacun posé sur le cours donné, et le journal s'il y en a un. */
const ECRANS: Record<string, (cours: CoursServi, evenements?: Evenement[]) => void> = {
  seance: (cours, evenements) => rendreDansLeCours(<Heute />, contexteDe({ cours, evenements })),
  fin: (cours, evenements) => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ cours, memoire, evenements });
    amorcer(contexte, memoire, [HERZ]);
    rendreDansLeCours(<Heute />, contexte);
    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);
    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
  },
  rien: (cours, evenements) => {
    const leitner = { ...cours.leitner, nouvellesParSeance: 0 };
    rendreDansLeCours(<Heute />, contexteDe({ cours: { ...cours, leitner }, evenements }));
    expect(screen.getByRole('heading', { name: t.heute_rien })).toBeTruthy();
  },
};

/** Une empreinte courte d'un texte long : de quoi figer une clé et une file dans un test. */
function empreinte(texte: string): string {
  return createHash('sha1').update(texte).digest('hex').slice(0, 12);
}

const SANS_PLANNING: [string, () => Evenement[], string, { cle: string; file: string }][] = [
  ['compte_neuf', () => [], 'tous', { cle: 'd9b0d46df168', file: 'b90f25849d08' }],
  [
    'quelques_cartes_vues',
    () => [
      reponseDeTest(1, HERZ, true, '2026-10-16'),
      reponseDeTest(2, LEBER, true, '2026-10-17'),
      reponseDeTest(3, GASTRITIS, true, '2026-10-17'),
    ],
    'tous',
    { cle: '1abf42b4100b', file: '68a3b7fa330c' },
  ],
  [
    'des_dues_et_un_chapitre',
    () => manquees(HERZ, LEBER, GASTRITIS, MITTE),
    CHAPITRE_2,
    { cle: 'f02a78068df1', file: '2a5b389949a9' },
  ],
];

describe('Heute', () => {
  it('une_file_melee_pose_chaque_element_a_la_maniere_de_son_onglet', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire });
    amorcer(contexte, memoire, [HERZ, GASTRITIS, MITTE, ARTIKEL, QCM]);
    rendreDansLeCours(<Heute />, contexte);
    expect(progression()).toContain('0 beantwortet · 5 offen');

    // Une carte : elle se retourne, puis se juge.
    expect(document.querySelector('.card .front')?.textContent).toBe('Herz');
    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(HERZ, true, 'retournee');

    // Un mot : chaque partie se nomme, et le mot s'enregistre à la dernière.
    const mot = contexte.cours.morphologie?.mots.find(({ id }) => id === GASTRITIS);
    expect(mot).toBeDefined();
    for (const segment of mot?.segments ?? []) {
      expect(contexte.enregistrer).not.toHaveBeenCalledWith(
        GASTRITIS,
        expect.anything(),
        expect.anything(),
      );
      choisir(sensDuMorpheme(contexte, segment.morpheme));
    }
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(GASTRITIS, true, 'choix');
    cliquer(t.suivante);

    // Un point de schéma : on le nomme parmi les propositions.
    choisir('Mitte');
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(MITTE, true, 'choix');
    cliquer(t.suivante);

    // Un exercice à options.
    choisir('der');
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(ARTIKEL, true, 'choix');
    cliquer(t.suivante);

    // Une question fermée de fiche.
    choisir('über dem Mass');
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(QCM, true, 'choix');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(5);
    cliquer(t.suivante);

    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
    expect(screen.getByText(formater(t.heute_resultat, { justes: 5, faites: 5 }))).toBeTruthy();
  });

  it('un_exercice_a_saisie_se_pose_comme_dans_son_onglet', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire });
    amorcer(contexte, memoire, ['e2000001']);
    rendreDansLeCours(<Heute />, contexte);

    fireEvent.input(screen.getByLabelText(t.exercices_antwort), { target: { value: 'Musteri' } });
    fireEvent.submit(document.querySelector('form.typed') as HTMLFormElement);

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith('e2000001', true, 'saisie');
  });

  it('une_carte_inverse_tapee_est_enregistree_avec_le_mode_saisie', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire });
    contexte.preferences = {
      ...contexte.preferences,
      cartes: { ...contexte.preferences.cartes, saisie: true },
    };
    amorcer(contexte, memoire, [`${HERZ}:inverse`]);
    rendreDansLeCours(<Heute />, contexte);

    fireEvent.input(screen.getByLabelText(t.cartes_saisie_etiquette), {
      target: { value: 'Herz' },
    });
    cliquer(t.cartes_verifier);
    cliquer(t.cartes_suivante);

    expect(contexte.enregistrer).toHaveBeenCalledExactlyOnceWith(`${HERZ}:inverse`, true, 'saisie');
  });

  it('la_premiere_reponse_jugee_fait_deja_une_seance_en_cours', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire });
    amorcer(contexte, memoire, [QCM, HERZ]);
    rendreDansLeCours(<Heute />, contexte);
    expect(heuteEnCours(etatGarde(memoire))).toBe(false);

    choisir('über dem Mass');

    // La file n'a pas encore avancé : seul le verdict en attente la tient.
    expect(etatGarde(memoire).seance.faites).toBe(0);
    expect(etatGarde(memoire).repondue).toBe(true);
    expect(heuteEnCours(etatGarde(memoire))).toBe(true);

    cliquer(t.suivante);

    expect(etatGarde(memoire).seance.faites).toBe(1);
    expect(etatGarde(memoire).repondue).toBeNull();
    expect(heuteEnCours(etatGarde(memoire))).toBe(true);
  });

  it('une_reponse_est_un_seul_geste_d_ecriture', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire });
    amorcer(contexte, memoire, [ARTIKEL, HERZ]);
    rendreDansLeCours(<Heute />, contexte);

    // Un mauvais choix : la réponse et son verdict s'écrivent ensemble.
    choisir('die');

    const apres = etatGarde(memoire);
    expect(apres.repondue).toBe(false);
    expect(apres.question).toEqual({
      genre: 'exercice',
      reponse: { juste: false, donnee: 'die' },
    });
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(ARTIKEL, false, 'choix');

    // La suite d'une faute : l'exercice va en fin de file, une fois.
    cliquer(t.suivante);

    expect(fileDe(memoire)).toEqual([HERZ, ARTIKEL]);
    expect(etatGarde(memoire).seance.revenus).toEqual([ARTIKEL]);
    expect(etatGarde(memoire).repondue).toBeNull();
  });

  it('une_carte_repondue_ailleurs_avant_le_premier_geste_sort_de_la_file', () => {
    const memoire = new Map<string, unknown>();
    const avant = contexteDe({ memoire, evenements: manquees(HERZ, LEBER) });
    rendreDansLeCours(<Heute />, avant);
    expect(fileDe(memoire).slice(0, 2).sort()).toEqual([HERZ, LEBER]);
    expect(progression()).toContain(`${formater(t.heute_compte, { dues: 2, neues: 13 })}`);
    cleanup();

    // Herz est répondue dans un autre onglet : elle n'est plus due.
    const evenements = [
      ...manquees(HERZ, LEBER),
      reponseDeTest(10, HERZ, true, AUJOURDHUI_DE_TEST),
    ];
    const apres = contexteDe({ memoire, evenements });
    rendreDansLeCours(<Heute />, apres);

    expect(fileDe(memoire)).not.toContain(HERZ);
    expect(fileDe(memoire)[0]).toBe(LEBER);
    expect(progression()).toContain(formater(t.heute_compte, { dues: 1, neues: 13 }));
  });

  it('apres_une_premiere_reponse_la_file_ne_suit_plus_le_journal', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire, evenements: manquees(HERZ, LEBER) });
    // La file est écrite à la main : Herz d'abord.
    amorcer(contexte, memoire, [HERZ, LEBER]);
    rendreDansLeCours(<Heute />, contexte);
    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);
    const garde = etatGarde(memoire);
    expect(fileDe(memoire)).toEqual([LEBER]);
    cleanup();

    // Leber est répondue ailleurs : la séance déjà commencée la garde.
    const evenements = [
      ...manquees(HERZ, LEBER),
      reponseDeTest(10, LEBER, true, AUJOURDHUI_DE_TEST),
    ];
    rendreDansLeCours(<Heute />, contexteDe({ memoire, evenements }));

    expect(etatGarde(memoire)).toBe(garde);
    expect(fileDe(memoire)).toEqual([LEBER]);
  });

  it('une_faute_remet_l_element_en_fin_une_fois_puis_la_seance_finit', async () => {
    const { contexte } = poserLaCarteSeule();

    cliquer(t.cartes_retourner);
    cliquer(t.cartes_pas_su);

    // Elle revient une fois : la file compte toujours un élément, la carte est à neuf.
    expect(progression()).toContain('1 beantwortet · 1 offen');
    expect(contexte.finDeSeance).not.toHaveBeenCalled();
    cliquer(t.cartes_retourner);
    cliquer(t.cartes_pas_su);

    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);
    expect(contexte.enregistrer).toHaveBeenNthCalledWith(1, HERZ, false, 'retournee');
    expect(contexte.enregistrer).toHaveBeenNthCalledWith(2, HERZ, false, 'retournee');
    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
    expect(screen.getByText(formater(t.heute_resultat, { justes: 0, faites: 1 }))).toBeTruthy();
    // La synchronisation attend que la dernière réponse soit rangée.
    await waitFor(() => expect(contexte.finDeSeance).toHaveBeenCalledTimes(1));
  });

  it('la_fin_dit_le_resultat_et_propose_la_suivante_quand_il_reste_des_dues', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire, evenements: manquees(HERZ, LEBER) });
    amorcer(contexte, memoire, [HERZ]);
    rendreDansUnCoursVivant(<Heute />, contexte);

    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);

    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
    expect(
      screen.getByText(new RegExp(formater(t.heute_resultat, { justes: 1, faites: 1 }))),
    ).toBeTruthy();
    expect(screen.getByText(new RegExp(formater(t.heute_reste, { n: 1 })))).toBeTruthy();

    cliquer(t.heute_encore);

    // Une séance neuve d'après l'état du moment : Leber, encore due, d'abord.
    expect(screen.queryByRole('heading', { name: t.heute_fin })).toBeNull();
    expect(fileDe(memoire)[0]).toBe(LEBER);
    expect(etatGarde(memoire).seance.faites).toBe(0);
    expect(progression()).toContain('0 beantwortet');
  });

  it('la_fin_sans_rien_de_du_dit_la_journee_faite_et_mene_a_l_apercu', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire });
    amorcer(contexte, memoire, [HERZ]);
    rendreDansUnCoursVivant(<Heute />, contexte);

    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);

    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
    expect(screen.getByText(t.heute_fertig)).toBeTruthy();
    expect(screen.getByText(t.heute_rien_suite)).toBeTruthy();
    expect(screen.queryByText(/Noch \d+ fällig/)).toBeNull();
    expect(screen.queryByRole('button', { name: t.heute_encore })).toBeNull();

    cliquer(t.heute_vers_apercu);

    expect(contexte.aller).toHaveBeenCalledWith('apercu');
  });

  it('le_resultat_compte_les_elements_un_manque_puis_reussi_donne_un_sur_un', () => {
    const { contexte } = poserLaCarteSeule();

    cliquer(t.cartes_retourner);
    cliquer(t.cartes_pas_su);
    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);

    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);
    expect(screen.getByText(formater(t.heute_resultat, { justes: 1, faites: 1 }))).toBeTruthy();
    expect(screen.getByText('1 von 1 richtig.')).toBeTruthy();
  });

  it('l_ecran_de_fin_n_attend_pas_le_rangement_pour_les_dues', async () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire, evenements: manquees(HERZ, LEBER) });
    // Le rangement de la réponse est en cours : le journal montre encore Herz comme due.
    let ranger: (rangee: boolean) => void = () => undefined;
    contexte.enregistrer = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          ranger = resolve;
        }),
    );
    amorcer(contexte, memoire, [HERZ]);
    rendreDansLeCours(<Heute />, contexte);

    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);

    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
    expect(screen.getByText(new RegExp(formater(t.heute_reste, { n: 1 })))).toBeTruthy();
    expect(screen.queryByText(new RegExp(formater(t.heute_reste, { n: 2 })))).toBeNull();
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.finDeSeance).not.toHaveBeenCalled();
    ranger(true);
    await waitFor(() => expect(contexte.finDeSeance).toHaveBeenCalledTimes(1));
  });

  it('le_lendemain_une_application_restee_ouverte_compose_une_seance_neuve', () => {
    const memoire = new Map<string, unknown>();
    const hier = contexteDe({ memoire });
    amorcer(hier, memoire, [HERZ]);
    rendreDansLeCours(<Heute />, hier);
    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);
    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
    cleanup();

    rendreDansLeCours(<Heute />, contexteDe({ memoire, aujourdhui: '2026-10-18' }));

    expect(screen.queryByRole('heading', { name: t.heute_fin })).toBeNull();
    expect(etatGarde(memoire).cle.startsWith('2026-10-18|')).toBe(true);
    expect(etatGarde(memoire).seance.file.length).toBeGreaterThan(0);
    expect(etatGarde(memoire).seance.faites).toBe(0);
  });

  it('une_carte_neuve_repondue_ailleurs_avant_le_premier_geste_sort_de_la_file', () => {
    const memoire = new Map<string, unknown>();
    rendreDansLeCours(<Heute />, contexteDe({ memoire }));
    const neuve = fileDe(memoire)[0];
    cleanup();

    // La carte neuve est répondue juste dans un autre onglet : elle n'est ni neuve ni due.
    const evenements = [reponseDeTest(10, neuve, true, AUJOURDHUI_DE_TEST)];
    rendreDansLeCours(<Heute />, contexteDe({ memoire, evenements }));

    expect(fileDe(memoire)).not.toContain(neuve);
  });

  it('le_stock_du_premier_jour_la_file_garde_vingt_et_l_en_tete_dit_toutes_les_dues', () => {
    const contexte = contexteDe();
    const ids = posablesDuCours(contexte.cours).map(({ id }) => id);
    expect(ids.length).toBeGreaterThan(TAILLE_DE_SEANCE);
    const evenements = manquees(...ids);
    rendreDansLeCours(<Heute />, contexteDe({ evenements }));

    expect(progression()).toBe(
      `${formater(t.heute_compte, { dues: ids.length, neues: 0 })} · ${formater(
        t.heute_progression,
        { faites: 0, restantes: TAILLE_DE_SEANCE },
      )}`,
    );
  });

  it('rien_de_du_ni_de_neuf_l_ecran_le_dit_et_mene_a_l_apercu', () => {
    const contexte = contexteDe({ cours: coursAvecNouvelles(0) });
    rendreDansLeCours(<Heute />, contexte);

    expect(screen.getByRole('heading', { name: t.heute_rien })).toBeTruthy();
    expect(screen.getByText(t.heute_rien_suite)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: t.heute_fin })).toBeNull();

    cliquer(t.heute_vers_apercu);

    expect(contexte.aller).toHaveBeenCalledWith('apercu');
  });

  it('un_cours_sans_module_qui_se_pose_a_le_meme_ecran_sans_erreur', () => {
    const contexte = contexteDe({
      cours: coursSans('cartes', 'morphologie', 'schema', 'exercices', 'feuille'),
    });
    rendreDansLeCours(<Heute />, contexte);

    expect(screen.getByRole('heading', { name: t.heute_rien })).toBeTruthy();
    cliquer(t.heute_vers_apercu);
    expect(contexte.aller).toHaveBeenCalledWith('apercu');
  });

  it('le_compte_dit_les_dues_du_moment_et_les_cartes_neuves_de_la_seance', () => {
    const contexte = contexteDe({
      cours: coursAvecNouvelles(3),
      evenements: manquees(HERZ, LEBER),
    });
    rendreDansLeCours(<Heute />, contexte);

    expect(progression()).toBe(
      `${formater(t.heute_compte, { dues: 2, neues: 3 })} · ${formater(t.heute_progression, {
        faites: 0,
        restantes: 5,
      })}`,
    );
  });

  it('les_neuves_ne_viennent_que_du_chapitre_choisi_dans_les_cartes', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire });
    const [premier, second] = contexte.cours.chapitres.map(({ id }) => id);

    rendreDansLeCours(<Heute />, contexte);
    const duPremier = new Set(unitesDuChoix(contexte.cours, premier, 'mix').map(({ id }) => id));
    expect(fileDe(memoire).length).toBeGreaterThan(0);
    expect(fileDe(memoire).every((id) => duPremier.has(id))).toBe(true);
    cleanup();
    memoire.clear();

    rendreDansLeCours(<Heute />, avecChapitre(contexteDe({ memoire }), second));
    const duSecond = new Set(unitesDuChoix(contexte.cours, second, 'mix').map(({ id }) => id));
    expect(fileDe(memoire).length).toBeGreaterThan(0);
    expect(fileDe(memoire).every((id) => duSecond.has(id))).toBe(true);
  });

  it('le_plafond_du_jour_atteint_par_des_cartes_decouvertes_ailleurs_la_seance_n_a_aucune_neuve', () => {
    const contexte = contexteDe();
    const decouvertes = contexte.cours.unites
      .slice(0, 15)
      .map(({ id }, n) => reponseDeTest(n, id, true, AUJOURDHUI_DE_TEST));

    rendreDansLeCours(<Heute />, contexteDe({ evenements: decouvertes }));

    // Rien n'est dû (réponses justes d'aujourd'hui), et le plafond interdit toute neuve.
    expect(screen.getByRole('heading', { name: t.heute_rien })).toBeTruthy();
  });

  it('les_cartes_deja_decouvertes_aujourd_hui_retirent_leur_nombre_du_quota', () => {
    const contexte = contexteDe();
    const decouvertes = contexte.cours.unites
      .slice(0, 5)
      .map(({ id }, n) => reponseDeTest(n, id, true, AUJOURDHUI_DE_TEST));

    rendreDansLeCours(<Heute />, contexteDe({ evenements: decouvertes }));

    // 15 par jour, 5 découvertes : 10 neuves, prises dans les 10 cartes encore neuves du chapitre.
    expect(progression()).toContain(formater(t.heute_compte, { dues: 0, neues: 10 }));
  });

  it('une_carte_deja_vue_un_jour_d_avant_ne_pese_pas_sur_le_plafond_d_aujourd_hui', () => {
    const contexte = contexteDe();
    const vues = contexte.cours.unites
      .slice(0, 3)
      .map(({ id }, n) => reponseDeTest(n, id, true, IL_Y_A_UNE_SEMAINE));
    const aujourdhui = reponseDeTest(10, contexte.cours.unites[0].id, true, AUJOURDHUI_DE_TEST);

    rendreDansLeCours(<Heute />, contexteDe({ evenements: [...vues, aujourdhui] }));

    // Le quota reste de 15 : les 12 cartes neuves du chapitre (15 moins les 3 vues) y entrent.
    expect(progression()).toContain(formater(t.heute_compte, { dues: 2, neues: 12 }));
  });

  it('une_nachste_runde_apres_un_plafond_atteint_n_a_que_des_dues', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({
      cours: coursAvecNouvelles(1),
      evenements: manquees(HERZ, LEBER),
      memoire,
    });
    // Une carte neuve : sa réponse atteint le plafond de 1 par jour.
    amorcer(contexte, memoire, ['c1000003']);
    rendreDansUnCoursVivant(<Heute />, contexte);

    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);
    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
    cliquer(t.heute_encore);

    expect(fileDe(memoire).sort()).toEqual([HERZ, LEBER]);
    expect(progression()).toContain(formater(t.heute_compte, { dues: 2, neues: 0 }));
  });

  it('un_changement_de_chapitre_avant_le_premier_geste_change_les_neuves_pas_apres', () => {
    const memoire = new Map<string, unknown>();
    const [premier, second] = contexteDe().cours.chapitres.map(({ id }) => id);
    const duSecond = new Set(unitesDuChoix(contexteDe().cours, second, 'mix').map(({ id }) => id));
    rendreDansLeCours(<Heute />, contexteDe({ memoire }));
    expect(fileDe(memoire).some((id) => duSecond.has(id))).toBe(false);
    cleanup();

    // Avant tout geste : le chapitre change dans les cartes, la séance se recompose.
    rendreDansLeCours(<Heute />, avecChapitre(contexteDe({ memoire }), second));
    expect(fileDe(memoire).every((id) => duSecond.has(id))).toBe(true);
    cleanup();

    // Après le premier geste, elle ne suit plus le choix.
    const contexte = avecChapitre(contexteDe({ memoire }), second);
    amorcer(contexte, memoire, [HERZ, LEBER]);
    rendreDansLeCours(<Heute />, contexte);
    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);
    const garde = etatGarde(memoire);
    cleanup();

    rendreDansLeCours(<Heute />, avecChapitre(contexteDe({ memoire }), premier));

    expect(etatGarde(memoire)).toBe(garde);
    expect(fileDe(memoire)).toEqual([LEBER]);
  });

  it('l_etat_garde_retrouve_la_question_et_la_file_apres_un_detour', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire });
    amorcer(contexte, memoire, [HERZ, ARTIKEL, LEBER]);
    rendreDansLeCours(<Heute />, contexte);
    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);
    // L'exercice est posé ; on y répond, sans passer à la suite.
    choisir('der');
    const avant = progression();
    const garde = etatGarde(memoire);
    expect(heuteEnCours(garde)).toBe(true);
    cleanup();

    rendreDansLeCours(<Heute />, contexteDe({ memoire }));

    expect(etatGarde(memoire)).toBe(garde);
    expect(progression()).toBe(avant);
    expect(heuteEnCours(etatGarde(memoire))).toBe(true);
    // Le verdict est toujours là, et la suite mène à la carte suivante.
    cliquer(t.suivante);
    expect(fileDe(memoire)).toEqual([LEBER]);
  });

  // La clé du jour et la file d'un cours sans planning, figées d'avant le rythme (B-D1, B-D7) : une
  // clé qui changerait recomposerait une séance gardée à la mise à jour de l'application.
  it.each(SANS_PLANNING)(
    'sans_planning_la_cle_et_la_file_sont_celles_d_avant_%s',
    (_nom, journal, choix, attendu) => {
      const memoire = new Map<string, unknown>();
      const contexte = contexteDe({ memoire, evenements: journal() });
      if (choix !== 'tous') avecChapitre(contexte, choix);
      rendreDansLeCours(<Heute />, contexte);

      const releve = {
        cle: empreinte(etatGarde(memoire).cle),
        file: empreinte(fileDe(memoire).join(',')),
      };
      expect(releve).toEqual(attendu);
    },
  );

  it('sans_planning_les_candidates_et_le_compte_sont_ceux_d_aujourd_hui', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire });
    rendreDansLeCours(<Heute />, contexte);

    expect(fileDe(memoire).length).toBeGreaterThan(0);
    expect(etatGarde(memoire).cle).toBe(cleDe(contexte));
    expect(progression()).toContain(formater(t.heute_compte, { dues: 0, neues: 15 }));
    expect(screen.queryByText(COMPTE_A_REBOURS)).toBeNull();
  });

  it.each(['tous', CHAPITRE_1, CHAPITRE_2])(
    'avec_un_planning_les_neuves_viennent_des_modules_ouverts_quel_que_soit_le_choix_%s',
    (choix) => {
      const memoire = new Map<string, unknown>();
      const cours = coursAvec({ planning: SEMAINES });
      const contexte = avecChapitre(contexteDe({ memoire, cours }), choix);
      rendreDansLeCours(<Heute />, contexte);
      const ouvert = duChapitre(contexte, CHAPITRE_1);
      // Sept jours jusqu'à l'ouverture de la semaine 2 : ⌈n1 / 7⌉ cartes, les directes d'abord.
      const attendu = Math.ceil(ouvert.size / JOURS_DE_LA_SEMAINE);

      expect(fileDe(memoire)).toHaveLength(attendu);
      expect(fileDe(memoire).every((id) => ouvert.has(id))).toBe(true);
      expect(fileDe(memoire).every((id) => sensDe(contexte, id) === 'direct')).toBe(true);
      expect(progression()).toContain(formater(t.heute_compte, { dues: 0, neues: attendu }));
    },
  );

  it.each(['direct', 'inverse'] as const)(
    'le_sens_choisi_dans_karteikarten_vaut_aussi_avec_un_planning_%s',
    (sens) => {
      const memoire = new Map<string, unknown>();
      const contexte = contexteDe({ memoire, cours: coursAvec({ planning: SEMAINES }) });
      contexte.preferences = {
        ...contexte.preferences,
        cartes: { ...contexte.preferences.cartes, sens },
      };
      rendreDansLeCours(<Heute />, contexte);
      const duSens = contexte.cours.unites.filter(
        (unite) => unite.module === CHAPITRE_1 && unite.sens === sens,
      );

      expect(fileDe(memoire)).toHaveLength(Math.ceil(duSens.length / JOURS_DE_LA_SEMAINE));
      expect(fileDe(memoire).every((id) => sensDe(contexte, id) === sens)).toBe(true);
    },
  );

  it('le_rythme_se_rattrape_les_jours_qui_restent', () => {
    const memoire = new Map<string, unknown>();
    // Départ le 14/10 : la semaine 2 ouvre le 21/10, quatre jours d'ici.
    const evenements = [reponseDeTest(0, 'zz000000', true, '2026-10-14')];
    const contexte = contexteDe({ memoire, evenements, cours: coursAvec({ planning: SEMAINES }) });
    rendreDansLeCours(<Heute />, contexte);

    expect(fileDe(memoire)).toHaveLength(Math.ceil(duChapitre(contexte, CHAPITRE_1).size / 4));
  });

  it('le_retard_d_une_etape_passe_en_tete', () => {
    const memoire = new Map<string, unknown>();
    // Départ le 09/10 : la semaine 2 s'ouvre le 16/10, l'horizon est le 23/10, six jours d'ici.
    const evenements = [reponseDeTest(0, 'zz000000', true, '2026-10-09')];
    const contexte = contexteDe({ memoire, evenements, cours: coursAvec({ planning: SEMAINES }) });
    rendreDansLeCours(<Heute />, contexte);
    const un = duChapitre(contexte, CHAPITRE_1);
    const deux = duChapitre(contexte, CHAPITRE_2);

    expect(fileDe(memoire)).toHaveLength(Math.ceil((un.size + deux.size) / 6));
    expect(fileDe(memoire).every((id) => un.has(id))).toBe(true);
    // Les premières de l'ordre du planning, et elles seules : sans la coupe à `quota`, la séance
    // tirerait parmi toutes les neuves ouvertes.
    const premieres = contexte.cours.unites
      .filter((unite) => unite.module === CHAPITRE_1 && unite.sens === 'direct')
      .slice(0, Math.ceil((un.size + deux.size) / 6))
      .map(({ id }) => id);
    expect(new Set(fileDe(memoire))).toEqual(new Set(premieres));
  });

  it('le_choix_et_le_jour_recalculent_les_neuves_sans_que_le_journal_change', () => {
    const memoire = new Map<string, unknown>();
    const modele = contexteDe({ memoire });
    // Le cours, le journal et les états sont les mêmes d'un rendu à l'autre : seuls le choix et le
    // jour changent, et seules leurs dépendances peuvent refaire le compte.
    const suivre = (contexte: ContexteCours, aujourdhui = modele.aujourdhui) => ({
      ...contexte,
      cours: modele.cours,
      etats: modele.etats,
      evenements: modele.evenements,
      aujourdhui,
    });
    const vue = rendreDansLeCours(<Heute />, modele);
    const rendre = (contexte: ContexteCours) =>
      vue.rerender(
        <ContexteDuCours.Provider value={contexte}>
          <Heute />
        </ContexteDuCours.Provider>,
      );
    const avecSens = (contexte: ContexteCours, sens: SensChoisi): ContexteCours => ({
      ...contexte,
      preferences: { ...contexte.preferences, cartes: { ...contexte.preferences.cartes, sens } },
    });

    const autreChapitre = suivre(avecChapitre(contexteDe({ memoire }), CHAPITRE_2));
    rendre(autreChapitre);
    expect(etatGarde(memoire).cle).toBe(cleDe(autreChapitre));

    const autreSens = suivre(
      avecSens(avecChapitre(contexteDe({ memoire }), CHAPITRE_2), 'inverse'),
    );
    rendre(autreSens);
    expect(etatGarde(memoire).cle).toBe(cleDe(autreSens));
  });

  it('le_jour_recalcule_les_neuves_sans_que_le_journal_change', () => {
    const memoire = new Map<string, unknown>();
    const modele = contexteDe({
      memoire,
      cours: coursAvec({ planning: SEMAINES }),
      evenements: [PLUS_ANCIEN],
    });
    const vue = rendreDansLeCours(<Heute />, modele);
    const avant = etatGarde(memoire).cle;

    // Le lendemain : le départ ne bouge pas, seul le jour fait passer le rythme de 4 à 5.
    const demain = { ...modele, aujourdhui: '2026-10-18' };
    vue.rerender(
      <ContexteDuCours.Provider value={demain}>
        <Heute />
      </ContexteDuCours.Provider>,
    );

    expect(etatGarde(memoire).cle).toBe(cleDe(demain));
    expect(etatGarde(memoire).cle).not.toBe(avant);
  });

  it('les_decouvertes_du_jour_dans_le_planning_retirent_leur_nombre_du_rythme', () => {
    const memoire = new Map<string, unknown>();
    const evenements = [reponseDeTest(1, HERZ, true, '2026-10-17')];
    const contexte = contexteDe({ memoire, evenements, cours: coursAvec({ planning: SEMAINES }) });
    rendreDansLeCours(<Heute />, contexte);

    // Le rythme reste ⌈n1 / 7⌉, dont une carte est déjà vue aujourd'hui.
    const rythme = Math.ceil(duChapitre(contexte, CHAPITRE_1).size / JOURS_DE_LA_SEMAINE);
    expect(fileDe(memoire)).toHaveLength(rythme - 1);
  });

  it('une_carte_d_un_module_ferme_decouverte_aujourd_hui_ne_pese_que_sur_le_plafond', () => {
    const evenements = [reponseDeTest(1, 'c2000001', true, '2026-10-17')];
    const longueur = (nouvelles: number) => {
      const memoire = new Map<string, unknown>();
      const cours = { ...coursAvecNouvelles(nouvelles), planning: SEMAINES };
      rendreDansLeCours(<Heute />, contexteDe({ memoire, evenements, cours }));
      const taille = fileDe(memoire).length;
      cleanup();
      return taille;
    };

    // Le rythme (3) ne la compte pas ; seul un plafond de 3 la retire.
    expect(longueur(15)).toBe(3);
    expect(longueur(3)).toBe(2);
  });

  it('le_plafond_borne_le_rythme', () => {
    const memoire = new Map<string, unknown>();
    const cours = { ...coursAvecNouvelles(2), planning: SEMAINES };
    rendreDansLeCours(<Heute />, contexteDe({ memoire, cours }));

    expect(fileDe(memoire)).toHaveLength(2);
  });

  it('une_reponse_de_pre_test_ne_change_ni_la_cle_ni_les_neuves', () => {
    const cours = coursAvec({ planning: SEMAINES });
    const pretest = reponseDeTest(1, HERZ, false, '2026-10-17', 'pretest');
    const releves = [[], [pretest]].map((evenements) => {
      const memoire = new Map<string, unknown>();
      rendreDansLeCours(<Heute />, contexteDe({ memoire, evenements, cours }));
      const releve = { cle: etatGarde(memoire).cle, file: fileDe(memoire) };
      cleanup();
      return releve;
    });

    expect(releves[1]).toEqual(releves[0]);
    expect(releves[0]?.file.length).toBeGreaterThan(0);
  });

  it('une_carte_due_d_un_module_ferme_est_posee', () => {
    const memoire = new Map<string, unknown>();
    const evenements = [reponseDeTest(0, 'c2000001', false, '2026-10-16')];
    const cours = coursAvec({ planning: SEMAINES });
    const contexte = avecChapitre(contexteDe({ memoire, evenements, cours }), CHAPITRE_2);
    rendreDansLeCours(<Heute />, contexte);

    // Le départ est le 16/10 : la semaine 2 n'ouvre que le 23/10, six jours d'ici.
    const neuves = Math.ceil(duChapitre(contexte, CHAPITRE_1).size / 6);
    expect(fileDe(memoire)).toHaveLength(1 + neuves);
    expect(fileDe(memoire)).toContain('c2000001');
    expect(progression()).toContain(formater(t.heute_compte, { dues: 1, neues: neuves }));
  });

  it('le_jour_de_l_ouverture_ses_cartes_neuves_entrent_dans_le_rythme', () => {
    const cours = coursAvec({ planning: SEANCES });
    const modele = contexteDe({ cours });
    const vues = duChapitre(modele, CHAPITRE_1);
    const evenements = [...vues].map((id, n) => reponseDeTest(n, id, true, '2026-10-16'));
    const deuxieme = duChapitre(modele, CHAPITRE_2);
    const neuvesDuDeuxieme = (aujourdhui: string) => {
      const memoire = new Map<string, unknown>();
      rendreDansLeCours(<Heute />, contexteDe({ memoire, cours, evenements, aujourdhui }));
      const nombre = fileDe(memoire).filter((id) => deuxieme.has(id)).length;
      cleanup();
      return nombre;
    };

    // Le 17/10, la seconde étape n'est pas ouverte ; le 18/10, ses cartes se répartissent sur les
    // sept jours qui suivent la dernière ouverture.
    expect(neuvesDuDeuxieme('2026-10-17')).toBe(0);
    expect(neuvesDuDeuxieme('2026-10-18')).toBe(Math.ceil(deuxieme.size / JOURS_DE_LA_SEMAINE));
  });

  it('une_etape_qui_s_ouvre_avant_le_premier_geste_recompose_la_seance', () => {
    const cours = coursAvec({ planning: SEMAINES });
    const memoire = new Map<string, unknown>();
    const vue = rendreDansLeCours(<Heute />, contexteDe({ memoire, cours }));
    const avant = etatGarde(memoire);

    // Un événement plus ancien arrive, dans la même vue : le départ recule d'une semaine, la
    // semaine 2 s'ouvre. Sans `cleanup`, la recomposition est éprouvée dans la même vue.
    const apres = contexteDe({ memoire, cours, evenements: [PLUS_ANCIEN] });
    vue.rerender(
      <ContexteDuCours.Provider value={apres}>
        <Heute />
      </ContexteDuCours.Provider>,
    );

    expect(etatGarde(memoire).cle).toBe(cleDe(apres));
    expect(etatGarde(memoire).cle).not.toBe(avant.cle);
    expect(fileDe(memoire).length).toBeGreaterThan(avant.seance.file.length);
  });

  it('une_seance_entamee_ne_se_recompose_pas_quand_une_etape_s_ouvre', () => {
    const cours = coursAvec({ planning: SEMAINES });
    const memoire = new Map<string, unknown>();
    // Le choix « tous » : la clé change quand la semaine 2 s'ouvre.
    const contexte = avecChapitre(contexteDe({ memoire, cours }), 'tous');
    amorcer(contexte, memoire, [HERZ, LEBER]);
    rendreDansLeCours(<Heute />, contexte);
    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);
    const garde = etatGarde(memoire);
    cleanup();

    const apres = avecChapitre(contexteDe({ memoire, cours, evenements: [PLUS_ANCIEN] }), 'tous');
    expect(cleDe(apres)).not.toBe(garde.cle);
    rendreDansLeCours(<Heute />, apres);

    expect(etatGarde(memoire)).toBe(garde);
    expect(fileDe(memoire)).toEqual([LEBER]);
  });

  it('un_planning_illisible_vaut_pas_de_planning', () => {
    // Le même planning que `SEMAINES`, qu'un seul champ rend illisible : il fermerait le chapitre 2.
    const [premiere, seconde] = SEMAINES.etapes;
    const illisible = { etapes: [premiere, { ...seconde, genre: 'inconnu' }] };
    const [sans, lu] = [undefined, illisible].map((planning) => {
      const memoire = new Map<string, unknown>();
      const cours = coursAvec({ planning });
      rendreDansLeCours(<Heute />, avecChapitre(contexteDe({ memoire, cours }), CHAPITRE_2));
      const file = fileDe(memoire);
      cleanup();
      return file;
    });

    // Rien n'est fermé : le chapitre 2, choisi, donne ses cartes neuves.
    expect(lu.length).toBeGreaterThan(0);
    expect(lu).toEqual(sans);
  });

  it.each([
    ['dix_jours', '2026-10-27', 'Noch 10 Tage bis zur Prüfung'],
    ['un_jour', '2026-10-18', 'Noch 1 Tag bis zur Prüfung'],
    ['le_jour_meme', '2026-10-17', 'Heute ist die Prüfung'],
  ])('le_compte_a_rebours_%s_se_dit_sur_chacun_des_trois_ecrans', (_nom, examen, texte) => {
    for (const ecran of Object.values(ECRANS)) {
      ecran(coursAvec({ memoire: memoireAvecExamen(examen) }));
      expect(screen.getAllByText(texte)).toHaveLength(1);
      cleanup();
    }
  });

  it.each([
    ['sans_examen', coursAvec({})],
    ['le_lendemain_de_l_examen', coursAvec({ memoire: memoireAvecExamen('2026-10-16') })],
  ])('le_compte_a_rebours_est_absent_%s_sur_chacun_des_trois_ecrans', (_nom, cours) => {
    for (const ecran of Object.values(ECRANS)) {
      ecran(cours);
      expect(screen.queryByText(COMPTE_A_REBOURS)).toBeNull();
      cleanup();
    }
  });

  // Le pré-test (M4, B-D11 à B-D16). Le départ est réglé par un événement hors du cours, au jour
  // donné : la semaine 2 de `SEMAINES` s'ouvre sept jours plus tard.
  describe('le_pretest', () => {
    const departLe = (jour: string) => [reponseDeTest(0, 'zz000000', true, jour)];
    const duPlanning = () => coursAvec({ planning: SEMAINES });
    const unitesDuChapitre2 = () =>
      contexteDe().cours.unites.filter((u) => u.module === CHAPITRE_2 && u.sens === 'direct');
    const offre = () => screen.queryByRole('button', { name: t.heute_pretest_starten });
    const phraseDeLOffre = (etape: string) => formater(t.heute_pretest_angebot, { etape });

    it('l_offre_se_dit_sur_les_trois_ecrans_deux_jours_avant_la_semaine_2', () => {
      for (const ecran of Object.values(ECRANS)) {
        ecran(duPlanning(), departLe('2026-10-12'));
        expect(offre()).toBeTruthy();
        expect(screen.getByText(phraseDeLOffre('Woche 2'))).toBeTruthy();
        expect(screen.getAllByText(t.heute_pretest_warum)).toHaveLength(1);
        cleanup();
      }
    });

    it.each([
      ['quatre_jours_avant_se_tait', '2026-10-14', false],
      ['trois_jours_avant_se_dit', '2026-10-13', true],
      ['un_jour_avant_se_dit', '2026-10-11', true],
      ['le_jour_de_l_ouverture_se_tait', '2026-10-10', false],
    ])('l_offre_suit_la_fenetre_%s', (_nom, depart, dite) => {
      for (const ecran of Object.values(ECRANS)) {
        ecran(duPlanning(), departLe(depart));
        expect(offre() !== null).toBe(dite);
        cleanup();
      }
    });

    it('pas_d_offre_sans_planning', () => {
      for (const ecran of Object.values(ECRANS)) {
        ecran(coursAvec({}), departLe('2026-10-12'));
        expect(offre()).toBeNull();
        expect(screen.queryByText(t.heute_pretest_warum)).toBeNull();
        cleanup();
      }
    });

    it('pas_d_offre_avant_une_etape_revision', () => {
      const [premiere, seconde] = SEMAINES.etapes;
      const planning = { etapes: [premiere, { ...seconde, genre: 'revision' }] };
      for (const ecran of Object.values(ECRANS)) {
        ecran(coursAvec({ planning }), departLe('2026-10-12'));
        expect(offre()).toBeNull();
        cleanup();
      }
    });

    it('pas_d_offre_apres_une_reponse_de_pretest_a_l_etape', () => {
      const evenements = [
        ...departLe('2026-10-12'),
        reponseDeTest(1, 'c2000001', false, '2026-10-17', 'pretest'),
      ];
      for (const ecran of Object.values(ECRANS)) {
        ecran(duPlanning(), evenements);
        expect(offre()).toBeNull();
        cleanup();
      }
    });

    it('pas_d_offre_en_pleine_seance', () => {
      const memoire = new Map<string, unknown>();
      const evenements = departLe('2026-10-12');
      const contexte = contexteDe({ memoire, cours: duPlanning(), evenements });
      amorcer(contexte, memoire, [HERZ, LEBER]);
      rendreDansLeCours(<Heute />, contexte);
      expect(offre()).toBeTruthy();
      cliquer(t.cartes_retourner);
      cliquer(t.cartes_su);

      expect(fileDe(memoire)).toEqual([LEBER]);
      expect(offre()).toBeNull();
      expect(screen.queryByText(t.heute_pretest_warum)).toBeNull();
    });

    it('pas_d_offre_apres_un_jugement_avant_la_suite', () => {
      // Une question à choix jugée, sa suite pas encore donnée : `faites` vaut encore 0, mais
      // `repondue` n'est plus `null`, et la séance est amorcée.
      const memoire = new Map<string, unknown>();
      const evenements = departLe('2026-10-12');
      const contexte = contexteDe({ memoire, cours: duPlanning(), evenements });
      amorcer(contexte, memoire, [QCM, HERZ]);
      rendreDansLeCours(<Heute />, contexte);
      expect(offre()).toBeTruthy();
      fireEvent.click(boutons()[0] as HTMLButtonElement);

      expect(etatGarde(memoire).repondue).not.toBeNull();
      expect(etatGarde(memoire).seance.faites).toBe(0);
      expect(offre()).toBeNull();
    });

    it('la_question_du_pretest_reste_la_meme_d_un_rendu_a_l_autre', () => {
      // Un hasard qui change à chaque tirage : avec celui des tests (`() => 0`), tout tirage
      // redonne la même chose et un tirage refait au rendu ne se verrait pas.
      let tirage = 1;
      const base = {
        ...contexteDe({ cours: duPlanning(), evenements: departLe('2026-10-12') }),
        hasard: () => {
          tirage = (tirage * 16807) % 2147483647;
          return tirage / 2147483647;
        },
      };
      const vue = rendreDansLeCours(<Heute />, base);
      cliquer(t.heute_pretest_starten);
      const lire = () => [
        document.querySelector('.card .front')?.textContent,
        boutons().map(texteDe).join('|'),
      ];
      const avant = lire();
      vue.rerender(
        <ContexteDuCours.Provider value={{ ...base, evenements: [...base.evenements] }}>
          <Heute />
        </ContexteDuCours.Provider>,
      );
      expect(lire()).toEqual(avant);
    });

    it('l_offre_suit_le_journal_les_etats_et_le_jour_d_une_meme_vue', () => {
      // Les mêmes objets `cours`, `etats` et `evenements` d'un rendu à l'autre : seule la valeur
      // éprouvée change, si bien qu'une dépendance oubliée au `useMemo` se voit.
      const base = contexteDe({ cours: duPlanning(), evenements: departLe('2026-10-12') });
      const vue = rendreDansLeCours(<Heute />, base);
      const rendre = (suivant: ContexteCours) =>
        vue.rerender(
          <ContexteDuCours.Provider value={suivant}>
            <Heute />
          </ContexteDuCours.Provider>,
        );
      expect(offre()).toBeTruthy();

      const vues = unitesDuChapitre2().map((u, n) =>
        reponseDeTest(n + 1, u.id, true, '2026-10-16'),
      );
      const decouvertes = contexteDe({
        cours: duPlanning(),
        evenements: [...base.evenements, ...vues],
      });
      rendre({ ...base, etats: decouvertes.etats });
      expect(offre()).toBeNull();

      rendre(base);
      expect(offre()).toBeTruthy();
      rendre({ ...base, aujourdhui: '2026-10-20' });
      expect(offre()).toBeNull();

      rendre(base);
      expect(offre()).toBeTruthy();
      const fait = reponseDeTest(99, 'c2000001', false, '2026-10-17', 'pretest');
      rendre({ ...base, evenements: [...base.evenements, fait] });
      expect(offre()).toBeNull();
    });

    function commencer() {
      const memoire = new Map<string, unknown>();
      const predicats: PredicatsDeSeance = new Map();
      const base = contexteDe({ memoire, cours: duPlanning(), evenements: departLe('2026-10-12') });
      const contexte: ContexteCours = {
        ...base,
        useEtatDOnglet: etatDOngletSur(memoire, predicats),
      };
      rendreDansUnCoursVivant(<Heute />, contexte);
      return { contexte, memoire, seance: () => seanceDansLaMemoire(memoire, predicats) };
    }

    /** Répond à `n` questions du pré-test, par la première option, et passe à la suivante. */
    function repondre(n: number): string[] {
      const posees: string[] = [];
      for (let i = 0; i < n; i++) {
        posees.push(document.querySelector('.card .front')?.textContent ?? '');
        fireEvent.click(boutons()[0] as HTMLButtonElement);
        cliquer(t.suivante);
      }
      return posees;
    }

    it('le_pretest_pose_cinq_cartes_distinctes_de_l_etape_au_sens_direct', () => {
      const { contexte } = commencer();
      cliquer(t.heute_pretest_starten);

      expect(screen.getByText(formater(t.heute_pretest_frage, { i: 1, n: 5 }))).toBeTruthy();
      const posees = repondre(5);
      const attendues = new Set(unitesDuChapitre2().map(({ question }) => question));
      expect(new Set(posees).size).toBe(5);
      for (const posee of posees) expect(attendues.has(posee)).toBe(true);
      // Chaque réponse est au journal, sous le mode `pretest`, sur l'unité directe d'une carte.
      const ids = new Set(unitesDuChapitre2().map(({ id }) => id));
      const appels = vi.mocked(contexte.enregistrer).mock.calls;
      expect(appels).toHaveLength(5);
      for (const [id, , mode] of appels) {
        expect(ids.has(id)).toBe(true);
        expect(mode).toBe('pretest');
      }
    });

    it('la_fin_du_pretest_dit_l_etape_et_ramene_a_la_seance_gardee', () => {
      const { memoire } = commencer();
      const garde = etatGarde(memoire);
      const question = document.querySelector('.card .front')?.textContent;
      cliquer(t.heute_pretest_starten);
      // La séance du jour reste gardée telle quelle pendant le pré-test.
      expect(etatGarde(memoire)).toBe(garde);
      repondre(5);

      expect(screen.getByRole('heading', { name: t.heute_pretest_fin })).toBeTruthy();
      expect(screen.getByText(formater(t.heute_pretest_fertig, { etape: 'Woche 2' }))).toBeTruthy();
      expect(document.body.textContent).not.toMatch(/richtig/i);
      cliquer(t.heute_pretest_zurueck);

      expect(memoire.get('heute/pretest')).toBeNull();
      expect(etatGarde(memoire)).toBe(garde);
      expect(document.querySelector('.card .front')?.textContent).toBe(question);
      expect(offre()).toBeNull();
    });

    it('la_seance_reste_gardee_quand_le_journal_grandit_des_reponses_de_pretest', () => {
      const memoire = new Map<string, unknown>();
      const predicats: PredicatsDeSeance = new Map();
      const base = {
        ...contexteDe({ memoire, cours: duPlanning(), evenements: departLe('2026-10-12') }),
        useEtatDOnglet: etatDOngletSur(memoire, predicats),
      };
      const vue = rendreDansLeCours(<Heute />, base);
      const garde = etatGarde(memoire);
      cliquer(t.heute_pretest_starten);
      repondre(5);
      // Le journal du parent grandit des cinq réponses ; un pré-test ne change pas les états.
      const pretests = vi
        .mocked(base.enregistrer)
        .mock.calls.map(([id, juste], n) =>
          reponseDeTest(2000 + n, id, juste, '2026-10-12', 'pretest'),
        );
      expect(pretests).toHaveLength(5);
      vue.rerender(
        <ContexteDuCours.Provider
          value={{ ...base, evenements: [...base.evenements, ...pretests] }}
        >
          <Heute />
        </ContexteDuCours.Provider>,
      );
      cliquer(t.heute_pretest_zurueck);

      expect(etatGarde(memoire)).toEqual(garde);
    });

    it('quitter_le_pretest_ramene_a_la_seance', () => {
      const { memoire } = commencer();
      const garde = etatGarde(memoire);
      cliquer(t.heute_pretest_starten);
      repondre(2);
      expect((memoire.get('heute/pretest') as EtatDuPretest).faites).toBe(2);
      cliquer(t.heute_pretest_zurueck);

      expect(memoire.get('heute/pretest')).toBeNull();
      expect(etatGarde(memoire)).toBe(garde);
      // Commencé puis quitté, il ne revient pas (B-D12).
      expect(offre()).toBeNull();
    });

    it('un_pretest_commence_retient_la_mise_a_jour', () => {
      const { seance } = commencer();
      expect(seance()).toBeNull();
      cliquer(t.heute_pretest_starten);
      expect(seance()).toBeNull();
      fireEvent.click(boutons()[0] as HTMLButtonElement);
      expect(seance()).toBe('journalisee');
      cliquer(t.suivante);
      repondre(4);
      // Fini : plus de question qui reste.
      expect(seance()).toBeNull();
    });

    it('la_derniere_reponse_synchronise_et_aucune_autre', async () => {
      const { contexte } = commencer();
      cliquer(t.heute_pretest_starten);
      repondre(4);
      await Promise.resolve();
      expect(contexte.finDeSeance).not.toHaveBeenCalled();
      fireEvent.click(boutons()[0] as HTMLButtonElement);
      await waitFor(() => expect(contexte.finDeSeance).toHaveBeenCalledTimes(1));
    });

    it('la_derniere_reponse_appelle_fin_de_seance_une_fois', async () => {
      const { contexte } = commencer();
      cliquer(t.heute_pretest_starten);
      repondre(4);
      fireEvent.click(boutons()[0] as HTMLButtonElement);
      await waitFor(() => expect(contexte.finDeSeance).toHaveBeenCalledTimes(1));
      cliquer(t.suivante);
      cliquer(t.heute_pretest_zurueck);
      await Promise.resolve();
      await Promise.resolve();
      expect(contexte.finDeSeance).toHaveBeenCalledTimes(1);
    });

    it('un_pretest_termine_ne_revient_pas_au_remontage_de_l_onglet', () => {
      const { contexte, memoire } = commencer();
      const question = document.querySelector('.card .front')?.textContent;
      cliquer(t.heute_pretest_starten);
      repondre(5);
      expect(screen.getByText(formater(t.heute_pretest_fertig, { etape: 'Woche 2' }))).toBeTruthy();

      cleanup();
      rendreDansUnCoursVivant(<Heute />, contexte);
      expect(screen.queryByText(formater(t.heute_pretest_fertig, { etape: 'Woche 2' }))).toBeNull();
      expect(memoire.get('heute/pretest')).toBeNull();
      expect(document.querySelector('.card .front')?.textContent).toBe(question);
    });

    it('un_pretest_en_cours_revient_tel_quel_au_remontage_de_l_onglet', () => {
      const { contexte } = commencer();
      cliquer(t.heute_pretest_starten);
      repondre(1);
      const posee = document.querySelector('.card .front')?.textContent;
      expect(screen.getByText(formater(t.heute_pretest_frage, { i: 2, n: 5 }))).toBeTruthy();

      cleanup();
      rendreDansUnCoursVivant(<Heute />, contexte);
      expect(screen.getByText(formater(t.heute_pretest_frage, { i: 2, n: 5 }))).toBeTruthy();
      expect(document.querySelector('.card .front')?.textContent).toBe(posee);
    });
  });
});
