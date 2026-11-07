import type { CoursAcces } from '../acces.js';
import { elementsDeTache } from './feuille.js';
import type { Cours, Etat, Module, Statut } from './modele.js';

/*
 * Ce que le contenu d'un cours dit à ses règles d'accès (ADR-0001) : a-t-il des éléments « à
 * vérifier », et une dérogation écrite l'autorise-t-elle malgré cela ? Les règles elles-mêmes sont
 * dans `../acces.ts` ; ce module ne fait que lire le modèle résolu.
 */

/**
 * Les éléments qui portent un statut dans un module. Les points d'un schéma, les jetons et les
 * questions d'un texte n'en ont pas : ils prennent celui de leur parent, que le schéma ou le texte
 * porte déjà. Le schéma est son propre élément : son statut vaut pour tout le dessin. Les tâches
 * d'une feuille n'ont pas de statut : chacun de leurs éléments a le sien (F1-D2).
 */
function elementsDuModule(module: Module): readonly Etat[] {
  switch (module.type) {
    case 'cartes':
      return module.cartes;
    case 'morphologie':
      return [...module.morphemes, ...module.mots];
    case 'schema':
      return [module];
    case 'texte-annote':
      return module.textes;
    case 'exercices':
      return module.familles.flatMap((famille) => famille.exercices);
    case 'feuille':
      return module.parties.flatMap((partie) => partie.taches.flatMap(elementsDeTache));
    case 'examen':
      // Des réglages, pas un contenu à relire : aucun statut, donc jamais « à vérifier ».
      return [];
    default: {
      // Un nouveau type de module doit dire ici où sont ses statuts : `pnpm types` échoue tant que
      // ce n'est pas fait.
      const _exhaustif: never = module;
      throw new Error('type de module non géré');
    }
  }
}

/** Le nombre des éléments d'un module, par statut. */
export interface CompteDesStatuts {
  source: number;
  aVerifier: number;
  verifie: number;
}

const CLE_DU_STATUT: Readonly<Record<Statut, keyof CompteDesStatuts>> = {
  source: 'source',
  'à vérifier': 'aVerifier',
  vérifié: 'verifie',
};

/**
 * Les éléments du module, comptés par statut, comme `coursAVerifier` les voit. L'examen n'a pas de
 * statut : `undefined`.
 */
export function statutsDuModule(module: Module): CompteDesStatuts | undefined {
  if (module.type === 'examen') return undefined;
  const compte: CompteDesStatuts = { source: 0, aVerifier: 0, verifie: 0 };
  for (const { statut } of elementsDuModule(module)) compte[CLE_DU_STATUT[statut]]++;
  return compte;
}

/** Vrai si au moins un élément du cours, quel que soit son module, a le statut « à vérifier ». */
export function coursAVerifier(cours: Cours): boolean {
  return cours.modules.some((module) => (statutsDuModule(module)?.aVerifier ?? 0) > 0);
}

export function versCoursAcces(cours: Cours): CoursAcces {
  return {
    id: cours.id,
    aVerifier: coursAVerifier(cours),
    derogation: cours.derogationDiffusion !== undefined,
  };
}
