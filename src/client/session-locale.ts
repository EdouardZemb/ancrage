/*
 * La session vue de l'appareil (ADR-0004, décisions 12 et 14 du lot 1d) : qui est connecté, ce
 * que l'appareil sait de lui quand le serveur ne répond pas, et ce qui change quand la personne
 * change.
 *
 * L'identité connue est rangée dans IndexedDB (magasin `etat`, clé `moi`) : elle permet de
 * démarrer hors ligne, et désigne la file qu'envoie le service worker. Elle n'est jamais celle
 * d'une autre personne que la dernière connectée (R35).
 *
 * **La file d'une personne ne part jamais sous la session d'une autre** (R19). Avant tout
 * changement de session (connexion, invitation, lien, déconnexion, suppression du compte), les
 * synchronisations sont suspendues : les minuteurs annulés, les nouvelles bloquées, celles en cours
 * attendues (10 s au plus). À la reprise, le blocage est levé une fois finies les synchronisations
 * d'avant, ou au bout de 10 s : une requête qui pend ne bloque pas la personne suivante, et une
 * requête tardive faite sous une autre session est refusée par le serveur (409, R21 et R32). Un
 * nettoyage final retire alors ce qu'une synchronisation d'avant a pu ranger depuis.
 *
 * Ce module est celui de la page (`localStorage`, `caches`) : le service worker ne l'importe pas.
 */
import { appeler, compteSupprime, ErreurApi, type Moi, supprimerSonCompte } from './api.js';
import { effacerPreferences } from './cours/preferences.js';
import { annulerSynchrosProgrammees } from './declencheurs.js';
import { ErreurReponsesEnAttente, type MotifDeLAttente } from './erreurs.js';
import { signalerClesAcceptees } from './passkeys-signal.js';
import {
  type BaseLocale,
  memoriserMoi,
  moiLocal,
  oublierMoi,
  reserverA,
  viderSaufLesFiles,
} from './stockage/base-locale.js';
import { abandonnerLaFile, nombreEnAttente } from './stockage/journal-local.js';
import {
  type ApiJournal,
  apiDuJournal,
  attendreLesSynchronisations,
  bloquerSynchronisations,
  type CauseDeLAttente,
  envoyerFileAvantDeconnexion,
} from './synchro.js';

export { memoriserMoi };

/** Ce que l'application sait de la session. */
export type EtatSession =
  | { etat: 'chargement' }
  | { etat: 'anonyme' }
  /**
   * Une session valide. `stockageEnEchec` : l'appareil n'a pas pu être réservé à la personne
   * (`adopterPersonne`) ; l'application le signale.
   */
  | { etat: 'connecte'; moi: Moi; stockageEnEchec?: true }
  /** `GET /api/moi` est injoignable, et l'appareil connaît la personne : on révise hors ligne. */
  | { etat: 'hors_ligne'; moi: Moi }
  /** La session a expiré (401), et l'appareil connaît la personne : on révise (décision 14). */
  | { etat: 'expiree'; moi: Moi }
  /** `GET /api/moi` est injoignable, et l'appareil ne connaît personne. */
  | { etat: 'injoignable' };

/** L'attente la plus longue des synchronisations, avant et après un changement de session. */
const ATTENTE_MAX_MS = 10_000;

const ignorer = () => {};

/** Une échéance, `ms` à partir de maintenant ; `annuler` libère son minuteur. */
function echeance(ms: number) {
  let minuteur: ReturnType<typeof setTimeout> | undefined;
  const atteinte = new Promise<void>((resolve) => {
    minuteur = setTimeout(resolve, ms);
  });
  return { atteinte, annuler: () => clearTimeout(minuteur) };
}

/** Attend `promesse` (réussie ou non), mais pas au-delà de l'échéance. Ne rejette jamais. */
function auPlus(promesse: Promise<unknown>, limite: ReturnType<typeof echeance>): Promise<void> {
  return Promise.race([promesse.then(ignorer, ignorer), limite.atteinte]);
}

/**
 * Le nettoyage final d'un changement de session : ce qu'une synchronisation d'avant a pu ranger
 * depuis (une réponse du serveur arrivée tard) est retiré, sauf les files. L'appareil reste à la
 * personne qu'il connaît maintenant ; s'il n'en connaît plus aucune (après une déconnexion), tout
 * est vidé sauf les files.
 */
async function nettoyer(base: BaseLocale): Promise<void> {
  try {
    const connue = await moiLocal(base);
    if (connue === undefined) await viderSaufLesFiles(base);
    else await reserverA(base, connue.id);
  } catch {
    // Le stockage refuse : il n'y a rien de plus à faire.
  }
}

