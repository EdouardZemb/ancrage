import 'fake-indexeddb/auto';
import { deleteDB } from 'idb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Moi } from './api.js';
import { json } from './reponse.fixture.js';
import {
  type BaseLocale,
  memoriserMoi,
  NOM_BASE,
  ouvrirBaseLocale,
} from './stockage/base-locale.js';
import {
  ALICE,
  AUTRE_COURS_DE_TEST,
  BERTHE,
  COURS_DE_TEST,
  idDeTest,
  reponseDeTest,
} from './stockage/evenements.fixture.js';
import { ajouterEvenement, fileDuCours } from './stockage/journal-local.js';
import { ETIQUETTE_SYNC, type EvenementSync, surSync } from './sw-sync.js';

const MOI_ALICE: Moi = {
  id: ALICE,
  nomAffiche: 'Lernende Test',
  langue: 'de',
  proprietaire: false,
};

/** Une requête vue par le faux `fetch` du service worker. */
interface Requete {
  methode: string | undefined;
  url: string;
  personne: string | undefined;
  ids: string[];
}

let requetes: Requete[];
let base: BaseLocale;

/** Le `fetch` du service worker : il note chaque requête, puis rend la réponse de `repondre`. */
function serveur(repondre: () => Response) {
  vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
    const corps = init?.body === undefined ? undefined : JSON.parse(String(init.body));
    requetes.push({
      methode: init?.method,
      url: String(url),
      personne: (init?.headers as Record<string, string> | undefined)?.['x-ancrage-personne'],
      ids: (corps?.evenements ?? []).map(({ id }: { id: string }) => id),
    });
    return repondre();
  });
}

/** L'événement `sync` que le navigateur remet au service worker, et ce qu'il attend. */
function evenementSync(tag = ETIQUETTE_SYNC) {
  const attentes: Promise<unknown>[] = [];
  const evenement: EvenementSync = { tag, waitUntil: (promesse) => attentes.push(promesse) };
  return { evenement, attentes };
}

beforeEach(async () => {
  requetes = [];
  // La base du service worker est celle de l'application : la même, sous le même nom.
  base = await ouvrirBaseLocale();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  base.close();
  await deleteDB(NOM_BASE);
});

describe('surSync', () => {
  it('sync_arriere_plan_envoie_la_file', async () => {
    await memoriserMoi(base, MOI_ALICE);
    await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 1));
    await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 2));
    await ajouterEvenement(base, ALICE, reponseDeTest(AUTRE_COURS_DE_TEST, 3));
    // La file d'une autre personne, restée sur l'appareil : elle ne part que sous sa session.
    await ajouterEvenement(base, BERTHE, reponseDeTest(COURS_DE_TEST, 4));
    serveur(() => json({ acceptes: 1 }));
    const { evenement, attentes } = evenementSync();

    surSync(evenement);

    // Le navigateur garde le service worker en vie jusqu'à la fin de l'envoi.
    expect(attentes).toHaveLength(1);
    await Promise.all(attentes);
    expect(requetes).toEqual([
      {
        methode: 'POST',
        url: `/api/cours/${COURS_DE_TEST}/journal`,
        personne: ALICE,
        ids: [idDeTest(1), idDeTest(2)],
      },
      {
        methode: 'POST',
        url: `/api/cours/${AUTRE_COURS_DE_TEST}/journal`,
        personne: ALICE,
        ids: [idDeTest(3)],
      },
    ]);
    // Un envoi seul : rien n'est lu.
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toEqual([]);
    expect(await fileDuCours(base, ALICE, AUTRE_COURS_DE_TEST)).toEqual([]);
    expect(await fileDuCours(base, BERTHE, COURS_DE_TEST)).toHaveLength(1);
  });

  it('serveur_injoignable_la_synchronisation_echoue_pour_etre_reprise', async () => {
    await memoriserMoi(base, MOI_ALICE);
    await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 1));
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    const { evenement, attentes } = evenementSync();

    surSync(evenement);

    // Une promesse rejetée : le navigateur retentera plus tard. La file est gardée.
    await expect(Promise.all(attentes)).rejects.toThrow();
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
  });

  it('session_d_une_autre_personne_file_gardee_sans_nouvel_essai', async () => {
    await memoriserMoi(base, MOI_ALICE);
    await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 1));
    // La session du navigateur n'est plus celle d'Alice : le serveur refuse sa file (R21).
    serveur(() => json({ erreur: 'autre_personne' }, 409));
    const { evenement, attentes } = evenementSync();

    surSync(evenement);

    // Réessayer ne servirait à rien tant qu'elle ne s'est pas reconnectée : la promesse aboutit.
    await Promise.all(attentes);
    expect(requetes.map(({ personne }) => personne)).toEqual([ALICE]);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
  });

  it('sans_personne_connue_rien_ne_part', async () => {
    await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 1));
    serveur(() => json({ acceptes: 1 }));
    const { evenement, attentes } = evenementSync();

    surSync(evenement);

    await Promise.all(attentes);
    expect(requetes).toEqual([]);
    expect(await fileDuCours(base, ALICE, COURS_DE_TEST)).toHaveLength(1);
  });

  it('une_autre_etiquette_est_ignoree', async () => {
    await memoriserMoi(base, MOI_ALICE);
    await ajouterEvenement(base, ALICE, reponseDeTest(COURS_DE_TEST, 1));
    serveur(() => json({ acceptes: 1 }));
    const { evenement, attentes } = evenementSync('autre-chose');

    surSync(evenement);

    expect(attentes).toEqual([]);
    expect(requetes).toEqual([]);
  });
});
