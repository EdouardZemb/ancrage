/*
 * La synchronisation du journal de progression (ADR-0004) : on envoie la file au serveur, puis on
 * lit ce que les autres appareils de la personne y ont envoyé, depuis un curseur. Le module ne
 * touche à aucun écran ; l'application décide quand le lancer (au démarrage, au retour du réseau,
 * en fin de séance), et le service worker peut lancer `envoyerFile` seul.
 *
 * Rien ne se perd. Un événement quitte la file seulement après que le serveur a répondu ; si la
 * réponse se perd, le lot est renvoyé, et le serveur ignore les `id` qu'il connaît. Côté appareil,
 * l'union se fait par `id` (le premier fait foi), si bien que rien n'est compté deux fois.
 *
 * Pas même ce que le serveur perdrait après l'avoir accepté, à la restauration d'une sauvegarde
 * plus ancienne : un événement accepté passe de la file à la note des envois, jusqu'à ce qu'une
 * lecture menée jusqu'au bout le rende (2b-D4, `lireJusquALaFin`). Le service worker la tient comme
 * la page : il envoie par le même `envoyerLesLots`.
 *
 * Une seule exception, qui n'est pas de ce module : la personne qui se déconnecte peut abandonner
 * sa file, en connaissance de cause (`abandonnerLaFile`, dans `stockage/journal-local.ts`, R31b).
 */

import type { Evenement } from '../domaine/journal/evenement.js';
import {
  type CoursResume,
  ErreurApi,
  envoyerJournal,
  lireJournal,
  listerCours,
  type PageJournal,
} from './api.js';
import type { BaseLocale } from './stockage/base-locale.js';
import { oublierCours } from './stockage/cours-local.js';
import {
  confirmerLEnvoi,
  coursEnAttente,
  evenementsDuCours,
  fileDuCours,
  noteDesEnvois,
  positionDuCours,
  recevoirEvenements,
  solderLaNote,
} from './stockage/journal-local.js';

/**
 * Où en est la synchronisation :
 * - `a_jour` : tout est parti, tout est lu ;
 * - `en_attente` : des événements restent dans la file, ou la synchronisation n'a pas pu aller au
 *   bout, sans que le réseau, la session ou le droit en soit la cause (une requête refusée, un
 *   serveur qui répond mal, une réponse donnée pendant la synchronisation, un blocage) : ils seront
 *   renvoyés à la synchronisation suivante ;
 * - `hors_ligne` : le serveur ne répond pas ;
 * - `reconnexion` : la session a expiré (401), ou elle est celle d'une autre personne (409
 *   `autre_personne`, R21 et R32) : la file attend que sa personne se reconnecte, et rien de ce
 *   que le serveur aurait rendu n'est rangé ;
 * - `indisponible` : le serveur dit le cours introuvable et la liste des cours ne le contient plus :
 *   le cours a été oublié ; sa file est gardée.
 */
export type EtatSynchro = 'a_jour' | 'en_attente' | 'hors_ligne' | 'reconnexion' | 'indisponible';

export interface ResultatSynchro {
  etat: EtatSynchro;
  /** Le nombre d'événements encore dans la file du cours. */
  enAttente: number;
}

export interface ApiJournal {
  /**
   * Envoie un lot de la file de `personne`. Le serveur le refuse (409) si la session n'est pas la
   * sienne : la file d'une personne ne part jamais sous la session d'une autre (R21).
   */
  envoyer(cours: string, evenements: Evenement[], personne: string): Promise<void>;
  /**
   * Lit le journal de `personne` depuis `depuis`. Le serveur refuse (409) si la session n'est pas
   * la sienne : on ne range jamais chez une personne le journal d'une autre (R32).
   */
  lire(cours: string, depuis: number, personne: string): Promise<PageJournal>;
  /**
   * La liste des cours de `personne` (`GET /api/cours`). Elle confirme qu'un « introuvable » du
   * journal est bien un droit retiré : cette route existe dans toutes les versions du serveur. Le
   * serveur refuse (409) si la session n'est pas la sienne : on n'oublie jamais un cours d'après la
   * liste d'une autre personne (R36).
   */
  lister(personne: string): Promise<CoursResume[]>;
}

