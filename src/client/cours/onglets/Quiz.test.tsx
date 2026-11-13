// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { UniteDeCarte } from '../../../domaine/cartes/unites.js';
import { CHAPITRE_1, CHAPITRE_2, coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import { hasardScripte } from '../../../domaine/hasard.fixture.js';
import {
  AllerRetour,
  contexteDeTest,
  rendreDansLeCours,
  rendreDansUnCoursVivant,
} from '../contexte-cours.fixture.js';
import type { ContexteCours } from '../contexte-cours.js';
import type { Preferences } from '../preferences.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { boutons, progression, texteDe, touche } from './onglets.fixture.js';
import { Quiz } from './Quiz.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

// Cinq cartes du chapitre 1 (quatre options possibles) et deux du chapitre 2.
const CINQ = ['c1000001', 'c1000002', 'c1000003', 'c1000004', 'c1000005'];
const DEUX = ['c1000001', 'c1000002'];
const FRAGE = 'c1000008';

/** Le cours de test dont les modules de cartes ne gardent que les cartes données. */
function coursAvec(ids: string[]): CoursServi {
  const servi = coursServiDeTest();
  return {
    ...servi,
    modules: servi.modules.map((module) =>
      module.type === 'cartes'
        ? { ...module, cartes: module.cartes.filter(({ id }) => ids.includes(id)) }
        : module,
    ),
  };
}

function contexteDe(ids: string[], choix: Partial<Preferences['quiz']> = {}): ContexteCours {
  const contexte = contexteDeTest({ cours: coursAvec(ids) });
  contexte.preferences = {
    ...contexte.preferences,
    quiz: { chapitre: CHAPITRE_1, sens: 'direct', ...choix },
  };
  return contexte;
}

/** L'unité dont la question est affichée. */
function uniteAffichee(contexte: ContexteCours, sens: 'direct' | 'inverse' = 'direct') {
  const question = document.querySelector('.card .front')?.textContent;
  const unite = contexte.cours.unites.find((x) => x.question === question && x.sens === sens);
  if (unite === undefined) throw new Error(`Aucune unité pour la question « ${question} »`);
  return unite;
}

/** Le bouton de la bonne réponse, et ceux des mauvaises. */
function selon(unite: UniteDeCarte) {
  const tous = boutons();
  return {
    bonne: tous.find((bouton) => texteDe(bouton) === unite.reponse) as HTMLButtonElement,
    fausses: tous.filter((bouton) => texteDe(bouton) !== unite.reponse),
  };
}

describe('Quiz', () => {
  it('quatre_options_choix_journalise_et_colore', () => {
    const contexte = contexteDe(CINQ);
    rendreDansLeCours(<Quiz />, contexte);

    const unite = uniteAffichee(contexte);
    expect(screen.getByText('Begriff · Begriff → Bedeutung')).toBeTruthy();
    expect(progression()).toBe('0 / 0 richtig');
    expect(screen.getByText(t.quiz_touches)).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.quiz_suivante })).toBeNull();
    // Quatre options numérotées, la bonne parmi elles, sans doublon.
    expect(boutons()).toHaveLength(4);
    expect(boutons().map((bouton) => bouton.querySelector('.mono')?.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    const options = boutons().map(texteDe);
    expect(new Set(options).size).toBe(4);
    expect(options).toContain(unite.reponse);
    expect(boutons().every((bouton) => !bouton.disabled && bouton.className === '')).toBe(true);

    // Une mauvaise réponse : elle est en rouge, la bonne en vert, le reste ne change pas.
    const { bonne, fausses } = selon(unite);
    fireEvent.click(fausses[0]);

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(unite.id, false, 'choix');
    expect(fausses[0].className).toBe('wrong');
    expect(bonne.className).toBe('right');
    expect(fausses.slice(1).map((bouton) => bouton.className)).toEqual(['', '']);
    expect(boutons().every((bouton) => bouton.disabled)).toBe(true);
    expect(progression()).toBe('0 / 1 richtig');
    expect(screen.queryByText(t.quiz_touches)).toBeNull();

    // Un deuxième clic ne compte pas : le bouton est désactivé.
    fireEvent.click(fausses[1]);
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
  });

  it('bonne_reponse_journalisee_juste', () => {
    const contexte = contexteDe(CINQ);
    rendreDansLeCours(<Quiz />, contexte);
    const unite = uniteAffichee(contexte);
    const { bonne, fausses } = selon(unite);

    fireEvent.click(bonne);

    expect(contexte.enregistrer).toHaveBeenCalledWith(unite.id, true, 'choix');
    expect(bonne.className).toBe('right');
    // Aucune option n'est en rouge : la personne a juste.
    expect(fausses.map((bouton) => bouton.className)).toEqual(['', '', '']);
    expect(progression()).toBe('1 / 1 richtig');
  });

  it('naechste_frage', () => {
    const contexte = contexteDe(CINQ);
    rendreDansLeCours(<Quiz />, contexte);
    fireEvent.click(selon(uniteAffichee(contexte)).bonne);
    const suivante = screen.getByRole('button', { name: t.quiz_suivante });
    // « Nächste Frage » a le focus : Enter continue.
    expect(document.activeElement).toBe(suivante);

    fireEvent.click(suivante);

    // Une question neuve : options libres, sans couleur, et la ligne des touches de retour.
    expect(screen.queryByRole('button', { name: t.quiz_suivante })).toBeNull();
    expect(boutons()).toHaveLength(4);
    expect(boutons().every((bouton) => !bouton.disabled && bouton.className === '')).toBe(true);
    expect(screen.getByText(t.quiz_touches)).toBeTruthy();
    // Le score se poursuit.
    expect(progression()).toBe('1 / 1 richtig');

    fireEvent.click(selon(uniteAffichee(contexte)).fausses[0]);
    expect(progression()).toBe('1 / 2 richtig');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);
  });

  it('touches_1_a_4', () => {
    const contexte = contexteDe(CINQ);
    rendreDansLeCours(<Quiz />, contexte);
    const unite = uniteAffichee(contexte);
    const options = boutons().map(texteDe);

    // Hors de 1 à 4, rien.
    touche('5');
    touche('0');
    touche('a');
    touche('Enter');
    expect(contexte.enregistrer).not.toHaveBeenCalled();

    touche('3');

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(
      unite.id,
      options[2] === unite.reponse,
      'choix',
    );
    expect(boutons()[2].className).toMatch(/^(right|wrong)$/);
    // La question est répondue : les autres touches ne comptent plus.
    touche('1');
    touche('4');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(progression()).toBe(`${options[2] === unite.reponse ? 1 : 0} / 1 richtig`);

    // Sur la question suivante, elles reviennent.
    fireEvent.click(screen.getByRole('button', { name: t.quiz_suivante }));
    touche('4');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);
    expect(progression()).toContain(' / 2 richtig');
  });

  it('question_conservee_apres_un_aller_retour_d_onglet', () => {
    const contexte = contexteDe(CINQ);
    rendreDansUnCoursVivant(
      <AllerRetour>
        <Quiz />
      </AllerRetour>,
      contexte,
    );
    const unite = uniteAffichee(contexte);
    const options = boutons().map(texteDe);

    // Une question sans réponse se retrouve telle quelle : même question, mêmes options.
    fireEvent.click(screen.getByTestId('ailleurs'));
    expect(boutons()).toHaveLength(0);
    fireEvent.click(screen.getByTestId('retour'));
    expect(uniteAffichee(contexte).id).toBe(unite.id);
    expect(boutons().map(texteDe)).toEqual(options);
    expect(progression()).toBe('0 / 0 richtig');

    // Répondue, elle garde sa réponse, ses couleurs et le score.
    const { bonne, fausses } = selon(unite);
    const choisie = boutons().indexOf(fausses[0]);
    const justeIndex = boutons().indexOf(bonne);
    fireEvent.click(fausses[0]);
    fireEvent.click(screen.getByTestId('ailleurs'));
    fireEvent.click(screen.getByTestId('retour'));

    expect(uniteAffichee(contexte).id).toBe(unite.id);
    expect(boutons().map(texteDe)).toEqual(options);
    expect(boutons()[choisie].className).toBe('wrong');
    expect(boutons()[justeIndex].className).toBe('right');
    expect(boutons().every((bouton) => bouton.disabled)).toBe(true);
    expect(progression()).toBe('0 / 1 richtig');
    expect(screen.getByRole('button', { name: t.quiz_suivante })).toBeTruthy();
    // Et elle ne compte pas deux fois.
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
  });

  it('touche_sans_option_correspondante_ne_fait_rien', () => {
    // Deux cartes seulement : deux options.
    const contexte = contexteDe(DEUX);
    rendreDansLeCours(<Quiz />, contexte);
    expect(boutons()).toHaveLength(2);

    touche('3');
    touche('4');
    expect(contexte.enregistrer).not.toHaveBeenCalled();
    expect(boutons().every((bouton) => bouton.className === '')).toBe(true);

    touche('2');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
  });

  it('chapitre_et_sens_retenus_dans_les_preferences', () => {
    const contexte = contexteDe(['c1000001', 'c1000002', 'c2000001']);
    rendreDansUnCoursVivant(<Quiz />, contexte);
    const chapitre = screen.getByLabelText(t.choix_chapitre) as HTMLSelectElement;
    expect(chapitre.value).toBe(CHAPITRE_1);
    expect(Array.from(chapitre.options).map((option) => option.textContent)).toEqual([
      '1 · Anfangskapitel',
      '2 · Vorsilben',
      'Alle Kapitel',
      'Arbeitsblätter',
    ]);
    touche('1');
    expect(progression()).toMatch(/^[01] \/ 1 richtig$/);

    fireEvent.change(chapitre, { target: { value: CHAPITRE_2 } });

    // Les préférences gardent le choix, sans toucher à celles des cartes.
    expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
      ...contexte.preferences,
      quiz: { chapitre: CHAPITRE_2, sens: 'direct' },
    });
    expect((screen.getByLabelText(t.choix_chapitre) as HTMLSelectElement).value).toBe(CHAPITRE_2);
    // Une série neuve, dans le chapitre choisi.
    expect(progression()).toBe('0 / 0 richtig');
    expect(document.querySelector('.card .front')?.textContent).toBe('tachy-');

    fireEvent.change(screen.getByLabelText(t.choix_sens), { target: { value: 'inverse' } });

    expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
      ...contexte.preferences,
      quiz: { chapitre: CHAPITRE_2, sens: 'inverse' },
    });
    expect(progression()).toBe('0 / 0 richtig');
    expect(document.querySelector('.card .front')?.textContent).toBe('schnell');
    expect(screen.getByText('Präfix · Bedeutung → Begriff')).toBeTruthy();
  });

  it('options_de_l_inverse_sont_des_termes', () => {
    const contexte = contexteDe(CINQ, { sens: 'inverse' });
    rendreDansLeCours(<Quiz />, contexte);

    const unite = uniteAffichee(contexte, 'inverse');
    expect(boutons().map(texteDe)).toContain(unite.reponse);
    expect(['Herz', 'Leber', 'Niere', 'Milz', 'Magen']).toContain(unite.reponse);
    for (const option of boutons().map(texteDe)) {
      expect(['Herz', 'Leber', 'Niere', 'Milz', 'Magen']).toContain(option);
    }
  });

  it('choix_sans_unite_affiche_un_etat_vide_sans_planter', () => {
    // La carte « Frage » n'a pas d'unité inverse : ce choix est vide.
    const contexte = contexteDe([FRAGE], { sens: 'inverse' });
    rendreDansUnCoursVivant(<Quiz />, contexte);

    expect(screen.getByText(t.quiz_vide)).toBeTruthy();
    expect(boutons()).toHaveLength(0);
    expect(progression()).toBe('0 / 0 richtig');
    // Les touches n'ont rien à répondre.
    touche('1');
    expect(contexte.enregistrer).not.toHaveBeenCalled();

    // Revenir au sens direct redonne une question.
    fireEvent.change(screen.getByLabelText(t.choix_sens), { target: { value: 'direct' } });

    expect(screen.queryByText(t.quiz_vide)).toBeNull();
    expect(document.querySelector('.card .front')?.textContent).toBe(
      'Wie viele Kammern hat das Herz?',
    );
    // Une seule carte : une seule option, la bonne.
    expect(boutons().map(texteDe)).toEqual(['Vier']);
  });

  it('quiz_feuilles_enregistre_l_element', () => {
    const contexte = contexteDe(CINQ, { chapitre: 'feuilles' });
    // Trois éléments fermés de poids 3 : une case sur neuf, la première est le QCM.
    contexte.hasard = hasardScripte([0.05]);
    rendreDansLeCours(<Quiz />, contexte);

    expect(document.querySelector('.card .front')?.textContent).toBe('Was bedeutet hyper-?');
    expect(boutons()).toHaveLength(4);
    expect(boutons().map(texteDe)).toContain('über dem Mass');
    const fausse = boutons().find((b) => texteDe(b) !== 'über dem Mass') as HTMLButtonElement;
    fireEvent.click(fausse);

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith('fb000007', false, 'choix');
    expect(fausse.className).toBe('wrong');
    expect(boutons().find((b) => texteDe(b) === 'über dem Mass')?.className).toBe('right');
    expect(progression()).toBe('0 / 1 richtig');
  });

  it('quiz_feuilles_vrai_faux_libelles_et_reponse', () => {
    const contexte = contexteDe(CINQ, { chapitre: 'feuilles' });
    contexte.hasard = hasardScripte([0.5]);
    rendreDansLeCours(<Quiz />, contexte);

    expect(document.querySelector('.card .front')?.textContent).toBe('Die Milz filtert das Blut.');
    expect(boutons().map(texteDe)).toEqual([t.feuille_richtig, t.feuille_falsch]);
    fireEvent.click(boutons()[0]);

    expect(contexte.enregistrer).toHaveBeenCalledWith('fb000008', true, 'choix');
    expect(progression()).toBe('1 / 1 richtig');
  });
});
