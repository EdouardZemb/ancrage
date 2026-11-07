import { afterEach, expect, it, vi } from 'vitest';
import { type Base, fermerBase } from '../base/base.js';
import { instantane, peuplerLesComptes, tablesDe } from '../base/schema.fixture.js';
import * as schema from '../base/schema.js';
import { espionnerLesTransactions, fichierContient, retenirLeWal } from '../base/wal.fixture.js';
import { installerEnvironnement } from '../environnement.fixture.js';
import type { Depot } from './depot.js';
import { DUREE_REGISTRE_MS, INTERVALLE_PURGE_MS, planifierPurge, purger } from './purge.js';
import { POINT_DE_CONTROLE_INCOMPLET, supprimerPersonne } from './suppression.js';

/*
 * NE PAS METTRE DE `describe` DANS CE FICHIER : voir le commentaire de `../../domaine/acces.test.ts`
 * (Stryker ne retrouve pas un test placé dans une suite : un mutant de `purge.ts` paraîtrait
 * toujours survivre). Chaque nom de test porte seul son contexte.
 */

const COURS = 'cm5r8t23';
const NOM = 'Témoin-Zoé-7f3a';
const T0 = new Date('2026-10-18T08:00:00.000Z');
const JOUR_MS = 24 * 60 * 60 * 1000;

let chemin: string;
let base: Base;
let depot: Depot;

installerEnvironnement(
  (environnement) => {
    ({ chemin, base, depot } = environnement);
  },
  { debut: T0, nomDeLaBase: 'ancrage.sqlite' },
);

// Les minuteries factices sont remises avant que le dossier ne soit supprimé : les hooks d'après
// s'exécutent dans l'ordre inverse de leur déclaration.
afterEach(() => {
  vi.useRealTimers();
});

function personneDeTest() {
  return depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
}

function sessions(): string[] {
  return (
    base.sqlite.prepare('select empreinte from session order by empreinte').all() as {
      empreinte: string;
    }[]
  ).map((ligne) => ligne.empreinte);
}

function liens(): string[] {
  return (
    base.sqlite.prepare('select empreinte from lien order by empreinte').all() as {
      empreinte: string;
    }[]
  ).map((ligne) => ligne.empreinte);
}

function registre(): string[] {
  return (
    base.sqlite.prepare('select personne from suppression order by personne').all() as {
      personne: string;
    }[]
  ).map((ligne) => ligne.personne);
}

function inscrire(personne: string, supprimeLe: Date): void {
  base.db
    .insert(schema.suppression)
    .values({ personne, supprime_le: supprimeLe.toISOString() })
    .run();
}

it('purger_ecrit_en_transaction_immediate', () => {
  const espion = espionnerLesTransactions(base.sqlite);

  purger(base, T0, vi.fn());

  expect(espion.manieres).toEqual(['immediate']);
});

it('purge_sessions_expirees_garde_les_valides', () => {
  const alice = personneDeTest();
  const expireLe = (decalageMs: number) => new Date(T0.getTime() + decalageMs).toISOString();
  for (const [empreinte, decalage] of [
    ['expiree-depuis-un-jour', -JOUR_MS],
    // À l'instant exact de l'expiration, la session part (`<=`) : une comparaison stricte la
    // garderait, et ce test échouerait.
    ['expiree-pile', 0],
    ['expire-dans-1-ms', 1],
    ['valide-180-jours', 180 * JOUR_MS],
  ] as const) {
    depot.creerSession({
      personne: alice.id,
      empreinte,
      appareil: 'Android',
      expireLe: expireLe(decalage),
    });
  }

  const bilan = purger(base, T0, vi.fn());

  expect(bilan).toEqual({ sessions: 2, liens: 0, suppressions: 0 });
  expect(sessions()).toEqual(['expire-dans-1-ms', 'valide-180-jours']);
});

it('purge_liens_utilises_ou_expires_garde_les_actifs', () => {
  const alice = personneDeTest();
  const expireLe = (decalageMs: number) => new Date(T0.getTime() + decalageMs).toISOString();
  depot.creerLien({
    empreinte: 'connexion-expiree',
    type: 'connexion',
    personne: alice.id,
    expireLe: expireLe(-1),
  });
  // À l'instant exact de l'expiration, le lien part (`<=`), comme la session.
  depot.creerLien({
    empreinte: 'connexion-expiree-pile',
    type: 'connexion',
    personne: alice.id,
    expireLe: expireLe(0),
  });
  depot.creerLien({
    empreinte: 'connexion-utilisee',
    type: 'connexion',
    personne: alice.id,
    expireLe: expireLe(JOUR_MS),
  });
  depot.consommerLien('connexion-utilisee', 'connexion');
  depot.creerLien({
    empreinte: 'connexion-active',
    type: 'connexion',
    personne: alice.id,
    expireLe: expireLe(JOUR_MS),
  });
  depot.creerLien({
    empreinte: 'invitation-expiree',
    type: 'invitation',
    expireLe: expireLe(-JOUR_MS),
  });
  depot.creerLien({
    empreinte: 'invitation-active',
    type: 'invitation',
    expireLe: expireLe(7 * JOUR_MS),
  });

  const bilan = purger(base, T0, vi.fn());

  expect(bilan).toEqual({ sessions: 0, liens: 4, suppressions: 0 });
  expect(liens()).toEqual(['connexion-active', 'invitation-active']);
});