/** Le plus grand lot d'un envoi : celui que le serveur accepte (`LOT_MAX`). */
const LOT_ENVOI = 500;

/** L'API du serveur, par `fetch`. */
export function apiDuJournal(recuperer: typeof fetch = fetch): ApiJournal {
  return {
    async envoyer(cours, evenements, personne) {
      await envoyerJournal(cours, evenements, personne, recuperer);
    },
    lire: (cours, depuis, personne) => lireJournal(cours, depuis, personne, recuperer),
    lister: (personne) => listerCours(personne, recuperer),
  };
}

// ------------------------------------------------------------------------------------------------
// Ce qui est en cours sur une base, et son blocage

interface SynchroEnCours {
  courante: Promise<ResultatSynchro>;
  /** La synchronisation programmée pour la fin de la courante ; les appels suivants la partagent. */
  relance: Promise<ResultatSynchro> | undefined;
}

interface Suivi {
  /** Les synchronisations et les envois en cours ou programmés. */
  enCours: Set<Promise<unknown>>;
  /** Par (personne, cours) : la synchronisation en cours, et sa relance. */
  parCours: Map<string, SynchroEnCours>;
  /** Le nombre de blocages posés et pas encore levés. */
  blocages: number;
}

const suivis = new WeakMap<BaseLocale, Suivi>();

function suiviDe(base: BaseLocale): Suivi {
  let suivi = suivis.get(base);
  if (suivi === undefined) {
    suivi = { enCours: new Set(), parCours: new Map(), blocages: 0 };
    suivis.set(base, suivi);
  }
  return suivi;
}

/** Garde la trace d'une promesse tant qu'elle n'est pas réglée (réussie ou non). */
function suivre<T>(suivi: Suivi, promesse: Promise<T>): Promise<T> {
  suivi.enCours.add(promesse);
  const retirer = () => {
    suivi.enCours.delete(promesse);
  };
  promesse.then(retirer, retirer);
  return promesse;
}

/**
 * Bloque les synchronisations d'une base : tant qu'un blocage au moins est posé, `synchroniserCours`
 * et `envoyerFile` ne font aucune requête et rendent `en_attente`. Rend la fonction qui lève ce
 * blocage (une seule fois : la lever deux fois ne lève pas le blocage d'un autre).
 *
 * C'est ce qui permet de ne jamais envoyer la file d'une personne sous la session d'une autre : on
 * bloque, on attend (`attendreLesSynchronisations`), on change de session, puis on lève le blocage.
 */
export function bloquerSynchronisations(base: BaseLocale): () => void {
  const suivi = suiviDe(base);
  suivi.blocages += 1;
  let leve = false;
  return () => {
    if (leve) return;
    leve = true;
    suivi.blocages -= 1;
  };
}

/**
 * Se résout quand aucune synchronisation ni aucun envoi (`synchroniserCours`, `envoyerFile`, y
 * compris une relance programmée) n'est en cours sur cette base. Il ne rejette jamais : l'échec
 * d'une synchronisation regarde celui qui l'a lancée.
 */
export async function attendreLesSynchronisations(base: BaseLocale): Promise<void> {
  const { enCours } = suiviDe(base);
  while (enCours.size > 0) {
    await Promise.allSettled([...enCours]);
  }
}

class SynchronisationBloquee extends Error {
  constructor() {
    super('Les synchronisations sont bloquées.');
    this.name = 'SynchronisationBloquee';
  }
}

