import { describe, expect, it } from 'vitest';
import { defilementPourVoir } from './barre-d-onglets.js';

/*
 * Le défilement de la barre des onglets (R40), calculé à part : happy-dom ne calcule aucune
 * géométrie. Une barre de 200 px de large, des onglets de 80 px.
 */
const LARGEUR = 200;
const barre = (scrollLeft: number) => ({ scrollLeft, clientWidth: LARGEUR });
const onglet = (debut: number, largeur = 80) => ({ debut, largeur });

describe('defilementPourVoir', () => {
  it('onglet_hors_de_vue_a_droite_amene_a_droite', () => {
    // L'onglet va de 400 à 480 ; la barre montre 0 à 200 : il vient au bord droit.
    expect(defilementPourVoir(barre(0), onglet(400))).toBe(280);
    // À cheval sur le bord droit : le défilement le plus court.
    expect(defilementPourVoir(barre(0), onglet(150))).toBe(30);
  });

  it('onglet_hors_de_vue_a_gauche_amene_a_gauche', () => {
    // La barre montre 300 à 500 ; l'onglet va de 40 à 120 : il vient au bord gauche.
    expect(defilementPourVoir(barre(300), onglet(40))).toBe(40);
    // À cheval sur le bord gauche.
    expect(defilementPourVoir(barre(300), onglet(250))).toBe(250);
  });

  it('onglet_deja_visible_rien_ne_bouge', () => {
    expect(defilementPourVoir(barre(0), onglet(0))).toBe(0);
    expect(defilementPourVoir(barre(0), onglet(120))).toBe(0);
    expect(defilementPourVoir(barre(100), onglet(100))).toBe(100);
    expect(defilementPourVoir(barre(100), onglet(220))).toBe(100);
  });

  it('onglet_plus_large_que_la_barre_montre_son_debut', () => {
    expect(defilementPourVoir(barre(0), onglet(300, 260))).toBe(300);
    expect(defilementPourVoir(barre(500), onglet(300, 260))).toBe(300);
  });

  // Mesuré au sous-pixel près, l'onglet ramené au bord n'en reste pas rogné d'une fraction.
  it('onglet_au_sous_pixel_arrondi_vers_l_exterieur', () => {
    // L'onglet va de 400,3 à 480,8 : la barre montre 281 à 481.
    expect(defilementPourVoir(barre(0), onglet(400.3, 80.5))).toBe(281);
    // L'onglet commence à 40,6 : la barre commence à 40.
    expect(defilementPourVoir(barre(300), onglet(40.6))).toBe(40);
    // Déjà visible au sous-pixel près : rien ne bouge.
    expect(defilementPourVoir(barre(100), onglet(100.5, 99.5))).toBe(100);
  });
});
