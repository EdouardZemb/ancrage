import { FSRS6_DEFAULT_WEIGHTS } from 'ts-fsrs/models/fsrs-6';
import { describe, expect, it } from 'vitest';
import { analyserContenus } from '../contenu/analyse.js';
import { exempleDeCours, modifier } from '../contenu/exemple.fixture.js';
import { coursSans, coursServiDeTest, coursServiParLaV030 } from './cours.fixture.js';
import type { CoursServi } from './servi.js';
import { coursServiUtilisable, memoireDuCours, versCoursServi } from './servi.js';

/** Le cours de test, dont un module est remplacé par ce que rend `changer`. */
function avecModule(
  type: string,
  changer: (module: Record<string, unknown>) => unknown,
): Record<string, unknown> {
  const cours = coursServiDeTest();
  return {
    ...cours,
    modules: cours.modules.map((module) =>
      module.type === type ? changer({ ...module } as Record<string, unknown>) : module,
    ),
  };
}

/** Le cours de test, dont la feuille gagne une partie faite de cette seule tâche. */
function avecTache(tache: Record<string, unknown>): Record<string, unknown> {
  return avecModule('feuille', (feuille) => ({
    ...feuille,
    parties: [...(feuille.parties as unknown[]), { titre: 'Teil E', taches: [tache] }],
  }));
}

