/*
 * L'API Signal de WebAuthn (Chrome 132 et suivants) : le site dit au téléphone ce qu'il sait de ses
 * passkeys, pour que le gestionnaire de mots de passe les tienne à jour.
 * - `signalCurrentUserDetails` : le nom que la passkey affiche. Il est signalé après une connexion
 *   et après un changement du nom affiché (1e-D6) ;
 * - `signalAllAcceptedCredentials` : les passkeys que le serveur accepte encore pour la personne.
 *   Une liste vide efface celles de l'appareil : c'est ce que fait la suppression du compte
 *   (1e-D4).
 *
 * Un signal est un souhait, jamais une condition : un navigateur qui ne connaît pas l'API ne fait
 * rien, et un signal qui échoue ne retient ni la connexion, ni le changement de nom, ni la
 * suppression qui l'a lancé. Rien ne lève ici.
 *
 * Les types de ces deux méthodes manquent encore à `lib.dom` : on ne déclare que ce dont on se sert,
 * et le constructeur `PublicKeyCredential` est un paramètre (comme `stockage` dans `persistance.ts`),
 * pour que les tests le simulent.
 */
import { bufferToBase64URLString } from '@simplewebauthn/browser';
import { octetsDeLIdentifiant } from '../domaine/identifiant-webauthn.js';

/**
 * L'identifiant d'utilisateur que le téléphone a gardé avec la passkey, tel que l'API Signal le
 * nomme : l'UUID de la personne encodé en UTF-8 (c'est le `userHandle` que pose le serveur), puis
 * en base64url. Les octets sortent de la même fonction que ceux du serveur (`routes-auth.ts`).
 */
export function identifiantUtilisateur(personne: string): string {
  return bufferToBase64URLString(octetsDeLIdentifiant(personne).buffer);
}

/** `PublicKeyCredential` de la page ; `undefined` si le navigateur n'en a pas ou refuse l'accès. */
function constructeurDeLaPage(): unknown {
  try {
    return globalThis.PublicKeyCredential;
  } catch {
    return undefined;
  }
}

/**
 * Appelle `methode` de l'API Signal sur `pkc`, avec les détails du signal ; sans cette méthode, ou
 * si l'appel échoue (de suite ou plus tard), ne fait rien. La méthode est appelée sur son objet,
 * comme `PublicKeyCredential.signalCurrentUserDetails(…)` : détachée, elle perdrait son `this`.
 */
async function signaler(
  pkc: unknown,
  methode: 'signalCurrentUserDetails' | 'signalAllAcceptedCredentials',
  personne: string,
  complement: Record<string, unknown>,
): Promise<void> {
  try {
    const objet = pkc as Record<string, unknown> | null | undefined;
    const appel = objet?.[methode];
    if (typeof appel !== 'function') return;
    await appel.call(objet, {
      rpId: location.hostname,
      userId: identifiantUtilisateur(personne),
      ...complement,
    });
  } catch {
    // Un souhait que le navigateur refuse : la personne n'a rien à y faire.
  }
}

/**
 * Dit au téléphone le nom que portent les passkeys de la personne : le nom affiché sert à la fois
 * de `name` et de `displayName`, comme à la création de la passkey (1e-D6).
 */
export function signalerNom(
  moi: { id: string; nomAffiche: string },
  pkc: unknown = constructeurDeLaPage(),
): Promise<void> {
  return signaler(pkc, 'signalCurrentUserDetails', moi.id, {
    name: moi.nomAffiche,
    displayName: moi.nomAffiche,
  });
}

/**
 * Dit au téléphone quelles passkeys (leurs identifiants WebAuthn, en base64url) le serveur accepte
 * encore pour `personne` : il retire de l'appareil les autres. Aucune : il les retire toutes
 * (1e-D4).
 */
export function signalerClesAcceptees(
  personne: string,
  ids: readonly string[],
  pkc: unknown = constructeurDeLaPage(),
): Promise<void> {
  return signaler(pkc, 'signalAllAcceptedCredentials', personne, {
    allAcceptedCredentialIds: ids,
  });
}
