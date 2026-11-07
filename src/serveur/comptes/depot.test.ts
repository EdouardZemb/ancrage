import { describe, expect, it } from 'vitest';
import type { Autorisation } from '../../domaine/acces.js';
import { espionnerLesTransactions } from '../base/wal.fixture.js';
import type { TypeAppareil } from './appareil.js';
import { installerDepotDeTest, MAINTENANT, nombre, PLUS_TARD } from './depot.fixture.js';
import { type Depot, estViolationUnicite } from './depot.js';

const FORMAT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PLUS_TOT = '2026-10-15T08:00:00.000Z';

const { horloge, creerDepotDeTest } = installerDepotDeTest();

/** Une passkey sans transport, dont la clé publique tient en un octet. */
function passkeyDeTest(
  id: string,
  personne: string,
  octet = 1,
  appareil: TypeAppareil = 'Android',
): Parameters<Depot['ajouterPasskey']>[0] {
  return {
    id,
    personne,
    clePublique: new Uint8Array([octet]),
    compteur: 0,
    transports: [],
    appareil,
  };
}

describe('personnes', () => {
  it('cree_et_lit_une_personne', () => {
    const { depot } = creerDepotDeTest();

    const creee = depot.creerPersonne({
      nomAffiche: 'Lernende Test',
      langue: 'de',
      proprietaire: false,
    });

    expect(creee.id).toMatch(FORMAT_UUID);
    expect(creee).toEqual({
      id: creee.id,
      nomAffiche: 'Lernende Test',
      langue: 'de',
      proprietaire: false,
      creeLe: MAINTENANT,
    });
    expect(depot.personne(creee.id)).toEqual(creee);
    expect(depot.personnes()).toEqual([creee]);
  });

  it('personne_inconnue_absente', () => {
    const { depot } = creerDepotDeTest();

    expect(depot.personne('inconnue')).toBeUndefined();
  });

  it('proprietaire_par_defaut_faux', () => {
    const { depot } = creerDepotDeTest();

    const creee = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'fr' });

    expect(creee.proprietaire).toBe(false);
  });

  it('cree_une_personne_avec_l_identifiant_donne', () => {
    const { depot } = creerDepotDeTest();
    // L'identifiant tiré pour les options d'inscription devient celui de la personne.
    const id = '6f1c2a4e-8d3b-4c5a-9e7f-0a1b2c3d4e5f';

    const creee = depot.creerPersonne({ id, nomAffiche: 'Lernende Test', langue: 'fr' });

    expect(creee.id).toBe(id);
    expect(depot.personne(id)).toEqual(creee);
  });

  it('liste_les_personnes_de_la_plus_ancienne_a_la_plus_recente', () => {
    const { depot } = creerDepotDeTest();
    horloge.maintenant = new Date(PLUS_TARD);
    const recente = depot.creerPersonne({ nomAffiche: 'Anne Test', langue: 'de' });
    horloge.maintenant = new Date(PLUS_TOT);
    const ancienne = depot.creerPersonne({ nomAffiche: 'Zoe Test', langue: 'de' });

    expect(depot.personnes().map((p) => p.id)).toEqual([ancienne.id, recente.id]);
  });

  it('modifie_le_nom_et_la_langue', () => {
    const { depot } = creerDepotDeTest();
    const { id } = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });

    const apresNom = depot.modifierPersonne(id, { nomAffiche: 'Lernende Neu' });
    const apresLangue = depot.modifierPersonne(id, { langue: 'fr' });

    expect(apresNom).toMatchObject({ nomAffiche: 'Lernende Neu', langue: 'de' });
    expect(apresLangue).toMatchObject({ nomAffiche: 'Lernende Neu', langue: 'fr' });
    expect(depot.personne(id)).toEqual(apresLangue);
  });

  it('modification_vide_ne_change_rien_et_inconnue_absente', () => {
    const { depot } = creerDepotDeTest();
    const creee = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });

    expect(depot.modifierPersonne(creee.id, {})).toEqual(creee);
    expect(depot.modifierPersonne('inconnue', { nomAffiche: 'Nom' })).toBeUndefined();
  });

  it('existe_proprietaire', () => {
    const { depot } = creerDepotDeTest();
    expect(depot.existeProprietaire()).toBe(false);

    depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de', proprietaire: false });
    expect(depot.existeProprietaire()).toBe(false);

    depot.creerPersonne({ nomAffiche: 'Prüfer Test', langue: 'fr', proprietaire: true });
    expect(depot.existeProprietaire()).toBe(true);
  });
});

