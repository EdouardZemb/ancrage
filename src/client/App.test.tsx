// @vitest-environment happy-dom
/*
 * L'application entière, sur une base locale de test et un faux serveur (`fetch` simulé) : le
 * démarrage hors ligne, la session expirée, la connexion d'une autre personne et la déconnexion
 * (tâche 12, décisions 12 à 15).
 */
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { valeursDeNoticeDExemple } from '../domaine/contenu/exemple.fixture.js';
import { coursServiDeTest } from '../domaine/cours/cours.fixture.js';
import { preparerCours } from '../domaine/cours/prepare.js';
import type { Evenement } from '../domaine/journal/evenement.js';
import { GABARIT_DE_NOTICE } from '../domaine/notice-gabarit.js';
import { App } from './App.js';
import type { CoursResume, Moi, PasskeyEnregistree, ReponseAppareils } from './api.js';
import { formaterDate } from './composants.js';
import { reponseDeTest } from './cours/contexte-cours.fixture.js';
import { ecrirePreferences, preferencesParDefaut } from './cours/preferences.js';
import { formater, TEXTES_COURS } from './cours/textes-cours.js';
import { annulerSynchrosProgrammees } from './declencheurs.js';
import { Appareils } from './ecrans/Appareils.js';
import { lireNoticeLocale } from './notice-locale.js';
import { identifiantUtilisateur } from './passkeys-signal.js';
import { json } from './reponse.fixture.js';
import { destinationDeLAccueil, naviguer, rechargerSur } from './routeur.js';
import { verifierLaSuppression } from './session-locale.js';
import { fermerLesBasesDeTest, ouvrirBaseDeTest } from './stockage/base-locale.fixture.js';
import {
  type BaseLocale,
  memoriserMoi,
  moiLocal,
  oublierMoi,
  reserverA,
  viderSaufLesFiles,
} from './stockage/base-locale.js';
import {
  coursLocal,
  enregistrerCours,
  enregistrerListe,
  listeLocale,
} from './stockage/cours-local.js';
import { ALICE, BERTHE } from './stockage/evenements.fixture.js';
import { ajouterEvenement, evenementsDuCours, fileDuCours } from './stockage/journal-local.js';
import { synchroniserCours } from './synchro.js';
import { textes } from './textes.js';

const page = vi.hoisted(() => ({ base: undefined as BaseLocale | undefined }));
vi.mock('./stockage/base-de-la-page.js', () => ({
  baseDeLaPage: async () => {
    if (page.base === undefined) throw new Error('base de test absente');
    return page.base;
  },
}));
vi.mock('@simplewebauthn/browser', async (original) => ({
  ...(await original<typeof import('@simplewebauthn/browser')>()),
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
}));
// Le rechargement complet qui suit une déconnexion : happy-dom ne recharge pas la page. Et
// `destinationDeLAccueil`, réelle, mais dont un test fait échouer le rendu de l'accueil (1f-D11).
vi.mock('./routeur.js', async (original) => {
  const reel = await original<typeof import('./routeur.js')>();
  return {
    ...reel,
    rechargerSur: vi.fn(),
    destinationDeLAccueil: vi.fn(reel.destinationDeLAccueil),
  };
});
// L'écran des appareils, réel, mais dont un test fait échouer le rendu (1e-D13).
vi.mock('./ecrans/Appareils.js', async (original) => {
  const reel = await original<typeof import('./ecrans/Appareils.js')>();
  return { ...reel, Appareils: vi.fn(reel.Appareils) };
});
// `oublierMoi`, `reserverA` et `viderSaufLesFiles`, réels, mais dont un test simule l'échec (R35, 1e-R14).
vi.mock('./stockage/base-locale.js', async (original) => {
  const reel = await original<typeof import('./stockage/base-locale.js')>();
  return {
    ...reel,
    oublierMoi: vi.fn(reel.oublierMoi),
    reserverA: vi.fn(reel.reserverA),
    viderSaufLesFiles: vi.fn(reel.viderSaufLesFiles),
  };
});

// `verifierLaSuppression`, réelle, mais dont un test retient l'effacement en attente (2d-D5).
vi.mock('./session-locale.js', async (original) => {
  const reel = await original<typeof import('./session-locale.js')>();
  return { ...reel, verifierLaSuppression: vi.fn(reel.verifierLaSuppression) };
});

const servi = coursServiDeTest();
const ID = servi.id;
const RESUME: CoursResume = { id: ID, titre: servi.titre, langue: 'de' };
const ALICE_DE: Moi = { id: ALICE, nomAffiche: 'Lernende Test', langue: 'de', proprietaire: false };
const BERTHE_FR: Moi = {
  id: BERTHE,
  nomAffiche: 'Andere Lernende Test',
  langue: 'fr',
  proprietaire: false,
};
const de = textes.de;
const tc = TEXTES_COURS.de;
const NOTICE = valeursDeNoticeDExemple();
const clePreferences = (personne: string) => `ancrage.preferences.${personne}.${ID}`;

/** `navigator.storage`, simulé : le navigateur n'a pas encore accordé la persistance (1e-D12). */
const stockage = { persisted: vi.fn(async () => false), persist: vi.fn(async () => true) };

/** L'échéance du lien de connexion que le faux serveur dit actif, ou crée. */
const EXPIRE_LE = '2026-10-19T10:30:00.000Z';

/** Le faux serveur : ce qu'il sait, ce qu'il a reçu. */
interface FauxServeur {
  enLigne: boolean;
  /** La personne de la session du navigateur, `undefined` sans session valide. */
  session: Moi | undefined;
  /** La personne que la prochaine connexion par passkey ouvre. */
  prochaineSession: Moi | undefined;
  /** Les événements reçus, par personne. */
  recus: Map<string, Evenement[]>;
  /** Les envois du journal, avec la personne qu'ils nomment. */
  envois: { personne: string | undefined; statut: number }[];
  deconnexions: number;
  /** La fermeture de la session échoue (500) : le serveur répond, mais ne la ferme pas. */
  deconnexionEnPanne: boolean;
  /**
   * Les écritures sur `/api/moi` (modifier le profil, supprimer le compte), dans l'ordre, avec les
   * signaux que le téléphone a reçus entre elles.
   */
  appels: string[];
  /** Les comptes supprimés (`DELETE /api/moi`). */
  suppressions: number;
  /**
   * Le registre des suppressions : sans session, l'en-tête qui nomme l'un de ces comptes reçoit 401
   * `compte_supprime` au lieu de `non_connecte` (2d-D2).
   */
  comptesSupprimes: string[];
  /** La suppression du compte échoue (500) : le serveur répond, mais ne supprime rien. */
  suppressionEnPanne: boolean;
  /**
   * La suppression du compte est faite, mais sa réponse se perd : le téléphone ne voit qu'une
   * erreur de réseau (I2).
   */
  suppressionSansReponse: boolean;
  /**
   * Les requêtes refusées parce que l'en-tête nommait une autre personne : lectures de la liste,
   * d'un contenu ou des appareils, profil et lien pour un autre appareil.
   */
  refus: string[];
  /**
   * Un serveur d'avant le lot 1e, après un retour arrière : il ignore l'en-tête
   * `x-ancrage-personne` du profil, des appareils et des liens, et agit sous la session.
   */
  enteteIgnore: boolean;
  /** Les passkeys de la personne (`GET /api/moi/appareils`). */
  passkeys: PasskeyEnregistree[];
  /**
   * Le lien de connexion actif de la personne, `null` sans lien (1e-D7). `undefined` : un serveur
   * d'avant le lot 1e, dont la réponse n'a pas ce champ (ADR-0008).
   */
  lien: ReponseAppareils['lien'];
  /** Le corps de chaque requête d'invitation reçue, options puis création. */
  invitations: { options: unknown[]; creations: unknown[] };
}

let serveur: FauxServeur;

const NON_CONNECTE = () => json({ erreur: 'non_connecte' }, 401);

