// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuestionAChoix as QuestionDeQcm } from '../../../domaine/contenu/modele.js';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import { FAUX, VRAI } from '../../../domaine/feuilles/correction.js';
import { hasardDeterministe } from '../../../domaine/hasard.js';
import { elementsTirables, GENRES_FERMES } from '../../../domaine/seances/feuilles.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { boutons, texteDe, touche } from '../onglets/onglets.fixture.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { QuestionAChoix, type QuestionDeChoix, questionDeLElement } from './QuestionAChoix.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;
const AIDE = 'Eine Merkhilfe zum Testen.';
const EXPLICATION = 'Das Herz des Murmelkrats hat vier Kammern.';
const EXPLICATION_DU_CHOIX = 'Zwei Kammern hat nur der Grunwurm.';

/** Le modèle de `question()` : même question, même réponse, ses explications. */
const QCM: QuestionDeQcm = {
  id: 'c1000001',
  question: 'Wie viele Kammern hat das Herz?',
  reponse: 'Vier',
  distracteurs: ['Zwei', 'Sechs', 'Acht'],
  explication: EXPLICATION,
  explicationsDistracteurs: { Zwei: EXPLICATION_DU_CHOIX },
  statut: 'source',
};

function question(choisie: number | null = null): QuestionDeChoix {
  return {
    id: 'c1000001',
    reponse: 'Vier',
    enonce: { texte: 'Wie viele Kammern hat das Herz?' },
    options: ['Zwei', 'Vier', 'Sechs'],
    choisie,
  };
}

