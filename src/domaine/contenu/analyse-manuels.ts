import { type Analyse, noterIdentifiant, signaler, signalerDoublons } from './analyse-commun.js';
import type { Manuel, Module } from './modele.js';

/*
 * Les contrôles croisés des manuels (A2-D3, A2-D4). Les règles d'une valeur seule (forme d'un
 * identifiant, entier positif, titre non vide) sont dans `schemas.ts`.
 */

const MESSAGE_ABSENTE = 'Champ obligatoire absent : cours.yaml nomme ses manuels.';
const MESSAGE_DE_TROP = "N'est admis que si cours.yaml nomme ses manuels.";
const MESSAGE_INCONNU = 'Ce manuel ne désigne aucun manuel de ce cours.';

/** Relève l'`id` de chaque manuel à `manuels[<rang>].id`, et signale les titres en double. */
export function noterManuels(
  analyse: Analyse,
  fichierCours: string,
  manuels: readonly Manuel[] | undefined,
): void {
  if (manuels === undefined) return;
  manuels.forEach((manuel, rang) => {
    noterIdentifiant(analyse, manuel.id, fichierCours, `manuels[${rang}].id`);
  });
  signalerDoublons(
    analyse,
    fichierCours,
    manuels.map((manuel) => manuel.titre),
    (rang) => `manuels[${rang}].titre`,
    'Titre',
  );
}

/** Les clés des modules contre le manifeste (A2-D3), puis renvois et doubles (A2-D4). */
export function controlerManuels(
  analyse: Analyse,
  manuels: readonly Manuel[] | undefined,
  modules: readonly Module[],
): void {
  const connus = new Set(manuels?.map((manuel) => manuel.id));
  const chapitres = new Map<string, string>();
  for (const module of modules) {
    if (module.type === 'cartes') {
      const ecrites = { manuel: module.manuel, chapitre: module.chapitre, unit: module.unit };
      for (const [cle, valeur] of Object.entries(ecrites)) {
        if (manuels === undefined && valeur !== undefined) {
          signaler(analyse, module.fichier, cle, MESSAGE_DE_TROP);
        } else if (manuels !== undefined && valeur === undefined) {
          signaler(analyse, module.fichier, cle, MESSAGE_ABSENTE);
        }
      }
    } else if (module.type === 'schema') {
      if (manuels === undefined && module.manuel !== undefined) {
        signaler(analyse, module.fichier, 'manuel', MESSAGE_DE_TROP);
      }
    } else {
      continue;
    }
    if (manuels === undefined || module.manuel === undefined) continue;
    if (!connus.has(module.manuel)) {
      signaler(analyse, module.fichier, 'manuel', MESSAGE_INCONNU);
    } else if (module.type === 'cartes' && module.chapitre !== undefined) {
      const cle = `${module.manuel} ${module.chapitre}`;
      const premier = chapitres.get(cle);
      if (premier === undefined) {
        chapitres.set(cle, module.fichier);
      } else {
        signaler(
          analyse,
          module.fichier,
          'chapitre',
          `Chapitre ${module.chapitre} de ce manuel en double : c'est déjà celui de ${premier}.`,
        );
      }
    }
  }
}
