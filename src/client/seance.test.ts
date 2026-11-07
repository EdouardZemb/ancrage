import { afterEach, describe, expect, it } from 'vitest';
import { declarerSeance, seanceEnCours } from './seance.js';

const retraits: (() => void)[] = [];
afterEach(() => {
  for (const retirer of retraits.splice(0)) retirer();
});

describe('seanceEnCours', () => {
  it('aucune_source_aucune_seance', () => {
    expect(seanceEnCours()).toBeNull();
  });

  it('une_source_en_seance_l_est_jusqu_a_son_retrait', () => {
    const retirer = declarerSeance(() => 'journalisee');
    retraits.push(retirer);
    expect(seanceEnCours()).toBe('journalisee');

    retirer();

    expect(seanceEnCours()).toBeNull();
  });

  it('des_sources_sans_seance_n_en_font_pas_une', () => {
    retraits.push(declarerSeance(() => null));
    retraits.push(declarerSeance(() => null));
    expect(seanceEnCours()).toBeNull();
  });

  it('la_source_est_relue_a_chaque_question', () => {
    let seance: 'journalisee' | 'retenue' | null = null;
    retraits.push(declarerSeance(() => seance));
    expect(seanceEnCours()).toBeNull();
    seance = 'retenue';
    expect(seanceEnCours()).toBe('retenue');
  });

  it('retenue_l_emporte_sur_journalisee_dans_les_deux_ordres', () => {
    const journalisee = declarerSeance(() => 'journalisee');
    const retenue = declarerSeance(() => 'retenue');
    expect(seanceEnCours()).toBe('retenue');
    journalisee();
    retenue();

    retraits.push(declarerSeance(() => 'retenue'));
    retraits.push(declarerSeance(() => null));
    retraits.push(declarerSeance(() => 'journalisee'));
    expect(seanceEnCours()).toBe('retenue');
  });
});
