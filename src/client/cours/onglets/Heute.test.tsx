// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import type { Evenement } from '../../../domaine/journal/evenement.js';
import { unitesDuChoix } from '../../../domaine/seances/cartes.js';
import {
  cartesNeuves,
  decouvertesLe,
  duesDuJour,
  type Posable,
  posablesDuCours,
  type SeanceDuJour,
  TAILLE_DE_SEANCE,
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

/** La clé qu'aurait la séance du contexte : les dues, les neuves du choix des cartes, le quota. */
function cleDe(contexte: ContexteCours): string {
  const posables = posablesDuCours(contexte.cours);
  const dues = duesDuJour(posables, contexte.etats, contexte.aujourdhui);
  const { chapitre, sens } = contexte.preferences.cartes;
  const choix = new Set(unitesDuChoix(contexte.cours, chapitre, sens).map(({ id }) => id));
  const neuves = cartesNeuves(
    posables.filter(({ id }) => choix.has(id)),
    contexte.etats,
  );
  const decouvertes = decouvertesLe(
    contexte.evenements,
    contexte.aujourdhui,
    new Set(contexte.cours.unites.map(({ id }) => id)),
  );
  const quota = Math.max(0, contexte.cours.cours.leitner.nouvellesParSeance - decouvertes);
  return cleDuJour(contexte.aujourdhui, dues, neuves, quota);
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
    cliquer(t.suivante);

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
    expect(contexte.enregistrer).toHaveBeenNthCalledWith(1, HERZ, false);
    expect(contexte.enregistrer).toHaveBeenNthCalledWith(2, HERZ, false);
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
});