function repondre(url: string, init: RequestInit | undefined): Response {
  const methode = init?.method ?? 'GET';
  const chemin = url.split('?')[0];
  if (chemin === '/api/sante') {
    return json({
      statut: 'ok',
      environnement: 'ci',
      version: '0.0.0',
      revision: 'local',
      schema: 2,
      instance: 'i-1',
    });
  }
  if (chemin === '/api/notice') return json(NOTICE);
  if (chemin === '/api/auth/connexion/options') {
    return json({ options: { challenge: 'defi-de-test' }, ceremonie: 'ceremonie-de-test' });
  }
  if (chemin === '/api/auth/connexion') {
    serveur.session = serveur.prochaineSession;
    return new Response(null, { status: 204 });
  }
  if (chemin === '/api/auth/invitation/options') {
    serveur.invitations.options.push(JSON.parse(String(init?.body)));
    return json({ options: { challenge: 'defi-de-test' }, ceremonie: 'ceremonie-de-test' });
  }
  if (chemin === '/api/auth/invitation') {
    serveur.invitations.creations.push(JSON.parse(String(init?.body)));
    serveur.session = serveur.prochaineSession;
    return json({ personne: serveur.session?.id });
  }
  const { session } = serveur;
  if (chemin === '/api/auth/deconnexion') {
    if (serveur.deconnexionEnPanne) return json({ erreur: 'interne' }, 500);
    serveur.deconnexions += 1;
    serveur.session = undefined;
    return session === undefined ? NON_CONNECTE() : new Response(null, { status: 204 });
  }
  const entetes = (init?.headers ?? {}) as Record<string, string | undefined>;
  const personne = entetes['x-ancrage-personne'];
  if (session === undefined) {
    return personne !== undefined && serveur.comptesSupprimes.includes(personne)
      ? json({ erreur: 'compte_supprime' }, 401)
      : NON_CONNECTE();
  }
  // Comme le serveur, sur les routes du compte qui existaient avant le lot 1e : l'en-tête de
  // l'écran, s'il est là, nomme la personne de la session (1e-R15) ; sinon, rien n'est fait.
  const autrePersonne = (route: string): Response | undefined => {
    if (serveur.enteteIgnore || personne === undefined || personne === session.id) {
      return undefined;
    }
    serveur.refus.push(route);
    return json({ erreur: 'autre_personne' }, 409);
  };
  if (chemin === '/api/moi' && methode === 'PATCH') {
    const refus = autrePersonne('PATCH /api/moi');
    if (refus !== undefined) return refus;
    serveur.appels.push('PATCH /api/moi');
    serveur.session = { ...session, ...(JSON.parse(String(init?.body)) as Partial<Moi>) };
    return json(serveur.session);
  }
  if (chemin === '/api/moi' && methode === 'DELETE') {
    serveur.appels.push('DELETE /api/moi');
    if (serveur.suppressionEnPanne) return json({ erreur: 'interne' }, 500);
    // La personne de l'écran est exigée, et doit être celle de la session (1e-R13).
    if (personne === undefined) return json({ erreur: 'requete' }, 400);
    if (personne !== session.id) return json({ erreur: 'autre_personne' }, 409);
    // Le compte du propriétaire ne se supprime pas (1e-D4).
    if (session.proprietaire) return json({ erreur: 'proprietaire' }, 409);
    serveur.suppressions += 1;
    serveur.session = undefined;
    if (serveur.suppressionSansReponse) throw new TypeError('Failed to fetch');
    return new Response(null, { status: 204 });
  }
  if (chemin === '/api/moi') return json(session);
  if (chemin === '/api/moi/appareils') {
    const refus = autrePersonne(chemin);
    if (refus !== undefined) return refus;
    const appareils: ReponseAppareils = {
      sessions: [
        {
          id: 'session-courante',
          appareil: 'autre',
          creeLe: '2026-10-16T08:00:00.000Z',
          utiliseLe: '2026-10-17T08:00:00.000Z',
          courante: true,
        },
      ],
      passkeys: serveur.passkeys,
      lien: serveur.lien,
    };
    return json(appareils);
  }
  if (chemin === '/api/moi/lien' && methode === 'POST') {
    const refus = autrePersonne('POST /api/moi/lien');
    if (refus !== undefined) return refus;
    serveur.appels.push('POST /api/moi/lien');
    serveur.lien = { expireLe: EXPIRE_LE };
    return json({ lien: 'https://ancrage.test/lien/exemple' });
  }
  if (chemin === '/api/moi/lien' && methode === 'DELETE') {
    const refus = autrePersonne('DELETE /api/moi/lien');
    if (refus !== undefined) return refus;
    serveur.appels.push('DELETE /api/moi/lien');
    serveur.lien = null;
    return new Response(null, { status: 204 });
  }
  if (chemin.startsWith('/api/moi/passkeys/') && methode === 'DELETE') {
    serveur.appels.push('DELETE /api/moi/passkeys');
    const supprimee = decodeURIComponent(chemin.slice('/api/moi/passkeys/'.length));
    serveur.passkeys = serveur.passkeys.filter((passkey) => passkey.id !== supprimee);
    return new Response(null, { status: 204 });
  }
  if (chemin === '/api/cours' || chemin === `/api/cours/${ID}`) {
    // R36 : sans en-tête, aucun contrôle ; s'il nomme une autre personne, rien n'est rendu.
    if (personne !== undefined && personne !== session.id) {
      serveur.refus.push(chemin);
      return json({ erreur: 'autre_personne' }, 409);
    }
    return json(chemin === '/api/cours' ? [RESUME] : servi);
  }
  if (chemin === `/api/cours/${ID}/journal` && methode === 'GET') {
    // R32 : la lecture aussi nomme la personne dont elle range le journal.
    if (personne !== session.id) return json({ erreur: 'autre_personne' }, 409);
    // Le serveur rend ce qu'il a accepté, après le numéro `depuis` : sans cela, l'application le
    // croirait perdu par une restauration, et le renverrait (2b-D4).
    const journal = serveur.recus.get(session.id) ?? [];
    const depuis = Number(new URLSearchParams(url.split('?')[1]).get('depuis') ?? 0);
    return json({ evenements: journal.slice(depuis), curseur: journal.length, suite: false });
  }
  if (chemin === `/api/cours/${ID}/journal` && methode === 'POST') {
    if (personne !== session.id) {
      serveur.envois.push({ personne, statut: 409 });
      return json({ erreur: 'autre_personne' }, 409);
    }
    serveur.envois.push({ personne, statut: 200 });
    const { evenements } = JSON.parse(String(init?.body)) as { evenements: Evenement[] };
    serveur.recus.set(session.id, [...(serveur.recus.get(session.id) ?? []), ...evenements]);
    return json({ acceptes: evenements.length });
  }
  return json({ erreur: 'introuvable' }, 404);
}

/** Tout ce qu'Alice a laissé sur l'appareil, dont une réponse pas encore partie. */
async function appareilDAlice(): Promise<BaseLocale> {
  const base = page.base as BaseLocale;
  await memoriserMoi(base, ALICE_DE);
  await enregistrerListe(base, ALICE, [RESUME]);
  await enregistrerCours(base, ALICE, servi);
  await ajouterEvenement(base, ALICE, reponseDeTest(1, 'c1000001', true, '2026-10-16'));
  ecrirePreferences(ALICE, ID, preferencesParDefaut(preparerCours(servi)));
  return base;
}

function bandeau(): HTMLElement | null {
  return screen.queryByTestId('bandeau-session');
}

/** L'écran du compte, puis un clic sur « Se déconnecter ». */
async function seDeconnecterDepuisLeCompte(): Promise<void> {
  history.replaceState(null, '', '/compte');
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: de.deconnexion }));
}

/** L'écran du compte, puis un clic sur « Supprimer le compte » et sur sa confirmation. */
async function supprimerLeCompte(): Promise<void> {
  history.replaceState(null, '', '/compte');
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: de.suppression_bouton }));
  fireEvent.click(
    await screen.findByRole('button', { name: new RegExp(`^${de.suppression_confirmer}`) }),
  );
}

/**
 * Sur un téléphone partagé : l'écran du compte d'Alice est ouvert, un autre onglet connecte Berthe,
 * puis Alice tape un nouveau nom et l'enregistre.
 */
async function renommerPendantQueBertheSeConnecte(): Promise<void> {
  history.replaceState(null, '', '/compte');
  render(<App />);
  expect(await screen.findByTestId('liste-cours')).toBeTruthy();
  serveur.session = BERTHE_FR;
  fireEvent.input(screen.getByRole('textbox', { name: de.nom_affiche }), {
    target: { value: 'Neuer Name' },
  });
  fireEvent.click(screen.getByRole('button', { name: de.enregistrer }));
}

beforeEach(async () => {
  page.base = await ouvrirBaseDeTest();
  serveur = {
    enLigne: true,
    session: undefined,
    prochaineSession: undefined,
    recus: new Map(),
    envois: [],
    deconnexions: 0,
    deconnexionEnPanne: false,
    appels: [],
    suppressions: 0,
    comptesSupprimes: [],
    suppressionEnPanne: false,
    suppressionSansReponse: false,
    refus: [],
    enteteIgnore: false,
    passkeys: [],
    lien: null,
    invitations: { options: [], creations: [] },
  };
  vi.stubGlobal('fetch', async (entree: string | URL | Request, init?: RequestInit) => {
    if (!serveur.enLigne) throw new TypeError('Failed to fetch');
    return repondre(String(entree), init);
  });
  // Un téléphone réglé en allemand.
  Object.defineProperty(navigator, 'language', { value: 'de-DE', configurable: true });
  Object.defineProperty(navigator, 'storage', { value: stockage, configurable: true });
  stockage.persist.mockClear();
  vi.mocked(startAuthentication).mockReset();
  vi.mocked(startRegistration).mockReset();
  vi.mocked(rechargerSur).mockReset();
  vi.mocked(verifierLaSuppression).mockClear();
  vi.mocked(Appareils).mockReset();
  vi.mocked(destinationDeLAccueil).mockReset();
  history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  annulerSynchrosProgrammees();
  vi.unstubAllGlobals();
  fermerLesBasesDeTest();
  localStorage.clear();
  Reflect.deleteProperty(navigator, 'language');
  Reflect.deleteProperty(navigator, 'storage');
});