describe('coursServiUtilisable', () => {
  it('cours_servi_de_test_utilisable', () => {
    expect(coursServiUtilisable(coursServiDeTest())).toBe(true);
    // Passé par JSON, comme sur le réseau et dans IndexedDB.
    expect(coursServiUtilisable(JSON.parse(JSON.stringify(coursServiDeTest())))).toBe(true);
  });

  it('contenu_de_la_v0_3_0_refuse', () => {
    expect(coursServiUtilisable(coursServiParLaV030())).toBe(false);
  });

  it('leitner_absent_ou_mal_forme_refuse', () => {
    const cours = coursServiDeTest();
    const { leitner: _leitner, ...sansLeitner } = cours;
    expect(coursServiUtilisable(sansLeitner)).toBe(false);
    for (const leitner of [
      null,
      { intervalles: [0, 1, 2, 4, 8], nouvellesParSeance: 15 },
      { intervalles: [0, 1, 2, 4, 8, 16, 32], nouvellesParSeance: 15 },
      { intervalles: [0, 1, 2, 4, 8, 16.5], nouvellesParSeance: 15 },
      { intervalles: [0, 1, 2, 4, 8, '16'], nouvellesParSeance: 15 },
      { intervalles: [0, 1, 2, 4, 8, 16] },
      { intervalles: [0, 1, 2, 4, 8, 16], nouvellesParSeance: 1.5 },
      { nouvellesParSeance: 15 },
    ]) {
      expect(coursServiUtilisable({ ...cours, leitner }), JSON.stringify(leitner)).toBe(false);
    }
  });

  it('memoire_absente_ou_valide_utilisable', () => {
    const cours = coursServiDeTest();
    expect(coursServiUtilisable(cours)).toBe(true);
    expect(memoireDuCours(cours)).toBeUndefined();
    const avecMemoire = { ...cours, memoire: { algorithme: 'fsrs', retention: 0.9 } };
    expect(coursServiUtilisable(JSON.parse(JSON.stringify(avecMemoire)))).toBe(true);
    expect(memoireDuCours(avecMemoire as typeof cours)).toEqual({
      algorithme: 'fsrs',
      retention: 0.9,
    });
  });

  // Une version suivante peut servir un réglage que ce client ne connaît pas : le cours reste
  // utilisable, et le réglage est ignoré.
  it('memoire_inconnue_ou_hors_bornes_ignoree_sans_refuser_le_cours', () => {
    for (const memoire of [
      { algorithme: 'sm2', retention: 0.9 },
      { algorithme: 'fsrs', retention: 0.79 },
      { algorithme: 'fsrs', retention: 0.96 },
      { algorithme: 'fsrs' },
      'fsrs',
      null,
    ]) {
      const cours = { ...coursServiDeTest(), memoire } as unknown as CoursServi;
      expect(coursServiUtilisable(cours), JSON.stringify(memoire)).toBe(true);
      expect(memoireDuCours(cours), JSON.stringify(memoire)).toBeUndefined();
    }
  });

  it('reussite_d_un_texte_annote_absente_ou_non_numerique_refusee', () => {
    expect(
      coursServiUtilisable(
        avecModule('texte-annote', ({ reussite: _reussite, ...module }) => module),
      ),
    ).toBe(false);
    expect(
      coursServiUtilisable(
        avecModule('texte-annote', (module) => ({ ...module, reussite: '0.8' })),
      ),
    ).toBe(false);
  });

  it('champ_dont_le_rendu_depend_absent_refuse', () => {
    const cours = coursServiDeTest();
    const { titre: _titre, ...sansTitre } = cours;
    expect(coursServiUtilisable(sansTitre)).toBe(false);
    const { typesDeCarte: _types, ...sansTypes } = cours;
    expect(coursServiUtilisable(sansTypes)).toBe(false);
    expect(coursServiUtilisable({ ...cours, modules: undefined })).toBe(false);
    for (const [type, champ] of [
      ['cartes', 'cartes'],
      ['morphologie', 'mots'],
      ['schema', 'points'],
      ['texte-annote', 'textes'],
      ['exercices', 'familles'],
      ['feuille', 'parties'],
      ['examen', 'tirage'],
    ] as const) {
      const sansChamp = avecModule(type, (module) => ({ ...module, [champ]: undefined }));
      expect(coursServiUtilisable(sansChamp), `${type}.${champ}`).toBe(false);
    }
  });

  it('module_d_un_type_inconnu_ignore', () => {
    // Un type ajouté par une version suivante du serveur : le client ne le montre pas
    // (`preparerCours`), et le reste du cours s'affiche.
    const cours = coursServiDeTest();
    expect(
      coursServiUtilisable({ ...cours, modules: [...cours.modules, { type: 'audio', id: 'a1' }] }),
    ).toBe(true);
    // Un champ de plus, servi par une version suivante, ne gêne pas non plus.
    expect(coursServiUtilisable({ ...cours, auteur: 'Prüfer Test' })).toBe(true);
  });

  it('contenu_en_cache_sans_feuille_reste_utilisable', () => {
    // Vigilance 1 : le contenu servi par la v0.5.x, rangé dans IndexedDB, n'a pas de module
    // `feuille`.
    const cours = coursSans('feuille');

    expect(cours.modules.map((module) => module.type)).not.toContain('feuille');
    expect(coursServiUtilisable(JSON.parse(JSON.stringify(cours)))).toBe(true);
  });

  it('contenu_en_cache_sans_tirage_feuille_reste_utilisable', () => {
    // Vigilance 1 et F1-D6 : la version précédente servait le tirage sans `feuille`. Présent, il
    // est un nombre.
    const avecTirage = (changer: (tirage: Record<string, unknown>) => unknown) =>
      avecModule('examen', (examen) => ({
        ...examen,
        tirage: changer({ ...(examen.tirage as Record<string, unknown>) }),
      }));

    expect(coursServiUtilisable(avecTirage(({ feuille: _feuille, ...tirage }) => tirage))).toBe(
      true,
    );
    expect(coursServiUtilisable(avecTirage((tirage) => ({ ...tirage, feuille: '0.35' })))).toBe(
      false,
    );
  });

  it('feuille_d_un_genre_inconnu_reste_utilisable', () => {
    // F1-D11 : une tâche d'un genre ajouté par une version suivante passe ; la vue l'ignorera.
    const futur = { id: 'fa000009', genre: 'futur', consigne: 'Neu.' };

    expect(coursServiUtilisable(avecTache(futur))).toBe(true);
    // Avec ses champs propres, inconnus de ce client.
    expect(coursServiUtilisable(avecTache({ ...futur, karten: [{ id: 'fb000099' }] }))).toBe(true);
  });

  it('feuille_malformee_refusee', () => {
    // Une tâche d'un genre connu a la forme de son genre.
    const qcm = { id: 'fa000009', genre: 'qcm', consigne: 'Wählen Sie.' };
    expect(coursServiUtilisable(avecTache(qcm))).toBe(false);
    expect(
      coursServiUtilisable(
        avecTache({
          ...qcm,
          questions: [{ id: 'fb000099', question: 'Was?', reponse: 'Das', distracteurs: 'X' }],
        }),
      ),
    ).toBe(false);
    expect(
      coursServiUtilisable(
        avecTache({
          id: 'fa000009',
          genre: 'vrai-faux',
          consigne: 'Richtig?',
          affirmations: [{ id: 'fb000099', affirmation: 'Ja.', vrai: 'true' }],
        }),
      ),
    ).toBe(false);
    // Toute tâche a un identifiant, un genre et une consigne, même d'un genre inconnu.
    expect(coursServiUtilisable(avecTache({ id: 'fa000009', genre: 'futur' }))).toBe(false);
    expect(coursServiUtilisable(avecTache({ id: 'fa000009', consigne: 'Neu.' }))).toBe(false);
  });

  it('valeur_qui_n_est_pas_un_cours_refusee', () => {
    for (const valeur of [undefined, null, 'cours', 42, [], {}]) {
      expect(coursServiUtilisable(valeur), JSON.stringify(valeur)).toBe(false);
    }
    const cours = coursServiDeTest();
    expect(coursServiUtilisable({ ...cours, modules: [null] })).toBe(false);
    expect(coursServiUtilisable({ ...cours, modules: [{ id: 'sans-type' }] })).toBe(false);
  });
});

