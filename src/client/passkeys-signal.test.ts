// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { identifiantUtilisateur, signalerClesAcceptees, signalerNom } from './passkeys-signal.js';
import { ALICE } from './stockage/evenements.fixture.js';

const MOI = { id: ALICE, nomAffiche: 'Lernende Test' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('identifiantUtilisateur', () => {
  it('identifiant_utilisateur_base64url', () => {
    // Le `userHandle` de WebAuthn que le serveur pose : l'UUID de la personne, en UTF-8 (1e-D6).
    const uuid = '0198a3c2-7d4e-7b10-9c55-3f6e2a8d4b71';
    expect(identifiantUtilisateur(uuid)).toBe(Buffer.from(uuid, 'utf8').toString('base64url'));
    // Un identifiant de 36 octets donne 48 caractères, sans le `=` de bourrage ni `+` ni `/`.
    expect(identifiantUtilisateur(uuid)).toMatch(/^[A-Za-z0-9_-]{48}$/);
    // L'UTF-8, pas le latin-1 : « é » tient sur deux octets.
    expect(identifiantUtilisateur('é')).toBe('w6k');
    // Les caractères propres au base64url (`-` et `_`, là où le base64 met `+` et `/`).
    expect(identifiantUtilisateur('>>>???')).toBe('Pj4-Pz8_');
  });

  it('meme_user_handle_que_le_serveur', () => {
    // Le serveur compare le `userHandle` rendu au base64url des octets de `octetsDeLIdentifiant` :
    // le client doit signaler la même chaîne.
    expect(identifiantUtilisateur('p-0001')).toBe(Buffer.from('p-0001').toString('base64url'));
  });
});

describe('signalerNom', () => {
  it('signal_absent_sans_erreur', async () => {
    // Un navigateur qui ne connaît pas l'API Signal (avant Chrome 132) : rien n'est fait, rien ne
    // lève.
    await expect(signalerNom(MOI, {})).resolves.toBeUndefined();
    await expect(signalerNom(MOI, null)).resolves.toBeUndefined();
    await expect(signalerNom(MOI, { signalCurrentUserDetails: 'pas une fonction' })).resolves.toBe(
      undefined,
    );
    await expect(signalerClesAcceptees(ALICE, [], {})).resolves.toBeUndefined();
    await expect(
      signalerClesAcceptees(ALICE, [], { signalAllAcceptedCredentials: 42 }),
    ).resolves.toBeUndefined();
    // Sans l'argument, c'est `PublicKeyCredential` de la page, absent d'ici.
    expect('PublicKeyCredential' in globalThis).toBe(false);
    await expect(signalerNom(MOI)).resolves.toBeUndefined();
    await expect(signalerClesAcceptees(ALICE, [])).resolves.toBeUndefined();
  });

  it('signal_qui_leve_sans_erreur', async () => {
    // Le signal est un souhait, jamais une condition : qu'il lève tout de suite ou plus tard, la
    // connexion ou la suppression qui l'a lancé continue.
    const leveTout = vi.fn(() => {
      throw new Error('refusé');
    });
    const rejetteApres = vi.fn(async () => {
      throw new DOMException('pas ici', 'SecurityError');
    });

    await expect(signalerNom(MOI, { signalCurrentUserDetails: leveTout })).resolves.toBeUndefined();
    await expect(
      signalerNom(MOI, { signalCurrentUserDetails: rejetteApres }),
    ).resolves.toBeUndefined();
    await expect(
      signalerClesAcceptees(ALICE, ['a'], { signalAllAcceptedCredentials: leveTout }),
    ).resolves.toBeUndefined();
    await expect(
      signalerClesAcceptees(ALICE, ['a'], { signalAllAcceptedCredentials: rejetteApres }),
    ).resolves.toBeUndefined();
    expect(leveTout).toHaveBeenCalledTimes(2);
    expect(rejetteApres).toHaveBeenCalledTimes(2);
  });

  it('signaler_nom_appelle_l_api', async () => {
    const signalCurrentUserDetails = vi.fn(async () => {});

    await signalerNom(MOI, { signalCurrentUserDetails });

    expect(signalCurrentUserDetails).toHaveBeenCalledTimes(1);
    expect(signalCurrentUserDetails).toHaveBeenCalledWith({
      rpId: location.hostname,
      userId: Buffer.from(ALICE, 'utf8').toString('base64url'),
      name: 'Lernende Test',
      displayName: 'Lernende Test',
    });
  });

  it('signaler_nom_prend_par_defaut_le_public_key_credential_de_la_page', async () => {
    const signalCurrentUserDetails = vi.fn(async () => {});
    vi.stubGlobal('PublicKeyCredential', { signalCurrentUserDetails });

    await signalerNom(MOI);

    expect(signalCurrentUserDetails).toHaveBeenCalledTimes(1);
  });

  it('signaler_nom_appelle_la_methode_sur_son_objet', async () => {
    // Une méthode statique du navigateur se détache mal de son objet : elle est appelée comme
    // `PublicKeyCredential.signalCurrentUserDetails(…)`, pas comme une fonction libre.
    const objet = {
      appeles: 0,
      async signalCurrentUserDetails(this: { appeles: number }) {
        this.appeles += 1;
      },
    };

    await signalerNom(MOI, objet);

    expect(objet.appeles).toBe(1);
  });
});

describe('signalerClesAcceptees', () => {
  it('signaler_cles_acceptees_appelle_l_api', async () => {
    const signalAllAcceptedCredentials = vi.fn(async () => {});

    await signalerClesAcceptees(ALICE, ['cle-1', 'cle-2'], { signalAllAcceptedCredentials });

    expect(signalAllAcceptedCredentials).toHaveBeenCalledTimes(1);
    expect(signalAllAcceptedCredentials).toHaveBeenCalledWith({
      rpId: location.hostname,
      userId: Buffer.from(ALICE, 'utf8').toString('base64url'),
      allAcceptedCredentialIds: ['cle-1', 'cle-2'],
    });
  });

  it('signaler_cles_acceptees_aucune_demande_au_telephone_d_effacer_tout', async () => {
    // Un compte supprimé : plus aucune clé n'est acceptée, le téléphone efface les siennes.
    const signalAllAcceptedCredentials = vi.fn(async () => {});

    await signalerClesAcceptees(ALICE, [], { signalAllAcceptedCredentials });

    expect(signalAllAcceptedCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ allAcceptedCredentialIds: [] }),
    );
  });
});
