/*
 * Les libellés et les énoncés de « Prüfung » : des fonctions pures, de la question ou du groupe au
 * texte que l'écran montre (elles quittent `Examen.tsx`, 2b-D6).
 */
import type { CoursPrepare } from '../../../domaine/cours/prepare.js';
import type {
  CorrectionExamen,
  Examen as ExamenComposee,
  QuestionExamen,
  ReponseExamen,
} from '../../../domaine/seances/examen.js';
import type { ElementTirable } from '../../../domaine/seances/feuilles.js';
import { libelleDOption } from '../composants-cours.js';
import { type CleTexteCours, formater } from '../textes-cours.js';

export type Textes = Record<CleTexteCours, string>;

/** Un examen remis : la correction, et la durée réelle en minutes. */
export interface Remis {
  correction: CorrectionExamen;
  minutes: number;
}

/** Un examen commencé. `resultat` est vide jusqu'à la remise. */
export interface Passage {
  examen: ExamenComposee;
  /** `reponses[i]` : l'indice de l'option choisie, la saisie, ou rien. */
  reponses: ReponseExamen[];
  indice: number;
  /** Les instants (`Date.now()`) du début et de la fin du temps accordé ; sans chrono, `null`. */
  debut: number;
  echeance: number | null;
  /** « Jetzt abgeben? » est affiché. Il l'est jusqu'à ce qu'on le refuse, comme `confirmEnd`. */
  confirmer: boolean;
  resultat: Remis | null;
}

/** Le libellé du groupe d'un résultat : « Kapitel n », ou celui de l'onglet du module. */
export function libelleDuGroupe(groupe: string, cours: CoursPrepare, t: Textes): string {
  const chapitre = cours.chapitres.find(({ id }) => id === groupe);
  if (chapitre !== undefined) return formater(t.examen_kapitel, { n: chapitre.numero });
  switch (groupe) {
    case 'mots':
      return cours.morphologie?.titre ?? groupe;
    case 'schemas':
      return t.onglet_schemas;
    case 'textes':
      return cours.textes?.titre ?? groupe;
    case 'exercices':
      return cours.exercices?.titre ?? groupe;
    case 'feuilles':
      return t.onglet_feuilles;
    default:
      return groupe;
  }
}

/** L'étiquette d'une question (`label` et chapitre, H:1954-1982). */
export function etiquetteDe(question: QuestionExamen, cours: CoursPrepare, t: Textes): string {
  switch (question.genre) {
    case 'carte': {
      const { unite } = question;
      // Une carte à taper est toujours une carte inverse (H:1954).
      const sens =
        question.options === undefined
          ? t.examen_eintippen
          : unite.sens === 'direct'
            ? t.sens_direct
            : t.sens_inverse;
      return [
        cours.cours.typesDeCarte[unite.type],
        sens,
        formater(t.carte_chapitre, { n: unite.numero }),
      ].join(' · ');
    }
    case 'mot':
      return t.examen_wort_zerlegen;
    case 'schema':
      return t.examen_schema;
    case 'jeton':
      return formater(t.examen_bericht, { titre: question.texte.titre });
    case 'exercice':
      return question.famille.libelle;
    case 'feuille':
      return question.feuille.titre;
  }
}

/** Ce qui est demandé (`q` du prototype). */
export function enonceDe(question: QuestionExamen, t: Textes): string {
  switch (question.genre) {
    case 'carte':
      return question.unite.question;
    case 'mot':
      return formater(t.examen_was_bedeutet, { forme: question.mot.mot });
    case 'schema':
      return `${question.schema.titre}: ${formater(t.schemas_wie_heisst, {
        nummer: formater(t.schemas_nummer, { n: question.point + 1 }),
      })}`;
    case 'jeton':
      return formater(t.examen_was_bedeutet, { forme: question.jeton.forme });
    case 'exercice':
      return question.exercice.invite;
    case 'feuille':
      return enonceDeLElement(question.element, t);
  }
}

/** Ce que demande un élément de feuille : une phrase montre son trou (`___`, F1-D5). */
export function enonceDeLElement(element: ElementTirable, t: Textes): string {
  switch (element.genre) {
    case 'qcm':
      return element.question.question;
    case 'vrai-faux':
      return element.affirmation.affirmation;
    case 'trous':
      return element.phrase.texte;
    case 'orthographe':
      return formater(t.feuilles_korrigieren, { fautif: element.mot.fautif });
  }
}

/**
 * Ce que l'écran montre d'une option, de la réponse attendue ou de la réponse donnée : « Richtig »
 * ou « Falsch » pour un vrai/faux, dont le domaine ne connaît que les codes (F1-D7). Le texte d'une
 * autre question reste tel quel, même tapé.
 */
export function libelleDe(question: QuestionExamen, texte: string, t: Textes): string {
  return question.genre === 'feuille' && question.element.genre === 'vrai-faux'
    ? libelleDOption(texte, t)
    : texte;
}
