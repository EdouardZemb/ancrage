import { describe, expect, it } from 'vitest';
import type { Onglet } from '../../domaine/cours/prepare.js';
import { formater, TEXTES_COURS, textesDuCours } from './textes-cours.js';

/** Les onglets dont le libellé est un texte d'interface ; les autres prennent le titre du module. */
const ONGLETS_D_INTERFACE: Onglet[] = [
  'apercu',
  'cartes',
  'quiz',
  'schemas',
  'feuilles',
  'progression',
];

describe('textes du cours', () => {
  it('textes_cours_de_complets_et_non_vides', () => {
    const de: Record<string, string> = TEXTES_COURS.de;
    for (const [cle, texte] of Object.entries(de)) {
      expect(texte.trim(), cle).not.toBe('');
      // Chaque repère est bien formé : `{nom}`, aucune accolade isolée.
      expect(texte.replace(/\{[a-z_]+\}/g, ''), cle).not.toMatch(/[{}]/);
    }
    for (const onglet of ONGLETS_D_INTERFACE) {
      expect(de[`onglet_${onglet}`], onglet).toBeTruthy();
    }
  });

  it('textes_du_cours_par_langue_l_allemand_par_defaut', () => {
    expect(textesDuCours('de')).toBe(TEXTES_COURS.de);
    // Le français viendra avec un premier cours en français (décision 3).
    expect(textesDuCours('fr')).toBe(TEXTES_COURS.de);
    expect(textesDuCours('')).toBe(TEXTES_COURS.de);
  });

  it('formater_remplace_les_valeurs', () => {
    expect(formater('{n} Tage in Folge gelernt', { n: 3 })).toBe('3 Tage in Folge gelernt');
    expect(formater('{a}/{b} sicher · {a}', { a: 1, b: 12 })).toBe('1/12 sicher · 1');
    expect(formater('Note {note}', { note: '4.5' })).toBe('Note 4.5');
    expect(formater('ohne Werte', {})).toBe('ohne Werte');
    // Un repère sans valeur reste tel quel : l'oubli se voit, sans planter l'écran.
    expect(formater('{fehlt} bleibt', {})).toBe('{fehlt} bleibt');
    // Une valeur n'est pas relue comme un modèle.
    expect(formater('{a} {b}', { a: '{b}', b: 'x' })).toBe('{b} x');
  });
});
