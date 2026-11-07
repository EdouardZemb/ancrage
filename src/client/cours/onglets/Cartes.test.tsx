// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Carte } from '../../../domaine/contenu/modele.js';
import { CHAPITRE_1, CHAPITRE_2, coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import type { SeanceCartes } from '../../../domaine/seances/cartes.js';
import { enAttente } from '../../attente.fixture.js';
import {
  AllerRetour,
  AUJOURDHUI_DE_TEST,
  contexteDeTest,
  rendreDansLeCours,
  rendreDansUnCoursNavigable,
  rendreDansUnCoursVivant,
  reponseDeTest,
} from '../contexte-cours.fixture.js';
import type { ContexteCours } from '../contexte-cours.js';
import type { Preferences } from '../preferences.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { Cartes } from './Cartes.js';
import { progression, touche } from './onglets.fixture.js';
import { Quiz } from './Quiz.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

// Les cartes du cours de test, par leur question au recto (le sens direct).
const HERZ = 'c1000001';
const LEBER = 'c1000002';
const NIERE = 'c1000003';
const FRAGE = 'c1000008';
const TACHY = 'c2000001';
const IDS_PAR_RECTO: Record<string, string> = {
  Herz: HERZ,
  Leber: LEBER,
  Niere: NIERE,
  'tachy-': TACHY,
};

/** Le cours de test dont les modules de cartes ne gardent que les cartes données. */
function coursAvec(
  ids: string[],
  options: { nouvelles?: number; carte?: (carte: Carte) => Carte } = {},
): CoursServi {
  const servi = coursServiDeTest();
  return {
    ...servi,
    leitner: { ...servi.leitner, nouvellesParSeance: options.nouvelles ?? 15 },
    modules: servi.modules.map((module) =>
      module.type === 'cartes'
        ? {
            ...module,
            cartes: module.cartes
              .filter(({ id }) => ids.includes(id))
              .map((carte) => options.carte?.(carte) ?? carte),
          }
        : module,
    ),
  };
}

function contexteDe(
  ids: string[],
  choix: Partial<Preferences['cartes']> = {},
  options: Parameters<typeof coursAvec>[1] & { evenements?: ContexteCours['evenements'] } = {},
): ContexteCours {
  const contexte = contexteDeTest({
    cours: coursAvec(ids, options),
    evenements: options.evenements ? [...options.evenements] : undefined,
  });
  contexte.preferences = {
    ...contexte.preferences,
    cartes: { chapitre: CHAPITRE_1, sens: 'direct', saisie: true, ...choix },
  };
  return contexte;
}

/** La question de la carte affichée. */
function enonce(): string {
  return document.querySelector('.card .front')?.textContent ?? '';
}

function retourner(): void {
  fireEvent.click(screen.getByRole('button', { name: t.cartes_retourner }));
}

function repondre(libelle: string): void {
  fireEvent.click(screen.getByRole('button', { name: libelle }));
}

function taper(valeur: string): void {
  fireEvent.input(screen.getByLabelText(t.cartes_saisie_etiquette), { target: { value: valeur } });
  fireEvent.click(screen.getByRole('button', { name: t.cartes_verifier }));
}

describe('Cartes', () => {
  it('retourner_puis_gewusst_journalise_juste', () => {
    const contexte = contexteDe([HERZ]);
    rendreDansLeCours(<Cartes />, contexte);

    expect(enonce()).toBe('Herz');
    // Le libellé du type vient du cours, le sens et le chapitre de l'interface.
    expect(screen.getByText('Begriff · Begriff → Bedeutung · Kap. 1')).toBeTruthy();
    expect(screen.getByText('neue Karte')).toBeTruthy();
    expect(screen.getByText(t.cartes_indice)).toBeTruthy();
    expect(screen.getByText(t.cartes_touches)).toBeTruthy();
    expect(progression()).toBe('0 beantwortet · 1 übrig');
    // Le verso et les boutons de réponse attendent que la carte soit retournée.
    expect(screen.queryByText('Organ im Brustkorb')).toBeNull();
    expect(screen.queryByRole('button', { name: t.cartes_su })).toBeNull();

    retourner();

    expect(screen.getByText('Organ im Brustkorb')).toBeTruthy();
    expect(screen.queryByText(t.cartes_indice)).toBeNull();
    expect(contexte.enregistrer).not.toHaveBeenCalled();

    repondre(t.cartes_su);

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(HERZ, true);
    expect(progression()).toBe('1 beantwortet · 0 übrig');
    expect(screen.getByRole('heading', { name: t.cartes_serie_finie })).toBeTruthy();
  });

  it('nicht_gewusst_remet_la_carte_en_fin', () => {
    const contexte = contexteDe([HERZ, LEBER]);
    rendreDansLeCours(<Cartes />, contexte);
    expect(progression()).toBe('0 beantwortet · 2 übrig');
    const premiere = enonce();
    const autre = premiere === 'Herz' ? 'Leber' : 'Herz';

    retourner();
    repondre(t.cartes_pas_su);

    expect(contexte.enregistrer).toHaveBeenLastCalledWith(IDS_PAR_RECTO[premiere], false);
    // Elle reste dans la file, derrière l'autre.
    expect(progression()).toBe('1 beantwortet · 2 übrig');
    expect(enonce()).toBe(autre);
    // La carte suivante n'est pas retournée.
    expect(screen.queryByRole('button', { name: t.cartes_su })).toBeNull();

    retourner();
    repondre(t.cartes_su);

    expect(contexte.enregistrer).toHaveBeenLastCalledWith(IDS_PAR_RECTO[autre], true);
    expect(progression()).toBe('2 beantwortet · 1 übrig');
    expect(enonce()).toBe(premiere);

    retourner();
    repondre(t.cartes_su);

    expect(progression()).toBe('3 beantwortet · 0 übrig');
    expect(screen.getByText(`2 von 3 richtig. ${t.cartes_retour_des_dues}`)).toBeTruthy();
  });

  it('saisie_inverse_juste_presque_et_fausse', () => {
    const contexte = contexteDe([HERZ], { sens: 'inverse' });
    rendreDansLeCours(<Cartes />, contexte);

    // Une inverse se tape : pas de carte à retourner.
    expect(enonce()).toBe('Organ im Brustkorb');
    expect(screen.getByText('Begriff · Bedeutung → Begriff · Kap. 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.cartes_retourner })).toBeNull();
    expect(screen.getByText(t.cartes_saisie_indice)).toBeTruthy();
    expect(screen.getByText(t.cartes_touches_saisie)).toBeTruthy();
    // Le champ a le focus dès l'affichage.
    expect(document.activeElement).toBe(screen.getByLabelText(t.cartes_saisie_etiquette));

    // Fausse : la saisie barrée, la bonne réponse, et le recours de la personne.
    taper('Leber');
    let verdict = document.querySelector('.verdict') as HTMLElement;
    expect(verdict.className).toBe('verdict ko');
    expect(verdict.querySelector('span')?.textContent).toBe('Leider falsch');
    expect(verdict.querySelector('s')?.textContent).toBe('Leber');
    expect(verdict.querySelector('b')?.textContent).toBe('Herz');
    expect(screen.getByRole('button', { name: t.cartes_aussi_juste })).toBeTruthy();
    expect(contexte.enregistrer).not.toHaveBeenCalled();
    // « Weiter » a le focus : Enter continue.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: t.cartes_suivante }));
    repondre(t.cartes_suivante);
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(`${HERZ}:inverse`, false);

    // La carte revient, avec un champ vide.
    expect(progression()).toBe('1 beantwortet · 1 übrig');
    expect((screen.getByLabelText(t.cartes_saisie_etiquette) as HTMLInputElement).value).toBe('');

    // Presque : une faute de frappe, comptée fausse.
    taper('Hertz');
    verdict = document.querySelector('.verdict') as HTMLElement;
    expect(verdict.className).toBe('verdict near');
    expect(verdict.querySelector('span')?.textContent).toBe('Fast – achte auf die Schreibweise');
    expect(verdict.querySelector('s')?.textContent).toBe('Hertz');
    expect(screen.getByRole('button', { name: t.cartes_aussi_juste })).toBeTruthy();
    repondre(t.cartes_suivante);
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(`${HERZ}:inverse`, false);

    // Juste : la casse ne compte pas ; ni saisie barrée, ni recours.
    taper('herz');
    verdict = document.querySelector('.verdict') as HTMLElement;
    expect(verdict.className).toBe('verdict ok');
    expect(verdict.querySelector('span')?.textContent).toBe('Richtig!');
    expect(verdict.querySelector('s')).toBeNull();
    expect(verdict.querySelector('b')?.textContent).toBe('Herz');
    expect(screen.queryByRole('button', { name: t.cartes_aussi_juste })).toBeNull();
    repondre(t.cartes_suivante);
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(`${HERZ}:inverse`, true);

    expect(contexte.enregistrer).toHaveBeenCalledTimes(3);
    expect(screen.getByText(`1 von 3 richtig. ${t.cartes_retour_des_dues}`)).toBeTruthy();
  });

  it('saisie_envoyee_par_entree_dans_le_champ', () => {
    rendreDansLeCours(<Cartes />, contexteDe([HERZ], { sens: 'inverse' }));

    const champ = screen.getByLabelText(t.cartes_saisie_etiquette);
    fireEvent.input(champ, { target: { value: 'Herz' } });
    fireEvent.submit(champ.closest('form') as HTMLFormElement);

    expect(document.querySelector('.verdict.ok')).toBeTruthy();
  });

  it('meine_antwort_war_auch_richtig_journalise_juste', () => {
    const contexte = contexteDe([HERZ], { sens: 'inverse' });
    rendreDansLeCours(<Cartes />, contexte);

    taper('Leber');
    repondre(t.cartes_aussi_juste);

    // Une seule réponse, juste, sans passer par « Weiter ».
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(`${HERZ}:inverse`, true);
    expect(progression()).toBe('1 beantwortet · 0 übrig');
    expect(screen.getByText(`1 von 1 richtig. ${t.cartes_retour_des_dues}`)).toBeTruthy();
  });

  it('saisie_vide_est_fausse', () => {
    const contexte = contexteDe([HERZ], { sens: 'inverse' });
    rendreDansLeCours(<Cartes />, contexte);

    fireEvent.click(screen.getByRole('button', { name: t.cartes_verifier }));

    const verdict = document.querySelector('.verdict') as HTMLElement;
    expect(verdict.className).toBe('verdict ko');
    expect(verdict.querySelector('span')?.textContent).toBe('Leider falsch');
    // Rien à barrer ; la bonne réponse s'affiche.
    expect(verdict.querySelector('s')).toBeNull();
    expect(verdict.querySelector('b')?.textContent).toBe('Herz');
    repondre(t.cartes_suivante);
    expect(contexte.enregistrer).toHaveBeenCalledWith(`${HERZ}:inverse`, false);
  });

  it('saisie_seulement_pour_une_inverse_et_si_cochee', () => {
    // Une directe se retourne, même avec la case cochée.
    const directe = rendreDansLeCours(<Cartes />, contexteDe([HERZ], { saisie: true }));
    expect(screen.getByRole('button', { name: t.cartes_retourner })).toBeTruthy();
    expect(screen.queryByLabelText(t.cartes_saisie_etiquette)).toBeNull();
    directe.unmount();

    // Une inverse se retourne aussi quand la case est décochée.
    rendreDansLeCours(<Cartes />, contexteDe([HERZ], { sens: 'inverse', saisie: false }));
    expect(screen.getByRole('button', { name: t.cartes_retourner })).toBeTruthy();
    expect(screen.queryByLabelText(t.cartes_saisie_etiquette)).toBeNull();
    expect((screen.getByLabelText(t.cartes_saisie) as HTMLInputElement).checked).toBe(false);
  });

  it('case_saisie_garde_le_choix_et_efface_le_verdict', () => {
    const contexte = contexteDe([HERZ], { sens: 'inverse' });
    rendreDansUnCoursVivant(<Cartes />, contexte);
    const caseSaisie = screen.getByLabelText(t.cartes_saisie) as HTMLInputElement;
    expect(caseSaisie.checked).toBe(true);
    taper('Leber');
    expect(document.querySelector('.verdict')).toBeTruthy();

    fireEvent.click(caseSaisie);

    expect(contexte.changerPreferences).toHaveBeenCalledWith({
      ...contexte.preferences,
      cartes: { chapitre: CHAPITRE_1, sens: 'inverse', saisie: false },
    });
    // Le verdict n'a plus de sens : la carte se retourne.
    expect(document.querySelector('.verdict')).toBeNull();
    expect(screen.getByRole('button', { name: t.cartes_retourner })).toBeTruthy();
    // La séance continue : rien n'a été répondu, rien n'est perdu.
    expect(progression()).toBe('0 beantwortet · 1 übrig');
    expect(contexte.enregistrer).not.toHaveBeenCalled();
  });

  it('fin_de_serie_resultat_et_weitere_neue_karten', () => {
    // Une carte neuve par séance : la suivante est une autre.
    const contexte = contexteDe([HERZ, LEBER, NIERE], {}, { nouvelles: 1 });
    rendreDansUnCoursVivant(<Cartes />, contexte);
    expect(progression()).toBe('0 beantwortet · 1 übrig');
    const premiere = enonce();

    retourner();
    repondre(t.cartes_pas_su);
    retourner();
    repondre(t.cartes_su);

    expect(screen.getByRole('heading', { name: t.cartes_serie_finie })).toBeTruthy();
    expect(screen.getByText(`1 von 2 richtig. ${t.cartes_retour_des_dues}`)).toBeTruthy();
    expect(progression()).toBe('2 beantwortet · 0 übrig');
    expect(screen.queryByRole('button', { name: t.cartes_retourner })).toBeNull();

    repondre(t.cartes_plus);

    expect(progression()).toBe('0 beantwortet · 1 übrig');
    expect(screen.queryByRole('heading', { name: t.cartes_serie_finie })).toBeNull();
    // Une carte neuve : pas celle qui vient d'être répondue.
    expect(enonce()).not.toBe(premiere);
  });

  it('rien_a_reviser_puis_weitere_neue_karten_reprend_toutes_les_cartes', () => {
    // La seule carte a été sue aujourd'hui : ni due, ni neuve.
    const contexte = contexteDe(
      [HERZ],
      {},
      {
        evenements: [reponseDeTest(1, HERZ, true, AUJOURDHUI_DE_TEST)],
      },
    );
    rendreDansLeCours(<Cartes />, contexte);

    expect(screen.getByRole('heading', { name: t.cartes_rien_a_reviser })).toBeTruthy();
    expect(screen.getByText(t.cartes_retour_des_dues)).toBeTruthy();
    // Aucun résultat à annoncer : rien n'a été répondu.
    expect(screen.queryByText(/richtig\./)).toBeNull();
    expect(progression()).toBe('0 beantwortet · 0 übrig');

    // Faute de carte neuve, le prototype propose des cartes du chapitre.
    repondre(t.cartes_plus);

    expect(enonce()).toBe('Herz');
    expect(progression()).toBe('0 beantwortet · 1 übrig');
  });

  it('choix_sans_unite_affiche_rien_a_reviser_sans_planter', () => {
    // La carte « Frage » n'a pas d'unité inverse : ce choix est vide.
    const contexte = contexteDe([FRAGE], { sens: 'inverse' });
    rendreDansLeCours(<Cartes />, contexte);

    expect(screen.getByRole('heading', { name: t.cartes_rien_a_reviser })).toBeTruthy();
    expect(progression()).toBe('0 beantwortet · 0 übrig');
    // Les choix restent à la portée de la personne.
    expect(screen.getByLabelText(t.choix_chapitre)).toBeTruthy();

    repondre(t.cartes_plus);

    expect(screen.getByRole('heading', { name: t.cartes_rien_a_reviser })).toBeTruthy();
    expect(contexte.enregistrer).not.toHaveBeenCalled();
  });

  it('carte_due_affiche_son_fach', () => {
    // Fausse aujourd'hui : en boîte 1, à revoir le jour même.
    const contexte = contexteDe(
      [HERZ],
      {},
      {
        evenements: [reponseDeTest(1, HERZ, false, AUJOURDHUI_DE_TEST)],
      },
    );
    rendreDansLeCours(<Cartes />, contexte);

    expect(enonce()).toBe('Herz');
    expect(screen.getByText('Fach 1')).toBeTruthy();
    expect(screen.queryByText('neue Karte')).toBeNull();
  });

  it('question_longue_en_plus_petit', () => {
    const contexte = contexteDe(
      [HERZ, FRAGE],
      {},
      {
        carte: (carte) =>
          carte.id === FRAGE
            ? { ...carte, recto: 'Wie viele Kammern hat das menschliche Herz im Normalfall?' }
            : carte,
      },
    );
    rendreDansLeCours(<Cartes />, contexte);

    const classes = new Map<string, string>();
    for (const _ of [1, 2]) {
      classes.set(enonce(), document.querySelector('.card .front')?.className ?? '');
      retourner();
      repondre(t.cartes_su);
    }

    expect(classes.get('Herz')).toBe('front');
    expect(classes.get('Wie viele Kammern hat das menschliche Herz im Normalfall?')).toBe(
      'front long',
    );
  });

  it('fin_de_serie_declenche_la_synchronisation', async () => {
    const contexte = contexteDe([HERZ, LEBER]);
    // La dernière réponse n'est rangée qu'à la demande du test.
    const derniere = enAttente<boolean>();
    contexte.enregistrer = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockReturnValueOnce(derniere.promesse);
    rendreDansLeCours(<Cartes />, contexte);

    retourner();
    repondre(t.cartes_su);
    await act(async () => {});
    // Une réponse au milieu d'une série ne synchronise pas.
    expect(contexte.finDeSeance).not.toHaveBeenCalled();

    retourner();
    repondre(t.cartes_su);
    expect(screen.getByRole('heading', { name: t.cartes_serie_finie })).toBeTruthy();
    await act(async () => {});
    // La série est finie, mais pas la dernière réponse : la synchronisation partirait sans elle.
    expect(contexte.finDeSeance).not.toHaveBeenCalled();

    await act(async () => derniere.regler(true));
    await waitFor(() => expect(contexte.finDeSeance).toHaveBeenCalledTimes(1));

    // Ni un rendu de plus ni un clic sur « Zum Quiz » n'en font une deuxième.
    repondre(t.cartes_vers_quiz);
    await act(async () => {});
    expect(contexte.finDeSeance).toHaveBeenCalledTimes(1);
  });

  it('changer_de_chapitre_recommence_la_seance', () => {
    const contexte = contexteDe([HERZ, LEBER, TACHY]);
    rendreDansUnCoursVivant(<Cartes />, contexte);
    expect(progression()).toBe('0 beantwortet · 2 übrig');
    retourner();
    repondre(t.cartes_su);
    expect(progression()).toBe('1 beantwortet · 1 übrig');
    const chapitre = screen.getByLabelText(t.choix_chapitre) as HTMLSelectElement;
    expect(Array.from(chapitre.options).map((option) => option.textContent)).toEqual([
      '1 · Anfangskapitel',
      '2 · Vorsilben',
      'Alle Kapitel',
    ]);
    expect(chapitre.value).toBe(CHAPITRE_1);

    fireEvent.change(chapitre, { target: { value: CHAPITRE_2 } });

    expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
      ...contexte.preferences,
      cartes: { chapitre: CHAPITRE_2, sens: 'direct', saisie: true },
    });
    expect((screen.getByLabelText(t.choix_chapitre) as HTMLSelectElement).value).toBe(CHAPITRE_2);
    expect(progression()).toBe('0 beantwortet · 1 übrig');
    expect(enonce()).toBe('tachy-');
    expect(screen.getByText('Präfix · Begriff → Bedeutung · Kap. 2')).toBeTruthy();

    // Le sens aussi recommence la séance : la même carte, vue de l'autre côté.
    const sens = screen.getByLabelText(t.choix_sens) as HTMLSelectElement;
    expect(Array.from(sens.options).map((option) => [option.value, option.textContent])).toEqual([
      ['mix', 'Gemischt'],
      ['direct', 'Begriff → Bedeutung'],
      ['inverse', 'Bedeutung → Begriff'],
    ]);
    fireEvent.change(sens, { target: { value: 'inverse' } });

    expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
      ...contexte.preferences,
      cartes: { chapitre: CHAPITRE_2, sens: 'inverse', saisie: true },
    });
    expect(progression()).toBe('0 beantwortet · 1 übrig');
    expect(enonce()).toBe('schnell');

    // Tous les chapitres : les cartes neuves des deux, sans « Herz », répondue au début.
    fireEvent.change(screen.getByLabelText(t.choix_chapitre), { target: { value: 'tous' } });
    fireEvent.change(screen.getByLabelText(t.choix_sens), { target: { value: 'direct' } });
    expect(progression()).toBe('0 beantwortet · 2 übrig');
  });

  it('touches_espace_1_2', () => {
    const contexte = contexteDe([HERZ, LEBER]);
    rendreDansLeCours(<Cartes />, contexte);
    const premiere = enonce();

    // Rien à répondre tant que la carte n'est pas retournée.
    touche('1');
    touche('2');
    expect(contexte.enregistrer).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: t.cartes_su })).toBeNull();

    touche(' ');
    expect(screen.getByRole('button', { name: t.cartes_su })).toBeTruthy();

    touche('1');
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(IDS_PAR_RECTO[premiere], false);
    expect(progression()).toBe('1 beantwortet · 2 übrig');
    const deuxieme = enonce();
    // Retournée par Enter, comme par l'espace.
    expect(screen.queryByRole('button', { name: t.cartes_su })).toBeNull();
    touche('Enter');
    touche('2');
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(IDS_PAR_RECTO[deuxieme], true);
    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);
    expect(progression()).toBe('2 beantwortet · 1 übrig');
  });

  it('touches_inactives_pour_une_saisie_et_en_fin_de_serie', () => {
    const contexte = contexteDe([HERZ], { sens: 'inverse' });
    rendreDansLeCours(<Cartes />, contexte);

    // La saisie a ses propres touches : Enter dans le champ, ou sur « Weiter ».
    for (const key of [' ', 'Enter', '1', '2']) touche(key);
    expect(contexte.enregistrer).not.toHaveBeenCalled();
    expect(document.querySelector('.verdict')).toBeNull();

    // Dans le champ, les touches ne sont de toute façon à personne d'autre.
    const champ = screen.getByLabelText(t.cartes_saisie_etiquette);
    expect(fireEvent.keyDown(champ, { key: ' ' })).toBe(true);
  });

  it('touches_inactives_quand_la_serie_est_finie', () => {
    const contexte = contexteDe([HERZ]);
    rendreDansLeCours(<Cartes />, contexte);
    touche(' ');
    touche('2');
    expect(screen.getByRole('heading', { name: t.cartes_serie_finie })).toBeTruthy();

    // Plus de carte : la touche garde son effet du navigateur.
    expect(fireEvent.keyDown(window, { key: ' ' })).toBe(true);
    touche('2');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
  });

  it('zum_quiz_reprend_le_chapitre_et_ouvre_le_quiz', () => {
    const contexte = contexteDe([TACHY], { chapitre: CHAPITRE_2 });
    rendreDansLeCours(<Cartes />, contexte);
    touche(' ');
    touche('2');

    repondre(t.cartes_vers_quiz);

    // Le chapitre, pas le sens : le quiz garde le sien.
    expect(contexte.changerPreferences).toHaveBeenCalledWith({
      ...contexte.preferences,
      quiz: { ...contexte.preferences.quiz, chapitre: CHAPITRE_2 },
    });
    expect(contexte.aller).toHaveBeenCalledWith('quiz');
    const [preferences] = vi.mocked(contexte.changerPreferences).mock.invocationCallOrder;
    const [oubli] = vi.mocked(contexte.oublierEtatDOnglet).mock.invocationCallOrder;
    const [aller] = vi.mocked(contexte.aller).mock.invocationCallOrder;
    expect(preferences).toBeLessThan(aller);
    // Le quiz se monte après l'oubli de sa question gardée.
    expect(oubli).toBeLessThan(aller);
  });

  it('zum_quiz_repart_d_une_question_neuve', () => {
    const contexte = contexteDe([HERZ, LEBER]);
    contexte.preferences = {
      ...contexte.preferences,
      quiz: { chapitre: CHAPITRE_1, sens: 'direct' },
    };
    const { aller } = rendreDansUnCoursNavigable(
      { quiz: () => <Quiz />, cartes: () => <Cartes /> },
      'quiz',
      contexte,
    );
    // Une question répondue dans le quiz, sur le même chapitre que les cartes.
    fireEvent.click(document.querySelector('.options button') as HTMLButtonElement);
    expect(progression()).toMatch(/^[01] \/ 1 richtig$/);
    aller('cartes');
    retourner();
    repondre(t.cartes_su);
    retourner();
    repondre(t.cartes_su);

    repondre(t.cartes_vers_quiz);

    // Une question neuve et un score à zéro, comme « quiz = null » du prototype (H:1766).
    expect(progression()).toBe('0 / 0 richtig');
    expect(contexte.oublierEtatDOnglet).toHaveBeenCalledExactlyOnceWith('quiz');
    expect(
      Array.from(document.querySelectorAll<HTMLButtonElement>('.options button')).every(
        (bouton) => !bouton.disabled && bouton.className === '',
      ),
    ).toBe(true);
    expect(screen.queryByRole('button', { name: t.quiz_suivante })).toBeNull();
  });

  it('serie_conservee_apres_un_aller_retour_d_onglet', () => {
    // Deux cartes neuves par série, trois en réserve : une série rebâtie en tirerait d'autres.
    const contexte = contexteDe([HERZ, LEBER, NIERE], {}, { nouvelles: 2 });
    rendreDansUnCoursVivant(
      <AllerRetour>
        <Cartes />
      </AllerRetour>,
      contexte,
    );
    retourner();
    repondre(t.cartes_su);
    const courante = enonce();
    retourner();
    expect(progression()).toBe('1 beantwortet · 1 übrig');

    fireEvent.click(screen.getByTestId('ailleurs'));
    expect(document.querySelector('.progressline')).toBeNull();
    fireEvent.click(screen.getByTestId('retour'));

    // La même série, la même carte, toujours retournée.
    expect(progression()).toBe('1 beantwortet · 1 übrig');
    expect(enonce()).toBe(courante);
    repondre(t.cartes_su);
    expect(screen.getByRole('heading', { name: t.cartes_serie_finie })).toBeTruthy();

    // Finie, elle le reste : pas deux autres cartes neuves.
    fireEvent.click(screen.getByTestId('ailleurs'));
    fireEvent.click(screen.getByTestId('retour'));
    expect(screen.getByRole('heading', { name: t.cartes_serie_finie })).toBeTruthy();
    expect(progression()).toBe('2 beantwortet · 0 übrig');
    expect(screen.getByText(`2 von 2 richtig. ${t.cartes_retour_des_dues}`)).toBeTruthy();
  });

  it('changer_de_choix_apres_un_aller_retour_recommence_la_serie', () => {
    const contexte = contexteDe([HERZ, LEBER, TACHY]);
    rendreDansUnCoursVivant(
      <AllerRetour>
        <Cartes />
      </AllerRetour>,
      contexte,
    );
    retourner();
    repondre(t.cartes_su);
    fireEvent.click(screen.getByTestId('ailleurs'));
    fireEvent.click(screen.getByTestId('retour'));
    expect(progression()).toBe('1 beantwortet · 1 übrig');

    // La série gardée vient d'un choix ; un autre choix en bâtit une neuve.
    fireEvent.change(screen.getByLabelText(t.choix_chapitre), { target: { value: CHAPITRE_2 } });

    expect(progression()).toBe('0 beantwortet · 1 übrig');
    expect(enonce()).toBe('tachy-');
  });

  it('entree_sur_un_bouton_ne_retourne_pas_la_carte', () => {
    const contexte = contexteDe([HERZ, LEBER]);
    rendreDansLeCours(<Cartes />, contexte);

    // La carte est un `div` : Entrée la retourne, et on lui retire son effet du navigateur.
    const carte = screen.getByRole('button', { name: t.cartes_retourner });
    expect(fireEvent.keyDown(carte, { key: 'Enter' })).toBe(false);
    expect(screen.getByRole('button', { name: t.cartes_su })).toBeTruthy();

    // Un vrai bouton garde Entrée et Espace : le navigateur l'active, la série ne bouge pas ici.
    for (const key of ['Enter', ' ']) {
      expect(fireEvent.keyDown(screen.getByRole('button', { name: t.cartes_su }), { key })).toBe(
        true,
      );
    }
    expect(contexte.enregistrer).not.toHaveBeenCalled();
    expect(progression()).toBe('0 beantwortet · 2 übrig');

    // Les chiffres répondent, bouton ou non.
    expect(fireEvent.keyDown(screen.getByRole('button', { name: t.cartes_su }), { key: '2' })).toBe(
      false,
    );
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
  });

  it('rangement_echoue_serie_continue_et_fin_de_serie_synchronise', async () => {
    const contexte = contexteDe([HERZ, LEBER]);
    // Le stockage refuse les réponses : `enregistrer` rend faux, sans rejeter.
    contexte.enregistrer = vi.fn().mockResolvedValue(false);
    rendreDansLeCours(<Cartes />, contexte);

    retourner();
    repondre(t.cartes_su);
    await act(async () => {});
    // La série avance comme si de rien n'était.
    expect(progression()).toBe('1 beantwortet · 1 übrig');
    expect(contexte.finDeSeance).not.toHaveBeenCalled();

    retourner();
    repondre(t.cartes_pas_su);
    retourner();
    repondre(t.cartes_su);

    // La fin de série part quand même : les réponses rangées, elles, doivent se synchroniser.
    expect(screen.getByRole('heading', { name: t.cartes_serie_finie })).toBeTruthy();
    await waitFor(() => expect(contexte.finDeSeance).toHaveBeenCalledTimes(1));
    expect(contexte.enregistrer).toHaveBeenCalledTimes(3);
  });

  describe('seance_imposee', () => {
    /** Les erreurs d'un examen : deux unités du chapitre 1, révisées en cartes. */
    function imposee(contexte: ContexteCours): SeanceCartes {
      const file = contexte.cours.unites.filter(({ id }) => id === HERZ || id === LEBER);
      return { file, faites: 0, justes: 0, deLExamen: true };
    }

    it('fehler_aus_der_pruefung_puis_weitere_neue_karten_repart_en_normal', () => {
      const contexte = contexteDe([HERZ, LEBER, NIERE], {}, { nouvelles: 1 });
      const seance = imposee(contexte);
      rendreDansUnCoursVivant(<Cartes seanceImposee={seance} />, contexte);

      expect(progression()).toBe('0 beantwortet · 2 übrig · Fehler aus der Prüfung');
      expect(enonce()).toBe('Herz');

      retourner();
      repondre(t.cartes_su);
      expect(progression()).toBe('1 beantwortet · 1 übrig · Fehler aus der Prüfung');
      expect(enonce()).toBe('Leber');
      retourner();
      repondre(t.cartes_su);

      expect(screen.getByRole('heading', { name: t.cartes_serie_finie })).toBeTruthy();
      expect(progression()).toBe('2 beantwortet · 0 übrig · Fehler aus der Prüfung');

      // Une série ordinaire : une carte neuve, la seule qui reste, et plus de mention.
      repondre(t.cartes_plus);
      expect(progression()).toBe('0 beantwortet · 1 übrig');
      expect(enonce()).toBe('Niere');
    });

    it('changer_de_chapitre_quitte_la_seance_imposee', () => {
      const contexte = contexteDe([HERZ, LEBER, TACHY]);
      const seance = imposee(contexte);
      rendreDansUnCoursVivant(<Cartes seanceImposee={seance} />, contexte);
      expect(progression()).toContain('Fehler aus der Prüfung');

      fireEvent.change(screen.getByLabelText(t.choix_chapitre), { target: { value: CHAPITRE_2 } });

      expect(progression()).toBe('0 beantwortet · 1 übrig');
      expect(enonce()).toBe('tachy-');
    });
  });
});
