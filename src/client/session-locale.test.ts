// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { coursServiDeTest } from '../domaine/cours/cours.fixture.js';
import { preparerCours } from '../domaine/cours/prepare.js';
import { ErreurApi, type Moi } from './api.js';
import { ecrirePreferences, preferencesParDefaut } from './cours/preferences.js';
import { annulerSynchrosProgrammees, planifierApresReponse } from './declencheurs.js';
import { ErreurReponsesEnAttente, messageDErreur } from './erreurs.js';
import { identifiantUtilisateur } from './passkeys-signal.js';
import {
  type ApiSession,
  deconnecter,
  type EnvironnementDeconnexion,
  memoriserMoi,
  resoudreSession,
  supprimerLeCompte,
  suspendreLesSynchronisations,
  verifierLaSuppression,
} from './session-locale.js';
import { fermerLesBasesDeTest, ouvrirBaseDeTest } from './stockage/base-locale.fixture.js';
import { type BaseLocale, moiLocal, reserverA, viderSaufLesFiles } from './stockage/base-locale.js';
import {
  coursLocal,
  enregistrerCours,
  enregistrerListe,
  listeLocale,
} from './stockage/cours-local.js';
import {
  ALICE,
  APPAREIL_DE_TEST,
  AUTRE_COURS_DE_TEST,
  BERTHE,
  COURS_DE_TEST,
  idDeTest,
  reponseDeTest,
} from './stockage/evenements.fixture.js';
import {
  abandonnerLaFile,
  ajouterEvenement,
  coursEnAttente,
  evenementsDuCours,
  fileDuCours,
  noteDesEnvois,
} from './stockage/journal-local.js';
import { apiDe, erreurReseau, ServeurFactice } from './stockage/serveur-factice.fixture.js';
import { envoyerFile, synchroniserCours } from './synchro.js';
import { textes } from './textes.js';

// `reserverA` et `viderSaufLesFiles`, réels, mais dont un test simule l'échec (R35, 1e-R14).
vi.mock('./stockage/base-locale.js', async (original) => {
  const reel = await original<typeof import('./stockage/base-locale.js')>();
  return {
    ...reel,
    reserverA: vi.fn(reel.reserverA),
    viderSaufLesFiles: vi.fn(reel.viderSaufLesFiles),
  };
});
// Idem pour `abandonnerLaFile` : la déconnexion avec abandon dont la file refuse de s'effacer.
vi.mock('./stockage/journal-local.js', async (original) => {
  const reel = await original<typeof import('./stockage/journal-local.js')>();
  return { ...reel, abandonnerLaFile: vi.fn(reel.abandonnerLaFile) };
});

const MOI_ALICE: Moi = {
  id: ALICE,
  nomAffiche: 'Lernende Test',
  langue: 'de',
  proprietaire: false,
};
const MOI_BERTHE: Moi = {
  id: BERTHE,
  nomAffiche: 'Andere Lernende Test',
  langue: 'fr',
  proprietaire: false,
};
const servi = coursServiDeTest();
const cleDesPreferences = (personne: string) => `ancrage.preferences.${personne}.${servi.id}`;

afterEach(() => {
  annulerSynchrosProgrammees();
  fermerLesBasesDeTest();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Tout ce qu'Alice laisse sur l'appareil : identité, liste, contenu, journal, file, préférences. */
async function appareilDAlice(): Promise<BaseLocale> {
  const base = await ouvrirBaseDeTest();
  await memoriserMoi(base, MOI_ALICE);
  await enregistrerListe(base, ALICE, [{ id: servi.id, titre: servi.titre, langue: 'de' }]);
  await enregistrerCours(base, ALICE, servi);
  await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 1));
  await ajouterEvenement(base, ALICE, reponseDeTest(AUTRE_COURS_DE_TEST, 2));
  ecrirePreferences(ALICE, servi.id, preferencesParDefaut(preparerCours(servi)));
  return base;
}

/** Le nombre d'enregistrements de chaque magasin de la base. */
async function contenuDeLaBase(base: BaseLocale): Promise<Record<string, number>> {
  const compte: Record<string, number> = {};
  for (const nom of base.objectStoreNames) compte[nom] = await base.count(nom);
  return compte;
}

const sansReseau = () => Promise.reject(new ErreurApi(0, 'reseau'));

