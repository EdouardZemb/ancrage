import fs from 'node:fs';
import path from 'node:path';
import type { ErreurContenu } from '../../domaine/contenu/erreurs.js';
import type { Cours, Tache } from '../../domaine/contenu/modele.js';
import type { ValeursDeNotice } from '../../domaine/notice.js';
import { estUnDossier, LienSymboliqueRefuse, listerFichiers } from './chargeur.js';

/*
 * Garde-fou de l'invariant 3 : le contenu d'un cours ne sort que par l'API, jamais dans le code
 * envoyé au navigateur. On cherche les textes du cours dans les fichiers du client construit, et les
 * valeurs de la notice de l'instance, qui ne sortent que par `GET /api/notice` (S1-D5).
 */

/** En dessous, un texte est trop banal pour prouver qu'il vient du cours (« Nein », « der »…). */
export const LONGUEUR_MINIMALE_TEXTE = 12;

/** Le nombre de caractères du texte trouvé que l'erreur cite. */
const LONGUEUR_EXTRAIT = 40;

/**
 * Les textes du cours qui ne doivent jamais figurer dans le client : ceux d'au moins
 * `LONGUEUR_MINIMALE_TEXTE` caractères, une fois les espaces de bord retirés, sans doublon. Le
 * dessin des schémas est exclu : c'est du SVG, pas du texte. Les titres de tous les modules, celui
 * de l'examen compris, les descriptions des modules qui en ont une et la consigne des textes
 * annotés sont cherchés, comme tout texte d'une feuille.
 */
export function textesDuCours(cours: Cours): string[] {
  const textes = new Set<string>();
  const ajouter = (texte: string): void => {
    const net = texte.trim();
    if (net.length >= LONGUEUR_MINIMALE_TEXTE) textes.add(net);
  };

  ajouter(cours.titre);
  Object.values(cours.typesDeCarte).forEach(ajouter);

  for (const module of cours.modules) {
    ajouter(module.titre);
    switch (module.type) {
      case 'cartes':
        for (const carte of module.cartes) {
          ajouter(carte.recto);
          ajouter(carte.verso);
          carte.reponses?.forEach(ajouter);
        }
        break;
      case 'morphologie':
        if (module.description !== undefined) ajouter(module.description);
        for (const morpheme of module.morphemes) {
          ajouter(morpheme.forme);
          ajouter(morpheme.sens);
        }
        for (const mot of module.mots) {
          ajouter(mot.mot);
          ajouter(mot.sens);
        }
        break;
      case 'schema':
        if (module.description !== undefined) ajouter(module.description);
        ajouter(module.note);
        for (const point of module.points) {
          ajouter(point.terme);
          ajouter(point.sens);
        }
        break;
      case 'texte-annote':
        if (module.description !== undefined) ajouter(module.description);
        if (module.consigne !== undefined) ajouter(module.consigne);
        for (const texte of module.textes) {
          ajouter(texte.titre);
          for (const segment of texte.segments) {
            if ('jeton' in segment) {
              ajouter(segment.jeton.forme);
              ajouter(segment.jeton.sens);
            } else {
              ajouter(segment.texte);
            }
          }
          for (const question of texte.questions) {
            ajouter(question.question);
            ajouter(question.reponse);
            question.distracteurs.forEach(ajouter);
          }
        }
        break;
      case 'exercices':
        if (module.description !== undefined) ajouter(module.description);
        for (const famille of module.familles) {
          ajouter(famille.libelle);
          for (const exercice of famille.exercices) {
            ajouter(exercice.invite);
            ajouter(exercice.reponse);
            exercice.options?.forEach(ajouter);
            if (exercice.regle !== undefined) ajouter(exercice.regle);
          }
        }
        break;
      case 'feuille':
        for (const partie of module.parties) {
          ajouter(partie.titre);
          for (const tache of partie.taches) {
            ajouter(tache.consigne);
            textesDeTache(tache).forEach(ajouter);
          }
        }
        break;
      case 'examen':
        // Des nombres, et un titre déjà pris plus haut.
        break;
      default: {
        // Un nouveau type de module doit dire ici quels textes ne sortent jamais : `pnpm types`
        // échoue tant que ce n'est pas fait.
        const _exhaustif: never = module;
        throw new Error('type de module non géré');
      }
    }
  }

  return [...textes];
}

const MAILTO = 'mailto:';

