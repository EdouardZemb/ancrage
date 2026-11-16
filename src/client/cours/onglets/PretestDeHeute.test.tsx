// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAPITRE_2, coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import { preparerCours } from '../../../domaine/cours/prepare.js';
import { hasardDeterministe } from '../../../domaine/hasard.js';
import { type PretestPropose, questionsDuPretest } from '../../../domaine/seances/pretest.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { formater, TEXTES_COURS } from '../textes-cours.js';
import { boutons, texteDe } from './onglets.fixture.js';
import { demarrerPretest, type EtatDuPretest, PretestDeHeute } from './PretestDeHeute.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

/* CHAPITRE_2 du cours de test : 5 cartes, `c2000001` à `c2000005`, au sens direct. */
const cours = preparerCours(coursServiDeTest());
const etape = { titre: 'Woche 2', semaine: 2, genre: 'cours' as const, modules: [CHAPITRE_2] };
const pool = cours.unites.filter(({ module, sens }) => module === CHAPITRE_2 && sens === 'direct');
const propose: PretestPropose = { etape, neuves: pool, pool };

function etatDe(options: Partial<EtatDuPretest> = {}): EtatDuPretest {
  return { ...demarrerPretest(propose, cours, hasardDeterministe(3)), ...options };
}

/** Le pré-test rendu seul : l'état donné, et l'espion de `changer`. */
function poser(etat: EtatDuPretest) {
  const contexte = contexteDeTest();
  const changer = vi.fn();
  rendreDansLeCours(<PretestDeHeute etat={etat} changer={changer} />, contexte);
  return { contexte, changer };
}

function bonne(etat: EtatDuPretest): string {
  return etat.questions[etat.rang]?.reponse ?? '';
}

describe('PretestDeHeute', () => {
  it('demarrer_pretest_cinq_questions_au_sens_direct_figees', () => {
    const etat = demarrerPretest(propose, cours, hasardDeterministe(3));
    const attendues = questionsDuPretest(propose, cours.index, hasardDeterministe(3));

    expect(etat).toMatchObject({ etape: 'Woche 2', rang: 0, faites: 0 });
    expect(etat.questions).toHaveLength(5);
    expect(etat.questions).toEqual(
      attendues.map(({ unite, options }) => ({
        id: unite.id,
        reponse: unite.reponse,
        enonce: { unite },
        options,
        choisie: null,
      })),
    );
    expect(new Set(etat.questions.map(({ id }) => id)).size).toBe(5);
    for (const question of etat.questions) {
      expect(question.options).toContain(question.reponse);
      expect('unite' in question.enonce && question.enonce.unite.sens).toBe('direct');
    }
  });

  it('une_question_montre_son_rang_la_carte_et_les_options', () => {
    const etat = etatDe({ rang: 2, faites: 2 });
    poser(etat);

    expect(screen.getByText(formater(t.heute_pretest_frage, { i: 3, n: 5 }))).toBeTruthy();
    expect(boutons().map(texteDe)).toEqual(etat.questions[2]?.options);
    expect(screen.queryByText(t.heute_pretest_danach)).toBeNull();
  });

  it('une_reponse_de_pretest_s_enregistre_sous_le_mode_pretest', () => {
    const etat = etatDe();
    const { contexte, changer } = poser(etat);
    fireEvent.click(boutons().find((b) => texteDe(b) !== bonne(etat)) as HTMLButtonElement);

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(etat.questions[0]?.id, false, 'pretest');
    // Un geste, une écriture : la question jugée et le compte, d'un bloc.
    expect(changer).toHaveBeenCalledTimes(1);
    const suite = changer.mock.calls[0]?.[0] as EtatDuPretest;
    expect(suite).toMatchObject({ rang: 0, faites: 1 });
    expect(suite.questions[0]?.choisie).not.toBeNull();
    expect(contexte.finDeSeance).not.toHaveBeenCalled();
  });

  it('une_bonne_reponse_s_enregistre_juste_sous_le_mode_pretest', () => {
    const etat = etatDe();
    const { contexte } = poser(etat);
    fireEvent.click(boutons().find((b) => texteDe(b) === bonne(etat)) as HTMLButtonElement);

    expect(contexte.enregistrer).toHaveBeenCalledWith(etat.questions[0]?.id, true, 'pretest');
  });

  it('une_faute_de_pretest_n_est_pas_montree_comme_une_faute', () => {
    const base = etatDe();
    const mauvaise = base.questions[0]?.options.findIndex((o) => o !== bonne(base)) ?? -1;
    const questions = base.questions.map((q, i) => (i === 0 ? { ...q, choisie: mauvaise } : q));
    poser({ ...base, questions, faites: 1 });

    const classes = boutons().map((b) => b.className);
    expect(classes[mauvaise]).toBe('sel');
    expect(classes).toContain('right');
    expect(classes).not.toContain('wrong');
    expect(screen.getByText(t.heute_pretest_danach)).toBeTruthy();
    // Aucun verdict ni compte : seul le rang de la question se dit.
    expect(document.body.textContent).not.toMatch(/richtig|falsch|fehler/i);
  });

  it('la_suite_avance_d_une_question_sans_rien_enregistrer', () => {
    const base = etatDe();
    const questions = base.questions.map((q, i) => (i === 0 ? { ...q, choisie: 0 } : q));
    const { contexte, changer } = poser({ ...base, questions, faites: 1 });
    fireEvent.click(screen.getByRole('button', { name: t.suivante }));

    expect(changer).toHaveBeenCalledWith({ ...base, questions, faites: 1, rang: 1 });
    expect(contexte.enregistrer).not.toHaveBeenCalled();
  });

  it('la_derniere_reponse_appelle_fin_de_seance_une_fois', async () => {
    const base = etatDe();
    const { contexte } = poser({ ...base, rang: 4, faites: 4 });
    fireEvent.click(boutons()[0] as HTMLButtonElement);
    await vi.waitFor(() => expect(contexte.finDeSeance).toHaveBeenCalledTimes(1));

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
  });

  it('une_reponse_qui_n_est_pas_la_derniere_n_appelle_pas_fin_de_seance', async () => {
    const { contexte } = poser(etatDe({ rang: 3, faites: 3 }));
    fireEvent.click(boutons()[0] as HTMLButtonElement);
    await Promise.resolve();

    expect(contexte.finDeSeance).not.toHaveBeenCalled();
  });

  it('la_fin_dit_l_etape_sans_aucun_compte_et_ramene_a_la_tagesrunde', () => {
    const base = etatDe();
    const { changer } = poser({ ...base, rang: 5, faites: 5 });

    expect(screen.getByText(formater(t.heute_pretest_fertig, { etape: 'Woche 2' }))).toBeTruthy();
    expect(boutons()).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe(t.heute_pretest_fin);
    expect(document.body.textContent).not.toMatch(/\d\s*(von|\/)\s*5/);
    fireEvent.click(screen.getByRole('button', { name: t.heute_pretest_zurueck }));
    expect(changer).toHaveBeenCalledWith(null);
  });

  it('zur_tagesrunde_quitte_le_pretest_a_tout_moment', () => {
    const { changer } = poser(etatDe({ rang: 1, faites: 1 }));
    fireEvent.click(screen.getByRole('button', { name: t.heute_pretest_zurueck }));

    expect(changer).toHaveBeenCalledWith(null);
  });
});
