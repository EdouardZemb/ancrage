import {
  type Document,
  type ErrorCode,
  isPair,
  isScalar,
  isSeq,
  LineCounter,
  parseDocument,
  visit,
} from 'yaml';
import type { ZodType } from 'zod';
import type { ValeursDeNotice } from '../notice.js';
import {
  type Analyse,
  aDesDoublons,
  controlerDistracteurs,
  type Ecrit,
  etatHerite,
  etatPropre,
  noterIdentifiant,
  signaler,
  signalerDoublons,
} from './analyse-commun.js';
import { resoudreFeuille } from './analyse-feuilles.js';
import { defautsDuDessin, lireDessin } from './dessin.js';
import type { ErreurContenu } from './erreurs.js';
import { estIdentifiant } from './identifiants.js';
import type {
  Carte,
  Cours,
  Exercice,
  FamilleExercices,
  Module,
  ModuleCartes,
  ModuleExamen,
  ModuleExercices,
  ModuleMorphologie,
  ModuleSchema,
  ModuleTexteAnnote,
  Morpheme,
  Mot,
  PointDeSchema,
  Question,
  ResultatContenus,
  TexteAnnote,
} from './modele.js';
import { FICHIER_NOTICE, schemaDeNotice, valeursDeNotice } from './notice.js';
import {
  type CoursEcrit,
  lieuDe,
  type ModuleEcrit,
  schemaDeCours,
  schemaDeModule,
  valider,
} from './schemas.js';
import { analyserTexte } from './texte-annote.js';
import { FICHIER_VERROU, lireVerrou, verifierVerrou } from './verrou.js';

/** Distance minimale entre un point de schéma et le bord du cadre. */
const MARGE = 8;
/** Distance minimale entre deux points d'un même schéma. */
const ECART_MINIMAL = 19;
/**
 * Les types dont un cours n'a qu'un module au plus : le client en tire un onglet chacun
 * (décision 19 du lot 1d). Les cartes (un module par chapitre) et les schémas sont plusieurs.
 */
const TYPES_DE_MODULE_UNIQUES: ReadonlySet<string> = new Set([
  'morphologie',
  'texte-annote',
  'exercices',
  'examen',
]);
/** Le seul fichier ignoré du contenu, à sa racine ; seul, il ne fait pas un contenu (S1-D3). */
export const FICHIER_LISEZMOI = 'README.md';
const VIEWBOX = /^-?\d+(?:\.\d+)? -?\d+(?:\.\d+)? (-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)$/;

/**
 * Lit et valide tout un dossier de contenu. Les clés de `fichiers` sont les chemins relatifs à ce
 * dossier, avec `/`, et les valeurs le texte des fichiers. Les cours et la notice ne sont
 * utilisables que si `erreurs` est vide.
 */
export function analyserContenus(fichiers: ReadonlyMap<string, string>): ResultatContenus {
  const analyse: Analyse = { fichiers, erreurs: [], identifiants: new Map(), complet: true };
  const cours: Cours[] = [];

  for (const [dossier, chemins] of repartirParDossier(analyse)) {
    const lu = analyserCours(analyse, dossier, chemins);
    if (lu) cours.push(lu);
  }
  const notice = lireNotice(analyse);
  controlerVerrou(analyse);

  return {
    cours,
    erreurs: analyse.erreurs,
    identifiants: analyse.identifiants,
    ...(notice === undefined ? {} : { notice }),
  };
}

/** Les fichiers admis à la racine du contenu, hors des dossiers de cours. */
const FICHIERS_DE_LA_RACINE: ReadonlySet<string> = new Set([
  FICHIER_VERROU,
  FICHIER_NOTICE,
  FICHIER_LISEZMOI,
]);

/**
 * Range les fichiers par dossier de premier niveau. À la racine, `ids.lock` et `notice.yaml` sont
 * admis, et un `README.md`, ignoré : le gabarit du dépôt de données en sème un.
 */
