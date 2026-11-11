import * as z from 'zod';
import type { ErreurContenu } from './erreurs.js';
import { estIdentifiant, REGLE_IDENTIFIANT } from './identifiants.js';
import type { Statut } from './modele.js';

/*
 * Les schémas des fichiers du format 1, tels qu'ils sont écrits (clés en snake_case). Ils sont
 * stricts : toute clé inconnue est refusée, et un texte doit être une chaîne YAML. Rien n'est
 * converti : `recto: 1.0` est un nombre, donc une erreur.
 *
 * Ils portent les règles qui ne regardent qu'une valeur ou qu'un objet. Les règles qui comparent
 * des éléments entre eux sont dans `analyse.ts`.
 */

const identifiant = z.string().refine(estIdentifiant, {
  error: `Identifiant mal formé : attendu ${REGLE_IDENTIFIANT}.`,
});

function estDate(texte: string): boolean {
  const morceaux = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texte);
  if (!morceaux) return false;
  const [annee, mois, jour] = morceaux.slice(1).map(Number);
  const date = new Date(Date.UTC(annee, mois - 1, jour));
  return (
    date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour
  );
}

/** Une date qui existe, `AAAA-MM-JJ`. Celle de `notice.yaml` aussi (`notice.ts`). */
export const date = z.string().refine(estDate, {
  error: 'Date invalide : attendu une date qui existe, au format AAAA-MM-JJ.',
});

const entierPositif = z.int().positive({ error: 'Attendu un nombre entier positif.' });

/** Facultatif ; s'il est écrit, il n'est pas vide (un texte fait d'espaces est vide). */
function texteFacultatif(message: string) {
  return z
    .string()
    .refine((texte) => texte.trim() !== '', { error: message })
    .optional();
}

const description = texteFacultatif('La description est vide.');
const consigne = texteFacultatif('La consigne est vide.');

/** Une part de réponses justes : de 0 (exclu) à 1. */
const partReussie = z.number().refine((valeur) => valeur > 0 && valeur <= 1, {
  error: 'Attendu un nombre entre 0 (exclu) et 1.',
});

const statut = z.enum(['source', 'à vérifier', 'vérifié']);

/** Un élément qui a un `id` peut surcharger le statut de son module. */
const etatFacultatif = { statut: statut.optional(), verifie_le: date.optional() };
const etatDuModule = { statut, verifie_le: date.optional() };

/** `vérifié` exige `verifie_le`, et `verifie_le` n'est admis qu'avec `vérifié`, dans le même objet. */
function controlerStatut(objet: { statut?: Statut; verifie_le?: string }, ctx: z.RefinementCtx) {
  if (objet.statut === 'vérifié' && objet.verifie_le === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['statut'],
      message: 'Le statut « vérifié » exige verifie_le (AAAA-MM-JJ).',
    });
  } else if (objet.statut !== 'vérifié' && objet.verifie_le !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['verifie_le'],
      message: "verifie_le n'est admis qu'avec le statut « vérifié ».",
    });
  }
}

const texteDeCarte = z
  .string()
  .min(1, { error: 'Le texte est vide.' })
  .refine((texte) => !/^\s|\s$/.test(texte), {
    error: 'Le texte commence ou finit par un espace.',
  })
  .refine((texte) => !/[\t\n\r]/.test(texte), {
    error: 'Le texte contient une tabulation ou un saut de ligne.',
  });

const carte = z
  .strictObject({
    id: identifiant,
    type: z.string(),
    recto: texteDeCarte,
    verso: texteDeCarte,
    reponses: z
      .array(z.string().min(1, { error: 'Le texte est vide.' }))
      .min(1, { error: 'La liste est vide.' })
      .optional(),
    ...etatFacultatif,
  })
  .superRefine(controlerStatut);

const moduleCartes = z
  .strictObject({
    type: z.literal('cartes'),
    id: identifiant,
    numero: entierPositif,
    titre: z.string(),
    ...etatDuModule,
    cartes: z.array(carte),
  })
  .superRefine(controlerStatut);

