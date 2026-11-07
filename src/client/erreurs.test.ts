import { describe, expect, it } from 'vitest';
import { ErreurApi } from './api.js';
import {
  classerErreurPasskey,
  demanderPasskey,
  ErreurPasskey,
  ErreurReponsesEnAttente,
  messageDErreur,
  sessionPerdue,
} from './erreurs.js';
import { textes, textesAdmin } from './textes.js';

function exception(nom: string): Error {
  return Object.assign(new Error('message du navigateur'), { name: nom });
}

describe('classerErreurPasskey', () => {
  it('classer_erreur_passkey_distingue_annulation_doublon_et_echec', () => {
    expect(classerErreurPasskey(exception('NotAllowedError'))).toBe('annulee');
    expect(classerErreurPasskey(exception('AbortError'))).toBe('annulee');
    expect(classerErreurPasskey(exception('InvalidStateError'))).toBe('deja_enregistree');
    expect(classerErreurPasskey(exception('NotSupportedError'))).toBe('echec');
    expect(classerErreurPasskey(exception('SecurityError'))).toBe('echec');
    expect(classerErreurPasskey(new Error('WebAuthn is not supported in this browser'))).toBe(
      'echec',
    );
    expect(classerErreurPasskey('autre chose')).toBe('echec');
  });
});

describe('demanderPasskey', () => {
  it('demander_passkey_rend_le_resultat', async () => {
    expect(await demanderPasskey(async () => 42)).toBe(42);
  });

  it('demander_passkey_transforme_l_echec_en_erreur_de_passkey', async () => {
    const annulee = await demanderPasskey(async () => {
      throw exception('NotAllowedError');
    }).catch((e) => e);

    expect(annulee).toBeInstanceOf(ErreurPasskey);
    expect(annulee).toMatchObject({ nature: 'annulee' });
    expect(annulee.message).not.toContain('navigateur');
  });
});

describe('messageDErreur', () => {
  it('message_d_erreur_traduit_chaque_code_de_l_api_dans_les_deux_langues', () => {
    const codes = [
      'lien_invalide',
      'connexion_impossible',
      'requete',
      'trop_de_requetes',
      'derniere_passkey',
      'introuvable',
      'non_connecte',
      'autre_personne',
      'proprietaire',
      'interne',
      'reseau',
      'inconnue',
    ] as const;

    for (const langue of ['de', 'fr'] as const) {
      for (const code of codes) {
        const message = messageDErreur(new ErreurApi(400, code), textes[langue]);
        expect(message, `${langue}.${code}`).toBe(textes[langue][`erreur_${code}`]);
      }
    }
  });

  it('message_d_erreur_traduit_chaque_nature_de_passkey', () => {
    for (const nature of ['annulee', 'deja_enregistree', 'echec'] as const) {
      expect(messageDErreur(new ErreurPasskey(nature, undefined), textes.de)).toBe(
        textes.de[`passkey_${nature}`],
      );
    }
  });

  it('message_d_erreur_des_reponses_en_attente_a_la_deconnexion', () => {
    // R31b : la déconnexion n'efface rien tant que des réponses attendent pour une cause
    // passagère ; le message dit la cause, et quoi faire.
    for (const langue of ['de', 'fr'] as const) {
      for (const motif of ['reseau', 'session', 'serveur'] as const) {
        expect(
          messageDErreur(new ErreurReponsesEnAttente(motif, 2), textes[langue]),
          `${langue}.${motif}`,
        ).toBe(textes[langue][`deconnexion_attente_${motif}`]);
      }
    }
  });

  it('erreur_reponses_en_attente_porte_le_nombre', () => {
    // De quoi dire, sur le bouton qui abandonne la file, combien de réponses seraient perdues.
    const erreur = new ErreurReponsesEnAttente('serveur', 3);

    expect(erreur.enAttente).toBe(3);
    expect(erreur.motif).toBe('serveur');
    // Le nombre ne change pas le message : il dit la cause, pas le compte.
    expect(messageDErreur(erreur, textes.de)).toBe(textes.de.deconnexion_attente_serveur);
  });

  it('message_d_erreur_ne_cite_jamais_l_exception', () => {
    const message = messageDErreur(new TypeError('secret interne'), textes.fr);

    expect(message).toBe(textes.fr.erreur_inconnue);
  });

  it('message_d_erreur_de_l_administration_dit_les_refus_en_clair', () => {
    const libelles = { ...textes.fr, ...textesAdmin };

    expect(
      messageDErreur(new ErreurApi(409, 'cours_a_verifier_sans_derogation'), libelles),
    ).toContain('à vérifier');
    expect(messageDErreur(new ErreurApi(409, 'nom_deja_pris'), libelles)).toBe(
      textesAdmin.erreur_nom_deja_pris,
    );
    // Hors administration, ces codes n'ont pas de libellé : le message générique.
    expect(messageDErreur(new ErreurApi(409, 'nom_deja_pris'), textes.de)).toBe(
      textes.de.erreur_inconnue,
    );
  });
});

describe('sessionPerdue', () => {
  it('session_perdue_pour_non_connecte_et_autre_personne', () => {
    expect(sessionPerdue(new ErreurApi(401, 'non_connecte'))).toBe(true);
    // La session est celle d'une autre personne (R21, R32, R36) : on se reconnecte de même.
    expect(sessionPerdue(new ErreurApi(409, 'autre_personne'))).toBe(true);
    expect(sessionPerdue(new ErreurApi(404, 'introuvable'))).toBe(false);
    expect(sessionPerdue(new Error('x'))).toBe(false);
  });
});