describe('démarrage', () => {
  it('demarrage_hors_ligne_avec_personne_connue_ouvre_le_cours', async () => {
    await appareilDAlice();
    serveur.enLigne = false;

    render(<App />);

    // La liste et le contenu viennent de l'appareil (R23) ; on révise, un bandeau le dit.
    expect(await screen.findByRole('heading', { name: servi.titre })).toBeTruthy();
    expect(location.pathname).toBe(`/cours/${ID}/heute`);
    expect(bandeau()?.textContent).toBe('Offline – deine Antworten werden später synchronisiert');
    expect(screen.getByRole('tablist')).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByTestId('etat-synchro').textContent).toBe(tc.synchro_une_en_attente),
    );

    // Le réseau revient : la session est relue, la réponse part sous la session d'Alice.
    serveur.enLigne = true;
    serveur.session = ALICE_DE;
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(bandeau()).toBeNull());
    await waitFor(() =>
      expect(screen.getByTestId('etat-synchro').textContent).toBe(tc.synchro_a_jour),
    );
    expect(serveur.recus.get(ALICE)).toHaveLength(1);
    expect(serveur.envois.map(({ personne }) => personne)).toEqual([ALICE]);
  });

  it('demarrage_hors_ligne_sans_personne_connue_affiche_keine_verbindung', async () => {
    serveur.enLigne = false;

    render(<App />);

    expect(await screen.findByText('Keine Verbindung')).toBeTruthy();
    expect(bandeau()).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();

    // « Erneut versuchen », le réseau revenu : sans session, la connexion.
    serveur.enLigne = true;
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByRole('heading', { name: de.connexion_titre })).toBeTruthy();
    expect(location.pathname).toBe('/connexion');
  });

  it('session_expiree_bandeau_et_file_gardee', async () => {
    const base = await appareilDAlice();
    // En ligne, mais la session d'Alice a expiré (401).

    render(<App />);

    // On continue à réviser (décision 14) : le cours s'ouvre depuis l'appareil.
    expect(await screen.findByRole('heading', { name: servi.titre })).toBeTruthy();
    expect(location.pathname).toBe(`/cours/${ID}/heute`);
    const lien = await screen.findByRole('link', {
      name: 'Sitzung abgelaufen – bitte neu anmelden',
    });
    expect(bandeau()?.contains(lien)).toBe(true);
    // La réponse en attente reste dans la file : rien n'est parti sous une autre session.
    await waitFor(() =>
      expect(screen.getByTestId('etat-synchro').textContent).toBe(tc.synchro_une_en_attente),
    );
    expect(await fileDuCours(base, ALICE, ID)).toHaveLength(1);
    expect(serveur.recus.size).toBe(0);

    // Le bandeau mène à la connexion, qui reste ouverte malgré la personne connue.
    fireEvent.click(lien);
    expect(await screen.findByRole('heading', { name: de.connexion_titre })).toBeTruthy();
    expect(location.pathname).toBe('/connexion');
  });

  it('session_expiree_d_un_compte_supprime_vide_et_recharge', async () => {
    // Le compte d'Alice a été supprimé depuis un autre téléphone : la session est partie, et
    // l'en-tête qui la nomme reçoit `compte_supprime` (2d-D4).
    const base = await appareilDAlice();
    serveur.comptesSupprimes = [ALICE];

    render(<App />);

    await waitFor(() => expect(rechargerSur).toHaveBeenCalledTimes(1));
    expect(rechargerSur).toHaveBeenCalledWith('/connexion?compte=supprime&appareil=vide');
    expect(await moiLocal(base)).toBeUndefined();
    expect(await fileDuCours(base, ALICE, ID)).toEqual([]);
    expect(await coursLocal(base, ALICE, ID)).toBeUndefined();
    expect(localStorage.getItem(clePreferences(ALICE))).toBeNull();
  });

  it('session_expiree_d_un_compte_vivant_reste_expiree', async () => {
    // Avec l'en-tête aussi, le serveur répond `non_connecte` : le compte existe, la session a
    // seulement expiré. Rien n'est effacé.
    const base = await appareilDAlice();

    render(<App />);

    expect(await screen.findByRole('link', { name: de.session_expiree })).toBeTruthy();
    await waitFor(() => expect(verifierLaSuppression).toHaveBeenCalledTimes(1));
    expect(await vi.mocked(verifierLaSuppression).mock.results[0]?.value).toBeUndefined();
    expect(rechargerSur).not.toHaveBeenCalled();
    expect(await moiLocal(base)).toEqual(ALICE_DE);
    expect(await fileDuCours(base, ALICE, ID)).toHaveLength(1);
  });

  it('session_perdue_en_seance_puis_compte_supprime_recharge', async () => {
    // Connectée, la personne perd sa session en séance (la synchronisation se reconnecte, puis
    // `definirMoi(undefined)`) : le compte a été supprimé ailleurs, la page recharge.
    const base = await appareilDAlice();
    serveur.session = ALICE_DE;
    history.replaceState(null, '', `/cours/${ID}`);

    render(<App />);
    expect(await screen.findByRole('heading', { name: servi.titre })).toBeTruthy();
    expect(rechargerSur).not.toHaveBeenCalled();

    serveur.session = undefined;
    serveur.comptesSupprimes = [ALICE];
    window.dispatchEvent(new Event('online'));

    await waitFor(() => expect(rechargerSur).toHaveBeenCalledTimes(1));
    expect(rechargerSur).toHaveBeenCalledWith('/connexion?compte=supprime&appareil=vide');
    expect(await moiLocal(base)).toBeUndefined();
    expect(await fileDuCours(base, ALICE, ID)).toEqual([]);
  });

  it('effacement_commence_recharge_meme_si_l_ecran_change', async () => {
    // L'effacement est en cours (retenu ici) quand la session change : Berthe se connecte. Ce qui
    // est effacé ne se défait pas, la page recharge quand même (2d-D5).
    await appareilDAlice();
    serveur.comptesSupprimes = [ALICE];
    serveur.prochaineSession = BERTHE_FR;
    let finir: (effacement: 'complet') => void = () => {};
    vi.mocked(verifierLaSuppression).mockImplementationOnce(
      () => new Promise((resolue) => (finir = resolue)),
    );
    vi.mocked(startAuthentication).mockResolvedValue(
      {} as Awaited<ReturnType<typeof startAuthentication>>,
    );
    history.replaceState(null, '', '/connexion');

    render(<App />);
    await waitFor(() => expect(verifierLaSuppression).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole('button', { name: de.connexion_bouton }));
    expect(await screen.findByRole('link', { name: textes.fr.compte_lien })).toBeTruthy();
    expect(rechargerSur).not.toHaveBeenCalled();

    finir('complet');

    await waitFor(() => expect(rechargerSur).toHaveBeenCalledTimes(1));
    expect(rechargerSur).toHaveBeenCalledWith('/connexion?compte=supprime&appareil=vide');
  });

  it('effacement_incomplet_deja_sur_son_adresse_ne_recharge_pas', async () => {
    // Le stockage lit, mais refuse d'écrire : l'effacement et l'oubli échouent, l'appareil connaît
    // toujours la personne. Déjà sur l'adresse que rendrait le rechargement, la page ne boucle pas
    // (2d-D5) ; l'effacement sera retenté à la prochaine ouverture.
    const base = await appareilDAlice();
    serveur.comptesSupprimes = [ALICE];
    vi.mocked(viderSaufLesFiles).mockRejectedValueOnce(new Error('stockage plein'));
    vi.mocked(oublierMoi).mockRejectedValueOnce(new Error('stockage plein'));
    history.replaceState(null, '', '/connexion?compte=supprime&appareil=non_efface');

    render(<App />);

    await waitFor(() => expect(verifierLaSuppression).toHaveBeenCalledTimes(1));
    expect(await vi.mocked(verifierLaSuppression).mock.results[0]?.value).toBe('incomplet');
    expect(await moiLocal(base)).toEqual(ALICE_DE);
    expect(await screen.findByRole('heading', { name: de.connexion_titre })).toBeTruthy();
    expect(rechargerSur).not.toHaveBeenCalled();
  });

  it('effacement_incomplet_recharge_sur_appareil_non_efface', async () => {
    await appareilDAlice();
    serveur.comptesSupprimes = [ALICE];
    vi.mocked(viderSaufLesFiles).mockRejectedValueOnce(new Error('stockage plein'));
    vi.mocked(oublierMoi).mockRejectedValueOnce(new Error('stockage plein'));
    history.replaceState(null, '', '/');

    render(<App />);

    await waitFor(() => expect(rechargerSur).toHaveBeenCalledTimes(1));
    expect(rechargerSur).toHaveBeenCalledWith('/connexion?compte=supprime&appareil=non_efface');
  });

  it('compte_supprime_sur_une_invitation_vide_sans_recharger', async () => {
    // Une nouvelle invitation après une suppression, ou une autre personne sur un téléphone
    // partagé : le lien ne se perd pas dans un rechargement (2d-D5).
    const base = await appareilDAlice();
    serveur.comptesSupprimes = [ALICE];
    history.replaceState(null, '', '/invitation/jeton-factice');

    render(<App />);

    await waitFor(() => expect(verifierLaSuppression).toHaveBeenCalledTimes(1));
    expect(await vi.mocked(verifierLaSuppression).mock.results[0]?.value).toBe('complet');
    await waitFor(async () => expect(await moiLocal(base)).toBeUndefined());
    expect(await fileDuCours(base, ALICE, ID)).toEqual([]);
    expect(location.pathname).toBe('/invitation/jeton-factice');
    expect(rechargerSur).not.toHaveBeenCalled();
  });

  it('persistance_demandee_au_demarrage_d_une_session_connue', async () => {
    // Le stockage de l'appareil garde la file de la personne : on le protège de l'éviction.
    await appareilDAlice();
    serveur.session = ALICE_DE;

    render(<App />);

    expect(await screen.findByRole('heading', { name: servi.titre })).toBeTruthy();
    await waitFor(() => expect(stockage.persist).toHaveBeenCalledTimes(1));
  });

  it('persistance_pas_demandee_sans_personne', async () => {
    // Personne n'est connecté : l'écran de connexion s'affiche, et rien n'est demandé.
    render(<App />);

    expect(await screen.findByRole('heading', { name: de.connexion_titre })).toBeTruthy();
    expect(stockage.persist).not.toHaveBeenCalled();
  });
});

