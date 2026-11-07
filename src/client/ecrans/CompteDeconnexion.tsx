/*
 * La section « Se déconnecter » de l'écran Compte (1f-D14 : elle quitte `Compte.tsx`) : le bouton,
 * son message d'échec et, quand des réponses n'ont pas pu partir, le bouton qui les abandonne.
 */
import { useState } from 'preact/hooks';
import type { Moi } from '../api.js';
import { BoutonConfirme, MessageErreur } from '../composants.js';
import { useAction, useApp } from '../contexte.js';
import { formater } from '../cours/textes-cours.js';
import { ErreurReponsesEnAttente } from '../erreurs.js';
import { rechargerSur } from '../routeur.js';
import { deconnecter } from '../session-locale.js';
import { baseDeLaPage } from '../stockage/base-de-la-page.js';
import type { CleTexte } from '../textes.js';

/**
 * Le bouton qui abandonne `n` réponses, et sa confirmation. Une seule réponse a ses textes
 * (« 1 réponse », 1e-R10) : le pluriel dirait « 1 réponses ».
 */
function textesDAbandon(t: Record<CleTexte, string>, n: number) {
  if (n === 1) {
    return {
      libelle: t.deconnexion_abandonner_une,
      confirmer: t.deconnexion_abandonner_confirmer_une,
    };
  }
  return {
    libelle: formater(t.deconnexion_abandonner, { n }),
    confirmer: formater(t.deconnexion_abandonner_confirmer, { n }),
  };
}

/**
 * L'état de la déconnexion, que l'écran garde parce que le choix de la langue en dépend : les deux
 * gestes partagent la même action, donc le même message d'échec (sous « Se déconnecter ») et le
 * même état « occupé », et choisir une langue retire le bouton d'abandon (`setEnAttente`).
 */
export function useDeconnexion() {
  const action = useAction();
  // Le nombre de réponses que le dernier refus de se déconnecter a dit en attente.
  const [enAttente, setEnAttente] = useState<number | undefined>();
  return { action, enAttente, setEnAttente };
}

type EtatDeconnexion = ReturnType<typeof useDeconnexion>;

/**
 * La déconnexion envoie d'abord les réponses en attente, puis ferme la session et vide l'appareil,
 * sauf les réponses qui attendent encore (`deconnecter`, décision 12, R33). Une fois faite, elle
 * recharge entièrement la page de connexion : le service worker, désinscrit, se réenregistre, et
 * rien de la personne précédente ne reste en mémoire. Si des réponses n'ont pas pu partir pour une
 * cause passagère (réseau, session, serveur), ou si le serveur ne répond pas, elle échoue, rien
 * n'est effacé ni rechargé, et le message dit quoi faire (R30, R31b).
 *
 * Dans le premier cas (des réponses en attente), un bouton à confirmer permet de se déconnecter
 * quand même, en abandonnant ces réponses : il dit combien (1e-D11). Il reste tant que la
 * déconnexion n'a pas eu lieu, même si l'abandon échoue (le réseau a pu tomber entre-temps) : la
 * situation de la personne n'a pas changé. Un nouvel essai de « Se déconnecter », le choix d'une
 * langue et la sortie de l'écran le retirent ; le premier le ramène si le refus se répète, avec le
 * nombre du moment.
 *
 * `occupe` est celui de l'écran : un geste de l'écran à la fois, quel qu'il soit (1f-D14).
 */
export function SectionDeconnexion(props: { moi: Moi; etat: EtatDeconnexion; occupe: boolean }) {
  const { moi, occupe } = props;
  const { action, enAttente, setEnAttente } = props.etat;
  const { t, fermerSession } = useApp();
  const abandon = enAttente === undefined ? undefined : textesDAbandon(t, enAttente);

  const seDeconnecter = (abandonner: boolean) => {
    // Un nouvel essai de se déconnecter dira de nouveau combien de réponses attendent ; un abandon
    // qui échoue ne change rien à ce qui attend, et garde le bouton.
    if (!abandonner) setEnAttente(undefined);
    return action.lancer(async () => {
      // La personne de l'écran (`moi`) : celle de la session ; hors ligne ou en session expirée,
      // celle que l'appareil connaît. Pas l'identité relue maintenant sur l'appareil, qu'une
      // connexion dans un autre onglet a pu remplacer (R35).
      const base = await baseDeLaPage().catch(() => undefined);
      try {
        await deconnecter(base, moi.id, undefined, undefined, { abandonner });
      } catch (echec) {
        if (echec instanceof ErreurReponsesEnAttente) setEnAttente(echec.enAttente);
        throw echec;
      }
      fermerSession();
      rechargerSur('/connexion');
    });
  };

  return (
    <>
      <button
        type="button"
        class="secondaire"
        disabled={occupe}
        onClick={() => seDeconnecter(false)}
      >
        {t.deconnexion}
      </button>
      <MessageErreur message={action.erreur} />
      {abandon !== undefined && (
        <BoutonConfirme
          libelle={abandon.libelle}
          confirmer={abandon.confirmer}
          description={abandon.libelle}
          disabled={occupe}
          onConfirme={() => seDeconnecter(true)}
        />
      )}
    </>
  );
}
