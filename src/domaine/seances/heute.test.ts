import { expect, it } from 'vitest';
import { coursServiDeTest } from '../cours/cours.fixture.js';
import { preparerCours } from '../cours/prepare.js';
import { hasardDeterministe } from '../hasard.js';
import type { Evenement } from '../journal/evenement.js';
import type { EtatUnite } from '../progression/etat.js';
import {
  apresReponseDuJour,
  bilanDuJour,
  cartesNeuves,
  composerSeance,
  decouvertesLe,
  duesDuJour,
  type Posable,
  posablesDuCours,
  type SeanceDuJour,
  TAILLE_DE_SEANCE,
} from './heute.js';

/* Données factices, écrites à la main (invariant 7). */

const AUJOURDHUI = '2026-10-17';

/*
 * Le cours et ses posables se calculent dans chaque test, jamais à l'import : Stryker doit voir
 * un code muté s'exécuter sous un test.
 */
function leCours() {
  return preparerCours(coursServiDeTest());
}

function lesPosables(): Posable[] {
  return posablesDuCours(leCours());
}

/** Les posables un genre après l'autre, en rondes : une carte, un mot, un point, un exercice… */
function lesEntrelaces(): Posable[] {
  const tous = lesPosables();
  const genres = [...new Set(tous.map((p) => p.genre))];
  const piles = genres.map((g) => tous.filter((p) => p.genre === g));
  const rondes: Posable[] = [];
  for (let i = 0; rondes.length < tous.length; i++) {
    for (const pile of piles) if (i < pile.length) rondes.push(pile[i]);
  }
  return rondes;
}

function etat(echeance: string | null, boite = 1): EtatUnite {
  return { boite, echeance, justes: 1, fausses: 0 };
}

/** Un état dû pour chacun des `n` premiers entrelacés, d'une échéance qui grandit avec leur rang. */
function duesEchelonnees(n: number): Map<string, EtatUnite> {
  const etats = new Map<string, EtatUnite>();
  lesEntrelaces()
    .slice(0, n)
    .forEach((p, rang) => {
      // Le rang 0 est le plus ancien : 2026-09-01, 2026-09-02, …
      etats.set(p.id, etat(`2026-09-${String(rang + 1).padStart(2, '0')}`));
    });
  return etats;
}

/** Les candidates neuves : les cartes du cours (le choix de « Karteikarten »), au plus `quota`. */
function neuves(quota: number): { candidates: Posable[]; quota: number } {
  return { candidates: lesPosables().filter((p) => p.genre === 'carte'), quota };
}

const SANS_NEUVES = { candidates: [], quota: 0 };

function ids(liste: readonly Posable[]): string[] {
  return liste.map((p) => p.id);
}

function seance(file: Posable[], reste: Partial<SeanceDuJour> = {}): SeanceDuJour {
  return { file, revenus: [], faites: 0, justes: 0, ...reste };
}

it('posables_du_cours_liste_chaque_genre_avec_l_id_de_son_unite', () => {
  const parGenre = (genre: Posable['genre']) => lesPosables().filter((p) => p.genre === genre);

  expect(ids(parGenre('carte'))).toEqual(leCours().unites.map((u) => u.id));
  expect(ids(parGenre('mot'))).toEqual(['w0000001', 'w0000002', 'w0000003']);
  expect(ids(parGenre('point'))).toEqual([
    'q0000001',
    'q0000002',
    'q0000003',
    'q0000004',
    'q0000005',
  ]);
  expect(ids(parGenre('exercice'))).toEqual([
    'e1000001',
    'e1000002',
    'e1000003',
    'e2000001',
    'e2000002',
  ]);
  expect(ids(parGenre('fermee'))).toEqual(['fb000007', 'fb000008', 'fb000009']);
});

it('posables_du_cours_garde_l_ordre_cartes_mots_points_exercices_fermees', () => {
  const genres = lesPosables().map((p) => p.genre);

  expect(genres.indexOf('carte')).toBe(0);
  expect(genres.indexOf('mot')).toBeGreaterThan(genres.lastIndexOf('carte'));
  expect(genres.indexOf('point')).toBeGreaterThan(genres.lastIndexOf('mot'));
  expect(genres.indexOf('exercice')).toBeGreaterThan(genres.lastIndexOf('point'));
  expect(genres.indexOf('fermee')).toBeGreaterThan(genres.lastIndexOf('exercice'));
});