describe('connexion', () => {
  it('connexion_d_une_autre_personne_reserve_la_base', async () => {
    const base = await appareilDAlice();
    // La session d'Alice a expiré ; Berthe prend le téléphone et se connecte.
    serveur.prochaineSession = BERTHE_FR;
    history.replaceState(null, '', '/connexion');
    const pendantLaCeremonie: string[] = [];
    vi.mocked(startAuthentication).mockImplementation(async () => {
      // R19 : pendant la cérémonie, aucune synchronisation ne fait de requête.
      const resultat = await synchroniserCours(base, ALICE, ID);
      pendantLaCeremonie.push(resultat.etat);
      return {} as Awaited<ReturnType<typeof startAuthentication>>;
    });

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: de.connexion_bouton }));

    // Berthe arrive sur le cours, dans sa langue pour l'application.
    expect(await screen.findByRole('link', { name: textes.fr.compte_lien })).toBeTruthy();
    expect(await screen.findByRole('heading', { name: servi.titre })).toBeTruthy();
    expect(pendantLaCeremonie).toEqual(['en_attente']);
    expect(serveur.envois.filter(({ personne }) => personne === ALICE)).toEqual([]);
    // Rien d'Alice ne reste, sauf sa file (décision 12, Review Focus 3).
    expect(await moiLocal(base)).toEqual(BERTHE_FR);
    expect(await coursLocal(base, ALICE, ID)).toBeUndefined();
    expect(await listeLocale(base, ALICE)).toBeUndefined();
    expect(await evenementsDuCours(base, ALICE, ID)).toEqual([]);
    expect(localStorage.getItem(clePreferences(ALICE))).toBeNull();
    expect(await fileDuCours(base, ALICE, ID)).toHaveLength(1);
    // Le blocage levé, la synchronisation de Berthe aboutit.
    await waitFor(() =>
      expect(screen.getByTestId('etat-synchro').textContent).toBe(tc.synchro_a_jour),
    );
    expect(serveur.recus.size).toBe(0);
  });

  it('reservation_en_echec_le_signale_et_n_affiche_rien_de_la_precedente', async () => {
    // Berthe ouvre l'application sous sa session ; l'appareil d'Alice ne peut pas lui être
    // réservé (R35).
    const base = await appareilDAlice();
    serveur.session = BERTHE_FR;
    vi.mocked(reserverA).mockRejectedValueOnce(new Error('stockage plein'));

    render(<App />);

    const alerte = await screen.findByTestId('alerte-stockage');
    expect(alerte.textContent).toBe(textes.fr.stockage_en_echec);
    expect(alerte.getAttribute('role')).toBe('alert');
    expect((await moiLocal(base))?.id).not.toBe(ALICE);

    // Le démarrage suivant, hors ligne, ne montre rien d'Alice.
    cleanup();
    serveur.enLigne = false;
    history.replaceState(null, '', '/');
    render(<App />);
    expect(await screen.findByText(textes.de.sans_connexion)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: servi.titre })).toBeNull();
  });

  it('alerte_de_stockage_gardee_au_changement_de_langue', async () => {
    // L'alerte dit l'état de l'appareil pour la session : changer la langue ne la lève pas.
    await appareilDAlice();
    serveur.session = BERTHE_FR;
    vi.mocked(reserverA).mockRejectedValueOnce(new Error('stockage plein'));
    history.replaceState(null, '', '/compte');

    render(<App />);
    expect((await screen.findByTestId('alerte-stockage')).textContent).toBe(
      textes.fr.stockage_en_echec,
    );
    fireEvent.click(await screen.findByRole('button', { name: textes.fr.langue_de }));

    await waitFor(() => expect(serveur.appels).toContain('PATCH /api/moi'));
    await waitFor(() => expect(screen.getByRole('button', { name: de.langue_fr })).toBeTruthy());
    expect(screen.getByTestId('alerte-stockage')).toBeTruthy();
  });

  it('persistance_demandee_apres_une_connexion', async () => {
    // Personne n'est connecté : rien n'est demandé tant que la connexion n'a pas abouti.
    serveur.prochaineSession = ALICE_DE;
    history.replaceState(null, '', '/connexion');
    vi.mocked(startAuthentication).mockResolvedValue(
      {} as Awaited<ReturnType<typeof startAuthentication>>,
    );

    render(<App />);
    const bouton = await screen.findByRole('button', { name: de.connexion_bouton });
    expect(stockage.persist).not.toHaveBeenCalled();
    fireEvent.click(bouton);

    expect(await screen.findByRole('link', { name: de.compte_lien })).toBeTruthy();
    await waitFor(() => expect(stockage.persist).toHaveBeenCalledTimes(1));
  });

  it('connexion_signale_le_nom_au_telephone', async () => {
    // Après une connexion, le téléphone apprend le nom que la passkey porte (1e-D6).
    serveur.prochaineSession = ALICE_DE;
    history.replaceState(null, '', '/connexion');
    vi.mocked(startAuthentication).mockResolvedValue(
      {} as Awaited<ReturnType<typeof startAuthentication>>,
    );
    const signalCurrentUserDetails = vi.fn(async (_details: unknown) => {});
    vi.stubGlobal('PublicKeyCredential', { signalCurrentUserDetails });

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: de.connexion_bouton }));

    expect(await screen.findByRole('link', { name: de.compte_lien })).toBeTruthy();
    await waitFor(() => expect(signalCurrentUserDetails).toHaveBeenCalledTimes(1));
    expect(signalCurrentUserDetails).toHaveBeenCalledWith({
      rpId: location.hostname,
      userId: identifiantUtilisateur(ALICE),
      name: ALICE_DE.nomAffiche,
      displayName: ALICE_DE.nomAffiche,
    });
  });

  it('connexion_apres_une_suppression_de_compte_le_dit', async () => {
    // Le rechargement qui suit la suppression arrive ici (`/connexion?compte=supprime`).
    history.replaceState(null, '', '/connexion?compte=supprime');

    render(<App />);

    expect(await screen.findByRole('heading', { name: de.connexion_titre })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(de.compte_supprime);
  });

  it('connexion_apres_une_suppression_dont_l_appareil_n_est_pas_efface_le_dit', async () => {
    // Le compte est supprimé, mais le téléphone n'a pas pu effacer ses données (1e-R14) : le
    // message dit quoi faire, à la place de la simple confirmation.
    history.replaceState(null, '', '/connexion?compte=supprime&appareil=non_efface');

    render(<App />);

    expect(await screen.findByRole('heading', { name: de.connexion_titre })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(de.compte_supprime_appareil_non_efface);
    expect(screen.queryByText(de.compte_supprime)).toBeNull();
  });

  it('connexion_dit_compte_supprime_et_appareil_vide', async () => {
    // Le compte a été supprimé depuis un autre téléphone, et cet appareil a été vidé (2d-D6).
    history.replaceState(null, '', '/connexion?compte=supprime&appareil=vide');

    render(<App />);

    expect(await screen.findByRole('heading', { name: de.connexion_titre })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe(de.compte_supprime_appareil_vide);
    expect(screen.queryByText(de.compte_supprime)).toBeNull();
  });

  it('connexion_sans_suppression_de_compte_ne_dit_rien', async () => {
    for (const adresse of [
      '/connexion',
      '/connexion?compte=autre',
      '/connexion?x=compte=supprime',
      '/connexion?appareil=non_efface',
    ]) {
      history.replaceState(null, '', adresse);
      render(<App />);

      expect(
        await screen.findByRole('heading', { name: de.connexion_titre }),
        adresse,
      ).toBeTruthy();
      expect(screen.queryByRole('status'), adresse).toBeNull();
      cleanup();
    }
  });

  it('ceremonie_annulee_debloque', async () => {
    const base = await appareilDAlice();
    history.replaceState(null, '', '/connexion');
    vi.mocked(startAuthentication).mockRejectedValue(
      new DOMException('annulée', 'NotAllowedError'),
    );

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: de.connexion_bouton }));

    expect(await screen.findByText(de.passkey_annulee)).toBeTruthy();
    // Rien n'a été effacé, et les synchronisations repartent (ici : la session a expiré).
    expect(await coursLocal(base, ALICE, ID)).toEqual(servi);
    await waitFor(async () =>
      expect((await synchroniserCours(base, ALICE, ID)).etat).toBe('reconnexion'),
    );
  });
});

describe('déconnexion', () => {
  it('deconnexion_depuis_le_compte_vide_l_appareil', async () => {
    const base = await appareilDAlice();
    serveur.session = ALICE_DE;
    await seDeconnecterDepuisLeCompte();

    expect(await screen.findByRole('heading', { name: de.connexion_titre })).toBeTruthy();
    expect(location.pathname).toBe('/connexion');
    // La réponse en attente est partie avant la fermeture de la session ; puis tout est vidé.
    expect(serveur.recus.get(ALICE)).toHaveLength(1);
    expect(serveur.deconnexions).toBe(1);
    expect(await moiLocal(base)).toBeUndefined();
    expect(await fileDuCours(base, ALICE, ID)).toEqual([]);
    expect(await coursLocal(base, ALICE, ID)).toBeUndefined();
    expect(localStorage.getItem(clePreferences(ALICE))).toBeNull();
    expect(bandeau()).toBeNull();
    // Puis la page se recharge entièrement : le service worker, désinscrit, se réenregistre, et
    // rien de la personne précédente ne reste en mémoire.
    expect(rechargerSur).toHaveBeenCalledTimes(1);
    expect(rechargerSur).toHaveBeenCalledWith('/connexion');
  });

  it('deconnexion_avec_des_reponses_en_attente_le_dit_et_n_efface_rien', async () => {
    // La session d'Alice a expiré : sa réponse en attente ne peut pas partir (R31b).
    const base = await appareilDAlice();
    await seDeconnecterDepuisLeCompte();

    expect(await screen.findByText(de.deconnexion_attente_session)).toBeTruthy();
    expect(location.pathname).toBe('/compte');
    expect(serveur.deconnexions).toBe(0);
    expect(await moiLocal(base)).toEqual(ALICE_DE);
    expect(await fileDuCours(base, ALICE, ID)).toHaveLength(1);
    expect(await coursLocal(base, ALICE, ID)).toEqual(servi);
    expect(localStorage.getItem(clePreferences(ALICE))).not.toBeNull();
    // Le bandeau invite toujours à se reconnecter.
    expect(bandeau()).not.toBeNull();
    // Une déconnexion qui n'a pas eu lieu ne recharge rien.
    expect(rechargerSur).not.toHaveBeenCalled();
  });

  it('deconnexion_bloquee_propose_d_abandonner_et_se_fait_en_deux_clics', async () => {
    // La session d'Alice a expiré, et deux de ses réponses n'ont pas pu partir (R31b). Le refus
    // fait apparaître un bouton qui dit combien elle en perdrait ; deux clics l'abandonnent.
    const base = await appareilDAlice();
    await ajouterEvenement(base, ALICE, reponseDeTest(2, 'c1000001', false, '2026-10-16'));
    history.replaceState(null, '', '/compte');

    render(<App />);
    expect(screen.queryByRole('button', { name: /verwerfen/ })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: de.deconnexion }));

    expect(await screen.findByText(de.deconnexion_attente_session)).toBeTruthy();
    // Au pluriel : « {n} Antworten ».
    const abandon = await screen.findByRole('button', {
      name: 'Abmelden und 2 Antworten verwerfen',
    });
    expect(serveur.deconnexions).toBe(0);

    // Premier clic : la confirmation, qui redit le nombre. Rien n'est encore fait.
    fireEvent.click(abandon);
    const confirmation = await screen.findByRole('button', {
      name: /^Bestätigen: 2 Antworten gehen verloren/,
    });
    expect(rechargerSur).not.toHaveBeenCalled();
    expect(await fileDuCours(base, ALICE, ID)).toHaveLength(2);

    // Second clic : session fermée (401 vaut fermeture), file abandonnée, appareil vidé.
    fireEvent.click(confirmation);
    await waitFor(() => expect(rechargerSur).toHaveBeenCalledTimes(1));
    expect(rechargerSur).toHaveBeenCalledWith('/connexion');
    expect(serveur.deconnexions).toBe(1);
    expect(serveur.recus.size).toBe(0);
    expect(await fileDuCours(base, ALICE, ID)).toEqual([]);
    expect(await moiLocal(base)).toBeUndefined();
    expect(await coursLocal(base, ALICE, ID)).toBeUndefined();
    expect(localStorage.getItem(clePreferences(ALICE))).toBeNull();
  });

  it('deconnexion_bloquee_avec_une_seule_reponse_parle_au_singulier', async () => {
    // Le cas le plus courant : une seule réponse attend. « 1 Antwort » et non « 1 Antworten »
    // (1e-R10), sur le bouton comme sur sa confirmation.
    const base = await appareilDAlice();
    await seDeconnecterDepuisLeCompte();

    const abandon = await screen.findByRole('button', { name: 'Abmelden und 1 Antwort verwerfen' });
    expect(screen.queryByRole('button', { name: /1 Antworten/ })).toBeNull();
    fireEvent.click(abandon);
    const confirmation = await screen.findByRole('button', {
      name: /^Bestätigen: 1 Antwort geht verloren/,
    });
    expect(screen.queryByRole('button', { name: /1 Antworten/ })).toBeNull();
    expect(rechargerSur).not.toHaveBeenCalled();

    fireEvent.click(confirmation);
    await waitFor(() => expect(rechargerSur).toHaveBeenCalledWith('/connexion'));
    expect(await fileDuCours(base, ALICE, ID)).toEqual([]);
    expect(serveur.deconnexions).toBe(1);
  });

  it('deconnexion_abandon_sans_reseau_garde_le_bouton_et_n_efface_rien', async () => {
    // Le réseau tombe entre le refus et la confirmation : la session ne peut pas se fermer, rien
    // n'est effacé (R30), et le bouton reste pour réessayer.
    const base = await appareilDAlice();
    await seDeconnecterDepuisLeCompte();
    const abandon = await screen.findByRole('button', { name: 'Abmelden und 1 Antwort verwerfen' });
    serveur.enLigne = false;
    fireEvent.click(abandon);
    fireEvent.click(await screen.findByRole('button', { name: /^Bestätigen: 1 Antwort geht/ }));

    expect(await screen.findByText(de.erreur_reseau)).toBeTruthy();
    expect(rechargerSur).not.toHaveBeenCalled();
    expect(await fileDuCours(base, ALICE, ID)).toHaveLength(1);
    expect(await moiLocal(base)).toEqual(ALICE_DE);
    expect(localStorage.getItem(clePreferences(ALICE))).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Abmelden und 1 Antwort verwerfen' })).toBeTruthy();
  });

  it('deconnexion_bloquee_le_bouton_part_au_changement_de_langue', async () => {
    // Un autre geste sur l'écran retire le bouton : le refus qu'il prolongeait n'y est plus.
    await appareilDAlice();
    await seDeconnecterDepuisLeCompte();
    expect(
      await screen.findByRole('button', { name: 'Abmelden und 1 Antwort verwerfen' }),
    ).toBeTruthy();
    // La personne s'est reconnectée ailleurs : le changement de langue aboutit.
    serveur.session = ALICE_DE;

    fireEvent.click(screen.getByRole('button', { name: de.langue_fr }));

    await waitFor(() => expect(screen.queryByText(de.deconnexion_attente_session)).toBeNull());
    expect(screen.queryByRole('button', { name: /verwerfen/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /abandonner/ })).toBeNull();
    // Rien n'a été fait de la déconnexion.
    expect(rechargerSur).not.toHaveBeenCalled();
    expect(serveur.deconnexions).toBe(0);
  });

  it('deconnexion_bloquee_le_bouton_part_a_un_nouvel_essai_de_se_deconnecter', async () => {
    // Un nouvel essai de « Se déconnecter » refait le compte. Ici la file part, et c'est la
    // fermeture de la session qui échoue : le refus n'est plus celui des réponses en attente, et
    // le bouton qui l'accompagnait n'a plus lieu d'être.
    await appareilDAlice();
    await seDeconnecterDepuisLeCompte();
    expect(
      await screen.findByRole('button', { name: 'Abmelden und 1 Antwort verwerfen' }),
    ).toBeTruthy();
    serveur.session = ALICE_DE;
    serveur.deconnexionEnPanne = true;

    fireEvent.click(screen.getByRole('button', { name: de.deconnexion }));

    // Le serveur répond `{ erreur: 'interne' }` à une panne (1e-D14) : le texte de ce code.
    expect(await screen.findByText(de.erreur_interne)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /verwerfen/ })).toBeNull();
    expect(serveur.recus.get(ALICE)).toHaveLength(1);
    expect(rechargerSur).not.toHaveBeenCalled();
  });
});

