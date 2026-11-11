import { z } from 'zod';
import type {
  Carte,
  Cours,
  Etat,
  Exercice,
  GenreDeTache,
  Module,
  ReglagesLeitner,
  ReglagesMemoire,
  SegmentDeTexte,
  Tache,
} from '../contenu/modele.js';

/*
 * Ce que `GET /api/cours/:id` rend, et que le client range hors-ligne : le modèle résolu du cours
 * (lot 1b), sans ce qui ne regarde que le serveur (le dossier du cours, le fichier de chaque
 * module) ni ce qui regarde l'administration (la dérogation de diffusion). Le client ne reçoit
 * jamais un `Cours` : il reçoit un `CoursServi`.
 */

type SansFichier<M> = M extends unknown ? Omit<M, 'fichier'> : never;

/** Chaque variante de `Module`, sans son `fichier`. */
export type ModuleServi = SansFichier<Module>;

export interface CoursServi {
  id: string;
  titre: string;
  langue: string;
  typesDeCarte: Record<string, string>;
  leitner: ReglagesLeitner;
  /** Absent : le cours n'a pas écrit son algorithme de mémoire. À lire par `memoireDuCours`. */
  memoire?: unknown;
  /** Dans l'ordre de `cours.yaml`. */
  modules: ModuleServi[];
}

/** L'état de relecture d'un élément : `verifieLe` n'est servi que s'il existe. */
function etatServi({ statut, verifieLe }: Etat): Etat {
  return verifieLe === undefined ? { statut } : { statut, verifieLe };
}

/** La clé `description` n'est servie que si le module en a une. */
function descriptionServie({ description }: { description?: string }): { description?: string } {
  return description === undefined ? {} : { description };
}

function carteServie(carte: Carte): Carte {
  return {
    id: carte.id,
    type: carte.type,
    recto: carte.recto,
    verso: carte.verso,
    ...(carte.reponses === undefined ? {} : { reponses: [...carte.reponses] }),
    ...etatServi(carte),
  };
}

function segmentServi(segment: SegmentDeTexte): SegmentDeTexte {
  if ('jeton' in segment) {
    const { id, forme, sens } = segment.jeton;
    return { jeton: { id, forme, sens } };
  }
  return { texte: segment.texte };
}

function exerciceServi(exercice: Exercice): Exercice {
  return {
    id: exercice.id,
    invite: exercice.invite,
    reponse: exercice.reponse,
    ...(exercice.options === undefined ? {} : { options: [...exercice.options] }),
    ...(exercice.regle === undefined ? {} : { regle: exercice.regle }),
    ...etatServi(exercice),
  };
}

/** Une tâche de feuille, construite champ par champ, ses éléments compris. */
function tacheServie(tache: Tache): Tache {
  const { id, consigne } = tache;
  switch (tache.genre) {
    case 'appariement':
      return {
        id,
        genre: 'appariement',
        consigne,
        paires: tache.paires.map((paire) => ({
          id: paire.id,
          terme: paire.terme,
          cible: paire.cible,
          ...etatServi(paire),
        })),
      };
    case 'classement':
      return {
        id,
        genre: 'classement',
        consigne,
        categories: [...tache.categories],
        elements: tache.elements.map((element) => ({
          id: element.id,
          terme: element.terme,
          categorie: element.categorie,
          ...etatServi(element),
        })),
      };
    case 'qcm':
      return {
        id,
        genre: 'qcm',
        consigne,
        questions: tache.questions.map((question) => ({
          id: question.id,
          question: question.question,
          reponse: question.reponse,
          distracteurs: [...question.distracteurs],
          ...etatServi(question),
        })),
      };
    case 'vrai-faux':
      return {
        id,
        genre: 'vrai-faux',
        consigne,
        affirmations: tache.affirmations.map((affirmation) => ({
          id: affirmation.id,
          affirmation: affirmation.affirmation,
          vrai: affirmation.vrai,
          ...(affirmation.correction === undefined ? {} : { correction: affirmation.correction }),
          ...etatServi(affirmation),
        })),
      };
    case 'trous':
      return {
        id,
        genre: 'trous',
        consigne,
        ...(tache.liste === undefined ? {} : { liste: [...tache.liste] }),
        phrases: tache.phrases.map((phrase) => ({
          id: phrase.id,
          texte: phrase.texte,
          reponses: [...phrase.reponses],
          ...etatServi(phrase),
        })),
      };
    case 'orthographe':
      return {
        id,
        genre: 'orthographe',
        consigne,
        mots: tache.mots.map((mot) => ({
          id: mot.id,
          fautif: mot.fautif,
          reponse: mot.reponse,
          ...etatServi(mot),
        })),
      };
    case 'ouverte':
      return {
        id,
        genre: 'ouverte',
        consigne,
        questions: tache.questions.map((question) => ({
          id: question.id,
          question: question.question,
          reponse: question.reponse,
          ...etatServi(question),
        })),
      };
    default: {
      // Un nouveau genre de tâche doit dire ici ce qu'il sert.
      const _exhaustif: never = tache;
      return _exhaustif;
    }
  }
}