function repartirParDossier(analyse: Analyse): Map<string, string[]> {
  const parDossier = new Map<string, string[]>();
  for (const chemin of [...analyse.fichiers.keys()].sort()) {
    const separateur = chemin.indexOf('/');
    if (separateur === -1) {
      if (!FICHIERS_DE_LA_RACINE.has(chemin)) {
        signaler(
          analyse,
          chemin,
          '',
          'Fichier non admis à la racine du contenu : seuls ids.lock, notice.yaml et README.md y ont leur place.',
        );
      }
      continue;
    }
    const dossier = chemin.slice(0, separateur);
    const chemins = parDossier.get(dossier) ?? [];
    chemins.push(chemin);
    parDossier.set(dossier, chemins);
  }
  return parDossier;
}

/**
 * Texte français de chaque problème de syntaxe YAML courant, par code. Le message de la
 * bibliothèque n'est jamais repris : il cite parfois le source (étiquette, en-tête de bloc), donc
 * un texte de cours, et le journal de démarrage n'en doit contenir aucun (invariant 1).
 */
const MESSAGES_YAML: Partial<Record<ErrorCode, string>> = {
  BAD_DIRECTIVE: 'directive inconnue',
  BAD_DQ_ESCAPE: "séquence d'échappement invalide dans un texte entre guillemets",
  BAD_INDENT: 'indentation incohérente',
  BLOCK_AS_IMPLICIT_KEY: 'mappage imbriqué sur une seule ligne',
  DUPLICATE_KEY: 'clé en double',
  MISSING_CHAR: 'caractère attendu manquant (guillemet, deux-points, virgule ou crochet)',
  MULTIPLE_DOCS: 'plusieurs documents dans un même fichier',
  TAB_AS_INDENT: 'tabulation utilisée comme indentation',
  TAG_RESOLVE_FAILED: 'étiquette YAML inconnue',
  UNEXPECTED_TOKEN: 'élément inattendu',
};

const MESSAGE_GUILLEMETS = 'Écriture non admise : texte à écrire entre guillemets doubles.';

function messageYaml(code: ErrorCode): string {
  return `YAML invalide : ${MESSAGES_YAML[code] ?? 'erreur de syntaxe'} (${code}).`;
}

/**
 * Les textes s'écrivent toujours entre guillemets doubles : sans eux, un `#` ouvre un commentaire
 * (`Teil #des Musterorgans` serait lu `Teil`), sans erreur. Seules les valeurs lues comme des
 * chaînes sont concernées : une clé s'écrit comme on veut, et un nombre, un booléen ou une valeur
 * vide ne sont pas des textes (le schéma les refuse là où un texte est attendu). Le message ne cite
 * pas la valeur (invariant 1). Rend le nombre d'erreurs signalées.
 */
function controlerGuillemets(
  analyse: Analyse,
  fichier: string,
  document: Document.Parsed,
  lignes: LineCounter,
): number {
  let signalees = 0;
  visit(document, {
    Scalar(cle, noeud, ancetres) {
      if (cle === 'key' || typeof noeud.value !== 'string' || noeud.type === 'QUOTE_DOUBLE') return;
      signalees++;
      const chemin: (string | number)[] = [];
      ancetres.forEach((ancetre, rang) => {
        const enfant = ancetres[rang + 1] ?? noeud;
        if (isPair(ancetre) && isScalar(ancetre.key)) {
          chemin.push(String(ancetre.key.value));
        } else if (isSeq(ancetre)) {
          chemin.push(ancetre.items.indexOf(enfant));
        }
      });
      const lieu =
        chemin.length > 0 ? lieuDe(chemin) : `ligne ${lignes.linePos(noeud.range?.[0] ?? 0).line}`;
      signaler(analyse, fichier, lieu, MESSAGE_GUILLEMETS);
    },
  });
  return signalees;
}

