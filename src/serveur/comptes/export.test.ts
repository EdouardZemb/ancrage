import { expect, it, vi } from 'vitest';
import type { Evenement } from '../../domaine/journal/evenement.js';
import type { Base } from '../base/base.js';
import { installerEnvironnement } from '../environnement.fixture.js';
import { creerDepotJournal } from '../journal/depot-journal.js';
import {
  APPAREIL_DE_TEST,
  examenDeTest,
  idDeTest,
  insererEvenementBrut,
  reponseDeTest,
  UNITE_DE_TEST,
} from '../journal/evenements.fixture.js';
import { creerDepot, type Depot, type PersonneEnregistree } from './depot.js';
import { exporterPersonne } from './export.js';

/*
 * NE PAS METTRE DE `describe` DANS CE FICHIER : voir le commentaire de `../../domaine/acces.test.ts`
 * (Stryker ne retrouve pas un test placé dans une suite : un mutant de `export.ts` paraîtrait
 * toujours survivre). Chaque nom de test porte seul son contexte.
 */

const COURS_A = 'cm5r8t23';
const COURS_B = 'q3m8vx2k';
const TITRE_A = 'Küchenwörter (Beispielkurs)';
const TITRE_B = 'Anatomie Grundlagen';
const T0 = new Date('2026-10-18T08:00:00.000Z');
const T1 = new Date('2026-10-18T09:30:00.000Z');
const EXPORTE_LE = new Date('2026-10-18T12:00:00.000Z');
const RECU_A = '2026-10-18T08:00:05.000Z';
const EMPREINTE_SESSION = 'empreinte-de-session-export';
const EMPREINTE_LIEN = 'empreinte-de-lien-export';

let base: Base;
let depot: Depot;
installerEnvironnement(
  (environnement) => {
    ({ base, depot } = environnement);
  },
  { debut: T0, nomDeLaBase: 'ancrage.sqlite' },
);

/** Une personne avec un groupe, deux passkeys (dont une servie), une session et un lien. */
function creerLernende(): PersonneEnregistree {
  const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'fr' });
  const groupe = depot.creerGroupe('Klasse Test').id;
  depot.creerGroupe('Klasse Fremd');
  depot.ajouterMembre(groupe, personne.id);
  depot.ajouterPasskey({
    id: 'passkey-export-1',
    personne: personne.id,
    clePublique: new Uint8Array([1, 2, 3]),
    compteur: 0,
    transports: ['internal'],
    appareil: 'Android',
  });
  depot.ajouterPasskey({
    id: 'passkey-export-2',
    personne: personne.id,
    clePublique: new Uint8Array([251, 255, 254, 62]),
    compteur: 0,
    transports: ['usb', 'nfc'],
    appareil: 'Windows',
  });
  depot.creerSession({
    personne: personne.id,
    empreinte: EMPREINTE_SESSION,
    appareil: 'Android',
    expireLe: '2026-11-17T08:00:00.000Z',
  });
  depot.creerLien({
    empreinte: EMPREINTE_LIEN,
    type: 'connexion',
    personne: personne.id,
    expireLe: '2026-10-19T08:00:00.000Z',
  });
  return personne;
}

function exporter(
  personne: string,
  cours: readonly { id: string; titre: string }[],
): NonNullable<ReturnType<typeof exporterPersonne>> {
  const donnees = exporterPersonne(base, depot, personne, cours, EXPORTE_LE);
  if (donnees === undefined) {
    throw new Error("l'export d'une personne qui existe ne doit pas être vide");
  }
  return donnees;
}