it('posables_du_cours_porte_le_rang_du_point_et_la_famille_de_l_exercice', () => {
  const point = lesPosables().find((p) => p.id === 'q0000004');
  const exercice = lesPosables().find((p) => p.id === 'e2000001');

  expect(point).toMatchObject({ genre: 'point', rang: 3 });
  if (point?.genre !== 'point') throw new Error('un point');
  expect(point.schema.id).toBe('sc000001');
  if (exercice?.genre !== 'exercice') throw new Error('un exercice');
  expect(exercice.famille.code).toBe('plural');
  expect(exercice.exercice.id).toBe('e2000001');
});

it('posables_du_cours_porte_le_mot_et_la_question_fermee', () => {
  const mot = lesPosables().find((p) => p.id === 'w0000002');
  const fermee = lesPosables().find((p) => p.id === 'fb000008');

  if (mot?.genre !== 'mot') throw new Error('un mot');
  expect(mot.mot.mot).toBe('Tachykardie');
  if (fermee?.genre !== 'fermee') throw new Error('une question fermée');
  expect(fermee.element.genre).toBe('vrai-faux');
});

it('posables_du_cours_ecarte_un_mot_sans_segment_et_les_genres_qui_ne_se_posent_pas_seuls', () => {
  const { morphologie } = leCours();
  if (morphologie === undefined) throw new Error('la fixture a un mot');
  const sansSegment = {
    ...leCours(),
    morphologie: {
      ...morphologie,
      mots: morphologie.mots.map((m, i) => (i === 0 ? { ...m, segments: [] } : m)),
    },
  };

  const presents = ids(posablesDuCours(sansSegment));

  expect(presents).not.toContain('w0000001');
  expect(presents).toContain('w0000002');
  // Appariement, classement, trous et orthographe n'y sont pas.
  expect(presents).not.toContain('fb000001');
  expect(presents).not.toContain('fb000004');
  expect(presents).not.toContain('fb000010');
});

it('posables_du_cours_sans_aucun_module_qui_se_pose_est_vide', () => {
  const vide = preparerCours({ ...coursServiDeTest(), modules: [] });

  expect(posablesDuCours(vide)).toEqual([]);
});

it('dues_du_jour_ignore_un_etat_d_une_unite_que_le_cours_ne_connait_plus', () => {
  const etats = new Map<string, EtatUnite>([['zz000000', etat('2026-09-01')]]);

  expect(duesDuJour(lesPosables(), etats, AUJOURDHUI)).toEqual([]);
});

it('dues_du_jour_une_unite_neuve_n_est_pas_due', () => {
  expect(duesDuJour(lesPosables(), new Map(), AUJOURDHUI)).toEqual([]);
  expect(duesDuJour(lesPosables(), new Map([['w0000001', etat(null, 0)]]), AUJOURDHUI)).toEqual([]);
});

it('dues_du_jour_echeance_aujourd_hui_oui_demain_non', () => {
  const etats = new Map<string, EtatUnite>([
    ['w0000001', etat(AUJOURDHUI)],
    ['w0000002', etat('2026-10-18')],
    ['q0000001', etat('2026-10-01')],
  ]);

  expect(ids(duesDuJour(lesPosables(), etats, AUJOURDHUI))).toEqual(['w0000001', 'q0000001']);
});

it('compose_seance_garde_les_vingt_echeances_les_plus_anciennes', () => {
  const etats = duesEchelonnees(30);

  const { file } = composerSeance(
    lesPosables(),
    etats,
    AUJOURDHUI,
    SANS_NEUVES,
    hasardDeterministe(3),
  );

  expect(TAILLE_DE_SEANCE).toBe(20);
  expect(file).toHaveLength(20);
  expect(ids(file).sort()).toEqual(ids(lesEntrelaces().slice(0, 20)).sort());
  // La file mêle les types.
  expect(new Set(file.map((p) => p.genre)).size).toBeGreaterThan(1);
});