function lireYaml(analyse: Analyse, fichier: string): { donnees: unknown } | undefined {
  const lignes = new LineCounter();
  const document = parseDocument(analyse.fichiers.get(fichier) ?? '', {
    uniqueKeys: true,
    prettyErrors: false,
    lineCounter: lignes,
  });
  const problemes = [...document.errors, ...document.warnings];
  for (const probleme of problemes) {
    const { line } = lignes.linePos(probleme.pos[0]);
    signaler(analyse, fichier, `ligne ${line}`, messageYaml(probleme.code));
  }
  if (problemes.length > 0) return undefined;

  // Une valeur sans guillemets peut avoir perdu une partie de son texte (jusqu'au `#`), donc un
  // identifiant : le verrou n'est alors pas confronté au contenu.
  if (controlerGuillemets(analyse, fichier, document, lignes) > 0) analyse.complet = false;

  try {
    return { donnees: document.toJS() };
  } catch {
    // Alias sans ancre ou en nombre excessif. Le message de la bibliothèque cite le nom de l'alias.
    signaler(analyse, fichier, '', 'YAML invalide : alias introuvable ou en nombre excessif.');
    return undefined;
  }
}

/**
 * Une valeur sans guillemets là où le schéma attend autre chose qu'un texte (`numero: abc`) n'a
 * qu'une erreur : celle du schéma, qui dit ce qui est attendu. Le défaut de guillemets, signalé
 * avant (à partir de `debut`), est alors retiré. Il reste dit partout où un texte est attendu.
 */
function retirerGuillemetsRedondants(erreurs: ErreurContenu[], debut: number): void {
  const emplacement = (e: ErreurContenu): string => `${e.fichier} ${e.lieu}`;
  const duSchema = new Set(
    erreurs
      .slice(debut)
      .filter((e) => e.message !== MESSAGE_GUILLEMETS && /, trouvé un texte\.$/.test(e.message))
      .map(emplacement),
  );
  for (let rang = erreurs.length - 1; rang >= debut; rang--) {
    if (erreurs[rang].message === MESSAGE_GUILLEMETS && duSchema.has(emplacement(erreurs[rang]))) {
      erreurs.splice(rang, 1);
    }
  }
}

/** Lit un fichier YAML et le valide. Un échec rend le contenu incomplet. */
function lire<T>(analyse: Analyse, fichier: string, schema: ZodType<T>): T | undefined {
  const avant = analyse.erreurs.length;
  const lu = lireYaml(analyse, fichier);
  const valeur = lu && valider(schema, lu.donnees, fichier, analyse.erreurs);
  retirerGuillemetsRedondants(analyse.erreurs, avant);
  if (valeur === undefined) analyse.complet = false;
  return valeur;
}