it('export_contient_profil_appareils_et_journal', () => {
  const lernende = creerLernende();
  // Une connexion plus tard sert la deuxième passkey : date d'usage et compteur à jour.
  const plusTard = creerDepot(base, () => T1);
  plusTard.majCompteurPasskey('passkey-export-2', 7);
  const journal = creerDepotJournal(base);
  journal.ajouter(lernende.id, [reponseDeTest(COURS_A, 1), examenDeTest(COURS_A, 2)], RECU_A);
  journal.ajouter(lernende.id, [reponseDeTest(COURS_B, 3, false)], RECU_A);

  const donnees = exporter(lernende.id, [
    { id: COURS_A, titre: TITRE_A },
    { id: COURS_B, titre: TITRE_B },
  ]);

  expect(donnees).toEqual({
    format: 'ancrage-export',
    version: 1,
    exporteLe: '2026-10-18T12:00:00.000Z',
    personne: {
      id: lernende.id,
      nomAffiche: 'Lernende Test',
      langue: 'fr',
      proprietaire: false,
      creeLe: '2026-10-18T08:00:00.000Z',
    },
    passkeys: [
      {
        id: 'passkey-export-1',
        appareil: 'Android',
        transports: ['internal'],
        // 0x01 0x02 0x03 en base64url.
        clePublique: 'AQID',
        compteur: 0,
        creeLe: '2026-10-18T08:00:00.000Z',
        utiliseLe: null,
      },
      {
        id: 'passkey-export-2',
        appareil: 'Windows',
        transports: ['usb', 'nfc'],
        // Les octets 0xfb 0xff 0xfe 0x3e donnent `+` et `/` en base64 : en base64url, `-` et `_`.
        clePublique: '-__-Pg',
        compteur: 7,
        creeLe: '2026-10-18T08:00:00.000Z',
        utiliseLe: '2026-10-18T09:30:00.000Z',
      },
    ],
    sessions: [
      {
        id: expect.any(String),
        appareil: 'Android',
        creeLe: '2026-10-18T08:00:00.000Z',
        utiliseLe: '2026-10-18T08:00:00.000Z',
        expireLe: '2026-11-17T08:00:00.000Z',
      },
    ],
    groupes: ['Klasse Test'],
    cours: [
      {
        id: COURS_A,
        titre: TITRE_A,
        evenements: [
          {
            id: idDeTest(1),
            numero: 1,
            unite: UNITE_DE_TEST,
            type: 'reponse',
            resultat: { juste: true },
            reponduA: '2026-10-17T08:15:30.250+02:00',
            appareil: APPAREIL_DE_TEST,
            v: 1,
            recuA: RECU_A,
          },
          {
            id: idDeTest(2),
            numero: 2,
            unite: 'exam0001',
            type: 'examen',
            resultat: { points: 18, questions: 24, note: 4.5, minutes: 12, chapitres: 3 },
            reponduA: '2026-10-17T09:02:11.004+02:00',
            appareil: APPAREIL_DE_TEST,
            v: 1,
            recuA: RECU_A,
          },
        ],
      },
      {
        id: COURS_B,
        titre: TITRE_B,
        evenements: [
          {
            id: idDeTest(3),
            numero: 1,
            unite: UNITE_DE_TEST,
            type: 'reponse',
            resultat: { juste: false },
            reponduA: '2026-10-17T08:15:30.250+02:00',
            appareil: APPAREIL_DE_TEST,
            v: 1,
            recuA: RECU_A,
          },
        ],
      },
    ],
  });
  // Le rang n'est qu'une clé interne : il ne sort jamais du serveur.
  expect(JSON.stringify(donnees)).not.toContain('rang');
});

it('export_rend_le_mode_d_une_reponse', () => {
  const lernende = creerLernende();
  const avecMode = {
    ...reponseDeTest(COURS_A, 1),
    resultat: { juste: true, mode: 'saisie' },
  } as Evenement;
  creerDepotJournal(base).ajouter(lernende.id, [avecMode, reponseDeTest(COURS_A, 2)], RECU_A);

  const [cours] = exporter(lernende.id, [{ id: COURS_A, titre: TITRE_A }]).cours;

  expect(cours.evenements.map((e) => e.resultat)).toEqual([
    { juste: true, mode: 'saisie' },
    { juste: true },
  ]);
});

it('export_trie_les_evenements_par_numero', () => {
  const lernende = creerLernende();
  // Écrits dans l'ordre inverse de leur numéro : le tri ne doit pas suivre l'ordre d'écriture.
  for (const numero of [3, 1, 2]) {
    insererEvenementBrut(base.sqlite, {
      id: idDeTest(numero),
      personne: lernende.id,
      cours: COURS_A,
      numero,
    });
  }

  const [cours] = exporter(lernende.id, [{ id: COURS_A, titre: TITRE_A }]).cours;

  expect(cours?.evenements.map((evenement) => evenement.numero)).toEqual([1, 2, 3]);
});

// Sans l'index `(personne, cours, numero)`, seul l'`orderBy` met les événements en ordre : le
// planificateur lit alors `(personne, id)` ou la table, dans l'ordre d'écriture. Ici les `id`
// décroissent quand le numéro croît, et le cours qui vient en second s'écrit en premier : ni
// l'ordre des `id`, ni celui d'écriture n'est celui du numéro.
it('export_trie_sans_s_appuyer_sur_l_index', () => {
  const lernende = creerLernende();
  base.sqlite.exec('drop index evenement_personne_cours_numero');
  const ecrits = [
    { cours: COURS_B, numero: 3, id: idDeTest(1) },
    { cours: COURS_B, numero: 2, id: idDeTest(2) },
    { cours: COURS_B, numero: 1, id: idDeTest(3) },
    { cours: COURS_A, numero: 3, id: idDeTest(4) },
    { cours: COURS_A, numero: 2, id: idDeTest(5) },
    { cours: COURS_A, numero: 1, id: idDeTest(6) },
  ];
  for (const ecrit of ecrits) {
    insererEvenementBrut(base.sqlite, { ...ecrit, personne: lernende.id });
  }

  const { cours } = exporter(lernende.id, [
    { id: COURS_A, titre: TITRE_A },
    { id: COURS_B, titre: TITRE_B },
  ]);

  expect(cours.map((c) => c.id)).toEqual([COURS_A, COURS_B]);
  expect(
    cours.map((c) => c.evenements.map((evenement) => [evenement.numero, evenement.id])),
  ).toEqual([
    [
      [1, idDeTest(6)],
      [2, idDeTest(5)],
      [3, idDeTest(4)],
    ],
    [
      [1, idDeTest(3)],
      [2, idDeTest(2)],
      [3, idDeTest(1)],
    ],
  ]);
});

