import { egalOrthographe } from '../feuilles/correction.js';
import {
  type Analyse,
  controlerDistracteurs,
  type Ecrit,
  etatHerite,
  etatPropre,
  noterIdentifiant,
  signaler,
  signalerDoublons,
} from './analyse-commun.js';
import { MARQUE_DE_TROU, morceauxDePhrase } from './feuille.js';
import type { Etat, ModuleFeuille, Statut, Tache } from './modele.js';
import { messagesDExplication } from './schemas.js';

type TacheEcrite = Ecrit<'feuille'>['parties'][number]['taches'][number];
/** Un élément de feuille tel qu'il est écrit : son identifiant, et peut-être son état. */
type ElementEcrit = { id: string; statut?: Statut; verifie_le?: string };

/** Une feuille : chaque élément de ses tâches prend son statut s'il n'a pas le sien (F1-D2). */
export function resoudreFeuille(
  analyse: Analyse,
  fichier: string,
  ecrit: Ecrit<'feuille'>,
): ModuleFeuille {
  const parent = etatPropre(ecrit.statut, ecrit.verifie_le);
  return {
    type: 'feuille',
    id: ecrit.id,
    fichier,
    numero: ecrit.numero,
    titre: ecrit.titre,
    parties: ecrit.parties.map((partie, rang) => ({
      titre: partie.titre,
      taches: partie.taches.map((tache, n) =>
        resoudreTache(analyse, fichier, tache, `parties[${rang}].taches[${n}]`, parent),
      ),
    })),
  };
}

/**
 * Les éléments d'une tâche, à `lieu(rang)` : l'identifiant de chacun est noté pour le verrou, et
 * chacun prend l'état de la feuille s'il n'a pas le sien.
 */
function resoudreElements<E extends ElementEcrit, R>(
  analyse: Analyse,
  fichier: string,
  ecrits: readonly E[],
  lieu: (rang: number) => string,
  parent: Etat,
  champs: (ecrit: E, rang: number) => R,
): ({ id: string } & R & Etat)[] {
  return ecrits.map((ecrit, rang) => {
    noterIdentifiant(analyse, ecrit.id, fichier, `${lieu(rang)}.id`);
    return { id: ecrit.id, ...champs(ecrit, rang), ...etatHerite(ecrit, parent) };
  });
}

/** La clé `explication` d'un élément, seulement si elle est écrite (M10-D2). */
function avecExplication(explication: string | undefined): { explication?: string } {
  return explication === undefined ? {} : { explication };
}

/**
 * Les explications des distracteurs d'une question, `lieu` étant celui de la question. Une clé
 * qui ne nomme aucun distracteur, ou dont la valeur est refusée, est signalée au rang où le YAML
 * l'écrit : une clé est un texte du cours, et aucun message ne le cite (M10-D2). Ne garde que les
 * entrées admises, dans l'ordre écrit, et rend `undefined` s'il n'en reste aucune.
 */
function explicationsAdmises(
  analyse: Analyse,
  fichier: string,
  ecrit: { distracteurs: readonly string[]; explications_distracteurs?: Record<string, unknown> },
  lieu: string,
): Readonly<Record<string, string>> | undefined {
  const ecrites = ecrit.explications_distracteurs;
  if (ecrites === undefined) return undefined;
  const lieuDeLObjet = `${lieu}.explications_distracteurs`;
  const cles = Object.keys(ecrites);
  if (cles.length === 0) {
    signaler(
      analyse,
      fichier,
      lieuDeLObjet,
      "Aucune explication de distracteur : l'objet est vide.",
    );
    return undefined;
  }
  // L'objet lu range les clés entières d'abord : l'ordre écrit vient de l'arbre YAML.
  const ordre = analyse.ordreDesCles.get(`${fichier}:${lieuDeLObjet}`) ?? cles;
  const admises: [string, string][] = [];
  ordre.forEach((cle, rang) => {
    const lieuDeLaCle = `${lieuDeLObjet}[${rang}]`;
    if (!ecrit.distracteurs.includes(cle)) {
      signaler(
        analyse,
        fichier,
        lieuDeLaCle,
        'Cette clé ne nomme aucun distracteur de la question.',
      );
      return;
    }
    const messages = messagesDExplication(ecrites[cle]);
    for (const message of messages) signaler(analyse, fichier, lieuDeLaCle, message);
    if (messages.length === 0) admises.push([cle, ecrites[cle] as string]);
  });
  return admises.length === 0 ? undefined : Object.fromEntries(admises);
}