/** Un téléphone qui connaît l'API Signal ; chaque signal est noté avec les requêtes du serveur. */
function telephone() {
  const signalCurrentUserDetails = vi.fn(async (_details: unknown) => {
    serveur.appels.push('signal');
  });
  const signalAllAcceptedCredentials = vi.fn(async (_details: unknown) => {});
  vi.stubGlobal('PublicKeyCredential', {
    signalCurrentUserDetails,
    signalAllAcceptedCredentials,
  });
  return { signalCurrentUserDetails, signalAllAcceptedCredentials };
}

describe('compte (1e-D4, 1e-D5, 1e-D6)', () => {
  it('compte_renommer_appelle_patch_puis_le_signal', async () => {
    const base = page.base as BaseLocale;
    await memoriserMoi(base, ALICE_DE);
    serveur.session = ALICE_DE;
    const { signalCurrentUserDetails } = telephone();
    history.replaceState(null, '', '/compte');

    render(<App />);
    const champ = await screen.findByRole('textbox', { name: de.nom_affiche });
    expect((champ as HTMLInputElement).value).toBe('Lernende Test');
    fireEvent.input(champ, { target: { value: '  Neuer Name  ' } });
    fireEvent.click(screen.getByRole('button', { name: de.enregistrer }));

    // D'abord le serveur, puis le téléphone : le signal dit ce que le serveur a retenu.
    await waitFor(() => expect(serveur.appels).toEqual(['PATCH /api/moi', 'signal']));
    expect(serveur.session?.nomAffiche).toBe('Neuer Name');
    expect(signalCurrentUserDetails).toHaveBeenCalledWith({
      rpId: location.hostname,
      userId: identifiantUtilisateur(ALICE),
      name: 'Neuer Name',
      displayName: 'Neuer Name',
    });
    // L'écran et l'appareil retiennent le nouveau nom.
    expect(await screen.findByRole('heading', { name: 'Hallo Neuer Name' })).toBeTruthy();
    await waitFor(async () => expect((await moiLocal(base))?.nomAffiche).toBe('Neuer Name'));
  });

  it('compte_renommer_sous_la_session_d_une_autre_personne_ne_change_rien', async () => {
    // Sur un téléphone partagé : l'écran d'Alice est ouvert, Berthe se connecte dans un autre
    // onglet. Le nom tapé par Alice ne devient pas celui de Berthe : le serveur refuse, le
    // téléphone n'apprend aucun nom, l'écran reste celui d'Alice et l'application passe en
    // reconnexion.
    const base = page.base as BaseLocale;
    await memoriserMoi(base, ALICE_DE);
    serveur.session = ALICE_DE;
    const { signalCurrentUserDetails } = telephone();
    await renommerPendantQueBertheSeConnecte();

    expect(await screen.findByText(de.erreur_autre_personne)).toBeTruthy();
    expect(serveur.refus).toEqual(['PATCH /api/moi']);
    expect(serveur.appels).toEqual([]);
    expect(serveur.session).toEqual(BERTHE_FR);
    expect(signalCurrentUserDetails).not.toHaveBeenCalled();
    expect(await screen.findByTestId('bandeau-session')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hallo Lernende Test' })).toBeTruthy();
    expect(await moiLocal(base)).toEqual(ALICE_DE);
  });

  it('compte_renommer_chez_un_serveur_qui_ignore_l_en_tete_ne_prend_pas_l_autre_profil', async () => {
    // Après un retour arrière, le serveur d'avant le lot 1e ignore l'en-tête : il renomme Berthe,
    // ce que l'écran ne peut plus empêcher. Mais sa réponse nomme Berthe : l'écran ne la prend pas
    // pour le profil d'Alice, et le téléphone n'apprend pas ce nom pour les passkeys d'Alice.
    const base = page.base as BaseLocale;
    await memoriserMoi(base, ALICE_DE);
    serveur.session = ALICE_DE;
    serveur.enteteIgnore = true;
    const { signalCurrentUserDetails } = telephone();
    await renommerPendantQueBertheSeConnecte();

    expect(await screen.findByText(de.erreur_autre_personne)).toBeTruthy();
    expect(serveur.appels).toEqual(['PATCH /api/moi']);
    expect(serveur.session).toMatchObject({ id: BERTHE, nomAffiche: 'Neuer Name' });
    expect(signalCurrentUserDetails).not.toHaveBeenCalled();
    expect(await screen.findByTestId('bandeau-session')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Hallo Lernende Test' })).toBeTruthy();
    expect(await moiLocal(base)).toEqual(ALICE_DE);
  });

  it('compte_nom_refuse_n_envoie_rien', async () => {
    serveur.session = ALICE_DE;
    const { signalCurrentUserDetails } = telephone();
    history.replaceState(null, '', '/compte');

    render(<App />);
    const champ = await screen.findByRole('textbox', { name: de.nom_affiche });
    // Vide, trop long (41 points de code), ou avec un caractère invisible : la règle du serveur,
    // appliquée avant la requête.
    for (const nom of ['   ', 'a'.repeat(41), 'Bad​Name']) {
      fireEvent.input(champ, { target: { value: nom } });
      fireEvent.click(screen.getByRole('button', { name: de.enregistrer }));
      expect((await screen.findByRole('alert')).textContent).toBe(de.nom_requis);
    }

    expect(serveur.appels).toEqual([]);
    expect(signalCurrentUserDetails).not.toHaveBeenCalled();

    // Un nom valide retire le message.
    fireEvent.input(champ, { target: { value: 'Neuer Name' } });
    fireEvent.click(screen.getByRole('button', { name: de.enregistrer }));
    await waitFor(() => expect(serveur.appels).toEqual(['PATCH /api/moi', 'signal']));
    await waitFor(() => expect(screen.queryByText(de.nom_requis)).toBeNull());
  });

  it('compte_le_lien_d_export_a_href_et_download', async () => {
    serveur.session = ALICE_DE;
    history.replaceState(null, '', '/compte');

    render(<App />);
    const lien = await screen.findByRole('link', { name: de.export_lien });

    // Un lien du navigateur, pas un appel de l'application : la pièce jointe du serveur est
    // enregistrée telle quelle.
    expect(lien.getAttribute('href')).toBe('/api/moi/export');
    expect(lien.hasAttribute('download')).toBe(true);
  });

  it('compte_suppression_en_deux_clics_efface_l_appareil_et_recharge', async () => {
    const base = await appareilDAlice();
    // La file d'une autre personne reste sur l'appareil (R33).
    await ajouterEvenement(base, BERTHE, reponseDeTest(2, 'c1000001', true, '2026-10-16'));
    serveur.session = ALICE_DE;
    const { signalAllAcceptedCredentials } = telephone();
    history.replaceState(null, '', '/compte');

    render(<App />);
    expect(await screen.findByText(de.suppression_explication)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: de.suppression_bouton }));

    // Premier clic : la confirmation. Rien n'est encore fait.
    const confirmation = await screen.findByRole('button', {
      name: new RegExp(`^${de.suppression_confirmer}`),
    });
    expect(serveur.suppressions).toBe(0);
    expect(rechargerSur).not.toHaveBeenCalled();
    expect(await fileDuCours(base, ALICE, ID)).toHaveLength(1);

    // Second clic : le compte est supprimé sur le serveur, puis tout est effacé de l'appareil.
    fireEvent.click(confirmation);
    await waitFor(() => expect(rechargerSur).toHaveBeenCalledTimes(1));
    expect(rechargerSur).toHaveBeenCalledWith('/connexion?compte=supprime');
    expect(serveur.appels).toEqual(['DELETE /api/moi']);
    expect(serveur.suppressions).toBe(1);
    // Le DELETE a déjà fermé la session : pas de seconde fermeture.
    expect(serveur.deconnexions).toBe(0);
    expect(await moiLocal(base)).toBeUndefined();
    expect(await fileDuCours(base, ALICE, ID)).toEqual([]);
    expect(await fileDuCours(base, BERTHE, ID)).toHaveLength(1);
    expect(await coursLocal(base, ALICE, ID)).toBeUndefined();
    expect(await listeLocale(base, ALICE)).toBeUndefined();
    expect(localStorage.getItem(clePreferences(ALICE))).toBeNull();
    // Le téléphone n'accepte plus aucune passkey pour ce compte.
    expect(signalAllAcceptedCredentials).toHaveBeenCalledWith({
      rpId: location.hostname,
      userId: identifiantUtilisateur(ALICE),
      allAcceptedCredentialIds: [],
    });
  });

  it('compte_suppression_en_echec_n_efface_rien_et_le_dit', async () => {
    const base = await appareilDAlice();
    serveur.session = ALICE_DE;
    serveur.suppressionEnPanne = true;
    const { signalAllAcceptedCredentials } = telephone();
    await supprimerLeCompte();

    // Le serveur ne dit rien de plus que « interne » (1e-D14) : le texte est celui du code.
    expect(await screen.findByText(de.erreur_interne)).toBeTruthy();
    expect(rechargerSur).not.toHaveBeenCalled();
    expect(await moiLocal(base)).toEqual(ALICE_DE);
    expect(await fileDuCours(base, ALICE, ID)).toHaveLength(1);
    expect(await coursLocal(base, ALICE, ID)).toEqual(servi);
    expect(localStorage.getItem(clePreferences(ALICE))).not.toBeNull();
    expect(signalAllAcceptedCredentials).not.toHaveBeenCalled();
    // La personne peut recommencer.
    expect(screen.getByRole('button', { name: de.suppression_bouton })).toBeTruthy();
  });

  it('compte_suppression_dont_la_reponse_se_perd_dit_comment_effacer_l_appareil', async () => {
    // Le serveur a supprimé le compte, mais sa réponse s'est perdue (I2) : le téléphone ne sait
    // pas que le compte n'existe plus, et n'efface rien. Le message dit que le compte a peut-être
    // été supprimé, et que « Abmelden » efface l'appareil ; un nouvel essai le redit (401), et
    // c'est exact : la déconnexion, au besoin en abandonnant la file, efface l'appareil.
    const base = await appareilDAlice();
    serveur.session = ALICE_DE;
    serveur.suppressionSansReponse = true;
    await supprimerLeCompte();

    expect(await screen.findByText(de.suppression_erreur_reseau)).toBeTruthy();
    expect(serveur.suppressions).toBe(1);
    expect(rechargerSur).not.toHaveBeenCalled();
    expect(await moiLocal(base)).toEqual(ALICE_DE);
    expect(await fileDuCours(base, ALICE, ID)).toHaveLength(1);

    // Le nouvel essai trouve la session partie avec le compte (401).
    fireEvent.click(screen.getByRole('button', { name: de.suppression_bouton }));
    fireEvent.click(
      await screen.findByRole('button', { name: new RegExp(`^${de.suppression_confirmer}`) }),
    );
    expect(await screen.findByText(de.suppression_erreur_non_connecte)).toBeTruthy();
    expect(await screen.findByTestId('bandeau-session')).toBeTruthy();
    expect(await fileDuCours(base, ALICE, ID)).toHaveLength(1);

    // « Abmelden », comme le dit le message : la réponse en attente ne peut plus partir, on
    // l'abandonne, et l'appareil est effacé.
    fireEvent.click(screen.getByRole('button', { name: de.deconnexion }));
    fireEvent.click(
      await screen.findByRole('button', { name: 'Abmelden und 1 Antwort verwerfen' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Bestätigen: 1 Antwort geht/ }));
    await waitFor(() => expect(rechargerSur).toHaveBeenCalledWith('/connexion'));
    expect(await moiLocal(base)).toBeUndefined();
    expect(await fileDuCours(base, ALICE, ID)).toEqual([]);
    expect(await coursLocal(base, ALICE, ID)).toBeUndefined();
    expect(localStorage.getItem(clePreferences(ALICE))).toBeNull();
  });

  it('compte_suppression_pendant_qu_une_autre_personne_s_est_connectee_n_efface_rien', async () => {
    // Sur un téléphone partagé : l'écran d'Alice est ouvert, Berthe se connecte dans un autre onglet.
    // La suppression nomme Alice, la session est celle de Berthe : le serveur refuse (1e-R13), le
    // compte de Berthe reste, et rien n'est effacé sur l'appareil, la file d'Alice comprise.
    const base = await appareilDAlice();
    serveur.session = ALICE_DE;
    const { signalAllAcceptedCredentials } = telephone();
    history.replaceState(null, '', '/compte');

    render(<App />);
    // La liste des cours est lue sous la session d'Alice ; ensuite seulement, Berthe se connecte.
    expect(await screen.findByTestId('liste-cours')).toBeTruthy();
    const supprimer = screen.getByRole('button', { name: de.suppression_bouton });
    serveur.session = BERTHE_FR;
    fireEvent.click(supprimer);
    fireEvent.click(
      await screen.findByRole('button', { name: new RegExp(`^${de.suppression_confirmer}`) }),
    );

    expect(await screen.findByText(de.erreur_autre_personne)).toBeTruthy();
    expect(serveur.appels).toEqual(['DELETE /api/moi']);
    expect(serveur.suppressions).toBe(0);
    expect(serveur.session).toEqual(BERTHE_FR);
    expect(rechargerSur).not.toHaveBeenCalled();
    expect(await moiLocal(base)).toEqual(ALICE_DE);
    expect(await fileDuCours(base, ALICE, ID)).toHaveLength(1);
    expect(await coursLocal(base, ALICE, ID)).toEqual(servi);
    expect(localStorage.getItem(clePreferences(ALICE))).not.toBeNull();
    expect(signalAllAcceptedCredentials).not.toHaveBeenCalled();
    // L'application passe en reconnexion, comme pour toute session d'une autre personne.
    expect(await screen.findByTestId('bandeau-session')).toBeTruthy();
  });

  it('compte_suppression_dont_l_appareil_refuse_de_s_effacer_ferme_quand_meme', async () => {
    // Le serveur a supprimé le compte, puis le stockage refuse de se vider (1e-R14) : l'écran ne
    // reste pas « connecté » sur un compte qui n'existe plus. Le téléphone est prié d'oublier les
    // passkeys, la page se recharge sur la connexion, qui dit à la personne quoi faire.
    await appareilDAlice();
    serveur.session = ALICE_DE;
    const { signalAllAcceptedCredentials } = telephone();
    vi.mocked(viderSaufLesFiles).mockRejectedValueOnce(new Error('stockage plein'));
    await supprimerLeCompte();

    await waitFor(() => expect(rechargerSur).toHaveBeenCalledTimes(1));
    expect(rechargerSur).toHaveBeenCalledWith('/connexion?compte=supprime&appareil=non_efface');
    expect(serveur.suppressions).toBe(1);
    expect(signalAllAcceptedCredentials).toHaveBeenCalledWith({
      rpId: location.hostname,
      userId: identifiantUtilisateur(ALICE),
      allAcceptedCredentialIds: [],
    });
    // Plus d'écran de compte, et pas de message d'erreur : la session est fermée.
    expect(await screen.findByRole('heading', { name: de.connexion_titre })).toBeTruthy();
    expect(screen.queryByRole('button', { name: de.suppression_bouton })).toBeNull();
    expect(screen.queryByText(de.erreur_inconnue)).toBeNull();
  });

  it('compte_le_proprietaire_ne_voit_pas_le_bouton_de_suppression', async () => {
    serveur.session = { ...ALICE_DE, proprietaire: true };
    history.replaceState(null, '', '/compte');

    render(<App />);

    // Ses données s'exportent comme celles de tout le monde ; son compte ne se supprime pas ici
    // (1e-D4), et le texte qui dit ce que la suppression efface n'a pas lieu d'être.
    expect(await screen.findByRole('link', { name: de.export_lien })).toBeTruthy();
    expect(screen.getByRole('heading', { name: de.donnees_titre })).toBeTruthy();
    expect(screen.queryByRole('button', { name: de.suppression_bouton })).toBeNull();
    expect(screen.queryByText(de.suppression_explication)).toBeNull();
  });
});