it('export_ne_contient_que_les_cours_donnes', () => {
  const lernende = creerLernende();
  const journal = creerDepotJournal(base);
  journal.ajouter(lernende.id, [reponseDeTest(COURS_A, 1)], RECU_A);
  journal.ajouter(lernende.id, [reponseDeTest(COURS_B, 2)], RECU_A);

  const donnees = exporter(lernende.id, [{ id: COURS_B, titre: TITRE_B }]);

  expect(donnees.cours.map((cours) => cours.id)).toEqual([COURS_B]);
  expect(JSON.stringify(donnees)).not.toContain(COURS_A);
  expect(JSON.stringify(donnees)).not.toContain(idDeTest(1));
});

it('export_garde_un_cours_visible_sans_evenement', () => {
  const lernende = creerLernende();

  const donnees = exporter(lernende.id, [{ id: COURS_A, titre: TITRE_A }]);

  expect(donnees.cours).toEqual([{ id: COURS_A, titre: TITRE_A, evenements: [] }]);
});

it('export_sans_aucun_cours_visible', () => {
  const lernende = creerLernende();
  creerDepotJournal(base).ajouter(lernende.id, [reponseDeTest(COURS_A, 1)], RECU_A);

  const donnees = exporter(lernende.id, []);

  expect(donnees.cours).toEqual([]);
  expect(JSON.stringify(donnees)).not.toContain(COURS_A);
});

// Le garde `coursVisibles.length === 0` n'a pas d'effet sur le résultat (Drizzle rend `false` pour
// un `inArray` vide) : seule la lecture elle-même le montre. Sans cours visible, aucun événement
// n'est lu (invariant 1), même ceux d'un cours que la personne ne voit plus.
it('export_sans_cours_visible_ne_lit_aucun_evenement', () => {
  const lernende = creerLernende();
  creerDepotJournal(base).ajouter(lernende.id, [reponseDeTest(COURS_A, 1)], RECU_A);
  const preparer = vi.spyOn(base.sqlite, 'prepare');

  exporter(lernende.id, []);

  const lectures = preparer.mock.calls.filter(([sql]) => /"evenement"/.test(sql));
  expect(lectures).toEqual([]);
  preparer.mockRestore();
});

it('export_ne_contient_que_les_evenements_de_la_personne', () => {
  const lernende = creerLernende();
  const autre = depot.creerPersonne({ nomAffiche: 'Prüfer Test', langue: 'de' });
  const journal = creerDepotJournal(base);
  journal.ajouter(lernende.id, [reponseDeTest(COURS_A, 1)], RECU_A);
  journal.ajouter(autre.id, [reponseDeTest(COURS_A, 2)], RECU_A);

  const donnees = exporter(lernende.id, [{ id: COURS_A, titre: TITRE_A }]);

  expect(donnees.cours[0]?.evenements.map((evenement) => evenement.id)).toEqual([idDeTest(1)]);
  expect(JSON.stringify(donnees)).not.toContain(autre.id);
  expect(JSON.stringify(donnees)).not.toContain('Prüfer Test');
});

it('export_sans_empreinte_ni_lien', () => {
  const lernende = creerLernende();

  const texte = JSON.stringify(exporter(lernende.id, []));

  expect(texte).not.toContain(EMPREINTE_SESSION);
  expect(texte).not.toContain(EMPREINTE_LIEN);
  expect(texte).not.toContain('empreinte');
});

it('export_complet_au_dela_d_une_page', () => {
  const lernende = creerLernende();
  // 1001 événements : un de plus que la page de lecture du journal (1000).
  const total = 1001;
  base.sqlite.transaction(() => {
    for (let numero = 1; numero <= total; numero += 1) {
      insererEvenementBrut(base.sqlite, {
        id: idDeTest(numero),
        personne: lernende.id,
        cours: COURS_A,
        numero,
      });
    }
  })();

  const [cours] = exporter(lernende.id, [{ id: COURS_A, titre: TITRE_A }]).cours;

  expect(cours?.evenements).toHaveLength(total);
  expect(cours?.evenements.map((evenement) => evenement.numero)).toEqual(
    Array.from({ length: total }, (_, i) => i + 1),
  );
  expect(cours?.evenements.at(-1)?.id).toBe(idDeTest(total));
});

it('export_d_une_personne_inconnue_est_vide', () => {
  expect(
    exporterPersonne(base, depot, 'personne-inconnue', [{ id: COURS_A, titre: TITRE_A }], T0),
  ).toBeUndefined();
});