describe('passkeys', () => {
  it('ajoute_et_relit_une_passkey', () => {
    const { depot } = creerDepotDeTest();
    const { id: personne } = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });

    const ajoutee = depot.ajouterPasskey({
      id: 'cle-1',
      personne,
      clePublique: new Uint8Array([1, 2, 3, 255]),
      compteur: 0,
      transports: ['internal', 'hybrid'],
      appareil: 'Android',
    });

    expect(ajoutee).toEqual({
      id: 'cle-1',
      personne,
      clePublique: new Uint8Array([1, 2, 3, 255]),
      compteur: 0,
      transports: ['internal', 'hybrid'],
      appareil: 'Android',
      creeLe: MAINTENANT,
      utiliseLe: null,
    });
    expect(depot.passkey('cle-1')).toEqual(ajoutee);
    expect(depot.passkeysDe(personne)).toEqual([ajoutee]);
    expect(depot.passkey('inconnue')).toBeUndefined();
  });

  it('passkeys_de_ne_rend_que_celles_de_la_personne', () => {
    const { depot } = creerDepotDeTest();
    const a = depot.creerPersonne({ nomAffiche: 'Anne Test', langue: 'de' });
    const b = depot.creerPersonne({ nomAffiche: 'Bert Test', langue: 'de' });
    depot.ajouterPasskey(passkeyDeTest('cle-a', a.id));
    depot.ajouterPasskey(passkeyDeTest('cle-b', b.id, 2, 'iPhone'));

    expect(depot.passkeysDe(a.id).map((p) => p.id)).toEqual(['cle-a']);
    expect(depot.passkeysDe(b.id).map((p) => p.id)).toEqual(['cle-b']);
  });

  it('met_a_jour_le_compteur_et_la_date_d_usage', () => {
    const { depot } = creerDepotDeTest();
    const { id: personne } = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    depot.ajouterPasskey(passkeyDeTest('cle-1', personne));
    horloge.maintenant = new Date(PLUS_TARD);

    depot.majCompteurPasskey('cle-1', 7);

    expect(depot.passkey('cle-1')).toMatchObject({
      compteur: 7,
      creeLe: MAINTENANT,
      utiliseLe: PLUS_TARD,
    });
  });

  it('supprime_une_passkey_seulement_pour_sa_proprietaire', () => {
    const { depot } = creerDepotDeTest();
    const a = depot.creerPersonne({ nomAffiche: 'Anne Test', langue: 'de' });
    const b = depot.creerPersonne({ nomAffiche: 'Bert Test', langue: 'de' });
    depot.ajouterPasskey(passkeyDeTest('cle-a', a.id));

    expect(depot.supprimerPasskey('cle-a', b.id)).toBe(false);
    expect(depot.passkey('cle-a')).toBeDefined();
    expect(depot.supprimerPasskey('cle-a', a.id)).toBe(true);
    expect(depot.passkey('cle-a')).toBeUndefined();
    expect(depot.supprimerPasskey('cle-a', a.id)).toBe(false);
  });

  it('identifiant_de_cle_unique', () => {
    const { depot } = creerDepotDeTest();
    const { id: personne } = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const passkey = passkeyDeTest('cle-1', personne);
    depot.ajouterPasskey(passkey);

    expect(() => depot.ajouterPasskey(passkey)).toThrow(/UNIQUE/);
  });
});