function analyserCours(
  analyse: Analyse,
  dossier: string,
  chemins: readonly string[],
): Cours | undefined {
  const fichierCours = `${dossier}/cours.yaml`;
  if (!analyse.fichiers.has(fichierCours)) {
    signaler(
      analyse,
      dossier,
      '',
      'Dossier sans cours.yaml : tout dossier à la racine du contenu est un cours.',
    );
    analyse.complet = false;
    return undefined;
  }
  const ecrit = lire(analyse, fichierCours, schemaDeCours);
  if (!ecrit) return undefined;
  noterIdentifiant(analyse, ecrit.id, fichierCours, 'id');

  const references = new Set([fichierCours]);
  const modulesCites = new Set<string>();
  const modules: Module[] = [];
  /** Faux si un module n'a pas pu être lu : ce qu'il cite, et son identifiant, sont inconnus. */
  let toutLu = true;

  ecrit.modules.forEach((chemin, rang) => {
    const fichier = `${dossier}/${chemin}`;
    const lieu = `modules[${rang}]`;
    if (modulesCites.has(fichier)) {
      signaler(analyse, fichierCours, lieu, 'Module cité deux fois.');
      return;
    }
    modulesCites.add(fichier);
    references.add(fichier);
    if (!analyse.fichiers.has(fichier)) {
      signaler(analyse, fichierCours, lieu, `Module introuvable : ${fichier}.`);
      analyse.complet = false;
      return;
    }
    const module = lire(analyse, fichier, schemaDeModule);
    if (!module) {
      toutLu = false;
      return;
    }
    const resolu = resoudreModule(analyse, fichier, module, ecrit, references);
    if (resolu) modules.push(resolu);
  });

  controlerNumeros(analyse, modules);
  controlerModulesUniques(analyse, modules);
  if (toutLu) {
    controlerChapitres(analyse, modules);
    controlerChapitresDeMemoire(analyse, fichierCours, ecrit.memoire?.chapitres, modules);
    for (const chemin of chemins) {
      if (!references.has(chemin)) {
        signaler(
          analyse,
          chemin,
          '',
          'Fichier non référencé : ni cours.yaml ni un module ne le cite.',
        );
      }
    }
  }

  return {
    id: ecrit.id,
    dossier,
    titre: ecrit.titre,
    langue: ecrit.langue,
    typesDeCarte: ecrit.types_de_carte,
    leitner: {
      intervalles: ecrit.leitner.intervalles,
      nouvellesParSeance: ecrit.leitner.nouvelles_par_seance,
    },
    ...(ecrit.memoire === undefined
      ? {}
      : {
          memoire: {
            algorithme: ecrit.memoire.algorithme,
            retention: ecrit.memoire.retention,
            ...(ecrit.memoire.parametres === undefined
              ? {}
              : { parametres: [...ecrit.memoire.parametres] }),
            ...(ecrit.memoire.examen === undefined ? {} : { examen: ecrit.memoire.examen }),
            ...(ecrit.memoire.chapitres === undefined
              ? {}
              : { chapitres: [...ecrit.memoire.chapitres] }),
          },
        }),
    ...(ecrit.derogation_diffusion === undefined
      ? {}
      : {
          derogationDiffusion: {
            motif: ecrit.derogation_diffusion.motif,
            date: ecrit.derogation_diffusion.date,
          },
        }),
    modules,
  };
}

function resoudreModule(
  analyse: Analyse,
  fichier: string,
  ecrit: ModuleEcrit,
  cours: CoursEcrit,
  references: Set<string>,
): Module | undefined {
  noterIdentifiant(analyse, ecrit.id, fichier, 'id');
  switch (ecrit.type) {
    case 'cartes':
      return resoudreCartes(analyse, fichier, ecrit, cours.types_de_carte);
    case 'morphologie':
      return resoudreMorphologie(analyse, fichier, ecrit);
    case 'schema':
      return resoudreSchema(analyse, fichier, ecrit, references);
    case 'texte-annote':
      return resoudreTextes(analyse, fichier, ecrit);
    case 'exercices':
      return resoudreExercices(analyse, fichier, ecrit);
    case 'feuille':
      return resoudreFeuille(analyse, fichier, ecrit);
    case 'examen':
      return resoudreExamen(fichier, ecrit);
    default: {
      // Un nouveau type de module doit être résolu ici : TypeScript refuse l'oubli.
      const _exhaustif: never = ecrit;
      return _exhaustif;
    }
  }
}

/** La clé `description` n'est dans le modèle que si le module en a une. */
function descriptionDe(ecrit: { description?: string }): { description?: string } {
  return ecrit.description === undefined ? {} : { description: ecrit.description };
}

function resoudreCartes(
  analyse: Analyse,
  fichier: string,
  ecrit: Ecrit<'cartes'>,
  typesDeCarte: Record<string, string>,
): ModuleCartes {
  const parent = etatPropre(ecrit.statut, ecrit.verifie_le);
  const cartes = ecrit.cartes.map((carte, rang): Carte => {
    noterIdentifiant(analyse, carte.id, fichier, `cartes[${rang}].id`);
    if (!Object.hasOwn(typesDeCarte, carte.type)) {
      signaler(
        analyse,
        fichier,
        `cartes[${rang}].type`,
        'Type de carte inconnu : absent de types_de_carte dans cours.yaml.',
      );
    }
    return {
      id: carte.id,
      type: carte.type,
      recto: carte.recto,
      verso: carte.verso,
      ...(carte.reponses === undefined ? {} : { reponses: carte.reponses }),
      ...etatHerite(carte, parent),
    };
  });
  signalerDoublons(
    analyse,
    fichier,
    cartes.map((carte) => carte.recto),
    (rang) => `cartes[${rang}].recto`,
    'Recto',
  );
  return {
    type: 'cartes',
    id: ecrit.id,
    fichier,
    numero: ecrit.numero,
    titre: ecrit.titre,
    cartes,
  };
}