it('compose_seance_prend_les_plus_anciennes_meme_en_fin_de_liste', () => {
  const etats = new Map<string, EtatUnite>();
  const fin = lesPosables().slice(-25);
  // Le dernier posable a l'échéance la plus ancienne.
  fin.forEach((p, rang) => {
    etats.set(p.id, etat(`2026-09-${String(25 - rang).padStart(2, '0')}`));
  });

  const { file } = composerSeance(
    lesPosables(),
    etats,
    AUJOURDHUI,
    SANS_NEUVES,
    hasardDeterministe(1),
  );

  expect(ids(file).sort()).toEqual(ids(fin.slice(5)).sort());
});

it('compose_seance_compare_les_echeances_comme_des_chaines_de_date', () => {
  const etats = new Map<string, EtatUnite>();
  for (const p of lesPosables().slice(0, 22)) etats.set(p.id, etat('2026-10-10'));
  etats.set('q0000001', etat('2026-10-02'));
  etats.set('q0000002', etat('2026-09-30'));

  const { file } = composerSeance(
    lesPosables(),
    etats,
    AUJOURDHUI,
    SANS_NEUVES,
    hasardDeterministe(2),
  );

  // 22 dues pour 20 places : les deux échéances les plus anciennes restent.
  expect(file).toHaveLength(20);
  expect(ids(file)).toContain('q0000001');
  expect(ids(file)).toContain('q0000002');
});

it('compose_seance_a_echeance_egale_la_meme_graine_donne_la_meme_file', () => {
  const etats = new Map<string, EtatUnite>();
  for (const p of lesPosables().slice(0, 30)) etats.set(p.id, etat('2026-10-01'));

  const a = composerSeance(lesPosables(), etats, AUJOURDHUI, SANS_NEUVES, hasardDeterministe(5));
  const b = composerSeance(lesPosables(), etats, AUJOURDHUI, SANS_NEUVES, hasardDeterministe(5));

  expect(ids(a.file)).toEqual(ids(b.file));
});

it('compose_seance_a_echeance_egale_des_graines_differentes_departagent_differemment', () => {
  const etats = new Map<string, EtatUnite>();
  for (const p of lesPosables().slice(0, 30)) etats.set(p.id, etat('2026-10-01'));

  const selections = new Set<string>();
  for (let graine = 1; graine <= 10; graine++) {
    const { file } = composerSeance(
      lesPosables(),
      etats,
      AUJOURDHUI,
      SANS_NEUVES,
      hasardDeterministe(graine),
    );
    selections.add(ids(file).sort().join(','));
  }

  expect(selections.size).toBeGreaterThan(1);
});

it('compose_seance_les_dues_d_abord_puis_les_cartes_neuves', () => {
  const etats = duesEchelonnees(5);
  const dues = new Set(ids(lesEntrelaces().slice(0, 5)));

  const { file } = composerSeance(
    lesPosables(),
    etats,
    AUJOURDHUI,
    neuves(3),
    hasardDeterministe(4),
  );

  expect(file).toHaveLength(8);
  expect(file.slice(0, 5).every((p) => dues.has(p.id))).toBe(true);
  expect(file.slice(5).every((p) => p.genre === 'carte' && !dues.has(p.id))).toBe(true);
});

it('compose_seance_complete_les_vingt_par_les_cartes_neuves_qui_restent_de_place', () => {
  // Les 19 premiers entrelacés sont dus ; il reste une place sur 20.
  const dix9 = composerSeance(
    lesPosables(),
    duesEchelonnees(19),
    AUJOURDHUI,
    neuves(3),
    hasardDeterministe(1),
  );
  const vingt = composerSeance(
    lesPosables(),
    duesEchelonnees(20),
    AUJOURDHUI,
    neuves(3),
    hasardDeterministe(1),
  );

  expect(dix9.file).toHaveLength(20);
  expect(vingt.file).toHaveLength(20);
  // Avec 20 dues, aucune carte neuve : tout est dû.
  const dues = duesEchelonnees(20);
  expect(vingt.file.every((p) => dues.has(p.id))).toBe(true);
});

