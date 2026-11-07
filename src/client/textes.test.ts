import { afterEach, describe, expect, it, vi } from 'vitest';
import { NOM_AFFICHE_MAX } from '../domaine/nom-affiche.js';
import { langueDuNavigateur, textes, textesAdmin } from './textes.js';

describe('textes', () => {
  it('textes_memes_cles_en_de_et_fr', () => {
    expect(Object.keys(textes.de).sort()).toEqual(Object.keys(textes.fr).sort());
  });

  it('textes_aucun_libelle_vide', () => {
    for (const langue of ['de', 'fr'] as const) {
      for (const [cle, texte] of Object.entries(textes[langue])) {
        expect(texte.trim(), `${langue}.${cle}`).not.toBe('');
      }
    }
    for (const [cle, texte] of Object.entries(textesAdmin)) {
      expect(texte.trim(), `admin.${cle}`).not.toBe('');
    }
  });

  it('textes_les_deux_langues_different', () => {
    // Un libellé resté en français dans la table allemande se verrait ici. Les mots communs aux
    // deux langues sont listés : ils ne sont pas des oublis.
    const communs = new Set(['langue_de', 'langue_fr', 'admin_lien', 'passkeys_titre']);
    for (const cle of Object.keys(textes.fr) as (keyof typeof textes.fr)[]) {
      if (!communs.has(cle)) {
        expect(textes.de[cle], cle).not.toBe(textes.fr[cle]);
      }
    }
  });

  it('textes_nom_requis_cite_la_longueur_maximale_de_la_regle', () => {
    for (const langue of ['de', 'fr'] as const) {
      expect(textes[langue].nom_requis, langue).toContain(String(NOM_AFFICHE_MAX));
    }
  });

  it('textes_passkey_au_masculin_en_allemand', () => {
    // « der Passkey » : une forme féminine au singulier est une faute. Le pluriel (« die
    // Passkeys ») n'est pas visé.
    const feminin =
      /\b(?:die|eine|keine|diese|mit dieser|deine|meine|jede)\s+(?:ancrage-)?Passkey\b/i;
    for (const [cle, texte] of Object.entries(textes.de)) {
      expect(texte, cle).not.toMatch(feminin);
    }
  });

  it('textes_abandon_de_la_file_au_singulier_et_au_pluriel', () => {
    // Le bouton qui abandonne la file (1e-D11) a deux formes : « {n} réponses » au pluriel, et
    // « 1 réponse » quand une seule attend (1e-R10), comme `synchro_une_en_attente`.
    for (const langue of ['de', 'fr'] as const) {
      const t = textes[langue];
      expect(t.deconnexion_abandonner, langue).toContain('{n}');
      expect(t.deconnexion_abandonner_confirmer, langue).toContain('{n}');
      expect(t.deconnexion_abandonner_une, langue).toContain('1');
      expect(t.deconnexion_abandonner_une, langue).not.toContain('{n}');
      expect(t.deconnexion_abandonner_confirmer_une, langue).toContain('1');
      expect(t.deconnexion_abandonner_confirmer_une, langue).not.toContain('{n}');
    }
    expect(textes.de.deconnexion_abandonner_une).not.toContain('Antworten');
    expect(textes.de.deconnexion_abandonner_confirmer_une).not.toContain('Antworten');
    expect(textes.fr.deconnexion_abandonner_une).not.toContain('réponses');
    expect(textes.fr.deconnexion_abandonner_confirmer_une).not.toContain('réponses');
  });

  it('textes_suppression_dit_que_les_autres_appareils_se_vident', () => {
    // 2d-D5 : les autres appareils se vident à leur prochain contact avec le serveur.
    expect(textes.fr.suppression_explication).toContain(
      'se vident à leur prochain contact avec le serveur',
    );
    expect(textes.fr.suppression_explication).not.toContain('déconnecte-toi d’abord');
    expect(textes.de.suppression_explication).toContain(
      'leeren sich, sobald sie das nächste Mal den Server erreichen',
    );
    expect(textes.de.suppression_explication).not.toContain('Melde dich zuerst');
    // L'ancienne formule promettait l'effacement de tout, tout de suite.
    expect(textes.fr.suppression_explication).not.toContain('tes appareils et ta progression');
  });

  it('l_appareil_se_dit_cet_appareil', () => {
    // 1f-D13 : un texte parle de l'appareil, pas de « ce téléphone », car l'application s'installe
    // aussi ailleurs. « avec ton téléphone » (`invitation_intro`) reste : c'est bien le téléphone
    // qui déverrouille la passkey. Ce test ne vise donc que « ce téléphone » et « diesem/dieses
    // Telefon ».
    for (const [cle, texte] of Object.entries(textes.fr)) {
      expect(texte, `fr.${cle}`).not.toContain('ce téléphone');
    }
    for (const [cle, texte] of Object.entries(textes.de)) {
      expect(texte, `de.${cle}`).not.toMatch(/dies(?:em|es) Telefon/);
    }
  });

  it('textes_suppression_sans_reponse_cite_le_bouton_de_deconnexion', () => {
    // Après une suppression dont la réponse s'est perdue (I2), le message nomme le bouton qui
    // efface l'appareil, avec son libellé réel et les guillemets de la langue.
    const cites = {
      fr: (libelle: string) => `« ${libelle} »`,
      de: (libelle: string) => `«${libelle}»`,
    };
    for (const langue of ['de', 'fr'] as const) {
      const t = textes[langue];
      for (const cle of ['suppression_erreur_reseau', 'suppression_erreur_non_connecte'] as const) {
        expect(t[cle], `${langue}.${cle}`).toContain(cites[langue](t.deconnexion));
      }
    }
  });
});

describe('langueDuNavigateur', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('langue_du_navigateur_de_ou_fr', () => {
    expect(langueDuNavigateur('de')).toBe('de');
    expect(langueDuNavigateur('de-CH')).toBe('de');
    expect(langueDuNavigateur('de-DE')).toBe('de');
    expect(langueDuNavigateur('DE-at')).toBe('de');
    expect(langueDuNavigateur('fr')).toBe('fr');
    expect(langueDuNavigateur('fr-CH')).toBe('fr');
    // Toute autre langue, ou aucune : le français.
    expect(langueDuNavigateur('en-US')).toBe('fr');
    expect(langueDuNavigateur('it')).toBe('fr');
    expect(langueDuNavigateur('')).toBe('fr');
  });

  it('langue_du_navigateur_lit_navigator_language_par_defaut', () => {
    vi.stubGlobal('navigator', { language: 'de-CH' });
    expect(langueDuNavigateur()).toBe('de');

    vi.stubGlobal('navigator', { language: 'en-GB' });
    expect(langueDuNavigateur()).toBe('fr');

    vi.stubGlobal('navigator', undefined);
    expect(langueDuNavigateur()).toBe('fr');
  });
});