describe('sessions', () => {
  it('cree_et_relit_une_session_par_son_empreinte', () => {
    const { depot } = creerDepotDeTest();
    const { id: personne } = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });

    const creee = depot.creerSession({
      personne,
      empreinte: 'empreinte-1',
      appareil: 'Android',
      expireLe: PLUS_TARD,
    });

    expect(creee.id).toMatch(FORMAT_UUID);
    expect(creee).toEqual({
      id: creee.id,
      empreinte: 'empreinte-1',
      personne,
      appareil: 'Android',
      creeLe: MAINTENANT,
      utiliseLe: MAINTENANT,
      expireLe: PLUS_TARD,
    });
    expect(depot.sessionParEmpreinte('empreinte-1')).toEqual(creee);
    expect(depot.sessionParEmpreinte('autre')).toBeUndefined();
    expect(depot.sessionsDe(personne)).toEqual([creee]);
  });

  it('prolonge_une_session', () => {
    const { depot } = creerDepotDeTest();
    const { id: personne } = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const { id } = depot.creerSession({
      personne,
      empreinte: 'empreinte-1',
      appareil: 'Android',
      expireLe: PLUS_TARD,
    });
    horloge.maintenant = new Date('2026-10-18T08:00:00.000Z');

    depot.prolongerSession(id, '2027-04-16T08:00:00.000Z');

    expect(depot.sessionParEmpreinte('empreinte-1')).toMatchObject({
      creeLe: MAINTENANT,
      utiliseLe: '2026-10-18T08:00:00.000Z',
      expireLe: '2027-04-16T08:00:00.000Z',
    });
  });

  it('empreinte_de_session_unique', () => {
    const { depot } = creerDepotDeTest();
    const { id: personne } = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const session = {
      personne,
      empreinte: 'empreinte-1',
      appareil: 'Android' as const,
      expireLe: PLUS_TARD,
    };
    depot.creerSession(session);

    expect(() => depot.creerSession(session)).toThrow(/UNIQUE/);
  });

  it('supprime_une_session_seulement_pour_sa_personne_quand_elle_est_donnee', () => {
    const { depot } = creerDepotDeTest();
    const a = depot.creerPersonne({ nomAffiche: 'Anne Test', langue: 'de' });
    const b = depot.creerPersonne({ nomAffiche: 'Bert Test', langue: 'de' });
    const sessionA = depot.creerSession({
      personne: a.id,
      empreinte: 'empreinte-a',
      appareil: 'Android',
      expireLe: PLUS_TARD,
    });

    expect(depot.supprimerSession(sessionA.id, b.id)).toBe(false);
    expect(depot.sessionParEmpreinte('empreinte-a')).toBeDefined();
    expect(depot.supprimerSession(sessionA.id, a.id)).toBe(true);
    expect(depot.sessionParEmpreinte('empreinte-a')).toBeUndefined();
  });

  it('supprime_une_session_sans_preciser_la_personne', () => {
    const { depot } = creerDepotDeTest();
    const { id: personne } = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const { id } = depot.creerSession({
      personne,
      empreinte: 'empreinte-1',
      appareil: 'Android',
      expireLe: PLUS_TARD,
    });

    expect(depot.supprimerSession(id)).toBe(true);
    expect(depot.supprimerSession(id)).toBe(false);
  });

  it('supprime_toutes_les_sessions_d_une_personne', () => {
    const { depot } = creerDepotDeTest();
    const a = depot.creerPersonne({ nomAffiche: 'Anne Test', langue: 'de' });
    const b = depot.creerPersonne({ nomAffiche: 'Bert Test', langue: 'de' });
    for (const [personne, empreinte] of [
      [a.id, 'empreinte-a1'],
      [a.id, 'empreinte-a2'],
      [b.id, 'empreinte-b1'],
    ] as const) {
      depot.creerSession({ personne, empreinte, appareil: 'Android', expireLe: PLUS_TARD });
    }

    depot.supprimerSessionsDe(a.id);

    expect(depot.sessionsDe(a.id)).toEqual([]);
    expect(depot.sessionsDe(b.id)).toHaveLength(1);
  });
});

