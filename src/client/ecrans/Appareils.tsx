import { useState } from 'preact/hooks';
import { annulerLienDeConnexion, appeler, creerLienDeConnexion, lireAppareils } from '../api.js';
import {
  BoutonConfirme,
  formaterDate,
  LienAPartager,
  LienInterne,
  MessageErreur,
} from '../composants.js';
import { useAgir, useApp, useChargement } from '../contexte.js';
import { formater } from '../cours/textes-cours.js';
import { signalerClesAcceptees } from '../passkeys-signal.js';
import { DetailAppareil, nomAppareil } from './detail-appareil.js';

/**
 * Les appareils de la personne : les sessions ouvertes (qu'elle peut fermer), les passkeys
 * enregistrées (qu'elle peut supprimer, sauf la dernière, en confirmant) et un lien pour en ajouter
 * un.
 *
 * Une personne n'a qu'un lien de connexion actif (1e-D7) : l'écran dit jusqu'à quand il vaut et
 * permet de l'annuler, sans nouvelle vérification par passkey ; en créer un annule le précédent.
 * Après chaque lecture réussie, le téléphone apprend quelles passkeys le serveur accepte encore
 * (`signalerClesAcceptees`) : il retire les autres, supprimées d'ici ou ailleurs. Ce signal ne
 * retient rien : s'il échoue ou si Chrome ne connaît pas l'API Signal, l'écran n'en sait rien.
 *
 * La lecture nomme la personne de l'écran (1e-R15) : si la session est celle d'une autre personne
 * (un autre onglet, sur un téléphone partagé), le serveur refuse, rien n'est signalé, et
 * l'application passe en reconnexion, comme pour les cours. Sans cela, la liste de l'autre personne
 * ferait retirer du téléphone les passkeys de celle de l'écran. La création et l'annulation du lien
 * la nomment aussi : sinon, l'écran montrerait le lien de l'autre personne et annulerait le sien.
 *
 * Après un retour arrière, l'application précachée peut parler à un serveur d'avant le lot 1e, qui
 * ignore l'en-tête : rien ne dit alors que la liste est celle de la personne de l'écran. Seule une
 * réponse qui porte le champ `lien`, que seuls les serveurs qui contrôlent l'en-tête envoient, est
 * signalée au téléphone.
 */
export function Appareils() {
  const { t, langue, moi } = useApp();
  const appareils = useChargement(async () => {
    const lus = await lireAppareils(moi?.id);
    // Seulement après une lecture réussie (un refus ou une panne ne signale rien), d'un serveur qui
    // a contrôlé l'en-tête (`lien` présent, même `null`), sans attendre.
    if (moi !== undefined && lus.lien !== undefined) {
      void signalerClesAcceptees(
        moi.id,
        lus.passkeys.map((passkey) => passkey.id),
      );
    }
    return lus;
  });
  const action = useAgir(appareils.recharger);
  const { agir } = action;
  const [lien, setLien] = useState<string | undefined>();

  const deconnecter = (id: string) =>
    agir(() => appeler('DELETE', `/api/moi/sessions/${encodeURIComponent(id)}`));

  const supprimer = (id: string) =>
    agir(() => appeler('DELETE', `/api/moi/passkeys/${encodeURIComponent(id)}`));

  // Le lien qui vient d'être montré ne sert plus : il n'est plus affiché. L'écran relit le lien
  // actif (1e-D7).
  const annulerLien = () =>
    agir(async () => {
      await annulerLienDeConnexion(moi?.id);
      setLien(undefined);
    });

  // L'écran relit ensuite le lien actif : celui qu'on vient de créer, qui a annulé le précédent.
  const creerLien = () =>
    agir(async () => {
      setLien(await creerLienDeConnexion(moi?.id));
    });

  const { donnees } = appareils;
  // Absent d'un serveur d'avant le lot 1e (ADR-0008, §3) : comme sans lien actif.
  const lienActif = donnees?.lien ?? null;
  return (
    <>
      <p>
        <LienInterne vers="/">{t.retour_accueil}</LienInterne>
      </p>
      <h2>{t.appareils_titre}</h2>
      <MessageErreur message={appareils.erreur ?? action.erreur} />
      {appareils.erreur !== undefined && (
        <button type="button" class="secondaire" onClick={() => appareils.recharger()}>
          {t.reessayer}
        </button>
      )}
      {donnees === undefined && appareils.erreur === undefined && <p>{t.chargement}</p>}

      {donnees !== undefined && (
        <>
          <section aria-labelledby="titre-sessions">
            <h3 id="titre-sessions">{t.sessions_titre}</h3>
            <ul class="liste" data-testid="liste-sessions">
              {donnees.sessions.map((session) => (
                <li key={session.id}>
                  <p class="nom">
                    <strong>{nomAppareil(session.appareil, t.appareil_autre)}</strong>
                    {session.courante && <span class="badge">{t.cet_appareil}</span>}
                  </p>
                  <p class="detail">
                    <DetailAppareil
                      creeLe={session.creeLe}
                      utiliseLe={session.utiliseLe}
                      langue={langue}
                      textes={t}
                    />
                  </p>
                  {!session.courante && (
                    <button
                      type="button"
                      class="secondaire"
                      disabled={action.occupe}
                      aria-label={`${t.deconnecter} : ${nomAppareil(session.appareil, t.appareil_autre)}, ${formaterDate(session.utiliseLe, langue)}`}
                      onClick={() => deconnecter(session.id)}
                    >
                      {t.deconnecter}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="titre-passkeys">
            <h3 id="titre-passkeys">{t.passkeys_titre}</h3>
            <p class="detail">{t.passkeys_aide}</p>
            <ul class="liste" data-testid="liste-passkeys">
              {donnees.passkeys.map((passkey) => (
                <li key={passkey.id}>
                  <p class="nom">
                    <strong>{nomAppareil(passkey.appareil, t.appareil_autre)}</strong>
                  </p>
                  <p class="detail">
                    <DetailAppareil
                      creeLe={passkey.creeLe}
                      utiliseLe={passkey.utiliseLe}
                      langue={langue}
                      textes={t}
                    />
                  </p>
                  <BoutonConfirme
                    libelle={t.supprimer}
                    confirmer={t.confirmer}
                    description={`${t.supprimer} : ${t.passkeys_titre}, ${nomAppareil(passkey.appareil, t.appareil_autre)}, ${formaterDate(passkey.creeLe, langue)}`}
                    disabled={action.occupe}
                    onConfirme={() => supprimer(passkey.id)}
                  />
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="titre-lien">
            <h3 id="titre-lien">{t.lien_autre_appareil}</h3>
            <p>{t.lien_autre_appareil_aide}</p>
            {lienActif !== null && (
              <>
                <p class="detail">
                  {formater(t.lien_actif, { date: formaterDate(lienActif.expireLe, langue) })}
                </p>
                <button
                  type="button"
                  class="secondaire"
                  disabled={action.occupe}
                  onClick={annulerLien}
                >
                  {t.lien_annuler}
                </button>
              </>
            )}
            <button type="button" class="secondaire" disabled={action.occupe} onClick={creerLien}>
              {t.lien_autre_appareil}
            </button>
            <p class="detail">{t.lien_remplace}</p>
            {lien !== undefined && <LienAPartager key={lien} lien={lien} t={t} />}
          </section>
        </>
      )}
    </>
  );
}
