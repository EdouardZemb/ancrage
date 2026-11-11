import { dateChrono, defineScheduler, Rating } from 'ts-fsrs';
import {
  schedulerDesiredRetentionMiddleware,
  schedulerScheduledDaysMiddleware,
} from 'ts-fsrs/middlewares';
import { FSRS6_DEFAULT_WEIGHTS, FSRS6Model } from 'ts-fsrs/models/fsrs-6';
import type { Evenement } from '../journal/evenement.js';
import { ajouterJours, jourDe } from '../journal/temps.js';
import { ETAT_NEUF, type EtatUnite, journalSansDoublon } from './etat.js';

/*
 * L'état d'apprentissage dérivé du journal par FSRS-6 (ADR-0012, M1-D2 à M1-D4), à côté de la
 * méthode de Leitner d'`etat.ts` : même journal, même type `EtatUnite`, rien de stocké (ADR-0004,
 * invariant 5). Chaque appel rejoue le journal sans doublon (`journalSansDoublon`), dans l'ordre
 * que `trierEvenements` fixe : deux appareils qui ont les mêmes événements aboutissent au même état.
 *
 * Ce qui fixe le calcul, et ne doit jamais dépendre d'un défaut de la bibliothèque :
 * - le modèle est nommé (`FSRS6Model`, ses poids par défaut), jamais celui que `ts-fsrs` prend
 *   quand on ne dit rien ;
 * - aucune dispersion des intervalles (pas de `fuzz`), aucune étape courte : le résultat ne contient
 *   pas de hasard et se compte en jours entiers ;
 * - une réponse est datée de son jour local (`jourDe`), porté à midi UTC : l'heure ne compte pas,
 *   seul l'écart en jours compte ;
 * - le jour d'une unité ne recule jamais : le journal est trié par instant, mais le jour local peut
 *   reculer (changement de fuseau, deux appareils) et la bibliothèque refuse une date antérieure ;
 *   on garde alors le dernier jour déjà rejoué ;
 * - une réponse juste vaut la note « Good », une fausse « Again » (note binaire).
 *
 * Le test « le calcul est fixé » compare un journal à un état écrit en dur : il se relit à chaque
 * montée de version de `ts-fsrs`.
 */

/** Les seuils de la stabilité, en jours, d'où se dérive la `boite` (M1-D4) : 2, 4, 8 et 21 jours. */
const SEUILS_DE_BOITE = [2, 4, 8, 21] as const;

/**
 * Le niveau, de 1 à 5, que la stabilité en jours donne à une unité sue : moins de 2 jours, 1 ;
 * moins de 4, 2 ; moins de 8, 3 ; moins de 21, 4 ; sinon 5. C'est ce que lisent la progression et
 * les statistiques sous le nom `boite`.
 */
export function boiteDeStabilite(joursDeStabilite: number): 1 | 2 | 3 | 4 | 5 {
  const [deux, quatre, huit, vingtEtUn] = SEUILS_DE_BOITE;
  if (joursDeStabilite < deux) return 1;
  if (joursDeStabilite < quatre) return 2;
  if (joursDeStabilite < huit) return 3;
  if (joursDeStabilite < vingtEtUn) return 4;
  return 5;
}

/** Un ordonnanceur FSRS-6 sans dispersion ni étapes courtes, à la rétention visée. */
function ordonnanceur(retention: number) {
  return defineScheduler({ model: FSRS6Model, chrono: dateChrono })
    .use(schedulerDesiredRetentionMiddleware)
    .use(schedulerScheduledDaysMiddleware)
    .create({
      config: {
        weights: FSRS6_DEFAULT_WEIGHTS,
        enableShortTerm: false,
        numRelearningSteps: 0,
        desiredRetention: retention,
      },
    });
}

/** Le jour local, porté à midi UTC : l'heure de la réponse ne compte pas. */
const midiUtc = (jour: string): Date => new Date(`${jour}T12:00:00.000Z`);

/**
 * L'état de chaque unité qui a reçu une réponse, dans l'ordre du journal, selon FSRS-6 réglé pour
 * la `retention` visée (0,9 : neuf rappels sur dix).
 *
 * - Une réponse juste fixe l'échéance au jour de la réponse plus l'intervalle que rend la
 *   bibliothèque, en jours entiers et d'au moins un jour ; la `boite` se dérive de la stabilité.
 * - Une réponse fausse renvoie en boîte 1, à revoir le jour même (M1-D3).
 * - Un examen n'y entre pas : ses questions ont chacune produit une réponse.
 *
 * Une unité absente du résultat n'a jamais été répondue (`etatDe`).
 */
export function etatsFsrs(
  evenements: readonly Evenement[],
  retention: number,
): ReadonlyMap<string, EtatUnite> {
  const planificateur = ordonnanceur(retention);
  const cartes = new Map<string, ReturnType<typeof planificateur.newCard>>();
  const etats = new Map<string, EtatUnite>();
  const derniersJours = new Map<string, string>();
  for (const evenement of journalSansDoublon(evenements)) {
    if (evenement.type !== 'reponse') continue;
    // Le journal est trié par instant, le jour est local : il peut reculer (changement de fuseau,
    // deux appareils). Le jour d'une unité ne recule jamais dans le rejeu.
    const local = jourDe(evenement.repondu_a);
    const dernier = derniersJours.get(evenement.unite);
    const jour = dernier !== undefined && dernier > local ? dernier : local;
    derniersJours.set(evenement.unite, jour);
    const maintenant = midiUtc(jour);
    const carte = cartes.get(evenement.unite) ?? planificateur.newCard({ now: maintenant });
    const juste = evenement.resultat.juste;
    const revue = planificateur.review({
      card: carte,
      grade: juste ? Rating.Good : Rating.Again,
      now: maintenant,
    });
    cartes.set(evenement.unite, revue.card);
    const avant = etats.get(evenement.unite) ?? ETAT_NEUF;
    etats.set(evenement.unite, {
      boite: juste ? boiteDeStabilite(revue.card.stability) : 1,
      echeance: juste ? ajouterJours(jour, Math.max(1, revue.card.scheduledDays)) : jour,
      justes: avant.justes + (juste ? 1 : 0),
      fausses: avant.fausses + (juste ? 0 : 1),
    });
  }
  return etats;
}
