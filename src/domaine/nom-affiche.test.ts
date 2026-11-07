import { describe, expect, it } from 'vitest';
import { NOM_AFFICHE_MAX, nomAfficheValide, nomValide } from './nom-affiche.js';

/*
 * Les caractères invisibles s'écrivent ici par leur échappement, jamais tels quels : bruts, ils ne
 * se verraient pas à la relecture.
 */

// Une femme médecin : quatre points de code (U+1F469, le liant U+200D, U+2695, U+FE0F) pour un seul
// dessin, et cinq unités UTF-16.
const EMOJI_COMPOSE = '\u{1F469}\u{200D}\u{2695}\u{FE0F}';

describe('nomAfficheValide', () => {
  it('nom_affiche_max_vaut_quarante', () => {
    expect(NOM_AFFICHE_MAX).toBe(40);
  });

  it('nom_affiche_longueur_de_un_a_quarante_points_de_code', () => {
    expect(nomAfficheValide('')).toBeUndefined();
    expect(nomAfficheValide('L')).toBe('L');
    expect(nomAfficheValide('L'.repeat(40))).toBe('L'.repeat(40));
    expect(nomAfficheValide('L'.repeat(41))).toBeUndefined();
  });

  it('nom_affiche_emoji_compose_compte_en_points_de_code', () => {
    // 40 points de code, mais 41 unités UTF-16 : compter en unités le refuserait à tort.
    const quarante = `${'Ä'.repeat(36)}${EMOJI_COMPOSE}`;
    expect([...quarante]).toHaveLength(40);
    expect(quarante).toHaveLength(41);

    expect(nomAfficheValide(quarante)).toBe(quarante);
    expect(nomAfficheValide(`${quarante}L`)).toBeUndefined();
  });

  it('nom_affiche_trim_avant_de_compter', () => {
    expect(nomAfficheValide('  Lernende Test\t')).toBe('Lernende Test');
    expect(nomAfficheValide(`\n ${'L'.repeat(40)} `)).toBe('L'.repeat(40));
    expect(nomAfficheValide('   ')).toBeUndefined();
    expect(nomAfficheValide(' \t\n ')).toBeUndefined();
  });

  it.each([
    ['controle_cc', '\u{0007}'],
    ['controle_cc_nel', '\u{0085}'],
    ['retour_a_la_ligne', '\n'],
    ['separateur_de_ligne_zl', '\u{2028}'],
    ['separateur_de_paragraphe_zp', '\u{2029}'],
    ['controle_bidi_rlo', '\u{202E}'],
    ['isolat_bidi_rli', '\u{2067}'],
    ['marque_gauche_a_droite_lrm', '\u{200E}'],
    ['marque_droite_a_gauche_rlm', '\u{200F}'],
    ['marque_de_lettre_arabe_alm', '\u{061C}'],
    ['espace_sans_largeur', '\u{200B}'],
    ['gluon_de_mots', '\u{2060}'],
    ['plus_invisible', '\u{2064}'],
    ['controle_obsolete_206a', '\u{206A}'],
    ['chiffres_nominaux_206f', '\u{206F}'],
    ['indicateur_d_ordre_feff', '\u{FEFF}'],
    ['trait_d_union_conditionnel', '\u{00AD}'],
    ['ancre_d_annotation_fff9', '\u{FFF9}'],
    ['remplissage_hangul_115f', '\u{115F}'],
    ['remplissage_hangul_1160', '\u{1160}'],
    ['remplissage_hangul_3164', '\u{3164}'],
    ['remplissage_hangul_ffa0', '\u{FFA0}'],
    ['separateur_de_voyelles_mongol', '\u{180E}'],
  ])('nom_affiche_refuse_%s', (_famille, caractere) => {
    expect(nomAfficheValide(`Lernende${caractere}Test`)).toBeUndefined();
    // Seul, entouré d'espaces : le `trim` ne l'enlève pas, il reste refusé.
    expect(nomAfficheValide(`L ${caractere} T`)).toBeUndefined();
  });

  it('nom_affiche_antiliant_et_liant_sans_largeur_acceptes', () => {
    // L'antiliant (U+200C) sert à certaines écritures, le liant (U+200D) compose les émojis.
    expect(nomAfficheValide('Lernende\u{200C}Test')).toBe('Lernende\u{200C}Test');
    expect(nomAfficheValide('Lernende\u{200D}Test')).toBe('Lernende\u{200D}Test');
    expect(nomAfficheValide(`Lernende ${EMOJI_COMPOSE}`)).toBe(`Lernende ${EMOJI_COMPOSE}`);
  });

  it('nom_affiche_accents_et_autres_ecritures_acceptes', () => {
    for (const nom of ['Prüfer Test', 'Élève Test', 'Ünal Test', 'Ἀθηνᾶ', 'Тест', '테스트']) {
      expect(nomAfficheValide(nom), nom).toBe(nom);
    }
  });
});

describe('nomValide', () => {
  it('nom_valide_longueur_maximale_en_parametre', () => {
    expect(nomValide('G'.repeat(60), 60)).toBe('G'.repeat(60));
    expect(nomValide('G'.repeat(61), 60)).toBeUndefined();
    expect(nomValide(' ', 60)).toBeUndefined();
  });

  it('nom_valide_meme_regle_des_caracteres_que_le_nom_affiche', () => {
    expect(nomValide('Klasse\u{200B}A', 60)).toBeUndefined();
    expect(nomValide('Klasse\u{3164}', 60)).toBeUndefined();
    expect(nomValide('Klasse\u{200C}A', 60)).toBe('Klasse\u{200C}A');
  });
});