/**
 * Les valeurs de la notice qui ne doivent jamais figurer dans le client : celles d'au moins
 * `LONGUEUR_MINIMALE_TEXTE` caractères, une fois les espaces de bord retirés, dans chaque langue, et
 * la cible de chaque lien `mailto:`, avec l'adresse qu'elle porte, quelle que soit leur longueur.
 * Sans doublon.
 */
export function textesDeLaNotice(notice: ValeursDeNotice): string[] {
  const textes = new Set<string>();
  for (const valeurs of Object.values(notice.valeurs)) {
    for (const valeur of Object.values(valeurs)) {
      const nette = valeur.trim();
      if (nette.length >= LONGUEUR_MINIMALE_TEXTE) textes.add(nette);
    }
  }
  for (const { cible } of notice.liens) {
    if (!cible.startsWith(MAILTO)) continue;
    textes.add(cible);
    if (cible.length > MAILTO.length) textes.add(cible.slice(MAILTO.length));
  }
  return [...textes];
}

/** Les textes propres au genre d'une tâche : ceux de ses éléments, et ses listes. */
function textesDeTache(tache: Tache): string[] {
  switch (tache.genre) {
    case 'appariement':
      return tache.paires.flatMap((paire) => [paire.terme, paire.cible]);
    case 'classement':
      return [...tache.categories, ...tache.elements.map((element) => element.terme)];
    case 'qcm':
      return tache.questions.flatMap((q) => [q.question, q.reponse, ...q.distracteurs]);
    case 'vrai-faux':
      return tache.affirmations.flatMap((a) =>
        a.correction === undefined ? [a.affirmation] : [a.affirmation, a.correction],
      );
    case 'trous':
      return [...(tache.liste ?? []), ...tache.phrases.flatMap((p) => [p.texte, ...p.reponses])];
    case 'orthographe':
      return tache.mots.flatMap((mot) => [mot.fautif, mot.reponse]);
    case 'ouverte':
      return tache.questions.flatMap((q) => [q.question, q.reponse]);
    default: {
      // Un nouveau genre de tâche doit dire ici quels textes ne sortent jamais : `pnpm types`
      // échoue tant que ce n'est pas fait.
      const _exhaustif: never = tache;
      throw new Error('genre de tâche non géré');
    }
  }
}

const ECHAPPEMENTS_SIMPLES: Readonly<Record<string, string>> = {
  n: '\n',
  r: '\r',
  t: '\t',
  b: '\b',
  f: '\f',
  v: '\v',
};

/** Ce qu'une barre oblique inverse fait disparaître : la continuation de ligne. */
const FIN_DE_LIGNE_ECHAPPEE = /^(?:\r\n|[\n\r\u2028\u2029])$/;

/** Une barre oblique inverse et son échappement, lus de gauche à droite sur une seule passe. */
const ECHAPPEMENT_JS =
  /\\(?:x([0-9a-fA-F]{2})|u\{([0-9a-fA-F]{1,6})\}|u([0-9a-fA-F]{4})|0(?![0-9])|(\r\n|[\s\S]))/g;

/**
 * Le texte d'un fichier JavaScript, une fois ses échappements de chaîne résolus : `\xHH`,
 * `\uHHHH` (une unité UTF-16, si bien que les deux unités d'une paire se suivent et forment le
 * caractère), `\u{H…}`, `\n`, `\r`, `\t`, `\b`, `\f`, `\v`, `\0`, `\"`, `\'`, `` \` ``, `\\`, `\/`
 * et la continuation de ligne, qui disparaît. Tout autre `\c` donne `c`, comme en JavaScript. Une
 * séquence mal formée (`\x4`, `\u{110000}`) reste telle quelle. La lecture se fait d'un seul
 * trait, de gauche à droite : `\\u00fc` est une barre suivie de `u00fc`, et non un `ü`.
 */
export function desechapperJs(texte: string): string {
  return texte.replace(
    ECHAPPEMENT_JS,
    (trouve: string, hex2?: string, hexLong?: string, hex4?: string, autre?: string) => {
      if (hex2 !== undefined) return String.fromCharCode(Number.parseInt(hex2, 16));
      if (hex4 !== undefined) return String.fromCharCode(Number.parseInt(hex4, 16));
      if (hexLong !== undefined) {
        const point = Number.parseInt(hexLong, 16);
        return point <= 0x10ffff ? String.fromCodePoint(point) : trouve;
      }
      if (autre === undefined) return '\0';
      if (autre === 'x' || autre === 'u') return trouve;
      if (FIN_DE_LIGNE_ECHAPPEE.test(autre)) return '';
      return ECHAPPEMENTS_SIMPLES[autre] ?? autre;
    },
  );
}

