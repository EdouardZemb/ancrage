/*
 * Une tâche d'orthographe (`orthographe`) : chaque mot est montré sous sa forme fautive, et l'on tape
 * la bonne graphie. Un mot répond aussitôt (`t.pruefen`) : la casse et les accents comptent, pas les
 * espaces de bord (F1-D4). Le champ n'a ni majuscule automatique ni correcteur, car la graphie tapée
 * est celle qui est jugée. Chaque mot jugé est rendu aussitôt à l'onglet (R17). Une saisie vide (ou
 * faite d'espaces) est ignorée : ce n'est pas une réponse fausse, elle n'est jamais enregistrée (R16).
 *
 * Ce qui a été tapé vit dans la mémoire de l'onglet, rangé par identifiant de mot (`null` tant que
 * le mot attend).
 */
import type { MotACorriger } from '../../../domaine/contenu/modele.js';
import { egalOrthographe } from '../../../domaine/feuilles/correction.js';
import { SaisieDeLaReponse } from '../composants-cours.js';
import { type PropsDeTache, useEtatDesElements } from './tache.js';

export function TacheOrthographe(props: PropsDeTache<'orthographe'>) {
  const { tache, onRepondu } = props;
  const [saisies, changer] = useEtatDesElements<MotACorriger, string | null>(
    tache,
    tache.mots,
    () => null,
  );

  const verifier = (mot: MotACorriger, saisie: string) => {
    if (saisies[mot.id] !== null || saisie.trim() === '') return;
    changer(mot.id, saisie);
    onRepondu([{ id: mot.id, juste: egalOrthographe(saisie, mot.reponse) }]);
  };

  return (
    <>
      {tache.mots.map((mot) => {
        const saisie = saisies[mot.id];
        const juste = saisie !== null && egalOrthographe(saisie, mot.reponse);
        return (
          <div key={mot.id} class="element">
            <p class="enonce">{mot.fautif}</p>
            {saisie === null ? (
              <SaisieDeLaReponse
                etiquette={mot.fautif}
                sansFocus
                onVerifier={(tapee) => verifier(mot, tapee)}
              />
            ) : (
              <div class={juste ? 'verdict ok' : 'verdict ko'}>
                {!juste && <s>{saisie}</s>}
                <b>{mot.reponse}</b>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