describe('groupes', () => {
  it('cree_et_liste_les_groupes_par_nom', () => {
    const { depot } = creerDepotDeTest();

    const b = depot.creerGroupe('Klasse B');
    const a = depot.creerGroupe('Klasse A');

    expect(a.id).toMatch(FORMAT_UUID);
    expect(a).toEqual({ id: a.id, nom: 'Klasse A', creeLe: MAINTENANT });
    expect(depot.groupes()).toEqual([a, b]);
  });

  it('nom_de_groupe_unique', () => {
    const { depot } = creerDepotDeTest();
    depot.creerGroupe('Klasse A');

    expect(() => depot.creerGroupe('Klasse A')).toThrow(/UNIQUE/);
  });

  it('violation_d_unicite_reconnue_par_son_code', () => {
    const { depot } = creerDepotDeTest();
    depot.creerGroupe('Klasse A');
    let doublon: unknown;
    try {
      depot.creerGroupe('Klasse A');
    } catch (erreur) {
      doublon = erreur;
    }
    let cleEtrangere: unknown;
    try {
      depot.ajouterMembre('groupe-inconnu', 'personne-inconnue');
    } catch (erreur) {
      cleEtrangere = erreur;
    }

    expect(estViolationUnicite(doublon)).toBe(true);
    // Une autre contrainte, ou un message qui ressemble : non.
    expect(estViolationUnicite(cleEtrangere)).toBe(false);
    expect(estViolationUnicite(new Error('UNIQUE constraint failed: groupe.nom'))).toBe(false);
    expect(estViolationUnicite('SQLITE_CONSTRAINT_UNIQUE')).toBe(false);
    expect(estViolationUnicite(undefined)).toBe(false);
  });

  it('ajoute_et_retire_des_membres', () => {
    const { depot } = creerDepotDeTest();
    const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const a = depot.creerGroupe('Klasse A');
    const b = depot.creerGroupe('Klasse B');

    depot.ajouterMembre(a.id, personne.id);
    depot.ajouterMembre(b.id, personne.id);
    // Ajouter deux fois le même membre ne change rien.
    depot.ajouterMembre(a.id, personne.id);

    expect([...depot.groupesDe(personne.id)].sort()).toEqual([a.id, b.id].sort());
    expect(depot.retirerMembre(a.id, personne.id)).toBe(true);
    expect(depot.groupesDe(personne.id)).toEqual([b.id]);
    expect(depot.retirerMembre(a.id, personne.id)).toBe(false);
  });

  it('groupes_de_personne_sans_groupe_est_vide', () => {
    const { depot } = creerDepotDeTest();
    const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });

    expect(depot.groupesDe(personne.id)).toEqual([]);
  });
});

