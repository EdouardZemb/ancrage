/*
 * La section « Groupes » de l'administration : la liste des groupes avec leurs membres, l'ajout
 * et le retrait d'un membre, et la création d'un groupe (elle quitte `Admin.tsx`, 2b-D6).
 */
import { useState } from 'preact/hooks';
import { appeler } from '../api.js';
import { MessageErreur } from '../composants.js';
import { useAgir } from '../contexte.js';
import { type Groupe, LIBELLES, type Personne, type PropsSection, T } from './admin-commun.js';

function LigneGroupe(props: {
  groupe: Groupe;
  membres: Personne[];
  candidates: Personne[];
  occupe: boolean;
  agir: ReturnType<typeof useAgir>['agir'];
}) {
  const { groupe, membres, candidates, occupe, agir } = props;
  const [choix, setChoix] = useState('');
  const chemin = `/api/admin/groupes/${encodeURIComponent(groupe.id)}/membres`;

  return (
    <li>
      <p class="nom">
        <strong>{groupe.nom}</strong>
      </p>
      {membres.length === 0 && <p class="detail">{T.groupe_sans_membre}</p>}
      {membres.length > 0 && (
        <ul class="sous-liste">
          {membres.map((membre) => (
            <li key={membre.id}>
              <span>{membre.nomAffiche}</span>
              <button
                type="button"
                class="secondaire"
                disabled={occupe}
                aria-label={`${T.retirer} : ${membre.nomAffiche}, ${groupe.nom}`}
                onClick={() =>
                  agir(() => appeler('DELETE', `${chemin}/${encodeURIComponent(membre.id)}`))
                }
              >
                {T.retirer}
              </button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <div class="actions">
          <select
            aria-label={`${T.membre_choisir} (${groupe.nom})`}
            value={choix}
            onChange={(evenement) => setChoix(evenement.currentTarget.value)}
          >
            <option value="">{T.membre_choisir}</option>
            {candidates.map((personne) => (
              <option key={personne.id} value={personne.id}>
                {personne.nomAffiche}
              </option>
            ))}
          </select>
          <button
            type="button"
            class="secondaire"
            disabled={occupe || choix === ''}
            aria-label={`${T.membre_ajouter} : ${groupe.nom}`}
            onClick={() =>
              agir(async () => {
                await appeler('POST', chemin, { personne: choix });
                setChoix('');
              })
            }
          >
            {T.membre_ajouter}
          </button>
        </div>
      )}
    </li>
  );
}

export function SectionGroupes({ donnees, recharger }: PropsSection) {
  const action = useAgir(recharger, LIBELLES);
  const { agir } = action;
  const [nom, setNom] = useState('');

  const creer = (evenement: Event) => {
    evenement.preventDefault();
    const nomGroupe = nom.trim();
    if (nomGroupe === '') {
      return;
    }
    void agir(async () => {
      await appeler('POST', '/api/admin/groupes', { nom: nomGroupe });
      setNom('');
    });
  };

  return (
    <section aria-labelledby="titre-groupes">
      <h3 id="titre-groupes">{T.groupes_titre}</h3>
      {donnees.groupes.length === 0 && <p>{T.groupe_aucun}</p>}
      {donnees.groupes.length > 0 && (
        <ul class="liste" data-testid="liste-groupes">
          {donnees.groupes.map((groupe) => (
            <LigneGroupe
              key={groupe.id}
              groupe={groupe}
              membres={donnees.personnes.filter((personne) => personne.groupes.includes(groupe.id))}
              candidates={donnees.personnes.filter(
                (personne) => !personne.groupes.includes(groupe.id),
              )}
              occupe={action.occupe}
              agir={agir}
            />
          ))}
        </ul>
      )}
      <form onSubmit={creer}>
        <label for="nom-groupe">{T.groupe_nom}</label>
        <input
          id="nom-groupe"
          type="text"
          value={nom}
          autocomplete="off"
          onInput={(evenement) => setNom(evenement.currentTarget.value)}
        />
        <button type="submit" class="secondaire" disabled={action.occupe || nom.trim() === ''}>
          {T.groupe_creer}
        </button>
      </form>
      <MessageErreur message={action.erreur} />
    </section>
  );
}
