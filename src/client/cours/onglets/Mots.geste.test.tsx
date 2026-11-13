// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import { hasardDeterministe } from '../../../domaine/hasard.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { Mots } from './Mots.js';
import { boutons, progression, texteDe, touche } from './onglets.fixture.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

describe('Mots, un seul rappel par geste (M2-P7)', () => {
  it('la_derniere_partie_d_un_mot_garde_le_mot_fini_et_le_compte', () => {
    const contexte = contexteDeTest();
    contexte.hasard = hasardDeterministe(3);
    contexte.preferences = { ...contexte.preferences, mots: { mode: 'zerlegen' } };
    rendreDansLeCours(<Mots />, contexte);
    const morphemes = contexte.cours.morphologie?.morphemes ?? [];
    const mots = contexte.cours.morphologie?.mots ?? [];
    const ecrit = Array.from(document.querySelectorAll('.word .seg'))
      .map((s) => s.childNodes[0]?.textContent ?? '')
      .join('');
    const mot = mots.find((m) => m.mot === ecrit);
    if (mot === undefined) throw new Error(`Aucun mot « ${ecrit} »`);

    // Chaque partie par la touche de la bonne proposition ; la dernière juge le mot.
    for (const segment of mot.segments) {
      const sens = morphemes.find((m) => m.id === segment.morpheme)?.sens;
      const rang = boutons().findIndex((b) => texteDe(b) === sens);
      touche(String(rang + 1));
    }

    // Le mot fini et son compte sont dans le même état : l'un n'écrase pas l'autre.
    expect(document.querySelector('.card .back')?.textContent).toBe(`${mot.mot} = ${mot.sens}`);
    expect(document.querySelectorAll('.word .seg.ok')).toHaveLength(mot.segments.length);
    expect(progression()).toContain('1 / 1 richtig');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(mot.id, true, 'choix');
    fireEvent.click(screen.getByRole('button', { name: t.mots_naechstes }));
    expect(progression()).toContain('1 / 1 richtig');
  });
});
