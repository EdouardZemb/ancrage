import { describe, expect, it } from 'vitest';
import type { Carte, ModuleCartes } from '../contenu/modele.js';
import { carte } from '../cours/cours.fixture.js';
import { canonique } from './reponses.js';
import { aideDeLUnite, indexerReponses, reponsesAcceptees, unitesDeCartes } from './unites.js';

function moduleDeCartes(id: string, numero: number, cartes: Carte[]): ModuleCartes {
  return {
    type: 'cartes',
    id,
    fichier: `cartes/${String(numero).padStart(2, '0')}-essai.yaml`,
    numero,
    titre: `Module ${numero}`,
    cartes,
  };
}

const triees = (ensemble: ReadonlySet<string>): string[] => [...ensemble].sort();

describe('unites', () => {
  it('identifiants_et_ordre_des_unites', () => {
    const modules = [
      moduleDeCartes('mod00001', 3, [
        carte('aaaaaaa1', 'b', 'Herz', 'Organ im Brustkorb'),
        carte('aaaaaaa2', 'b', 'Leber', 'Grosse Druese'),
      ]),
      moduleDeCartes('mod00002', 5, [carte('bbbbbbb1', 'b', 'Niere', 'Paariges Organ')]),
    ];

    const unites = unitesDeCartes(modules);

    expect(unites.map((u) => u.id)).toEqual([
      'aaaaaaa1',
      'aaaaaaa1:inverse',
      'aaaaaaa2',
      'aaaaaaa2:inverse',
      'bbbbbbb1',
      'bbbbbbb1:inverse',
    ]);
    expect(unites[0]).toEqual({
      id: 'aaaaaaa1',
      carte: 'aaaaaaa1',
      module: 'mod00001',
      numero: 3,
      type: 'b',
      sens: 'direct',
      question: 'Herz',
      reponse: 'Organ im Brustkorb',
    });
    expect(unites[1]).toEqual({
      id: 'aaaaaaa1:inverse',
      carte: 'aaaaaaa1',
      module: 'mod00001',
      numero: 3,
      type: 'b',
      sens: 'inverse',
      question: 'Organ im Brustkorb',
      reponse: 'Herz',
    });
    expect(unites[5]).toMatchObject({ module: 'mod00002', numero: 5, sens: 'inverse' });
  });

  it('l_inverse_porte_les_reponses_de_sa_carte', () => {
    const [directe, inverse] = unitesDeCartes([
      moduleDeCartes('mod00001', 1, [carte('aaaaaaa1', 'p', 'proto-', 'erfunden', ['proto'])]),
    ]);

    expect(directe).not.toHaveProperty('reponses');
    expect(inverse).toMatchObject({ sens: 'inverse', reponses: ['proto'] });
  });

  it('pas_d_inverse_pour_q_g_tiret_ou_question', () => {
    const unites = unitesDeCartes([
      moduleDeCartes('mod00001', 1, [
        carte('aaaaaaa1', 'q', 'Herz', 'Organ im Brustkorb'),
        carte('aaaaaaa2', 'g', 'Leber', 'Grosse Druese'),
        carte('aaaaaaa3', 'b', 'warm – kalt', 'Gegensatzpaar'),
        carte('aaaaaaa4', 'b', 'Was ist die Niere?', 'Paariges Organ'),
        carte('aaaaaaa5', 'b', 'Lunge', 'Atmungsorgan'),
      ]),
    ]);

    expect(unites.map((u) => u.id)).toEqual([
      'aaaaaaa1',
      'aaaaaaa2',
      'aaaaaaa3',
      'aaaaaaa4',
      'aaaaaaa5',
      'aaaaaaa5:inverse',
    ]);
  });

  it('pas_d_inverse_si_la_reponse_fuit', () => {
    const unites = unitesDeCartes([
      moduleDeCartes('mod00001', 1, [
        // Le recto « Herz » figure dans la question inverse « Herzmuskel ».
        carte('aaaaaaa1', 'b', 'Herz', 'Herzmuskel – Organ'),
        // Une alternative de moins de 3 caractères ne compte pas : « an » est dans « Anatomie ».
        carte('aaaaaaa2', 'p', 'an-', 'Anatomie'),
        carte('aaaaaaa3', 'b', 'Lunge', 'Atmungsorgan'),
      ]),
    ]);

    expect(unites.map((u) => u.id)).toEqual([
      'aaaaaaa1',
      'aaaaaaa2',
      'aaaaaaa2:inverse',
      'aaaaaaa3',
      'aaaaaaa3:inverse',
    ]);
  });

  it('question_inverse_tronquee_au_tiret', () => {
    const unites = unitesDeCartes([
      moduleDeCartes('mod00001', 1, [
        carte('aaaaaaa1', 'b', 'Suppe', 'Gericht – z. B. Gulaschsuppe'),
      ]),
    ]);

    expect(unites).toHaveLength(2);
    expect(unites[1]).toMatchObject({ sens: 'inverse', question: 'Gericht', reponse: 'Suppe' });
  });

  it('reponses_explicites_ouvrent_l_inverse', () => {
    const recto = 'Backen (Ofen)';
    const verso = 'Zubereitung von Teig im Ofen';

    const sans = unitesDeCartes([
      moduleDeCartes('mod00001', 1, [carte('aaaaaaa1', 'b', recto, verso)]),
    ]);
    const avec = unitesDeCartes([
      moduleDeCartes('mod00001', 1, [carte('aaaaaaa1', 'b', recto, verso, ['Backen'])]),
    ]);

    expect(sans.map((u) => u.id)).toEqual(['aaaaaaa1']);
    expect(avec.map((u) => u.id)).toEqual(['aaaaaaa1', 'aaaaaaa1:inverse']);
  });

  it('reponses_partagees_entre_modules', () => {
    const unites = unitesDeCartes([
      moduleDeCartes('mod00001', 1, [carte('aaaaaaa1', 'b', 'Ofen', 'Schneebesen')]),
      moduleDeCartes('mod00002', 2, [carte('bbbbbbb1', 'b', 'Herd / CRD', 'Schneebesen')]),
    ]);
    const index = indexerReponses(unites);
    const inverses = unites.filter((u) => u.sens === 'inverse');

    expect(inverses).toHaveLength(2);
    for (const inverse of inverses) {
      const acceptees = reponsesAcceptees(inverse, index);
      expect(acceptees.has('ofen'), inverse.id).toBe(true);
      expect(acceptees.has('herd'), inverse.id).toBe(true);
      expect(acceptees.has('krd'), inverse.id).toBe(true);
    }
  });

  it('l_index_ne_contient_que_les_inverses_et_prend_les_reponses_explicites', () => {
    const unites = unitesDeCartes([
      moduleDeCartes('mod00001', 1, [
        carte('aaaaaaa1', 'p', 'proto-', 'erfunden', ['proto']),
        carte('aaaaaaa2', 'b', 'Lunge', 'Atmungsorgan'),
      ]),
    ]);
    const index = indexerReponses(unites);

    expect([...index.keys()].sort()).toEqual([canonique('Atmungsorgan'), canonique('erfunden')]);
    expect(triees(index.get(canonique('erfunden')) ?? new Set())).toEqual(['proto']);
    expect(triees(index.get(canonique('Atmungsorgan')) ?? new Set())).toEqual(['lunge']);
  });

  it('reponses_acceptees_repli_sans_index', () => {
    const unites = unitesDeCartes([
      moduleDeCartes('mod00001', 1, [
        carte('aaaaaaa1', 'p', 'proto-', 'erfunden', ['proto']),
        carte('aaaaaaa2', 'b', 'Herd / CRD', 'Schneebesen – Schlagbesen'),
      ]),
    ]);
    const vide = indexerReponses([]);
    const [directeProto, inverseProto, directeInsult, inverseInsult] = unites;

    // Une inverse retombe sur les réponses de sa carte, explicites si elles existent.
    expect(triees(reponsesAcceptees(inverseProto, vide))).toEqual(['proto']);
    expect(triees(reponsesAcceptees(inverseInsult, vide))).toEqual(['herd', 'herd / krd', 'krd']);
    // Une directe retombe sur les alternatives du verso, comme le prototype.
    expect(triees(reponsesAcceptees(directeProto, vide))).toEqual(['erfunden']);
    // Le verso n'est pas coupé au tiret : seuls « / » et « , » séparent des alternatives.
    expect(triees(reponsesAcceptees(directeInsult, vide))).toEqual(['skhneebesen – skhlagbesen']);
  });

  it('une_directe_dont_la_question_est_une_cle_de_l_index_prend_l_index', () => {
    // Comme le prototype : la recherche dans l'index ne distingue pas les sens.
    const unites = unitesDeCartes([
      moduleDeCartes('mod00001', 1, [
        carte('aaaaaaa1', 'b', 'Herz', 'Organ im Brustkorb'),
        carte('aaaaaaa2', 'b', 'Organ im Brustkorb', 'Beschreibung'),
      ]),
    ]);
    const index = indexerReponses(unites);
    const directe = unites.find((u) => u.id === 'aaaaaaa2');

    expect(directe).toBeDefined();
    expect(triees(reponsesAcceptees(directe as (typeof unites)[number], index))).toEqual(['herz']);
  });
});