/** L'API, sauf que chaque requête vérifie d'abord qu'aucun blocage n'est posé. */
function garder(base: BaseLocale, api: ApiJournal): ApiJournal {
  const suivi = suiviDe(base);
  const verifier = () => {
    if (suivi.blocages > 0) throw new SynchronisationBloquee();
  };
  return {
    envoyer: async (cours, evenements, personne) => {
      verifier();
      await api.envoyer(cours, evenements, personne);
    },
    lire: async (cours, depuis, personne) => {
      verifier();
      return api.lire(cours, depuis, personne);
    },
    lister: async (personne) => {
      verifier();
      return api.lister(personne);
    },
  };
}

// ------------------------------------------------------------------------------------------------
// L'envoi et la lecture

/**
 * Envoie la file d'un cours par lots de 500, dans l'ordre du journal. Un lot quitte la file pour la
 * note des envois une fois le serveur répondu (`confirmerLEnvoi`, 2b-D4) ; la file est relue à
 * chaque tour, si bien qu'une réponse donnée pendant l'envoi part avec les autres.
 */
async function envoyerLesLots(
  base: BaseLocale,
  personne: string,
  cours: string,
  api: ApiJournal,
): Promise<void> {
  for (;;) {
    const lot = (await fileDuCours(base, personne, cours)).slice(0, LOT_ENVOI);
    if (lot.length === 0) return;
    await api.envoyer(cours, lot, personne);
    await confirmerLEnvoi(
      base,
      personne,
      lot.map(({ id }) => id),
    );
  }
}

/** Où en est une lecture du journal d'un cours (`lireJusquALaFin`). */
interface Lecture {
  /** Le numéro d'où lire la page suivante. */
  depuis: number;
  /** Vrai pendant la relecture complète : les pages entrent au journal, le curseur ne bouge pas. */
  relecture: boolean;
  /** Les `id` que le serveur a rendus depuis le début de la lecture, ou de la relecture. */
  rendus: Set<string>;
  /** Les événements de la dernière page non vide : ils désignent l'événement du curseur à ranger. */
  derniereNonVide: Evenement[];
}

const relectureComplete = (): Lecture => ({
  depuis: 0,
  relecture: true,
  rendus: new Set(),
  derniereNonVide: [],
});

/**
 * Lit le journal du cours depuis le curseur, page par page, jusqu'à `suite: false`. Chaque page
 * entre au journal local avec son curseur, d'un seul tenant : une coupure au milieu reprend à la
 * dernière page rangée.
 *
 * **Le recul se voit à l'identité.** Avec un curseur c > 0, la lecture part de c − 1, si bien que
 * le premier événement rendu est celui du numéro c : ce doit être celui que l'appareil a rangé à ce
 * curseur (`dernier`). Sinon, ou si la page revient vide, le serveur a été restauré d'une
 * sauvegarde plus ancienne (R11/R17). Comparer seulement les numéros ne suffit pas : des
 * événements envoyés depuis (par cet appareil ou un autre) font repasser le curseur du serveur au-
 * dessus du nôtre. Un curseur dont on ne connaît plus l'événement ne prouve rien : même traitement.
 *
 * **Et à la note des envois** (2b-D4). Les `id` notés avant que la lecture demande sa dernière
 * page, le serveur les avait acceptés : une lecture menée jusqu'au bout doit tous les rendre. S'il
 * en manque un, le serveur a pu perdre des événements sans que l'identité le montre (les limites a
 * et b de R17) :
 * - un envoi sans lecture (celui du service worker), ou suivi d'une lecture coupée, puis une
 *   restauration à une sauvegarde qui a encore l'événement du curseur ;
 * - ou cet événement, absent de la sauvegarde, revenu au même numéro par un autre appareil.
 *
 * L'`id` peut aussi être chez le serveur sous la fenêtre de la lecture :
 * - une lecture coupée a fait avancer le curseur au-delà ;
 * - une lecture l'a rendu, puis une confirmation l'a noté après le solde (`confirmerLEnvoi`) ;
 * - la page s'est arrêtée entre la fin d'une lecture et son solde.
 *
 * Seule la relecture complète tranche : même traitement que le recul. Une lecture partie de 0
 * (curseur 0 ou 1) en tient lieu.
 *
 * Le recul déclenche la relecture complète depuis 0 ; l'union par `id` ne perd aucun événement
 * local. Les événements locaux que le serveur n'a pas rendus, il les a perdus : ils sont remis dans
 * la file (R13), pour la même personne, et eux seuls. Pendant la relecture le curseur gardé ne
 * bouge pas, et ne prend sa valeur qu'une fois ces événements remis en file : une coupure en chemin
 * retrouve le recul (ou l'`id` qui manque) à la fois suivante, et la relecture reprend du début.
 *
 * La note ne change qu'au bout d'une lecture (`solderLaNote`) : ce que le serveur a rendu en sort,
 * et, après une relecture complète, ce qu'elle attendait en vain, remis en file. Une lecture coupée
 * ne la touche pas.
 *
 * Rend le nombre d'événements remis dans la file, que l'appelant envoie.
 */
