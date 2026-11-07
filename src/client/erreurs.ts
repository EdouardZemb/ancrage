/*
 * Les échecs vus de l'utilisateur : un texte traduit, jamais le corps brut d'une réponse ni le
 * message d'une exception du navigateur. Les sources d'échec : l'API (`ErreurApi`), la passkey
 * (`ErreurPasskey`, quand le téléphone refuse ou que la personne annule), et la déconnexion qui
 * n'efface rien tant que des réponses attendent (`ErreurReponsesEnAttente`).
 */
import { ErreurApi } from './api.js';

export type NaturePasskey = 'annulee' | 'deja_enregistree' | 'echec';

export class ErreurPasskey extends Error {
  readonly nature: NaturePasskey;

  constructor(nature: NaturePasskey, cause: unknown) {
    super(`passkey : ${nature}`, { cause });
    this.name = 'ErreurPasskey';
    this.nature = nature;
  }
}

/**
 * Pourquoi la déconnexion attend, et donc ce que la personne peut y faire : retrouver le réseau
 * (`reseau`), se reconnecter (`session`, expirée ou d'une autre personne), ou réessayer dans un
 * instant (`serveur`).
 */
export type MotifDeLAttente = 'reseau' | 'session' | 'serveur';

/**
 * La déconnexion n'a rien fermé ni effacé : des réponses de la personne n'ont pas pu partir, pour
 * une cause passagère (R31b). Une cause durable (droit retiré, lot refusé) n'empêche pas la
 * déconnexion : la file est alors gardée sur l'appareil (R33). La personne peut aussi renoncer à
 * ses réponses en attente et se déconnecter quand même (`deconnecter` avec `abandonner`, 1e-D11).
 */
export class ErreurReponsesEnAttente extends Error {
  readonly motif: MotifDeLAttente;
  /**
   * Combien de réponses attendent dans la file de la personne : ce qu'elle perdrait en se
   * déconnectant quand même (« Se déconnecter et abandonner N réponses », 1e-D11).
   */
  readonly enAttente: number;

  constructor(motif: MotifDeLAttente, enAttente: number) {
    super(`Des réponses attendent encore leur envoi (${motif}) : la déconnexion n’a rien effacé.`);
    this.name = 'ErreurReponsesEnAttente';
    this.motif = motif;
    this.enAttente = enAttente;
  }
}

/**
 * Ce que dit l'exception de `navigator.credentials` (relayée par SimpleWebAuthn, qui garde le nom
 * de l'exception d'origine) : `NotAllowedError` et `AbortError` sont une annulation ou un délai
 * dépassé, `InvalidStateError` une passkey déjà présente sur l'appareil.
 */
export function classerErreurPasskey(erreur: unknown): NaturePasskey {
  const nom = erreur instanceof Error ? erreur.name : '';
  if (nom === 'NotAllowedError' || nom === 'AbortError') {
    return 'annulee';
  }
  return nom === 'InvalidStateError' ? 'deja_enregistree' : 'echec';
}

/** Exécute l'étape qui parle au téléphone ; son échec devient une `ErreurPasskey`. */
export async function demanderPasskey<T>(etape: () => Promise<T>): Promise<T> {
  try {
    return await etape();
  } catch (erreur) {
    throw new ErreurPasskey(classerErreurPasskey(erreur), erreur);
  }
}

/** La clé du libellé d'un échec ; `erreur_inconnue` pour toute autre exception. */
function cleDuLibelle(erreur: unknown): string {
  if (erreur instanceof ErreurApi) return `erreur_${erreur.code}`;
  if (erreur instanceof ErreurPasskey) return `passkey_${erreur.nature}`;
  if (erreur instanceof ErreurReponsesEnAttente) return `deconnexion_attente_${erreur.motif}`;
  return 'erreur_inconnue';
}

/**
 * Le texte à montrer pour `erreur`, pris dans `libelles` (`erreur_<code>` pour l'API,
 * `passkey_<nature>` pour la passkey, `deconnexion_attente_<motif>` pour une déconnexion qui
 * attend). Un code sans libellé, ou toute autre exception, donne le message générique.
 */
export function messageDErreur(
  erreur: unknown,
  libelles: Readonly<Record<string, string | undefined>>,
): string {
  return libelles[cleDuLibelle(erreur)] ?? libelles.erreur_inconnue ?? '';
}

/**
 * Vrai si la session n'est plus celle de la personne : elle a pris fin (401), ou c'est celle d'une
 * autre personne (409 `autre_personne`, R21, R32, R36). L'application passe en reconnexion.
 */
export function sessionPerdue(erreur: unknown): boolean {
  return (
    erreur instanceof ErreurApi &&
    (erreur.code === 'non_connecte' || erreur.code === 'autre_personne')
  );
}
