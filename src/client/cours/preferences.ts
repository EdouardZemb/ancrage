/*
 * Les préférences d'un cours : les derniers choix de chaque onglet (chapitre, sens, mode…). Elles
 * sont propres à l'appareil (ADR-0004) et rangées par personne et par cours dans `localStorage`,
 * sous `ancrage.preferences.<personne>.<cours>` (décision 17). La déconnexion les vide
 * (`effacerPreferences`).
 *
 * Le contenu peut changer sous des préférences gardées : un choix que le cours ne connaît plus
 * (un chapitre retiré, une taille d'examen disparue) reprend sa valeur par défaut. Sans stockage
 * (fenêtre privée, données bloquées), les valeurs par défaut servent, et rien n'est gardé.
 */
import type { CoursPrepare } from '../../domaine/cours/prepare.js';
import type { SensChoisi } from '../../domaine/seances/cartes.js';
import { elementsTirables, GENRES_FERMES } from '../../domaine/seances/feuilles.js';

export interface Preferences {
  cartes: { chapitre: string | 'tous'; sens: SensChoisi; saisie: boolean };
  quiz: { chapitre: string | 'tous' | 'feuilles'; sens: SensChoisi };
  mots: { mode: 'mix' | 'zerlegen' | 'bilden' };
  examen: { chapitres: string[]; taille: number; chrono: boolean; avecModules: boolean };
  schemas: { schema: string; mode: 'benennen' | 'zeigen' | 'lernen' };
  textes: { indice: number };
  exercices: { famille: string | 'mix' };
}

const PREFIXE = 'ancrage.preferences.';

const SENS: readonly SensChoisi[] = ['mix', 'direct', 'inverse'];
const MODES_MOTS: readonly Preferences['mots']['mode'][] = ['mix', 'zerlegen', 'bilden'];
const MODES_SCHEMAS: readonly Preferences['schemas']['mode'][] = ['benennen', 'zeigen', 'lernen'];

function cle(personne: string, cours: string): string {
  return `${PREFIXE}${personne}.${cours}`;
}

/**
 * Les valeurs du prototype (H:1581-1582), avec les identifiants du cours : le premier module de
 * cartes (le prototype disait « 8 », son premier chapitre de cartes), tous les chapitres et la
 * taille par défaut à l'examen, le premier schéma. Un cours sans module de cartes prend `'tous'`,
 * sans schéma `''`, sans examen une taille de 0 : ces onglets n'existent pas, la valeur ne sert pas.
 */
export function preferencesParDefaut(cours: CoursPrepare): Preferences {
  const chapitre = cours.chapitres[0]?.id ?? 'tous';
  return {
    cartes: { chapitre, sens: 'mix', saisie: true },
    quiz: { chapitre, sens: 'mix' },
    mots: { mode: 'mix' },
    examen: {
      chapitres: cours.chapitres.map(({ id }) => id),
      taille: cours.examen?.tailleParDefaut ?? 0,
      chrono: true,
      avecModules: true,
    },
    schemas: { schema: cours.schemas[0]?.id ?? '', mode: 'benennen' },
    textes: { indice: 0 },
    exercices: { famille: 'mix' },
  };
}

type Objet = Record<string, unknown>;

const estObjet = (valeur: unknown): valeur is Objet =>
  typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);

/** La valeur gardée si elle est permise, sinon la valeur par défaut. */
function parmi<T>(valeur: unknown, permises: readonly T[], defaut: T): T {
  return permises.includes(valeur as T) ? (valeur as T) : defaut;
}

function booleen(valeur: unknown, defaut: boolean): boolean {
  return typeof valeur === 'boolean' ? valeur : defaut;
}

function lireGardees(personne: string, cours: string): Objet {
  try {
    const gardees: unknown = JSON.parse(localStorage.getItem(cle(personne, cours)) ?? 'null');
    return estObjet(gardees) ? gardees : {};
  } catch {
    return {};
  }
}

export function lirePreferences(personne: string, cours: CoursPrepare): Preferences {
  const defaut = preferencesParDefaut(cours);
  const gardees = lireGardees(personne, cours.cours.id);
  const partie = (nom: keyof Preferences): Objet => {
    const valeur = gardees[nom];
    return estObjet(valeur) ? valeur : {};
  };
  const [cartes, quiz, mots, examen, schemas, textes, exercices] = (
    ['cartes', 'quiz', 'mots', 'examen', 'schemas', 'textes', 'exercices'] as const
  ).map(partie);

  const chapitres = cours.chapitres.map(({ id }) => id);
  const nombreDeTextes = cours.textes?.textes.length ?? 0;
  const indice = textes.indice;

  return {
    cartes: {
      chapitre: parmi(cartes.chapitre, ['tous', ...chapitres], defaut.cartes.chapitre),
      sens: parmi(cartes.sens, SENS, defaut.cartes.sens),
      saisie: booleen(cartes.saisie, defaut.cartes.saisie),
    },
    quiz: {
      // `feuilles` : les questions fermées des feuilles, si le cours en a.
      chapitre: parmi(
        quiz.chapitre,
        [
          ...(elementsTirables(cours.feuilles, GENRES_FERMES).length > 0 ? ['feuilles'] : []),
          'tous',
          ...chapitres,
        ],
        defaut.quiz.chapitre,
      ),
      sens: parmi(quiz.sens, SENS, defaut.quiz.sens),
    },
    mots: { mode: parmi(mots.mode, MODES_MOTS, defaut.mots.mode) },
    examen: {
      // Les chapitres gardés que le cours connaît encore, dans l'ordre du cours.
      chapitres: Array.isArray(examen.chapitres)
        ? chapitres.filter((id) => (examen.chapitres as unknown[]).includes(id))
        : defaut.examen.chapitres,
      taille: parmi(examen.taille, cours.examen?.tailles ?? [], defaut.examen.taille),
      chrono: booleen(examen.chrono, defaut.examen.chrono),
      avecModules: booleen(examen.avecModules, defaut.examen.avecModules),
    },
    schemas: {
      schema: parmi(
        schemas.schema,
        cours.schemas.map(({ id }) => id),
        defaut.schemas.schema,
      ),
      mode: parmi(schemas.mode, MODES_SCHEMAS, defaut.schemas.mode),
    },
    textes: {
      indice:
        Number.isInteger(indice) && (indice as number) >= 0 && (indice as number) < nombreDeTextes
          ? (indice as number)
          : defaut.textes.indice,
    },
    exercices: {
      famille: parmi(
        exercices.famille,
        ['mix', ...(cours.exercices?.familles.map(({ code }) => code) ?? [])],
        defaut.exercices.famille,
      ),
    },
  };
}

export function ecrirePreferences(personne: string, cours: string, p: Preferences): void {
  try {
    localStorage.setItem(cle(personne, cours), JSON.stringify(p));
  } catch {
    // Pas de stockage : les choix valent jusqu'au prochain chargement.
  }
}

/**
 * Efface les préférences de toutes les personnes et de tous les cours, et rien d'autre ; avec
 * `garder`, sauf celles de cette personne (une autre personne vient de se connecter, Review Focus
 * 3).
 */
export function effacerPreferences(garder?: string): void {
  const gardees = garder === undefined ? undefined : `${PREFIXE}${garder}.`;
  try {
    const cles: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const nom = localStorage.key(i);
      if (nom?.startsWith(PREFIXE) && (gardees === undefined || !nom.startsWith(gardees))) {
        cles.push(nom);
      }
    }
    for (const nom of cles) localStorage.removeItem(nom);
  } catch {
    // Pas de stockage : il n'y a rien à effacer.
  }
}
