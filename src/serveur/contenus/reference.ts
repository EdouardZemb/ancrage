import { indexerReponses, reponsesAcceptees, unitesDeCartes } from '../../domaine/cartes/unites.js';
import {
  type CompteDesStatuts,
  coursAVerifier,
  statutsDuModule,
} from '../../domaine/contenu/acces-cours.js';
import type {
  Cours,
  Etat,
  ModuleCartes,
  ModuleExamen,
  ModuleExercices,
  ModuleFeuille,
  ModuleMorphologie,
  ModuleSchema,
  ModuleTexteAnnote,
  ReglagesLeitner,
  ReglagesMemoire,
  Tache,
  TirageExamen,
} from '../../domaine/contenu/modele.js';
import type { Notice, ValeursDeNotice } from '../../domaine/notice.js';
import { type LangueDeNotice, noticeComposee } from '../../domaine/notice-gabarit.js';

/** `T`, dont les éléments de chaque liste perdent leur état de relecture (statut et date). */
type SansEtats<T> = T extends unknown
  ? {
      [K in keyof T]: T[K] extends readonly (infer E)[]
        ? E extends Etat
          ? Omit<E, keyof Etat>[]
          : T[K]
        : T[K];
    }
  : never;

/** Une tâche de feuille, sans les statuts de ses éléments. */
export type TacheDeReference = SansEtats<Tache>;

/*
 * La référence d'un cours : ce que le contenu donne une fois résolu, écrit dans
 * `<références>/<dossier>.reference.json`. L'ordre des clés est celui du fichier. Les
 * statuts des éléments n'y figurent pas un par un : `diffusion` en garde l'état du cours et les
 * comptes par module. L'analyse contrôle leur forme, et `contenus:a-verifier` liste les éléments à
 * relire.
 */

export interface Reference {
  cours: {
    id: string;
    titre: string;
    langue: string;
    typesDeCarte: Record<string, string>;
    leitner: ReglagesLeitner;
    /** Présent seulement si le cours l'écrit : l'instantané d'un cours sans lui ne change pas. */
    memoire?: ReglagesMemoire;
  };
  /**
   * L'état de relecture du cours : `aVerifier` s'il a au moins un élément « à vérifier », sa
   * dérogation de diffusion, et pour chaque module à statut (tous, sauf l'examen), dans l'ordre du
   * cours, le nombre de ses éléments de chaque statut. La section change quand le cours passe d'un
   * état à l'autre, quand sa dérogation change (motif et date compris), et quand le nombre
   * d'éléments d'un statut change dans un module. L'instantané est le seul contrôle qui voit ces
   * changements, dont dépendent l'accès d'un groupe (invariant 9) et la sincérité du statut
   * `source` (ADR-0003). Limite : deux changements de sens contraire dans un même module se
   * compensent dans ses comptes, et ne se voient pas.
   */
  diffusion: {
    aVerifier: boolean;
    derogation: { motif: string; date: string } | null;
    statuts: ({ module: string } & CompteDesStatuts)[];
  };
  chapitres: { module: string; numero: number; titre: string }[];
  /** `acceptees` est triée. */
  unites: {
    id: string;
    numero: number;
    type: string;
    sens: 'direct' | 'inverse';
    question: string;
    reponse: string;
    acceptees: string[];
  }[];
  morphemes: { id: string; categorie: string; forme: string; sens: string }[];
  mots: {
    id: string;
    mot: string;
    segments: { texte: string; morpheme: string }[];
    sens: string;
  }[];
  schemas: {
    id: string;
    titre: string;
    viewbox: string;
    dessin: string;
    note: string;
    points: { id: string; x: number; y: number; terme: string; sens: string }[];
  }[];
  textes: {
    id: string;
    titre: string;
    /** `jeton` est l'identifiant du jeton. */
    segments: ({ texte: string } | { jeton: string; forme: string; sens: string })[];
    questions: { id: string; question: string; reponse: string; distracteurs: string[] }[];
  }[];
  exercices: {
    id: string;
    famille: string;
    libelle: string;
    invite: string;
    type: 'tapee' | 'choix';
    options?: string[];
    reponse: string;
    regle?: string;
  }[];
  /** Dans l'ordre du cours. */
  feuilles: {
    id: string;
    numero: number;
    titre: string;
    parties: { titre: string; taches: TacheDeReference[] }[];
  }[];
  /** Dans l'ordre du cours : les modules qui ont une `description`. */
  descriptions: { module: string; description: string }[];
  /** Dans l'ordre du cours : les modules de textes annotés qui ont une `consigne`. */
  consignes: { module: string; consigne: string }[];
  /**
   * Les réglages des modules dont le cours n'a qu'un exemplaire : la réussite d'un texte annoté, et
   * l'examen. Une clé est absente si le cours n'a pas le module.
   */
  reglages: {
    reussite?: number;
    examen?: {
      module: string;
      titre: string;
      tailles: number[];
      tailleParDefaut: number;
      secondesParQuestion: number;
      minutesMinimum: number;
      noteSuffisante: number;
      seuilChapitre: number;
      tirage: TirageExamen;
    };
  };
}

