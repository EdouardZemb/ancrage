/*
 * Les écouteurs du service worker hors de la synchronisation (2a-D1, 2a-D6, 2a-R8) :
 * l'installation, l'activation et le message d'une page. `sw.ts` les branche sur `self` ; ils
 * reçoivent ce dont ils se servent, le service worker et ses caches, que les tests simulent
 * (`sw-gestionnaires.test.ts`), comme `sw-sync.ts` le fait pour l'événement `sync`.
 *
 * Ce module est importé par `sw.ts` : ni `window`, ni `document`, ni `localStorage` ici, ni dans ce
 * qu'il importe (`tsconfig.sw.json` le vérifie). Ses types sont des formes minimales, que le
 * service worker remplit, comme les tests.
 */
import {
  CACHE_PROTOCOLE,
  MESSAGE_PRENDRE_LA_MAIN,
  prendreLaMainALInstallation,
} from './sw-protocole.js';

/** Un événement que le service worker prolonge (`install`, `activate`) : `ExtendableEvent`. */
export interface EvenementProlongeable {
  waitUntil(promesse: Promise<unknown>): void;
}

/**
 * L'événement `install` de l'API Service Worker Static Routing (Chrome 123 et suivants), que les
 * types de TypeScript ne décrivent pas encore. Seule la forme utilisée ici est déclarée.
 */
interface EvenementInstallAvecRoutes extends EvenementProlongeable {
  addRoutes(route: { condition: { urlPattern: URLPattern }; source: 'network' }): Promise<void>;
}

/** Ce que les écouteurs utilisent du service worker (`self`). */
export interface ServiceWorkerUtilise {
  readonly registration: { readonly active: object | null };
  skipWaiting(): Promise<void>;
}

/** Ce que les écouteurs utilisent des caches du service worker (`caches`). */
export interface CachesUtilises {
  has(nom: string): Promise<boolean>;
  open(nom: string): Promise<unknown>;
}

/**
 * L'API va au réseau sans réveiller le service worker, si le navigateur le permet (2a-R8).
 * Réveillé pour une requête de l'écran qui s'ouvre, l'ancien service worker retarderait jusqu'à
 * 30 s la prise de main de la nouvelle version (2a-D2). Sans `addRoutes`, ou si la route est
 * refusée, la console le dit, et rien d'autre ne change : l'installation n'échoue pas, l'API passe
 * par le service worker, comme avant, et la page attend alors le moment suivant
 * (`DELAI_DE_PRISE_DE_MAIN_MS`, `mise-a-jour.ts`).
 */
function routerLApiVersLeReseau(evenement: EvenementProlongeable): void {
  if (!('addRoutes' in evenement)) {
    console.info("ancrage : pas de route statique (addRoutes absent), l'API passe par le worker");
    return;
  }
  const refusee = (raison: unknown) => {
    console.info("ancrage : route statique refusée, l'API passe par le worker", raison);
  };
  try {
    const route = (evenement as EvenementInstallAvecRoutes).addRoutes({
      condition: { urlPattern: new URLPattern({ pathname: '/api/*' }) },
      source: 'network',
    });
    evenement.waitUntil(route.catch(refusee));
  } catch (raison) {
    refusee(raison);
  }
}

/**
 * L'installation : la route statique de l'API, puis le démarrage du protocole (2a-D6). Le premier
 * service worker qui connaît le protocole remplace une version active qui ne le connaît pas, une
 * seule fois : elle ne sait pas envoyer le message.
 */
export function surInstallation(
  evenement: EvenementProlongeable,
  serviceWorker: ServiceWorkerUtilise,
  caches: CachesUtilises,
): void {
  routerLApiVersLeReseau(evenement);
  evenement.waitUntil(
    (async () => {
      const prendre = prendreLaMainALInstallation({
        versionActive: serviceWorker.registration.active !== null,
        protocoleConnu: await caches.has(CACHE_PROTOCOLE),
      });
      if (prendre) await serviceWorker.skipWaiting();
    })(),
  );
}

/** L'activation pose la marque : à partir d'ici, les versions suivantes attendent le message. */
export function surActivation(evenement: EvenementProlongeable, caches: CachesUtilises): void {
  evenement.waitUntil(caches.open(CACHE_PROTOCOLE));
}

/** La demande d'une page (2a-D1) : la version en attente prend la main. */
export function surMessage(
  evenement: { readonly data: unknown },
  serviceWorker: ServiceWorkerUtilise,
): void {
  if (evenement.data === MESSAGE_PRENDRE_LA_MAIN) void serviceWorker.skipWaiting();
}