async function lireJusquALaFin(
  base: BaseLocale,
  personne: string,
  cours: string,
  api: ApiJournal,
): Promise<number> {
  const garde = await positionDuCours(base, personne, cours);
  const depart = Math.max(garde.curseur - 1, 0);
  let lecture: Lecture = {
    depuis: depart,
    relecture: false,
    rendus: new Set(),
    derniereNonVide: [],
  };
  let aVerifier = garde.curseur > 0;
  for (;;) {
    // La note juste avant la requête : ces `id`, le serveur les avait déjà acceptés.
    const notes = await noteDesEnvois(base, personne, cours);
    const page = await api.lire(cours, lecture.depuis, personne);
    if (aVerifier) {
      aVerifier = false;
      if (curseurRecule(garde.dernier, page)) {
        lecture = relectureComplete();
        continue;
      }
    }
    // Une page qui n'avance pas, alors qu'elle annonce une suite, bouclerait sans fin.
    const derniere = !page.suite || page.curseur <= lecture.depuis;
    if (page.evenements.length > 0) lecture.derniereNonVide = page.evenements;
    await recevoirEvenements(
      base,
      personne,
      cours,
      page.evenements,
      lecture.relecture ? undefined : page.curseur,
    );
    for (const { id } of page.evenements) lecture.rendus.add(id);
    if (!derniere) {
      lecture.depuis = page.curseur;
      continue;
    }
    const { rendus } = lecture;
    const attenduEnVain = notes.some((id) => !rendus.has(id));
    if (!lecture.relecture && !attenduEnVain) {
      await solderLaNote(base, personne, cours, rendus);
      return 0;
    }
    if (lecture.relecture || depart === 0) {
      return terminerLaRelecture(base, personne, cours, lecture, notes, page.curseur);
    }
    lecture = relectureComplete();
  }
}

/**
 * Le curseur de l'appareil a-t-il reculé (R11/R17) ? `page` est la première page lue, à partir de
 * c − 1 : son premier événement doit être `dernier`, celui rangé au curseur c. Une page vide, ou un
 * curseur dont on ne connaît plus l'événement, ne prouve rien : même réponse, vrai.
 */
function curseurRecule(dernier: string | undefined, page: { evenements: readonly Evenement[] }) {
  return dernier === undefined || page.evenements[0]?.id !== dernier;
}

/**
 * La fin d'une lecture du journal entier, depuis 0 : les événements locaux que le serveur n'a pas
 * rendus sont perdus et remis dans la file (R13). D'un seul tenant, la note des envois perd ce
 * qu'il a rendu et ce qu'elle attendait de lui (`notes`, la note d'avant la dernière page) : ce
 * qu'il n'a pas rendu est remis en file avec les autres perdus (2b-D4). Un `id` noté dont
 * l'appareil n'a plus l'événement ne peut pas repartir : il sort de la note. Cela arrive après un
 * cours oublié, puis rendu, et quand le journal local a été vidé mais pas la file : une déconnexion
 * sans abandon (`viderSaufLesFiles`, décision 12 du lot 1d), ou la réservation de l'appareil par
 * une autre personne (`reserverA`). Puis, et seulement alors, le curseur prend sa valeur
 * (`curseur`, rangé sur la dernière page non vide). Rend le nombre d'événements remis dans la file.
 */