/** Les modules du cours, rangés par type, dans l'ordre du cours. */
function modulesParType(cours: Cours) {
  const rangees = {
    cartes: [] as ModuleCartes[],
    morphologie: [] as ModuleMorphologie[],
    schemas: [] as ModuleSchema[],
    textes: [] as ModuleTexteAnnote[],
    exercices: [] as ModuleExercices[],
    feuilles: [] as ModuleFeuille[],
    examens: [] as ModuleExamen[],
  };
  for (const module of cours.modules) {
    switch (module.type) {
      case 'cartes':
        rangees.cartes.push(module);
        break;
      case 'morphologie':
        rangees.morphologie.push(module);
        break;
      case 'schema':
        rangees.schemas.push(module);
        break;
      case 'texte-annote':
        rangees.textes.push(module);
        break;
      case 'exercices':
        rangees.exercices.push(module);
        break;
      case 'feuille':
        rangees.feuilles.push(module);
        break;
      case 'examen':
        rangees.examens.push(module);
        break;
      default: {
        // Un nouveau type de module doit dire ici ce que la référence en retient : `pnpm types`
        // échoue tant que ce n'est pas fait.
        const _exhaustif: never = module;
        throw new Error('type de module non géré');
      }
    }
  }
  return rangees;
}

/** Calcule la référence d'un cours dont l'analyse n'a donné aucune erreur. */
export function calculerReference(cours: Cours): Reference {
  const modules = modulesParType(cours);
  const cartes = modules.cartes;
  // Les réponses acceptées se mettent en commun dans tout le cours, comme le `ACCEPT` du prototype :
  // deux modules peuvent poser la même question inverse.
  const unites = unitesDeCartes(cartes);
  const index = indexerReponses(unites);

  return {
    cours: {
      id: cours.id,
      titre: cours.titre,
      langue: cours.langue,
      typesDeCarte: cours.typesDeCarte,
      leitner: {
        intervalles: [...cours.leitner.intervalles],
        nouvellesParSeance: cours.leitner.nouvellesParSeance,
      },
      ...(cours.memoire === undefined
        ? {}
        : {
            memoire: { algorithme: cours.memoire.algorithme, retention: cours.memoire.retention },
          }),
    },
    diffusion: {
      // La règle même de l'invariant 9, que le module `acces` applique à chaque requête.
      aVerifier: coursAVerifier(cours),
      derogation:
        cours.derogationDiffusion === undefined
          ? null
          : { motif: cours.derogationDiffusion.motif, date: cours.derogationDiffusion.date },
      statuts: cours.modules.flatMap((module) => {
        const compte = statutsDuModule(module);
        return compte === undefined ? [] : [{ module: module.id, ...compte }];
      }),
    },
    chapitres: cartes.map((module) => ({
      module: module.id,
      numero: module.numero,
      titre: module.titre,
    })),
    unites: unites.map((unite) => ({
      id: unite.id,
      numero: unite.numero,
      type: unite.type,
      sens: unite.sens,
      question: unite.question,
      reponse: unite.reponse,
      acceptees: [...reponsesAcceptees(unite, index)].sort(),
    })),
    morphemes: modules.morphologie.flatMap((module) =>
      module.morphemes.map((morpheme) => ({
        id: morpheme.id,
        categorie: morpheme.categorie,
        forme: morpheme.forme,
        sens: morpheme.sens,
      })),
    ),
    mots: modules.morphologie.flatMap((module) =>
      module.mots.map((mot) => ({
        id: mot.id,
        mot: mot.mot,
        segments: mot.segments.map((segment) => ({
          texte: segment.texte,
          morpheme: segment.morpheme,
        })),
        sens: mot.sens,
      })),
    ),
    schemas: modules.schemas.map((schema) => ({
      id: schema.id,
      titre: schema.titre,
      viewbox: schema.viewbox,
      dessin: schema.dessin,
      note: schema.note,
      points: schema.points.map((point) => ({
        id: point.id,
        x: point.x,
        y: point.y,
        terme: point.terme,
        sens: point.sens,
      })),
    })),
    textes: modules.textes.flatMap((module) =>
      module.textes.map((texte) => ({
        id: texte.id,
        titre: texte.titre,
        segments: texte.segments.map((segment) =>
          'jeton' in segment
            ? { jeton: segment.jeton.id, forme: segment.jeton.forme, sens: segment.jeton.sens }
            : { texte: segment.texte },
        ),
        questions: texte.questions.map((question) => ({
          id: question.id,
          question: question.question,
          reponse: question.reponse,
          distracteurs: [...question.distracteurs],
        })),
      })),
    ),
    exercices: modules.exercices.flatMap((module) =>
      module.familles.flatMap((famille) =>
        famille.exercices.map((exercice) => ({
          id: exercice.id,
          famille: famille.code,
          libelle: famille.libelle,
          invite: exercice.invite,
          type: exercice.options === undefined ? ('tapee' as const) : ('choix' as const),
          ...(exercice.options === undefined ? {} : { options: [...exercice.options] }),
          reponse: exercice.reponse,
          // Une règle vide vaut une règle absente.
          ...(exercice.regle === undefined || exercice.regle === ''
            ? {}
            : { regle: exercice.regle }),
        })),
      ),
    ),
    feuilles: modules.feuilles.map((feuille) => ({
      id: feuille.id,
      numero: feuille.numero,
      titre: feuille.titre,
      parties: feuille.parties.map((partie) => ({
        titre: partie.titre,
        taches: partie.taches.map(tacheDeReference),
      })),
    })),
    descriptions: cours.modules.flatMap((module) =>
      'description' in module && module.description !== undefined
        ? [{ module: module.id, description: module.description }]
        : [],
    ),
    consignes: modules.textes.flatMap((module) =>
      module.consigne === undefined ? [] : [{ module: module.id, consigne: module.consigne }],
    ),
    reglages: reglagesDe(modules),
  };
}

