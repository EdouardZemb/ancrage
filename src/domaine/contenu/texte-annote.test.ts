import { describe, expect, it } from 'vitest';
import { analyserTexte } from './texte-annote.js';

describe('analyserTexte', () => {
  it('segments_comme_parse_report', () => {
    expect(analyserTexte('A [[EL|Esslöffel|abcdefgh]] B')).toEqual({
      segments: [
        { texte: 'A ' },
        { jeton: { id: 'abcdefgh', forme: 'EL', sens: 'Esslöffel' } },
        { texte: ' B' },
      ],
      erreurs: [],
    });
  });

  it('segments_vides_autour_des_jetons_colles', () => {
    expect(analyserTexte('[[a|b|abcdefgh]][[c|d|bcdefghj]]')).toEqual({
      segments: [
        { texte: '' },
        { jeton: { id: 'abcdefgh', forme: 'a', sens: 'b' } },
        { texte: '' },
        { jeton: { id: 'bcdefghj', forme: 'c', sens: 'd' } },
        { texte: '' },
      ],
      erreurs: [],
    });
    expect(analyserTexte('')).toEqual({ segments: [{ texte: '' }], erreurs: [] });
  });

  it('refuse_un_identifiant_de_jeton_mal_forme', () => {
    const { segments, erreurs } = analyserTexte('x [[a|b|abcdefgh]] y [[c|d|ABCDEFGH]] z');

    expect(segments).toHaveLength(5);
    expect(erreurs).toEqual([expect.stringMatching(/jetons\[1\].*identifiant mal formé/)]);
  });

  it('refuse_un_crochet_residuel', () => {
    for (const texte of [
      'x [[a|b]] y',
      'x [[a|b|abcdefgh] y',
      'x a|b|abcdefgh]] y',
      'x [[a|b|c|abcdefgh]] y',
    ]) {
      expect(analyserTexte(texte).erreurs, texte).toEqual([
        expect.stringMatching(/« \[\[ » ou « \]\] »/),
      ]);
    }
  });
});
