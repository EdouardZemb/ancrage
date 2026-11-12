// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import type { Evenement } from '../../../domaine/journal/evenement.js';
import {
  duesDuJour,
  type Posable,
  posablesDuCours,
  type SeanceDuJour,
} from '../../../domaine/seances/heute.js';
import {
  AUJOURDHUI_DE_TEST,
  contexteDeTest,
  rendreDansLeCours,
  rendreDansUnCoursVivant,
  reponseDeTest,
} from '../contexte-cours.fixture.js';
import type { ContexteCours } from '../contexte-cours.js';
import { heuteEnCours } from '../seances-en-cours.js';
import { formater, TEXTES_COURS } from '../textes-cours.js';
import { cleDuJour, type EtatDeHeute, Heute, questionDe } from './Heute.js';
import { boutons, progression, texteDe } from './onglets.fixture.js';

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
  options: { cours?: CoursServi; evenements?: Evenement[]; memoire?: Map<string, unknown> } = {},
): ContexteCours {
  const contexte = contexteDeTest(options);
  contexte.hasard = () => 0;
  return contexte;
}

function posable(contexte: ContexteCours, id: string): Posable {
  const trouve = posablesDuCours(contexte.cours).find((p) => p.id === id);
  if (trouve === undefined) throw new Error(`Aucun posable ${id}`);
  return trouve;
}

/** La mémoire de l'onglet, amorcée avec une file écrite à la main : le premier élément est posé. */
function amorcer(contexte: ContexteCours, memoire: Map<string, unknown>, ids: string[]): void {
  const file = ids.map((id) => posable(contexte, id));
  const seance: SeanceDuJour = { file, revenus: [], faites: 0, justes: 0 };
  const dues = duesDuJour(posablesDuCours(contexte.cours), contexte.etats, contexte.aujourdhui);
  const etat: EtatDeHeute = {
    cle: cleDuJour(contexte.aujourdhui, dues),
    seance,
    question: questionDe(file[0], contexte.cours, contexte.hasard),
    repondue: null,
  };
  memoire.set('heute', etat);
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
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(HERZ, true);

    // Un mot : chaque partie se nomme, et le mot s'enregistre à la dernière.
    const mot = contexte.cours.morphologie?.mots.find(({ id }) => id === GASTRITIS);
    expect(mot).toBeDefined();
    for (const segment of mot?.segments ?? []) {
      expect(contexte.enregistrer).not.toHaveBeenCalledWith(GASTRITIS, expect.anything());
      choisir(sensDuMorpheme(contexte, segment.morpheme));
    }
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(GASTRITIS, true);
    cliquer(t.mots_naechstes);

    // Un point de schéma : on le nomme parmi les propositions.
    choisir('Mitte');
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(MITTE, true);
    cliquer(t.suivante);

    // Un exercice à options.
    choisir('der');
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(ARTIKEL, true);
    cliquer(t.suivante);

    // Une question fermée de fiche.
    choisir('über dem Mass');
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(QCM, true);
    expect(contexte.enregistrer).toHaveBeenCalledTimes(5);
    cliquer(t.quiz_suivante);

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
    expect(contexte.enregistrer).toHaveBeenCalledWith('e2000001', true);
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

    cliquer(t.quiz_suivante);

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
    expect(contexte.enregistrer).toHaveBeenCalledWith(ARTIKEL, false);

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
    expect(progression()).toContain(`${formater(t.heute_compte, { dues: 2, neues: 15 })}`);
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
    expect(progression()).toContain(formater(t.heute_compte, { dues: 1, neues: 15 }));
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
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire });
    amorcer(contexte, memoire, [HERZ]);
    rendreDansLeCours(<Heute />, contexte);

    cliquer(t.cartes_retourner);
    cliquer(t.cartes_pas_su);

    // Elle revient une fois : la file compte toujours un élément, la carte est à neuf.
    expect(progression()).toContain('1 beantwortet · 1 offen');
    expect(contexte.finDeSeance).not.toHaveBeenCalled();
    cliquer(t.cartes_retourner);
    cliquer(t.cartes_pas_su);

    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);
    expect(contexte.enregistrer).toHaveBeenNthCalledWith(1, HERZ, false);
    expect(contexte.enregistrer).toHaveBeenNthCalledWith(2, HERZ, false);
    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
    expect(screen.getByText(formater(t.heute_resultat, { justes: 0, faites: 2 }))).toBeTruthy();
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

  it('la_fin_sans_rien_de_du_ne_propose_pas_de_suivante', () => {
    const memoire = new Map<string, unknown>();
    const contexte = contexteDe({ memoire });
    amorcer(contexte, memoire, [HERZ]);
    rendreDansUnCoursVivant(<Heute />, contexte);

    cliquer(t.cartes_retourner);
    cliquer(t.cartes_su);

    expect(screen.getByRole('heading', { name: t.heute_fin })).toBeTruthy();
    expect(screen.queryByText(/Noch \d+ fällig/)).toBeNull();
    expect(screen.queryByRole('button', { name: t.heute_encore })).toBeNull();
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
});