const morpheme = z
  .strictObject({
    id: identifiant,
    categorie: z.enum(['p', 's', 'x']),
    forme: z.string(),
    sens: z.string(),
    ...etatFacultatif,
  })
  .superRefine(controlerStatut);

const mot = z
  .strictObject({
    id: identifiant,
    mot: z.string(),
    segments: z.array(z.strictObject({ texte: z.string(), morpheme: identifiant })),
    sens: z.string(),
    ...etatFacultatif,
  })
  .superRefine(controlerStatut);

const moduleMorphologie = z
  .strictObject({
    type: z.literal('morphologie'),
    id: identifiant,
    titre: z.string(),
    description,
    ...etatDuModule,
    chapitres: z.array(identifiant),
    morphemes: z.array(morpheme),
    mots: z.array(mot),
  })
  .superRefine(controlerStatut);

/** Les points héritent toujours du statut de leur schéma. */
const point = z.strictObject({
  id: identifiant,
  x: z.number(),
  y: z.number(),
  terme: z.string(),
  sens: z.string(),
});

const moduleSchema = z
  .strictObject({
    type: z.literal('schema'),
    id: identifiant,
    titre: z.string(),
    description,
    ...etatDuModule,
    dessin: z.string(),
    note: z.string(),
    points: z.array(point),
  })
  .superRefine(controlerStatut);

const distracteurs = z.array(z.string()).length(3, { error: 'Attendu exactement 3 distracteurs.' });

/** Les questions héritent toujours du statut de leur texte. */
const question = z.strictObject({
  id: identifiant,
  question: z.string(),
  reponse: z.string(),
  distracteurs,
});

const texteAnnote = z
  .strictObject({
    id: identifiant,
    titre: z.string(),
    texte: z.string(),
    questions: z.array(question),
    ...etatFacultatif,
  })
  .superRefine(controlerStatut);

const moduleTexteAnnote = z
  .strictObject({
    type: z.literal('texte-annote'),
    id: identifiant,
    titre: z.string(),
    description,
    ...etatDuModule,
    consigne,
    reussite: partReussie,
    textes: z.array(texteAnnote),
  })
  .superRefine(controlerStatut);

const exercice = z
  .strictObject({
    id: identifiant,
    invite: z.string(),
    reponse: z.string(),
    options: z.array(z.string()).optional(),
    regle: z.string().optional(),
    ...etatFacultatif,
  })
  .superRefine(controlerStatut);

const famille = z.strictObject({
  code: z.string(),
  libelle: z.string(),
  options: z.array(z.string()).optional(),
  regle: z.string().optional(),
  exercices: z.array(exercice),
});

const moduleExercices = z
  .strictObject({
    type: z.literal('exercices'),
    id: identifiant,
    titre: z.string(),
    description,
    ...etatDuModule,
    familles: z.array(famille),
  })
  .superRefine(controlerStatut);

/*
 * Les éléments d'une feuille : chacun a son identifiant, et peut surcharger le statut de la
 * feuille (F1-D2).
 */
const paireAppariee = z
  .strictObject({ id: identifiant, terme: z.string(), cible: z.string(), ...etatFacultatif })
  .superRefine(controlerStatut);

const elementAClasser = z
  .strictObject({ id: identifiant, terme: z.string(), categorie: z.string(), ...etatFacultatif })
  .superRefine(controlerStatut);

const questionAChoix = z
  .strictObject({
    id: identifiant,
    question: z.string(),
    reponse: z.string(),
    distracteurs,
    ...etatFacultatif,
  })
  .superRefine(controlerStatut);

const affirmation = z
  .strictObject({
    id: identifiant,
    affirmation: z.string(),
    vrai: z.boolean(),
    correction: z.string().optional(),
    ...etatFacultatif,
  })
  .superRefine(controlerStatut);

const phraseATrous = z
  .strictObject({
    id: identifiant,
    texte: z.string(),
    reponses: z.array(z.string()).min(1, { error: 'Attendu au moins une réponse.' }),
    ...etatFacultatif,
  })
  .superRefine(controlerStatut);

