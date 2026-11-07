/*
 * La section « Droits » de l'administration : les droits nommés sur les cours, pour une personne
 * ou un groupe, leur retrait et leur ouverture (elle quitte `Admin.tsx`, 2b-D6).
 */
import { useState } from 'preact/hooks';
import { appeler } from '../api.js';
import { MessageErreur } from '../composants.js';
import { useAgir } from '../contexte.js';
import { type Droit, LIBELLES, type PropsSection, T, type TypeSujet } from './admin-commun.js';

export function SectionDroits({ donnees, recharger }: PropsSection) {
  const action = useAgir(recharger, LIBELLES);
  const { agir } = action;
  const [cours, setCours] = useState('');
  // « personne:<id> » ou « groupe:<id> » : un seul choix pour les deux sortes de sujets.
  const [sujet, setSujet] = useState('');
  const nomsPersonnes = new Map(
    donnees.personnes.map((personne) => [personne.id, personne.nomAffiche]),
  );
  const nomsGroupes = new Map(donnees.groupes.map((groupe) => [groupe.id, groupe.nom]));

  const nomDuSujet = (droit: Droit) =>
    (droit.sujet.type === 'personne' ? nomsPersonnes : nomsGroupes).get(droit.sujet.id) ??
    T.sujet_inconnu;
  const titreDuCours = (droit: Droit) => droit.coursTitre ?? `${T.cours_retire} (${droit.cours})`;

  const ouvrir = (evenement: Event) => {
    evenement.preventDefault();
    const separateur = sujet.indexOf(':');
    const type = sujet.slice(0, separateur) as TypeSujet;
    const id = sujet.slice(separateur + 1);
    void agir(async () => {
      await appeler('POST', '/api/admin/autorisations', { cours, sujet: { type, id } });
      setSujet('');
    });
  };

  const droits = [...donnees.droits].sort(
    (a, b) =>
      titreDuCours(a).localeCompare(titreDuCours(b), 'fr') ||
      nomDuSujet(a).localeCompare(nomDuSujet(b), 'fr'),
  );
  // Le propriétaire a déjà tous les cours : lui donner un droit ne servirait à rien.
  const personnes = donnees.personnes.filter((personne) => !personne.proprietaire);

  return (
    <section aria-labelledby="titre-droits">
      <h3 id="titre-droits">{T.droits_titre}</h3>
      <p class="detail">{T.droits_aide}</p>
      {droits.length === 0 && <p>{T.droit_aucun}</p>}
      {droits.length > 0 && (
        <ul class="liste" data-testid="liste-droits">
          {droits.map((droit) => (
            <li key={droit.id}>
              <p class="nom">
                <strong>{titreDuCours(droit)}</strong>
              </p>
              <p class="detail">
                {nomDuSujet(droit)} <span class="badge">{T[`sujet_${droit.sujet.type}`]}</span>
              </p>
              <button
                type="button"
                class="secondaire"
                disabled={action.occupe}
                aria-label={`${T.retirer} : ${titreDuCours(droit)}, ${nomDuSujet(droit)}`}
                onClick={() =>
                  agir(() =>
                    appeler('DELETE', `/api/admin/autorisations/${encodeURIComponent(droit.id)}`),
                  )
                }
              >
                {T.retirer}
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={ouvrir}>
        <label for="droit-cours">{T.droit_cours}</label>
        <select
          id="droit-cours"
          value={cours}
          onChange={(evenement) => setCours(evenement.currentTarget.value)}
        >
          <option value="">{T.droit_choisir}</option>
          {donnees.cours.map((unCours) => (
            <option key={unCours.id} value={unCours.id}>
              {unCours.titre}
            </option>
          ))}
        </select>
        <label for="droit-sujet">{T.droit_sujet}</label>
        <select
          id="droit-sujet"
          value={sujet}
          onChange={(evenement) => setSujet(evenement.currentTarget.value)}
        >
          <option value="">{T.droit_choisir}</option>
          {personnes.length > 0 && (
            <optgroup label={T.droit_personnes}>
              {personnes.map((personne) => (
                <option key={personne.id} value={`personne:${personne.id}`}>
                  {personne.nomAffiche}
                </option>
              ))}
            </optgroup>
          )}
          {donnees.groupes.length > 0 && (
            <optgroup label={T.droit_groupes}>
              {donnees.groupes.map((groupe) => (
                <option key={groupe.id} value={`groupe:${groupe.id}`}>
                  {groupe.nom}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <button
          type="submit"
          class="secondaire"
          disabled={action.occupe || cours === '' || sujet === ''}
        >
          {T.droit_ouvrir}
        </button>
      </form>
      <MessageErreur message={action.erreur} />
    </section>
  );
}