async function terminerLaRelecture(
  base: BaseLocale,
  personne: string,
  cours: string,
  { rendus, derniereNonVide }: Lecture,
  notes: readonly string[],
  curseur: number,
): Promise<number> {
  const perdus = (await evenementsDuCours(base, personne, cours)).filter(
    ({ id }) => !rendus.has(id),
  );
  await solderLaNote(base, personne, cours, new Set([...rendus, ...notes]), perdus);
  await recevoirEvenements(base, personne, cours, derniereNonVide, curseur);
  return perdus.length;
}

/**
 * Le cours est-il absent de la liste des cours de la personne ? Faux si la liste est injoignable
 * (réseau, session expirée ou d'une autre personne, serveur) ou d'une forme inattendue : dans le
 * doute, on n'oublie rien.
 */
async function absentDeLaListe(api: ApiJournal, personne: string, cours: string): Promise<boolean> {
  try {
    return !(await api.lister(personne)).some(({ id }) => id === cours);
  } catch (erreur) {
    if (erreur instanceof ErreurApi || erreur instanceof SynchronisationBloquee) return false;
    throw erreur;
  }
}

/**
 * Ce qui a arrêté un appel : un état de synchronisation, ou `refuse` (le serveur refuse la requête,
 * 400 : la renvoyer telle quelle n'y changera rien). À l'écran, un `refuse` se dit `en_attente`.
 */
type Motif = Exclude<EtatSynchro, 'a_jour'> | 'refuse';

/**
 * Le motif de l'échec d'un appel, ou l'échec lui-même s'il n'est pas de l'API (une panne de
 * stockage, un bogue) : il remonte, il n'a pas à passer pour un état de synchronisation.
 *
 * - blocage posé : `en_attente`, rien n'a été demandé au serveur ;
 * - pas de réponse (`reseau`) : `hors_ligne` ;
 * - 401, ou 409 `autre_personne` (la session est celle d'une autre personne) : `reconnexion` ;
 * - `introuvable` : le serveur répond ainsi pour un cours sans droit, mais aussi pour **toute** route
 *   d'API qu'il ne connaît pas (après un retour arrière vers une image plus ancienne, par exemple).
 *   On le confirme par `GET /api/cours`, qui existe dans toutes les versions : le cours n'est oublié
 *   (`indisponible`, file gardée, décision 13) que s'il est absent de la liste rendue. Si la liste
 *   est injoignable ou d'une forme inattendue, ou si le cours y figure, on n'oublie rien :
 *   `en_attente` ;
 * - 400 : une requête refusée, `refuse` ;
 * - tout le reste (429, 5xx, réponse illisible) : une erreur de serveur, `en_attente`.
 *
 * Dans les deux derniers cas, la file est gardée et n'est pas renvoyée dans la même
 * synchronisation.
 */
async function motifDeLEchec(
  erreur: unknown,
  base: BaseLocale,
  personne: string,
  cours: string,
  api: ApiJournal,
): Promise<Motif> {
  if (erreur instanceof SynchronisationBloquee) return 'en_attente';
  if (!(erreur instanceof ErreurApi)) throw erreur;
  if (erreur.code === 'reseau') return 'hors_ligne';
  if (erreur.code === 'non_connecte' || erreur.code === 'autre_personne') return 'reconnexion';
  if (erreur.code === 'introuvable') {
    if (!(await absentDeLaListe(api, personne, cours))) return 'en_attente';
    await oublierCours(base, personne, cours);
    return 'indisponible';
  }
  return erreur.statut === 400 ? 'refuse' : 'en_attente';
}

