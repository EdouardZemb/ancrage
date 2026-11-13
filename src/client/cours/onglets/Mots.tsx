/*
 * « Wortbaukasten » (`renderWords`, H:1862-1928, et les touches de H:2247) : trouver le sens des
 * parties d'un mot (« Wörter zerlegen »), ou bâtir un mot avec des morphèmes (« Wörter bilden »).
 * « Gemischt » tire l'un ou l'autre à chaque mot (H:1873).
 *
 * Un mot est journalisé une fois, quand il est fini : juste si chaque partie l'est (zerlegen), ou
 * si les tuiles sont exactement ses morphèmes dans l'ordre (bilden). Une partie ne produit rien.
 *
 * La série (le score) et le mot en cours vivent dans l'écran du cours (`useEtatDOnglet`) : un
 * détour par un autre onglet les retrouve. Elle recommence au changement d'exercice. Un module sans
 * mot n'a rien à tirer : l'onglet le dit, et ne plante pas.
 */

import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import type { ModeDeReponse } from '../../../domaine/journal/evenement.js';
import { reussis } from '../../../domaine/progression/statistiques.js';
import { choisirMot } from '../../../domaine/seances/mots.js';
import { ChoixDeMode } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import type { Preferences } from '../preferences.js';
import { QuestionMot, type TacheDeMot, tacheDeMot } from '../questions/QuestionMot.js';
import { serieCommencee } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';

/** `tache` est `null` quand le module n'a aucun mot à proposer. */
interface Serie {
  cle: string;
  faites: number;
  justes: number;
  tache: TacheDeMot | null;
}

export function Mots() {
  const { cours } = useCours();
  return cours.morphologie === undefined ? null : <MotsDuModule module={cours.morphologie} />;
}

function MotsDuModule(props: { module: ModuleServiDe<'morphologie'> }) {
  const { module } = props;
  const { t, etats, enregistrer, preferences, changerPreferences, hasard, useEtatDOnglet } =
    useCours();
  const choix = preferences.mots.mode;

  // Un mot sans segment n'a rien à zerlegen ni à bâtir.
  const jouables = module.mots.filter((mot) => mot.segments.length > 0);

  const tirer = (): TacheDeMot | null => {
    if (jouables.length === 0) return null;
    const mot = choisirMot(jouables, etats, hasard);
    const mode = choix === 'mix' ? (hasard() < 0.5 ? 'zerlegen' : 'bilden') : choix;
    return tacheDeMot(mot, mode, module, hasard);
  };
  const demarrer = (): Serie => ({ cle: choix, faites: 0, justes: 0, tache: tirer() });
  const [courante, setCourante] = useEtatDOnglet<Serie>('mots', demarrer, serieCommencee);
  // Un autre exercice : on recommence.
  let serie = courante;
  if (courante.cle !== choix) serie = demarrer();
  if (serie !== courante) setCourante(serie);

  const { tache } = serie;

  /** La série avec un mot de plus, juste ou non. */
  const comptee = (juste: boolean) => ({
    ...serie,
    faites: serie.faites + 1,
    justes: serie.justes + (juste ? 1 : 0),
  });

  // Un seul rappel par geste (M2-P7) : la tâche, et au geste qui juge le mot, son compte.
  const surTache = (suivante: TacheDeMot, jugement?: { juste: boolean; mode: ModeDeReponse }) => {
    if (jugement === undefined) {
      setCourante({ ...serie, tache: suivante });
      return;
    }
    setCourante({ ...comptee(jugement.juste), tache: suivante });
    void enregistrer(suivante.mot.id, jugement.juste, jugement.mode);
  };

  const motsReussis = reussis(
    module.mots.map(({ id }) => id),
    etats,
  );

  return (
    <section>
      <div class="controls">
        <ChoixDeMode
          valeur={choix}
          modes={[
            { valeur: 'zerlegen', libelle: t.mots_choix_zerlegen },
            { valeur: 'bilden', libelle: t.mots_choix_bilden },
          ]}
          onChoix={(mode) =>
            changerPreferences({
              ...preferences,
              mots: { mode: mode as Preferences['mots']['mode'] },
            })
          }
        />
        <span class="progressline">
          {formater(t.serie_resultat, { justes: serie.justes, faites: serie.faites })}
          {' · '}
          {formater(t.mots_geschafft, { n: motsReussis, total: module.mots.length })}
        </span>
      </div>

      {tache === null ? (
        <p class="muted">{t.onglet_vide}</p>
      ) : (
        <QuestionMot
          module={module}
          tache={tache}
          onTache={surTache}
          onSuivante={() => setCourante({ ...serie, tache: tirer() })}
        />
      )}
    </section>
  );
}