describe('resoudreSession', () => {
  it('session_valide_connectee_et_memorisee', async () => {
    const base = await ouvrirBaseDeTest();

    const etat = await resoudreSession(base, async () => MOI_ALICE);

    expect(etat).toEqual({ etat: 'connecte', moi: MOI_ALICE });
    expect(await moiLocal(base)).toEqual(MOI_ALICE);
  });

  it('la_personne_connue_est_tenue_a_jour', async () => {
    const base = await appareilDAlice();
    const renommee = { ...MOI_ALICE, nomAffiche: 'Lernende Neu', langue: 'fr' as const };

    expect(await resoudreSession(base, async () => renommee)).toEqual({
      etat: 'connecte',
      moi: renommee,
    });

    expect(await moiLocal(base)).toEqual(renommee);
    // La même personne : rien n'est effacé.
    expect(await coursLocal(base, ALICE, servi.id)).toEqual(servi);
    expect(localStorage.getItem(cleDesPreferences(ALICE))).not.toBeNull();
  });

  it('hors_ligne_avec_personne_connue_injoignable_sinon', async () => {
    const connue = await appareilDAlice();
    const inconnue = await ouvrirBaseDeTest();

    // Pas de réponse, ou une réponse qui n'est pas celle du serveur.
    for (const lire of [sansReseau, () => Promise.reject(new ErreurApi(502, 'inconnue'))]) {
      expect(await resoudreSession(connue, lire)).toEqual({ etat: 'hors_ligne', moi: MOI_ALICE });
      expect(await resoudreSession(inconnue, lire)).toEqual({ etat: 'injoignable' });
    }
    // Rien n'a été effacé.
    expect(await contenuDeLaBase(connue)).toMatchObject({ cours: 1, file: 2, etat: 1 });
  });

  it('session_expiree_avec_personne_connue_anonyme_sinon', async () => {
    const connue = await appareilDAlice();
    const inconnue = await ouvrirBaseDeTest();

    expect(await resoudreSession(connue, async () => undefined)).toEqual({
      etat: 'expiree',
      moi: MOI_ALICE,
    });
    expect(await resoudreSession(inconnue, async () => undefined)).toEqual({ etat: 'anonyme' });
    // La file d'Alice reste, pour partir quand elle se reconnectera (décision 14).
    expect(await fileDuCours(connue, ALICE, COURS_DE_TEST)).toHaveLength(1);
  });

  it('demarrage_sous_la_session_d_une_autre_personne_reserve_la_base', async () => {
    // Berthe s'est connectée ailleurs (un autre onglet) : au démarrage, la session est la sienne.
    const base = await appareilDAlice();

    const etat = await resoudreSession(base, async () => MOI_BERTHE);

    expect(etat).toEqual({ etat: 'connecte', moi: MOI_BERTHE });
    expect(await moiLocal(base)).toEqual(MOI_BERTHE);
    expect(await coursLocal(base, ALICE, servi.id)).toBeUndefined();
    expect(await listeLocale(base, ALICE)).toBeUndefined();
    expect(await evenementsDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
    expect(localStorage.getItem(cleDesPreferences(ALICE))).toBeNull();
    // Sa file, elle, reste : elle partira sous sa session.
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
    expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toHaveLength(1);
  });

  it('sans_stockage_la_session_se_resout_quand_meme', async () => {
    expect(await resoudreSession(undefined, async () => MOI_ALICE)).toEqual({
      etat: 'connecte',
      moi: MOI_ALICE,
    });
    expect(await resoudreSession(undefined, async () => undefined)).toEqual({ etat: 'anonyme' });
    expect(await resoudreSession(undefined, sansReseau)).toEqual({ etat: 'injoignable' });
  });
});

/** Ce que la déconnexion touche hors d'IndexedDB, simulé : les caches et le service worker. */
function environnement() {
  const ordre: string[] = [];
  const noms = ['workbox-precache-v2-https://ancrage.test/', 'autre-cache'];
  const supprimes: string[] = [];
  const desinscrits: string[] = [];
  const enregistrement = (nom: string) => ({
    unregister: async () => {
      ordre.push(`desinscrire ${nom}`);
      desinscrits.push(nom);
      return true;
    },
  });
  const env: EnvironnementDeconnexion = {
    caches: {
      keys: async () => [...noms],
      delete: async (nom: string) => {
        ordre.push(`supprimer ${nom}`);
        supprimes.push(nom);
        return true;
      },
    },
    conteneur: {
      getRegistrations: async () =>
        [enregistrement('sw'), enregistrement('ancien')] as unknown as ServiceWorkerRegistration[],
    },
  };
  return { env, ordre, noms, supprimes, desinscrits };
}

/**
 * L'API de la déconnexion et de la suppression du compte, sur un faux serveur ; elle note l'ordre
 * des appels. `fin` est ce que répond la fermeture de la session, `suppression` la suppression du
 * compte.
 */
function apiDeTest(
  serveur: ServeurFactice,
  ordre: string[],
  fin: () => Promise<void> = async () => {},
  suppression: () => Promise<void> = async () => {},
) {
  const api: ApiSession = {
    journal: apiDe(serveur, {
      envoyer: async (cours, evenements) => {
        ordre.push(`envoyer ${cours}`);
        await serveur.envoyer(cours, evenements);
      },
    }),
    deconnecter: async () => {
      ordre.push('deconnexion');
      await fin();
    },
    supprimerCompte: async (personne) => {
      ordre.push(`suppression ${personne}`);
      await suppression();
    },
  };
  return api;
}

/**
 * Ce que la déconnexion garantit quand le stockage refuse de se vider, après la
 * fermeture de la session : les préférences, les caches et le service worker sont effacés quand
 * même, et les synchronisations reprennent. Berthe a une réponse en file : tant que le blocage
 * tient, sa synchronisation reste `en_attente`.
 */
async function verifierApresUnRefusDEffacer(
  base: BaseLocale,
  serveur: ServeurFactice,
  { ordre, noms, supprimes, desinscrits }: ReturnType<typeof environnement>,
): Promise<void> {
  expect(ordre).toContain('deconnexion');
  expect(localStorage.getItem(cleDesPreferences(ALICE))).toBeNull();
  expect(supprimes).toEqual(noms);
  expect(desinscrits).toEqual(['sw', 'ancien']);
  // Le stockage n'a rien effacé : l'appareil connaît encore Alice, avec ce qui reste d'elle. La
  // suppression du compte, elle, l'oublie quand même (`oublierMoi`) ; la déconnexion non.
  expect(await moiLocal(base)).toEqual(MOI_ALICE);
  await vi.waitFor(async () =>
    expect((await synchroniserCours(base, BERTHE, COURS_DE_TEST, serveur)).etat).toBe('a_jour'),
  );
}

/**
 * Ce que la déconnexion ou la suppression du compte laisse de l'appareil quand tout s'efface :
 * IndexedDB, sauf les files non vides (celle de Berthe reste : elle partira sous sa session, R33),
 * les préférences d'Alice et elles seules dans le localStorage, tous les caches et le service
 * worker.
 */
async function verifierAppareilEfface(
  base: BaseLocale,
  {
    noms,
    supprimes,
    desinscrits,
  }: Pick<ReturnType<typeof environnement>, 'noms' | 'supprimes' | 'desinscrits'>,
): Promise<void> {
  expect(await contenuDeLaBase(base)).toEqual({ ...VIDE, file: 1 });
  expect(await fileDuCours(base, BERTHE, COURS_DE_TEST)).toHaveLength(1);
  expect(await moiLocal(base)).toBeUndefined();
  expect(localStorage.getItem(cleDesPreferences(ALICE))).toBeNull();
  expect(localStorage.getItem('ancrage.appareil')).not.toBeNull();
  expect(supprimes).toEqual(noms);
  expect(desinscrits).toEqual(['sw', 'ancien']);
}

/**
 * Ce que la déconnexion laisse de l'appareil quand rien ne s'efface : les préférences d'Alice, les
 * caches et le service worker. Le blocage est levé : la synchronisation d'Alice repart.
 */
async function verifierQueRienNEstEfface(
  base: BaseLocale,
  serveur: ServeurFactice,
  { supprimes, desinscrits }: Pick<ReturnType<typeof environnement>, 'supprimes' | 'desinscrits'>,
): Promise<void> {
  expect(localStorage.getItem(cleDesPreferences(ALICE))).not.toBeNull();
  expect([...supprimes, ...desinscrits]).toEqual([]);
  serveur.panneEnvoi = undefined;
  await vi.waitFor(async () =>
    expect((await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).etat).toBe('a_jour'),
  );
}

/** Une base vide, sauf ce qu'on y précise. */
const VIDE = { evenements: 0, file: 0, cours: 0, listes: 0, curseurs: 0, etat: 0 };

describe('deconnecter', () => {
  it('deconnexion_synchronise_puis_vide', async () => {
    const base = await appareilDAlice();
    // La file d'une autre personne, restée sur l'appareil.
    await ajouterEvenement(base, BERTHE, reponseDeTest(COURS_DE_TEST, 3));
    localStorage.setItem('ancrage.appareil', '4b3f0a52-7c1e-4d68-9a21-5e8f6c0d3b17');
    const serveur = new ServeurFactice();
    const { env, ordre, noms, supprimes, desinscrits } = environnement();

    await deconnecter(base, ALICE, apiDeTest(serveur, ordre), env);

    // D'abord la file d'Alice part, sous sa session ; puis la session se ferme ; puis on vide.
    expect(ordre.slice(0, 3)).toEqual([
      `envoyer ${COURS_DE_TEST}`,
      `envoyer ${AUTRE_COURS_DE_TEST}`,
      'deconnexion',
    ]);
    expect(serveur.evenements(COURS_DE_TEST)).toHaveLength(1);
    expect(serveur.evenements(AUTRE_COURS_DE_TEST)).toHaveLength(1);
    await verifierAppareilEfface(base, { noms, supprimes, desinscrits });
    // Le blocage est levé : une synchronisation suivante part de nouveau.
    await vi.waitFor(async () =>
      expect((await synchroniserCours(base, BERTHE, COURS_DE_TEST, serveur)).etat).toBe('a_jour'),
    );
  });

  it('deconnexion_reseau_absent_message_reseau', async () => {
    // Cause passagère : rien n'est effacé, la session reste, et le message dit quoi faire (R31b).
    const base = await appareilDAlice();
    const serveur = new ServeurFactice();
    serveur.panneEnvoi = erreurReseau();
    const { env, supprimes, desinscrits, ordre } = environnement();

    const echec = await deconnecter(base, ALICE, apiDeTest(serveur, ordre), env).catch(
      (erreur: unknown) => erreur,
    );

    expect(echec).toBeInstanceOf(ErreurReponsesEnAttente);
    expect((echec as ErreurReponsesEnAttente).motif).toBe('reseau');
    expect(messageDErreur(echec, textes.de)).toBe(textes.de.deconnexion_attente_reseau);
    expect(messageDErreur(echec, textes.fr)).toBe(textes.fr.deconnexion_attente_reseau);
    expect(ordre).not.toContain('deconnexion');
    expect(await contenuDeLaBase(base)).toMatchObject({
      cours: 1,
      file: 2,
      evenements: 2,
      etat: 1,
    });
    await verifierQueRienNEstEfface(base, serveur, { supprimes, desinscrits });
  });

  it('deconnexion_sans_reseau_ne_vide_rien', async () => {
    // La file vide, c'est la fermeture de la session qui échoue : rien n'est effacé, et la
    // personne reste connectée (R30).
    const base = await ouvrirBaseDeTest();
    await memoriserMoi(base, MOI_ALICE);
    await enregistrerCours(base, ALICE, servi);
    const { env, ordre, supprimes } = environnement();
    const api = apiDeTest(new ServeurFactice(), ordre, () =>
      Promise.reject(new ErreurApi(0, 'reseau')),
    );

    await expect(deconnecter(base, ALICE, api, env)).rejects.toMatchObject({ code: 'reseau' });

    expect(ordre).toEqual(['deconnexion']);
    expect(await contenuDeLaBase(base)).toMatchObject({ cours: 1, etat: 1 });
    expect(supprimes).toEqual([]);
  });

  it('deconnexion_session_expiree_file_non_vide_n_efface_rien', async () => {
    // Causes passagères : la session a expiré ou c'est celle d'une autre personne (se reconnecter
    // suffira), le serveur est en panne ou trop sollicité (réessayer suffira). Rien n'est effacé.
    for (const [echec, motif] of [
      [new ErreurApi(401, 'non_connecte'), 'session'],
      [new ErreurApi(409, 'autre_personne'), 'session'],
      [new ErreurApi(429, 'trop_de_requetes'), 'serveur'],
      [new ErreurApi(503, 'inconnue'), 'serveur'],
    ] as const) {
      const base = await appareilDAlice();
      const serveur = new ServeurFactice();
      serveur.panneEnvoi = echec;
      const { env, ordre, supprimes, desinscrits } = environnement();
      const api = apiDeTest(serveur, ordre, () => Promise.reject(echec));

      const erreur = await deconnecter(base, ALICE, api, env).catch((e: unknown) => e);

      expect(erreur, echec.code).toBeInstanceOf(ErreurReponsesEnAttente);
      expect((erreur as ErreurReponsesEnAttente).motif, echec.code).toBe(motif);
      // Le nombre de réponses que la personne perdrait en abandonnant (R31b).
      expect((erreur as ErreurReponsesEnAttente).enAttente, echec.code).toBe(2);
      expect(ordre, echec.code).not.toContain('deconnexion');
      expect(await fileDuCours(base, ALICE, COURS_DE_TEST), echec.code).toHaveLength(1);
      expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST), echec.code).toHaveLength(1);
      expect(await contenuDeLaBase(base), echec.code).toMatchObject({ cours: 1, etat: 1 });
      expect(await moiLocal(base), echec.code).toEqual(MOI_ALICE);
      expect(localStorage.getItem(cleDesPreferences(ALICE)), echec.code).not.toBeNull();
      expect([...supprimes, ...desinscrits], echec.code).toEqual([]);
    }
    // Le message dit la cause, en allemand et en français.
    for (const langue of ['de', 'fr'] as const) {
      expect(messageDErreur(new ErreurReponsesEnAttente('session', 2), textes[langue])).toBe(
        textes[langue].deconnexion_attente_session,
      );
      expect(messageDErreur(new ErreurReponsesEnAttente('serveur', 2), textes[langue])).toBe(
        textes[langue].deconnexion_attente_serveur,
      );
    }
  });

  it('deconnexion_abandon_vide_la_file_de_la_personne_et_garde_les_autres', async () => {
    // Cause passagère (la session a expiré) : la personne choisit de perdre ses réponses en
    // attente. La session se ferme, sa file est abandonnée et l'appareil vidé, mais la file d'une
    // autre personne reste (R31b, R33).
    const base = await appareilDAlice();
    await ajouterEvenement(base, BERTHE, reponseDeTest(COURS_DE_TEST, 3));
    const serveur = new ServeurFactice();
    serveur.panneEnvoi = new ErreurApi(401, 'non_connecte');
    const { env, ordre, supprimes, desinscrits } = environnement();

    await deconnecter(base, ALICE, apiDeTest(serveur, ordre), env, { abandonner: true });

    // L'envoi est tenté comme avant (il s'arrête au premier refus de la session), puis la session
    // est fermée.
    expect(ordre.slice(0, 2)).toEqual([`envoyer ${COURS_DE_TEST}`, 'deconnexion']);
    // Rien n'est parti : la session était expirée.
    expect(serveur.evenements(COURS_DE_TEST)).toHaveLength(0);
    expect(await coursEnAttente(base, ALICE)).toEqual([]);
    expect(await fileDuCours(base, BERTHE, COURS_DE_TEST)).toHaveLength(1);
    expect(await contenuDeLaBase(base)).toEqual({ ...VIDE, file: 1 });
    expect(await moiLocal(base)).toBeUndefined();
    expect(localStorage.getItem(cleDesPreferences(ALICE))).toBeNull();
    expect(supprimes).toHaveLength(2);
    expect(desinscrits).toHaveLength(2);
  });

  it('deconnexion_abandon_apres_suppression_du_compte', async () => {
    // Le compte a été supprimé, par la personne sur un autre appareil ou par le propriétaire : la
    // synchronisation et la déconnexion reçoivent 401. Rien ne pourra jamais partir : la file est
    // vidée, puis l'appareil (1e-D4, R31b).
    const base = await appareilDAlice();
    const serveur = new ServeurFactice();
    serveur.panneEnvoi = new ErreurApi(401, 'non_connecte');
    const { env, ordre, supprimes, desinscrits } = environnement();
    const api = apiDeTest(serveur, ordre, () => Promise.reject(new ErreurApi(401, 'non_connecte')));

    await deconnecter(base, ALICE, api, env, { abandonner: true });

    expect(ordre).toContain('deconnexion');
    expect(await contenuDeLaBase(base)).toEqual(VIDE);
    expect(localStorage.getItem(cleDesPreferences(ALICE))).toBeNull();
    expect(supprimes).toHaveLength(2);
    expect(desinscrits).toHaveLength(2);
  });

  it('deconnexion_abandon_sans_reseau_n_efface_rien', async () => {
    // La session ne se ferme pas : la personne reste connectée, et ses réponses en attente aussi
    // (R30 tient, même quand on abandonne).
    const base = await appareilDAlice();
    const serveur = new ServeurFactice();
    serveur.panneEnvoi = erreurReseau();
    const { env, ordre, supprimes, desinscrits } = environnement();
    const api = apiDeTest(serveur, ordre, () => Promise.reject(erreurReseau()));

    await expect(deconnecter(base, ALICE, api, env, { abandonner: true })).rejects.toMatchObject({
      code: 'reseau',
    });

    expect(ordre).toContain('deconnexion');
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
    expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toHaveLength(1);
    expect(await contenuDeLaBase(base)).toMatchObject({
      cours: 1,
      file: 2,
      evenements: 2,
      etat: 1,
    });
    expect(await moiLocal(base)).toEqual(MOI_ALICE);
    await verifierQueRienNEstEfface(base, serveur, { supprimes, desinscrits });
  });

  it('deconnexion_dont_l_appareil_refuse_de_s_effacer', async () => {
    // La session se ferme, puis le stockage refuse de se vider : l'échec remonte, mais ce
    // qui ne dépend pas de lui est effacé quand même, et les synchronisations reprennent.
    const base = await appareilDAlice();
    await ajouterEvenement(base, BERTHE, reponseDeTest(COURS_DE_TEST, 3));
    const refus = new Error('stockage plein');
    vi.mocked(viderSaufLesFiles).mockRejectedValueOnce(refus);
    const serveur = new ServeurFactice();
    const appareil = environnement();

    await expect(
      deconnecter(base, ALICE, apiDeTest(serveur, appareil.ordre), appareil.env),
    ).rejects.toBe(refus);

    // La file d'Alice part d'abord, la session se ferme, puis l'appareil s'efface (en partie).
    expect(appareil.ordre.slice(0, 3)).toEqual([
      `envoyer ${COURS_DE_TEST}`,
      `envoyer ${AUTRE_COURS_DE_TEST}`,
      'deconnexion',
    ]);
    await verifierApresUnRefusDEffacer(base, serveur, appareil);
  });

  it('deconnexion_avec_abandon_dont_la_file_refuse_de_s_effacer', async () => {
    // Même chose quand c'est l'abandon de la file qui échoue : la session expirée n'a rien laissé
    // partir, la file reste, mais le reste de l'appareil s'efface (1e-D11, R31b).
    const base = await appareilDAlice();
    await ajouterEvenement(base, BERTHE, reponseDeTest(COURS_DE_TEST, 3));
    const refus = new Error('stockage plein');
    vi.mocked(abandonnerLaFile).mockRejectedValueOnce(refus);
    const serveur = new ServeurFactice();
    serveur.panneEnvoi = new ErreurApi(401, 'non_connecte');
    const appareil = environnement();

    await expect(
      deconnecter(base, ALICE, apiDeTest(serveur, appareil.ordre), appareil.env, {
        abandonner: true,
      }),
    ).rejects.toBe(refus);

    // L'envoi s'arrête au premier refus de la session, qui se ferme.
    expect(appareil.ordre.slice(0, 2)).toEqual([`envoyer ${COURS_DE_TEST}`, 'deconnexion']);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
    expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toHaveLength(1);
    serveur.panneEnvoi = undefined;
    await verifierApresUnRefusDEffacer(base, serveur, appareil);
  });

  it('deconnexion_droit_retire_se_fait_et_garde_la_file', async () => {
    // Cause durable : le droit sur le cours est retiré, se reconnecter n'y changerait rien. La
    // déconnexion se fait ; la file du cours reste, pour partir si le droit revient (R31b, R33).
    const base = await appareilDAlice();
    const serveur = new ServeurFactice();
    serveur.liste = [];
    const { env, ordre, supprimes, desinscrits } = environnement();
    const api = apiDeTest(serveur, ordre);
    api.journal = apiDe(serveur, {
      envoyer: async (cours, evenements) => {
        ordre.push(`envoyer ${cours}`);
        if (cours === COURS_DE_TEST) throw new ErreurApi(404, 'introuvable');
        await serveur.envoyer(cours, evenements);
      },
    });

    await deconnecter(base, ALICE, api, env);

    expect(ordre).toContain('deconnexion');
    expect(serveur.evenements(AUTRE_COURS_DE_TEST)).toHaveLength(1);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
    expect(await contenuDeLaBase(base)).toEqual({ ...VIDE, file: 1 });
    expect(localStorage.getItem(cleDesPreferences(ALICE))).toBeNull();
    expect(supprimes).toHaveLength(2);
    expect(desinscrits).toHaveLength(2);
  });

  it('deconnexion_lot_refuse_se_fait_et_garde_la_file', async () => {
    // Cause durable : le serveur refuse le lot (400), le renvoyer tel quel n'y changerait rien.
    const base = await appareilDAlice();
    const serveur = new ServeurFactice();
    serveur.panneEnvoi = new ErreurApi(400, 'requete');
    const { env, ordre, supprimes } = environnement();

    await deconnecter(base, ALICE, apiDeTest(serveur, ordre), env);

    expect(ordre).toContain('deconnexion');
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
    expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toHaveLength(1);
    expect(await contenuDeLaBase(base)).toEqual({ ...VIDE, file: 2 });
    expect(supprimes).toHaveLength(2);
  });

  it('deconnexion_file_vide_apres_envoi_vide_tout', async () => {
    // Les réponses en attente partent : la file est vide, tout est effacé.
    const base = await appareilDAlice();
    const serveur = new ServeurFactice();
    const { env, ordre, supprimes } = environnement();

    await deconnecter(base, ALICE, apiDeTest(serveur, ordre), env);

    expect(serveur.evenements(COURS_DE_TEST)).toHaveLength(1);
    expect(await contenuDeLaBase(base)).toEqual(VIDE);
    expect(supprimes).toHaveLength(2);

    // Une session déjà expirée, sans rien en attente : elle l'est déjà sur le serveur (401), on
    // vide.
    const expiree = await ouvrirBaseDeTest();
    await memoriserMoi(expiree, MOI_ALICE);
    await enregistrerCours(expiree, ALICE, servi);
    const autre = environnement();
    const api = apiDeTest(new ServeurFactice(), autre.ordre, () =>
      Promise.reject(new ErreurApi(401, 'non_connecte')),
    );

    await deconnecter(expiree, ALICE, api, autre.env);

    expect(await contenuDeLaBase(expiree)).toEqual(VIDE);
    expect(autre.supprimes).toHaveLength(2);
  });

  it('deconnexion_de_la_personne_de_la_session_pas_de_l_identite_memorisee', async () => {
    // L'identité mémorisée est restée celle d'Alice ; la session est celle de Berthe, qui a une
    // réponse en attente : c'est sa file qui part (R35).
    const base = await appareilDAlice();
    await ajouterEvenement(base, BERTHE, reponseDeTest(COURS_DE_TEST, 3));
    const serveur = new ServeurFactice();
    const { env, ordre } = environnement();

    await deconnecter(base, BERTHE, apiDeTest(serveur, ordre), env);

    expect(serveur.evenements(COURS_DE_TEST).map(({ id }) => id)).toEqual([
      reponseDeTest(COURS_DE_TEST, 3).id,
    ]);
    // La file d'Alice, qui ne part pas sous la session de Berthe, reste.
    expect(await contenuDeLaBase(base)).toEqual({ ...VIDE, file: 2 });
  });

  it('deconnexion_sans_stockage_ni_service_worker', async () => {
    const ordre: string[] = [];
    ecrirePreferences(ALICE, servi.id, preferencesParDefaut(preparerCours(servi)));

    await deconnecter(undefined, ALICE, apiDeTest(new ServeurFactice(), ordre), {
      caches: undefined,
      conteneur: undefined,
    });

    expect(ordre).toEqual(['deconnexion']);
    expect(localStorage.getItem(cleDesPreferences(ALICE))).toBeNull();
  });

  it('deconnexion_attend_une_synchronisation_lente_dix_secondes_au_plus', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const base = await appareilDAlice();
    const serveur = new ServeurFactice();
    // Un envoi qui ne répond jamais.
    const { env, ordre } = environnement();
    const api = apiDeTest(serveur, ordre);
    api.journal = apiDe(serveur, { envoyer: () => new Promise(() => {}) });
    let fini = false;

    const deconnexion = deconnecter(base, ALICE, api, env).then(
      () => 'reussie',
      (erreur: unknown) => erreur,
    );
    void deconnexion.finally(() => {
      fini = true;
    });
    await vi.advanceTimersByTimeAsync(9_900);
    expect(fini).toBe(false);

    // Au bout de 10 s, la déconnexion rend la main : les réponses ne sont pas parties (un réseau
    // trop lent), elle ne ferme rien et n'efface rien.
    await vi.advanceTimersByTimeAsync(200);
    const echec = await deconnexion;
    expect(echec).toBeInstanceOf(ErreurReponsesEnAttente);
    expect((echec as ErreurReponsesEnAttente).motif).toBe('reseau');
    expect(ordre).not.toContain('deconnexion');
    expect(await contenuDeLaBase(base)).toMatchObject({ cours: 1, file: 2, etat: 1 });
  });

  it('deconnexion_nettoie_ce_qu_une_synchronisation_d_avant_range_apres', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    // Alice n'a rien en attente ; une lecture de son journal est en vol, et tarde.
    const base = await ouvrirBaseDeTest();
    await memoriserMoi(base, MOI_ALICE);
    await enregistrerCours(base, ALICE, servi);
    const serveur = new ServeurFactice();
    serveur.deposer(COURS_DE_TEST, [reponseDeTest(COURS_DE_TEST, 7)]);
    let liberer = () => {};
    let signaler = () => {};
    const porte = new Promise<void>((resolve) => {
      liberer = resolve;
    });
    const partie = new Promise<void>((resolve) => {
      signaler = resolve;
    });
    const lente = apiDe(serveur, {
      lire: async (cours, depuis) => {
        signaler();
        await porte;
        return serveur.lire(cours, depuis);
      },
    });
    const enCours = synchroniserCours(base, ALICE, COURS_DE_TEST, lente);
    await partie;
    const { env, ordre } = environnement();

    const deconnexion = deconnecter(base, ALICE, apiDeTest(serveur, ordre), env);
    await vi.advanceTimersByTimeAsync(10_000);
    await deconnexion;
    expect(await contenuDeLaBase(base)).toEqual(VIDE);

    // La lecture aboutit après le vidage et range le journal d'Alice : le nettoyage final, une
    // fois finie cette synchronisation d'avant, le retire.
    liberer();
    await enCours;
    await vi.waitFor(async () => expect(await contenuDeLaBase(base)).toEqual(VIDE));
  });
});