/** La reprise des synchronisations ; `apresUnChangement` : la session a changé, on nettoie. */
export type Reprise = (apresUnChangement?: boolean) => void;

/**
 * La levée d'un blocage, une fois finies les synchronisations d'avant ou au bout de 10 s ; après
 * un changement de session, précédée du nettoyage final.
 */
function reprendreApres(base: BaseLocale, debloquer: () => void): Reprise {
  let demandee = false;
  return (apresUnChangement = true) => {
    if (demandee) return;
    demandee = true;
    // Tant que le blocage tient, une synchronisation nouvelle ne démarre pas : l'attente ne
    // porte que sur celles d'avant.
    const limite = echeance(ATTENTE_MAX_MS);
    void auPlus(attendreLesSynchronisations(base), limite)
      .then(() => (apresUnChangement ? nettoyer(base) : undefined))
      .finally(() => {
        limite.annuler();
        debloquer();
      });
  };
}

/** La personne connue de l'appareil ; `undefined` sans stockage. */
async function personneConnue(base: BaseLocale | undefined): Promise<Moi | undefined> {
  if (base === undefined) return undefined;
  try {
    return await moiLocal(base);
  } catch {
    return undefined;
  }
}

/**
 * Suspend les synchronisations avant un changement de session (R19) : annule celles qui sont
 * programmées, bloque les nouvelles, attend celles en cours (10 s au plus). Rend la reprise, à
 * appeler une fois la nouvelle session en place (`reprendre()`), ou la cérémonie annulée ou
 * échouée (`reprendre(false)` : rien n'a changé, rien n'est à nettoyer).
 */
export async function suspendreLesSynchronisations(base: BaseLocale | undefined): Promise<Reprise> {
  annulerSynchrosProgrammees();
  // Sans base locale, aucune synchronisation ne peut avoir lieu.
  if (base === undefined) return ignorer;
  const reprendre = reprendreApres(base, bloquerSynchronisations(base));
  const limite = echeance(ATTENTE_MAX_MS);
  await auPlus(attendreLesSynchronisations(base), limite);
  limite.annuler();
  return reprendre;
}

/** `action` sous des synchronisations suspendues, qui reprennent quoi qu'il arrive. */
export async function avecSynchronisationsSuspendues<T>(
  base: BaseLocale | undefined,
  action: () => Promise<T>,
): Promise<T> {
  const reprendre = await suspendreLesSynchronisations(base);
  let reussie = false;
  try {
    const resultat = await action();
    reussie = true;
    return resultat;
  } finally {
    reprendre(reussie);
  }
}

/**
 * Réserve l'appareil à la personne qui vient de se connecter (décision 12, Review Focus 3) : tout
 * ce qui est à une autre personne est effacé (cours, contenu, journal, curseurs, préférences), sauf
 * les files d'envoi (`reserverA`) ; puis elle devient la personne connue de l'appareil. À faire
 * sous des synchronisations suspendues.
 *
 * L'identité de la personne précédente ne reste jamais (R35) : si le stockage refuse la
 * réservation, l'identité est retirée plutôt que remplacée. L'appareil ne connaît alors plus
 * personne : rien de la personne précédente ne s'affiche au démarrage hors ligne suivant, et la
 * réservation est refaite au démarrage en ligne suivant. Rend `false` si une écriture a échoué :
 * l'échec est à signaler.
 */
export async function adopterPersonne(base: BaseLocale | undefined, moi: Moi): Promise<boolean> {
  effacerPreferences(moi.id);
  if (base === undefined) return true;
  let reservee = true;
  try {
    await reserverA(base, moi.id);
  } catch {
    reservee = false;
  }
  try {
    if (reservee) await memoriserMoi(base, moi);
    else await oublierMoi(base);
    return reservee;
  } catch {
    // Ni remplacée ni retirée : on tente encore de la retirer.
    await oublierMoi(base).catch(ignorer);
    return false;
  }
}

/**
 * La session au démarrage, d'après `GET /api/moi` (`lire`) et la personne connue de l'appareil :
 * - une session valide : `connecte`. Si l'appareil connaissait une autre personne (ou personne),
 *   il est réservé à celle-ci (`adopterPersonne`, synchronisations suspendues) ; un échec le dit
 *   (`stockageEnEchec`) ;
 * - pas de session (401) : `expiree` si l'appareil connaît la personne, `anonyme` sinon ;
 * - pas de réponse, ou une réponse qui n'est pas celle du serveur : `hors_ligne` si l'appareil
 *   connaît la personne, `injoignable` sinon.
 */
