// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import { hasardDeterministe } from '../../../domaine/hasard.js';
import { elementsTirables, GENRES_FERMES } from '../../../domaine/seances/feuilles.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { boutons, texteDe, touche } from '../onglets/onglets.fixture.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { QuestionAChoix, type QuestionDeChoix, questionDeLElement } from './QuestionAChoix.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

function question(choisie: number | null = null): QuestionDeChoix {
  return {
    id: 'c1000001',
    reponse: 'Vier',
    enonce: { texte: 'Wie viele Kammern hat das Herz?' },
    options: ['Zwei', 'Vier', 'Sechs'],
    choisie,
  };
}

function poser(q: QuestionDeChoix, onChoix = vi.fn(), onSuivante = vi.fn()) {
  rendreDansLeCours(
    <QuestionAChoix
      question={q}
      libelleSuivante="Weiter"
      onChoix={onChoix}
      onSuivante={onSuivante}
    />,
    contexteDeTest(),
  );
  return { onChoix, onSuivante };
}

describe('QuestionAChoix', () => {
  it('le_bon_choix_appelle_onChoix_juste', () => {
    const { onChoix } = poser(question());
    expect(screen.getByText(t.quiz_touches)).toBeTruthy();
    fireEvent.click(boutons().find((b) => texteDe(b) === 'Vier') as HTMLButtonElement);
    expect(onChoix).toHaveBeenCalledTimes(1);
    expect(onChoix).toHaveBeenCalledWith(1, true, 'choix');
  });

  it('un_mauvais_choix_appelle_onChoix_faux_et_les_touches_choisissent', () => {
    const { onChoix } = poser(question());
    touche('1');
    expect(onChoix).toHaveBeenLastCalledWith(0, false, 'choix');
    touche('2');
    expect(onChoix).toHaveBeenLastCalledWith(1, true, 'choix');
    touche('4');
    expect(onChoix).toHaveBeenCalledTimes(2);
  });

  it('une_question_repondue_ne_repond_plus_et_montre_la_suite', () => {
    const { onChoix, onSuivante } = poser(question(0));
    fireEvent.click(boutons()[1]);
    touche('2');
    expect(onChoix).not.toHaveBeenCalled();
    expect(screen.queryByText(t.quiz_touches)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(onSuivante).toHaveBeenCalledTimes(1);
  });

  it('questionDeLElement_reprend_l_id_la_reponse_et_les_options_de_l_element', () => {
    const cours = coursServiDeTest();
    const tirables = elementsTirables(
      cours.modules.flatMap((m) => (m.type === 'feuille' ? [m] : [])),
      GENRES_FERMES,
    );
    expect(tirables.length).toBeGreaterThan(0);
    for (const { element } of tirables) {
      const q = questionDeLElement(element, hasardDeterministe(1));
      expect(q.choisie).toBeNull();
      expect('texte' in q.enonce).toBe(true);
      expect(q.options).toContain(q.reponse);
      expect(q.id).toBe(element.genre === 'qcm' ? element.question.id : element.affirmation.id);
    }
  });
});