function poser(
  q: QuestionDeChoix,
  onChoix = vi.fn(),
  onSuivante = vi.fn(),
  sansFaute = false,
  extra: { aide?: string; rebelle?: boolean; qcm?: QuestionDeQcm } = {},
) {
  rendreDansLeCours(
    <QuestionAChoix
      question={q}
      sansFaute={sansFaute}
      aide={extra.aide}
      rebelle={extra.rebelle}
      qcm={extra.qcm}
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

  it('un_mauvais_choix_est_rouge_sans_sansFaute_et_neutre_avec', () => {
    poser(question(0));
    expect(boutons().map((b) => b.className)).toEqual(['wrong', 'right', '']);
    cleanup();
    poser(question(0), vi.fn(), vi.fn(), true);
    expect(boutons().map((b) => b.className)).toEqual(['sel', 'right', '']);
    cleanup();
    // Un bon choix reste vert, et une question sans réponse n'a aucune classe.
    poser(question(1), vi.fn(), vi.fn(), true);
    expect(boutons().map((b) => b.className)).toEqual(['', 'right', '']);
  });

  it('sans_faute_la_bonne_option_se_dit_aux_lecteurs_d_ecran_et_le_choix_faux_prend_le_style_neutre', () => {
    poser(question(0), vi.fn(), vi.fn(), true);
    expect(boutons().map((b) => b.getAttribute('aria-label'))).toEqual([
      null,
      expect.stringContaining(t.heute_pretest_richtig),
      null,
    ]);
    expect(document.querySelector('.options')?.classList.contains('sansfaute')).toBe(true);
    cleanup();
    // Hors pré-test, rien n'est ajouté : ni libellé, ni classe.
    poser(question(0));
    expect(boutons().map((b) => b.getAttribute('aria-label'))).toEqual([null, null, null]);
    expect(document.querySelector('.options')?.className).toBe('options');
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
  it('une_faute_montre_l_aide_sans_etre_rebelle', () => {
    poser(question(0), vi.fn(), vi.fn(), false, { aide: AIDE });
    expect(boutons().map((b) => b.className)).toEqual(['wrong', 'right', '']);
    expect(screen.getByText(t.aide_titre)).toBeTruthy();
    expect(screen.getByText(AIDE)).toBeTruthy();
  });

  it('une_reponse_juste_ne_montre_pas_l_aide_sauf_a_un_rebelle', () => {
    poser(question(1), vi.fn(), vi.fn(), false, { aide: AIDE });
    expect(boutons().map((b) => b.className)).toEqual(['', 'right', '']);
    expect(document.querySelector('.aide')).toBeNull();
    cleanup();
    poser(question(1), vi.fn(), vi.fn(), false, { aide: AIDE, rebelle: true });
    expect(boutons().map((b) => b.className)).toEqual(['', 'right', '']);
    expect(screen.getByText(AIDE)).toBeTruthy();
  });

  it('l_aide_attend_la_reponse', () => {
    for (const rebelle of [false, true]) {
      cleanup();
      poser(question(), vi.fn(), vi.fn(), false, { aide: AIDE, rebelle });
      expect(screen.getByText(t.quiz_touches)).toBeTruthy();
      expect(document.querySelector('.aide')).toBeNull();
      expect(screen.queryByText(AIDE)).toBeNull();
    }
  });

  it('sans_aide_rien_ne_s_affiche_apres_une_faute', () => {
    poser(question(0));
    expect(boutons().map((b) => b.className)).toEqual(['wrong', 'right', '']);
    expect(document.querySelector('.aide')).toBeNull();
    cleanup();
    poser(question(0), vi.fn(), vi.fn(), false, { aide: '' });
    expect(boutons().map((b) => b.className)).toEqual(['wrong', 'right', '']);
    expect(document.querySelector('.aide')).toBeNull();
  });

  it('un_qcm_faux_montre_l_explication_du_choix_puis_celle_de_la_reponse_et_l_annonce', () => {
    poser(question(0), vi.fn(), vi.fn(), false, { qcm: QCM });
    expect(boutons().map((b) => b.className)).toEqual(['wrong', 'right', '']);
    const bloc = document.querySelector('.explication[role="status"]') as HTMLElement;
    expect(bloc).toBeTruthy();
    expect(Array.from(bloc.querySelectorAll('p')).map((p) => p.textContent)).toEqual([
      EXPLICATION_DU_CHOIX,
      EXPLICATION,
    ]);
    const apres = Node.DOCUMENT_POSITION_FOLLOWING;
    const options = document.querySelector('.options') as HTMLElement;
    const suite = screen.getByRole('button', { name: 'Weiter' });
    expect(options.compareDocumentPosition(bloc) & apres).toBeTruthy();
    expect(bloc.compareDocumentPosition(suite) & apres).toBeTruthy();
  });

  it('un_qcm_juste_ne_montre_l_explication_qu_a_un_rebelle', () => {
    poser(question(1), vi.fn(), vi.fn(), false, { qcm: QCM });
    expect(boutons().map((b) => b.className)).toEqual(['', 'right', '']);
    expect(document.querySelector('.explication')).toBeNull();
    cleanup();
    poser(question(1), vi.fn(), vi.fn(), false, { qcm: QCM, rebelle: true });
    expect(boutons().map((b) => b.className)).toEqual(['', 'right', '']);
    const bloc = document.querySelector('.explication') as HTMLElement;
    expect(Array.from(bloc.querySelectorAll('p')).map((p) => p.textContent)).toEqual([EXPLICATION]);
  });

  it('l_explication_attend_la_reponse_meme_d_un_rebelle', () => {
    poser(question(), vi.fn(), vi.fn(), false, { qcm: QCM, rebelle: true });
    expect(screen.getByText(t.quiz_touches)).toBeTruthy();
    expect(document.querySelector('.explication')).toBeNull();
  });

  it('sans_qcm_rien_ne_s_explique', () => {
    poser(question(0));
    expect(boutons().map((b) => b.className)).toEqual(['wrong', 'right', '']);
    expect(document.querySelector('.explication')).toBeNull();
    expect(screen.queryByText(t.explication_titre)).toBeNull();
  });

  it('un_vrai_faux_en_codes_montre_sa_correction_apres_une_faute', () => {
    const vraiFaux = (choisie: number | null): QuestionDeChoix => ({
      id: 'c1000002',
      reponse: FAUX,
      enonce: { texte: 'Die Milz filtert das Blut.' },
      options: [VRAI, FAUX],
      choisie,
    });
    const CORRECTION = 'Eine Korrektur zum Testen.';
    poser(vraiFaux(0), vi.fn(), vi.fn(), false, { aide: CORRECTION });
    expect(boutons().map((b) => texteDe(b))).toEqual([t.feuille_richtig, t.feuille_falsch]);
    expect(boutons().map((b) => b.className)).toEqual(['wrong', 'right']);
    expect(screen.getByText(CORRECTION)).toBeTruthy();
    cleanup();
    poser(vraiFaux(1), vi.fn(), vi.fn(), false, { aide: CORRECTION });
    expect(boutons().map((b) => b.className)).toEqual(['', 'right']);
    expect(screen.queryByText(CORRECTION)).toBeNull();
  });
});