describe('supprimerLeCompte (1e-D4)', () => {
  it('supprimer_le_compte_efface_tout_y_compris_sa_file', async () => {
    const base = await appareilDAlice();
    // La file d'une autre personne, restée sur l'appareil : elle n'est pas à effacer.
    await ajouterEvenement(base, BERTHE, reponseDeTest(COURS_DE_TEST, 3));
    localStorage.setItem('ancrage.appareil', APPAREIL_DE_TEST);
    const signalAllAcceptedCredentials = vi.fn(async () => {});
    vi.stubGlobal('PublicKeyCredential', { signalAllAcceptedCredentials });
    const serveur = new ServeurFactice();
    const { env, ordre, noms, supprimes, desinscrits } = environnement();
    // Pendant la suppression, rien ne part : la file d'Alice ne doit pas être envoyée sous une
    // session qui s'efface.
    const pendant: string[] = [];
    const api = apiDeTest(serveur, ordre, undefined, async () => {
      pendant.push((await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).etat);
    });

    const effacement = await supprimerLeCompte(base, ALICE, api, env);

    // Le serveur supprime d'abord, au nom d'Alice (1e-R13), puis l'appareil est effacé (caches,
    // service worker). Les réponses en attente ne sont pas envoyées : elles partent avec le compte.
    expect(effacement).toBe('complet');
    expect(ordre).toEqual([
      `suppression ${ALICE}`,
      ...noms.map((nom) => `supprimer ${nom}`),
      'desinscrire sw',
      'desinscrire ancien',
    ]);
    expect(pendant).toEqual(['en_attente']);
    expect(serveur.evenements(COURS_DE_TEST)).toHaveLength(0);
    // Tout est vidé, la file d'Alice comprise.
    expect(await coursEnAttente(base, ALICE)).toEqual([]);
    await verifierAppareilEfface(base, { noms, supprimes, desinscrits });
    // Le téléphone n'accepte plus aucune passkey pour cette personne : il efface les siennes.
    expect(signalAllAcceptedCredentials).toHaveBeenCalledTimes(1);
    expect(signalAllAcceptedCredentials).toHaveBeenCalledWith({
      rpId: location.hostname,
      userId: identifiantUtilisateur(ALICE),
      allAcceptedCredentialIds: [],
    });
    // Le blocage est levé : la file de Berthe repart sous sa propre session.
    await vi.waitFor(async () =>
      expect((await synchroniserCours(base, BERTHE, COURS_DE_TEST, serveur)).etat).toBe('a_jour'),
    );
  });

  it('supprimer_le_compte_en_echec_n_efface_rien', async () => {
    // Le serveur ne répond pas, refuse (le propriétaire ne se supprime pas, ou la session est celle
    // d'une autre personne : 1e-R13), tombe en panne ou ne reconnaît plus la session : le compte
    // existe encore, l'appareil reste tel quel, aucun signal ne part, et l'erreur remonte telle
    // quelle.
    for (const echec of [
      new ErreurApi(0, 'reseau'),
      new ErreurApi(409, 'proprietaire'),
      new ErreurApi(409, 'autre_personne'),
      new ErreurApi(400, 'requete'),
      new ErreurApi(500, 'interne'),
      new ErreurApi(401, 'non_connecte'),
    ]) {
      const base = await appareilDAlice();
      const signalAllAcceptedCredentials = vi.fn(async () => {});
      vi.stubGlobal('PublicKeyCredential', { signalAllAcceptedCredentials });
      const serveur = new ServeurFactice();
      const { env, ordre, supprimes, desinscrits } = environnement();
      const api = apiDeTest(serveur, ordre, undefined, () => Promise.reject(echec));

      await expect(supprimerLeCompte(base, ALICE, api, env), echec.code).rejects.toBe(echec);

      expect(ordre, echec.code).toEqual([`suppression ${ALICE}`]);
      expect(await contenuDeLaBase(base), echec.code).toMatchObject({
        cours: 1,
        file: 2,
        evenements: 2,
        etat: 1,
      });
      expect(await moiLocal(base), echec.code).toEqual(MOI_ALICE);
      expect(localStorage.getItem(cleDesPreferences(ALICE)), echec.code).not.toBeNull();
      expect([...supprimes, ...desinscrits], echec.code).toEqual([]);
      expect(signalAllAcceptedCredentials, echec.code).not.toHaveBeenCalled();
      // Le blocage est levé : la file d'Alice peut repartir.
      await vi.waitFor(async () =>
        expect((await synchroniserCours(base, ALICE, COURS_DE_TEST, serveur)).etat).toBe('a_jour'),
      );
    }
  });

  it('supprimer_le_compte_sans_stockage_efface_les_preferences_et_signale', async () => {
    const signalAllAcceptedCredentials = vi.fn(async () => {});
    vi.stubGlobal('PublicKeyCredential', { signalAllAcceptedCredentials });
    ecrirePreferences(ALICE, servi.id, preferencesParDefaut(preparerCours(servi)));
    const ordre: string[] = [];

    await supprimerLeCompte(undefined, ALICE, apiDeTest(new ServeurFactice(), ordre), {
      caches: undefined,
      conteneur: undefined,
    });

    expect(ordre).toEqual([`suppression ${ALICE}`]);
    expect(localStorage.getItem(cleDesPreferences(ALICE))).toBeNull();
    expect(signalAllAcceptedCredentials).toHaveBeenCalledTimes(1);
  });

  it('supprimer_le_compte_dont_l_appareil_refuse_de_s_effacer_le_dit_et_signale_quand_meme', async () => {
    // Le serveur a supprimé le compte, puis le stockage refuse de se vider (1e-R14) : il n'y a plus
    // de retour en arrière, donc rien n'échoue. Le téléphone est prié d'oublier les passkeys, ce
    // qui ne dépend pas du stockage (préférences, caches, service worker) s'efface quand même,
    // l'appareil ne connaît plus la personne, et le résultat dit que l'effacement est incomplet.
    const base = await appareilDAlice();
    const signalAllAcceptedCredentials = vi.fn(async () => {});
    vi.stubGlobal('PublicKeyCredential', { signalAllAcceptedCredentials });
    vi.mocked(viderSaufLesFiles).mockRejectedValueOnce(new Error('stockage plein'));
    const serveur = new ServeurFactice();
    const { env, noms, supprimes, desinscrits } = environnement();
    const ordre: string[] = [];

    const effacement = await supprimerLeCompte(base, ALICE, apiDeTest(serveur, ordre), env);

    expect(effacement).toBe('incomplet');
    expect(signalAllAcceptedCredentials).toHaveBeenCalledTimes(1);
    expect(signalAllAcceptedCredentials).toHaveBeenCalledWith({
      rpId: location.hostname,
      userId: identifiantUtilisateur(ALICE),
      allAcceptedCredentialIds: [],
    });
    expect(localStorage.getItem(cleDesPreferences(ALICE))).toBeNull();
    expect(supprimes).toEqual(noms);
    expect(desinscrits).toEqual(['sw', 'ancien']);
    expect(await moiLocal(base)).toBeUndefined();
    // Le blocage est levé.
    await vi.waitFor(async () =>
      expect((await synchroniserCours(base, BERTHE, COURS_DE_TEST, serveur)).etat).toBe('a_jour'),
    );
  });

  it('supprimer_le_compte_n_attend_pas_un_signal_qui_ne_revient_jamais', async () => {
    // Une promesse du navigateur qui ne se résout pas ne doit pas retenir le rechargement (1e-R14).
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const base = await appareilDAlice();
    vi.stubGlobal('PublicKeyCredential', {
      signalAllAcceptedCredentials: () => new Promise<void>(() => {}),
    });
    const { env } = environnement();
    let fini = false;

    const suppression = supprimerLeCompte(
      base,
      ALICE,
      apiDeTest(new ServeurFactice(), []),
      env,
    ).then((effacement) => {
      fini = true;
      return effacement;
    });
    // Moins que les 10 s des synchronisations : c'est la limite du signal qui délivre.
    for (let i = 0; i < 60 && !fini; i++) await vi.advanceTimersByTimeAsync(100);

    expect(fini).toBe(true);
    expect(await suppression).toBe('complet');
    expect(await contenuDeLaBase(base)).toEqual(VIDE);
  });
});

