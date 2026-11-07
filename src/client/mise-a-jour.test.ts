import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  ABSENCE_LONGUE_MS,
  ATTENTE_DES_ENVOIS_MS,
  attendreLesEnvoisDeLaPage,
  DELAI_DE_PRISE_DE_MAIN_MS,
  type EnvironnementMiseAJour,
  installerMiseAJour,
  peutAppliquer,
} from './mise-a-jour.js';
import type { Seance } from './seance.js';
import type { BaseLocale } from './stockage/base-locale.js';
import { MESSAGE_PRENDRE_LA_MAIN } from './sw-protocole.js';
import { attendreLesSynchronisations } from './synchro.js';

// La base de la page et ses synchronisations, pour les envois de la page (2b-D5) : la base s'ouvre
// ou non, selon le test.
const laPage = vi.hoisted(() => ({
  ouvrir: (): Promise<unknown> => Promise.reject(new Error('base de test absente')),
}));
vi.mock('./stockage/base-de-la-page.js', () => ({ baseDeLaPage: () => laPage.ouvrir() }));
vi.mock('./synchro.js', () => ({ attendreLesSynchronisations: vi.fn(async () => {}) }));

const MINUTE = 60 * 1000;

describe('peutAppliquer', () => {
  it('lancement_hors_seance_seulement', () => {
    expect(peutAppliquer('lancement', { seance: null, absenceMs: 0 })).toBe(true);
    expect(peutAppliquer('lancement', { seance: 'journalisee', absenceMs: 0 })).toBe(false);
  });

  it('navigation_hors_seance_seulement', () => {
    expect(peutAppliquer('navigation', { seance: 'journalisee', absenceMs: 0 })).toBe(false);
    expect(peutAppliquer('navigation', { seance: null, absenceMs: 0 })).toBe(true);
    // L'absence ne compte qu'au retour.
    expect(
      peutAppliquer('navigation', { seance: 'journalisee', absenceMs: ABSENCE_LONGUE_MS }),
    ).toBe(false);
  });

  it('retour_en_seance_apres_une_absence_longue_seulement', () => {
    expect(ABSENCE_LONGUE_MS).toBe(30 * MINUTE);
    expect(peutAppliquer('retour', { seance: null, absenceMs: 0 })).toBe(true);
    expect(
      peutAppliquer('retour', { seance: 'journalisee', absenceMs: ABSENCE_LONGUE_MS - 1 }),
    ).toBe(false);
    expect(peutAppliquer('retour', { seance: 'journalisee', absenceMs: ABSENCE_LONGUE_MS })).toBe(
      true,
    );
  });

  it('seance_retenue_jamais_meme_apres_une_absence_longue', () => {
    // Ses réponses ne sont pas encore au journal : l'abandonner les perdrait toutes (2a-D4).
    for (const moment of ['lancement', 'retour', 'navigation'] as const) {
      for (const absenceMs of [0, ABSENCE_LONGUE_MS, 2 * ABSENCE_LONGUE_MS]) {
        expect(peutAppliquer(moment, { seance: 'retenue', absenceMs })).toBe(false);
      }
    }
  });
});

/** Un service worker simulé, qui note les messages reçus. */
class FauxWorker extends EventTarget {
  readonly messages: unknown[] = [];
  state: ServiceWorkerState = 'installed';
  postMessage(message: unknown): void {
    this.messages.push(message);
  }
}

/** La registration simulée : `update()` compte les vérifications et fait ce que le test choisit. */
class FausseRegistration extends EventTarget {
  waiting: FauxWorker | null = null;
  installing: FauxWorker | null = null;
  verifications = 0;
  /** Par défaut, la vérification réussit sans rien trouver. */
  verifier: () => Promise<void> = async () => {};
  update(): Promise<void> {
    this.verifications += 1;
    return this.verifier();
  }
}

