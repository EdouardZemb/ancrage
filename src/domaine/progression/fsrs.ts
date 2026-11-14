import { dateChrono, defineScheduler, Rating } from 'ts-fsrs';
import {
  schedulerDesiredRetentionMiddleware,
  schedulerScheduledDaysMiddleware,
} from 'ts-fsrs/middlewares';
import { FSRS6_DEFAULT_WEIGHTS, FSRS6Model } from 'ts-fsrs/models/fsrs-6';
import type { Evenement } from '../journal/evenement.js';
import { ajouterJours, jourDe, joursEntre } from '../journal/temps.js';
import { ETAT_NEUF, type EtatUnite, journalSansDoublon } from './etat.js';

/*
 * L'état d'apprentissage dérivé du journal par FSRS-6 (ADR-0012, M1-D2 à M1-D4), à côté de la
 * méthode de Leitner d'`etat.ts` : même journal, même type `EtatUnite`, rien de stocké (ADR-0004,
 * invariant 5). Chaque appel rejoue le journal sans doublon (`journalSansDoublon`), dans l'ordre
 * que `trierEvenements` fixe : deux appareils qui ont les mêmes événements aboutissent au même état.
 *
 * Ce qui fixe le calcul, et ne doit jamais dépendre d'un défaut de la bibliothèque :
 * - le modèle est nommé (`FSRS6Model`, ses poids par défaut ou, s'il les porte, ceux du manifeste),
 *   jamais celui que `ts-fsrs` prend quand on ne dit rien ;
 * - aucune dispersion des intervalles (pas de `fuzz`), aucune étape courte : le résultat ne contient
 *   pas de hasard et se compte en jours entiers ;
 * - une réponse est datée de son jour local (`jourDe`), porté à midi UTC : l'heure ne compte pas,
 *   seul l'écart en jours compte ;
 * - le jour d'une unité ne recule jamais : le journal est trié par instant, mais le jour local peut
 *   reculer (changement de fuseau, deux appareils) et la bibliothèque refuse une date antérieure ;
 *   on garde alors le dernier jour déjà rejoué ;
 * - une réponse juste vaut la note « Good », une fausse « Again » (note binaire) ;
 * - les poids sont ceux du cours (`parametres`, M3-P4), sinon ceux par défaut ;
 * - le plafond d'avant l'examen (`examen`, M3-P5) ne borne que l'échéance rendue, jamais la carte de
 *   la bibliothèque : la stabilité, donc la `boite`, ne le voit pas. Il part du jour que le rejeu
 *   retient pour la réponse, jamais d'aujourd'hui : deux appareils au même journal s'accordent.
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

/** Ce que règle un cours pour FSRS : la rétention visée, des poids ajustés, la date de l'examen. */
export interface ReglagesFsrs {
  retention: number;
  /** Les 21 poids de FSRS-6 ; sans eux, les poids par défaut. */
  parametres?: readonly number[] | undefined;
  /** `AAAA-MM-JJ` : une réponse donnée `n` jours avant a une échéance d'au plus `n / 2` jours. */
  examen?: string | undefined;
}

/** Un ordonnanceur FSRS-6 sans dispersion ni étapes courtes, à la rétention et aux poids visés. */
export function ordonnanceurFsrs({ retention, parametres }: ReglagesFsrs) {
  return defineScheduler({ model: FSRS6Model, chrono: dateChrono })
    .use(schedulerDesiredRetentionMiddleware)
    .use(schedulerScheduledDaysMiddleware)
    .create({
      config: {
        weights: parametres === undefined ? FSRS6_DEFAULT_WEIGHTS : [...parametres],
        enableShortTerm: false,
        numRelearningSteps: 0,
        desiredRetention: retention,
      },
    });
}

/** Le jour local, porté à midi UTC : l'heure de la réponse ne compte pas. */
export const midiUtc = (jour: string): Date => new Date(`${jour}T12:00:00.000Z`);

/**
 * La suite des révisions de chaque unité, telle que le rejeu la lit (M3-P10) : une révision par
 * réponse, dans l'ordre du journal sans doublon, avec le jour que le rejeu retient (le jour local,
 * qui ne recule jamais pour une unité) et le verdict. Les unités viennent dans l'ordre de leur
 * première réponse ; un examen n'y entre pas. C'est aussi ce que l'ajustement des paramètres lit.
 */