export async function resoudreSession(
  base: BaseLocale | undefined,
  lire: () => Promise<Moi | undefined>,
): Promise<EtatSession> {
  let moi: Moi | undefined;
  try {
    moi = await lire();
  } catch {
    const connue = await personneConnue(base);
    return connue === undefined ? { etat: 'injoignable' } : { etat: 'hors_ligne', moi: connue };
  }
  const connue = await personneConnue(base);
  if (moi === undefined) {
    return connue === undefined ? { etat: 'anonyme' } : { etat: 'expiree', moi: connue };
  }
  const session = moi;
  if (connue?.id === session.id) {
    // La même personne : son nom ou sa langue ont pu changer.
    if (base !== undefined) await memoriserMoi(base, session).catch(ignorer);
    return { etat: 'connecte', moi: session };
  }
  const reservee = await avecSynchronisationsSuspendues(base, () => adopterPersonne(base, session));
  return reservee
    ? { etat: 'connecte', moi: session }
    : { etat: 'connecte', moi: session, stockageEnEchec: true };
}

/** Ce dont la déconnexion et la suppression du compte ont besoin du serveur. */
export interface ApiSession {
  /** Pour envoyer la file avant de fermer la session. */
  journal: ApiJournal;
  /** Ferme la session sur le serveur (`POST /api/auth/deconnexion`). */
  deconnecter(): Promise<void>;
  /**
   * Supprime le compte de la session sur le serveur (`DELETE /api/moi`, 1e-D4) ; la session part
   * avec lui. `personne` est celle dont l'écran demande la suppression : le serveur refuse (409
   * `autre_personne`) si la session est celle d'une autre (1e-R13), et pour le compte du
   * propriétaire (409 `proprietaire`).
   */
  supprimerCompte(personne: string): Promise<void>;
}

export function apiDeSession(recuperer: typeof fetch = fetch): ApiSession {
  return {
    journal: apiDuJournal(recuperer),
    deconnecter: () => appeler('POST', '/api/auth/deconnexion', undefined, recuperer),
    supprimerCompte: (personne) => supprimerSonCompte(personne, recuperer),
  };
}

/** Ce que la déconnexion efface hors d'IndexedDB ; absent d'un navigateur qui ne l'a pas. */
export interface EnvironnementDeconnexion {
  caches: Pick<CacheStorage, 'keys' | 'delete'> | undefined;
  conteneur: Pick<ServiceWorkerContainer, 'getRegistrations'> | undefined;
}

function environnementDeLaPage(): EnvironnementDeconnexion {
  try {
    return {
      caches: typeof caches === 'undefined' ? undefined : caches,
      conteneur: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    };
  } catch {
    // Un contexte qui refuse l'accès : il n'y a rien à effacer.
    return { caches: undefined, conteneur: undefined };
  }
}

/** Ferme la session sur le serveur ; une session déjà expirée l'est déjà. */
async function fermerLaSession(api: ApiSession): Promise<void> {
  try {
    await api.deconnecter();
  } catch (erreur) {
    if (!(erreur instanceof ErreurApi && erreur.code === 'non_connecte')) throw erreur;
  }
}

/**
 * Tous les caches (le précache de l'application, et lui seul : décision 11), puis le service
 * worker, qui se réinstallera au chargement suivant. Ni l'un ni l'autre ne contient de donnée
 * personnelle : un échec ici ne retient pas la déconnexion.
 */
async function effacerLApplication(environnement: EnvironnementDeconnexion): Promise<void> {
  try {
    for (const nom of (await environnement.caches?.keys()) ?? []) {
      await environnement.caches?.delete(nom);
    }
  } catch {
    // Voir plus haut.
  }
  try {
    for (const enregistrement of (await environnement.conteneur?.getRegistrations()) ?? []) {
      await enregistrement.unregister();
    }
  } catch {
    // Voir plus haut.
  }
}

/**
 * Efface l'appareil de `personne`, qui s'en va (déconnexion, suppression du compte) : IndexedDB
 * (journal local, contenus, listes, curseurs, identité) sauf les files non vides (R33), les
 * préférences, tous les caches et le service worker. Avec `abandonner`, la file de la personne
 * est d'abord abandonnée, cause durable comprise : les files des autres personnes restent.
 * Si le stockage refuse, les préférences, les caches et le service worker s'effacent quand même,
 * puis l'échec remonte.
 */