describe('verifierLaSuppression (2d-D5)', () => {
  it('verification_sans_suppression_ne_touche_a_rien', async () => {
    const base = await appareilDAlice();
    const signalAllAcceptedCredentials = vi.fn(async () => {});
    vi.stubGlobal('PublicKeyCredential', { signalAllAcceptedCredentials });
    const avant = await contenuDeLaBase(base);
    const { env, supprimes, desinscrits } = environnement();

    const effacement = await verifierLaSuppression(base, ALICE, async () => false, env);

    expect(effacement).toBeUndefined();
    expect(await contenuDeLaBase(base)).toEqual(avant);
    expect(await moiLocal(base)).toEqual(MOI_ALICE);
    expect(localStorage.getItem(cleDesPreferences(ALICE))).not.toBeNull();
    expect([...supprimes, ...desinscrits]).toEqual([]);
    expect(signalAllAcceptedCredentials).not.toHaveBeenCalled();
  });

  it('compte_supprime_ailleurs_efface_tout_file_comprise', async () => {
    const base = await appareilDAlice();
    // La file d'une autre personne, restée sur l'appareil, n'est pas à effacer.
    await ajouterEvenement(base, BERTHE, reponseDeTest(COURS_DE_TEST, 3));
    localStorage.setItem('ancrage.appareil', APPAREIL_DE_TEST);
    expect(await coursEnAttente(base, ALICE)).not.toEqual([]);
    const signalAllAcceptedCredentials = vi.fn(async () => {});
    vi.stubGlobal('PublicKeyCredential', { signalAllAcceptedCredentials });
    const { env, noms, supprimes, desinscrits } = environnement();

    const effacement = await verifierLaSuppression(base, ALICE, async () => true, env);

    expect(effacement).toBe('complet');
    expect(await coursEnAttente(base, ALICE)).toEqual([]);
    await verifierAppareilEfface(base, { noms, supprimes, desinscrits });
    expect(await moiLocal(base)).toBeUndefined();
    expect(signalAllAcceptedCredentials).toHaveBeenCalledTimes(1);
    expect(signalAllAcceptedCredentials).toHaveBeenCalledWith({
      rpId: location.hostname,
      userId: identifiantUtilisateur(ALICE),
      allAcceptedCredentialIds: [],
    });
  });

  it('compte_supprime_ailleurs_stockage_refuse_incomplet', async () => {
    const base = await appareilDAlice();
    const signalAllAcceptedCredentials = vi.fn(async () => {});
    vi.stubGlobal('PublicKeyCredential', { signalAllAcceptedCredentials });
    vi.mocked(viderSaufLesFiles).mockRejectedValueOnce(new Error('stockage plein'));
    const { env, noms, supprimes, desinscrits } = environnement();

    const effacement = await verifierLaSuppression(base, ALICE, async () => true, env);

    expect(effacement).toBe('incomplet');
    expect(await moiLocal(base)).toBeUndefined();
    expect(localStorage.getItem(cleDesPreferences(ALICE))).toBeNull();
    expect(supprimes).toEqual(noms);
    expect(desinscrits).toEqual(['sw', 'ancien']);
    expect(signalAllAcceptedCredentials).toHaveBeenCalledTimes(1);
  });

  it('une_verification_qui_echoue_n_efface_rien', async () => {
    const base = await appareilDAlice();
    const avant = await contenuDeLaBase(base);
    const { env } = environnement();

    const effacement = await verifierLaSuppression(
      base,
      ALICE,
      () => Promise.reject(new Error('panne')),
      env,
    );

    expect(effacement).toBeUndefined();
    expect(await contenuDeLaBase(base)).toEqual(avant);
  });

  it('envoi_avant_deconnexion_401_compte_supprime_comme_non_connecte', async () => {
    // Un 401 `compte_supprime` est un `non_connecte` marqué (2d-D3) : l'envoi qui précède la
    // déconnexion le tient pour une session perdue, comme avant (point de revue 1).
    const issues: unknown[] = [];
    for (const echec of [
      new ErreurApi(401, 'non_connecte'),
      new ErreurApi(401, 'non_connecte', true),
    ]) {
      const base = await appareilDAlice();
      const serveur = new ServeurFactice();
      serveur.panneEnvoi = echec;
      const { env, ordre } = environnement();
      const api = apiDeTest(serveur, ordre, () => Promise.reject(echec));

      const erreur = await deconnecter(base, ALICE, api, env).catch((e: unknown) => e);

      expect(erreur).toBeInstanceOf(ErreurReponsesEnAttente);
      expect((erreur as ErreurReponsesEnAttente).motif).toBe('session');
      expect(ordre).not.toContain('deconnexion');
      issues.push([
        (erreur as ErreurReponsesEnAttente).motif,
        (erreur as ErreurReponsesEnAttente).enAttente,
        await contenuDeLaBase(base),
        await moiLocal(base),
      ]);
    }
    expect(issues[1]).toEqual(issues[0]);
  });
});

