// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { Mot } from '../../../domaine/contenu/modele.js';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import { type Hasard, hasardDeterministe } from '../../../domaine/hasard.js';
import { AllerRetour, contexteDeTest, rendreDansUnCoursVivant } from '../contexte-cours.fixture.js';
import type { ContexteCours } from '../contexte-cours.js';
import type { Preferences } from '../preferences.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { Mots } from './Mots.js';
import { boutons, progression, texteDe, touche } from './onglets.fixture.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

const GASTRITIS = 'w0000001';
const TACHYKARDIE = 'w0000002';

/** Les tirages dans l'ordre donné, puis un hasard répétable pour tout le reste. */
function hasardScripte(valeurs: number[]): Hasard & { ajouter(...autres: number[]): void } {
  const suite = hasardDeterministe(7);
  const file = [...valeurs];
  const hasard = () => file.shift() ?? suite();
  return Object.assign(hasard, {
    ajouter: (...autres: number[]) => {
      file.push(...autres);
    },
  });
}

// Avec trois mots neufs (poids 3 chacun), 0 tire « Gastritis », 0,4 « Tachykardie ».
const PREMIER_MOT = 0;
const DEUXIEME_MOT = 0.4;
const ZERLEGEN = 0.2;
const BILDEN = 0.7;

function contexteDe(
  mode: Preferences['mots']['mode'],
  options: { hasard?: Hasard; cours?: CoursServi } = {},
): ContexteCours {
  const contexte = contexteDeTest({ cours: options.cours });
  contexte.preferences = { ...contexte.preferences, mots: { mode } };
  if (options.hasard !== undefined) contexte.hasard = options.hasard;
  return contexte;
}

function coursSansMots(): CoursServi {
  const servi = coursServiDeTest();
  return {
    ...servi,
    modules: servi.modules.map((module) =>
      module.type === 'morphologie' ? { ...module, mots: [] } : module,
    ),
  };
}

function morphemes(contexte: ContexteCours) {
  return contexte.cours.morphologie?.morphemes ?? [];
}

function mots(contexte: ContexteCours): Mot[] {
  return contexte.cours.morphologie?.mots ?? [];
}

function sensDuMorpheme(contexte: ContexteCours, id: string): string {
  return morphemes(contexte).find((morpheme) => morpheme.id === id)?.sens ?? '';
}

function segments(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.word .seg'));
}

/** Le mot que « Wörter zerlegen » montre, reconnu à ses segments. */
function motZerlege(contexte: ContexteCours): Mot {
  const ecrit = segments()
    .map((segment) => segment.childNodes[0]?.textContent ?? '')
    .join('');
  const mot = mots(contexte).find((x) => x.mot === ecrit);
  if (mot === undefined) throw new Error(`Aucun mot « ${ecrit} »`);
  return mot;
}

/** Le mot que « Wörter bilden » demande, reconnu à son sens. */
function motABatir(contexte: ContexteCours): Mot {
  const sens = document.querySelector('.card .front')?.textContent ?? '';
  const mot = mots(contexte).find((x) => `«${x.sens}»` === sens);
  if (mot === undefined) throw new Error(`Aucun mot pour ${sens}`);
  return mot;
}

function tuiles(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.tiles .tile'));
}

function tuile(forme: string): HTMLButtonElement {
  const trouvee = tuiles().find((x) => x.textContent === forme);
  if (trouvee === undefined) throw new Error(`Aucune tuile « ${forme} »`);
  return trouvee;
}

function emplacements(): string[] {
  return Array.from(document.querySelectorAll('.slots .tile')).map((x) => x.textContent ?? '');
}

/** Choisit, à chaque partie, le bon sens. */
function zerlegerJuste(contexte: ContexteCours, mot: Mot): void {
  for (const segment of mot.segments) {
    const bon = boutons().find((x) => texteDe(x) === sensDuMorpheme(contexte, segment.morpheme));
    if (bon === undefined) throw new Error(`Pas d'option pour ${segment.texte}`);
    fireEvent.click(bon);
  }
}