function resoudreMorphologie(
  analyse: Analyse,
  fichier: string,
  ecrit: Ecrit<'morphologie'>,
): ModuleMorphologie {
  const parent = etatPropre(ecrit.statut, ecrit.verifie_le);
  const morphemes = ecrit.morphemes.map((morpheme, rang): Morpheme => {
    noterIdentifiant(analyse, morpheme.id, fichier, `morphemes[${rang}].id`);
    const { id, categorie, forme, sens } = morpheme;
    return { id, categorie, forme, sens, ...etatHerite(morpheme, parent) };
  });
  const connus = new Set(morphemes.map((morpheme) => morpheme.id));

  const mots = ecrit.mots.map((mot, rang): Mot => {
    const lieu = `mots[${rang}]`;
    noterIdentifiant(analyse, mot.id, fichier, `${lieu}.id`);
    mot.segments.forEach((segment, n) => {
      if (!connus.has(segment.morpheme)) {
        signaler(
          analyse,
          fichier,
          `${lieu}.segments[${n}].morpheme`,
          'Morphème inconnu : aucun morphème de ce module ne porte cet identifiant.',
        );
      }
    });
    const recompose = mot.segments.map((segment) => segment.texte).join('');
    if (recompose.toLowerCase() !== mot.mot.toLowerCase()) {
      signaler(
        analyse,
        fichier,
        `${lieu}.segments`,
        'Les segments ne recomposent pas le mot (comparés en minuscules).',
      );
    }
    return {
      id: mot.id,
      mot: mot.mot,
      segments: mot.segments,
      sens: mot.sens,
      ...etatHerite(mot, parent),
    };
  });
  signalerDoublons(
    analyse,
    fichier,
    mots.map((mot) => mot.mot),
    (rang) => `mots[${rang}].mot`,
    'Mot',
  );

  return {
    type: 'morphologie',
    id: ecrit.id,
    fichier,
    titre: ecrit.titre,
    ...descriptionDe(ecrit),
    chapitres: ecrit.chapitres,
    morphemes,
    mots,
  };
}

/** Le schéma n'est rendu que si son dessin a pu être lu. */
function resoudreSchema(
  analyse: Analyse,
  fichier: string,
  ecrit: Ecrit<'schema'>,
  references: Set<string>,
): ModuleSchema | undefined {
  const points = ecrit.points.map((point, rang): PointDeSchema => {
    noterIdentifiant(analyse, point.id, fichier, `points[${rang}].id`);
    const { id, x, y, terme, sens } = point;
    return { id, x, y, terme, sens };
  });
  signalerDoublons(
    analyse,
    fichier,
    points.map((point) => point.terme),
    (rang) => `points[${rang}].terme`,
    'Terme',
  );
  controlerEcarts(analyse, fichier, points);

  const fichierDessin = `${fichier.slice(0, fichier.lastIndexOf('/'))}/${ecrit.dessin}`;
  references.add(fichierDessin);
  const texte = analyse.fichiers.get(fichierDessin);
  if (texte === undefined) {
    signaler(analyse, fichier, 'dessin', `Dessin introuvable : ${fichierDessin}.`);
    return undefined;
  }
  const dessin = lireDessin(texte);
  if (!dessin) {
    signaler(
      analyse,
      fichierDessin,
      '',
      'Le fichier n\'a pas le cadre du format 1 : <svg xmlns="http://www.w3.org/2000/svg" viewBox="…">, un saut de ligne, l\'intérieur, un saut de ligne, </svg> et un saut de ligne final.',
    );
    return undefined;
  }
  controlerBalises(analyse, fichierDessin, dessin.interieur);
  const cadre = VIEWBOX.exec(dessin.viewbox);
  if (cadre) {
    controlerMarges(analyse, fichier, points, Number(cadre[1]), Number(cadre[2]));
  } else {
    signaler(
      analyse,
      fichierDessin,
      'viewBox',
      'La viewBox doit être faite de 4 nombres séparés par une espace.',
    );
  }

  return {
    type: 'schema',
    id: ecrit.id,
    fichier,
    titre: ecrit.titre,
    ...descriptionDe(ecrit),
    ...etatPropre(ecrit.statut, ecrit.verifie_le),
    viewbox: dessin.viewbox,
    dessin: dessin.interieur,
    note: ecrit.note,
    points,
  };
}