/** L'état que dit l'échec d'un appel (`motifDeLEchec`). */
async function etatDeLEchec(
  erreur: unknown,
  base: BaseLocale,
  personne: string,
  cours: string,
  api: ApiJournal,
): Promise<EtatSynchro> {
  const motif = await motifDeLEchec(erreur, base, personne, cours, api);
  return motif === 'refuse' ? 'en_attente' : motif;
}

// ------------------------------------------------------------------------------------------------
// Les points d'entrée

async function synchroniser(
  base: BaseLocale,
  personne: string,
  cours: string,
  api: ApiJournal,
): Promise<ResultatSynchro> {
  let echec: EtatSynchro | undefined;
  try {
    await envoyerLesLots(base, personne, cours, api);
    // Après une restauration du serveur, ce qu'il a perdu est remis en file : on l'envoie aussitôt.
    if ((await lireJusquALaFin(base, personne, cours, api)) > 0) {
      await envoyerLesLots(base, personne, cours, api);
    }
  } catch (erreur) {
    echec = await etatDeLEchec(erreur, base, personne, cours, api);
  }
  const enAttente = (await fileDuCours(base, personne, cours)).length;
  return { etat: echec ?? (enAttente === 0 ? 'a_jour' : 'en_attente'), enAttente };
}

function lancer(
  base: BaseLocale,
  suivi: Suivi,
  cle: string,
  personne: string,
  cours: string,
  api: ApiJournal,
): Promise<ResultatSynchro> {
  const courante = suivre(suivi, synchroniser(base, personne, cours, garder(base, api))).finally(
    () => {
      // La place est libérée, sauf si une relance attend : elle prend la suite.
      if (etat.relance === undefined && suivi.parCours.get(cle) === etat) {
        suivi.parCours.delete(cle);
      }
    },
  );
  const etat: SynchroEnCours = { courante, relance: undefined };
  suivi.parCours.set(cle, etat);
  return courante;
}

const ignorer = () => {};

/**
 * Synchronise un cours : envoie sa file, puis lit depuis le curseur. Rend l'état et le nombre
 * d'événements encore dans la file de ce cours. L'envoi qui échoue arrête la synchronisation : on
 * ne lit pas ce qu'on ne peut pas encore écrire.
 *
 * Un appel lancé pendant une synchronisation de la même (base, personne, cours) programme **une
 * seule relance**, qui démarre à la fin de celle en cours et dont il reçoit le résultat ; les appels
 * suivants, tant que la même synchronisation dure, partagent cette relance. Rien n'est envoyé deux
 * fois en même temps, et une réponse donnée pendant la lecture part aussitôt après. Un appel lancé
 * après la fin démarre une synchronisation neuve.
 *
 * Si les synchronisations de la base sont bloquées (`bloquerSynchronisations`), aucune requête n'est
 * faite et le résultat est `en_attente`.
 */
export function synchroniserCours(
  base: BaseLocale,
  personne: string,
  cours: string,
  api: ApiJournal = apiDuJournal(),
): Promise<ResultatSynchro> {
  const suivi = suiviDe(base);
  if (suivi.blocages > 0) {
    return fileDuCours(base, personne, cours).then(({ length }) => ({
      etat: 'en_attente',
      enAttente: length,
    }));
  }
  const cle = JSON.stringify([personne, cours]);
  const enMarche = suivi.parCours.get(cle);
  if (enMarche === undefined) return lancer(base, suivi, cle, personne, cours, api);

  enMarche.relance ??= suivre(
    suivi,
    enMarche.courante
      .then(ignorer, ignorer)
      .then(() => lancer(base, suivi, cle, personne, cours, api)),
  );
  return enMarche.relance;
}

/**
 * Envoie la file de chaque cours de la personne ; rend le motif de chaque cours resté en attente.
 * Le réseau ou la session qui manquent arrêtent l'envoi : les autres cours échoueraient de même.
 */
