import type { ModuleCartes } from '../contenu/modele.js';
import { alternatives, alternativesDeCarte, canonique } from './reponses.js';

/*
 * Les unités d'apprentissage, reprises du prototype (`ITEMS`, `ACCEPT` et `accepted`) sans changer
 * leur comportement (ADR-0005) : chaque carte donne une unité directe (recto → verso), et la
 * plupart une unité inverse (verso → recto). Les identifiants sont ceux de la carte :
 * `<id>` pour la directe, `<id>:inverse` pour l'inverse.
 */

export type Sens = 'direct' | 'inverse';

export interface UniteDeCarte {
  id: string;
  /** L'identifiant de la carte dont l'unité est tirée. */
  carte: string;
  /** L'identifiant du module de cartes. */
  module: string;
  numero: number;
  type: string;
  sens: Sens;
  question: string;
  reponse: string;
  /** Présentes sur l'inverse seulement, quand la carte en a. */
  reponses?: string[];
  /**
   * L'aide de la carte, sur les deux sens (M6, T2-D8 ; M9) : au verso d'une carte retournée, et
   * après une faute ou à un rebelle sur une carte saisie.
   */
  aide?: string;
  /** L'identifiant de la carte avec laquelle celle-ci se confond, sur les deux sens (M6). */
  confonduAvec?: string;
}

/** Pour chaque question inverse canonisée, toutes les réponses acceptées, tous modules confondus. */
export type IndexDesReponses = ReadonlyMap<string, ReadonlySet<string>>;

const SEPARATEUR = ' – ';

/** Les modules servis n'ont pas de `fichier` : seuls l'identifiant, le numéro et les cartes servent. */
export function unitesDeCartes(
  modules: readonly Pick<ModuleCartes, 'id' | 'numero' | 'cartes'>[],
): UniteDeCarte[] {
  const unites: UniteDeCarte[] = [];
  for (const moduleCartes of modules) {
    for (const carte of moduleCartes.cartes) {
      const origine = {
        carte: carte.id,
        module: moduleCartes.id,
        numero: moduleCartes.numero,
        type: carte.type,
        ...(carte.aide === undefined ? {} : { aide: carte.aide }),
        ...(carte.confonduAvec === undefined ? {} : { confonduAvec: carte.confonduAvec }),
      };
      unites.push({
        id: carte.id,
        ...origine,
        sens: 'direct',
        question: carte.recto,
        reponse: carte.verso,
      });
      if (
        carte.type === 'q' ||
        carte.type === 'g' ||
        carte.recto.includes(SEPARATEUR) ||
        carte.recto.endsWith('?')
      ) {
        continue;
      }
      const invite = carte.verso.split(SEPARATEUR)[0].trim();
      const alternativesDuRecto = [...alternativesDeCarte(carte)].filter((x) => x.length >= 3);
      if (!invite || alternativesDuRecto.some((x) => canonique(invite).includes(x))) continue;
      unites.push({
        id: `${carte.id}:inverse`,
        ...origine,
        sens: 'inverse',
        question: invite,
        reponse: carte.recto,
        ...(carte.reponses === undefined ? {} : { reponses: carte.reponses }),
      });
    }
  }
  return unites;
}

/** `ACCEPT` : seules les unités inverses y comptent. */
export function indexerReponses(unites: readonly UniteDeCarte[]): IndexDesReponses {
  const index = new Map<string, Set<string>>();
  for (const unite of unites) {
    if (unite.sens !== 'inverse') continue;
    const cle = canonique(unite.question);
    let acceptees = index.get(cle);
    if (acceptees === undefined) {
      acceptees = new Set();
      index.set(cle, acceptees);
    }
    for (const x of alternativesDeCarte({ recto: unite.reponse, reponses: unite.reponses })) {
      acceptees.add(x);
    }
  }
  return index;
}

/**
 * `accepted` : l'index, à défaut le repli. Le repli d'une inverse est celui de sa carte ; celui
 * d'une directe est celui du verso, comme le prototype.
 */
export function reponsesAcceptees(
  unite: UniteDeCarte,
  index: IndexDesReponses,
): ReadonlySet<string> {
  return (
    index.get(canonique(unite.question)) ??
    (unite.sens === 'inverse'
      ? alternativesDeCarte({ recto: unite.reponse, reponses: unite.reponses })
      : alternatives(unite.reponse))
  );
}

export interface AideDeCarte {
  /** L'aide écrite de la carte. */
  texte?: string;
  /** Le recto et le verso de la carte avec laquelle celle-ci se confond. */
  confusion?: { recto: string; verso: string };
}

/**
 * Ce qu'on montre sous une carte (M6, T2-D8 ; M9) : au verso d'une carte retournée, après une faute
 * ou à un rebelle sur une carte saisie, son aide, et la carte avec laquelle on la confond, cherchée
 * parmi les unités directes de `unites`. Lit sans rigueur
 * (T2-D13) : une aide qui n'est pas un texte, ou un `confonduAvec` qui ne désigne aucune carte
 * des unités, n'est pas montré. `undefined` quand il n'y a rien à montrer.
 */
export function aideDeLUnite(
  unite: UniteDeCarte,
  unites: readonly UniteDeCarte[],
): AideDeCarte | undefined {
  const { aide, confonduAvec } = unite as { aide?: unknown; confonduAvec?: unknown };
  const texte = typeof aide === 'string' && aide.length > 0 ? aide : undefined;
  const visee =
    typeof confonduAvec === 'string'
      ? unites.find((u) => u.sens === 'direct' && u.id === confonduAvec)
      : undefined;
  if (texte === undefined && visee === undefined) return undefined;
  return {
    ...(texte === undefined ? {} : { texte }),
    ...(visee === undefined ? {} : { confusion: { recto: visee.question, verso: visee.reponse } }),
  };
}
