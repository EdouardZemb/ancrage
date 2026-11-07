import { describe, expect, it } from 'vitest';
import type { Base } from '../base/base.js';
import { espionnerLesTransactions } from '../base/wal.fixture.js';
import { installerDepotDeTest, MAINTENANT, nombre, PLUS_TARD } from './depot.fixture.js';

// Les liens se testent par `creerDepot`, comme les consommateurs les emploient (1f-D14).

const { horloge, creerDepotDeTest, creerDeuxConnexionsDeTest } = installerDepotDeTest();

describe('liens', () => {
  it('creer_lien_refuse_une_empreinte_vide', () => {
    const { depot, base } = creerDepotDeTest();

    expect(() =>
      depot.creerLien({ empreinte: '', type: 'invitation', expireLe: PLUS_TARD }),
    ).toThrow('empreinte vide');
    expect(nombre(base, 'lien')).toBe(0);
  });

  it('creer_lien_refuse_une_expiration_qui_n_est_pas_iso', () => {
    const { depot, base } = creerDepotDeTest();

    for (const expireLe of ['', 'demain', '2026-10-17', '2026-13-45T08:00:00.000Z']) {
      expect(() => depot.creerLien({ empreinte: 'e-1', type: 'invitation', expireLe })).toThrow(
        "expiration qui n'est pas une date ISO",
      );
    }
    expect(nombre(base, 'lien')).toBe(0);
  });

  it('creer_lien_refuse_une_connexion_sans_personne', () => {
    const { depot, base } = creerDepotDeTest();

    expect(() =>
      depot.creerLien({ empreinte: 'e-1', type: 'connexion', expireLe: PLUS_TARD }),
    ).toThrow('lien de connexion sans personne');
    expect(nombre(base, 'lien')).toBe(0);
  });

  it('creer_lien_refuse_une_invitation_avec_personne', () => {
    const { depot, base } = creerDepotDeTest();
    const { id } = depot.creerPersonne({ nomAffiche: 'Lernende Test', langue: 'de' });

    expect(() =>
      depot.creerLien({ empreinte: 'e-1', type: 'invitation', personne: id, expireLe: PLUS_TARD }),
    ).toThrow('invitation avec une personne');
    expect(nombre(base, 'lien')).toBe(0);
  });

  it('cree_un_lien_avec_ses_valeurs_par_defaut', () => {
    const { depot } = creerDepotDeTest();

    const lien = depot.creerLien({ empreinte: 'e-1', type: 'invitation', expireLe: PLUS_TARD });

    expect(lien).toEqual({
      empreinte: 'e-1',
      type: 'invitation',
      personne: null,
      proprietaire: false,
      octroi: { groupes: [], cours: [] },
      creePar: null,
      creeLe: MAINTENANT,
      expireLe: PLUS_TARD,
      utiliseLe: null,
    });
  });

  it('conserve_l_octroi_et_le_createur', () => {
    const { depot } = creerDepotDeTest();
    const { id: creePar } = depot.creerPersonne({
      nomAffiche: 'Prüfer Test',
      langue: 'fr',
      proprietaire: true,
    });
    const { id: groupe } = depot.creerGroupe('Klasse Test');

    depot.creerLien({
      empreinte: 'e-1',
      type: 'invitation',
      octroi: { groupes: [groupe], cours: ['terminologie-medicale'] },
      creePar,
      expireLe: PLUS_TARD,
    });

    expect(depot.consommerLien('e-1', 'invitation')).toMatchObject({
      octroi: { groupes: [groupe], cours: ['terminologie-medicale'] },
      creePar,
    });
  });

  it('lien_consomme_une_seule_fois', () => {
    const { depot } = creerDepotDeTest();
    depot.creerLien({
      empreinte: 'e-1',
      type: 'invitation',
      proprietaire: true,
      expireLe: PLUS_TARD,
    });

    const premier = depot.consommerLien('e-1', 'invitation');
    const second = depot.consommerLien('e-1', 'invitation');

    expect(premier).toMatchObject({
      empreinte: 'e-1',
      type: 'invitation',
      proprietaire: true,
      utiliseLe: MAINTENANT,
    });
    expect(second).toBeUndefined();
  });

  it('lien_consomme_une_seule_fois_depuis_deux_connexions', () => {
    // better-sqlite3 est synchrone (1f-D15) : les deux appels se suivent, aucune course n'est
    // possible. Ce que le test prouve : la seconde connexion voit l'écriture de la première.
    const { depotA, depotB } = creerDeuxConnexionsDeTest();
    const { id: personne } = depotA.creerPersonne({ nomAffiche: 'Lernende A', langue: 'de' });
    depotA.creerLien({ empreinte: 'e-1', type: 'connexion', personne, expireLe: PLUS_TARD });

    const resultats = [
      depotA.consommerLien('e-1', 'connexion'),
      depotB.consommerLien('e-1', 'connexion'),
    ];

    expect(resultats.filter((lien) => lien !== undefined)).toHaveLength(1);
  });

  it('lien_expire_non_consommable', () => {
    const { depot } = creerDepotDeTest();
    const { id: personne } = depot.creerPersonne({ nomAffiche: 'Lernende A', langue: 'de' });
    depot.creerLien({ empreinte: 'e-1', type: 'connexion', personne, expireLe: PLUS_TARD });
    horloge.maintenant = new Date(PLUS_TARD);

    // À l'instant exact de l'expiration, le lien est déjà périmé.
    expect(depot.consommerLien('e-1', 'connexion')).toBeUndefined();
    horloge.maintenant = new Date('2026-10-18T08:00:00.000Z');
    expect(depot.consommerLien('e-1', 'connexion')).toBeUndefined();
  });

  it('lien_non_consomme_quand_le_type_differe_ou_quand_il_est_inconnu', () => {
    const { depot } = creerDepotDeTest();
    const { id: personne } = depot.creerPersonne({ nomAffiche: 'Lernende A', langue: 'de' });
    depot.creerLien({ empreinte: 'e-1', type: 'connexion', personne, expireLe: PLUS_TARD });

    expect(depot.consommerLien('e-1', 'invitation')).toBeUndefined();
    expect(depot.consommerLien('inconnu', 'connexion')).toBeUndefined();
    // Les refus n'ont pas consommé le lien.
    expect(depot.consommerLien('e-1', 'connexion')).toBeDefined();
  });

  it('lien_utilisable_sans_le_consommer', () => {
    const { depot } = creerDepotDeTest();
    const { id: personne } = depot.creerPersonne({ nomAffiche: 'Lernende A', langue: 'de' });
    const lien = depot.creerLien({ empreinte: 'e-1', type: 'invitation', expireLe: PLUS_TARD });
    depot.creerLien({ empreinte: 'e-2', type: 'connexion', personne, expireLe: PLUS_TARD });

    // Lu deux fois : la lecture ne consomme pas.
    expect(depot.lienUtilisable('e-1', 'invitation')).toEqual(lien);
    expect(depot.lienUtilisable('e-1', 'invitation')).toEqual(lien);
    // Mêmes conditions que la consommation : le bon type, connu, pas encore utilisé, pas expiré.
    expect(depot.lienUtilisable('e-1', 'connexion')).toBeUndefined();
    expect(depot.lienUtilisable('inconnu', 'invitation')).toBeUndefined();
    depot.consommerLien('e-1', 'invitation');
    expect(depot.lienUtilisable('e-1', 'invitation')).toBeUndefined();
    expect(depot.lienUtilisable('e-2', 'connexion')).toBeDefined();
    horloge.maintenant = new Date(PLUS_TARD);
    expect(depot.lienUtilisable('e-2', 'connexion')).toBeUndefined();
  });

  it('annule_les_invitations_du_proprietaire_non_utilisees_seulement', () => {
    const { depot, base } = creerDepotDeTest();
    const { id: personne } = depot.creerPersonne({
      nomAffiche: 'Prüfer Test',
      langue: 'fr',
      proprietaire: true,
    });
    depot.creerLien({
      empreinte: 'proprio-1',
      type: 'invitation',
      proprietaire: true,
      expireLe: PLUS_TARD,
    });
    depot.creerLien({
      empreinte: 'proprio-2',
      type: 'invitation',
      proprietaire: true,
      expireLe: PLUS_TARD,
    });
    depot.creerLien({
      empreinte: 'proprio-utilisee',
      type: 'invitation',
      proprietaire: true,
      expireLe: PLUS_TARD,
    });
    depot.consommerLien('proprio-utilisee', 'invitation');
    depot.creerLien({ empreinte: 'ordinaire', type: 'invitation', expireLe: PLUS_TARD });
    depot.creerLien({ empreinte: 'secours', type: 'connexion', personne, expireLe: PLUS_TARD });

    const annulees = depot.annulerInvitationsProprietaireNonUtilisees();

    expect(annulees).toBe(2);
    const restantes = base.sqlite.prepare('select empreinte from lien order by empreinte').all();
    expect(restantes).toEqual([
      { empreinte: 'ordinaire' },
      { empreinte: 'proprio-utilisee' },
      { empreinte: 'secours' },
    ]);
  });
});

