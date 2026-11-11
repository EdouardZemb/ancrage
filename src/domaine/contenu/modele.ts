import type { ValeursDeNotice } from '../notice.js';
import type { ErreurContenu } from './erreurs.js';

/*
 * Le modèle **résolu** des contenus du format 1 : les statuts hérités et les options de famille y
 * sont appliqués. Les noms de champs des fichiers YAML (`verifie_le`, `types_de_carte`) sont ici
 * en camelCase.
 */

export type Statut = 'source' | 'à vérifier' | 'vérifié';

export interface Etat {
  statut: Statut;
  verifieLe?: string;
}

export interface Carte extends Etat {
  id: string;
  type: string;
  recto: string;
  verso: string;
  reponses?: string[];
}

export interface ModuleCartes {
  type: 'cartes';
  id: string;
  fichier: string;
  numero: number;
  titre: string;
  cartes: Carte[];
}

export interface Morpheme extends Etat {
  id: string;
  categorie: 'p' | 's' | 'x';
  forme: string;
  sens: string;
}

export interface Mot extends Etat {
  id: string;
  mot: string;
  segments: { texte: string; morpheme: string }[];
  sens: string;
}

export interface ModuleMorphologie {
  type: 'morphologie';
  id: string;
  fichier: string;
  titre: string;
  /** Le sous-titre de l'aperçu du cours. */
  description?: string;
  chapitres: string[];
  morphemes: Morpheme[];
  mots: Mot[];
}

export interface PointDeSchema {
  id: string;
  x: number;
  y: number;
  terme: string;
  sens: string;
}

export interface ModuleSchema extends Etat {
  type: 'schema';
  id: string;
  fichier: string;
  titre: string;
  description?: string;
  viewbox: string;
  /** L'intérieur du SVG, sans son cadre. */
  dessin: string;
  note: string;
  points: PointDeSchema[];
}

export interface Jeton {
  id: string;
  forme: string;
  sens: string;
}

export type SegmentDeTexte = { texte: string } | { jeton: Jeton };

export interface Question {
  id: string;
  question: string;
  reponse: string;
  distracteurs: string[];
}

export interface TexteAnnote extends Etat {
  id: string;
  titre: string;
  texte: string;
  segments: SegmentDeTexte[];
  questions: Question[];
}

export interface ModuleTexteAnnote {
  type: 'texte-annote';
  id: string;
  fichier: string;
  titre: string;
  description?: string;
  /** Le texte affiché en tête de l'onglet des comptes rendus. */
  consigne?: string;
  /** La part de réponses justes, dans ]0, 1], à partir de laquelle un texte est réussi. */
  reussite: number;
  textes: TexteAnnote[];
}

export interface Exercice extends Etat {
  id: string;
  invite: string;
  reponse: string;
  /** Absentes : l'exercice est « à taper ». */
  options?: string[];
  regle?: string;
}

export interface FamilleExercices {
  code: string;
  libelle: string;
  exercices: Exercice[];
}

export interface ModuleExercices {
  type: 'exercices';
  id: string;
  fichier: string;
  titre: string;
  description?: string;
  familles: FamilleExercices[];
}

/*
 * Une feuille, la fiche d'exercices d'une Unit (« Arbeitsblatt ») : des parties, faites de tâches,
 * faites d'éléments. Une tâche a un `id` mais pas de statut ; chaque élément a le sien, hérité de
 * la feuille ou surchargé (F1-D2), et reçoit une réponse.
 */

export interface PaireAppariee extends Etat {
  id: string;
  terme: string;
  cible: string;
}

export interface ElementAClasser extends Etat {
  id: string;
  terme: string;
  /** L'une des `categories` de la tâche. */
  categorie: string;
}

export interface QuestionAChoix extends Etat {
  id: string;
  question: string;
  reponse: string;
  /** Exactement 3, distincts, sans la réponse. */
  distracteurs: string[];
}

export interface Affirmation extends Etat {
  id: string;
  affirmation: string;
  vrai: boolean;
  correction?: string;
}

export interface PhraseATrous extends Etat {
  id: string;
  /** Chaque trou y est marqué `___` (`MARQUE_DE_TROU`). */
  texte: string;
  /** Une par trou, dans l'ordre des trous. */
  reponses: string[];
}

export interface MotACorriger extends Etat {
  id: string;
  fautif: string;
  reponse: string;
}

export interface QuestionOuverte extends Etat {
  id: string;
  question: string;
  /** La réponse modèle. */
  reponse: string;
}

export interface TacheCommune {
  id: string;
  consigne: string;
}

export type Tache = TacheCommune &
  (
    | { genre: 'appariement'; paires: PaireAppariee[] }
    | { genre: 'classement'; categories: string[]; elements: ElementAClasser[] }
    | { genre: 'qcm'; questions: QuestionAChoix[] }
    | { genre: 'vrai-faux'; affirmations: Affirmation[] }
    // `liste` : la liste de mots où l'on choisit chaque réponse. Absente, chaque trou se tape.
    | { genre: 'trous'; liste?: string[]; phrases: PhraseATrous[] }
    | { genre: 'orthographe'; mots: MotACorriger[] }
    | { genre: 'ouverte'; questions: QuestionOuverte[] }
  );

