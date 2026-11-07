import {
  type PublicKeyCredentialCreationOptionsJSON,
  startRegistration,
} from '@simplewebauthn/browser';
import { appeler, type ReponseOptions } from '../api.js';
import { MessageErreur } from '../composants.js';
import { useAction, useApp } from '../contexte.js';
import { demanderPasskey } from '../erreurs.js';
import { naviguer } from '../routeur.js';
import { avecSynchronisationsSuspendues } from '../session-locale.js';
import { baseDeLaPage } from '../stockage/base-de-la-page.js';

/**
 * Le lien de secours ou d'un autre appareil : le compte existe déjà, la personne y ajoute la
 * passkey de cet appareil et sa session s'ouvre, à la place de celle qui était peut-être ouverte :
 * les synchronisations sont suspendues jusqu'à ce que l'appareil soit à elle (R19).
 */
export function Lien(props: { jeton: string }) {
  const { t, actualiserMoi } = useApp();
  const { occupe, erreur, lancer } = useAction();

  const creer = () =>
    lancer(async () => {
      const base = await baseDeLaPage().catch(() => undefined);
      await avecSynchronisationsSuspendues(base, async () => {
        const { options, ceremonie } = await appeler<
          ReponseOptions<PublicKeyCredentialCreationOptionsJSON>
        >('POST', '/api/auth/lien/options', { jeton: props.jeton });
        const reponse = await demanderPasskey(() => startRegistration({ optionsJSON: options }));
        await appeler('POST', '/api/auth/lien', { jeton: props.jeton, ceremonie, reponse });
        await actualiserMoi();
        // Remplace l'entrée de l'historique : l'adresse porte le jeton, déjà consommé.
        naviguer('/', { remplacer: true });
      });
    });

  return (
    <section>
      <h2>{t.lien_titre}</h2>
      <p>{t.lien_intro}</p>
      <button type="button" class="principal" disabled={occupe} onClick={creer}>
        {occupe ? t.creation_en_cours : t.creer_passkey}
      </button>
      <MessageErreur message={erreur} />
    </section>
  );
}
