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

interface Ligne {
  personne: string;
  id: string;
  cours: string;
  unite: string;
  resultat: string;
  repondu_a: string;
  v: number;
}

/**
 * Un journal par personne qui a répondu dans `cours`, les réponses seules (un examen est écarté :
 * ses questions ont chacune leur réponse). Une base absente ou qui n'en est pas une lève une erreur.
 */
export function lireJournaux(base: string, cours: string): { journaux: Evenement[][] } {
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
      journal.push({
        id: ligne.id,
        cours: ligne.cours,
        unite: ligne.unite,
        type: 'reponse',
        resultat: JSON.parse(ligne.resultat),
        repondu_a: ligne.repondu_a,
        appareil: APPAREIL_ANONYME,
        v: ligne.v,
      } as Evenement);
    }
    return { journaux: [...parPersonne.values()] };
  } finally {
    sqlite.close();
  }
}