function controlerEcarts(analyse: Analyse, fichier: string, points: readonly PointDeSchema[]) {
  for (let j = 1; j < points.length; j++) {
    for (let i = 0; i < j; i++) {
      const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
      if (distance < ECART_MINIMAL) {
        signaler(
          analyse,
          fichier,
          `points[${j}]`,
          `Point trop proche de points[${i}] : distance ${Math.round(distance * 10) / 10}, il en faut au moins ${ECART_MINIMAL}.`,
        );
      }
    }
  }
}

function controlerMarges(
  analyse: Analyse,
  fichier: string,
  points: readonly PointDeSchema[],
  largeur: number,
  hauteur: number,
) {
  points.forEach(({ x, y }, rang) => {
    if (x < MARGE || y < MARGE || x > largeur - MARGE || y > hauteur - MARGE) {
      signaler(
        analyse,
        fichier,
        `points[${rang}]`,
        `Point trop près du bord : il faut ${MARGE} ≤ x ≤ ${largeur - MARGE} et ${MARGE} ≤ y ≤ ${hauteur - MARGE}.`,
      );
    }
  });
}

/**
 * Comme le prototype : autant de `<` que de fermetures `/>` ou `</…>`. Puis, le client insérant le
 * dessin tel quel dans la page, rien qui puisse exécuter du code ou charger une ressource hors du
 * dessin (`defautsDuDessin`, R37) : chaque défaut est situé à sa ligne du fichier, sans citer le
 * texte.
 */
function controlerBalises(analyse: Analyse, fichierDessin: string, interieur: string) {
  const chevrons = interieur.match(/</g)?.length ?? 0;
  const fermetures = interieur.match(/\/>|<\/\w+>/g)?.length ?? 0;
  if (chevrons !== fermetures) {
    signaler(
      analyse,
      fichierDessin,
      '',
      `Balise non fermée : ${chevrons} « < » pour ${fermetures} fermetures « /> » ou « </…> ».`,
    );
  }
  for (const { position, message } of defautsDuDessin(interieur)) {
    // L'intérieur commence à la deuxième ligne du fichier, après celle du cadre.
    const ligne = 2 + interieur.slice(0, position).split('\n').length - 1;
    signaler(analyse, fichierDessin, `ligne ${ligne}`, message);
  }
}

function resoudreTextes(
  analyse: Analyse,
  fichier: string,
  ecrit: Ecrit<'texte-annote'>,
): ModuleTexteAnnote {
  const parent = etatPropre(ecrit.statut, ecrit.verifie_le);
  const textes = ecrit.textes.map((texte, rang): TexteAnnote => {
    const lieu = `textes[${rang}]`;
    noterIdentifiant(analyse, texte.id, fichier, `${lieu}.id`);

    const { segments, erreurs } = analyserTexte(texte.texte);
    for (const message of erreurs) signaler(analyse, fichier, `${lieu}.texte`, message);
    // Un marquage cassé peut cacher l'identifiant d'un jeton.
    if (erreurs.length > 0) analyse.complet = false;
    const jetons = segments.flatMap((segment) => ('jeton' in segment ? [segment.jeton] : []));
    jetons.forEach((jeton, n) => {
      if (estIdentifiant(jeton.id)) {
        noterIdentifiant(analyse, jeton.id, fichier, `${lieu}.texte.jetons[${n}]`);
      }
    });

    const questions = texte.questions.map((question, n): Question => {
      const lieuQuestion = `${lieu}.questions[${n}]`;
      noterIdentifiant(analyse, question.id, fichier, `${lieuQuestion}.id`);
      controlerDistracteurs(analyse, fichier, question, lieuQuestion);
      return {
        id: question.id,
        question: question.question,
        reponse: question.reponse,
        distracteurs: question.distracteurs,
      };
    });

    return {
      id: texte.id,
      titre: texte.titre,
      texte: texte.texte,
      segments,
      questions,
      ...etatHerite(texte, parent),
    };
  });
  return {
    type: 'texte-annote',
    id: ecrit.id,
    fichier,
    titre: ecrit.titre,
    ...descriptionDe(ecrit),
    ...(ecrit.consigne === undefined ? {} : { consigne: ecrit.consigne }),
    reussite: ecrit.reussite,
    textes,
  };
}

