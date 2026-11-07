import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import {
  type EvenementProlongeable,
  surActivation,
  surInstallation,
  surMessage,
} from './sw-gestionnaires.js';
import { CACHE_PROTOCOLE, MESSAGE_PRENDRE_LA_MAIN } from './sw-protocole.js';

/** Le service worker simulé : une version active ou non, et ses prises de main. */
function workerSimule(options: { versionActive?: boolean } = {}) {
  return {
    registration: { active: options.versionActive ? {} : null },
    skipWaiting: vi.fn(async () => {}),
  };
}

/** Les caches simulés : ceux qui existent déjà, et ceux que le service worker ouvre. */
function cachesSimules(...existants: string[]) {
  const noms = new Set(existants);
  return {
    noms,
    has: vi.fn(async (nom: string) => noms.has(nom)),
    open: vi.fn(async (nom: string) => {
      noms.add(nom);
      return {};
    }),
  };
}

/** La route que `addRoutes` reçoit : la forme de l'API Service Worker Static Routing. */
interface Route {
  condition: { urlPattern: URLPattern };
  source: string;
}

/**
 * Un événement `install` ou `activate`, et ce qu'il attend (`waitUntil`). Avec `addRoutes` s'il
 * est donné, comme dans Chrome 123 et suivants ; sans, comme ailleurs.
 */
function evenementProlongeable(addRoutes?: (route: Route) => Promise<void>) {
  const attentes: Promise<unknown>[] = [];
  const evenement: EvenementProlongeable = {
    waitUntil: (promesse) => {
      attentes.push(promesse);
    },
    ...(addRoutes === undefined ? {} : { addRoutes }),
  };
  return { evenement, attentes };
}

let traces: MockInstance<typeof console.info>;

beforeEach(() => {
  traces = vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('surInstallation', () => {
  it('installation_sans_add_routes', async () => {
    const { evenement, attentes } = evenementProlongeable();
    const worker = workerSimule({ versionActive: true });

    surInstallation(evenement, worker, cachesSimules(CACHE_PROTOCOLE));

    // L'installation ne manque pas pour autant : seul le démarrage du protocole est attendu.
    expect(attentes).toHaveLength(1);
    await expect(Promise.all(attentes)).resolves.toBeDefined();
    expect(traces).toHaveBeenCalledOnce();
    expect(traces.mock.calls[0][0]).toMatch(/addRoutes absent/);
    expect(worker.skipWaiting).not.toHaveBeenCalled();
  });

  it('add_routes_refuse_trace', async () => {
    // Refusée par sa promesse : l'installation l'attend, sans échouer.
    const rejet = evenementProlongeable(() =>
      Promise.reject(new DOMException('route refusée', 'InvalidStateError')),
    );
    surInstallation(rejet.evenement, workerSimule(), cachesSimules());
    expect(rejet.attentes).toHaveLength(2);
    await expect(Promise.all(rejet.attentes)).resolves.toBeDefined();
    expect(traces).toHaveBeenCalledOnce();
    expect(traces.mock.calls[0][0]).toMatch(/route statique refusée/);

    // Refusée sur-le-champ : rien à attendre de la route, la trace de même.
    const levee = evenementProlongeable(() => {
      throw new TypeError('urlPattern refusé');
    });
    surInstallation(levee.evenement, workerSimule(), cachesSimules());
    expect(levee.attentes).toHaveLength(1);
    await expect(Promise.all(levee.attentes)).resolves.toBeDefined();
    expect(traces).toHaveBeenCalledTimes(2);
    expect(traces.mock.calls[1][0]).toMatch(/route statique refusée/);
  });

  it('add_routes_pose_la_route', async () => {
    const addRoutes = vi.fn(async (_route: Route) => {});
    const { evenement, attentes } = evenementProlongeable(addRoutes);

    surInstallation(evenement, workerSimule(), cachesSimules());

    // L'API, et elle seule, va au réseau sans passer par le service worker (2a-R8).
    expect(addRoutes).toHaveBeenCalledOnce();
    const [route] = addRoutes.mock.calls[0];
    expect(route.source).toBe('network');
    expect(route.condition.urlPattern.test('https://ancrage.test/api/cours')).toBe(true);
    expect(route.condition.urlPattern.test('https://ancrage.test/cours/abcd1234')).toBe(false);
    expect(attentes).toHaveLength(2);
    await expect(Promise.all(attentes)).resolves.toBeDefined();
    expect(traces).not.toHaveBeenCalled();
  });

  it('installation_prend_la_main_au_demarrage_du_protocole_seulement', async () => {
    const installer = async (worker: ReturnType<typeof workerSimule>, ...caches: string[]) => {
      const { evenement, attentes } = evenementProlongeable(async () => {});
      surInstallation(evenement, worker, cachesSimules(...caches));
      await Promise.all(attentes);
      return worker.skipWaiting.mock.calls.length;
    };

    // Une version active qui ne connaît pas le protocole : la nouvelle la remplace (2a-D6).
    expect(await installer(workerSimule({ versionActive: true }))).toBe(1);
    // Le protocole connu, ou aucune version active : la nouvelle attend le message.
    expect(await installer(workerSimule({ versionActive: true }), CACHE_PROTOCOLE)).toBe(0);
    expect(await installer(workerSimule())).toBe(0);
  });
});

describe('surActivation et surMessage', () => {
  it('activation_pose_la_marque', async () => {
    const caches = cachesSimules();
    const { evenement, attentes } = evenementProlongeable();

    surActivation(evenement, caches);

    await Promise.all(attentes);
    expect(caches.open).toHaveBeenCalledExactlyOnceWith(CACHE_PROTOCOLE);
    expect(caches.noms.has(CACHE_PROTOCOLE)).toBe(true);
  });

  it('message_de_prise_de_main_appelle_skip_waiting', () => {
    const worker = workerSimule({ versionActive: true });

    surMessage({ data: 'ancrage:autre' }, worker);
    surMessage({ data: undefined }, worker);
    expect(worker.skipWaiting).not.toHaveBeenCalled();

    surMessage({ data: MESSAGE_PRENDRE_LA_MAIN }, worker);
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });
});
