/*
 * Les moments de la synchronisation (décision 15), côté page :
 * - au démarrage d'un écran de cours et en fin de séance : `useProgression` s'en charge ;
 * - au retour du réseau (`online`) et au passage en arrière-plan (`visibilitychange` vers
 *   `hidden`) : `installerDeclencheurs` ;
 * - 3 s après la dernière réponse : `planifierApresReponse` ; l'écran quitté avant, la
 *   synchronisation part aussitôt (`retirerSynchroProgrammee`).
 *
 * Si l'envoi échoue faute de réseau, `demanderSyncArrierePlan` confie la suite au service worker
 * (événement `sync`, `sw-sync.ts`), quand le navigateur le propose.
 *
 * Avant tout changement de session, les synchronisations programmées sont annulées
 * (`annulerSynchrosProgrammees`, R19) : un minuteur ne doit pas partir sous la session suivante.
 */
import { ETIQUETTE_SYNC } from './sw-sync.js';

/** Le délai entre la dernière réponse et la synchronisation. */
const APRES_REPONSE_MS = 3000;

/** Le minuteur de chaque fonction de synchronisation (un par écran de cours). */
const minuteurs = new Map<() => void, ReturnType<typeof setTimeout>>();

/**
 * Synchronise au retour du réseau et au passage en arrière-plan. Rend la fonction qui retire ces
 * déclencheurs, à appeler quand l'écran disparaît.
 */
export function installerDeclencheurs(
  synchroniser: () => void,
  cible: { fenetre: Window; document: Document } = { fenetre: window, document },
): () => void {
  const enLigne = () => synchroniser();
  const visibilite = () => {
    if (cible.document.visibilityState === 'hidden') synchroniser();
  };
  cible.fenetre.addEventListener('online', enLigne);
  cible.document.addEventListener('visibilitychange', visibilite);
  return () => {
    cible.fenetre.removeEventListener('online', enLigne);
    cible.document.removeEventListener('visibilitychange', visibilite);
  };
}

/**
 * Synchronise 3 s après la dernière réponse : chaque appel repart de zéro, si bien qu'une série
 * de réponses rapprochées ne donne qu'une synchronisation, 3 s après la dernière.
 */
export function planifierApresReponse(synchroniser: () => void): void {
  clearTimeout(minuteurs.get(synchroniser));
  minuteurs.set(
    synchroniser,
    setTimeout(() => {
      minuteurs.delete(synchroniser);
      synchroniser();
    }, APRES_REPONSE_MS),
  );
}

/**
 * Retire la synchronisation programmée pour `synchroniser`, sans la lancer ; rend `true` s'il y en
 * avait une. L'écran qui part la fait alors lui-même, tout de suite (décision 15).
 */
export function retirerSynchroProgrammee(synchroniser: () => void): boolean {
  const minuteur = minuteurs.get(synchroniser);
  if (minuteur === undefined) return false;
  clearTimeout(minuteur);
  minuteurs.delete(synchroniser);
  return true;
}

/** Annule toutes les synchronisations programmées (avant un changement de session, R19). */
export function annulerSynchrosProgrammees(): void {
  for (const minuteur of minuteurs.values()) clearTimeout(minuteur);
  minuteurs.clear();
}

/** L'enregistrement du service worker, et sa synchronisation en arrière-plan s'il en a une. */
type EnregistrementAvecSync = ServiceWorkerRegistration & {
  sync?: { register(etiquette: string): Promise<void> };
};

function conteneurDeLaPage(): ServiceWorkerContainer | undefined {
  try {
    return 'serviceWorker' in navigator ? navigator.serviceWorker : undefined;
  } catch {
    // Un contexte qui n'y donne pas accès.
    return undefined;
  }
}

/**
 * Demande au navigateur une synchronisation en arrière-plan (`ancrage-journal`), que le service
 * worker fera au retour du réseau. Sans service worker, ou sans `SyncManager` (Firefox, Safari),
 * ou si le navigateur refuse : rien, et les déclencheurs de la page prendront le relais.
 */
export async function demanderSyncArrierePlan(
  conteneur: ServiceWorkerContainer | undefined = conteneurDeLaPage(),
): Promise<void> {
  try {
    const enregistrement = (await conteneur?.getRegistration()) as
      | EnregistrementAvecSync
      | undefined;
    await enregistrement?.sync?.register(ETIQUETTE_SYNC);
  } catch {
    // Refusée ou indisponible : la page synchronisera à son prochain déclencheur.
  }
}