it('purge_registre_apres_100_jours', () => {
  expect(DUREE_REGISTRE_MS).toBe(100 * JOUR_MS);
  inscrire('personne-99-jours', new Date(T0.getTime() - 99 * JOUR_MS));
  inscrire('personne-100-jours-moins-1-ms', new Date(T0.getTime() - DUREE_REGISTRE_MS + 1));
  // À 100 jours pile, l'entrée part (`<=`) ; une milliseconde de moins, elle reste.
  inscrire('personne-100-jours-pile', new Date(T0.getTime() - DUREE_REGISTRE_MS));
  inscrire('personne-100-jours-et-1-ms', new Date(T0.getTime() - DUREE_REGISTRE_MS - 1));
  inscrire('personne-un-an', new Date(T0.getTime() - 365 * JOUR_MS));

  const bilan = purger(base, T0, vi.fn());

  expect(bilan).toEqual({ sessions: 0, liens: 0, suppressions: 3 });
  expect(registre()).toEqual(['personne-100-jours-moins-1-ms', 'personne-99-jours']);
});

it('purge_ne_touche_pas_aux_autres_tables', () => {
  peuplerLesComptes(base, COURS);
  const purgees = ['session', 'lien', 'suppression'];
  const garde = {
    tables: tablesDe(base.sqlite).filter((table) => !purgees.includes(table)),
    migrations: 0,
  };
  const avant = instantane(base.sqlite, garde);

  // La session de la fixture expire le 01/12 et son lien le 18/10 à 00:00 : au 18/10 à 08:00,
  // seul le lien a expiré.
  const bilan = purger(base, T0, vi.fn());

  expect(bilan).toEqual({ sessions: 0, liens: 1, suppressions: 0 });
  expect(instantane(base.sqlite, garde)).toEqual(avant);
  expect(sessions()).toEqual(['empreinte-de-test']);
});

it('purge_sans_rien_a_purger', () => {
  expect(purger(base, T0, vi.fn())).toEqual({ sessions: 0, liens: 0, suppressions: 0 });
});

it('purge_vide_le_wal_qu_une_suppression_n_a_pas_pu_vider', () => {
  // Une suppression pendant la sauvegarde de nuit : son point de contrôle n'aboutit pas, et les
  // octets de la personne restent dans le WAL. La purge suivante, lecteur parti, le vide.
  const zoe = depot.creerPersonne({ nomAffiche: NOM, langue: 'de' });
  const octets = Buffer.from(NOM);
  const wal = `${chemin}-wal`;
  const liberer = retenirLeWal(base);
  try {
    expect(supprimerPersonne(base, zoe.id, T0, vi.fn())).toBe('supprimee');
  } finally {
    liberer();
  }
  expect(fichierContient(wal, octets)).toBe(true);
  const avertir = vi.fn();

  // Rien à purger : le WAL est vidé quand même.
  expect(purger(base, T0, avertir)).toEqual({ sessions: 0, liens: 0, suppressions: 0 });

  expect(fichierContient(wal, octets)).toBe(false);
  expect(fichierContient(chemin, octets)).toBe(false);
  expect(avertir).not.toHaveBeenCalled();
});

it('purge_avertit_sans_identifiant_si_le_point_de_controle_est_incomplet', () => {
  inscrire('personne-secrete-de-test', new Date(T0.getTime() - 200 * JOUR_MS));
  const avertir = vi.fn();
  // Un lecteur (la sauvegarde de nuit) retient le WAL : la purge est faite, pas le point de
  // contrôle.
  const liberer = retenirLeWal(base);
  try {
    expect(purger(base, T0, avertir)).toEqual({ sessions: 0, liens: 0, suppressions: 1 });
  } finally {
    liberer();
  }

  expect(registre()).toEqual([]);
  expect(avertir.mock.calls).toEqual([[POINT_DE_CONTROLE_INCOMPLET]]);
  expect(JSON.stringify(avertir.mock.calls)).not.toContain('secrete');
});

function journalDeTest() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