describe('mes appareils (1e-D7)', () => {
  const PASSKEYS: PasskeyEnregistree[] = [
    {
      id: 'passkey-test-1',
      appareil: 'autre',
      creeLe: '2026-10-16T08:00:00.000Z',
      utiliseLe: null,
    },
    {
      id: 'passkey-test-2',
      appareil: 'autre',
      creeLe: '2026-10-17T08:00:00.000Z',
      utiliseLe: '2026-10-18T08:00:00.000Z',
    },
  ];

  /** L'écran des appareils d'Alice : deux passkeys et un lien actif, dont la phrase est rendue. */
  function ouvrirLesAppareilsAvecUnLien(): string {
    serveur.session = ALICE_DE;
    serveur.passkeys = PASSKEYS;
    serveur.lien = { expireLe: EXPIRE_LE };
    history.replaceState(null, '', '/appareils');
    const actif = formater(de.lien_actif, { date: formaterDate(EXPIRE_LE, 'de') });
    render(<App />);
    return actif;
  }

  it('appareils_montre_et_annule_le_lien', async () => {
    const actif = ouvrirLesAppareilsAvecUnLien();

    // Le lien actif et sa date, au format des autres dates de l'écran.
    expect(await screen.findByText(actif)).toBeTruthy();
    // Sous le bouton de création : en créer un annule le précédent.
    const creer = screen.getByRole('button', { name: de.lien_autre_appareil });
    expect(creer.nextElementSibling?.textContent).toBe(de.lien_remplace);

    fireEvent.click(screen.getByRole('button', { name: de.lien_annuler }));

    // Le serveur l'a annulé, l'écran l'a relu : plus de lien, plus de bouton pour l'annuler.
    await waitFor(() => expect(screen.queryByText(actif)).toBeNull());
    expect(serveur.appels).toEqual(['DELETE /api/moi/lien']);
    expect(screen.queryByRole('button', { name: de.lien_annuler })).toBeNull();
    expect(screen.getByText(de.lien_remplace)).toBeTruthy();
  });

  it('appareils_creer_un_lien_le_montre_actif_et_l_annuler_le_retire', async () => {
    serveur.session = ALICE_DE;
    serveur.passkeys = PASSKEYS;
    history.replaceState(null, '', '/appareils');
    const actif = formater(de.lien_actif, { date: formaterDate(EXPIRE_LE, 'de') });

    render(<App />);
    fireEvent.click(await screen.findByRole('button', { name: de.lien_autre_appareil }));

    // Le lien créé est montré une fois, et l'écran relit le lien actif qu'il vient de créer.
    expect((await screen.findByTestId('lien-genere')).textContent).toBe(
      'https://ancrage.test/lien/exemple',
    );
    expect(await screen.findByText(actif)).toBeTruthy();

    // L'annuler retire aussi le lien qu'on venait de voir : il ne sert plus.
    fireEvent.click(screen.getByRole('button', { name: de.lien_annuler }));
    await waitFor(() => expect(screen.queryByText(actif)).toBeNull());
    expect(screen.queryByTestId('lien-genere')).toBeNull();
    expect(serveur.appels).toEqual(['POST /api/moi/lien', 'DELETE /api/moi/lien']);
  });

  it('appareils_sans_lien_actif_ne_propose_pas_de_l_annuler', async () => {
    serveur.session = ALICE_DE;
    serveur.passkeys = PASSKEYS;
    history.replaceState(null, '', '/appareils');

    render(<App />);

    expect(await screen.findByTestId('liste-passkeys')).toBeTruthy();
    expect(screen.queryByRole('button', { name: de.lien_annuler })).toBeNull();
    expect(screen.queryByText(/Ein Link ist gültig/)).toBeNull();
    expect(screen.getByText(de.lien_remplace)).toBeTruthy();
  });

  it('appareils_d_un_serveur_sans_champ_lien_s_affichent_sans_ligne_de_lien', async () => {
    // Après un retour arrière, le téléphone garde l'application précachée de cette version, et le
    // serveur est celui d'avant : sa réponse n'a pas de champ `lien` (ADR-0008, §3).
    serveur.session = ALICE_DE;
    serveur.passkeys = PASSKEYS;
    serveur.lien = undefined;
    history.replaceState(null, '', '/appareils');

    render(<App />);

    expect(await screen.findByTestId('liste-passkeys')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText(/Ein Link ist gültig/)).toBeNull();
    expect(screen.queryByRole('button', { name: de.lien_annuler })).toBeNull();
    // Créer un lien reste possible.
    expect(screen.getByRole('button', { name: de.lien_autre_appareil })).toBeTruthy();
    expect(screen.getByText(de.lien_remplace)).toBeTruthy();
  });

  it('appareils_signale_les_cles_acceptees', async () => {
    serveur.session = ALICE_DE;
    serveur.passkeys = PASSKEYS;
    const { signalAllAcceptedCredentials } = telephone();
    history.replaceState(null, '', '/appareils');

    render(<App />);

    // Après le chargement : le téléphone apprend les passkeys que le serveur accepte encore.
    await waitFor(() => expect(signalAllAcceptedCredentials).toHaveBeenCalledTimes(1));
    expect(signalAllAcceptedCredentials).toHaveBeenLastCalledWith({
      rpId: location.hostname,
      userId: identifiantUtilisateur(ALICE),
      allAcceptedCredentialIds: ['passkey-test-1', 'passkey-test-2'],
    });

    // Et après chaque chargement : supprimer une passkey relit la liste, et le téléphone apprend
    // celle qui reste.
    const liste = within(await screen.findByTestId('liste-passkeys'));
    fireEvent.click(
      liste.getAllByRole('button', { name: (nom) => nom.startsWith(de.supprimer) })[0],
    );
    fireEvent.click(liste.getByRole('button', { name: (nom) => nom.startsWith(de.confirmer) }));

    await waitFor(() => expect(signalAllAcceptedCredentials).toHaveBeenCalledTimes(2));
    expect(signalAllAcceptedCredentials).toHaveBeenLastCalledWith({
      rpId: location.hostname,
      userId: identifiantUtilisateur(ALICE),
      allAcceptedCredentialIds: ['passkey-test-2'],
    });
  });

  it('appareils_lien_sous_la_session_d_une_autre_personne_refuse_et_rien_ne_change', async () => {
    // Sur un téléphone partagé : l'écran d'Alice est ouvert, un autre onglet connecte Berthe.
    // Annuler supprimerait le lien de Berthe ; en créer un montrerait à Alice celui de Berthe, et
    // annulerait le précédent. L'écran nomme sa personne : le serveur refuse les deux.
    const base = page.base as BaseLocale;
    await memoriserMoi(base, ALICE_DE);
    const actif = ouvrirLesAppareilsAvecUnLien();
    expect(await screen.findByText(actif)).toBeTruthy();
    serveur.session = BERTHE_FR;

    fireEvent.click(screen.getByRole('button', { name: de.lien_annuler }));
    expect(await screen.findByText(de.erreur_autre_personne)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: de.lien_autre_appareil }));

    await waitFor(() =>
      expect(serveur.refus).toEqual(['DELETE /api/moi/lien', 'POST /api/moi/lien']),
    );
    expect(serveur.appels).toEqual([]);
    expect(serveur.lien).toEqual({ expireLe: EXPIRE_LE });
    expect(screen.queryByTestId('lien-genere')).toBeNull();
    expect(await screen.findByTestId('bandeau-session')).toBeTruthy();
  });

  it('appareils_d_un_serveur_qui_ignore_l_en_tete_ne_signale_rien', async () => {
    // Après un retour arrière, l'application précachée parle au serveur d'avant le lot 1e, qui
    // ignore l'en-tête : sous la session de Berthe, il rendrait les passkeys de Berthe à l'écran
    // d'Alice, et le téléphone retirerait celles d'Alice. Seule une réponse qui porte le champ
    // `lien`, que seuls les serveurs qui contrôlent l'en-tête envoient, est signalée (M1).
    const base = page.base as BaseLocale;
    await memoriserMoi(base, ALICE_DE);
    serveur.session = ALICE_DE;
    serveur.passkeys = PASSKEYS;
    serveur.lien = undefined;
    serveur.enteteIgnore = true;
    const { signalAllAcceptedCredentials } = telephone();
    history.replaceState(null, '', '/appareils');

    render(<App />);
    const liste = within(await screen.findByTestId('liste-passkeys'));
    serveur.session = BERTHE_FR;
    // Supprimer une passkey relit la liste, désormais sous la session de Berthe.
    fireEvent.click(
      liste.getAllByRole('button', { name: (nom) => nom.startsWith(de.supprimer) })[0],
    );
    fireEvent.click(liste.getByRole('button', { name: (nom) => nom.startsWith(de.confirmer) }));

    await waitFor(() => expect(liste.getAllByRole('listitem')).toHaveLength(1));
    expect(serveur.appels).toEqual(['DELETE /api/moi/passkeys']);
    expect(signalAllAcceptedCredentials).not.toHaveBeenCalled();
  });

  it('appareils_d_une_autre_personne_ne_signale_rien_et_passe_en_reconnexion', async () => {
    // Sur un téléphone partagé : l'écran d'Alice est ouvert, un autre onglet connecte Berthe. La
    // liste de Berthe, signalée sous l'identifiant d'Alice, ferait retirer ses passkeys du
    // téléphone (1e-R15) : l'écran nomme sa personne, le serveur refuse, rien n'est signalé.
    const base = page.base as BaseLocale;
    await memoriserMoi(base, ALICE_DE);
    serveur.session = ALICE_DE;
    serveur.passkeys = PASSKEYS;
    const { signalAllAcceptedCredentials } = telephone();
    history.replaceState(null, '', '/appareils');

    render(<App />);
    await waitFor(() => expect(signalAllAcceptedCredentials).toHaveBeenCalledTimes(1));
    serveur.session = BERTHE_FR;

    // Supprimer une passkey relit la liste, désormais sous la session de Berthe.
    const liste = within(await screen.findByTestId('liste-passkeys'));
    fireEvent.click(
      liste.getAllByRole('button', { name: (nom) => nom.startsWith(de.supprimer) })[0],
    );
    fireEvent.click(liste.getByRole('button', { name: (nom) => nom.startsWith(de.confirmer) }));

    // Comme pour les cours : le refus est dit, et l'application passe en reconnexion.
    expect(await screen.findByText(de.erreur_autre_personne)).toBeTruthy();
    expect(await screen.findByTestId('bandeau-session')).toBeTruthy();
    expect(serveur.refus).toEqual(['/api/moi/appareils']);
    expect(signalAllAcceptedCredentials).toHaveBeenCalledTimes(1);
    expect(await moiLocal(base)).toEqual(ALICE_DE);
  });
});

