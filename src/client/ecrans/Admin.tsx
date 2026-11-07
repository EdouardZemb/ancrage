/*
 * L'administration, en français seulement (décision 2) : les personnes, les invitations, les
 * groupes et les droits sur les cours. Réservée au propriétaire : pour une autre personne, les
 * routes de l'API n'existent pas (404). Chaque section a son propre état d'échec (pour les
 * personnes, chaque fiche), affiché près de ses boutons ; après chaque changement, toutes les
 * données sont relues. La section des personnes est dans `AdminPersonnes.tsx` ; ce que les
 * sections partagent est dans `admin-commun.ts` et `composants-admin.tsx`. Les groupes et les droits
 * sont dans `AdminGroupes.tsx` et `AdminDroits.tsx`.
 */
import { useState } from 'preact/hooks';
import { appeler, type CoursResume } from '../api.js';
import { LienAPartager, LienInterne, MessageErreur } from '../composants.js';
import { useAction, useChargement } from '../contexte.js';
import { textes } from '../textes.js';
import { SectionDroits } from './AdminDroits.js';
import { SectionGroupes } from './AdminGroupes.js';
import { SectionPersonnes } from './AdminPersonnes.js';
import {
  type Donnees,
  type Droit,
  type Groupe,
  LIBELLES,
  type Personne,
  type PropsSection,
  T,
} from './admin-commun.js';
import { basculer, Case } from './composants-admin.js';

async function charger(): Promise<Donnees> {
  const [personnes, groupes, droits, cours] = await Promise.all([
    appeler<Personne[]>('GET', '/api/admin/personnes'),
    appeler<Groupe[]>('GET', '/api/admin/groupes'),
    appeler<Droit[]>('GET', '/api/admin/autorisations'),
    // Pour le propriétaire, la liste des cours est celle de tous les cours chargés.
    appeler<CoursResume[]>('GET', '/api/cours'),
  ]);
  return { personnes, groupes, droits, cours };
}
// --- Invitation ---

function SectionInvitation({ donnees }: Pick<PropsSection, 'donnees'>) {
  const action = useAction(LIBELLES);
  const [groupes, setGroupes] = useState<ReadonlySet<string>>(new Set());
  const [cours, setCours] = useState<ReadonlySet<string>>(new Set());
  const [lien, setLien] = useState<string | undefined>();

  const inviter = (evenement: Event) => {
    evenement.preventDefault();
    void action.lancer(async () => {
      // Sans groupe ni cours, la requête n'a pas de corps : une invitation sans octroi.
      const octroi =
        groupes.size + cours.size === 0 ? undefined : { groupes: [...groupes], cours: [...cours] };
      const reponse = await appeler<{ lien: string }>('POST', '/api/admin/invitations', octroi);
      setLien(reponse.lien);
    });
  };

  return (
    <section aria-labelledby="titre-inviter">
      <h3 id="titre-inviter">{T.inviter_titre}</h3>
      <form onSubmit={inviter}>
        <p class="detail">{T.inviter_aide}</p>
        {donnees.groupes.length > 0 && (
          <fieldset>
            <legend>{T.inviter_groupes}</legend>
            {donnees.groupes.map((groupe) => (
              <Case
                key={groupe.id}
                libelle={groupe.nom}
                cochee={groupes.has(groupe.id)}
                onChange={() => setGroupes(basculer(groupes, groupe.id))}
              />
            ))}
          </fieldset>
        )}
        {donnees.cours.length > 0 && (
          <fieldset>
            <legend>{T.inviter_cours}</legend>
            {donnees.cours.map((unCours) => (
              <Case
                key={unCours.id}
                libelle={unCours.titre}
                cochee={cours.has(unCours.id)}
                onChange={() => setCours(basculer(cours, unCours.id))}
              />
            ))}
          </fieldset>
        )}
        <button type="submit" class="principal" disabled={action.occupe}>
          {T.inviter_creer}
        </button>
      </form>
      <MessageErreur message={action.erreur} />
      {lien !== undefined && (
        <LienAPartager key={lien} lien={lien} t={LIBELLES} consigne={T.inviter_prete} />
      )}
    </section>
  );
}

export function Admin() {
  const { donnees, erreur, recharger } = useChargement(charger, LIBELLES);

  return (
    <>
      <p>
        <LienInterne vers="/">{textes.fr.retour_accueil}</LienInterne>
      </p>
      <h2>{T.admin_titre}</h2>
      <MessageErreur message={erreur} />
      {erreur !== undefined && (
        <button type="button" class="secondaire" onClick={() => recharger()}>
          {textes.fr.reessayer}
        </button>
      )}
      {donnees === undefined && erreur === undefined && <p>{textes.fr.chargement}</p>}
      {donnees !== undefined && (
        <>
          <SectionPersonnes donnees={donnees} recharger={recharger} />
          <SectionInvitation donnees={donnees} />
          <SectionGroupes donnees={donnees} recharger={recharger} />
          <SectionDroits donnees={donnees} recharger={recharger} />
        </>
      )}
    </>
  );
}