describe('la note des envois (2b-D4)', () => {
  it('abandon_et_suppression_effacent_la_note', async () => {
    const effacements = {
      abandon: (base: BaseLocale, api: ApiSession, env: EnvironnementDeconnexion) =>
        deconnecter(base, ALICE, api, env, { abandonner: true }),
      suppression: (base: BaseLocale, api: ApiSession, env: EnvironnementDeconnexion) =>
        supprimerLeCompte(base, ALICE, api, env),
    };
    for (const [nom, effacer] of Object.entries(effacements)) {
      const base = await appareilDAlice();
      const serveur = new ServeurFactice();
      // Le service worker envoie la file d'Alice sans rien lire : ses deux réponses, une par cours,
      // sont dans la note des envois.
      await envoyerFile(base, ALICE, serveur);
      expect(await noteDesEnvois(base, ALICE, COURS_DE_TEST), nom).toEqual([idDeTest(1)]);
      expect(await noteDesEnvois(base, ALICE, AUTRE_COURS_DE_TEST), nom).toEqual([idDeTest(2)]);
      const { env, ordre } = environnement();

      await effacer(base, apiDeTest(serveur, ordre), env);

      // La note part avec le reste : elle vit dans l'enregistrement du curseur.
      expect(await noteDesEnvois(base, ALICE, COURS_DE_TEST), nom).toEqual([]);
      expect(await noteDesEnvois(base, ALICE, AUTRE_COURS_DE_TEST), nom).toEqual([]);
      expect(await contenuDeLaBase(base), nom).toEqual(VIDE);
    }
  });
});

