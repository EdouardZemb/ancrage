/*
 * La section « Personnes » de l'administration (ancrage-donnees#39 : elle quitte `Admin.tsx`). Pour chaque
 * personne : ses groupes, ses cours, ses appareils, le lien de secours, la déconnexion de ses
 * appareils, ses passkeys (que le propriétaire supprime, même la dernière : un téléphone perdu,
 * 1e-D8) et la suppression de son compte, sauf pour le propriétaire (1e-D4). Chaque fiche a son
 * propre état d'échec, affiché dans la fiche (1f-D10).
 */
import { useState } from 'preact/hooks';
import { appeler, type PasskeyEnregistree } from '../api.js';
import { BoutonConfirme, formaterDate, LienAPartager, MessageErreur } from '../composants.js';
import { useAgir } from '../contexte.js';
import { textes } from '../textes.js';
import { LIBELLES, type Personne, type PropsSection, T } from './admin-commun.js';
import { DetailAppareil, nomAppareil } from './detail-appareil.js';

/** Les noms d'après les identifiants ; l'identifiant lui-même si le nom n'est pas connu. */
function noms(ids: readonly string[], parId: ReadonlyMap<string, string>): string {
  return ids.length === 0 ? T.aucun : ids.map((id) => parId.get(id) ?? id).join(', ');
}

/** Les passkeys d'une personne, en français seulement (décision 2) : `textes.fr`, jamais `t`. */
function Passkeys(props: {
  personne: Personne;
  passkeys: readonly PasskeyEnregistree[];
  occupe: boolean;
  supprimer: (passkey: PasskeyEnregistree) => void;
}) {
  const { personne, passkeys, occupe, supprimer } = props;
  return (
    <>
      <p class="detail">
        <strong>{T.passkeys_titre}</strong>
      </p>
      {passkeys.length === 0 && <p class="detail">{T.aucune_passkey}</p>}
      {passkeys.length > 0 && (
        <ul class="sous-liste" aria-label={T.passkeys_titre}>
          {passkeys.map((passkey) => (
            <li key={passkey.id}>
              <span>
                {nomAppareil(passkey.appareil, textes.fr.appareil_autre)}
                <br />
                <span class="detail">
                  <DetailAppareil
                    creeLe={passkey.creeLe}
                    utiliseLe={passkey.utiliseLe}
                    langue="fr"
                    textes={textes.fr}
                  />
                </span>
              </span>
              <BoutonConfirme
                libelle={textes.fr.supprimer}
                confirmer={textes.fr.confirmer}
                description={`${textes.fr.supprimer} : ${T.passkeys_titre}, ${personne.nomAffiche}, ${nomAppareil(passkey.appareil, textes.fr.appareil_autre)}, ${formaterDate(passkey.creeLe, 'fr')}`}
                disabled={occupe}
                onConfirme={() => supprimer(passkey)}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * La fiche d'une personne. Elle a son propre état d'échec, affiché après ses boutons : l'échec
 * d'une action ne parle que dans la fiche où l'on a touché, et l'action réussie suivante de cette
 * fiche l'efface (1f-D10).
 */
function LignePersonne(props: {
  personne: Personne;
  nomsGroupes: ReadonlyMap<string, string>;
  titresCours: ReadonlyMap<string, string>;
  recharger: () => Promise<void>;
  /** Le lien de secours montré dans cette fiche, s'il y en a un. */
  lien: string | undefined;
  montrerLien: (url: string) => void;
}) {
  const { personne, nomsGroupes, titresCours, recharger, lien, montrerLien } = props;
  const action = useAgir(recharger, LIBELLES);
  const { agir } = action;
  const identifiant = encodeURIComponent(personne.id);

  const lienDeSecours = () =>
    action.lancer(async () => {
      const { lien: url } = await appeler<{ lien: string }>(
        'POST',
        `/api/admin/personnes/${identifiant}/lien`,
      );
      montrerLien(url);
    });

  const deconnecterAppareils = () =>
    agir(() => appeler('DELETE', `/api/admin/personnes/${identifiant}/sessions`));

  // L'identifiant de la passkey (du base64url) est encodé comme tout identifiant d'une adresse.
  const supprimerPasskey = (passkey: PasskeyEnregistree) =>
    agir(() =>
      appeler(
        'DELETE',
        `/api/admin/personnes/${identifiant}/passkeys/${encodeURIComponent(passkey.id)}`,
      ),
    );

  const supprimerCompte = () =>
    agir(() => appeler('DELETE', `/api/admin/personnes/${identifiant}`));

  return (
    <li>
      <p class="nom">
        <strong>{personne.nomAffiche}</strong>
        {personne.proprietaire && <span class="badge">{T.proprietaire}</span>}
      </p>
      <p class="detail">
        {T.groupes_de} : {noms(personne.groupes, nomsGroupes)}
        <br />
        {T.cours_de} : {noms(personne.droits, titresCours)}
        <br />
        {T.appareils_connectes} : {personne.nbAppareils}
      </p>
      {personne.passkeys !== undefined && (
        <Passkeys
          personne={personne}
          passkeys={personne.passkeys}
          occupe={action.occupe}
          supprimer={supprimerPasskey}
        />
      )}
      <div class="actions">
        <button
          type="button"
          class="secondaire"
          disabled={action.occupe}
          aria-label={`${T.lien_secours} : ${personne.nomAffiche}`}
          onClick={lienDeSecours}
        >
          {T.lien_secours}
        </button>
        <BoutonConfirme
          libelle={T.deconnecter_appareils}
          confirmer={textes.fr.confirmer}
          description={`${T.deconnecter_appareils} : ${personne.nomAffiche}`}
          disabled={action.occupe}
          onConfirme={deconnecterAppareils}
        />
        {/* Les passkeys sont le signe d'un serveur du lot 1e ou plus récent : d'avant, la route de
            suppression n'existe pas (après un retour arrière, l'application précachée la
            proposerait pour rien, 1f-D10). */}
        {!personne.proprietaire && personne.passkeys !== undefined && (
          <BoutonConfirme
            libelle={T.supprimer_compte}
            confirmer={T.supprimer_compte_confirmer}
            description={`${T.supprimer_compte} : ${personne.nomAffiche}`}
            disabled={action.occupe}
            onConfirme={supprimerCompte}
          />
        )}
      </div>
      <MessageErreur message={action.erreur} />
      {lien !== undefined && (
        <LienAPartager key={lien} lien={lien} t={LIBELLES} consigne={T.lien_secours_pret} />
      )}
    </li>
  );
}

export function SectionPersonnes({ donnees, recharger }: PropsSection) {
  // Un seul lien de secours est montré à la fois : celui qu'on vient de créer, dans sa fiche.
  const [lien, setLien] = useState<{ pour: string; url: string } | undefined>();
  const nomsGroupes = new Map(donnees.groupes.map((groupe) => [groupe.id, groupe.nom]));
  const titresCours = new Map(donnees.cours.map((cours) => [cours.id, cours.titre]));

  return (
    <section aria-labelledby="titre-personnes">
      <h3 id="titre-personnes">{T.personnes_titre}</h3>
      <ul class="liste" data-testid="liste-personnes">
        {donnees.personnes.map((personne) => (
          <LignePersonne
            key={personne.id}
            personne={personne}
            nomsGroupes={nomsGroupes}
            titresCours={titresCours}
            recharger={recharger}
            lien={lien?.pour === personne.id ? lien.url : undefined}
            montrerLien={(url) => setLien({ pour: personne.id, url })}
          />
        ))}
      </ul>
    </section>
  );
}
