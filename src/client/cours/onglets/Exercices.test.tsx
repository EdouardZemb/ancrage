// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { Exercice, FamilleExercices } from '../../../domaine/contenu/modele.js';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import { AllerRetour, contexteDeTest, rendreDansUnCoursVivant } from '../contexte-cours.fixture.js';
import type { ContexteCours } from '../contexte-cours.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { Exercices } from './Exercices.js';
import { boutons, progression, texteDe, touche } from './onglets.fixture.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

const ZEVOLITIS = 'e3000001';
const ARTIKELS: Record<string, { id: string; reponse: string }> = {
  '___ Musterus': { id: 'e1000001', reponse: 'der' },
  '___ Probela': { id: 'e1000002', reponse: 'die' },
  '___ Beispielum': { id: 'e1000003', reponse: 'das' },
};

function exercice(
  id: string,
  invite: string,
  reponse: string,
  autres: Partial<Exercice>,
): Exercice {
  return { id, invite, reponse, statut: 'source', ...autres };
}

const REGLE_ARTIKEL = '-ix → Maskulinum';

const SCHREIB: FamilleExercices = {
  code: 'schreib',
  libelle: 'Schreibweise anpassen',
  exercices: [
    exercice(ZEVOLITIS, '«Cevolitis» mit z geschrieben?', 'Zevolitis', {
      regle: '-li am Wortende → Verkleinerung',
    }),
  ],
};

const ENDUNG: FamilleExercices = {
  code: 'endung',
  libelle: 'Wörter ergänzen',
  exercices: [
    exercice('e4000001', 'Rosa ___ (die rote Blüte)', 'rubra', { options: ['rubrus', 'rubra'] }),
  ],
};

const LANG: FamilleExercices = {
  code: 'lang',
  libelle: 'Lange Aufgabe',
  exercices: [
    exercice('e5000001', 'Welche Endung passt zum Wort «Rosa» in diesem langen Satz?', 'rubra', {
      options: ['rubrus', 'rubra'],
    }),
  ],
};

/**
 * Le cours de test dont le module d'exercices a les familles données ; sans elles, les siennes
 * (artikel avec une règle, plural) suivies de `en_plus`.
 */
function coursAvecFamilles(
  familles?: FamilleExercices[],
  enPlus: FamilleExercices[] = [],
): CoursServi {
  const servi = coursServiDeTest();
  return {
    ...servi,
    modules: servi.modules.map((module) => {
      if (module.type !== 'exercices') return module;
      const siennes = module.familles.map((famille) =>
        famille.code === 'artikel'
          ? {
              ...famille,
              exercices: famille.exercices.map((x) => ({ ...x, regle: REGLE_ARTIKEL })),
            }
          : famille,
      );
      return { ...module, familles: familles ?? [...siennes, ...enPlus] };
    }),
  };
}

function contexteDe(
  famille: string,
  cours: CoursServi = coursAvecFamilles(undefined, [SCHREIB, ENDUNG, LANG]),
): ContexteCours {
  const contexte = contexteDeTest({ cours });
  contexte.preferences = { ...contexte.preferences, exercices: { famille } };
  return contexte;
}

function invite(): string {
  return document.querySelector('.card .front')?.textContent ?? '';
}

function etiquette(): string {
  return document.querySelector('.card .kind')?.textContent ?? '';
}

function verdict(): HTMLElement {
  return document.querySelector('.verdict') as HTMLElement;
}

function taper(valeur: string): void {
  fireEvent.input(screen.getByLabelText(t.exercices_antwort), { target: { value: valeur } });
  fireEvent.click(screen.getByRole('button', { name: t.pruefen }));
}

function suivant(): HTMLElement {
  return screen.getByRole('button', { name: t.suivante });
}