describe('autorisations', () => {
  it('autoriser_ecrit_en_transaction_immediate', () => {
    const { depot, base } = creerDepotDeTest();
    const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const espion = espionnerLesTransactions(base.sqlite);

    depot.autoriser({
      cours: 'terminologie-medicale',
      sujet: { type: 'personne', id: personne.id },
    });

    expect(espion.manieres).toEqual(['immediate']);
  });

  it('autoriser_est_idempotent', () => {
    const { depot, base } = creerDepotDeTest();
    const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const groupe = depot.creerGroupe('Klasse A');
    const pourPersonne = {
      cours: 'terminologie-medicale',
      sujet: { type: 'personne', id: personne.id },
    } as const;
    const pourGroupe = {
      cours: 'terminologie-medicale',
      sujet: { type: 'groupe', id: groupe.id },
    } as const;

    const premierePersonne = depot.autoriser(pourPersonne);
    const secondePersonne = depot.autoriser(pourPersonne);
    const premierGroupe = depot.autoriser(pourGroupe);
    const secondGroupe = depot.autoriser(pourGroupe);

    expect(secondePersonne).toEqual(premierePersonne);
    expect(secondGroupe).toEqual(premierGroupe);
    expect(premierePersonne.id).not.toBe(premierGroupe.id);
    expect(nombre(base, 'autorisation')).toBe(2);
  });

  it('autoriser_un_autre_cours_ou_un_autre_sujet_ajoute_une_ligne', () => {
    const { depot, base } = creerDepotDeTest();
    const a = depot.creerPersonne({ nomAffiche: 'Anne Test', langue: 'de' });
    const b = depot.creerPersonne({ nomAffiche: 'Bert Test', langue: 'de' });

    depot.autoriser({ cours: 'cours-1', sujet: { type: 'personne', id: a.id } });
    depot.autoriser({ cours: 'cours-2', sujet: { type: 'personne', id: a.id } });
    depot.autoriser({ cours: 'cours-1', sujet: { type: 'personne', id: b.id } });

    expect(nombre(base, 'autorisation')).toBe(3);
  });

  it('autorisations_au_format_du_domaine', () => {
    const { depot } = creerDepotDeTest();
    const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const groupe = depot.creerGroupe('Klasse A');
    depot.autoriser({ cours: 'cours-1', sujet: { type: 'personne', id: personne.id } });
    depot.autoriser({ cours: 'cours-2', sujet: { type: 'groupe', id: groupe.id } });

    const autorisations: Autorisation[] = depot.autorisations();

    expect(autorisations).toHaveLength(2);
    expect(autorisations).toContainEqual({
      cours: 'cours-1',
      permission: 'apprendre',
      sujet: { type: 'personne', id: personne.id },
    });
    expect(autorisations).toContainEqual({
      cours: 'cours-2',
      permission: 'apprendre',
      sujet: { type: 'groupe', id: groupe.id },
    });
  });

  it('autorisations_avec_identifiant_porte_l_identifiant_de_retrait', () => {
    const { depot } = creerDepotDeTest();
    const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const creee = depot.autoriser({
      cours: 'cours-1',
      sujet: { type: 'personne', id: personne.id },
    });

    expect(creee).toEqual({
      id: creee.id,
      cours: 'cours-1',
      permission: 'apprendre',
      sujet: { type: 'personne', id: personne.id },
      creeLe: MAINTENANT,
    });
    expect(creee.id).toMatch(FORMAT_UUID);
    expect(depot.autorisationsAvecIdentifiant()).toEqual([creee]);
  });

  it('retire_une_autorisation', () => {
    const { depot } = creerDepotDeTest();
    const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const { id } = depot.autoriser({
      cours: 'cours-1',
      sujet: { type: 'personne', id: personne.id },
    });

    expect(depot.retirerAutorisation(id)).toBe(true);
    expect(depot.autorisations()).toEqual([]);
    expect(depot.retirerAutorisation(id)).toBe(false);
  });

  it('autorisation_personne_ou_groupe_jamais_les_deux', () => {
    const { depot, base } = creerDepotDeTest();
    const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const groupe = depot.creerGroupe('Klasse A');
    const inserer = base.sqlite.prepare(
      "insert into autorisation (id, cours, permission, personne, groupe, cree_le) values (?, 'cours-1', 'apprendre', ?, ?, ?)",
    );

    expect(() => inserer.run('a-1', personne.id, groupe.id, MAINTENANT)).toThrow(/CHECK/);
    expect(() => inserer.run('a-2', null, null, MAINTENANT)).toThrow(/CHECK/);
    expect(() => inserer.run('a-3', personne.id, null, MAINTENANT)).not.toThrow();
  });

  it('autorisation_en_double_refusee_par_la_base', () => {
    const { depot, base } = creerDepotDeTest();
    const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const groupe = depot.creerGroupe('Klasse A');
    const inserer = base.sqlite.prepare(
      "insert into autorisation (id, cours, permission, personne, groupe, cree_le) values (?, 'cours-1', 'apprendre', ?, ?, ?)",
    );
    inserer.run('a-1', personne.id, null, MAINTENANT);
    inserer.run('a-2', null, groupe.id, MAINTENANT);

    // SQLite traite les NULL comme distincts : seuls les index partiels attrapent ces doublons.
    expect(() => inserer.run('a-3', personne.id, null, MAINTENANT)).toThrow(/UNIQUE/);
    expect(() => inserer.run('a-4', null, groupe.id, MAINTENANT)).toThrow(/UNIQUE/);
  });
});