it('compose_seance_ne_prend_pas_plus_de_nouvelles_que_demande', () => {
  const { file } = composerSeance(
    lesPosables(),
    new Map(),
    AUJOURDHUI,
    neuves(4),
    hasardDeterministe(1),
  );

  expect(file).toHaveLength(4);
  expect(file.every((p) => p.genre === 'carte')).toBe(true);
});

it('compose_seance_sans_rien_de_du_ni_de_neuf_rend_une_file_vide', () => {
  const vide = composerSeance(
    [],
    new Map(),
    AUJOURDHUI,
    { candidates: [], quota: 5 },
    hasardDeterministe(1),
  );

  expect(vide).toEqual({ file: [], revenus: [], faites: 0, justes: 0 });
});

it('compose_seance_les_nouveautes_ne_sont_que_des_cartes', () => {
  const sansCarte = lesPosables().filter((p) => p.genre !== 'carte');

  const { file } = composerSeance(
    sansCarte,
    new Map(),
    AUJOURDHUI,
    { candidates: sansCarte, quota: 10 },
    hasardDeterministe(1),
  );

  expect(file).toEqual([]);
});

it('compose_seance_ne_prend_pas_pour_neuve_une_carte_deja_repondue', () => {
  const etats = new Map<string, EtatUnite>();
  const cartes = lesPosables().filter((p) => p.genre === 'carte');
  // Toutes sauf la première sont répondues, mais pas dues.
  for (const p of cartes.slice(1)) etats.set(p.id, etat('2026-12-01'));

  const { file } = composerSeance(
    lesPosables(),
    etats,
    AUJOURDHUI,
    neuves(10),
    hasardDeterministe(1),
  );

  expect(ids(file)).toEqual([cartes[0].id]);
});

it('compose_seance_ne_change_pas_les_entrees', () => {
  const etats = duesEchelonnees(25);
  const avant = ids(lesPosables());

  composerSeance(lesPosables(), etats, AUJOURDHUI, neuves(3), hasardDeterministe(1));

  expect(ids(lesPosables())).toEqual(avant);
  expect(etats.size).toBe(25);
});

it('apres_reponse_du_jour_juste_retire_la_tete', () => {
  const [a, b, c] = lesPosables();

  const suite = apresReponseDuJour(seance([a, b, c]), true);

  expect(suite).toEqual({ file: [b, c], revenus: [], faites: 1, justes: 1 });
});

it('apres_reponse_du_jour_fausse_remet_la_tete_en_fin_et_la_note', () => {
  const [a, b, c] = lesPosables();

  const suite = apresReponseDuJour(seance([a, b, c]), false);

  expect(suite).toEqual({ file: [b, c, a], revenus: [a.id], faites: 1, justes: 0 });
});

it('apres_reponse_du_jour_une_seconde_faute_sur_le_meme_element_le_retire', () => {
  const [a, b] = lesPosables();

  const suite = apresReponseDuJour(
    seance([a, b], { revenus: [a.id], faites: 2, justes: 1 }),
    false,
  );

  expect(suite).toEqual({ file: [b], revenus: [a.id], faites: 3, justes: 1 });
});

it('apres_reponse_du_jour_juste_apres_un_retour_retire_aussi_la_tete', () => {
  const [a, b] = lesPosables();

  const suite = apresReponseDuJour(seance([a, b], { revenus: [a.id], faites: 1 }), true);

  expect(suite).toEqual({ file: [b], revenus: [a.id], faites: 2, justes: 1 });
});

it('apres_reponse_du_jour_une_faute_sur_un_autre_element_revient_aussi_une_fois', () => {
  const [a, b] = lesPosables();

  const suite = apresReponseDuJour(seance([b, a], { revenus: [a.id] }), false);

  expect(suite.file).toEqual([a, b]);
  expect(suite.revenus).toEqual([a.id, b.id]);
});

it('apres_reponse_du_jour_une_file_vide_ne_change_pas', () => {
  const vide = seance([], { faites: 4, justes: 2 });

  expect(apresReponseDuJour(vide, true)).toEqual(vide);
  expect(apresReponseDuJour(vide, false)).toEqual(vide);
});

