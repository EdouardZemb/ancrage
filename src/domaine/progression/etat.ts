import type { ReglagesLeitner } from '../contenu/modele.js';
import { type Evenement, fusionnerEvenements, type ResultatExamen } from '../journal/evenement.js';
import { ajouterJours, jourDe } from '../journal/temps.js';

/*
 * L'état d'apprentissage dérivé du journal (ADR-0004, invariant 5), repris du prototype (`record`,
 * `stateOf`, `isDue`, `streak`) sans changer son comportement : la méthode des boîtes de Leitner.
 * Rien n'est stocké : chaque fonction rejoue les événements, que `trierEvenements` range de la
 * même façon sur tous les appareils. Deux appareils qui ont les mêmes événements, dans n'importe
 * quel ordre, aboutissent donc au même état.
 *
 * Un événement présent deux fois (même `id`) ne compte qu'une fois, et le premier fait foi, comme
 * chez le serveur : chaque fonction rejoue le journal sans doublon (`journalSansDoublon`). Le jour
 * d'un événement est son jour local (`jourDe`).
 */

/** Le journal dans son ordre, chaque `id` une seule fois : le premier fait foi. */
export function journalSansDoublon(evenements: readonly Evenement[]): Evenement[] {
  return fusionnerEvenements(evenements, []);
}

/** La dernière boîte de Leitner : les boîtes vont de 0 (neuve) à 5. */
const BOITE_MAX = 5;

export interface EtatUnite {
  /** 0 : jamais répondue. De 1 à 5 : plus la boîte est haute, mieux elle est sue. */
  boite: number;
  /** Le jour (`AAAA-MM-JJ`) où revoir l'unité ; `null` tant qu'elle est neuve. */
  echeance: string | null;
  justes: number;
  fausses: number;
}

/** L'état d'une unité sans aucune réponse. */
export const ETAT_NEUF: EtatUnite = Object.freeze({
  boite: 0,
  echeance: null,
  justes: 0,
  fausses: 0,
});

/**
 * L'état de chaque unité qui a reçu une réponse, dans l'ordre du journal.
 *
 * - Une réponse juste monte d'une boîte (au plus la 5e) et fixe l'échéance au jour de la réponse
 *   plus l'intervalle de la nouvelle boîte.
 * - Une réponse fausse renvoie en boîte 1, à revoir le jour même.
 * - Un examen n'y entre pas : ses questions ont chacune produit une réponse.
 *
 * Une unité absente du résultat n'a jamais été répondue (`etatDe`) ; une unité que le cours ne
 * contient plus y reste, et c'est à l'appelant de l'ignorer.
 */
export function etatsDesUnites(
  evenements: readonly Evenement[],
  leitner: ReglagesLeitner,
): ReadonlyMap<string, EtatUnite> {
  const etats = new Map<string, EtatUnite>();
  for (const evenement of journalSansDoublon(evenements)) {
    if (evenement.type !== 'reponse') continue;
    const jour = jourDe(evenement.repondu_a);
    const avant = etatDe(etats, evenement.unite);
    if (evenement.resultat.juste) {
      const boite = Math.min(BOITE_MAX, avant.boite + 1);
      etats.set(evenement.unite, {
        boite,
        echeance: ajouterJours(jour, leitner.intervalles[boite]),
        justes: avant.justes + 1,
        fausses: avant.fausses,
      });
    } else {
      etats.set(evenement.unite, {
        boite: 1,
        echeance: jour,
        justes: avant.justes,
        fausses: avant.fausses + 1,
      });
    }
  }
  return etats;
}

/** `stateOf` : l'état d'une unité, neuf si elle n'a jamais reçu de réponse. */
export function etatDe(etats: ReadonlyMap<string, EtatUnite>, unite: string): EtatUnite {
  return etats.get(unite) ?? ETAT_NEUF;
}

/** `isDue` : l'unité a été répondue et son échéance est atteinte. Une unité neuve n'est pas due. */
export function estDue(etat: EtatUnite, aujourdhui: string): boolean {
  return etat.boite > 0 && etat.echeance !== null && etat.echeance <= aujourdhui;
}

/**
 * Le nombre de réponses de chaque jour local où il y en a eu. Un examen n'y compte pas : ses
 * questions y comptent déjà, une par une.
 */
export function reponsesParJour(evenements: readonly Evenement[]): ReadonlyMap<string, number> {
  const jours = new Map<string, number>();
  for (const evenement of journalSansDoublon(evenements)) {
    if (evenement.type !== 'reponse') continue;
    const jour = jourDe(evenement.repondu_a);
    jours.set(jour, (jours.get(jour) ?? 0) + 1);
  }
  return jours;
}

/**
 * `streak` : le nombre de jours de suite avec au moins une réponse, jusqu'à aujourd'hui. Si
 * aujourd'hui n'a encore aucune réponse, la série d'hier tient : on compte depuis hier.
 */
export function serie(jours: ReadonlyMap<string, number>, aujourdhui: string): number {
  const aRepondu = (jour: string): boolean => (jours.get(jour) ?? 0) > 0;
  let jour = aRepondu(aujourdhui) ? aujourdhui : ajouterJours(aujourdhui, -1);
  let n = 0;
  while (aRepondu(jour)) {
    n++;
    jour = ajouterJours(jour, -1);
  }
  return n;
}

/** Les examens remis, du plus ancien au plus récent, chacun avec son jour local. */
export function examensPasses(
  evenements: readonly Evenement[],
): { jour: string; resultat: ResultatExamen }[] {
  const examens: { jour: string; resultat: ResultatExamen }[] = [];
  for (const evenement of journalSansDoublon(evenements)) {
    if (evenement.type === 'examen') {
      examens.push({ jour: jourDe(evenement.repondu_a), resultat: evenement.resultat });
    }
  }
  return examens;
}
