/*
 * La section « Mes données » de l'écran Compte (1f-D14 : elle quitte `Compte.tsx`) : le lien
 * d'export et la suppression du compte, avec son message d'échec.
 */
import type { Moi } from '../api.js';
import { BoutonConfirme, MessageErreur } from '../composants.js';
import { useAction, useApp } from '../contexte.js';
import { rechargerSur } from '../routeur.js';
import { supprimerLeCompte } from '../session-locale.js';
import { baseDeLaPage } from '../stockage/base-de-la-page.js';
import { adresseApresSuppression } from './Connexion.js';

/**
 * L'action de la suppression, que l'écran garde pour savoir si elle est en cours (`occupe` des
 * autres boutons). Son message d'échec, sans réponse ou sous une session partie, dit comment
 * effacer l'appareil (I2).
 */
export function useActionDonnees() {
  const { t } = useApp();
  return useAction({
    ...t,
    erreur_reseau: t.suppression_erreur_reseau,
    erreur_non_connecte: t.suppression_erreur_non_connecte,
  });
}

type ActionDonnees = ReturnType<typeof useActionDonnees>;

/**
 * L'export est un lien du navigateur (`download`) : la pièce jointe du serveur est enregistrée
 * telle quelle. La suppression du compte se confirme (deux touchers) et n'est pas proposée au
 * propriétaire, que le serveur refuserait (409). Elle nomme la personne de l'écran : si la session
 * est devenue celle d'une autre personne (un autre onglet), le serveur refuse et rien n'est
 * supprimé (1e-R13). Elle efface le compte puis l'appareil, file comprise (`supprimerLeCompte`) ;
 * si le serveur échoue, rien n'est effacé et le message le dit. Sans réponse du serveur, ou s'il
 * trouve la session partie (401), le compte a pu être supprimé sans que l'appareil le sache : le
 * message dit alors que « Se déconnecter » efface l'appareil (I2). Une fois le compte supprimé,
 * l'écran ne reste jamais ouvert : la session est fermée et la page se recharge sur l'écran de
 * connexion, qui confirme la suppression, ou dit quoi faire si l'appareil n'a pas pu être effacé
 * (1e-R14).
 *
 * `occupe` est celui de l'écran : un geste de l'écran à la fois, quel qu'il soit (1f-D14).
 */
export function SectionDonnees(props: { moi: Moi; action: ActionDonnees; occupe: boolean }) {
  const { moi, action, occupe } = props;
  const { t, fermerSession } = useApp();

  const supprimerMonCompte = () =>
    action.lancer(async () => {
      // La personne de l'écran, comme pour la déconnexion (R35).
      const base = await baseDeLaPage().catch(() => undefined);
      const effacement = await supprimerLeCompte(base, moi.id);
      fermerSession();
      // La page se recharge entièrement, comme à la déconnexion ; l'écran de connexion dit que le
      // compte est supprimé, et, si le téléphone n'a pas pu s'effacer, ce que la personne doit
      // faire (1e-R14).
      rechargerSur(adresseApresSuppression(effacement, false));
    });

  return (
    <section aria-labelledby="titre-donnees">
      <h3 id="titre-donnees">{t.donnees_titre}</h3>
      <div class="menu">
        <a href="/api/moi/export" download>
          {t.export_lien}
        </a>
      </div>
      {!moi.proprietaire && (
        <>
          <p class="detail">{t.suppression_explication}</p>
          <BoutonConfirme
            libelle={t.suppression_bouton}
            confirmer={t.suppression_confirmer}
            description={t.suppression_bouton}
            disabled={occupe}
            onConfirme={supprimerMonCompte}
          />
        </>
      )}
      <MessageErreur message={action.erreur} />
    </section>
  );
}
