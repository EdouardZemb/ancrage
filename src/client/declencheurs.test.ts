import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  annulerSynchrosProgrammees,
  demanderSyncArrierePlan,
  installerDeclencheurs,
  planifierApresReponse,
  retirerSynchroProgrammee,
} from './declencheurs.js';

/** Un document dont le test fixe la visibilité. */
class FauxDocument extends EventTarget {
  visibilityState: DocumentVisibilityState = 'visible';
}

function cible() {
  const fenetre = new EventTarget();
  const document = new FauxDocument();
  return {
    fenetre,
    document,
    pour: { fenetre: fenetre as unknown as Window, document: document as unknown as Document },
  };
}

function passerA(document: FauxDocument, etat: DocumentVisibilityState): void {
  document.visibilityState = etat;
  document.dispatchEvent(new Event('visibilitychange'));
}

afterEach(() => {
  annulerSynchrosProgrammees();
  vi.useRealTimers();
});

describe('installerDeclencheurs', () => {
  it('declencheurs_online_et_arriere_plan', () => {
    const synchroniser = vi.fn();
    const { fenetre, document, pour } = cible();

    const desinstaller = installerDeclencheurs(synchroniser, pour);

    // Le retour du réseau.
    fenetre.dispatchEvent(new Event('online'));
    expect(synchroniser).toHaveBeenCalledTimes(1);
    // Le passage en arrière-plan, et lui seul : revenir au premier plan ne synchronise pas.
    passerA(document, 'hidden');
    expect(synchroniser).toHaveBeenCalledTimes(2);
    passerA(document, 'visible');
    fenetre.dispatchEvent(new Event('offline'));
    expect(synchroniser).toHaveBeenCalledTimes(2);

    // Désinstallés, ils ne déclenchent plus rien.
    desinstaller();
    fenetre.dispatchEvent(new Event('online'));
    passerA(document, 'hidden');
    expect(synchroniser).toHaveBeenCalledTimes(2);
  });

  it('deux_ecrans_ont_chacun_leurs_declencheurs', () => {
    const premier = vi.fn();
    const second = vi.fn();
    const { fenetre, pour } = cible();
    const desinstallerPremier = installerDeclencheurs(premier, pour);
    installerDeclencheurs(second, pour);

    desinstallerPremier();
    fenetre.dispatchEvent(new Event('online'));

    expect(premier).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('planifierApresReponse', () => {
  it('trois_secondes_apres_la_derniere_reponse', () => {
    vi.useFakeTimers();
    const synchroniser = vi.fn();

    planifierApresReponse(synchroniser);
    vi.advanceTimersByTime(2000);
    // Une nouvelle réponse avant les 3 s : le compte repart d'elle.
    planifierApresReponse(synchroniser);
    vi.advanceTimersByTime(2999);
    expect(synchroniser).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(synchroniser).toHaveBeenCalledTimes(1);
    // Une seule synchronisation pour toute la série de réponses.
    vi.advanceTimersByTime(10_000);
    expect(synchroniser).toHaveBeenCalledTimes(1);
  });

  it('chaque_ecran_a_son_minuteur', () => {
    vi.useFakeTimers();
    const premier = vi.fn();
    const second = vi.fn();

    planifierApresReponse(premier);
    vi.advanceTimersByTime(1000);
    planifierApresReponse(second);
    vi.advanceTimersByTime(2000);

    expect(premier).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('annuler_les_synchronisations_programmees', () => {
    vi.useFakeTimers();
    const premier = vi.fn();
    const second = vi.fn();
    planifierApresReponse(premier);
    planifierApresReponse(second);

    // Avant un changement de session (R19) : aucune ne partira.
    annulerSynchrosProgrammees();
    vi.advanceTimersByTime(10_000);

    expect(premier).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
    // On peut en programmer de nouvelles ensuite.
    planifierApresReponse(premier);
    vi.advanceTimersByTime(3000);
    expect(premier).toHaveBeenCalledTimes(1);
  });

  it('retirer_la_synchronisation_programmee', () => {
    vi.useFakeTimers();
    const premier = vi.fn();
    const second = vi.fn();
    planifierApresReponse(premier);
    planifierApresReponse(second);

    // L'écran qui part retire la sienne, et sait qu'il y en avait une ; l'autre reste.
    expect(retirerSynchroProgrammee(premier)).toBe(true);
    expect(retirerSynchroProgrammee(premier)).toBe(false);
    vi.advanceTimersByTime(3000);

    expect(premier).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    // Une fois partie, il n'y a plus rien à retirer.
    expect(retirerSynchroProgrammee(second)).toBe(false);
  });
});

describe('demanderSyncArrierePlan', () => {
  /** Un `navigator.serviceWorker` dont l'enregistrement a, ou non, la synchronisation. */
  function conteneur(sync: { register: (etiquette: string) => Promise<void> } | undefined) {
    const registration = sync === undefined ? {} : { sync };
    return {
      getRegistration: async () => registration as ServiceWorkerRegistration,
    } as unknown as ServiceWorkerContainer;
  }

  it('demande_la_synchronisation_ancrage_journal_si_le_navigateur_la_propose', async () => {
    const register = vi.fn(async (_etiquette: string) => {});

    await demanderSyncArrierePlan(conteneur({ register }));

    expect(register).toHaveBeenCalledWith('ancrage-journal');
  });

  it('sans_synchronisation_en_arriere_plan_rien_ne_casse', async () => {
    // Un navigateur sans `SyncManager`, sans service worker, ou qui refuse la demande : la
    // promesse aboutit toujours, sans rien rendre.
    const sansEnregistrement = vi.fn(async () => undefined);
    const refusee = vi.fn((_etiquette: string) =>
      Promise.reject(new DOMException('refusé', 'NotAllowedError')),
    );
    const interdit = vi.fn(() => Promise.reject(new DOMException('refusé', 'SecurityError')));

    await expect(demanderSyncArrierePlan(conteneur(undefined))).resolves.toBeUndefined();
    await expect(demanderSyncArrierePlan(undefined)).resolves.toBeUndefined();
    await expect(
      demanderSyncArrierePlan({
        getRegistration: sansEnregistrement,
      } as unknown as ServiceWorkerContainer),
    ).resolves.toBeUndefined();
    await expect(
      demanderSyncArrierePlan(conteneur({ register: refusee })),
    ).resolves.toBeUndefined();
    await expect(
      demanderSyncArrierePlan({ getRegistration: interdit } as unknown as ServiceWorkerContainer),
    ).resolves.toBeUndefined();

    // Chaque fois, la demande a bien été tentée.
    expect(sansEnregistrement).toHaveBeenCalledTimes(1);
    expect(refusee).toHaveBeenCalledWith('ancrage-journal');
    expect(interdit).toHaveBeenCalledTimes(1);
  });
});