it('apres_reponse_du_jour_ne_change_pas_la_seance_d_entree', () => {
  const [a, b] = lesPosables();
  const avant = seance([a, b]);

  apresReponseDuJour(avant, false);

  expect(avant).toEqual({ file: [a, b], revenus: [], faites: 0, justes: 0 });
});

it('bilan_du_jour_compte_les_elements_et_non_les_reponses', () => {
  const [a] = lesPosables();

  // Un élément manqué puis réussi au retour : deux réponses, un élément, un juste.
  const bilan = bilanDuJour(seance([], { revenus: [a.id], faites: 2, justes: 1 }));

  expect(bilan).toEqual({ elements: 1, justes: 1 });
});

it('bilan_du_jour_un_element_manque_deux_fois_compte_une_fois_et_aucun_juste', () => {
  const [a] = lesPosables();

  const bilan = bilanDuJour(seance([], { revenus: [a.id], faites: 3, justes: 1 }));

  expect(bilan).toEqual({ elements: 2, justes: 1 });
});

it('bilan_du_jour_sans_retour_les_elements_sont_les_reponses', () => {
  expect(bilanDuJour(seance([], { faites: 5, justes: 4 }))).toEqual({ elements: 5, justes: 4 });
});

it('cartes_neuves_ne_garde_que_les_cartes_de_la_boite_zero', () => {
  const tous = lesPosables();
  const cartes = tous.filter((p) => p.genre === 'carte');
  const [vue, ...autres] = cartes;
  const etats = new Map<string, EtatUnite>([[vue.id, etat('2026-10-30', 2)]]);

  const neuves = cartesNeuves(tous, etats);

  expect(neuves.map(({ id }) => id)).toEqual(autres.map(({ id }) => id));
  expect(neuves.every((p) => p.genre === 'carte')).toBe(true);
});

/* Le plafond par jour (M2-P9) : les cartes découvertes un jour, d'après le journal. */

const HERZ = 'c1000001';
const LEBER = 'c1000002';
const LES_DEUX = new Set([HERZ, LEBER]);
const APPAREIL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function reponse(n: number, unite: string, reponduA: string, juste = true): Evenement {
  return {
    id: `01929f3a-5b3c-7000-8000-${String(n).padStart(12, '0')}`,
    cours: 'cs000001',
    unite,
    type: 'reponse',
    resultat: { juste },
    repondu_a: reponduA,
    appareil: APPAREIL,
    v: 1,
  };
}

function examen(n: number, unite: string, reponduA: string): Evenement {
  return {
    id: `01929f3a-5b3c-7000-8000-${String(n).padStart(12, '0')}`,
    cours: 'cs000001',
    unite,
    type: 'examen',
    resultat: { points: 1, questions: 2, note: 3, minutes: 4, chapitres: 1 },
    repondu_a: reponduA,
    appareil: APPAREIL,
    v: 1,
  };
}

const AUJOURDHUI_A_10H = `${AUJOURDHUI}T10:00:00.000+02:00`;
const HIER_A_10H = '2026-10-16T10:00:00.000+02:00';

it('decouvertes_le_compte_les_cartes_dont_la_premiere_reponse_est_de_ce_jour', () => {
  const journal = [
    reponse(1, HERZ, AUJOURDHUI_A_10H, false),
    reponse(2, LEBER, AUJOURDHUI_A_10H),
    reponse(3, LEBER, AUJOURDHUI_A_10H),
  ];

  expect(decouvertesLe(journal, AUJOURDHUI, LES_DEUX)).toBe(2);
  expect(decouvertesLe(journal, AUJOURDHUI, new Set([HERZ]))).toBe(1);
  expect(decouvertesLe(journal, '2026-10-16', LES_DEUX)).toBe(0);
  expect(decouvertesLe([], AUJOURDHUI, LES_DEUX)).toBe(0);
  expect(decouvertesLe(journal, AUJOURDHUI, new Set())).toBe(0);
});