/** Une tâche et les règles de son genre. Les messages situent l'élément sans citer son texte. */
function resoudreTache(
  analyse: Analyse,
  fichier: string,
  tache: TacheEcrite,
  lieu: string,
  parent: Etat,
): Tache {
  noterIdentifiant(analyse, tache.id, fichier, `${lieu}.id`);
  const { id, consigne } = tache;
  const resoudre = <E extends ElementEcrit, R>(
    cle: string,
    ecrits: readonly E[],
    champs: (ecrit: E, rang: number) => R,
  ) =>
    resoudreElements(analyse, fichier, ecrits, (rang) => `${lieu}.${cle}[${rang}]`, parent, champs);
  /** Signale chaque `champ` déjà vu parmi les `elements` de la liste `cle`. */
  const doublons = <C extends string>(
    cle: string,
    elements: readonly Record<NoInfer<C>, string>[],
    champ: C,
    nom: string,
  ) => {
    const valeurs = elements.map((element) => element[champ]);
    signalerDoublons(analyse, fichier, valeurs, (rang) => `${lieu}.${cle}[${rang}].${champ}`, nom);
  };

  switch (tache.genre) {
    case 'appariement': {
      const paires = resoudre('paires', tache.paires, ({ terme, cible, explication }) => ({
        terme,
        cible,
        ...avecExplication(explication),
      }));
      doublons('paires', paires, 'terme', 'Terme');
      doublons('paires', paires, 'cible', 'Cible');
      return { id, genre: 'appariement', consigne, paires };
    }
    case 'classement': {
      const elements = resoudre('elements', tache.elements, ({ terme, categorie }) => ({
        terme,
        categorie,
      }));
      doublons('elements', elements, 'terme', 'Terme');
      signalerDoublons(
        analyse,
        fichier,
        tache.categories,
        (rang) => `${lieu}.categories[${rang}]`,
        'Catégorie',
      );
      elements.forEach((element, rang) => {
        if (!tache.categories.includes(element.categorie)) {
          signaler(
            analyse,
            fichier,
            `${lieu}.elements[${rang}].categorie`,
            'Catégorie inconnue : absente des categories de la tâche.',
          );
        }
      });
      return { id, genre: 'classement', consigne, categories: tache.categories, elements };
    }
    case 'qcm': {
      const questions = resoudre('questions', tache.questions, (ecrit, rang) => {
        const distracteurs = explicationsAdmises(
          analyse,
          fichier,
          ecrit,
          `${lieu}.questions[${rang}]`,
        );
        return {
          question: ecrit.question,
          reponse: ecrit.reponse,
          distracteurs: ecrit.distracteurs,
          ...avecExplication(ecrit.explication),
          ...(distracteurs === undefined ? {} : { explicationsDistracteurs: distracteurs }),
        };
      });
      questions.forEach((question, rang) => {
        controlerDistracteurs(analyse, fichier, question, `${lieu}.questions[${rang}]`);
      });
      return { id, genre: 'qcm', consigne, questions };
    }
    case 'vrai-faux': {
      const affirmations = resoudre('affirmations', tache.affirmations, (ecrit) => ({
        affirmation: ecrit.affirmation,
        vrai: ecrit.vrai,
        ...(ecrit.correction === undefined ? {} : { correction: ecrit.correction }),
      }));
      return { id, genre: 'vrai-faux', consigne, affirmations };
    }
    case 'trous': {
      const phrases = resoudre('phrases', tache.phrases, ({ texte, reponses, explication }) => ({
        texte,
        reponses,
        ...avecExplication(explication),
      }));
      if (tache.liste !== undefined) {
        const lieuDuMot = (rang: number) => `${lieu}.liste[${rang}]`;
        signalerDoublons(analyse, fichier, tache.liste, lieuDuMot, 'Mot de la liste');
      }
      phrases.forEach((phrase, rang) => {
        controlerTrous(analyse, fichier, phrase, tache.liste, `${lieu}.phrases[${rang}]`);
      });
      return {
        id,
        genre: 'trous',
        consigne,
        ...(tache.liste === undefined ? {} : { liste: tache.liste }),
        phrases,
      };
    }
    case 'orthographe': {
      const mots = resoudre('mots', tache.mots, ({ fautif, reponse }) => ({ fautif, reponse }));
      mots.forEach((mot, rang) => {
        if (egalOrthographe(mot.fautif, mot.reponse)) {
          signaler(
            analyse,
            fichier,
            `${lieu}.mots[${rang}].fautif`,
            'La forme fautive est égale à la réponse : il ne reste rien à corriger.',
          );
        }
      });
      return { id, genre: 'orthographe', consigne, mots };
    }
    case 'ouverte': {
      const questions = resoudre('questions', tache.questions, ({ question, reponse }) => ({
        question,
        reponse,
      }));
      return { id, genre: 'ouverte', consigne, questions };
    }
    default: {
      // Un nouveau genre de tâche doit être résolu ici : TypeScript refuse l'oubli.
      const _exhaustif: never = tache;
      return _exhaustif;
    }
  }
}

/**
 * Une phrase a autant de trous que de réponses, et au moins un (le schéma exige une réponse). Un
 * trou s'écrit avec exactement trois tirets bas : une suite de quatre ou plus se lirait comme un
 * trou collé à un tiret bas. Avec une liste de mots, chaque réponse en est un, à l'identique
 * (F1-D4, F1-D5).
 */
function controlerTrous(
  analyse: Analyse,
  fichier: string,
  phrase: { texte: string; reponses: readonly string[] },
  liste: readonly string[] | undefined,
  lieu: string,
): void {
  if (/_{4,}/.test(phrase.texte)) {
    signaler(
      analyse,
      fichier,
      `${lieu}.texte`,
      `Suite de 4 tirets bas ou plus : un trou s'écrit avec exactement trois (${MARQUE_DE_TROU}).`,
    );
  }
  const trous = morceauxDePhrase(phrase.texte).length - 1;
  const reponses = phrase.reponses.length;
  if (trous !== reponses) {
    signaler(
      analyse,
      fichier,
      `${lieu}.reponses`,
      `${trous} ${trous > 1 ? 'trous' : 'trou'} (${MARQUE_DE_TROU}) pour ${reponses} ${reponses > 1 ? 'réponses' : 'réponse'} : il en faut autant.`,
    );
  }
  phrase.reponses.forEach((reponse, rang) => {
    if (liste !== undefined && !liste.includes(reponse)) {
      signaler(
        analyse,
        fichier,
        `${lieu}.reponses[${rang}]`,
        'Réponse absente de la liste de mots de la tâche.',
      );
    }
  });
}
