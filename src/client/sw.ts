/*
 * Le service worker d'ancrage (décisions 11 et 25, 2a-D1). Il précache l'application, et elle
 * seule : `index.html`, le code, les styles, les polices, les icônes et le manifeste, dont la liste
 * est insérée à la construction (`self.__WB_MANIFEST`, `vite-plugin-pwa` en `injectManifest`).
 * Ainsi l'application s'ouvre sans réseau.
 *
 * Rien de l'API n'entre dans un cache : aucune route de Workbox ne vise `/api/`, et la route des
 * navigations l'exclut. Une requête qu'aucune route ne prend part au réseau, comme sans service
 * worker. Quand le navigateur le permet, la route statique posée à l'installation (`addRoutes`,
 * `sw-gestionnaires.ts`) envoie même l'API au réseau sans passer par le service worker, ni le
 * réveiller. Le contenu des cours vit dans IndexedDB, rangé par l'application après contrôle des
 * droits (décision 11, invariant 3).
 *
 * Ni `clientsClaim` ni `skipWaiting` d'office (2a-D1, qui remplace la décision 16) : une nouvelle
 * version attend, et ne prend la main que sur le message `MESSAGE_PRENDRE_LA_MAIN` d'une page,
 * jamais en pleine séance. Une seule exception (2a-D6) : le premier service worker qui connaît ce
 * protocole prend la main à son installation, car la version d'avant ne sait pas envoyer le
 * message ; il ne force aucune navigation. La page qui enregistre le service worker pour la
 * première fois n'est pas contrôlée ; celle d'après l'est.
 *
 * Ce fichier est construit à part (`tsconfig.sw.json`) : ses globales sont celles d'un worker, pas
 * celles d'une page. Il ne fait que brancher : les écouteurs sont dans `sw-sync.ts` et
 * `sw-gestionnaires.ts`, testés sans worker.
 */
// Le premier : avant que le moindre schéma de zod ne soit construit (R37).
import './zod-sans-jit.js';
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { surActivation, surInstallation, surMessage } from './sw-gestionnaires.js';
import { type EvenementSync, surSync } from './sw-sync.js';

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);
// Les caches de précache d'un format plus ancien de Workbox.
cleanupOutdatedCaches();

// Toute navigation de l'application (`/`, `/cours/…`, `/compte`…) reçoit `index.html` du
// précache, avec ou sans réseau : le routeur du client prend ensuite le relais. Une navigation
// vers `/api/` (une adresse de l'API ouverte dans un onglet) part au serveur.
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }),
);

// La synchronisation en arrière-plan (décision 15, étiquette `ancrage-journal`) : la file de la
// personne connue de l'appareil part quand le réseau revient (`sw-sync.ts`). L'événement `sync`
// n'est pas dans les types de TypeScript.
self.addEventListener('sync', (evenement) => surSync(evenement as unknown as EvenementSync));

// L'installation : la route statique de l'API (2a-R8), puis le démarrage du protocole (2a-D6),
// qui remplace une version qui ne le connaît pas, une seule fois.
self.addEventListener('install', (evenement) => surInstallation(evenement, self, caches));

// La marque : à partir d'ici, les versions suivantes attendent le message.
self.addEventListener('activate', (evenement) => surActivation(evenement, caches));

// La demande d'une page (2a-D1).
self.addEventListener('message', (evenement) => surMessage(evenement, self));
