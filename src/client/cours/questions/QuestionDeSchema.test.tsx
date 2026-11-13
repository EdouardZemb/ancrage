// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { boutons, texteDe, touche } from '../onglets/onglets.fixture.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { QuestionDeSchema, type TacheDeSchema } from './QuestionDeSchema.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;
const schema = contexteDeTest().cours.schemas[0] as ModuleServiDe<'schema'>;

const TACHE: TacheDeSchema = { cible: 1, options: [3, 1, 0, 2], choisi: null };

function poser(mode: 'benennen' | 'zeigen', tache: TacheDeSchema = TACHE) {
  const repondre = vi.fn();
  const suivante = vi.fn();
  rendreDansLeCours(
    <QuestionDeSchema
      schema={schema}
      mode={mode}
      tache={tache}
      repondre={repondre}
      suivante={suivante}
    />,
    contexteDeTest(),
  );
  return { repondre, suivante };
}

describe('QuestionDeSchema', () => {
  it('benennen_propose_les_noms_et_un_point_bien_nomme_appelle_repondre_avec_son_rang', () => {
    const { repondre } = poser('benennen');
    expect(boutons().map(texteDe)).toEqual(['Rand', 'Mitte', 'Oberpol', 'Unterpol']);
    fireEvent.click(boutons()[1]);
    expect(repondre).toHaveBeenCalledTimes(1);
    expect(repondre).toHaveBeenCalledWith(1, 'choix');
  });

  it('benennen_les_touches_choisissent_le_nom_de_meme_rang', () => {
    const { repondre } = poser('benennen');
    touche('1');
    expect(repondre).toHaveBeenLastCalledWith(3, 'choix');
    touche('3');
    expect(repondre).toHaveBeenLastCalledWith(0, 'choix');
  });

  it('benennen_repondu_montre_le_verdict_la_suite_et_ne_repond_plus', () => {
    const { repondre, suivante } = poser('benennen', { ...TACHE, choisi: 3 });
    expect(boutons()).toHaveLength(0);
    expect(screen.getByText(t.verdict_fausse)).toBeTruthy();
    expect(screen.getByText('2 = Mitte')).toBeTruthy();
    touche('1');
    expect(repondre).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t.suivante }));
    expect(suivante).toHaveBeenCalledTimes(1);
  });

  it('zeigen_nomme_le_terme_et_n_a_pas_de_touches', () => {
    const { repondre } = poser('zeigen');
    expect(document.querySelector('.card p b')?.textContent).toBe('Mitte');
    touche('1');
    expect(repondre).not.toHaveBeenCalled();
    expect(boutons()).toHaveLength(0);
  });
});
