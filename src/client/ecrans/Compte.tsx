import { useLayoutEffect, useState } from 'preact/hooks';
import { nomAfficheValide } from '../../domaine/nom-affiche.js';
import { listerCours, modifierMoi } from '../api.js';
import { LienInterne, MessageErreur } from '../composants.js';
import { useAction, useApp, useChargement } from '../contexte.js';
import { signalerNom } from '../passkeys-signal.js';
import { cheminDOuverture } from '../routeur.js';
import { declarerSeance } from '../seance.js';
import { LANGUES, type Langue } from '../textes.js';
import { SectionDeconnexion, useDeconnexion } from './CompteDeconnexion.js';
import { SectionDonnees, useActionDonnees } from './CompteDonnees.js';

/**
 * Le compte d'une personne connectée (`/compte`, l'ancien accueil) : son nom, les cours qu'elle a
 * le droit de voir (leurs titres viennent de l'API ; chacun mène à son cours), le nom affiché
 * qu'elle peut changer, la langue de l'interface, les liens vers ses appareils et l'administration
 * (propriétaire seulement), la déconnexion (`SectionDeconnexion`), et ses données (1e-D4, 1e-D5) :
 * leur export, et la suppression du compte (`SectionDonnees`). L'en-tête de l'application y mène
 * depuis tout écran.
 *
 * Le nom affiché (1e-D6) suit la règle du serveur, appliquée avant la requête (`nomAfficheValide`).
 * Une fois enregistré, il devient celui de l'écran et de l'appareil (`definirMoi`), et le
 * téléphone l'apprend pour les passkeys (`signalerNom`). Le nom et la langue se changent au nom de
 * la personne de l'écran (`modifierMoi`) : si la session est devenue celle d'une autre personne
 * (un autre onglet, sur un téléphone partagé), rien n'est changé, ni sur l'écran, ni sur le
 * téléphone, et l'application passe en reconnexion. Seul un profil qui nomme la personne de
 * l'écran est pris et signalé.
 *
 * La déconnexion et les données ont leurs fichiers (1f-D14). L'écran garde ce qu'il partage avec
 * elles. D'abord, un seul geste à la fois : l'opération en cours de l'une des trois actions
 * (`occupe`) désactive tous les boutons, ceux des sections comprises. Ensuite, le choix de la
 * langue prend l'action de la déconnexion (`useDeconnexion`), donc son message d'échec, et retire
 * son bouton d'abandon (1e-D11).
 *
 * Tant que l'écran est occupé, il déclare une séance retenue (2b-D5) : la nouvelle version de
 * l'application attend, car un rechargement couperait une déconnexion ou une suppression du compte
 * en cours. Un changement de nom ou de langue en cours la retient de même, le temps d'une requête.
 */