/**
 * Un module tel que l'API le sert, construit champ par champ, éléments imbriqués compris : ce que
 * le modèle ajoute à un module ne part pas tant qu'on ne l'a pas écrit ici. `ModuleServi` est le
 * module sans son `fichier` : un champ de plus au modèle fait échouer `pnpm types` dans cette
 * fonction, et un type de module de plus fait échouer la garde `never`.
 */
export function moduleServi(module: Module): ModuleServi {
  switch (module.type) {
    case 'cartes':
      return {
        type: 'cartes',
        id: module.id,
        numero: module.numero,
        titre: module.titre,
        cartes: module.cartes.map(carteServie),
      };
    case 'morphologie':
      return {
        type: 'morphologie',
        id: module.id,
        titre: module.titre,
        ...descriptionServie(module),
        chapitres: [...module.chapitres],
        morphemes: module.morphemes.map((morpheme) => ({
          id: morpheme.id,
          categorie: morpheme.categorie,
          forme: morpheme.forme,
          sens: morpheme.sens,
          ...etatServi(morpheme),
        })),
        mots: module.mots.map((mot) => ({
          id: mot.id,
          mot: mot.mot,
          segments: mot.segments.map(({ texte, morpheme }) => ({ texte, morpheme })),
          sens: mot.sens,
          ...etatServi(mot),
        })),
      };
    case 'schema':
      return {
        type: 'schema',
        id: module.id,
        titre: module.titre,
        ...descriptionServie(module),
        viewbox: module.viewbox,
        dessin: module.dessin,
        note: module.note,
        points: module.points.map(({ id, x, y, terme, sens }) => ({ id, x, y, terme, sens })),
        ...etatServi(module),
      };
    case 'texte-annote':
      return {
        type: 'texte-annote',
        id: module.id,
        titre: module.titre,
        ...descriptionServie(module),
        ...(module.consigne === undefined ? {} : { consigne: module.consigne }),
        reussite: module.reussite,
        textes: module.textes.map((texte) => ({
          id: texte.id,
          titre: texte.titre,
          texte: texte.texte,
          segments: texte.segments.map(segmentServi),
          questions: texte.questions.map(({ id, question, reponse, distracteurs }) => ({
            id,
            question,
            reponse,
            distracteurs: [...distracteurs],
          })),
          ...etatServi(texte),
        })),
      };
    case 'exercices':
      return {
        type: 'exercices',
        id: module.id,
        titre: module.titre,
        ...descriptionServie(module),
        familles: module.familles.map((famille) => ({
          code: famille.code,
          libelle: famille.libelle,
          exercices: famille.exercices.map(exerciceServi),
        })),
      };
    case 'feuille':
      return {
        type: 'feuille',
        id: module.id,
        numero: module.numero,
        titre: module.titre,
        parties: module.parties.map((partie) => ({
          titre: partie.titre,
          taches: partie.taches.map(tacheServie),
        })),
      };
    case 'examen':
      return {
        type: 'examen',
        id: module.id,
        titre: module.titre,
        tailles: [...module.tailles],
        tailleParDefaut: module.tailleParDefaut,
        secondesParQuestion: module.secondesParQuestion,
        minutesMinimum: module.minutesMinimum,
        noteSuffisante: module.noteSuffisante,
        seuilChapitre: module.seuilChapitre,
        tirage: {
          schema: module.tirage.schema,
          texte: module.tirage.texte,
          exercice: module.tirage.exercice,
          ...(module.tirage.feuille === undefined ? {} : { feuille: module.tirage.feuille }),
          mot: module.tirage.mot,
          direct: module.tirage.direct,
          aTaper: module.tirage.aTaper,
        },
      };
    default: {
      // Un nouveau type de module doit dire ici ce qu'il sert.
      const _exhaustif: never = module;
      return _exhaustif;
    }
  }
}