it('decouvertes_le_ne_compte_ni_un_mot_ni_un_exercice_ni_une_carte_hors_du_choix', () => {
  const journal = [
    reponse(1, 'w0000001', AUJOURDHUI_A_10H),
    reponse(2, 'e1000001', AUJOURDHUI_A_10H),
    reponse(3, 'c1000003', AUJOURDHUI_A_10H),
    reponse(4, HERZ, AUJOURDHUI_A_10H),
  ];

  expect(decouvertesLe(journal, AUJOURDHUI, LES_DEUX)).toBe(1);
});

it('decouvertes_le_une_carte_deja_repondue_un_jour_d_avant_n_est_pas_decouverte', () => {
  const journal = [reponse(1, HERZ, HIER_A_10H), reponse(2, HERZ, AUJOURDHUI_A_10H)];

  expect(decouvertesLe(journal, AUJOURDHUI, LES_DEUX)).toBe(0);
  expect(decouvertesLe(journal, '2026-10-16', LES_DEUX)).toBe(1);
});

it('decouvertes_le_la_premiere_reponse_est_la_plus_ancienne_pas_la_premiere_arrivee', () => {
  // Le journal arrive dans le désordre : la réponse d'aujourd'hui avant celle d'hier.
  const journal = [reponse(1, HERZ, AUJOURDHUI_A_10H), reponse(2, HERZ, HIER_A_10H)];

  expect(decouvertesLe(journal, AUJOURDHUI, LES_DEUX)).toBe(0);
  expect(decouvertesLe(journal, '2026-10-16', LES_DEUX)).toBe(1);
});

it('decouvertes_le_prend_le_jour_local_de_la_reponse', () => {
  // 00 h 30 locale (+02:00) : le 17 en local, mais encore le 16 en UTC.
  const journal = [reponse(1, HERZ, `${AUJOURDHUI}T00:30:00.000+02:00`)];

  expect(decouvertesLe(journal, AUJOURDHUI, LES_DEUX)).toBe(1);
  expect(decouvertesLe(journal, '2026-10-16', LES_DEUX)).toBe(0);
});

it('decouvertes_le_un_evenement_d_examen_ne_compte_pas_mais_ses_reponses_oui', () => {
  const seulExamen = [examen(1, HERZ, AUJOURDHUI_A_10H)];
  const avecReponse = [...seulExamen, reponse(2, LEBER, AUJOURDHUI_A_10H)];

  expect(decouvertesLe(seulExamen, AUJOURDHUI, LES_DEUX)).toBe(0);
  expect(decouvertesLe(avecReponse, AUJOURDHUI, LES_DEUX)).toBe(1);
});

it('decouvertes_le_un_evenement_recu_deux_fois_compte_une_fois', () => {
  const journal = [reponse(1, HERZ, AUJOURDHUI_A_10H), reponse(1, HERZ, AUJOURDHUI_A_10H)];

  expect(decouvertesLe(journal, AUJOURDHUI, LES_DEUX)).toBe(1);
});

it('compose_seance_un_quota_nul_ne_pose_aucune_neuve', () => {
  const { file } = composerSeance(
    lesPosables(),
    duesEchelonnees(2),
    AUJOURDHUI,
    { ...neuves(0) },
    hasardDeterministe(1),
  );

  expect(file).toHaveLength(2);
});

it('compose_seance_ne_tire_ses_neuves_que_parmi_les_candidates', () => {
  const cartes = lesPosables().filter((p) => p.genre === 'carte');
  const choix = cartes.slice(0, 3);

  const { file } = composerSeance(
    lesPosables(),
    new Map(),
    AUJOURDHUI,
    { candidates: choix, quota: 10 },
    hasardDeterministe(1),
  );

  expect(ids(file).sort()).toEqual(ids(choix).sort());
});

it('compose_seance_borne_le_quota_par_la_place_que_laissent_les_dues', () => {
  const { file } = composerSeance(
    lesPosables(),
    duesEchelonnees(18),
    AUJOURDHUI,
    neuves(10),
    hasardDeterministe(1),
  );

  expect(file).toHaveLength(TAILLE_DE_SEANCE);
});