const motACorriger = z
  .strictObject({ id: identifiant, fautif: z.string(), reponse: z.string(), ...etatFacultatif })
  .superRefine(controlerStatut);

const questionOuverte = z
  .strictObject({ id: identifiant, question: z.string(), reponse: z.string(), ...etatFacultatif })
  .superRefine(controlerStatut);

/** Une tâche sans élément n'a rien à faire faire. */
function listeDElements<Element extends z.ZodType>(element: Element) {
  return z.array(element).min(1, { error: 'La tâche est vide : attendu au moins un élément.' });
}

/** Une tâche a un identifiant et une consigne, mais pas de statut (F1-D2). */
const tacheCommune = { id: identifiant, consigne: z.string() };

const tache = z.discriminatedUnion(
  'genre',
  [
    z.strictObject({
      ...tacheCommune,
      genre: z.literal('appariement'),
      paires: listeDElements(paireAppariee),
    }),
    z.strictObject({
      ...tacheCommune,
      genre: z.literal('classement'),
      categories: z.array(z.string()),
      elements: listeDElements(elementAClasser),
    }),
    z.strictObject({
      ...tacheCommune,
      genre: z.literal('qcm'),
      questions: listeDElements(questionAChoix),
    }),
    z.strictObject({
      ...tacheCommune,
      genre: z.literal('vrai-faux'),
      affirmations: listeDElements(affirmation),
    }),
    z.strictObject({
      ...tacheCommune,
      genre: z.literal('trous'),
      liste: z.array(z.string()).optional(),
      phrases: listeDElements(phraseATrous),
    }),
    z.strictObject({
      ...tacheCommune,
      genre: z.literal('orthographe'),
      mots: listeDElements(motACorriger),
    }),
    z.strictObject({
      ...tacheCommune,
      genre: z.literal('ouverte'),
      questions: listeDElements(questionOuverte),
    }),
  ],
  {
    error:
      'Genre de tâche inconnu : attendu « appariement », « classement », « qcm », « vrai-faux », « trous », « orthographe » ou « ouverte ».',
  },
);

const moduleFeuille = z
  .strictObject({
    type: z.literal('feuille'),
    id: identifiant,
    numero: entierPositif,
    titre: z.string(),
    ...etatDuModule,
    parties: z
      .array(
        z.strictObject({
          titre: z.string(),
          taches: z
            .array(tache)
            .min(1, { error: 'La partie est vide : attendu au moins une tâche.' }),
        }),
      )
      .min(1, { error: 'La feuille est vide : attendu au moins une partie.' }),
  })
  .superRefine(controlerStatut);

/** Des entiers positifs, chacun plus grand que le précédent. */
const taillesCroissantes = z
  .array(entierPositif)
  .min(1, { error: 'Attendu au moins une taille.' })
  .superRefine((tailles, ctx) => {
    tailles.forEach((taille, rang) => {
      if (rang > 0 && taille <= tailles[rang - 1]) {
        ctx.addIssue({
          code: 'custom',
          path: [rang],
          message: 'Les tailles doivent croître strictement.',
        });
      }
    });
  });

const seuilDeTirage = z
  .number()
  .refine((valeur) => valeur >= 0 && valeur <= 1, { error: 'Attendu un nombre entre 0 et 1.' });

/**
 * Les quatre premiers seuils se cumulent : `schema` ≤ `texte` ≤ `exercice` ≤ `feuille`, et les
 * trois derniers aussi : `mot` ≤ `direct` ≤ `a_taper`.
 * `feuille` est obligatoire ici ; seule la forme servie s'en passe (F1-D6).
 */