async function effacerLAppareil(
  base: BaseLocale | undefined,
  personne: string,
  environnement: EnvironnementDeconnexion,
  abandonner: boolean,
): Promise<void> {
  try {
    if (base !== undefined) {
      if (abandonner) await abandonnerLaFile(base, personne);
      await viderSaufLesFiles(base);
    }
  } finally {
    // Ce qui ne dépend pas du stockage s'efface même s'il refuse : la session est déjà fermée.
    effacerPreferences();
    await effacerLApplication(environnement);
  }
}

/**
 * Ce qui retient la déconnexion, d'après la cause de ce qui reste dans la file de la personne ;
 * `undefined` si elle peut se faire. `trop_lent` : l'envoi n'a pas abouti dans les 10 s.
 */
function retenue(
  cause: CauseDeLAttente | 'trop_lent' | undefined,
  fileNonVide: boolean,
): MotifDeLAttente | undefined {
  if (!fileNonVide) return undefined;
  switch (cause) {
    case 'trop_lent':
      return 'reseau';
    case 'reseau':
    case 'session':
    case 'serveur':
      return cause;
    case 'durable':
      // Réessayer n'y changerait rien : la file est gardée sur l'appareil (R33).
      return undefined;
    case undefined:
      // Tout était parti, et une réponse est arrivée depuis : il suffit de réessayer.
      return 'serveur';
  }
}

/**
 * La déconnexion (décision 12, ADR-0004) de `personne`, celle de la session :
 * 1. sa file part sous sa session (`envoyerFileAvantDeconnexion`) ;
 * 2. les synchronisations sont bloquées, et celles encore en vol attendues : 10 s au plus pour 1
 *    et 2 ensemble ;
 * 3. si des réponses restent pour une cause passagère (réseau, session expirée ou d'une autre
 *    personne, serveur, ou envoi trop lent), rien n'est fermé ni effacé : l'échec le dit
 *    (`ErreurReponsesEnAttente`, R31b, avec le nombre de réponses en attente). Une cause durable
 *    (droit retiré, lot refusé) ne retient pas la déconnexion ;
 * 4. la session est fermée sur le serveur. S'il ne répond pas, rien n'est effacé et l'échec
 *    remonte : la personne reste connectée (R30) ;
 * 5. tout est effacé, sauf les files non vides de toutes les personnes (R33) : IndexedDB (journal
 *    local, contenus, listes, curseurs, identité), les préférences, tous les caches et le service
 *    worker (`effacerLAppareil`) ;
 * 6. une fois finies les synchronisations d'avant (10 s au plus), le nettoyage final, puis le
 *    blocage est levé.
 *
 * `abandonner` (1e-D11) : la personne renonce à ses réponses en attente, après le refus du 3. Les
 * étapes 1 et 2 se font comme avant (ce qui peut partir part), mais le 3 ne retient plus. La
 * session doit se fermer : un 401 vaut fermeture (la session n'existe plus, ou le compte non
 * plus), mais un serveur qui ne répond pas laisse tout en place, file comprise (R30). Alors,
 * avant le 5, toute la file de la personne est abandonnée, cause durable comprise.
 */
export async function deconnecter(
  base: BaseLocale | undefined,
  personne: string,
  api: ApiSession = apiDeSession(),
  environnement: EnvironnementDeconnexion = environnementDeLaPage(),
  options: { abandonner?: boolean } = {},
): Promise<void> {
  annulerSynchrosProgrammees();
  const limite = echeance(ATTENTE_MAX_MS);
  let reprendre: Reprise = ignorer;
  let fermee = false;
  try {
    if (base !== undefined) {
      const cause = await Promise.race([
        // Une panne du stockage pendant l'envoi : il suffira de réessayer.
        envoyerFileAvantDeconnexion(base, personne, api.journal).catch(() => 'serveur' as const),
        limite.atteinte.then(() => 'trop_lent' as const),
      ]);
      // La session va changer : plus rien ne part. Bloquer plus tôt aurait bloqué l'envoi.
      reprendre = reprendreApres(base, bloquerSynchronisations(base));
      await auPlus(attendreLesSynchronisations(base), limite);
      const enAttente = await nombreEnAttente(base, personne);
      const motif = retenue(cause, enAttente > 0);
      if (motif !== undefined && options.abandonner !== true) {
        throw new ErreurReponsesEnAttente(motif, enAttente);
      }
    }
    await fermerLaSession(api);
    fermee = true;
    await effacerLAppareil(base, personne, environnement, options.abandonner === true);
  } finally {
    limite.annuler();
    reprendre(fermee);
  }
}

/** L'attente la plus longue du signal qui retire les passkeys du téléphone, après la suppression. */
const SIGNAL_MAX_MS = 2_000;