describe('Mots', () => {
  it('zerlegen_un_choix_par_segment_puis_mot_journalise', () => {
    const contexte = contexteDe('zerlegen', { hasard: hasardScripte([PREMIER_MOT]) });
    rendreDansUnCoursVivant(<Mots />, contexte);

    // Gastr · itis : une partie à la fois, la première est en cours.
    expect(motZerlege(contexte).id).toBe(GASTRITIS);
    expect(document.querySelector('.card .kind')?.textContent).toBe('Wort zerlegen · Teil 1 von 2');
    expect(segments().map((x) => x.className)).toEqual(['seg cur', 'seg']);
    expect(document.querySelector('.card p')?.textContent).toBe('Was bedeutet gastr (Wortstamm)?');
    expect(document.querySelector('.card p b.mono')?.textContent).toBe('gastr');
    expect(progression()).toBe('0 / 0 richtig · 0 von 3 Wörtern geschafft');
    expect(screen.getByText(t.mots_touches)).toBeTruthy();
    // Quatre sens de même catégorie (Wortstamm), le bon parmi eux, sans doublon.
    const options = boutons().map(texteDe);
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
    expect(options).toContain('Magen');
    expect(boutons().map((x) => x.querySelector('.mono')?.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);

    // Le bon sens : la partie passe en vert avec son sens en dessous, la suivante est en cours.
    fireEvent.click(boutons().find((x) => texteDe(x) === 'Magen') as HTMLButtonElement);
    expect(segments().map((x) => x.className)).toEqual(['seg ok', 'seg cur']);
    expect(segments()[0].querySelector('small')?.textContent).toBe('Magen');
    expect(segments()[1].querySelector('small')).toBeNull();
    expect(document.querySelector('.card .kind')?.textContent).toBe('Wort zerlegen · Teil 2 von 2');
    expect(document.querySelector('.card p')?.textContent).toBe('Was bedeutet -itis (Suffix)?');
    // Les options sont celles de la partie suivante, d'un autre type.
    expect(boutons().map(texteDe)).toContain('Entzündung');
    // Le mot n'est journalisé qu'à la fin : une partie ne produit rien.
    expect(contexte.enregistrer).not.toHaveBeenCalled();

    fireEvent.click(boutons().find((x) => texteDe(x) === 'Entzündung') as HTMLButtonElement);

    // Le mot est fini : sa signification, « Nächstes Wort », un seul événement pour le mot.
    expect(segments().map((x) => x.className)).toEqual(['seg ok', 'seg ok']);
    expect(document.querySelector('.card .back')?.textContent).toBe(
      'Gastritis = Schmerz im Oberbauch',
    );
    expect(document.querySelector('.card .back b')?.textContent).toBe('Gastritis');
    expect(document.querySelector('.card .kind')?.textContent).toBe('Wort zerlegen · Teil 2 von 2');
    expect(boutons()).toHaveLength(0);
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(GASTRITIS, true, 'choix');
    expect(progression()).toBe('1 / 1 richtig · 1 von 3 Wörtern geschafft');
    const suivant = screen.getByRole('button', { name: t.mots_naechstes });
    expect(document.activeElement).toBe(suivant);

    // Un mot neuf : sa première partie est en cours, la série se poursuit.
    fireEvent.click(suivant);
    expect(screen.queryByRole('button', { name: t.mots_naechstes })).toBeNull();
    expect(segments()[0].className).toBe('seg cur');
    expect(progression()).toBe('1 / 1 richtig · 1 von 3 Wörtern geschafft');
    expect(boutons()).toHaveLength(4);
  });

  it('zerlegen_une_partie_fausse_journalise_le_mot_faux', () => {
    const contexte = contexteDe('zerlegen', { hasard: hasardScripte([DEUXIEME_MOT]) });
    rendreDansUnCoursVivant(<Mots />, contexte);
    const mot = motZerlege(contexte);
    expect(mot.id).toBe(TACHYKARDIE);
    expect(segments()).toHaveLength(3);

    // Tachy- faux, kard juste, -ie juste : le mot est faux, et le reste est coloré en conséquence.
    const faux = boutons().find((x) => texteDe(x) !== 'schnell') as HTMLButtonElement;
    fireEvent.click(faux);
    expect(segments()[0].className).toBe('seg ko');
    expect(segments()[0].querySelector('small')?.textContent).toBe('schnell');
    fireEvent.click(boutons().find((x) => texteDe(x) === 'Herz') as HTMLButtonElement);
    expect(segments().map((x) => x.className)).toEqual(['seg ko', 'seg ok', 'seg cur']);
    fireEvent.click(boutons().find((x) => texteDe(x) === 'Zustand') as HTMLButtonElement);

    expect(segments().map((x) => x.className)).toEqual(['seg ko', 'seg ok', 'seg ok']);
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(TACHYKARDIE, false, 'choix');
    expect(progression()).toBe('0 / 1 richtig · 0 von 3 Wörtern geschafft');
  });

  it('bilden_tuiles_dans_l_ordre_juste', () => {
    const contexte = contexteDe('bilden', { hasard: hasardScripte([PREMIER_MOT]) });
    rendreDansUnCoursVivant(<Mots />, contexte);

    expect(motABatir(contexte).id).toBe(GASTRITIS);
    expect(document.querySelector('.card .kind')?.textContent).toBe(t.mots_bilden);
    expect(document.querySelector('.card .front')?.className).toBe('front long');
    expect(document.querySelector('.card .front')?.textContent).toBe('«Schmerz im Oberbauch»');
    // Le mot vide : son indice, et les deux boutons attendent une tuile.
    expect(screen.getByText(t.mots_indice_tuiles)).toBeTruthy();
    expect(emplacements()).toEqual([]);
    expect(
      (screen.getByRole('button', { name: t.mots_retirer }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect((screen.getByRole('button', { name: t.pruefen }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    // Les morphèmes du mot, plus deux au hasard de chaque catégorie.
    expect(tuiles()).toHaveLength(8);
    expect(tuile('gastr').getAttribute('data-t')).toBe('s');
    expect(tuile('-itis').getAttribute('data-t')).toBe('x');
    expect(tuiles().filter((x) => x.getAttribute('data-t') === 'p')).toHaveLength(2);
    expect(boutons()).toHaveLength(0);

    // Dans l'ordre : chaque tuile choisie s'installe dans le mot et se désactive.
    fireEvent.click(tuile('gastr'));
    expect(emplacements()).toEqual(['gastr']);
    expect(tuile('gastr').disabled).toBe(true);
    expect(screen.queryByText(t.mots_indice_tuiles)).toBeNull();
    fireEvent.click(tuile('-itis'));
    expect(emplacements()).toEqual(['gastr', '-itis']);
    expect((screen.getByRole('button', { name: t.pruefen }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(contexte.enregistrer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: t.pruefen }));

    // Le verdict : les segments du mot, le sens de chaque morphème, une seule réponse journalisée.
    const verdict = document.querySelector('.verdict') as HTMLElement;
    expect(verdict.className).toBe('verdict ok');
    expect(verdict.querySelector('span')?.textContent).toBe(t.verdict_juste);
    expect(verdict.querySelector('b')?.textContent).toBe('Gastr·itis');
    expect(verdict.querySelector('span.muted')?.textContent).toBe(
      'gastr = Magen · -itis = Entzündung',
    );
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(GASTRITIS, true, 'assemblage');
    expect(progression()).toBe('1 / 1 richtig · 1 von 3 Wörtern geschafft');
    // Plus de tuile ni de bouton à manipuler : « Nächstes Wort » a le focus.
    expect(tuiles()).toHaveLength(0);
    expect(screen.queryByRole('button', { name: t.pruefen })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: t.mots_naechstes }));
    // La légende des couleurs accompagne les tuiles.
    expect(Array.from(document.querySelectorAll('.legend span')).map((x) => x.textContent)).toEqual(
      [t.mots_prefixe, t.mots_radical, t.mots_suffixe],
    );
  });

  it('bilden_dans_le_mauvais_ordre_journalise_faux', () => {
    const contexte = contexteDe('bilden', { hasard: hasardScripte([PREMIER_MOT]) });
    rendreDansUnCoursVivant(<Mots />, contexte);

    fireEvent.click(tuile('-itis'));
    fireEvent.click(tuile('gastr'));
    fireEvent.click(screen.getByRole('button', { name: t.pruefen }));

    const verdict = document.querySelector('.verdict') as HTMLElement;
    expect(verdict.className).toBe('verdict ko');
    expect(verdict.querySelector('span')?.textContent).toBe(t.mots_nicht_ganz);
    // La bonne composition est montrée, pas celle de la personne.
    expect(verdict.querySelector('b')?.textContent).toBe('Gastr·itis');
    expect(contexte.enregistrer).toHaveBeenCalledWith(GASTRITIS, false, 'assemblage');
    expect(progression()).toBe('0 / 1 richtig · 0 von 3 Wörtern geschafft');
  });

  it('bilden_un_mot_trop_court_est_faux', () => {
    const contexte = contexteDe('bilden', { hasard: hasardScripte([DEUXIEME_MOT]) });
    rendreDansUnCoursVivant(<Mots />, contexte);
    expect(motABatir(contexte).id).toBe(TACHYKARDIE);

    fireEvent.click(tuile('tachy-'));
    fireEvent.click(tuile('kard'));
    fireEvent.click(screen.getByRole('button', { name: t.pruefen }));

    expect(contexte.enregistrer).toHaveBeenCalledWith(TACHYKARDIE, false, 'assemblage');
    expect(document.querySelector('.verdict b')?.textContent).toBe('Tachy·kard·ie');
  });

  it('letzten_entfernen', () => {
    const contexte = contexteDe('bilden', { hasard: hasardScripte([PREMIER_MOT]) });
    rendreDansUnCoursVivant(<Mots />, contexte);
    const retirer = () => screen.getByRole('button', { name: t.mots_retirer }) as HTMLButtonElement;

    fireEvent.click(tuile('gastr'));
    fireEvent.click(tuile('-itis'));
    expect(emplacements()).toEqual(['gastr', '-itis']);

    // La dernière tuile revient parmi les tuiles libres.
    fireEvent.click(retirer());
    expect(emplacements()).toEqual(['gastr']);
    expect(tuile('-itis').disabled).toBe(false);
    expect(tuile('gastr').disabled).toBe(true);
    expect(retirer().disabled).toBe(false);

    fireEvent.click(retirer());
    expect(emplacements()).toEqual([]);
    expect(screen.getByText(t.mots_indice_tuiles)).toBeTruthy();
    expect(tuile('gastr').disabled).toBe(false);
    expect(retirer().disabled).toBe(true);
    expect((screen.getByRole('button', { name: t.pruefen }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    // Rien n'a été journalisé en construisant.
    expect(contexte.enregistrer).not.toHaveBeenCalled();
  });

  it('mix_tire_au_hasard_entre_zerlegen_et_bilden', () => {
    // Le mot (premier tirage), puis le mode : sous 0,5 on zerlege, sinon on bâtit (H:1873).
    const zerlegen = contexteDe('mix', { hasard: hasardScripte([PREMIER_MOT, ZERLEGEN]) });
    rendreDansUnCoursVivant(<Mots />, zerlegen);
    expect(document.querySelector('.card .kind')?.textContent).toBe('Wort zerlegen · Teil 1 von 2');
    expect(document.querySelector('.tiles')).toBeNull();
    cleanup();

    const bilden = contexteDe('mix', { hasard: hasardScripte([PREMIER_MOT, BILDEN]) });
    rendreDansUnCoursVivant(<Mots />, bilden);
    expect(document.querySelector('.card .kind')?.textContent).toBe(t.mots_bilden);
    expect(document.querySelector('.options')).toBeNull();
    expect(tuiles().length).toBeGreaterThan(0);
  });

  it('mix_retire_un_nouveau_mode_a_chaque_mot', () => {
    // Zerlegen, puis un mot suivant à bâtir : le mode se tire à chaque mot.
    const hasard = hasardScripte([PREMIER_MOT, ZERLEGEN]);
    const contexte = contexteDe('mix', { hasard });
    rendreDansUnCoursVivant(<Mots />, contexte);
    zerlegerJuste(contexte, motZerlege(contexte));
    hasard.ajouter(DEUXIEME_MOT, BILDEN);
    fireEvent.click(screen.getByRole('button', { name: t.mots_naechstes }));

    expect(document.querySelector('.card .kind')?.textContent).toBe(t.mots_bilden);
    expect(motABatir(contexte).id).toBe(TACHYKARDIE);
  });

  it('choix_de_l_exercice_retenu_dans_les_preferences', () => {
    const contexte = contexteDe('mix', { hasard: hasardScripte([PREMIER_MOT, ZERLEGEN]) });
    rendreDansUnCoursVivant(<Mots />, contexte);
    const choix = screen.getByLabelText(t.choix_exercice) as HTMLSelectElement;
    expect(choix.value).toBe('mix');
    expect(Array.from(choix.options).map((x) => [x.value, x.textContent])).toEqual([
      ['mix', 'Gemischt'],
      ['zerlegen', 'Wörter zerlegen'],
      ['bilden', 'Wörter bilden'],
    ]);
    // Une réponse donnée, puis un autre choix : la série repart.
    fireEvent.click(boutons()[0]);

    fireEvent.change(choix, { target: { value: 'bilden' } });

    expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
      ...contexte.preferences,
      mots: { mode: 'bilden' },
    });
    expect((screen.getByLabelText(t.choix_exercice) as HTMLSelectElement).value).toBe('bilden');
    expect(document.querySelector('.card .kind')?.textContent).toBe(t.mots_bilden);
    expect(progression()).toBe('0 / 0 richtig · 0 von 3 Wörtern geschafft');
  });

  it('touches_1_a_4_choisissent_une_partie_seulement_en_zerlegen', () => {
    const contexte = contexteDe('zerlegen', { hasard: hasardScripte([PREMIER_MOT]) });
    rendreDansUnCoursVivant(<Mots />, contexte);
    const mot = motZerlege(contexte);

    // Hors de 1 à 4, rien.
    touche('5');
    touche('0');
    touche('a');
    expect(segments()[0].className).toBe('seg cur');

    // La touche 2 choisit la deuxième option.
    const juste = boutons().findIndex(
      (x) => texteDe(x) === sensDuMorpheme(contexte, mot.segments[0].morpheme),
    );
    touche(String(juste + 1));
    expect(segments().map((x) => x.className)).toEqual(['seg ok', 'seg cur']);
    const bonne = boutons().findIndex(
      (x) => texteDe(x) === sensDuMorpheme(contexte, mot.segments[1].morpheme),
    );
    touche(String(bonne + 1));
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(mot.id, true, 'choix');
    // Un mot fini n'écoute plus les chiffres.
    touche('1');
    touche('2');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
  });

  it('touches_sans_effet_pour_bilden', () => {
    const contexte = contexteDe('bilden', { hasard: hasardScripte([PREMIER_MOT]) });
    rendreDansUnCoursVivant(<Mots />, contexte);

    touche('1');
    touche('2');

    expect(emplacements()).toEqual([]);
    expect(contexte.enregistrer).not.toHaveBeenCalled();
  });

  it('mot_en_cours_conserve_apres_un_aller_retour_d_onglet', () => {
    const contexte = contexteDe('zerlegen', { hasard: hasardScripte([DEUXIEME_MOT]) });
    rendreDansUnCoursVivant(
      <AllerRetour>
        <Mots />
      </AllerRetour>,
      contexte,
    );
    zerlegerJuste(contexte, {
      ...motZerlege(contexte),
      segments: motZerlege(contexte).segments.slice(0, 1),
    });
    const options = boutons().map(texteDe);

    fireEvent.click(screen.getByTestId('ailleurs'));
    expect(document.querySelector('.word')).toBeNull();
    fireEvent.click(screen.getByTestId('retour'));

    // Le même mot, à la même partie, avec les mêmes options et sans nouvel événement.
    expect(motZerlege(contexte).id).toBe(TACHYKARDIE);
    expect(segments().map((x) => x.className)).toEqual(['seg ok', 'seg cur', 'seg']);
    expect(boutons().map(texteDe)).toEqual(options);
    expect(contexte.enregistrer).not.toHaveBeenCalled();
  });

  it('mot_a_batir_conserve_apres_un_aller_retour_d_onglet', () => {
    const contexte = contexteDe('bilden', { hasard: hasardScripte([PREMIER_MOT]) });
    rendreDansUnCoursVivant(
      <AllerRetour>
        <Mots />
      </AllerRetour>,
      contexte,
    );
    const libres = tuiles().map((x) => x.textContent);
    fireEvent.click(tuile('gastr'));

    fireEvent.click(screen.getByTestId('ailleurs'));
    fireEvent.click(screen.getByTestId('retour'));

    expect(emplacements()).toEqual(['gastr']);
    expect(tuiles().map((x) => x.textContent)).toEqual(libres);
    expect(tuile('gastr').disabled).toBe(true);
  });

  it('module_sans_mot_affiche_un_etat_vide_sans_planter', () => {
    for (const mode of ['mix', 'zerlegen', 'bilden'] as const) {
      const contexte = contexteDe(mode, { cours: coursSansMots() });
      rendreDansUnCoursVivant(<Mots />, contexte);

      expect(screen.getByText(t.onglet_vide)).toBeTruthy();
      expect(progression()).toBe('0 / 0 richtig · 0 von 0 Wörtern geschafft');
      expect(document.querySelector('.card')).toBeNull();
      expect(boutons()).toHaveLength(0);
      touche('1');
      expect(contexte.enregistrer).not.toHaveBeenCalled();
      cleanup();
    }
  });
});