/** Un exercice prend les options et la règle de sa famille s'il n'a pas les siennes. */
function resoudreExercices(
  analyse: Analyse,
  fichier: string,
  ecrit: Ecrit<'exercices'>,
): ModuleExercices {
  const parent = etatPropre(ecrit.statut, ecrit.verifie_le);
  const familles = ecrit.familles.map((famille, rang): FamilleExercices => {
    const lieu = `familles[${rang}]`;
    if (famille.options && aDesDoublons(famille.options)) {
      signaler(analyse, fichier, `${lieu}.options`, 'Options en double.');
    }

    const exercices = famille.exercices.map((exercice, n): Exercice => {
      const lieuExercice = `${lieu}.exercices[${n}]`;
      noterIdentifiant(analyse, exercice.id, fichier, `${lieuExercice}.id`);
      if (exercice.options && aDesDoublons(exercice.options)) {
        signaler(analyse, fichier, `${lieuExercice}.options`, 'Options en double.');
      }
      const options = exercice.options ?? famille.options;
      const regle = exercice.regle ?? famille.regle;
      if (options && !options.includes(exercice.reponse)) {
        if (exercice.options) {
          signaler(
            analyse,
            fichier,
            `${lieuExercice}.options`,
            'Les options ne contiennent pas la réponse.',
          );
        } else {
          signaler(
            analyse,
            fichier,
            `${lieuExercice}.reponse`,
            'La réponse ne figure pas parmi les options de la famille.',
          );
        }
      }
      return {
        id: exercice.id,
        invite: exercice.invite,
        reponse: exercice.reponse,
        ...(options === undefined ? {} : { options: [...options] }),
        ...(regle === undefined ? {} : { regle }),
        ...etatHerite(exercice, parent),
      };
    });

    return { code: famille.code, libelle: famille.libelle, exercices };
  });
  return {
    type: 'exercices',
    id: ecrit.id,
    fichier,
    titre: ecrit.titre,
    ...descriptionDe(ecrit),
    familles,
  };
}

/** Les règles de l'examen (bornes, taille par défaut, seuils cumulés) sont dans le schéma. */
function resoudreExamen(fichier: string, ecrit: Ecrit<'examen'>): ModuleExamen {
  const { schema, texte, exercice, feuille, mot, direct, a_taper } = ecrit.tirage;
  return {
    type: 'examen',
    id: ecrit.id,
    fichier,
    titre: ecrit.titre,
    tailles: ecrit.tailles,
    tailleParDefaut: ecrit.taille_par_defaut,
    secondesParQuestion: ecrit.secondes_par_question,
    minutesMinimum: ecrit.minutes_minimum,
    noteSuffisante: ecrit.note_suffisante,
    seuilChapitre: ecrit.seuil_chapitre,
    tirage: { schema, texte, exercice, feuille, mot, direct, aTaper: a_taper },
  };
}

/**
 * `numero` est unique parmi les modules de cartes d'un cours, et parmi ses feuilles. Une feuille
 * peut porter le numéro d'un module de cartes.
 */
