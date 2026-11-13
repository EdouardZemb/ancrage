// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Exercice, FamilleExercices } from '../../../domaine/contenu/modele.js';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { boutons, texteDe, touche } from '../onglets/onglets.fixture.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { QuestionDExercice, type ReponseDExercice } from './QuestionDExercice.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;
const module = contexteDeTest().cours.exercices as ModuleServiDe<'exercices'>;
const ARTICLES = module.familles[0];
const PLURAL = module.familles[1];
const A_OPTIONS = ARTICLES.exercices[0];
const A_SAISIE = PLURAL.exercices[0];

function poser(
  famille: FamilleExercices,
  exercice: Exercice,
  reponse: ReponseDExercice | null = null,
) {
  const onReponse = vi.fn();
  const onSuivante = vi.fn();
  rendreDansLeCours(
    <QuestionDExercice
      famille={famille}
      exercice={exercice}
      reponse={reponse}
      onReponse={onReponse}
      onSuivante={onSuivante}
    />,
    contexteDeTest(),
  );
  return { onReponse, onSuivante };
}

function repondreParSaisie(valeur: string) {
  const champ = screen.getByRole('textbox');
  fireEvent.input(champ, { target: { value: valeur } });
  fireEvent.submit(champ.closest('form') as HTMLFormElement);
}

describe('QuestionDExercice', () => {
  it('un_exercice_a_options_appelle_onReponse_avec_le_verdict_et_la_reponse_donnee', () => {
    const { onReponse } = poser(ARTICLES, A_OPTIONS);
    expect(screen.getByText(t.exercices_hinweis)).toBeTruthy();
    fireEvent.click(boutons().find((b) => texteDe(b) === 'der') as HTMLButtonElement);
    expect(onReponse).toHaveBeenCalledTimes(1);
    expect(onReponse).toHaveBeenCalledWith({ juste: true, donnee: 'der' }, 'choix');
    fireEvent.click(boutons().find((b) => texteDe(b) === 'das') as HTMLButtonElement);
    expect(onReponse).toHaveBeenLastCalledWith({ juste: false, donnee: 'das' }, 'choix');
  });

  it('les_touches_choisissent_l_option_de_meme_rang', () => {
    const { onReponse } = poser(ARTICLES, A_OPTIONS);
    touche('2');
    expect(onReponse).toHaveBeenCalledWith({ juste: false, donnee: 'die' }, 'choix');
  });

  it('un_exercice_a_saisie_juge_a_la_graphie_exacte', () => {
    const { onReponse } = poser(PLURAL, A_SAISIE);
    expect(boutons()).toHaveLength(0);
    repondreParSaisie('Musteris');
    expect(onReponse).toHaveBeenCalledTimes(1);
    expect(onReponse).toHaveBeenCalledWith({ juste: false, donnee: 'Musteris' }, 'saisie');
  });

  it('un_exercice_a_saisie_juste_appelle_onReponse_juste', () => {
    const { onReponse } = poser(PLURAL, A_SAISIE);
    repondreParSaisie('Musteri');
    expect(onReponse).toHaveBeenCalledWith({ juste: true, donnee: 'Musteri' }, 'saisie');
  });

  it('repondu_montre_le_verdict_complete_l_article_et_ne_repond_plus', () => {
    const { onReponse, onSuivante } = poser(ARTICLES, A_OPTIONS, { juste: false, donnee: 'das' });
    expect(screen.getByText(t.verdict_fausse)).toBeTruthy();
    expect(screen.getByText('das')).toBeTruthy();
    expect(screen.getByText('der Musterus')).toBeTruthy();
    expect(boutons()).toHaveLength(0);
    touche('1');
    expect(onReponse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t.suivante }));
    expect(onSuivante).toHaveBeenCalledTimes(1);
  });
});