describe('Exercices', () => {
  it('saisie_stricte', () => {
    const contexte = contexteDe('schreib');
    rendreDansUnCoursVivant(<Exercices />, contexte);

    // La question vient du contenu, avec la consigne de l'interface et un champ à remplir.
    expect(etiquette()).toBe('Schreibweise anpassen');
    expect(invite()).toBe('«Cevolitis» mit z geschrieben?');
    expect(document.querySelector('.card .front')?.className).toBe('front');
    expect(screen.getByText(t.exercices_hinweis)).toBeTruthy();
    expect(t.exercices_hinweis).toBe('Hier zählt die genaue Schreibweise.');
    const champ = screen.getByLabelText(t.exercices_antwort) as HTMLInputElement;
    expect(champ.placeholder).toBe('Antwort …');
    expect(champ.getAttribute('autocapitalize')).toBe('off');
    expect(document.activeElement).toBe(champ);
    expect(boutons()).toHaveLength(0);
    expect(document.querySelector('.rule')).toBeNull();
    expect(progression()).toBe('0 / 0 richtig · 0 von 8 Aufgaben gekonnt');

    // « Cevolitis » n'est pas « Zevolitis » : seule la graphie exacte compte.
    taper('Cevolitis');

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(ZEVOLITIS, false, 'saisie');
    expect(verdict().className).toBe('verdict ko');
    expect(verdict().querySelector('span')?.textContent).toBe(t.verdict_fausse);
    expect(verdict().querySelector('s')?.textContent).toBe('Cevolitis');
    expect(verdict().querySelector('b')?.textContent).toBe('Zevolitis');
    // Le champ a disparu ; « Weiter » a le focus.
    expect(screen.queryByLabelText(t.exercices_antwort)).toBeNull();
    expect(screen.queryByRole('button', { name: t.pruefen })).toBeNull();
    expect(document.activeElement).toBe(suivant());
    expect(progression()).toBe('0 / 1 richtig · 0 von 8 Aufgaben gekonnt');

    // Une nouvelle question, un champ vide qui a le focus : la bonne graphie est juste.
    fireEvent.click(suivant());
    expect(verdict()).toBeNull();
    const vide = screen.getByLabelText(t.exercices_antwort) as HTMLInputElement;
    expect(vide.value).toBe('');
    expect(document.activeElement).toBe(vide);
    taper('Zevolitis');

    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(ZEVOLITIS, true, 'saisie');
    expect(verdict().className).toBe('verdict ok');
    expect(verdict().querySelector('span')?.textContent).toBe(t.verdict_juste);
    // Juste : on n'affiche pas la saisie barrée.
    expect(verdict().querySelector('s')).toBeNull();
    expect(verdict().querySelector('b')?.textContent).toBe('Zevolitis');
    expect(progression()).toBe('1 / 2 richtig · 1 von 8 Aufgaben gekonnt');
  });

  it('saisie_envoyee_par_entree_dans_le_champ', () => {
    const contexte = contexteDe('schreib');
    rendreDansUnCoursVivant(<Exercices />, contexte);

    fireEvent.input(screen.getByLabelText(t.exercices_antwort), {
      target: { value: 'Zevolitis' },
    });
    fireEvent.submit(document.querySelector('form.typed') as HTMLFormElement);

    expect(contexte.enregistrer).toHaveBeenCalledWith(ZEVOLITIS, true, 'saisie');
  });

  it('saisie_casse_espaces_et_forme_unicode_sont_sans_effet', () => {
    // « Hier zählt die genaue Schreibweise » : la casse et les espaces n'en font pas partie.
    for (const donnee of ['  zevolitis ', 'ZEVOLITIS', 'Zevolitis ']) {
      const contexte = contexteDe('schreib');
      rendreDansUnCoursVivant(<Exercices />, contexte);
      taper(donnee);
      expect(contexte.enregistrer).toHaveBeenCalledWith(ZEVOLITIS, true, 'saisie');
      cleanup();
    }
    // Mais une lettre de plus ou de moins est une faute.
    for (const donnee of ['Zevolitiss', 'Zevoltis', 'Cevolitis']) {
      const contexte = contexteDe('schreib');
      rendreDansUnCoursVivant(<Exercices />, contexte);
      taper(donnee);
      expect(contexte.enregistrer).toHaveBeenCalledWith(ZEVOLITIS, false, 'saisie');
      cleanup();
    }
  });

  it('saisie_vide_est_fausse', () => {
    const contexte = contexteDe('schreib');
    rendreDansUnCoursVivant(<Exercices />, contexte);

    fireEvent.click(screen.getByRole('button', { name: t.pruefen }));

    expect(contexte.enregistrer).toHaveBeenCalledWith(ZEVOLITIS, false, 'saisie');
    expect(verdict().className).toBe('verdict ko');
    // Rien à barrer.
    expect(verdict().querySelector('s')).toBeNull();
    expect(verdict().querySelector('b')?.textContent).toBe('Zevolitis');
  });

  it('choix_der_die_das', () => {
    const contexte = contexteDe('artikel');
    rendreDansUnCoursVivant(<Exercices />, contexte);

    // Trois options, dans l'ordre du contenu, numérotées ; pas de champ.
    expect(etiquette()).toBe('Artikel');
    expect(boutons().map(texteDe)).toEqual(['der', 'die', 'das']);
    expect(boutons().map((x) => x.querySelector('.mono')?.textContent)).toEqual(['1', '2', '3']);
    expect(screen.queryByLabelText(t.exercices_antwort)).toBeNull();
    expect(screen.getByText(t.exercices_hinweis)).toBeTruthy();
    const donnee = ARTIKELS[invite()];
    expect(donnee).toBeDefined();

    // Un mauvais article : la réponse est montrée suivie du mot, sans « ___ » (H:2181).
    const faux = boutons().find((x) => texteDe(x) !== donnee.reponse) as HTMLButtonElement;
    const fausse = texteDe(faux);
    fireEvent.click(faux);

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(donnee.id, false, 'choix');
    expect(verdict().className).toBe('verdict ko');
    expect(verdict().querySelector('s')?.textContent).toBe(fausse);
    expect(verdict().querySelector('b')?.textContent).toBe(
      `${donnee.reponse} ${invite().replace('___ ', '')}`,
    );
    expect(boutons()).toHaveLength(0);
    expect(document.activeElement).toBe(suivant());

    // Une question neuve, puis le bon article.
    fireEvent.click(suivant());
    const autre = ARTIKELS[invite()];
    fireEvent.click(boutons().find((x) => texteDe(x) === autre.reponse) as HTMLButtonElement);

    expect(contexte.enregistrer).toHaveBeenLastCalledWith(autre.id, true, 'choix');
    expect(verdict().className).toBe('verdict ok');
    expect(verdict().querySelector('s')).toBeNull();
    expect(verdict().querySelector('b')?.textContent).toBe(
      `${autre.reponse} ${invite().replace('___ ', '')}`,
    );
  });

  it('verdict_d_une_endung_montre_la_reponse_seule', () => {
    // L'invite ne commence pas par « ___ » : la réponse seule.
    const contexte = contexteDe('endung');
    rendreDansUnCoursVivant(<Exercices />, contexte);
    expect(invite()).toBe('Rosa ___ (die rote Blüte)');
    expect(boutons().map(texteDe)).toEqual(['rubrus', 'rubra']);

    fireEvent.click(boutons()[0]);

    expect(contexte.enregistrer).toHaveBeenCalledWith('e4000001', false, 'choix');
    expect(verdict().querySelector('s')?.textContent).toBe('rubrus');
    expect(verdict().querySelector('b')?.textContent).toBe('rubra');
  });

  it('regle_affichee_apres_reponse', () => {
    for (const [famille, regle, repondre] of [
      ['artikel', REGLE_ARTIKEL, () => fireEvent.click(boutons()[0])],
      ['schreib', '-li am Wortende → Verkleinerung', () => taper('Cevolitis')],
    ] as const) {
      const contexte = contexteDe(famille);
      rendreDansUnCoursVivant(<Exercices />, contexte);
      // Avant la réponse, la règle ne dit rien.
      expect(document.querySelector('.rule')).toBeNull();
      expect(screen.queryByText(regle)).toBeNull();

      repondre();

      // Après, juste ou faux, elle s'affiche sous le verdict, dans la carte.
      const rule = document.querySelector('.card .rule') as HTMLElement;
      expect(rule.tagName).toBe('P');
      expect(rule.textContent).toBe(regle);
      expect(rule.previousElementSibling).toBe(verdict());
      // La question suivante la cache à nouveau.
      fireEvent.click(suivant());
      expect(document.querySelector('.rule')).toBeNull();
      cleanup();
    }
  });

  it('exercice_sans_regle_n_affiche_pas_de_regle', () => {
    const contexte = contexteDe('endung');
    rendreDansUnCoursVivant(<Exercices />, contexte);

    fireEvent.click(boutons()[1]);

    expect(contexte.enregistrer).toHaveBeenCalledWith('e4000001', true, 'choix');
    expect(document.querySelector('.rule')).toBeNull();
  });

  it('touches_de_1_au_nombre_d_options_pour_un_choix_seulement', () => {
    const contexte = contexteDe('artikel');
    rendreDansUnCoursVivant(<Exercices />, contexte);
    const donnee = ARTIKELS[invite()];
    const options = boutons().map(texteDe);

    // Trois options : 0, 4 et les lettres ne répondent à rien.
    touche('0');
    touche('4');
    touche('a');
    expect(contexte.enregistrer).not.toHaveBeenCalled();

    touche('3');

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(
      donnee.id,
      options[2] === donnee.reponse,
      'choix',
    );
    // La question est répondue : les chiffres ne comptent plus.
    touche('1');
    touche('2');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    fireEvent.click(suivant());
    touche('1');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);
  });

  it('touches_sans_effet_pour_une_saisie', () => {
    const contexte = contexteDe('schreib');
    rendreDansUnCoursVivant(<Exercices />, contexte);

    touche('1');
    touche('2');

    expect(contexte.enregistrer).not.toHaveBeenCalled();
    expect(verdict()).toBeNull();
  });

  it('famille_choisie_et_retenue_dans_les_preferences', () => {
    const contexte = contexteDe('mix');
    rendreDansUnCoursVivant(<Exercices />, contexte);
    const choix = screen.getByLabelText(t.choix_exercice) as HTMLSelectElement;
    expect(choix.value).toBe('mix');
    expect(Array.from(choix.options).map((x) => [x.value, x.textContent])).toEqual([
      ['mix', 'Gemischt'],
      ['artikel', 'Artikel'],
      ['plural', 'Plural'],
      ['schreib', 'Schreibweise anpassen'],
      ['endung', 'Wörter ergänzen'],
      ['lang', 'Lange Aufgabe'],
    ]);
    // Une réponse donnée dans le mélange, puis une famille : la série repart.
    const kinds = new Set<string>();
    for (let i = 0; i < 12; i++) {
      kinds.add(etiquette());
      if (document.querySelector('.options') !== null) fireEvent.click(boutons()[0]);
      else taper('x');
      fireEvent.click(suivant());
    }
    // Le mélange tire dans toutes les familles.
    expect(kinds.size).toBeGreaterThan(2);
    expect(progression()).toMatch(/^\d+ \/ 12 richtig · /);

    fireEvent.change(choix, { target: { value: 'plural' } });

    expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
      ...contexte.preferences,
      exercices: { famille: 'plural' },
    });
    expect((screen.getByLabelText(t.choix_exercice) as HTMLSelectElement).value).toBe('plural');
    expect(etiquette()).toBe('Plural');
    expect(invite()).toMatch(/^Plural von «(Musterus|Probela)»\?$/);
    expect(progression()).toMatch(/^0 \/ 0 richtig · /);
  });

  it('un_choix_d_une_famille_ne_tire_que_dans_cette_famille', () => {
    const contexte = contexteDe('plural');
    rendreDansUnCoursVivant(<Exercices />, contexte);

    for (let i = 0; i < 8; i++) {
      expect(etiquette()).toBe('Plural');
      taper('Musteri');
      fireEvent.click(suivant());
    }
  });

  it('invite_longue_en_plus_petit', () => {
    const contexte = contexteDe('lang');
    rendreDansUnCoursVivant(<Exercices />, contexte);

    expect(invite()).toBe('Welche Endung passt zum Wort «Rosa» in diesem langen Satz?');
    expect(document.querySelector('.card .front')?.className).toBe('front long');
  });

  it('exercice_en_cours_conserve_apres_un_aller_retour_d_onglet', () => {
    const contexte = contexteDe('artikel');
    rendreDansUnCoursVivant(
      <AllerRetour>
        <Exercices />
      </AllerRetour>,
      contexte,
    );
    const question = invite();

    fireEvent.click(screen.getByTestId('ailleurs'));
    expect(document.querySelector('.card')).toBeNull();
    fireEvent.click(screen.getByTestId('retour'));
    expect(invite()).toBe(question);
    expect(boutons()).toHaveLength(3);

    // Répondu, le verdict revient avec lui, et la réponse ne compte pas deux fois.
    fireEvent.click(boutons()[0]);
    const rendu = document.querySelector('.verdict')?.textContent;
    fireEvent.click(screen.getByTestId('ailleurs'));
    fireEvent.click(screen.getByTestId('retour'));

    expect(invite()).toBe(question);
    expect(document.querySelector('.verdict')?.textContent).toBe(rendu);
    expect(boutons()).toHaveLength(0);
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(progression()).toMatch(/^[01] \/ 1 richtig/);
  });

  it('une_reponse_ne_compte_qu_une_fois', () => {
    const contexte = contexteDe('schreib');
    rendreDansUnCoursVivant(<Exercices />, contexte);

    taper('Zevolitis');
    // Le formulaire est parti : rien ne peut le renvoyer, ni la touche d'un chiffre.
    expect(document.querySelector('form.typed')).toBeNull();
    touche('1');

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
  });

  it('famille_ou_module_sans_exercice_affiche_un_etat_vide_sans_planter', () => {
    const vide: FamilleExercices = { code: 'vide', libelle: 'Leer', exercices: [] };
    for (const [famille, cours] of [
      ['vide', coursAvecFamilles([vide, SCHREIB])],
      ['mix', coursAvecFamilles([vide])],
      ['mix', coursAvecFamilles([])],
    ] as const) {
      const contexte = contexteDe(famille, cours);
      rendreDansUnCoursVivant(<Exercices />, contexte);

      expect(screen.getByText(t.onglet_vide)).toBeTruthy();
      expect(document.querySelector('.card')).toBeNull();
      expect(progression()).toMatch(/^0 \/ 0 richtig · 0 von [01] Aufgaben gekonnt$/);
      touche('1');
      expect(contexte.enregistrer).not.toHaveBeenCalled();
      cleanup();
    }

    // Revenir d'une famille vide à une famille pleine redonne une question.
    const contexte = contexteDe('vide', coursAvecFamilles([vide, SCHREIB]));
    rendreDansUnCoursVivant(<Exercices />, contexte);
    fireEvent.change(screen.getByLabelText(t.choix_exercice), { target: { value: 'schreib' } });
    expect(screen.queryByText(t.onglet_vide)).toBeNull();
    expect(invite()).toBe('«Cevolitis» mit z geschrieben?');
  });
});