export function Compte() {
  const { t, langue, moi, definirMoi } = useApp();
  // La liste nomme la personne affichée : sous la session d'une autre, le serveur ne rend rien
  // (R36), et l'application passe en reconnexion.
  const cours = useChargement(async () => (moi === undefined ? [] : listerCours(moi.id)));
  // Le nom, la déconnexion et les données ont chacun leur message d'échec, sous leurs boutons.
  const nomAction = useAction();
  const deconnexion = useDeconnexion();
  const donneesAction = useActionDonnees();
  const [nom, setNom] = useState(moi?.nomAffiche ?? '');
  const [nomRefuse, setNomRefuse] = useState(false);
  // Un seul geste à la fois : une opération en cours désactive tous les boutons.
  const occupe = deconnexion.action.occupe || nomAction.occupe || donneesAction.occupe;
  // `useLayoutEffect`, comme l'écran du cours (2a-R3) : la séance prend fin au rendu même qui suit
  // l'opération, et non à l'affichage suivant.
  useLayoutEffect(() => (occupe ? declarerSeance(() => 'retenue') : undefined), [occupe]);

  if (moi === undefined) {
    return null;
  }

  const choisirLangue = (choix: Langue) => {
    deconnexion.setEnAttente(undefined);
    return deconnexion.action.lancer(async () => {
      definirMoi(await modifierMoi(moi.id, { langue: choix }));
    });
  };

  const enregistrerLeNom = (evenement: Event) => {
    evenement.preventDefault();
    // La règle du serveur, appliquée avant la requête : le message dit ce qu'elle attend.
    const nomAffiche = nomAfficheValide(nom);
    if (nomAffiche === undefined) {
      setNomRefuse(true);
      return;
    }
    setNomRefuse(false);
    void nomAction.lancer(async () => {
      // Le profil rendu nomme la personne de l'écran (`modifierMoi` refuse sinon) : c'est son nom
      // que le téléphone apprend, jamais celui d'une autre.
      const modifie = await modifierMoi(moi.id, { nomAffiche });
      definirMoi(modifie);
      setNom(modifie.nomAffiche);
      // Sans attendre, et sans bruit : le signal ne retient rien (1e-D6).
      void signalerNom(modifie);
    });
  };

  return (
    <>
      <h2>
        {t.bonjour} {moi.nomAffiche}
      </h2>

      <section aria-labelledby="titre-cours">
        <h3 id="titre-cours">{t.cours_titre}</h3>
        {cours.erreur !== undefined && (
          <>
            <MessageErreur message={cours.erreur} />
            <button type="button" class="secondaire" onClick={() => cours.recharger()}>
              {t.reessayer}
            </button>
          </>
        )}
        {cours.donnees === undefined && cours.erreur === undefined && <p>{t.chargement}</p>}
        {cours.donnees?.length === 0 && <p>{t.cours_aucun}</p>}
        {cours.donnees !== undefined && cours.donnees.length > 0 && (
          <ul class="liste" data-testid="liste-cours">
            {cours.donnees.map((unCours) => (
              <li key={unCours.id}>
                <LienInterne vers={cheminDOuverture(unCours.id)}>{unCours.titre}</LienInterne>
              </li>
            ))}
          </ul>
        )}
      </section>

      <nav class="menu" aria-label="ancrage">
        <LienInterne vers="/appareils">{t.appareils_titre}</LienInterne>
        {moi.proprietaire && <LienInterne vers="/admin">{t.admin_lien}</LienInterne>}
      </nav>

      <section aria-labelledby="titre-nom">
        <h3 id="titre-nom">{t.nom_titre}</h3>
        <form onSubmit={enregistrerLeNom} noValidate>
          <label for="compte-nom-affiche">{t.nom_affiche}</label>
          <input
            id="compte-nom-affiche"
            name="nom-affiche"
            type="text"
            value={nom}
            autocomplete="off"
            autocapitalize="words"
            enterkeyhint="done"
            aria-invalid={nomRefuse}
            aria-describedby={nomRefuse ? 'compte-nom-affiche-erreur' : undefined}
            onInput={(evenement) => setNom(evenement.currentTarget.value)}
          />
          {nomRefuse && (
            <p class="erreur" id="compte-nom-affiche-erreur" role="alert">
              {t.nom_requis}
            </p>
          )}
          <button type="submit" class="principal" disabled={occupe}>
            {t.enregistrer}
          </button>
          <MessageErreur message={nomAction.erreur} />
        </form>
      </section>

      <fieldset class="choix-langue">
        <legend>{t.langue_interface}</legend>
        {LANGUES.map((code) => (
          <button
            key={code}
            type="button"
            class={langue === code ? 'principal' : 'secondaire'}
            aria-pressed={langue === code}
            disabled={occupe}
            onClick={() => choisirLangue(code)}
          >
            {t[`langue_${code}`]}
          </button>
        ))}
      </fieldset>

      <SectionDeconnexion moi={moi} etat={deconnexion} occupe={occupe} />
      <SectionDonnees moi={moi} action={donneesAction} occupe={occupe} />
    </>
  );
}
