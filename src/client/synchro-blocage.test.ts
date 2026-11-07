import { afterEach, describe, expect, it, vi } from 'vitest';
import { fermerLesBasesDeTest, ouvrirBaseDeTest } from './stockage/base-locale.fixture.js';
import type { BaseLocale } from './stockage/base-locale.js';
import { ALICE, AUTRE_COURS_DE_TEST, COURS_DE_TEST } from './stockage/evenements.fixture.js';
import { fileDuCours } from './stockage/journal-local.js';
import { apiDe, ServeurFactice } from './stockage/serveur-factice.fixture.js';
import { repondre, serveurRetenu } from './synchro.fixture.js';
import {
  attendreLesSynchronisations,
  bloquerSynchronisations,
  envoyerFile,
  synchroniserCours,
} from './synchro.js';

afterEach(() => {
  fermerLesBasesDeTest();
  vi.restoreAllMocks();
});

describe('blocage des synchronisations', () => {
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 20));

  /** L'attente des synchronisations, et si elle est finie (`etat.fini`). */
  function attendre(base: BaseLocale) {
    const etat = { fini: false };
    const attente = attendreLesSynchronisations(base).then(() => {
      etat.fini = true;
    });
    return { attente, etat };
  }

  it('bloque_aucune_requete', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);
    const debloquer = bloquerSynchronisations(base);

    const synchro = await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur);
    const envoi = await envoyerFile(base, ALICE, serveur);

    expect(synchro).toEqual({ etat: 'en_attente', enAttente: 2 });
    expect(envoi).toBe('en_attente');
    expect(serveur.envois).toEqual([]);
    expect(serveur.lectures).toEqual([]);
    expect(serveur.listages).toBe(0);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(2);

    // Le blocage levé, tout repart.
    debloquer();
    expect(await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).toEqual({
      etat: 'a_jour',
      enAttente: 0,
    });
    expect(serveur.envois).toHaveLength(1);
  });

  it('un_envoi_seul_bloque_sans_file_est_aussi_en_attente', async () => {
    const base = await ouvrirBaseDeTest();
    const debloquer = bloquerSynchronisations(base);

    expect(await envoyerFile(base, ALICE, new ServeurFactice())).toBe('en_attente');

    debloquer();
    expect(await envoyerFile(base, ALICE, new ServeurFactice())).toBe('a_jour');
  });

  it('plusieurs_blocages_se_levent_chacun_une_fois', async () => {
    const base = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    const premier = bloquerSynchronisations(base);
    const second = bloquerSynchronisations(base);

    premier();
    premier();
    // Le premier blocage est levé (deux fois) : le second tient toujours.
    expect((await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).etat).toBe('en_attente');
    expect(serveur.envois).toEqual([]);

    second();
    expect((await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).etat).toBe('a_jour');
  });

  it('le_blocage_d_une_base_ne_touche_pas_une_autre', async () => {
    const base = await ouvrirBaseDeTest();
    const autreBase = await ouvrirBaseDeTest();
    const serveur = new ServeurFactice();
    const debloquer = bloquerSynchronisations(base);

    expect((await synchroniserCours(autreBase, ALICE, COURS_DE_TEST, serveur)).etat).toBe('a_jour');
    expect(serveur.lectures).toHaveLength(1);
    debloquer();
  });

  it('un_blocage_pose_en_cours_de_route_arrete_les_requetes_suivantes', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 2);
    const { serveur, api, liberer } = serveurRetenu();
    const synchro = synchroniserCours(base, ALICE, COURS_DE_TEST, api);
    await pause();

    // L'envoi est en vol : on bloque, puis il se termine.
    const debloquer = bloquerSynchronisations(base);
    liberer();

    expect(await synchro).toEqual({ etat: 'en_attente', enAttente: 0 });
    expect(serveur.envois).toHaveLength(1);
    // Sa lecture, qui aurait été une requête de plus, n'a pas eu lieu.
    expect(serveur.lectures).toEqual([]);
    debloquer();
  });

  it('une_relance_programmee_avant_le_blocage_ne_fait_aucune_requete', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    const { serveur, api, liberer } = serveurRetenu();
    const premiere = synchroniserCours(base, ALICE, COURS_DE_TEST, api);
    const relance = synchroniserCours(base, ALICE, COURS_DE_TEST, api);
    await pause();

    const debloquer = bloquerSynchronisations(base);
    liberer();
    await premiere;

    expect((await relance).etat).toBe('en_attente');
    expect(serveur.lectures).toEqual([]);
    debloquer();
  });

  it('attendre_les_synchronisations', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    const { serveur, api, liberer } = serveurRetenu();
    const synchro = synchroniserCours(base, ALICE, COURS_DE_TEST, api);
    const { attente, etat } = attendre(base);
    await pause();

    // Tant que la synchronisation est en cours, on attend.
    expect(etat.fini).toBe(false);
    liberer();
    await attente;
    expect(etat.fini).toBe(true);
    expect(serveur.lectures).toHaveLength(1);
    await synchro;
  });

  it('attendre_les_synchronisations_sans_rien_en_cours_se_resout_aussitot', async () => {
    const base = await ouvrirBaseDeTest();

    await attendreLesSynchronisations(base);
    await synchroniserCours(base, ALICE, COURS_DE_TEST, new ServeurFactice());
    await attendreLesSynchronisations(base);
  });

  it('attendre_les_synchronisations_couvre_la_relance_et_l_envoi_seul', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    await repondre(base, ALICE, AUTRE_COURS_DE_TEST, 2, 2);
    const { serveur, api, liberer } = serveurRetenu();
    const premiere = synchroniserCours(base, ALICE, COURS_DE_TEST, api);
    const relance = synchroniserCours(base, ALICE, COURS_DE_TEST, api);
    const envoi = envoyerFile(base, ALICE, api);
    const { attente, etat } = attendre(base);
    await pause();
    expect(etat.fini).toBe(false);
    liberer();
    await attente;

    // Tout est terminé quand l'attente se résout : la synchronisation, sa relance, l'envoi seul.
    expect(serveur.lectures).toHaveLength(2);
    expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toEqual([]);
    await Promise.all([premiere, relance, envoi]);
  });

  it('attendre_les_synchronisations_se_resout_meme_si_une_synchronisation_echoue', async () => {
    const base = await ouvrirBaseDeTest();
    await repondre(base, ALICE, COURS_DE_TEST, 1, 1);
    const cassee = apiDe(new ServeurFactice(), {
      envoyer: () => Promise.reject(new Error('boum')),
    });
    const sortie = synchroniserCours(base, ALICE, COURS_DE_TEST, cassee).catch((e) => e);

    await attendreLesSynchronisations(base);

    expect(await sortie).toEqual(new Error('boum'));
  });
});