describe('lien de connexion actif', () => {
  /** Deux personnes ; `a` a deux liens non utilisés et un lien utilisé, et une invitation existe (1e-D7). */
  function installer() {
    const { depot, base } = creerDepotDeTest();
    const a = depot.creerPersonne({ nomAffiche: 'Lernende A', langue: 'de' });
    const b = depot.creerPersonne({ nomAffiche: 'Lernende B', langue: 'de' });
    depot.creerLien({ empreinte: 'a-1', type: 'connexion', personne: a.id, expireLe: PLUS_TARD });
    depot.creerLien({ empreinte: 'a-2', type: 'connexion', personne: a.id, expireLe: PLUS_TARD });
    depot.creerLien({
      empreinte: 'a-utilise',
      type: 'connexion',
      personne: a.id,
      expireLe: PLUS_TARD,
    });
    depot.consommerLien('a-utilise', 'connexion');
    depot.creerLien({ empreinte: 'invitation', type: 'invitation', expireLe: PLUS_TARD });
    depot.creerLien({ empreinte: 'b-1', type: 'connexion', personne: b.id, expireLe: PLUS_TARD });
    return { depot, base, a, b };
  }

  function empreintes(base: Base): string[] {
    const lignes = base.sqlite.prepare('select empreinte from lien order by empreinte').all() as {
      empreinte: string;
    }[];
    return lignes.map((ligne) => ligne.empreinte);
  }

  it('remplacer_le_lien_de_connexion_supprime_les_liens_inutilises_de_la_personne', () => {
    const { depot, base, a, b } = installer();

    const lien = depot.remplacerLienDeConnexion({
      empreinte: 'a-3',
      personne: a.id,
      creePar: b.id,
      expireLe: PLUS_TARD,
    });

    expect(lien).toEqual({
      empreinte: 'a-3',
      type: 'connexion',
      personne: a.id,
      proprietaire: false,
      octroi: { groupes: [], cours: [] },
      creePar: b.id,
      creeLe: MAINTENANT,
      expireLe: PLUS_TARD,
      utiliseLe: null,
    });
    // Le lien utilisé, l'invitation et le lien d'une autre personne ne sont pas touchés.
    expect(empreintes(base)).toEqual(['a-3', 'a-utilise', 'b-1', 'invitation']);
  });

  it('remplacer_le_lien_de_connexion_sans_auteur', () => {
    const { depot, a } = installer();

    const lien = depot.remplacerLienDeConnexion({
      empreinte: 'a-3',
      personne: a.id,
      expireLe: PLUS_TARD,
    });

    expect(lien.creePar).toBeNull();
  });

  it('remplacer_le_lien_de_connexion_ecrit_en_transaction_immediate', () => {
    const { depot, base, a } = installer();
    const espion = espionnerLesTransactions(base.sqlite);

    depot.remplacerLienDeConnexion({ empreinte: 'a-3', personne: a.id, expireLe: PLUS_TARD });

    expect(espion.manieres).toEqual(['immediate']);
  });

  it('remplacer_le_lien_de_connexion_est_une_transaction', () => {
    const { depot, base, a } = installer();

    // L'empreinte d'un lien déjà utilisé existe : l'écriture échoue, et les liens actifs restent.
    expect(() =>
      depot.remplacerLienDeConnexion({
        empreinte: 'a-utilise',
        personne: a.id,
        expireLe: PLUS_TARD,
      }),
    ).toThrow();

    expect(empreintes(base)).toEqual(['a-1', 'a-2', 'a-utilise', 'b-1', 'invitation']);
  });

  it('remplacer_le_lien_de_connexion_depuis_deux_connexions', () => {
    // better-sqlite3 est synchrone (1f-D15) : les deux appels se suivent, aucune course n'est
    // possible. Ce que le test prouve : la seconde connexion voit l'écriture de la première.
    const { baseA, depotA, depotB } = creerDeuxConnexionsDeTest();
    const { id } = depotA.creerPersonne({ nomAffiche: 'Lernende A', langue: 'de' });

    depotA.remplacerLienDeConnexion({ empreinte: 'e-1', personne: id, expireLe: PLUS_TARD });
    depotB.remplacerLienDeConnexion({ empreinte: 'e-2', personne: id, expireLe: PLUS_TARD });

    // Deux connexions, une seule personne : un seul lien reste utilisable.
    expect(nombre(baseA, 'lien where personne = ? and utilise_le is null', id)).toBe(1);
  });

  it('annuler_les_liens_de_connexion_de_la_personne', () => {
    const { depot, base, a } = installer();

    expect(depot.annulerLiensDeConnexion(a.id)).toBe(2);

    expect(empreintes(base)).toEqual(['a-utilise', 'b-1', 'invitation']);
    // Idempotent : il n'y a plus rien à annuler.
    expect(depot.annulerLiensDeConnexion(a.id)).toBe(0);
  });

  it('lien_de_connexion_actif_de_la_personne', () => {
    const { depot, a, b } = installer();
    const sansLien = depot.creerPersonne({ nomAffiche: 'Lernende C', langue: 'de' });

    // Exactement la date d'expiration : ni empreinte, ni auteur.
    expect(depot.lienDeConnexionActif(a.id)).toStrictEqual({ expireLe: PLUS_TARD });
    expect(depot.lienDeConnexionActif(b.id)).toStrictEqual({ expireLe: PLUS_TARD });
    expect(depot.lienDeConnexionActif(sansLien.id)).toBeUndefined();
  });

  it('lien_de_connexion_actif_ni_utilise_ni_expire', () => {
    const { depot, a } = installer();
    depot.annulerLiensDeConnexion(a.id);
    // Le lien utilisé (a-utilise) reste en base, mais n'est pas actif.
    expect(depot.lienDeConnexionActif(a.id)).toBeUndefined();

    depot.creerLien({ empreinte: 'a-4', type: 'connexion', personne: a.id, expireLe: PLUS_TARD });
    expect(depot.lienDeConnexionActif(a.id)).toStrictEqual({ expireLe: PLUS_TARD });
    // À l'instant exact de l'expiration, le lien est déjà périmé (comme pour `consommerLien`).
    horloge.maintenant = new Date(PLUS_TARD);
    expect(depot.lienDeConnexionActif(a.id)).toBeUndefined();
  });

  it('lien_de_connexion_actif_le_plus_tardif_quand_il_en_reste_plusieurs', () => {
    const { depot, a } = installer();
    depot.creerLien({
      empreinte: 'a-tard',
      type: 'connexion',
      personne: a.id,
      expireLe: '2026-10-19T08:00:00.000Z',
    });

    expect(depot.lienDeConnexionActif(a.id)).toStrictEqual({
      expireLe: '2026-10-19T08:00:00.000Z',
    });
  });
});