function controlerNumeros(analyse: Analyse, modules: readonly Module[]) {
  const parNumero = new Map<string, string>();
  for (const module of modules) {
    if (module.type !== 'cartes' && module.type !== 'feuille') continue;
    const cle = `${module.type} ${module.numero}`;
    const premier = parNumero.get(cle);
    if (premier === undefined) {
      parNumero.set(cle, module.fichier);
    } else {
      signaler(
        analyse,
        module.fichier,
        'numero',
        `Numéro ${module.numero} en double : c'est déjà celui de ${premier}.`,
      );
    }
  }
}

/** Au plus un module par type de `TYPES_DE_MODULE_UNIQUES` : les suivants sont refusés. */
function controlerModulesUniques(analyse: Analyse, modules: readonly Module[]) {
  const premiers = new Map<string, string>();
  for (const module of modules) {
    if (!TYPES_DE_MODULE_UNIQUES.has(module.type)) continue;
    const premier = premiers.get(module.type);
    if (premier === undefined) {
      premiers.set(module.type, module.fichier);
    } else {
      signaler(
        analyse,
        module.fichier,
        'type',
        `Au plus un module « ${module.type} » par cours : c'est déjà le cas de ${premier}.`,
      );
    }
  }
}

/** Les `chapitres` d'une morphologie désignent des modules de cartes du même cours. */
function controlerChapitres(analyse: Analyse, modules: readonly Module[]) {
  const cartes = new Set(modules.filter((module) => module.type === 'cartes').map((m) => m.id));
  for (const module of modules) {
    if (module.type !== 'morphologie') continue;
    module.chapitres.forEach((id, rang) => {
      if (!cartes.has(id)) {
        signaler(
          analyse,
          module.fichier,
          `chapitres[${rang}]`,
          'Ce chapitre ne désigne aucun module de cartes de ce cours.',
        );
      }
    });
  }
}

/** Les chapitres que `memoire` met en FSRS sont des modules de cartes du cours, chacun une fois. */
function controlerChapitresDeMemoire(
  analyse: Analyse,
  fichierCours: string,
  chapitres: readonly string[] | undefined,
  modules: readonly Module[],
) {
  const cartes = new Set(modules.filter((module) => module.type === 'cartes').map((m) => m.id));
  const vus = new Set<string>();
  chapitres?.forEach((id, rang) => {
    const lieu = `memoire.chapitres[${rang}]`;
    if (vus.has(id)) signaler(analyse, fichierCours, lieu, 'Chapitre cité deux fois.');
    else if (!cartes.has(id)) {
      signaler(
        analyse,
        fichierCours,
        lieu,
        'Ce chapitre ne désigne aucun module de cartes de ce cours.',
      );
    }
    vus.add(id);
  });
}

/**
 * `notice.yaml` est obligatoire (S1-D7). Il ne porte aucun identifiant : son échec ne retient pas la
 * confrontation du verrou au contenu.
 */
function lireNotice(analyse: Analyse): ValeursDeNotice | undefined {
  if (!analyse.fichiers.has(FICHIER_NOTICE)) {
    signaler(
      analyse,
      FICHIER_NOTICE,
      '',
      'notice.yaml est absent : il porte les valeurs de la notice de confidentialité (S1-D7).',
    );
    return undefined;
  }
  const { complet } = analyse;
  const ecrite = lire(analyse, FICHIER_NOTICE, schemaDeNotice);
  analyse.complet = complet;
  return ecrite && valeursDeNotice(ecrite);
}

/** `ids.lock` est obligatoire. Il n'est confronté au contenu que si tout a pu être lu. */
function controlerVerrou(analyse: Analyse): void {
  const texte = analyse.fichiers.get(FICHIER_VERROU);
  if (texte === undefined) {
    signaler(
      analyse,
      FICHIER_VERROU,
      '',
      'ids.lock est absent : il doit lister tous les identifiants émis (ADR-0003).',
    );
    return;
  }
  const { entrees, erreurs } = lireVerrou(texte);
  analyse.erreurs.push(...erreurs);
  if (analyse.complet) analyse.erreurs.push(...verifierVerrou(analyse.identifiants, entrees));
}