export function revuesDuJournal(
  evenements: readonly Evenement[],
): { unite: string; jours: string[]; justes: boolean[] }[] {
  const revues = new Map<string, { unite: string; jours: string[]; justes: boolean[] }>();
  for (const evenement of journalSansDoublon(evenements)) {
    if (evenement.type !== 'reponse') continue;
    const suite = revues.get(evenement.unite) ?? { unite: evenement.unite, jours: [], justes: [] };
    revues.set(evenement.unite, suite);
    // Le journal est trié par instant, le jour est local : il peut reculer (changement de fuseau,
    // deux appareils). Le jour d'une unité ne recule jamais dans le rejeu.
    const local = jourDe(evenement.repondu_a);
    const dernier = suite.jours.at(-1);
    suite.jours.push(dernier !== undefined && dernier > local ? dernier : local);
    suite.justes.push(evenement.resultat.juste);
  }
  return [...revues.values()];
}

/**
 * L'intervalle que le plafond d'avant l'examen laisse à une réponse juste donnée au `jour` :
 * la moitié des jours qui restent, arrondie vers le bas, et un jour au moins. À un jour de
 * l'examen, cela fait un jour, plus que la moitié ; le jour de l'examen et après, il n'y a plus de
 * plafond (M3-P5).
 */
export function plafondDe(jour: string, examen: string | undefined): number {
  if (examen === undefined) return Number.POSITIVE_INFINITY;
  const restant = joursEntre(jour, examen);
  return restant >= 1 ? Math.max(1, Math.floor(restant / 2)) : Number.POSITIVE_INFINITY;
}

/** La carte que garde `ts-fsrs` pour une unité. */
export type CarteFsrs = ReturnType<ReturnType<typeof ordonnanceurFsrs>['newCard']>;

/**
 * Une révision : la carte d'une unité (neuve si `carte` est absente) après une réponse donnée au
 * `jour`, et l'intervalle que garde l'échéance d'une réponse juste, en jours entiers, d'au moins un
 * jour et borné par le plafond d'avant `examen`. Le rejeu et la projection du rapport de suivi
 * calculent par elle, d'une seule façon.
 */
export function reviserFsrs(
  planificateur: ReturnType<typeof ordonnanceurFsrs>,
  carte: CarteFsrs | undefined,
  jour: string,
  juste: boolean,
  examen: string | undefined,
): { carte: CarteFsrs; intervalle: number } {
  const maintenant = midiUtc(jour);
  const revue = planificateur.review({
    card: carte ?? planificateur.newCard({ now: maintenant }),
    grade: juste ? Rating.Good : Rating.Again,
    now: maintenant,
  });
  return {
    carte: revue.card,
    intervalle: Math.min(Math.max(1, revue.card.scheduledDays), plafondDe(jour, examen)),
  };
}

/**
 * L'état de chaque unité qui a reçu une réponse, dans l'ordre du journal, selon FSRS-6 réglé pour
 * la `retention` visée (0,9 : neuf rappels sur dix), les `parametres` du cours et son `examen`.
 *
 * - Une réponse juste fixe l'échéance au jour de la réponse plus l'intervalle que rend la
 *   bibliothèque, en jours entiers et d'au moins un jour, borné par le plafond d'avant l'examen ;
 *   la `boite` se dérive de la stabilité.
 * - Une réponse fausse renvoie en boîte 1, à revoir le jour même (M1-D3).
 * - Un examen n'y entre pas : ses questions ont chacune produit une réponse.
 *
 * Une unité absente du résultat n'a jamais été répondue (`etatDe`).
 */
export function etatsFsrs(
  evenements: readonly Evenement[],
  reglages: ReglagesFsrs,
): ReadonlyMap<string, EtatUnite> {
  const planificateur = ordonnanceurFsrs(reglages);
  const etats = new Map<string, EtatUnite>();
  for (const { unite, jours, justes } of revuesDuJournal(evenements)) {
    let carte: CarteFsrs | undefined;
    let etat = ETAT_NEUF;
    jours.forEach((jour, rang) => {
      const juste = justes[rang] === true;
      const revue = reviserFsrs(planificateur, carte, jour, juste, reglages.examen);
      carte = revue.carte;
      etat = {
        boite: juste ? boiteDeStabilite(revue.carte.stability) : 1,
        echeance: juste ? ajouterJours(jour, revue.intervalle) : jour,
        justes: etat.justes + (juste ? 1 : 0),
        fausses: etat.fausses + (juste ? 0 : 1),
      };
    });
    etats.set(unite, etat);
  }
  return etats;
}