describe('versCoursServi', () => {
  it('cours_servi_sans_ce_qui_ne_regarde_que_le_serveur', () => {
    const [cours] = analyserContenus(exempleDeCours()).cours;
    const avecDerogation = {
      ...cours,
      derogationDiffusion: { motif: 'Motif', date: '2026-10-16' },
    };

    const servi = versCoursServi(avecDerogation);

    expect(Object.keys(servi).sort()).toEqual([
      'id',
      'langue',
      'leitner',
      'modules',
      'titre',
      'typesDeCarte',
    ]);
    expect(servi).toMatchObject({
      id: cours.id,
      titre: cours.titre,
      langue: cours.langue,
      typesDeCarte: cours.typesDeCarte,
      leitner: cours.leitner,
    });
    // Chaque module, tel quel, sans son `fichier`.
    expect(servi.modules).toEqual(cours.modules.map(({ fichier: _fichier, ...module }) => module));
    for (const module of servi.modules) expect(module).not.toHaveProperty('fichier');
    // Et ce que le client sait afficher.
    expect(coursServiUtilisable(JSON.parse(JSON.stringify(servi)))).toBe(true);
  });

  // La liste blanche (`moduleServi`) sert ce que servait la liste noire : tout, sauf `fichier`.
  // `toStrictEqual` distingue une clé absente d'une clé `undefined`.
  it('memoire_servie_telle_quelle_et_absente_sans_elle', () => {
    const [cours] = analyserContenus(exempleDeCours()).cours;
    expect(versCoursServi(cours)).not.toHaveProperty('memoire');

    const avecMemoire = { ...cours, memoire: { algorithme: 'fsrs' as const, retention: 0.85 } };
    const servi = versCoursServi(avecMemoire);
    expect(servi.memoire).toEqual({ algorithme: 'fsrs', retention: 0.85 });
    expect(coursServiUtilisable(JSON.parse(JSON.stringify(servi)))).toBe(true);
  });

  // Les trois clés nouvelles, du manifeste à ce que lit le client : une liste blanche qui en oublierait
  // une la perdrait sans erreur, et le cours resterait en Leitner.
  it('memoire_par_chapitre_traverse_du_yaml_au_client', () => {
    const poids = [...FSRS6_DEFAULT_WEIGHTS];
    const fichiers = modifier(
      exempleDeCours(),
      'essai/cours.yaml',
      'modules:\n',
      `memoire:\n  algorithme: "par-chapitre"\n  retention: 0.88\n  parametres: [${poids.join(', ')}]\n  examen: "2028-02-29"\n  chapitres: ["epas79zz"]\nmodules:\n`,
    );
    const { cours, erreurs } = analyserContenus(fichiers);
    expect(erreurs).toEqual([]);

    const servi = JSON.parse(JSON.stringify(versCoursServi(cours[0]))) as CoursServi;
    expect(servi.memoire).toEqual({
      algorithme: 'par-chapitre',
      retention: 0.88,
      parametres: poids,
      examen: '2028-02-29',
      chapitres: ['epas79zz'],
    });
    expect(coursServiUtilisable(servi)).toBe(true);
    expect(memoireDuCours(servi)).toEqual(servi.memoire);
  });

  it('cours_sans_memoire_servi_comme_avant', () => {
    const [cours] = analyserContenus(exempleDeCours()).cours;
    expect(Object.keys(versCoursServi(cours))).toEqual([
      'id',
      'titre',
      'langue',
      'typesDeCarte',
      'leitner',
      'modules',
    ]);
  });

  it('memoire_aux_cles_nouvelles_invalides_ignoree_sans_refuser_le_cours', () => {
    const poids = [...FSRS6_DEFAULT_WEIGHTS];
    for (const memoire of [
      { algorithme: 'par-chapitre', retention: 0.9 },
      { algorithme: 'par-chapitre', retention: 0.9, chapitres: [] },
      { algorithme: 'fsrs', retention: 0.9, parametres: poids.slice(1) },
      { algorithme: 'fsrs', retention: 0.9, examen: '2027-02-30' },
    ]) {
      const cours = { ...coursServiDeTest(), memoire } as unknown as CoursServi;
      expect(coursServiUtilisable(cours), JSON.stringify(memoire)).toBe(true);
      expect(memoireDuCours(cours), JSON.stringify(memoire)).toBeUndefined();
    }
  });

  it('liste_blanche_sert_ce_que_servait_la_liste_noire', () => {
    const [cours] = analyserContenus(exempleDeCours()).cours;

    expect(versCoursServi(cours).modules).toStrictEqual(
      cours.modules.map(({ fichier: _fichier, ...module }) => module),
    );
  });
});
