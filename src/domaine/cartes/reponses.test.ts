import { describe, expect, it } from 'vitest';
import { alternatives, alternativesDeCarte, canonique, normaliser } from './reponses.js';

const triees = (ensemble: ReadonlySet<string>): string[] => [...ensemble].sort();

describe('reponses', () => {
  it('normaliser_comme_le_prototype', () => {
    const cas: [string, string][] = [
      ['Ösophagus', 'ösophagus'],
      ['oesophagus', 'ösophagus'],
      ['  Min. ', 'min'],
      ['«Herz»!', 'herz'],
      ['- itis –', 'itis'],
      ['Frische  Butter', 'frische butter'],
    ];
    for (const [entree, sortie] of cas) {
      expect(normaliser(entree), entree).toBe(sortie);
    }
  });

  it('normaliser_compose_les_accents_et_retire_la_ponctuation', () => {
    // « o » + tréma combinant (NFD) devient « ö » (NFC), le point de suspension disparaît.
    expect(normaliser('ödem…')).toBe('ödem');
    expect(normaliser('Wie?  Was.')).toBe('wie was');
  });

  it('canonique_c_devant_e_i_y_ae_oe', () => {
    const cas: [string, string][] = [
      ['Cystitis', 'zystitis'],
      ['Cor', 'kor'],
      ['Schmerz', 'skhmerz'],
      ['Caecum', 'zäkum'],
    ];
    for (const [entree, sortie] of cas) {
      expect(canonique(entree), entree).toBe(sortie);
    }
  });

  it('alternatives_exemples_du_prototype', () => {
    const cas: [string, string[]][] = [
      ['Tellerus (Pl. Telleri)', ['pl telleri', 'tellerus', 'tellerus (pl telleri)']],
      ['ko-, kon- (lat.)', ['ko', 'ko-, kon', 'ko-, kon- (lat)', 'kon']],
      ['Herd / CRD', ['herd', 'herd / krd', 'krd']],
      ['Min.', ['min']],
      ['Herz (lat. / gr.)', ['herz', 'herz (lat / gr)']],
    ];
    for (const [recto, attendu] of cas) {
      expect([...alternatives(recto)].sort(), recto).toEqual(attendu);
    }
  });

  it('alternatives_sans_chaine_vide', () => {
    expect(alternatives('...').size).toBe(0);
    expect(alternatives('Herz').has('')).toBe(false);
  });

  it('alternatives_de_carte_sans_reponses_vaut_alternatives_du_recto', () => {
    const recto = 'Tellerus (Pl. Telleri)';
    expect(triees(alternativesDeCarte({ recto }))).toEqual(triees(alternatives(recto)));
  });

  it('alternatives_de_carte_avec_reponses', () => {
    expect(
      triees(alternativesDeCarte({ recto: 'Tellerus (Pl. Telleri)', reponses: ['Tellerus'] })),
    ).toEqual(['tellerus', 'tellerus (pl telleri)']);
  });

  it('alternatives_de_carte_ecarte_les_reponses_vides_apres_canonisation', () => {
    expect(triees(alternativesDeCarte({ recto: 'Cystitis', reponses: ['.', 'Zystitis'] }))).toEqual(
      ['zystitis'],
    );
  });
});