describe('invitation (1e-D6)', () => {
  const JETON = 'jeton-de-test';

  /** Ouvre l'invitation, écrit `nom` dans le champ du nom affiché et demande la passkey. */
  async function creerAvecLeNom(nom: string) {
    history.replaceState(null, '', `/invitation/${JETON}`);
    render(<App />);
    const champ = await screen.findByRole('textbox', { name: de.nom_affiche });
    fireEvent.input(champ, { target: { value: nom } });
    fireEvent.click(screen.getByRole('button', { name: de.creer_passkey }));
  }

  it('invitation_envoie_le_nom_avec_les_options', async () => {
    serveur.prochaineSession = ALICE_DE;
    vi.mocked(startRegistration).mockResolvedValue(
      {} as Awaited<ReturnType<typeof startRegistration>>,
    );

    await creerAvecLeNom('  Neuer Name  ');

    // Le nom validé part avec les options, pour devenir l'étiquette de la passkey ; la création
    // en envoie le même.
    await waitFor(() => expect(serveur.invitations.creations).toHaveLength(1));
    expect(serveur.invitations.options).toEqual([{ jeton: JETON, nomAffiche: 'Neuer Name' }]);
    expect(serveur.invitations.creations[0]).toMatchObject({
      jeton: JETON,
      nomAffiche: 'Neuer Name',
    });
  });

  it('invitation_nom_refuse_n_envoie_rien', async () => {
    await creerAvecLeNom('   ');

    // La règle du serveur, appliquée avant la cérémonie : une passkey sans compte n'est pas créée.
    expect((await screen.findByRole('alert')).textContent).toBe(de.nom_requis);
    expect(serveur.invitations.options).toEqual([]);
    expect(startRegistration).not.toHaveBeenCalled();
  });
});