/** `navigator.serviceWorker` simulé : il note la portée demandée. */
class FauxConteneur extends EventTarget {
  registration: FausseRegistration | undefined;
  readonly portees: (string | undefined)[] = [];
  /** Par défaut, la registration se lit ; un test peut la rendre illisible. */
  lire: () => Promise<FausseRegistration | undefined> = async () => this.registration;
  constructor(registration: FausseRegistration) {
    super();
    this.registration = registration;
  }
  getRegistration(portee?: string): Promise<FausseRegistration | undefined> {
    this.portees.push(portee);
    return this.lire();
  }
}

/** Le document simulé : son état de visibilité, et l'événement qui en dit le changement. */
class FauxDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
  devenir(etat: DocumentVisibilityState): void {
    this.visibilityState = etat;
    this.dispatchEvent(new Event('visibilitychange'));
  }
}

/**
 * Laisse se régler les promesses en cours : la vérification, la règle du retour, l'attente des
 * envois avant un rechargement (2b-D5). Sous de faux minuteurs, aucun temps ne passe : seul le
 * test l'avance.
 */
async function laisserFiler(): Promise<void> {
  if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(0);
  else await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

/** Une page simulée : son environnement, et de quoi y faire arriver chaque événement. */
function pageSimulee(options: { enAttente?: boolean } = {}) {
  const registration = new FausseRegistration();
  const worker = new FauxWorker();
  if (options.enAttente) registration.waiting = worker;
  const conteneur = new FauxConteneur(registration);
  const document = new FauxDocument();
  // La production n'écoute que `document` (`visibilitychange`) ; la fenêtre simulée, posée en
  // `window` le temps d'un test, sert à prouver que `focus`, `pageshow` et `online`, qui y arrivent
  // dans un vrai navigateur, ne comptent pas.
  const fenetre = new EventTarget();
  // Les envois en cours (les réponses de la sortie du cours, la remise d'un examen) : l'attente des
  // envois se règle quand tous sont finis (2b-D5).
  const envois = new Set<Promise<void>>();
  const abonnes = new Set<() => void>();
  const differes: (() => void)[] = [];
  // Une horloge réaliste : une absence comptée depuis l'instant 0 se verrait.
  const etat = {
    instant: Date.UTC(2026, 9, 27, 8),
    seance: null as Seance | null,
    rechargements: 0,
  };
  const env: EnvironnementMiseAJour = {
    conteneur: conteneur as unknown as ServiceWorkerContainer,
    document: document as unknown as Document,
    maintenant: () => etat.instant,
    recharger: () => {
      etat.rechargements += 1;
    },
    seanceEnCours: () => etat.seance,
    attendreLesEnvois: async () => {
      while (envois.size > 0) await Promise.all([...envois]);
    },
    surNavigation: (abonne) => {
      abonnes.add(abonne);
      return () => {
        abonnes.delete(abonne);
      };
    },
    differer: (f) => {
      differes.push(f);
    },
  };
  return {
    env,
    registration,
    worker,
    conteneur,
    document,
    fenetre,
    etat,
    abonnes,
    differes,
    /** Une version arrive en attente (installée, elle attend son moment). */
    versionEnAttente() {
      registration.waiting = worker;
    },
    /** Un changement d'adresse : les abonnés sont appelés, avant le rendu. */
    naviguer() {
      for (const abonne of [...abonnes]) abonne();
    },
    /**
     * Le rendu de la nouvelle adresse est passé : les fonctions différées s'exécutent, puis un
     * rechargement qu'elles permettent attend les envois.
     */
    async rendre() {
      for (const f of differes.splice(0)) f();
      await laisserFiler();
    },
    /** Quitte la page pendant `ms`, puis y revient. */
    revenir(ms: number) {
      document.devenir('hidden');
      etat.instant += ms;
      document.devenir('visible');
    },
    /** Revient, comme `revenir`, puis laisse se régler la vérification lancée. */
    async revenirApres(ms: number) {
      this.revenir(ms);
      await laisserFiler();
    },
    /** Le service worker qui contrôle la page change ; un rechargement permis attend les envois. */
    async changerDeControleur() {
      conteneur.dispatchEvent(new Event('controllerchange'));
      await laisserFiler();
    },
    /** Un envoi part ; il dure jusqu'à l'appel de la fonction rendue. */
    envoyer(): () => void {
      let finir = () => {};
      const envoi = new Promise<void>((resolve) => {
        finir = resolve;
      });
      envois.add(envoi);
      void envoi.then(() => envois.delete(envoi));
      return finir;
    },
  };
}

type PageSimulee = ReturnType<typeof pageSimulee>;

async function naviguerEtRendre(page: PageSimulee): Promise<void> {
  page.naviguer();
  await page.rendre();
}

/** Installe la mise à jour, puis fait arriver chaque moment : rien ne doit se passer. */
async function installerSansEffet(page: PageSimulee, env: EnvironnementMiseAJour): Promise<void> {
  await expect(installerMiseAJour(env)).resolves.toBeUndefined();
  page.naviguer();
  await page.revenirApres(ABSENCE_LONGUE_MS);
  await page.changerDeControleur();

  expect(page.abonnes.size).toBe(0);
  expect(page.differes).toEqual([]);
  expect(page.registration.verifications).toBe(0);
  expect(page.worker.messages).toEqual([]);
  expect(page.etat.rechargements).toBe(0);
}

/** Une version trouvée par le navigateur lui-même, entre deux moments : elle s'installe. */
async function trouverUneVersion(page: PageSimulee): Promise<void> {
  const nouvelle = page.worker;
  nouvelle.state = 'installing';
  page.registration.installing = nouvelle;
  page.registration.dispatchEvent(new Event('updatefound'));
  nouvelle.state = 'installed';
  page.registration.installing = null;
  page.versionEnAttente();
  nouvelle.dispatchEvent(new Event('statechange'));
  await laisserFiler();
}

/**
 * Une version attend, une série est en cours, et la personne revient après une absence longue : la
 * séance journalisée est tenue pour abandonnée (2a-D4), le message part.
 */
async function retourApresUneSerieAbandonnee(): Promise<PageSimulee> {
  const page = pageSimulee();
  await installerMiseAJour(page.env);
  page.versionEnAttente();
  page.etat.seance = 'journalisee';
  await page.revenirApres(ABSENCE_LONGUE_MS);
  expect(page.worker.messages).toEqual([MESSAGE_PRENDRE_LA_MAIN]);
  return page;
}

describe('installerMiseAJour', () => {
  it('lancement_applique_la_version_qui_attend', async () => {
    const page = pageSimulee({ enAttente: true });

    await installerMiseAJour(page.env);

    expect(page.conteneur.portees).toEqual(['/']);
    expect(page.worker.messages).toEqual([MESSAGE_PRENDRE_LA_MAIN]);
    expect(page.etat.rechargements).toBe(0);
    await page.changerDeControleur();
    expect(page.etat.rechargements).toBe(1);
  });

  it('rien_n_attend_rien_ne_se_passe', async () => {
    const page = pageSimulee();
    await installerMiseAJour(page.env);

    await naviguerEtRendre(page);
    await page.revenirApres(ABSENCE_LONGUE_MS);

    expect(page.registration.verifications).toBe(1);
    expect(page.worker.messages).toEqual([]);
    expect(page.etat.rechargements).toBe(0);
  });

  it('retour_applique_aussitot_selon_la_regle_la_version_qui_attend_deja', async () => {
    const page = pageSimulee();
    await installerMiseAJour(page.env);
    page.versionEnAttente();
    page.etat.seance = 'journalisee';
    // Une vérification qui reste en suspens (un réseau lent) : la règle ne l'attend pas.
    page.registration.verifier = () => new Promise<void>(() => {});

    page.revenir(5 * MINUTE);
    expect(page.registration.verifications).toBe(1);
    expect(page.worker.messages).toEqual([]);

    page.revenir(ABSENCE_LONGUE_MS);
    expect(page.registration.verifications).toBe(2);
    expect(page.worker.messages).toEqual([MESSAGE_PRENDRE_LA_MAIN]);
  });

  it('version_trouvee_au_retour_attend_le_moment_suivant', async () => {
    const page = pageSimulee();
    await installerMiseAJour(page.env);
    // Comme dans un navigateur : `update()` se règle quand la version trouvée s'installe, avant
    // qu'elle n'attende.
    page.registration.verifier = async () => {
      page.worker.state = 'installing';
      page.registration.installing = page.worker;
    };

    await page.revenirApres(MINUTE);
    expect(page.registration.verifications).toBe(1);
    expect(page.worker.messages).toEqual([]);

    // Installée, elle attend : la navigation suivante l'applique.
    page.worker.state = 'installed';
    page.registration.installing = null;
    page.versionEnAttente();
    await naviguerEtRendre(page);
    expect(page.worker.messages).toEqual([MESSAGE_PRENDRE_LA_MAIN]);
  });

  it('retour_sans_depart_connu_ne_compte_aucune_absence', async () => {
    const page = pageSimulee();
    await installerMiseAJour(page.env);
    page.versionEnAttente();
    page.etat.seance = 'journalisee';

    page.etat.instant += 2 * ABSENCE_LONGUE_MS;
    page.document.devenir('visible');
    await laisserFiler();

    expect(page.registration.verifications).toBe(1);
    expect(page.worker.messages).toEqual([]);
  });

  it('navigation_evaluee_apres_le_rendu', async () => {
    const page = pageSimulee();
    await installerMiseAJour(page.env);
    page.versionEnAttente();
    page.etat.seance = 'journalisee';

    // Un autre onglet du cours : l'écran du cours reste, et sa séance aussi.
    await naviguerEtRendre(page);
    expect(page.worker.messages).toEqual([]);

    // La sortie du cours : la règle attend le rendu, qui démonte l'écran du cours.
    page.naviguer();
    expect(page.differes).toHaveLength(1);
    page.etat.seance = null;
    await page.rendre();

    expect(page.worker.messages).toEqual([MESSAGE_PRENDRE_LA_MAIN]);
  });

  it('version_trouvee_entre_deux_moments_attend', async () => {
    const page = pageSimulee();
    await installerMiseAJour(page.env);

    await trouverUneVersion(page);

    expect(page.worker.messages).toEqual([]);
    expect(page.differes).toEqual([]);
    await naviguerEtRendre(page);
    expect(page.worker.messages).toEqual([MESSAGE_PRENDRE_LA_MAIN]);
  });

  it('aucun_moment_hors_des_trois', async () => {
    const page = pageSimulee();
    // La fenêtre simulée est la `window` du module le temps du test : un écouteur que la mise à
    // jour y poserait recevrait les événements envoyés plus bas (l'environnement est `node`).
    vi.stubGlobal('window', page.fenetre);
    try {
      await installerMiseAJour(page.env);
      page.etat.seance = 'journalisee';

      await trouverUneVersion(page);
      // La remise d'une Prüfung met fin à la séance : ce n'est pas un moment.
      page.etat.seance = null;
      page.document.devenir('hidden');
      for (const type of ['focus', 'pageshow', 'online']) {
        page.document.dispatchEvent(new Event(type));
        page.fenetre.dispatchEvent(new Event(type));
      }
      page.conteneur.dispatchEvent(new Event('message'));
      await laisserFiler();
    } finally {
      vi.unstubAllGlobals();
    }

    expect(page.worker.messages).toEqual([]);
    expect(page.registration.verifications).toBe(0);
    expect(page.differes).toEqual([]);
    expect(page.etat.rechargements).toBe(0);
  });

  it('verification_en_echec_ignoree', async () => {
    const page = pageSimulee();
    await installerMiseAJour(page.env);
    const rejeter = () => Promise.reject(new TypeError('Failed to fetch'));
    const erreurs: unknown[] = [];
    const noter = (erreur: unknown) => erreurs.push(erreur);
    process.on('unhandledRejection', noter);
    process.on('uncaughtException', noter);
    try {
      page.registration.verifier = rejeter;
      await page.revenirApres(MINUTE);
      // Une exception levée sur-le-champ est avalée de même.
      page.registration.verifier = () => {
        throw new DOMException('registration désinscrite', 'InvalidStateError');
      };
      await page.revenirApres(MINUTE);
      expect(page.worker.messages).toEqual([]);
      // Une version trouvée avant la panne s'applique tout de même, selon la règle.
      page.registration.verifier = rejeter;
      page.versionEnAttente();
      await page.revenirApres(MINUTE);
    } finally {
      process.off('unhandledRejection', noter);
      process.off('uncaughtException', noter);
    }

    expect(page.registration.verifications).toBe(3);
    expect(erreurs).toEqual([]);
    expect(page.etat.rechargements).toBe(0);
    expect(page.worker.messages).toEqual([MESSAGE_PRENDRE_LA_MAIN]);
  });

  it('un_seul_rechargement_par_chargement', async () => {
    const page = pageSimulee({ enAttente: true });
    await installerMiseAJour(page.env);

    await page.changerDeControleur();
    await page.changerDeControleur();
    // Ni la navigation ni le retour ne rechargent une seconde fois.
    await naviguerEtRendre(page);
    await page.revenirApres(MINUTE);

    expect(page.etat.rechargements).toBe(1);
  });

  it('changement_non_demande_attend_le_moment', async () => {
    const page = pageSimulee();
    await installerMiseAJour(page.env);
    page.etat.seance = 'journalisee';

    // Un autre onglet a appliqué la version.
    await page.changerDeControleur();
    expect(page.etat.rechargements).toBe(0);
    await naviguerEtRendre(page);
    expect(page.etat.rechargements).toBe(0);

    page.etat.seance = null;
    await naviguerEtRendre(page);
    await naviguerEtRendre(page);

    expect(page.etat.rechargements).toBe(1);
    expect(page.worker.messages).toEqual([]);
  });

  it('changement_demande_en_seance_attend_le_moment', async () => {
    const page = pageSimulee({ enAttente: true });
    await installerMiseAJour(page.env);
    expect(page.worker.messages).toEqual([MESSAGE_PRENDRE_LA_MAIN]);

    // Une séance commence avant que la version ne prenne la main : la séance se relit.
    page.etat.seance = 'journalisee';
    await page.changerDeControleur();
    await naviguerEtRendre(page);
    expect(page.etat.rechargements).toBe(0);

    page.etat.seance = null;
    await naviguerEtRendre(page);
    await naviguerEtRendre(page);
    expect(page.etat.rechargements).toBe(1);
  });

  it('prise_de_main_tardive_attend_le_moment_suivant', async () => {
    expect(DELAI_DE_PRISE_DE_MAIN_MS).toBe(5000);
    const page = pageSimulee();
    await installerMiseAJour(page.env);
    page.versionEnAttente();
    await naviguerEtRendre(page);
    expect(page.worker.messages).toEqual([MESSAGE_PRENDRE_LA_MAIN]);

    // L'ancienne version, réveillée par une requête de l'écran ouvert, a retardé l'activation : la
    // page ne se recharge pas sous les yeux.
    page.etat.instant += DELAI_DE_PRISE_DE_MAIN_MS + 1;
    await page.changerDeControleur();
    expect(page.etat.rechargements).toBe(0);

    // La navigation suivante, hors séance, recharge, et une seule fois.
    await naviguerEtRendre(page);
    await naviguerEtRendre(page);
    expect(page.etat.rechargements).toBe(1);
  });

  it('prise_de_main_a_la_limite_du_delai_recharge_aussitot', async () => {
    const page = pageSimulee();
    await installerMiseAJour(page.env);
    page.versionEnAttente();
    await naviguerEtRendre(page);

    page.etat.instant += DELAI_DE_PRISE_DE_MAIN_MS;
    await page.changerDeControleur();

    expect(page.etat.rechargements).toBe(1);
  });

  it('absence_longue_recharge_meme_en_seance_journalisee', async () => {
    const page = await retourApresUneSerieAbandonnee();

    // Relue au changement, avec l'absence qui a envoyé le message, la règle le permet encore.
    await page.changerDeControleur();

    expect(page.etat.rechargements).toBe(1);
  });

  it('absence_longue_n_abandonne_pas_une_seance_retenue', async () => {
    const page = pageSimulee();
    await installerMiseAJour(page.env);
    page.versionEnAttente();
    // Une Prüfung commencée : ses réponses n'iront au journal qu'à la remise.
    page.etat.seance = 'retenue';

    await page.revenirApres(ABSENCE_LONGUE_MS);
    expect(page.registration.verifications).toBe(1);
    expect(page.worker.messages).toEqual([]);
    expect(page.etat.rechargements).toBe(0);

    // L'examen remis, la navigation suivante applique la version.
    page.etat.seance = null;
    await naviguerEtRendre(page);
    expect(page.worker.messages).toEqual([MESSAGE_PRENDRE_LA_MAIN]);
    await page.changerDeControleur();
    expect(page.etat.rechargements).toBe(1);
  });

  it('seance_retenue_avant_la_prise_de_main_attend_le_moment_permis', async () => {
    const page = await retourApresUneSerieAbandonnee();

    // Un Bericht commence avant que la version ne prenne la main : la séance se relit, et elle
    // n'est pas de celles qu'une absence abandonne.
    page.etat.seance = 'retenue';
    await page.changerDeControleur();
    expect(page.etat.rechargements).toBe(0);
    await page.revenirApres(ABSENCE_LONGUE_MS);
    expect(page.etat.rechargements).toBe(0);

    // Le Bericht à son bilan : la navigation suivante recharge.
    page.etat.seance = null;
    await naviguerEtRendre(page);
    expect(page.etat.rechargements).toBe(1);
  });

  it('changement_non_demande_puis_retour_selon_l_absence', async () => {
    const page = pageSimulee();
    await installerMiseAJour(page.env);
    page.etat.seance = 'journalisee';

    // Un autre onglet a appliqué la version.
    await page.changerDeControleur();
    await page.revenirApres(5 * MINUTE);
    expect(page.etat.rechargements).toBe(0);

    await page.revenirApres(ABSENCE_LONGUE_MS);
    expect(page.etat.rechargements).toBe(1);
  });

  it('rechargement_attend_les_envois', async () => {
    const page = pageSimulee({ enAttente: true });
    await installerMiseAJour(page.env);
    // La sortie du cours a lancé l'envoi des réponses : le rechargement le laisse finir.
    const finir = page.envoyer();

    await page.changerDeControleur();
    expect(page.etat.rechargements).toBe(0);

    finir();
    await laisserFiler();
    expect(page.etat.rechargements).toBe(1);
  });

  it('attente_bornee_a_deux_secondes', async () => {
    expect(ATTENTE_DES_ENVOIS_MS).toBe(2000);
    vi.useFakeTimers();
    try {
      const page = pageSimulee({ enAttente: true });
      await installerMiseAJour(page.env);
      // Un envoi qui ne finit pas, sur un réseau lent : la page se recharge tout de même.
      page.envoyer();

      await page.changerDeControleur();
      await vi.advanceTimersByTimeAsync(ATTENTE_DES_ENVOIS_MS - 1);
      expect(page.etat.rechargements).toBe(0);
      await vi.advanceTimersByTimeAsync(1);
      expect(page.etat.rechargements).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('seance_commencee_pendant_l_attente_retient', async () => {
    const page = pageSimulee({ enAttente: true });
    await installerMiseAJour(page.env);
    const finir = page.envoyer();
    await page.changerDeControleur();

    // Une série commence pendant l'attente : la règle, relue avec le même moment, ne permet plus.
    page.etat.seance = 'journalisee';
    finir();
    await laisserFiler();
    expect(page.etat.rechargements).toBe(0);
    await naviguerEtRendre(page);
    expect(page.etat.rechargements).toBe(0);

    // La série finie, le moment permis suivant recharge, une seule fois, sans nouvelle demande.
    page.etat.seance = null;
    await naviguerEtRendre(page);
    await naviguerEtRendre(page);
    await page.revenirApres(MINUTE);
    expect(page.etat.rechargements).toBe(1);
    expect(page.worker.messages).toEqual([MESSAGE_PRENDRE_LA_MAIN]);
  });

  it('chrono_ecoule_pendant_l_absence_remise_puis_version_appliquee', async () => {
    const page = pageSimulee();
    await installerMiseAJour(page.env);
    // Une Prüfung commencée, puis la personne quitte l'application. Pendant son absence, une
    // version s'installe, et le temps de l'examen s'écoule.
    page.etat.seance = 'retenue';
    page.document.devenir('hidden');
    await trouverUneVersion(page);
    page.etat.instant += 2 * ABSENCE_LONGUE_MS;

    // Le retour : la règle se lit aussitôt, l'examen n'est pas encore remis. Une séance retenue
    // n'est jamais abandonnée, la version attend.
    page.document.devenir('visible');
    await laisserFiler();
    expect(page.registration.verifications).toBe(1);
    expect(page.worker.messages).toEqual([]);

    // Au tic suivant du chrono, l'examen échu est remis : la séance prend fin, son envoi part. La
    // remise n'est pas un moment.
    page.etat.seance = null;
    const finirLaRemise = page.envoyer();
    await laisserFiler();
    expect(page.worker.messages).toEqual([]);

    // La navigation suivante applique la version, une fois la remise envoyée.
    await naviguerEtRendre(page);
    expect(page.worker.messages).toEqual([MESSAGE_PRENDRE_LA_MAIN]);
    await page.changerDeControleur();
    expect(page.etat.rechargements).toBe(0);
    finirLaRemise();
    await laisserFiler();
    expect(page.etat.rechargements).toBe(1);

    // Une seule fois.
    await naviguerEtRendre(page);
    await page.revenirApres(ABSENCE_LONGUE_MS);
    await page.changerDeControleur();
    expect(page.etat.rechargements).toBe(1);
  });

  it('envois_de_la_page_attendus_sur_sa_base', async () => {
    const attendre = vi.mocked(attendreLesSynchronisations);
    // Indépendant des autres tests : les appels comptent depuis zéro, et la base de la page
    // reprend son état d'origine à la fin.
    attendre.mockClear();
    const ouvrirDOrigine = laPage.ouvrir;
    onTestFinished(() => {
      laPage.ouvrir = ouvrirDOrigine;
    });
    // La base ne s'ouvre pas : aucun envoi ne peut être en cours, rien à attendre.
    laPage.ouvrir = () => Promise.reject(new Error('IndexedDB indisponible'));
    await expect(attendreLesEnvoisDeLaPage()).resolves.toBeUndefined();
    expect(attendre).not.toHaveBeenCalled();

    // Ouverte : ses synchronisations, envois compris.
    const base = {} as BaseLocale;
    laPage.ouvrir = async () => base;
    let finir = () => {};
    attendre.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finir = resolve;
        }),
    );
    let reglee = false;
    const attente = attendreLesEnvoisDeLaPage().then(() => {
      reglee = true;
    });
    await laisserFiler();
    expect(attendre).toHaveBeenCalledExactlyOnceWith(base);
    expect(reglee).toBe(false);
    finir();
    await attente;
    expect(reglee).toBe(true);
  });

  it('sans_service_worker_rien', async () => {
    const sansConteneur = pageSimulee({ enAttente: true });
    await installerSansEffet(sansConteneur, { ...sansConteneur.env, conteneur: undefined });

    const sansRegistration = pageSimulee({ enAttente: true });
    sansRegistration.conteneur.registration = undefined;
    await installerSansEffet(sansRegistration, sansRegistration.env);
  });

  it('registration_illisible_rien', async () => {
    const page = pageSimulee({ enAttente: true });
    page.conteneur.lire = () =>
      Promise.reject(new DOMException('registration illisible', 'InvalidStateError'));

    // Sa promesse se résout : aucun rejet n'est laissé à `main.tsx`, qui ne l'attend pas.
    await installerSansEffet(page, page.env);
    expect(page.conteneur.portees).toEqual(['/']);
  });
});
