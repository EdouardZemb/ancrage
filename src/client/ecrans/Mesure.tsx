import { useState } from 'preact/hooks';
import {
  ALGORITHMES,
  type AlgorithmeMesure,
  mesurerLaTaille,
} from '../../domaine/progression/mesure-rejeu.js';

/*
 * L'écran de mesure, à l'adresse /mesure (M3-P7) : un outil du responsable, en français, qui chronomètre sur l'appareil
 * qui l'ouvre le rejeu d'un journal inventé par chaque algorithme de mémoire. Il ne lit ni n'écrit
 * aucune donnée : ni l'API, ni le stockage de l'appareil. Aucun écran n'y renvoie.
 */

const TAILLES = [1000, 10000, 30000] as const;
const TAILLE_A_CONFIRMER = 30000;
const UNITES = 2000;
const GRAINE = 1;
const REPETITIONS = 5;

const LIBELLES: Record<AlgorithmeMesure, string> = {
  leitner: 'Leitner',
  fsrs: 'FSRS',
  'par-chapitre': 'Par chapitre',
};

type Durees = Record<AlgorithmeMesure, number>;
type Mesurer = (taille: number) => Durees;

const mesurerSurLAppareil: Mesurer = (taille) =>
  mesurerLaTaille(taille, {
    unites: UNITES,
    graine: GRAINE,
    repetitions: REPETITIONS,
    maintenant: () => performance.now(),
  });

const nombre = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
/** Les milliers séparés par une espace ordinaire : `10 000`. */
const formaterTaille = (taille: number): string =>
  String(taille).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function Mesure(props: { mesurer?: Mesurer }) {
  const mesurer = props.mesurer ?? mesurerSurLAppareil;
  const [durees, setDurees] = useState<Partial<Record<number, Durees>>>({});
  const [enCours, setEnCours] = useState<number | undefined>(undefined);
  const [aConfirmer, setAConfirmer] = useState(false);

  function lancer(taille: number) {
    setAConfirmer(false);
    setEnCours(taille);
    // Après un rendu : « mesure en cours » s'affiche avant que le calcul occupe l'appareil.
    setTimeout(() => {
      try {
        setDurees((avant) => ({ ...avant, [taille]: mesurer(taille) }));
      } finally {
        setEnCours(undefined);
      }
    }, 0);
  }

  return (
    <section>
      <h2>Mesure du rejeu du journal</h2>
      <p>
        Chaque mesure fabrique en mémoire un journal inventé de {formaterTaille(UNITES)} unités et
        le rejoue {REPETITIONS} fois par algorithme. Le tableau donne la médiane, en millisecondes.
        Rien n'est lu ni écrit.
      </p>
      <p>
        Appareil : <code>{navigator.userAgent}</code>
      </p>
      <p>
        {TAILLES.map((taille) => (
          <button
            key={taille}
            type="button"
            class="secondaire"
            disabled={enCours !== undefined}
            onClick={() => (taille === TAILLE_A_CONFIRMER ? setAConfirmer(true) : lancer(taille))}
          >
            Mesurer {formaterTaille(taille)} réponses
          </button>
        ))}
      </p>
      {aConfirmer && enCours === undefined && (
        <div role="alert">
          <p>
            {formaterTaille(TAILLE_A_CONFIRMER)} réponses : le téléphone peut se figer quelques
            secondes.
          </p>
          <button type="button" onClick={() => lancer(TAILLE_A_CONFIRMER)}>
            Lancer la mesure
          </button>{' '}
          <button type="button" class="secondaire" onClick={() => setAConfirmer(false)}>
            Annuler
          </button>
        </div>
      )}
      {enCours !== undefined && (
        <p role="status">Mesure en cours ({formaterTaille(enCours)} réponses)…</p>
      )}
      <table>
        <thead>
          <tr>
            <th scope="col">Réponses</th>
            {ALGORITHMES.map((algorithme) => (
              <th scope="col" key={algorithme}>
                {LIBELLES[algorithme]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TAILLES.map((taille) => {
            const mesuree = durees[taille];
            return (
              <tr key={taille}>
                <th scope="row">{formaterTaille(taille)}</th>
                {ALGORITHMES.map((algorithme) => (
                  <td key={algorithme}>
                    {mesuree === undefined ? '—' : `${nombre.format(mesuree[algorithme])} ms`}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