describe('aide_des_unites', () => {
  const avecAide = (id: string, extra: Partial<Carte>): Carte => ({
    ...carte(id, 'b', `Recto ${id}`, `Verso ${id}`),
    ...extra,
  });
  const lesUnites = () =>
    unitesDeCartes([
      moduleDeCartes('mod00001', 1, [
        avecAide('aaaaaaa1', { aide: 'Merke', confonduAvec: 'bbbbbbb1' }),
        avecAide('aaaaaaa2', { aide: 'Nur eine Hilfe' }),
        avecAide('aaaaaaa3', { confonduAvec: 'bbbbbbb1' }),
        avecAide('aaaaaaa4', { confonduAvec: 'inconnu1' }),
        avecAide('aaaaaaa5', {}),
      ]),
      moduleDeCartes('mod00002', 2, [carte('bbbbbbb1', 'b', 'Niere', 'Paariges Organ')]),
    ]);
  const unite = (unites: ReturnType<typeof lesUnites>, id: string) => {
    const trouvee = unites.find((u) => u.id === id);
    if (trouvee === undefined) throw new Error(`unité ${id} absente`);
    return trouvee;
  };

  it('les_deux_sens_portent_l_aide_et_le_confondu_avec_et_pas_sans_eux', () => {
    const unites = lesUnites();

    for (const id of ['aaaaaaa1', 'aaaaaaa1:inverse']) {
      expect(unite(unites, id)).toMatchObject({ aide: 'Merke', confonduAvec: 'bbbbbbb1' });
    }
    for (const id of ['aaaaaaa5', 'aaaaaaa5:inverse', 'bbbbbbb1', 'bbbbbbb1:inverse']) {
      expect(unite(unites, id)).not.toHaveProperty('aide');
      expect(unite(unites, id)).not.toHaveProperty('confonduAvec');
    }
    expect(unite(unites, 'aaaaaaa2')).not.toHaveProperty('confonduAvec');
    expect(unite(unites, 'aaaaaaa3')).not.toHaveProperty('aide');
  });

  it('aide_de_l_unite_seule_confusion_seule_ou_les_deux_depuis_l_un_ou_l_autre_sens', () => {
    const unites = lesUnites();
    const niere = { recto: 'Niere', verso: 'Paariges Organ' };

    expect(aideDeLUnite(unite(unites, 'aaaaaaa2'), unites)).toStrictEqual({
      texte: 'Nur eine Hilfe',
    });
    expect(aideDeLUnite(unite(unites, 'aaaaaaa3'), unites)).toStrictEqual({ confusion: niere });
    expect(aideDeLUnite(unite(unites, 'aaaaaaa1'), unites)).toStrictEqual({
      texte: 'Merke',
      confusion: niere,
    });
    expect(aideDeLUnite(unite(unites, 'aaaaaaa1:inverse'), unites)).toStrictEqual({
      texte: 'Merke',
      confusion: niere,
    });
  });

  it('aide_de_l_unite_sans_rien_a_montrer_ou_lue_sans_rigueur', () => {
    const unites = lesUnites();

    expect(aideDeLUnite(unite(unites, 'aaaaaaa5'), unites)).toBeUndefined();
    // La cible n'est pas dans le cours servi : la confusion ne s'affiche pas.
    expect(aideDeLUnite(unite(unites, 'aaaaaaa4'), unites)).toBeUndefined();
    const illisible = {
      ...unite(unites, 'aaaaaaa1'),
      aide: 42,
      confonduAvec: { id: 'x' },
    } as unknown as ReturnType<typeof lesUnites>[number];
    expect(aideDeLUnite(illisible, unites)).toBeUndefined();
    // Une aide illisible n'empêche pas la confusion lisible.
    const sansAide = { ...unite(unites, 'aaaaaaa1'), aide: 42 } as unknown as ReturnType<
      typeof lesUnites
    >[number];
    expect(aideDeLUnite(sansAide, unites)).toStrictEqual({
      confusion: { recto: 'Niere', verso: 'Paariges Organ' },
    });
  });
});
