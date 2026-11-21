/*
 * La liste « Schwierige Begriffe – nochmal ansehen » de Fortschritt (M6, T2-D9) : tous les éléments rebelles,
 * rangés par module dans l'ordre du manifeste, sous le titre du module, puis par nombre de fautes
 * décroissant. Chaque ligne dit la question, la réponse, l'aide de l'élément et ses fautes au rejeu.
 * Elle est en lecture seule : on n'y répond pas, rien n'est gardé (invariant 5).
 */
import { useMemo } from 'preact/hooks';
import { seuilDesRebelles } from '../../../domaine/cours/servi.js';
import { aReprendre } from '../../../domaine/progression/rebelles.js';
import { posablesDuCours } from '../../../domaine/seances/heute.js';
import { modulesDesPosables } from '../../../domaine/seances/semestre.js';
import { useCours } from '../contexte-cours.js';
import { AideDeLElement } from '../questions/AideEtMarque.js';
import { questionEtReponse } from '../questions/question-et-reponse.js';
import { formater } from '../textes-cours.js';

export function ListeDesRebelles() {
  const { cours, t, fautes } = useCours();
  const groupes = useMemo(
    () =>
      aReprendre(
        posablesDuCours(cours),
        modulesDesPosables(cours),
        // L'ordre des modules est celui du manifeste, non celui de la table des modules.
        cours.cours.modules.map(({ id }) => id),
        fautes,
        seuilDesRebelles(cours.cours),
      ),
    [cours, fautes],
  );
  const titreDe = (id: string): string => {
    const module = cours.cours.modules.find((m) => m.id === id);
    return module !== undefined && 'titre' in module ? module.titre : '';
  };

  return (
    <>
      <h2>{t.progression_rebelles}</h2>
      {groupes.length === 0 ? (
        <p class="muted">{t.progression_aucun_rebelle}</p>
      ) : (
        groupes.map(({ module, elements }) => (
          <div key={module} class="rebelles-groupe">
            <h3>{titreDe(module)}</h3>
            <ul class="rebelles">
              {elements.map(({ posable, fautes: n }) => {
                const { question, reponse, indication, aide } = questionEtReponse(
                  posable,
                  t,
                  cours.unites,
                );
                return (
                  <li key={posable.id}>
                    <div class="ligne">
                      <b>{question}</b>
                      <span>{reponse}</span>
                      <em>{formater(t.progression_fausses, { n })}</em>
                    </div>
                    {indication !== undefined && <span class="meta indication">{indication}</span>}
                    <AideDeLElement aide={aide} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </>
  );
}
