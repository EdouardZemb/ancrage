import fs from 'node:fs';
import Database from 'better-sqlite3';
import type { Evenement } from '../../domaine/journal/evenement.js';

/*
 * Les journaux d'un cours, lus dans une copie de la base (M3, outil du poste). La base s'ouvre en
 * lecture seule, comme `inspecter` de `src/serveur/base/sauvegarde.ts` : aucune migration, aucun
 * fichier `-wal` ou `-shm` à côté d'une copie faite par `VACUUM INTO`.
 *
 * Ce qui nomme une personne n'en sort pas : ni son identifiant, ni son nom affiché, ni l'appareil
 * de ses réponses. Les journaux sortent sans clé, dans l'ordre de leur personne puis de leur numéro ;
 * le tri ne se lit pas dans ce qui est rendu. Ce fichier ne dépend pas du serveur : il ne lit que
 * les colonnes de la table `evenement` dont il a besoin.
 */

/** Ce que remplace l'appareil de chaque événement : il désignerait la personne d'un cours à l'autre. */
const APPAREIL_ANONYME = '00000000-0000-4000-8000-000000000000';

/** Une copie brute d'une base en WAL : le fichier seul ne dit pas ce que le `-wal` garde. */
export class BaseEnWal extends Error {
  constructor() {
    super('base en mode WAL');
    this.name = 'BaseEnWal';
  }
}

const TAILLE_DE_L_ENTETE = 20;
const SIGNATURE_SQLITE = 'SQLite format 3\0';
const OCTET_D_ECRITURE = 18;
const OCTET_DE_LECTURE = 19;
const VERSION_WAL = 2;

/**
 * Refuse une base en mode WAL (octets 18 et 19 de l'en-tête à 2), avant de l'ouvrir : l'ouvrir, même
 * en lecture seule, créerait un `-shm` à côté d'elle, et une copie brute pendant que le serveur écrit
 * peut manquer ce que le `-wal` garde. L'en-tête se lit à la main : un fichier absent ou qui n'est pas
 * une base est laissé à l'ouverture, qui lève sa propre erreur.
 */
export function refuserUneBaseEnWal(base: string): void {
  let entete: Buffer;
  try {
    const fichier = fs.openSync(base, 'r');
    try {
      entete = Buffer.alloc(TAILLE_DE_L_ENTETE);
      fs.readSync(fichier, entete, 0, TAILLE_DE_L_ENTETE, 0);
    } finally {
      fs.closeSync(fichier);
    }
  } catch {
    return;
  }
  if (entete.toString('latin1', 0, SIGNATURE_SQLITE.length) !== SIGNATURE_SQLITE) return;
  if (entete[OCTET_D_ECRITURE] === VERSION_WAL || entete[OCTET_DE_LECTURE] === VERSION_WAL) {
    throw new BaseEnWal();
  }
}

/** Ce que dit une commande quand la base ne se lit pas : jamais le message de la bibliothèque. */
export function messageDeBaseIllisible(erreur: unknown, base: string): string {
  return erreur instanceof BaseEnWal
    ? `base en mode WAL : une copie brute peut manquer des réponses. La copier par VACUUM INTO (un seul fichier, sans -wal ni -shm) : ${base}`
    : `base illisible : ${base}`;
}

interface Ligne {
  personne: string;
  id: string;
  cours: string;
  unite: string;
  resultat: string;
  repondu_a: string;
  v: number;
}

function versEvenement(ligne: Ligne): Evenement {
  return {
    id: ligne.id,
    cours: ligne.cours,
    unite: ligne.unite,
    type: 'reponse',
    resultat: JSON.parse(ligne.resultat),
    repondu_a: ligne.repondu_a,
    appareil: APPAREIL_ANONYME,
    v: ligne.v,
  } as Evenement;
}

/**
 * Un journal par personne qui a répondu dans `cours`, les réponses seules (un examen est écarté :
 * ses questions ont chacune leur réponse). Une base absente ou qui n'en est pas une lève une erreur.
 */
export function lireJournaux(base: string, cours: string): { journaux: Evenement[][] } {
  refuserUneBaseEnWal(base);
  const sqlite = new Database(base, { readonly: true, fileMustExist: true });
  try {
    const lignes = sqlite
      .prepare(
        `select personne, id, cours, unite, resultat, repondu_a, v
         from evenement
         where cours = ? and type = 'reponse'
         order by personne, numero`,
      )
      .all(cours) as Ligne[];
    const parPersonne = new Map<string, Evenement[]>();
    for (const ligne of lignes) {
      const journal = parPersonne.get(ligne.personne) ?? [];
      parPersonne.set(ligne.personne, journal);
      journal.push(versEvenement(ligne));
    }
    return { journaux: [...parPersonne.values()] };
  } finally {
    sqlite.close();
  }
}

/**
 * Le journal d'une seule personne, d'après son identifiant opaque (la colonne `personne` de la table
 * `evenement`), pour le rapport que son responsable demande. Une liste vide : personne n'a cet
 * identifiant dans ce cours. L'identifiant n'est ni gardé ni rendu : ce qui sort est le journal seul.
 */
export function lireJournalDe(base: string, cours: string, personne: string): Evenement[] {
  refuserUneBaseEnWal(base);
  const sqlite = new Database(base, { readonly: true, fileMustExist: true });
  try {
    const lignes = sqlite
      .prepare(
        `select personne, id, cours, unite, resultat, repondu_a, v
         from evenement
         where cours = ? and personne = ? and type = 'reponse'
         order by numero`,
      )
      .all(cours, personne) as Ligne[];
    return lignes.map(versEvenement);
  } finally {
    sqlite.close();
  }
}