/**
 * Un élément de feuille, sans son état de relecture : ses autres champs, dans l'ordre du modèle.
 * Elle retire par exclusion et non par liste blanche, qui dupliquerait le modèle de chaque genre :
 * le champ nouveau d'un élément entre ainsi dans la référence, où le diff de l'instantané le fait
 * relire.
 */
function sansEtat<E extends Etat>({ statut: _statut, verifieLe: _verifieLe, ...reste }: E) {
  return reste;
}

/** Une tâche, sans le statut de ses éléments. */
function tacheDeReference(tache: Tache): TacheDeReference {
  const { id, consigne } = tache;
  switch (tache.genre) {
    case 'appariement':
      return { id, genre: tache.genre, consigne, paires: tache.paires.map(sansEtat) };
    case 'classement':
      return {
        id,
        genre: tache.genre,
        consigne,
        categories: tache.categories,
        elements: tache.elements.map(sansEtat),
      };
    case 'qcm':
      return { id, genre: tache.genre, consigne, questions: tache.questions.map(sansEtat) };
    case 'vrai-faux':
      return { id, genre: tache.genre, consigne, affirmations: tache.affirmations.map(sansEtat) };
    case 'trous':
      return {
        id,
        genre: tache.genre,
        consigne,
        ...(tache.liste === undefined ? {} : { liste: tache.liste }),
        phrases: tache.phrases.map(sansEtat),
      };
    case 'orthographe':
      return { id, genre: tache.genre, consigne, mots: tache.mots.map(sansEtat) };
    case 'ouverte':
      return { id, genre: tache.genre, consigne, questions: tache.questions.map(sansEtat) };
    default: {
      // Un nouveau genre de tâche doit dire ici ce que la référence en retient.
      const _exhaustif: never = tache;
      return _exhaustif;
    }
  }
}

/** Au plus un module de chaque type concerné par cours : l'analyse y veille. */
function reglagesDe(modules: ReturnType<typeof modulesParType>): Reference['reglages'] {
  const [texteAnnote] = modules.textes;
  const [examen] = modules.examens;
  return {
    ...(texteAnnote === undefined ? {} : { reussite: texteAnnote.reussite }),
    ...(examen === undefined
      ? {}
      : {
          examen: {
            module: examen.id,
            titre: examen.titre,
            tailles: [...examen.tailles],
            tailleParDefaut: examen.tailleParDefaut,
            secondesParQuestion: examen.secondesParQuestion,
            minutesMinimum: examen.minutesMinimum,
            noteSuffisante: examen.noteSuffisante,
            seuilChapitre: examen.seuilChapitre,
            tirage: { ...examen.tirage },
          },
        }),
  };
}

/** L'instantané de la notice, à côté de ceux des cours (S1-D10). */
export const FICHIER_REFERENCE_NOTICE = 'notice.json';

/**
 * La référence de la notice : ce que l'écran affiche, composé du gabarit et des valeurs, en
 * français puis en allemand.
 */
export function referenceDeNotice(valeurs: ValeursDeNotice): Record<LangueDeNotice, Notice> {
  return { fr: noticeComposee('fr', valeurs), de: noticeComposee('de', valeurs) };
}
