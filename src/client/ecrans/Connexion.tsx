import {
  type PublicKeyCredentialRequestOptionsJSON,
  startAuthentication,
} from '@simplewebauthn/browser';
import { appeler, type ReponseOptions } from '../api.js';
import { MessageErreur } from '../composants.js';
import { useAction, useApp } from '../contexte.js';
import { demanderPasskey } from '../erreurs.js';
import { naviguer } from '../routeur.js';
import { avecSynchronisationsSuspendues, type EffacementDeLAppareil } from '../session-locale.js';
import { baseDeLaPage } from '../stockage/base-de-la-page.js';

/**
 * L'adresse de l'écran de connexion après une suppression de compte (2d-D6) : `ailleurs` si le
 * compte a été supprimé depuis un autre appareil, que celui-ci vient de vider. Un effacement
 * incomplet garde `appareil=non_efface` (1e-R14). `suppressionDuCompte` lit ces trois adresses.
 */
export function adresseApresSuppression(
  effacement: EffacementDeLAppareil,
  ailleurs: boolean,
): string {
  if (effacement === 'incomplet') return '/connexion?compte=supprime&appareil=non_efface';
  return ailleurs ? '/connexion?compte=supprime&appareil=vide' : '/connexion?compte=supprime';
}

/**
 * Ce que l'adresse dit d'une suppression de compte qui vient d'avoir lieu : `?compte=supprime`, et,
 * si le téléphone n'a pas pu effacer ses données, `&appareil=non_efface` (1e-R14) ; ou, si le compte
 * a été supprimé depuis un autre appareil, que celui-ci a vidé, `&appareil=vide` (2d-D6).
 */
function suppressionDuCompte(): 'supprime' | 'appareil_vide' | 'appareil_non_efface' | undefined {
  const requete = new URLSearchParams(location.search);
  if (requete.get('compte') !== 'supprime') return undefined;
  const appareil = requete.get('appareil');
  if (appareil === 'non_efface') return 'appareil_non_efface';
  return appareil === 'vide' ? 'appareil_vide' : 'supprime';
}

/**
 * La connexion par passkey : sans nom à saisir, le téléphone propose la passkey du site. La
 * personne qui se connecte peut ne pas être celle d'avant : les synchronisations sont suspendues
 * pendant la cérémonie, jusqu'à ce que l'appareil soit à elle (`actualiserMoi`, R19).
 *
 * Après la suppression d'un compte, la page se recharge sur `/connexion?compte=supprime` (1e-D4) :
 * l'écran le confirme. Si le téléphone n'a pas pu effacer ses données, l'adresse porte aussi
 * `appareil=non_efface` et le message dit quoi faire (1e-R14). Si le compte a été supprimé depuis un
 * autre appareil, que celui-ci a vidé, elle porte `appareil=vide` (2d-D6). Le routeur ignore la
 * requête ; c'est ici qu'elle se lit.
 */
export function Connexion() {
  const { t, actualiserMoi } = useApp();
  const { occupe, erreur, lancer } = useAction();
  const suppression = suppressionDuCompte();

  const seConnecter = () =>
    lancer(async () => {
      const base = await baseDeLaPage().catch(() => undefined);
      await avecSynchronisationsSuspendues(base, async () => {
        const { options, ceremonie } = await appeler<
          ReponseOptions<PublicKeyCredentialRequestOptionsJSON>
        >('POST', '/api/auth/connexion/options');
        const reponse = await demanderPasskey(() => startAuthentication({ optionsJSON: options }));
        await appeler('POST', '/api/auth/connexion', { ceremonie, reponse });
        await actualiserMoi();
        naviguer('/', { remplacer: true });
      });
    });

  return (
    <section>
      <h2>{t.connexion_titre}</h2>
      {suppression === 'supprime' && (
        <p class="ok" role="status">
          {t.compte_supprime}
        </p>
      )}
      {suppression === 'appareil_vide' && (
        <p class="ok" role="status">
          {t.compte_supprime_appareil_vide}
        </p>
      )}
      {suppression === 'appareil_non_efface' && (
        <p class="bandeau" role="status">
          {t.compte_supprime_appareil_non_efface}
        </p>
      )}
      <p>{t.connexion_aide}</p>
      <button type="button" class="principal" disabled={occupe} onClick={seConnecter}>
        {occupe ? t.connexion_en_cours : t.connexion_bouton}
      </button>
      <MessageErreur message={erreur} />
      <p class="detail">{t.connexion_sans_passkey}</p>
    </section>
  );
}