describe('adopterPersonne (R35)', () => {
  it('reserver_echoue_l_identite_precedente_ne_reste_pas', async () => {
    const base = await appareilDAlice();
    vi.mocked(reserverA).mockRejectedValueOnce(new Error('stockage plein'));

    // Berthe ouvre l'application sous sa session ; l'appareil ne peut pas lui être réservé.
    const etat = await resoudreSession(base, async () => MOI_BERTHE);

    // La connexion se fait, et l'échec est signalé.
    expect(etat).toEqual({ etat: 'connecte', moi: MOI_BERTHE, stockageEnEchec: true });
    // L'identité d'Alice ne reste pas.
    expect((await moiLocal(base))?.id).not.toBe(ALICE);
    // Au démarrage hors ligne suivant, rien d'Alice ne s'affiche.
    const horsLigne = await resoudreSession(base, sansReseau);
    expect(horsLigne).not.toMatchObject({ moi: MOI_ALICE });
    expect(await coursLocal(base, ALICE, servi.id)).toBeUndefined();
    // Au démarrage en ligne suivant, l'appareil est réservé à Berthe.
    expect(await resoudreSession(base, async () => MOI_BERTHE)).toEqual({
      etat: 'connecte',
      moi: MOI_BERTHE,
    });
    expect(await moiLocal(base)).toEqual(MOI_BERTHE);
    // La file d'Alice, elle, reste.
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
  });
});