/**
 * Le cours tel que l'API le sert (`GET /api/cours/:id`), et tel que les tests du vrai cours le
 * préparent. Les champs du cours sont nommés un à un, et ceux de chaque module par `moduleServi` :
 * rien ne part sans avoir été décidé (liste blanche, ancrage-donnees#79).
 */
export function versCoursServi(cours: Cours): CoursServi {
  return {
    id: cours.id,
    titre: cours.titre,
    langue: cours.langue,
    typesDeCarte: cours.typesDeCarte,
    leitner: cours.leitner,
    ...(cours.memoire === undefined ? {} : { memoire: cours.memoire }),
    modules: cours.modules.map(moduleServi),
  };
}

/*
 * La forme d'un contenu servi dont l'affichage du cours dépend. Un client précaché peut parler à
 * un serveur d'une autre version : après un retour arrière vers la v0.3.0, il reçoit un cours sans
 * `leitner` ni `reussite`, et l'afficher le ferait planter. Les objets ne sont pas stricts : un
 * champ de plus, servi par une version suivante, ne gêne pas. Les statuts de relecture ne sont pas
 * contrôlés : le client ne les lit pas.
 */
const texte = z.string();
const liste = <T extends z.ZodType>(element: T) => z.array(element);

const leitner = z.object({ intervalles: liste(z.int()).length(6), nouvellesParSeance: z.int() });

/*
 * `memoire` n'est pas contrôlé avec le cours : un réglage que ce client ne connaît pas (un autre
 * algorithme, servi par une version suivante) ne rend pas le cours inutilisable. `memoireDuCours`
 * ne rend que ce qu'il sait lire.
 */
const memoire = z.object({
  algorithme: z.enum(['leitner', 'fsrs']),
  retention: z.number().min(0.8).max(0.95),
});

/** Les réglages de mémoire du cours, ou `undefined` s'il n'en a pas ou si ce client ne les connaît pas. */
export function memoireDuCours(cours: CoursServi): ReglagesMemoire | undefined {
  const lus = memoire.safeParse(cours.memoire);
  return lus.success ? lus.data : undefined;
}

const moduleCartes = z.object({
  id: texte,
  numero: z.number(),
  titre: texte,
  cartes: liste(
    z.object({
      id: texte,
      type: texte,
      recto: texte,
      verso: texte,
      reponses: liste(texte).optional(),
    }),
  ),
});

const moduleMorphologie = z.object({
  id: texte,
  titre: texte,
  description: texte.optional(),
  chapitres: liste(texte),
  morphemes: liste(
    z.object({ id: texte, categorie: z.enum(['p', 's', 'x']), forme: texte, sens: texte }),
  ),
  mots: liste(
    z.object({
      id: texte,
      mot: texte,
      segments: liste(z.object({ texte, morpheme: texte })),
      sens: texte,
    }),
  ),
});

const moduleSchema = z.object({
  id: texte,
  titre: texte,
  description: texte.optional(),
  viewbox: texte,
  dessin: texte,
  note: texte,
  points: liste(z.object({ id: texte, x: z.number(), y: z.number(), terme: texte, sens: texte })),
});

const moduleTexteAnnote = z.object({
  id: texte,
  titre: texte,
  description: texte.optional(),
  consigne: texte.optional(),
  reussite: z.number(),
  textes: liste(
    z.object({
      id: texte,
      titre: texte,
      texte,
      segments: liste(
        z.union([
          z.object({ texte }),
          z.object({ jeton: z.object({ id: texte, forme: texte, sens: texte }) }),
        ]),
      ),
      questions: liste(
        z.object({ id: texte, question: texte, reponse: texte, distracteurs: liste(texte) }),
      ),
    }),
  ),
});