export type GenreDeTache = Tache['genre'];

/** Ce qui reçoit une réponse dans une feuille : un élément d'une tâche, quel que soit son genre. */
export type ElementDeFeuille =
  | PaireAppariee
  | ElementAClasser
  | QuestionAChoix
  | Affirmation
  | PhraseATrous
  | MotACorriger
  | QuestionOuverte;

export interface PartieDeFeuille {
  titre: string;
  taches: Tache[];
}

export interface ModuleFeuille {
  type: 'feuille';
  id: string;
  fichier: string;
  /** Le numéro de la Unit, unique parmi les feuilles du cours. */
  numero: number;
  titre: string;
  /** Dans l'ordre du papier. */
  parties: PartieDeFeuille[];
}

/**
 * Les seuils du tirage des questions, repris tels quels du prototype (terminologie-trainer.html,
 * l. 1942-1954), tous dans [0, 1].
 * - Un tirage choisit une question de module, quand les modules sont actifs : sous `schema` un
 *   schéma, sous `texte` un compte rendu, sous `exercice` un exercice de grammaire, sous `feuille`
 *   un élément d'une feuille. Les quatre seuils se cumulent : `schema` ≤ `texte` ≤ `exercice` ≤
 *   `feuille`.
 * - Un autre tirage choisit le reste : sous `mot` un mot du Wortbaukasten, sinon une carte, dans le
 *   sens direct sous `direct`, dans le sens inverse au-delà. Une carte inverse se tape quand le
 *   nombre tiré est supérieur ou égal à `aTaper` (H:1954, `r >= .72`).
 */
export interface TirageExamen {
  schema: number;
  texte: number;
  exercice: number;
  /**
   * Obligatoire dans `examen.yaml`, facultatif dans la forme servie (F1-D6) : le contenu mis en
   * cache par la version précédente n'en a pas. Absent, il vaut `exercice`, et aucune question de
   * feuille n'est tirée.
   */
  feuille?: number;
  mot: number;
  direct: number;
  aTaper: number;
}

/**
 * Les réglages de l'examen. Ce n'est pas un contenu à relire : le module n'a pas de statut et ne
 * compte jamais pour « à vérifier ».
 */
export interface ModuleExamen {
  type: 'examen';
  id: string;
  fichier: string;
  titre: string;
  /** Les nombres de questions proposés, strictement croissants. */
  tailles: number[];
  /** L'une des `tailles`. */
  tailleParDefaut: number;
  secondesParQuestion: number;
  minutesMinimum: number;
  /** La note, de 1 à 6, à partir de laquelle l'examen est réussi. */
  noteSuffisante: number;
  /** La part de réponses justes, dans ]0, 1], à partir de laquelle un chapitre est réussi. */
  seuilChapitre: number;
  tirage: TirageExamen;
}

export type Module =
  | ModuleCartes
  | ModuleMorphologie
  | ModuleSchema
  | ModuleTexteAnnote
  | ModuleExercices
  | ModuleFeuille
  | ModuleExamen;

/** Les réglages de la méthode des boîtes de Leitner. */
export interface ReglagesLeitner {
  /** Un nombre de jours par boîte, de 0 à 5 : six entiers croissants, le premier valant 0. */
  intervalles: number[];
  /** Le nombre de cartes neuves d'une séance, de 1 à 100. */
  nouvellesParSeance: number;
}

/** L'algorithme de répétition espacée d'un cours. */
export type AlgorithmeDeMemoire = 'leitner' | 'fsrs';

/** Le choix de l'algorithme de mémoire, et la rétention visée (de 0,80 à 0,95, 0,90 par défaut). */
export interface ReglagesMemoire {
  algorithme: AlgorithmeDeMemoire;
  retention: number;
}

export interface Cours {
  id: string;
  /** Le dossier du cours, à la racine du dossier de contenu. */
  dossier: string;
  titre: string;
  langue: string;
  typesDeCarte: Record<string, string>;
  leitner: ReglagesLeitner;
  /** Le choix de l'algorithme de mémoire. Absent : le cours n'en a pas écrit. */
  memoire?: ReglagesMemoire;
  /**
   * La dérogation écrite dans `cours.yaml` qui autorise la diffusion à un groupe d'un cours « à
   * vérifier » (invariant 9). Absente : le cours n'en a pas.
   */
  derogationDiffusion?: { motif: string; date: string };
  /** Dans l'ordre de `cours.yaml`. */
  modules: Module[];
}

export interface ResultatContenus {
  /** Utilisables seulement si `erreurs` est vide. */
  cours: Cours[];
  erreurs: ErreurContenu[];
  /** Chaque identifiant du contenu et son lieu, au format `fichier:lieu`. */
  identifiants: Map<string, string>;
  /** Les valeurs de `notice.yaml` (S1-D7) ; absentes si le fichier manque ou n'est pas valide. */
  notice?: ValeursDeNotice;
}