describe('suspendreLesSynchronisations (R19)', () => {
  /** Un faux serveur dont l'envoi attend qu'on le libère ; `parti` : la requête est en vol. */
  function serveurRetenu() {
    const serveur = new ServeurFactice();
    let liberer = () => {};
    let signaler = () => {};
    const porte = new Promise<void>((resolve) => {
      liberer = resolve;
    });
    const parti = new Promise<void>((resolve) => {
      signaler = resolve;
    });
    const api = apiDe(serveur, {
      envoyer: async (cours, evenements) => {
        signaler();
        await porte;
        await serveur.envoyer(cours, evenements);
      },
    });
    return { serveur, api, parti, liberer: () => liberer() };
  }

  it('bloque_annule_les_minuteurs_et_attend_celles_en_cours', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const base = await appareilDAlice();
    const { serveur, api, parti, liberer } = serveurRetenu();
    const programmee = vi.fn();
    planifierApresReponse(programmee);
    const enCours = synchroniserCours(base, ALICE, COURS_DE_TEST, api);
    await parti;
    let suspendu = false;

    const suspension = suspendreLesSynchronisations(base).then((reprendre) => {
      suspendu = true;
      return reprendre;
    });
    await vi.advanceTimersByTimeAsync(100);
    // La synchronisation en vol se termine avant que la suspension ne rende la main.
    expect(suspendu).toBe(false);
    liberer();
    const reprendre = await suspension;
    await enCours;

    // Pendant la suspension : aucune requête.
    const lectures = serveur.lectures.length;
    expect((await synchroniserCours(base, ALICE, AUTRE_COURS_DE_TEST, serveur)).etat).toBe(
      'en_attente',
    );
    expect(serveur.lectures).toHaveLength(lectures);
    // Le minuteur des 3 s est annulé.
    await vi.advanceTimersByTimeAsync(5000);
    expect(programmee).not.toHaveBeenCalled();

    reprendre();
    await vi.waitFor(async () =>
      expect((await synchroniserCours(base, ALICE, AUTRE_COURS_DE_TEST, serveur)).etat).toBe(
        'a_jour',
      ),
    );
  });

  it('une_synchronisation_trop_lente_ne_repart_jamais_sous_la_nouvelle_session', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const base = await appareilDAlice();
    const { serveur, api, parti, liberer } = serveurRetenu();
    const enCours = synchroniserCours(base, ALICE, COURS_DE_TEST, api);
    await parti;

    // Elle ne finit pas dans les 10 s : la suspension rend la main quand même.
    const suspension = suspendreLesSynchronisations(base);
    await vi.advanceTimersByTimeAsync(10_000);
    const reprendre = await suspension;

    // La nouvelle session est en place ; on reprend. Tant que l'ancienne n'a pas fini (10 s au
    // plus), le blocage tient : sa suite (la lecture) ne part pas sous la nouvelle session.
    reprendre();
    await vi.advanceTimersByTimeAsync(1000);
    expect((await synchroniserCours(base, BERTHE, COURS_DE_TEST, serveur)).etat).toBe('en_attente');
    liberer();
    await enCours;
    expect(serveur.lectures).toEqual([]);

    // Elle a fini : le blocage est levé.
    await vi.waitFor(async () =>
      expect((await synchroniserCours(base, BERTHE, COURS_DE_TEST, serveur)).etat).toBe('a_jour'),
    );
  });

  it('une_synchronisation_qui_pend_ne_bloque_pas_la_suivante_plus_de_dix_secondes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const base = await appareilDAlice();
    const { serveur, api, parti } = serveurRetenu();
    // Une synchronisation dont la requête ne revient jamais.
    void synchroniserCours(base, ALICE, COURS_DE_TEST, api);
    await parti;

    const suspension = suspendreLesSynchronisations(base);
    await vi.advanceTimersByTimeAsync(10_000);
    const reprendre = await suspension;
    reprendre();
    await vi.advanceTimersByTimeAsync(9_000);
    expect((await synchroniserCours(base, BERTHE, COURS_DE_TEST, serveur)).etat).toBe('en_attente');

    // Au bout de 10 s d'attente de la reprise, le blocage est levé quand même : la personne
    // suivante n'attend pas une requête qui pend.
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.waitFor(async () =>
      expect((await synchroniserCours(base, BERTHE, COURS_DE_TEST, serveur)).etat).toBe('a_jour'),
    );
  });

  it('sans_base_locale_rien_a_suspendre', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const programmee = vi.fn();
    planifierApresReponse(programmee);

    const reprendre = await suspendreLesSynchronisations(undefined);

    // Sans base, aucune synchronisation à attendre ; les minuteurs sont annulés quand même.
    expect(reprendre).toBeTypeOf('function');
    expect(reprendre()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(programmee).not.toHaveBeenCalled();
  });
});