const moduleExercices = z.object({
  id: texte,
  titre: texte,
  description: texte.optional(),
  familles: liste(
    z.object({
      code: texte,
      libelle: texte,
      exercices: liste(
        z.object({
          id: texte,
          invite: texte,
          reponse: texte,
          options: liste(texte).optional(),
          regle: texte.optional(),
        }),
      ),
    }),
  ),
});

const moduleExamen = z.object({
  id: texte,
  titre: texte,
  tailles: liste(z.int()),
  tailleParDefaut: z.int(),
  secondesParQuestion: z.number(),
  minutesMinimum: z.number(),
  noteSuffisante: z.number(),
  seuilChapitre: z.number(),
  tirage: z.object({
    schema: z.number(),
    texte: z.number(),
    exercice: z.number(),
    // Facultatif : le contenu mis en cache par la version précédente n'en a pas (F1-D6).
    feuille: z.number().optional(),
    mot: z.number(),
    direct: z.number(),
    aTaper: z.number(),
  }),
});

/**
 * La forme propre à chaque genre de tâche que ce client sait afficher. `satisfies` fait échouer
 * `pnpm types` tant qu'un genre du modèle y manque.
 */
const FORMES_PAR_GENRE = {
  appariement: z.object({ paires: liste(z.object({ id: texte, terme: texte, cible: texte })) }),
  classement: z.object({
    categories: liste(texte),
    elements: liste(z.object({ id: texte, terme: texte, categorie: texte })),
  }),
  qcm: z.object({
    questions: liste(
      z.object({ id: texte, question: texte, reponse: texte, distracteurs: liste(texte) }),
    ),
  }),
  'vrai-faux': z.object({
    affirmations: liste(
      z.object({
        id: texte,
        affirmation: texte,
        vrai: z.boolean(),
        correction: texte.optional(),
      }),
    ),
  }),
  trous: z.object({
    liste: liste(texte).optional(),
    phrases: liste(z.object({ id: texte, texte, reponses: liste(texte) })),
  }),
  orthographe: z.object({ mots: liste(z.object({ id: texte, fautif: texte, reponse: texte })) }),
  ouverte: z.object({
    questions: liste(z.object({ id: texte, question: texte, reponse: texte })),
  }),
} satisfies Record<GenreDeTache, z.ZodType>;

/** Les mêmes formes, lues par le genre que porte la tâche reçue, connu ou non. */
const FORME_DES_TACHES: ReadonlyMap<string, z.ZodType> = new Map(Object.entries(FORMES_PAR_GENRE));

/**
 * Une tâche d'un genre connu a la forme de son genre. Celle d'un genre inconnu, ajouté par une
 * version suivante, passe : la vue l'ignore (F1-D11).
 */
const tache = z
  .looseObject({ id: texte, genre: texte, consigne: texte })
  .refine((lue) => FORME_DES_TACHES.get(lue.genre)?.safeParse(lue).success ?? true);

const moduleFeuille = z.object({
  id: texte,
  numero: z.number(),
  titre: texte,
  parties: liste(z.object({ titre: texte, taches: liste(tache) })),
});

/** La forme de chaque type de module que ce client sait afficher. */
const FORME_DES_MODULES: ReadonlyMap<string, z.ZodType> = new Map<ModuleServi['type'], z.ZodType>([
  ['cartes', moduleCartes],
  ['morphologie', moduleMorphologie],
  ['schema', moduleSchema],
  ['texte-annote', moduleTexteAnnote],
  ['exercices', moduleExercices],
  ['feuille', moduleFeuille],
  ['examen', moduleExamen],
]);

const coursServi = z.object({
  id: texte,
  titre: texte,
  langue: texte,
  typesDeCarte: z.record(texte, texte),
  leitner,
  modules: liste(z.looseObject({ type: texte })),
});

/**
 * Vrai si `lu` (un contenu lu sur le réseau ou dans IndexedDB) a la forme d'un `CoursServi` que ce
 * client sait afficher. Un module d'un type qu'il ne connaît pas (ajouté par une version suivante)
 * ne compte pas : `preparerCours` l'ignore.
 */
export function coursServiUtilisable(lu: unknown): lu is CoursServi {
  const cours = coursServi.safeParse(lu);
  return (
    cours.success &&
    cours.data.modules.every(
      (module) => FORME_DES_MODULES.get(module.type)?.safeParse(module).success ?? true,
    )
  );
}