const tirage = z
  .strictObject({
    schema: seuilDeTirage,
    texte: seuilDeTirage,
    exercice: seuilDeTirage,
    feuille: seuilDeTirage,
    mot: seuilDeTirage,
    direct: seuilDeTirage,
    a_taper: seuilDeTirage,
  })
  .superRefine((seuils, ctx) => {
    const message = 'Les seuils du tirage se cumulent : schema ≤ texte ≤ exercice ≤ feuille.';
    if (seuils.schema > seuils.texte) ctx.addIssue({ code: 'custom', path: ['texte'], message });
    if (seuils.texte > seuils.exercice) {
      ctx.addIssue({ code: 'custom', path: ['exercice'], message });
    }
    if (seuils.exercice > seuils.feuille) {
      ctx.addIssue({ code: 'custom', path: ['feuille'], message });
    }
    const messageDeLaFin = 'Les seuils de la fin du tirage se cumulent : mot ≤ direct ≤ a_taper.';
    if (seuils.mot > seuils.direct) {
      ctx.addIssue({ code: 'custom', path: ['direct'], message: messageDeLaFin });
    }
    if (seuils.direct > seuils.a_taper) {
      ctx.addIssue({ code: 'custom', path: ['a_taper'], message: messageDeLaFin });
    }
  });

/** Les réglages de l'examen : pas de statut, ce n'est pas un contenu à relire. */
const moduleExamen = z
  .strictObject({
    type: z.literal('examen'),
    id: identifiant,
    titre: z.string(),
    tailles: taillesCroissantes,
    taille_par_defaut: z.int(),
    secondes_par_question: entierPositif,
    minutes_minimum: entierPositif,
    note_suffisante: z
      .number()
      .refine((note) => note >= 1 && note <= 6, { error: 'Attendu un nombre entre 1 et 6.' }),
    seuil_chapitre: partReussie,
    tirage,
  })
  .superRefine((examen, ctx) => {
    if (!examen.tailles.includes(examen.taille_par_defaut)) {
      ctx.addIssue({
        code: 'custom',
        path: ['taille_par_defaut'],
        message: 'La taille par défaut ne figure pas parmi les tailles.',
      });
    }
  });

export const schemaDeModule = z.discriminatedUnion(
  'type',
  [
    moduleCartes,
    moduleMorphologie,
    moduleSchema,
    moduleTexteAnnote,
    moduleExercices,
    moduleFeuille,
    moduleExamen,
  ],
  {
    error:
      'Type de module inconnu : attendu « cartes », « morphologie », « schema », « texte-annote », « exercices », « feuille » ou « examen ».',
  },
);

/**
 * La dérogation écrite qui ouvre à un groupe un cours « à vérifier » (invariant 9, ADR-0001). Le
 * motif dit pourquoi, la date quand : un motif qui ne contient que des espaces n'en est pas un.
 */
const derogationDiffusion = z.strictObject({
  motif: z.string().refine((texte) => texte.trim() !== '', { error: 'Le motif est vide.' }),
  date,
});

/**
 * Six entiers, un par boîte de 0 à 5 : le premier, celui de la boîte 0 (les cartes neuves), vaut 0,
 * puis aucun n'est plus petit que le précédent (deux intervalles égaux sont permis). Le premier
 * n'est jamais lu : une réponse juste mène au moins en boîte 1, et une carte neuve n'est jamais
 * due (`estDue`).
 */
const intervallesDeLeitner = z
  .array(z.int())
  .length(6, { error: 'Attendu exactement 6 intervalles, un par boîte.' })
  .superRefine((intervalles, ctx) => {
    if (intervalles.length > 0 && intervalles[0] !== 0) {
      ctx.addIssue({
        code: 'custom',
        path: [0],
        message: 'Le premier intervalle, celui de la boîte 0 (les cartes neuves), vaut 0.',
      });
    }
    intervalles.forEach((jours, rang) => {
      if (rang > 0 && jours < intervalles[rang - 1]) {
        ctx.addIssue({
          code: 'custom',
          path: [rang],
          message: 'Les intervalles ne peuvent pas décroître.',
        });
      }
    });
  });

const reglagesLeitner = z.strictObject({
  intervalles: intervallesDeLeitner,
  nouvelles_par_seance: z
    .int()
    .min(1, { error: 'Attendu un nombre entier entre 1 et 100.' })
    .max(100, { error: 'Attendu un nombre entier entre 1 et 100.' }),
});