async function envoyerLesFiles(
  base: BaseLocale,
  personne: string,
  api: ApiJournal,
): Promise<Motif[]> {
  const motifs: Motif[] = [];
  for (const cours of await coursEnAttente(base, personne)) {
    try {
      await envoyerLesLots(base, personne, cours, api);
    } catch (erreur) {
      const motif = await motifDeLEchec(erreur, base, personne, cours, api);
      motifs.push(motif);
      if (motif === 'hors_ligne' || motif === 'reconnexion') break;
    }
  }
  return motifs;
}

/** L'état le plus utile à celui qui décidera de réessayer (voir `envoyerFile`). */
function etatDesMotifs(motifs: readonly Motif[]): EtatSynchro {
  if (motifs.includes('hors_ligne')) return 'hors_ligne';
  if (motifs.includes('reconnexion')) return 'reconnexion';
  if (motifs.includes('en_attente') || motifs.includes('refuse')) return 'en_attente';
  return motifs.length > 0 ? 'indisponible' : 'a_jour';
}

/**
 * Envoie toute la file de la personne, cours par cours, sans rien lire. Le service worker s'en
 * sert (synchronisation en arrière-plan). Le réseau ou la session qui manquent arrêtent l'envoi :
 * les autres cours échoueraient de même. Un cours en échec pour un autre motif n'empêche pas les
 * suivants de partir. Rend `a_jour` si tout est parti ; sinon l'état le plus utile à celui qui
 * décidera de réessayer : `hors_ligne` ou `reconnexion`, puis `en_attente`, puis `indisponible`.
 *
 * Si les synchronisations de la base sont bloquées, aucune requête n'est faite : `en_attente`.
 */
export function envoyerFile(
  base: BaseLocale,
  personne: string,
  api: ApiJournal = apiDuJournal(),
): Promise<EtatSynchro> {
  const suivi = suiviDe(base);
  if (suivi.blocages > 0) return Promise.resolve('en_attente');
  return suivre(suivi, envoyerLesFiles(base, personne, garder(base, api)).then(etatDesMotifs));
}

/**
 * Pourquoi des réponses restent dans la file après un envoi, et si réessayer peut y changer
 * quelque chose :
 * - `reseau` : le serveur ne répond pas ;
 * - `session` : la session a expiré, ou elle est celle d'une autre personne ; se reconnecter
 *   suffira ;
 * - `serveur` : le serveur est en panne, trop sollicité, n'a pas confirmé, ou les
 *   synchronisations sont bloquées ; réessayer suffira ;
 * - `durable` : le droit sur le cours est retiré, ou le serveur refuse le lot (400) ; ni l'un ni
 *   l'autre ne changera en réessayant.
 *
 * Une cause passagère l'emporte sur une cause durable.
 */
export type CauseDeLAttente = 'reseau' | 'session' | 'serveur' | 'durable';

function causeDesMotifs(motifs: readonly Motif[]): CauseDeLAttente | undefined {
  if (motifs.includes('hors_ligne')) return 'reseau';
  if (motifs.includes('reconnexion')) return 'session';
  if (motifs.includes('en_attente')) return 'serveur';
  return motifs.length > 0 ? 'durable' : undefined;
}

/**
 * L'envoi de la déconnexion : comme `envoyerFile`, mais rend la cause de ce qui reste dans la
 * file (`CauseDeLAttente`), ou `undefined` si tout est parti. La déconnexion n'efface rien tant que
 * la cause est passagère (R31b).
 */
export async function envoyerFileAvantDeconnexion(
  base: BaseLocale,
  personne: string,
  api: ApiJournal = apiDuJournal(),
): Promise<CauseDeLAttente | undefined> {
  const suivi = suiviDe(base);
  if (suivi.blocages > 0) {
    return (await coursEnAttente(base, personne)).length > 0 ? 'serveur' : undefined;
  }
  return causeDesMotifs(await suivre(suivi, envoyerLesFiles(base, personne, garder(base, api))));
}