const BLANCS = /\s+/g;

/** Les blancs d'un texte ramenés à une espace, ceux de bord retirés. */
function blancsRamenes(texte: string): string {
  return texte.replace(BLANCS, ' ').trim();
}

/** La ponctuation de fin (`.?!:;…`, répétée) retirée, puis les blancs de bord. */
const PONCTUATION_FINALE = /[.?!:;…\s]+$/;

/**
 * Les formes sous lesquelles la recherche en blancs ramenés cherche un texte : le texte, ses blancs
 * ramenés à une espace, et la même forme sans sa ponctuation finale si elle garde au moins
 * `LONGUEUR_MINIMALE_TEXTE` caractères.
 */
function formesSansBlancs(texte: string): string[] {
  const forme = blancsRamenes(texte);
  const sansPonctuation = forme.replace(PONCTUATION_FINALE, '');
  return sansPonctuation.length >= LONGUEUR_MINIMALE_TEXTE && sansPonctuation !== forme
    ? [forme, sansPonctuation]
    : [forme];
}

/**
 * Cherche chaque texte dans chaque fichier de `dossier`, trois fois : dans les octets bruts, dans
 * le fichier lu comme du texte JavaScript dont on a résolu les échappements (`desechapperJs`), puis
 * dans ce même texte dont chaque suite de blancs est ramenée à une espace, où le texte (ses blancs
 * ramenés de même) est cherché tel quel et sans sa ponctuation finale : un texte recoupé par
 * Markdown sur deux lignes, ou cité sans son point, est ainsi trouvé. On décode puis on cherche
 * le texte brut, plutôt que d'énumérer les formes de chaque texte : une énumération manquerait
 * les mélanges (un `ü` et un guillemet dans la même chaîne). Un texte trouvé par l'une des
 * recherches donne une erreur, une seule par fichier.
 *
 * Limites, connues et non traitées (Vite 8 n'en produit aucune) : les entités HTML (`&uuml;`),
 * une chaîne coupée par une concaténation (`"Kardio" + "logie"`), une autre normalisation
 * Unicode (NFD), un texte coupé par une balise ou une marque au milieu, et les échappements CSS
 * (une barre suivie de un à six chiffres hexadécimaux et d'une espace facultative, dans un
 * `content:`), que `desechapperJs` ne lit pas ainsi.
 *
 * Un dossier absent est une erreur : ne rien trouver dans un dossier qui n'existe pas ne prouve
 * rien.
 */
export function chercherTextesDansClient(
  dossier: string,
  textes: readonly string[],
  exclure: readonly string[] = [],
): ErreurContenu[] {
  if (!estUnDossier(dossier)) {
    return [
      {
        fichier: '.',
        lieu: '',
        message: `dossier du client introuvable : ${path.resolve(dossier)}`,
      },
    ];
  }

  const recherches = textes.map((texte) => ({
    texte,
    octets: Buffer.from(texte, 'utf8'),
    formes: formesSansBlancs(texte),
  }));

  const erreurs: ErreurContenu[] = [];
  let fichiers: string[];
  try {
    fichiers = listerFichiers(dossier, exclure);
  } catch (erreur) {
    if (!(erreur instanceof LienSymboliqueRefuse)) throw erreur;
    return [erreur.versErreur()];
  }
  for (const fichier of fichiers) {
    // Des octets, et non du texte : un fichier binaire ne doit pas être déformé par un décodage.
    const octets = fs.readFileSync(path.join(dossier, fichier));
    // Un fichier binaire est décodé sans exception (U+FFFD pour chaque octet invalide) : ses octets
    // bruts sont de toute façon cherchés.
    const decode = desechapperJs(octets.toString('utf8'));
    const ramene = blancsRamenes(decode);
    for (const { texte, octets: brut, formes } of recherches) {
      if (
        octets.includes(brut) ||
        decode.includes(texte) ||
        formes.some((forme) => ramene.includes(forme))
      ) {
        erreurs.push({
          fichier,
          lieu: '',
          message: `texte de cours trouvé dans un fichier servi : « ${[...texte].slice(0, LONGUEUR_EXTRAIT).join('')} »`,
        });
      }
    }
  }
  return erreurs;
}