describe('suppressions en cascade', () => {
  it('suppression_en_cascade', () => {
    const { depot, base } = creerDepotDeTest();
    const proprietaire = depot.creerPersonne({
      nomAffiche: 'Prüfer Test',
      langue: 'fr',
      proprietaire: true,
    });
    const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const autre = depot.creerPersonne({ nomAffiche: 'Anne Test', langue: 'de' });
    const groupe = depot.creerGroupe('Klasse A');
    depot.ajouterPasskey(passkeyDeTest('cle-1', personne.id));
    depot.creerSession({
      personne: personne.id,
      empreinte: 'empreinte-1',
      appareil: 'Android',
      expireLe: PLUS_TARD,
    });
    depot.ajouterMembre(groupe.id, personne.id);
    depot.autoriser({ cours: 'cours-1', sujet: { type: 'personne', id: personne.id } });
    depot.creerLien({
      empreinte: 'secours',
      type: 'connexion',
      personne: personne.id,
      expireLe: PLUS_TARD,
    });
    depot.creerLien({
      empreinte: 'invitation',
      type: 'invitation',
      creePar: personne.id,
      expireLe: PLUS_TARD,
    });
    // Ce qui appartient à d'autres personnes ou au groupe reste.
    depot.ajouterMembre(groupe.id, autre.id);
    depot.autoriser({ cours: 'cours-1', sujet: { type: 'groupe', id: groupe.id } });
    depot.creerLien({
      empreinte: 'amorcage',
      type: 'invitation',
      proprietaire: true,
      expireLe: PLUS_TARD,
    });

    base.sqlite.prepare('delete from personne where id = ?').run(personne.id);

    expect(depot.personne(personne.id)).toBeUndefined();
    expect(nombre(base, 'passkey')).toBe(0);
    expect(nombre(base, 'session')).toBe(0);
    expect(nombre(base, 'membre where personne = ?', personne.id)).toBe(0);
    expect(nombre(base, 'autorisation where personne = ?', personne.id)).toBe(0);
    expect(nombre(base, 'lien where empreinte in (?, ?)', 'secours', 'invitation')).toBe(0);
    expect(nombre(base, 'membre where personne = ?', autre.id)).toBe(1);
    expect(nombre(base, 'autorisation where groupe = ?', groupe.id)).toBe(1);
    expect(nombre(base, 'lien where empreinte = ?', 'amorcage')).toBe(1);
    expect(depot.personne(proprietaire.id)).toBeDefined();
    expect(depot.groupes()).toHaveLength(1);
  });

  it('suppression_d_un_groupe_en_cascade', () => {
    const { depot, base } = creerDepotDeTest();
    const personne = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });
    const groupe = depot.creerGroupe('Klasse A');
    depot.ajouterMembre(groupe.id, personne.id);
    depot.autoriser({ cours: 'cours-1', sujet: { type: 'groupe', id: groupe.id } });

    base.sqlite.prepare('delete from groupe where id = ?').run(groupe.id);

    expect(depot.groupesDe(personne.id)).toEqual([]);
    expect(depot.autorisations()).toEqual([]);
    expect(depot.personne(personne.id)).toBeDefined();
  });
});