it('planifier_purge_au_demarrage_puis_toutes_les_6_heures', () => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  expect(INTERVALLE_PURGE_MS).toBe(6 * 60 * 60 * 1000);
  const alice = personneDeTest();
  // Une session qui expire dans une heure, une autre dans sept : la première part à la purge
  // des 6 heures, la seconde à celle des 12 heures.
  depot.creerSession({
    personne: alice.id,
    empreinte: 'expire-dans-1-h',
    appareil: 'Android',
    expireLe: new Date(T0.getTime() + 60 * 60 * 1000).toISOString(),
  });
  depot.creerSession({
    personne: alice.id,
    empreinte: 'expire-dans-7-h',
    appareil: 'Android',
    expireLe: new Date(T0.getTime() + 7 * 60 * 60 * 1000).toISOString(),
  });
  depot.creerSession({
    personne: alice.id,
    empreinte: 'expiree-au-demarrage',
    appareil: 'Android',
    expireLe: new Date(T0.getTime() - 1).toISOString(),
  });
  const journal = journalDeTest();

  const arreter = planifierPurge(base, () => new Date(), journal);

  // Tout de suite, sans attendre la première échéance.
  expect(journal.info).toHaveBeenCalledTimes(1);
  expect(journal.info).toHaveBeenLastCalledWith(
    { sessions: 1, liens: 0, suppressions: 0 },
    'purge',
  );
  expect(sessions()).toEqual(['expire-dans-1-h', 'expire-dans-7-h']);

  vi.advanceTimersByTime(INTERVALLE_PURGE_MS - 1);
  expect(journal.info).toHaveBeenCalledTimes(1);

  vi.advanceTimersByTime(1);
  expect(journal.info).toHaveBeenCalledTimes(2);
  expect(journal.info).toHaveBeenLastCalledWith(
    { sessions: 1, liens: 0, suppressions: 0 },
    'purge',
  );
  expect(sessions()).toEqual(['expire-dans-7-h']);

  vi.advanceTimersByTime(INTERVALLE_PURGE_MS);
  expect(journal.info).toHaveBeenCalledTimes(3);
  expect(journal.info).toHaveBeenLastCalledWith(
    { sessions: 1, liens: 0, suppressions: 0 },
    'purge',
  );
  expect(sessions()).toEqual([]);

  arreter();
  vi.advanceTimersByTime(2 * INTERVALLE_PURGE_MS);
  expect(journal.info).toHaveBeenCalledTimes(3);
  expect(journal.error).not.toHaveBeenCalled();
});

it('planifier_purge_ne_journalise_que_des_nombres', () => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const alice = personneDeTest();
  depot.creerSession({
    personne: alice.id,
    empreinte: 'empreinte-secrete-de-test',
    appareil: 'Android',
    expireLe: new Date(T0.getTime() - 1).toISOString(),
  });
  depot.creerLien({
    empreinte: 'lien-secret-de-test',
    type: 'connexion',
    personne: alice.id,
    expireLe: new Date(T0.getTime() - 1).toISOString(),
  });
  inscrire('personne-secrete-de-test', new Date(T0.getTime() - 200 * JOUR_MS));
  const journal = journalDeTest();

  const arreter = planifierPurge(base, () => new Date(), journal);
  arreter();

  const appels = JSON.stringify([
    ...journal.info.mock.calls,
    ...journal.warn.mock.calls,
    ...journal.error.mock.calls,
  ]);
  expect(appels).toBe('[[{"sessions":1,"liens":1,"suppressions":1},"purge"]]');
  expect(appels).not.toContain('secret');
  expect(appels).not.toContain(alice.id);
});

it('planifier_purge_avertit_si_le_point_de_controle_est_incomplet', () => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  inscrire('personne-secrete-de-test', new Date(T0.getTime() - 200 * JOUR_MS));
  const journal = journalDeTest();

  let arreter: () => void = () => undefined;
  const liberer = retenirLeWal(base);
  try {
    arreter = planifierPurge(base, () => new Date(), journal);
  } finally {
    liberer();
  }
  arreter();

  // La purge est faite et journalisée ; l'avertissement, au niveau `warn`, ne cite personne.
  expect(journal.info.mock.calls).toEqual([[{ sessions: 0, liens: 0, suppressions: 1 }, 'purge']]);
  expect(journal.warn.mock.calls).toEqual([[POINT_DE_CONTROLE_INCOMPLET]]);
  expect(journal.error).not.toHaveBeenCalled();
});

it('planifier_purge_unref_la_minuterie', () => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const unref = vi.fn();
  const vrai = globalThis.setInterval;
  const espion = vi.spyOn(globalThis, 'setInterval').mockImplementation(((
    ...args: Parameters<typeof setInterval>
  ) => {
    const minuterie = vrai(...args);
    minuterie.unref = () => {
      unref();
      return minuterie;
    };
    return minuterie;
  }) as typeof setInterval);

  const arreter = planifierPurge(base, () => new Date(), journalDeTest());
  arreter();

  expect(unref).toHaveBeenCalledTimes(1);
  espion.mockRestore();
});

it('purge_en_echec_journalisee_sans_lever', () => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  const journal = journalDeTest();
  fermerBase(base);

  let arreter: () => void = () => undefined;
  expect(() => {
    arreter = planifierPurge(base, () => new Date(), journal);
  }).not.toThrow();

  expect(journal.info).not.toHaveBeenCalled();
  expect(journal.error).toHaveBeenCalledTimes(1);
  expect(journal.error).toHaveBeenLastCalledWith({ err: expect.any(Error) }, 'purge en échec');

  // Les échéances suivantes échouent de la même façon, sans lever ni arrêter la minuterie.
  expect(() => vi.advanceTimersByTime(INTERVALLE_PURGE_MS)).not.toThrow();
  expect(journal.error).toHaveBeenCalledTimes(2);
  arreter();
});