describe('autre personne (R36)', () => {
  it('liste_et_contenu_autre_personne_rien_n_est_range', async () => {
    const base = page.base as BaseLocale;
    // Alice est la personne de l'appareil, et sa session est ouverte.
    await memoriserMoi(base, ALICE_DE);
    serveur.session = ALICE_DE;
    history.replaceState(null, '', '/compte');
    render(<App />);
    expect(await screen.findByTestId('liste-cours')).toBeTruthy();

    // Un autre onglet connecte Berthe : le cookie du navigateur est désormais le sien.
    serveur.session = BERTHE_FR;
    // L'accueil relit la liste des cours : le serveur la refuse, et l'application passe en
    // reconnexion, comme pour le journal.
    act(() => naviguer('/'));
    expect(await screen.findByText(de.erreur_autre_personne)).toBeTruthy();
    expect(await screen.findByTestId('bandeau-session')).toBeTruthy();
    // Le cours relit son contenu : refusé de même.
    act(() => naviguer(`/cours/${ID}`));
    await waitFor(() => expect(serveur.refus).toEqual(['/api/cours', `/api/cours/${ID}`]));
    expect(await screen.findByText(de.erreur_autre_personne)).toBeTruthy();

    // Rien de ce que la session de Berthe aurait rendu n'est rangé, ni chez Alice ni chez elle.
    expect(await listeLocale(base, ALICE)).toBeUndefined();
    expect(await listeLocale(base, BERTHE)).toBeUndefined();
    expect(await coursLocal(base, ALICE, ID)).toBeUndefined();
    expect(await coursLocal(base, BERTHE, ID)).toBeUndefined();
    expect(await moiLocal(base)).toEqual(ALICE_DE);
  });
});

describe('écran en erreur (1e-D13)', () => {
  /** Le rendu de l'écran des appareils échoue ; la console ne montre pas l'erreur attendue. */
  function appareilsCasse() {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(Appareils).mockImplementation(() => {
      throw new Error('appareils cassé');
    });
    return journal;
  }

  it('ecran_en_erreur_garde_l_en_tete', async () => {
    await appareilDAlice();
    serveur.session = ALICE_DE;
    history.replaceState(null, '', '/appareils');
    const journal = appareilsCasse();
    const recharge = vi.spyOn(location, 'reload').mockImplementation(() => {});

    render(<App />);

    // Le message est dans la langue de la personne, avec « Neu laden » ; l'erreur est consignée.
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain(de.ecran_en_erreur);
    expect(journal).toHaveBeenCalled();
    // L'en-tête (titre, lien vers le compte) et le pied de page (la version) restent là.
    expect(screen.getByRole('heading', { name: 'ancrage' })).toBeTruthy();
    expect(screen.getByRole('link', { name: de.compte_lien })).toBeTruthy();
    expect((await screen.findByTestId('version')).textContent).toContain('0.0.0');
    // Le téléphone a le code du serveur (`local` des deux côtés) : pas de révision d'appareil.
    expect(screen.getByTestId('version').textContent).not.toContain('Gerät');
    fireEvent.click(within(alerte).getByRole('button', { name: de.recharger }));
    expect(recharge).toHaveBeenCalledTimes(1);

    // L'en-tête sert à partir : un autre écran s'affiche, l'erreur ne le suit pas.
    fireEvent.click(screen.getByRole('link', { name: de.compte_lien }));
    expect(await screen.findByTestId('liste-cours')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ecran_en_erreur_dans_la_langue_de_la_personne', async () => {
    serveur.session = BERTHE_FR;
    history.replaceState(null, '', '/appareils');
    appareilsCasse();

    render(<App />);

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain(textes.fr.ecran_en_erreur);
    expect(within(alerte).getByRole('button', { name: textes.fr.recharger })).toBeTruthy();
  });

  it('filet_d_un_ecran_mene_a_l_accueil', async () => {
    // Le lien « ← Accueil » du filet (1f-D11) : `/` est un autre écran, donc un filet neuf.
    await appareilDAlice();
    serveur.session = ALICE_DE;
    history.replaceState(null, '', '/appareils');
    appareilsCasse();
    render(<App />);
    const alerte = await screen.findByRole('alert');

    fireEvent.click(within(alerte).getByRole('link', { name: de.retour_accueil }));

    // L'écran en erreur est parti, l'accueil est ouvert (`/`), puis il mène au seul cours de la
    // personne : on n'y arrive que par lui.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(location.pathname).toBe('/');
    expect(await screen.findByRole('heading', { name: servi.titre })).toBeTruthy();
    expect(location.pathname).toBe(`/cours/${ID}/heute`);
  });

  it('filet_de_l_accueil_sans_lien_vers_lui_meme', async () => {
    // L'accueil lui-même échoue (1f-D11) : un lien vers `/` ne mènerait nulle part.
    await appareilDAlice();
    serveur.session = ALICE_DE;
    history.replaceState(null, '', '/');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(destinationDeLAccueil).mockImplementation(() => {
      throw new Error('accueil cassé');
    });

    render(<App />);

    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain(de.ecran_en_erreur);
    expect(within(alerte).getByRole('button', { name: de.recharger })).toBeTruthy();
    expect(screen.queryByRole('link', { name: de.retour_accueil })).toBeNull();
  });

  it('changer_d_onglet_du_cours_ne_remet_pas_l_ecran_a_neuf', async () => {
    // Le `Rattrapage` de l'écran ne change pas de clé d'un onglet à l'autre : l'écran du cours, son
    // contenu et la mémoire de ses onglets restent en place.
    await appareilDAlice();
    serveur.session = ALICE_DE;
    history.replaceState(null, '', `/cours/${ID}`);
    render(<App />);
    expect(await screen.findByRole('heading', { name: servi.titre })).toBeTruthy();
    const titre = screen.getByRole('heading', { name: servi.titre });

    act(() => naviguer(`/cours/${ID}/quiz`));

    expect(await screen.findByText(tc.quiz_touches)).toBeTruthy();
    expect(screen.getByRole('heading', { name: servi.titre })).toBe(titre);
  });
});

describe('notice de confidentialité (1e-D15)', () => {
  it('pied_de_page_mene_a_la_notice', async () => {
    // Avant tout compte : depuis la connexion et depuis l'invitation (ADR-0007 §3).
    const ecrans: [string, string][] = [
      ['/connexion', de.connexion_titre],
      ['/invitation/jeton-de-test', de.invitation_titre],
    ];
    for (const [chemin, titre] of ecrans) {
      history.replaceState(null, '', chemin);
      const { unmount } = render(<App />);
      expect(await screen.findByRole('heading', { name: titre }), chemin).toBeTruthy();
      const lien = within(screen.getByRole('contentinfo')).getByRole('link', {
        name: de.notice_lien,
      });
      expect(lien.getAttribute('href'), chemin).toBe('/confidentialite');

      fireEvent.click(lien);

      expect(
        await screen.findByRole('heading', { level: 2, name: GABARIT_DE_NOTICE.de.titre }),
        chemin,
      ).toBeTruthy();
      expect(location.pathname, chemin).toBe('/confidentialite');
      // La version reste lue dans le pied de page, à côté du lien.
      expect(screen.getByTestId('version')).toBeTruthy();
      unmount();
    }
  });

  it('notice_hors_ligne_sans_personne_connue_s_affiche', async () => {
    // Sans réseau ni personne connue, la notice reste lisible sur la copie de l'appareil, qu'une
    // visite précédente a rangée (S1-D8). La session est d'abord fixée à `injoignable` (« Keine
    // Verbindung »), pas encore en chargement.
    await (page.base as BaseLocale).put('etat', { cle: 'notice', valeur: NOTICE });
    serveur.enLigne = false;
    history.replaceState(null, '', '/connexion');
    render(<App />);
    expect(await screen.findByText(de.sans_connexion)).toBeTruthy();

    fireEvent.click(
      within(screen.getByRole('contentinfo')).getByRole('link', { name: de.notice_lien }),
    );

    expect(
      await screen.findByRole('heading', { level: 2, name: GABARIT_DE_NOTICE.de.titre }),
    ).toBeTruthy();
    expect(await screen.findByText(NOTICE.valeurs.de.transferts)).toBeTruthy();
    expect(screen.queryByText(de.notice_hors_ligne)).toBeNull();
    expect(screen.queryByText(de.sans_connexion)).toBeNull();
    expect(location.pathname).toBe('/confidentialite');
  });

  it('notice_hors_ligne_sans_copie_dit_la_phrase', async () => {
    // Sans copie ni réseau : le titre, et la phrase qui dit que la page attend le réseau (S1-D9).
    serveur.enLigne = false;
    history.replaceState(null, '', '/confidentialite');
    render(<App />);

    expect(await screen.findByText(de.notice_hors_ligne)).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: GABARIT_DE_NOTICE.de.titre }),
    ).toBeTruthy();
  });

  it('mesure_s_ouvre_sans_connexion_ni_reseau', async () => {
    // L'écran de mesure ne lit rien (M3-P7) : ni session, ni réseau, ne l'empêchent de s'ouvrir.
    for (const enLigne of [false, true]) {
      serveur.enLigne = enLigne;
      history.replaceState(null, '', '/mesure');
      const { unmount } = render(<App />);

      expect(
        await screen.findByRole('heading', { level: 2, name: 'Mesure du rejeu du journal' }),
        String(enLigne),
      ).toBeTruthy();
      expect(location.pathname, String(enLigne)).toBe('/mesure');
      unmount();
    }
  });

  it('notice_chargee_au_demarrage_et_effacee_a_la_deconnexion', async () => {
    // Le démarrage range la copie, comme il lit la santé, sur n'importe quel écran (S1-D8) ; la
    // déconnexion l'efface avec le reste.
    const base = await appareilDAlice();
    serveur.session = ALICE_DE;
    history.replaceState(null, '', '/compte');
    render(<App />);
    await waitFor(async () => expect(await lireNoticeLocale(base)).toEqual(NOTICE));
    expect(location.pathname).toBe('/compte');

    fireEvent.click(await screen.findByRole('button', { name: de.deconnexion }));

    expect(await screen.findByRole('heading', { name: de.connexion_titre })).toBeTruthy();
    expect(await lireNoticeLocale(base)).toBeUndefined();
  });
});