/**
 * Ce que la suppression du compte a laissé sur l'appareil : `complet` si tout a été effacé,
 * `incomplet` si le stockage a refusé de se vider (1e-R14).
 */
export type EffacementDeLAppareil = 'complet' | 'incomplet';

/**
 * La suppression du compte de `personne`, celui de la session (1e-D4) :
 * 1. les synchronisations sont annulées et bloquées, celles en vol attendues (10 s au plus) :
 *    rien ne part sous une session qui s'efface ;
 * 2. le compte est supprimé sur le serveur (`api.supprimerCompte(personne)`), qui emporte avec lui
 *    les passkeys, les sessions et le journal. `personne` est celle de l'écran : si la session est
 *    celle d'une autre, le serveur refuse (409 `autre_personne`, 1e-R13). S'il échoue (pas de
 *    réseau, panne, compte du propriétaire, session d'une autre personne ou perdue), rien n'est
 *    effacé sur l'appareil, aucun signal ne part, et l'échec remonte : le compte existe encore, et
 *    la personne peut réessayer ;
 * 3. **à partir de là, rien n'échoue plus** (1e-R14) : le compte n'existe plus, la personne n'a
 *    aucun moyen de réessayer. L'appareil est effacé comme à une déconnexion, et la file de la
 *    personne avec lui (elle ne pourrait plus partir : `effacerLAppareil`, abandon compris). Si le
 *    stockage refuse, ce qui ne dépend pas de lui est effacé quand même, l'appareil oublie la
 *    personne, et le résultat est `incomplet` : l'appelant le dit à la personne ;
 * 4. le téléphone est prié de retirer les passkeys de ce compte : plus aucune n'est acceptée
 *    (`signalerClesAcceptees`, si Chrome connaît l'API Signal), quoi qu'il soit arrivé en 3. Le
 *    signal est attendu 2 s au plus : une promesse du navigateur qui ne se résout pas ne retient
 *    pas le rechargement ;
 * 5. le blocage est levé, après le nettoyage final des synchronisations d'avant.
 */
export async function supprimerLeCompte(
  base: BaseLocale | undefined,
  personne: string,
  api: ApiSession = apiDeSession(),
  environnement: EnvironnementDeconnexion = environnementDeLaPage(),
): Promise<EffacementDeLAppareil> {
  return avecSynchronisationsSuspendues(base, async () => {
    await api.supprimerCompte(personne);
    return effacerApresSuppression(base, personne, environnement);
  });
}

/**
 * Les étapes 3 et 4 de `supprimerLeCompte`, quand le compte n'existe plus : l'appareil est effacé,
 * file comprise, le téléphone prié de retirer les passkeys. Rien n'échoue ; `incomplet` si le
 * stockage a refusé. À appeler sous des synchronisations suspendues (`avecSynchronisationsSuspendues`).
 */
async function effacerApresSuppression(
  base: BaseLocale | undefined,
  personne: string,
  environnement: EnvironnementDeconnexion,
): Promise<EffacementDeLAppareil> {
  let effacement: EffacementDeLAppareil = 'complet';
  try {
    await effacerLAppareil(base, personne, environnement, true);
  } catch {
    effacement = 'incomplet';
    // Même si le reste n'a pas pu s'effacer, l'appareil ne connaît plus la personne (R35) :
    // rien d'elle ne s'affiche au rechargement.
    if (base !== undefined) await oublierMoi(base).catch(ignorer);
  }
  const limite = echeance(SIGNAL_MAX_MS);
  await auPlus(signalerClesAcceptees(personne, []), limite);
  limite.annuler();
  return effacement;
}

/**
 * Le compte de `personne` a-t-il été supprimé depuis un autre appareil (2d-D4) ? Si `estSupprime`
 * le dit, cet appareil s'efface comme à la suppression du compte (2d-D5) et le résultat dit s'il
 * est `complet` ou `incomplet`. Sinon, ou si la vérification échoue, `undefined` et rien n'est
 * touché. Ne lève jamais.
 */
export async function verifierLaSuppression(
  base: BaseLocale | undefined,
  personne: string,
  estSupprime: (personne: string) => Promise<boolean> = compteSupprime,
  environnement: EnvironnementDeconnexion = environnementDeLaPage(),
): Promise<EffacementDeLAppareil | undefined> {
  try {
    if (!(await estSupprime(personne))) return undefined;
    return await avecSynchronisationsSuspendues(base, () =>
      effacerApresSuppression(base, personne, environnement),
    );
  } catch {
    return undefined;
  }
}
