import {
  type PublicKeyCredentialCreationOptionsJSON,
  startRegistration,
} from '@simplewebauthn/browser';
import { useState } from 'preact/hooks';
import { nomAfficheValide } from '../../domaine/nom-affiche.js';
import { appeler, type ReponseOptions } from '../api.js';
import { MessageErreur } from '../composants.js';
import { useAction, useApp } from '../contexte.js';
import { demanderPasskey } from '../erreurs.js';
import { naviguer } from '../routeur.js';
import { avecSynchronisationsSuspendues } from '../session-locale.js';
import { baseDeLaPage } from '../stockage/base-de-la-page.js';
import { LANGUES, type Langue, langueDuNavigateur, textes } from '../textes.js';

/**
 * L'invitation : le nom affiché et la langue, puis la création de la passkey, qui crée le compte.
 * Le texte de l'écran suit la langue que la personne choisit (au départ, celle du téléphone).
 *
 * Le nom validé part avec les options (1e-D6) : il devient l'étiquette de la passkey. C'est le même
 * que celui que la création du compte enverra ensuite, pour que la passkey porte le nom du compte.
 *
 * Le compte créé ouvre une session neuve, à la place de celle qui était peut-être ouverte : les
 * synchronisations sont suspendues jusqu'à ce que l'appareil soit à la nouvelle personne (R19).
 */
export function Invitation(props: { jeton: string }) {
  const { actualiserMoi } = useApp();
  const [nom, setNom] = useState('');
  const [langue, setLangue] = useState<Langue>(() => langueDuNavigateur());
  const [nomRefuse, setNomRefuse] = useState(false);
  const t = textes[langue];
  const { occupe, erreur, lancer } = useAction(t);

  const creer = (evenement: Event) => {
    evenement.preventDefault();
    // La règle du serveur, appliquée avant de demander la passkey : un nom refusé après la
    // cérémonie laisserait sur le téléphone une passkey sans compte.
    const nomAffiche = nomAfficheValide(nom);
    if (nomAffiche === undefined) {
      setNomRefuse(true);
      return;
    }
    setNomRefuse(false);
    void lancer(async () => {
      const base = await baseDeLaPage().catch(() => undefined);
      await avecSynchronisationsSuspendues(base, async () => {
        const { options, ceremonie } = await appeler<
          ReponseOptions<PublicKeyCredentialCreationOptionsJSON>
        >('POST', '/api/auth/invitation/options', { jeton: props.jeton, nomAffiche });
        const reponse = await demanderPasskey(() => startRegistration({ optionsJSON: options }));
        await appeler('POST', '/api/auth/invitation', {
          jeton: props.jeton,
          ceremonie,
          nomAffiche,
          langue,
          reponse,
        });
        await actualiserMoi();
        // Remplace l'entrée de l'historique : l'adresse porte le jeton, déjà consommé.
        naviguer('/', { remplacer: true });
      });
    });
  };

  return (
    <form onSubmit={creer} noValidate>
      <h2>{t.invitation_titre}</h2>
      <p>{t.invitation_intro}</p>

      <label for="nom-affiche">{t.nom_affiche}</label>
      <input
        id="nom-affiche"
        name="nom-affiche"
        type="text"
        value={nom}
        autocomplete="off"
        autocapitalize="words"
        enterkeyhint="done"
        aria-invalid={nomRefuse}
        aria-describedby={nomRefuse ? 'nom-affiche-erreur' : undefined}
        onInput={(evenement) => setNom(evenement.currentTarget.value)}
      />
      {nomRefuse && (
        <p class="erreur" id="nom-affiche-erreur" role="alert">
          {t.nom_requis}
        </p>
      )}

      <fieldset class="choix-langue">
        <legend>{t.langue_choix}</legend>
        {LANGUES.map((code) => (
          <label key={code} class="choix">
            <input
              type="radio"
              name="langue"
              value={code}
              checked={langue === code}
              onChange={() => setLangue(code)}
            />
            {textes[code][`langue_${code}`]}
          </label>
        ))}
      </fieldset>

      <button type="submit" class="principal" disabled={occupe}>
        {occupe ? t.creation_en_cours : t.creer_passkey}
      </button>
      <MessageErreur message={erreur} />
    </form>
  );
}