const MESSAGE_DE_RETENTION = 'Attendu un nombre entre 0,80 et 0,95.';

const reglagesMemoire = z.strictObject({
  // Absent, une énumération signale une valeur non admise : on y rend le message « obligatoire ».
  algorithme: z.enum(['leitner', 'fsrs'], {
    error: (issue) => (issue.input === undefined ? 'Champ obligatoire absent.' : undefined),
  }),
  retention: z
    .number()
    .min(0.8, { error: MESSAGE_DE_RETENTION })
    .max(0.95, { error: MESSAGE_DE_RETENTION })
    .default(0.9),
});

export const schemaDeCours = z.strictObject({
  format: z.literal(1),
  id: identifiant,
  titre: z.string(),
  langue: z.string(),
  types_de_carte: z.record(z.string(), z.string()),
  leitner: reglagesLeitner,
  memoire: reglagesMemoire.optional(),
  derogation_diffusion: derogationDiffusion.optional(),
  modules: z.array(z.string()),
});

export type CoursEcrit = z.infer<typeof schemaDeCours>;
export type ModuleEcrit = z.infer<typeof schemaDeModule>;

const ATTENDUS: Record<string, string> = {
  string: 'un texte entre guillemets',
  number: 'un nombre',
  int: 'un nombre entier',
  object: 'des clés et leurs valeurs',
  record: 'des clés et leurs valeurs',
  array: 'une liste',
  boolean: 'un booléen (true ou false, sans guillemets)',
};

function nature(valeur: unknown): string {
  if (valeur === null) return 'une valeur vide';
  if (Array.isArray(valeur)) return 'une liste';
  switch (typeof valeur) {
    case 'string':
      return 'un texte';
    case 'number':
      return 'un nombre';
    case 'boolean':
      return 'un booléen';
    case 'object':
      return 'des clés et leurs valeurs';
    default:
      return typeof valeur;
  }
}

/** Les messages de zod en français, sans jamais citer le texte du cours. */
const enFrancais: z.core.$ZodErrorMap = (issue) => {
  switch (issue.code) {
    case 'invalid_type':
      return issue.input === undefined
        ? 'Champ obligatoire absent.'
        : `Attendu ${ATTENDUS[issue.expected] ?? issue.expected}, trouvé ${nature(issue.input)}.`;
    case 'invalid_value':
      return `Valeur non admise : attendu ${issue.values
        .map((valeur) => (typeof valeur === 'string' ? `« ${valeur} »` : String(valeur)))
        .join(' ou ')}.`;
    default:
      return undefined;
  }
};

/** `['cartes', 12, 'recto']` donne `cartes[12].recto`. */
export function lieuDe(chemin: readonly PropertyKey[]): string {
  let lieu = '';
  for (const cle of chemin) {
    if (typeof cle === 'number') lieu += `[${cle}]`;
    else lieu += lieu === '' ? String(cle) : `.${String(cle)}`;
  }
  return lieu;
}

function versErreurs(issue: z.core.$ZodIssue, fichier: string): ErreurContenu[] {
  if (issue.code === 'unrecognized_keys') {
    return issue.keys.map((cle) => ({
      fichier,
      lieu: lieuDe([...issue.path, cle]),
      message: "Clé inconnue : le format 1 ne l'admet pas ici.",
    }));
  }
  return [{ fichier, lieu: lieuDe(issue.path), message: issue.message }];
}

/**
 * Valide les données lues dans `fichier`. En cas d'échec, ajoute les erreurs à `erreurs` (une par
 * clé inconnue) et rend `undefined`.
 */
export function valider<T>(
  schema: z.ZodType<T>,
  donnees: unknown,
  fichier: string,
  erreurs: ErreurContenu[],
): T | undefined {
  const resultat = schema.safeParse(donnees, { error: enFrancais });
  if (resultat.success) return resultat.data;
  erreurs.push(...resultat.error.issues.flatMap((issue) => versErreurs(issue, fichier)));
  return undefined;
}
