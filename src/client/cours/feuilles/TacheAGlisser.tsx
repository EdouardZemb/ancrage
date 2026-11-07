/*
 * Les tâches où l'on pose des termes (F1, ancrage-donnees#90). L'appariement (`appariement`) a une case par cible,
 * qui reçoit un seul terme ; le classement (`classement`) a une zone par catégorie, qui en reçoit
 * plusieurs. L'examen final se passe sur une plateforme où l'on glisse : le geste compte.
 *
 * Deux chemins mènent au même placement (`placer`) :
 * - le glisser, au doigt ou à la souris (`useGlisser`) ;
 * - le toucher : toucher un terme de la réserve le choisit (`aria-pressed`), toucher une cible l'y
 *   pose, toucher un terme posé le rend à la réserve. Ce sont des boutons : le clavier et les
 *   lecteurs d'écran suivent ce chemin (WCAG 2.2, critère 2.5.7).
 * Un terme posé, le focus passe au terme suivant de la réserve, ou à `t.pruefen` s'il n'y en a plus.
 *
 * `t.pruefen`, actif quand tous les termes sont posés, juge la tâche d'un coup. Chaque cible dit
 * juste (`ok`) ou faux (`ko`), avec sous une cible fausse ses bons termes ; chaque terme posé dit
 * s'il est juste. Un terme est un élément du journal, juste s'il est sur sa bonne cible.
 *
 * L'état de chaque terme (sa place, et le tirage qui range la réserve) vit dans la mémoire de
 * l'onglet, rangé par identifiant d'élément ; le terme choisi et « déjà jugée » vivent sous des
 * sous-clés de la tâche.
 */
import { useEffect, useRef } from 'preact/hooks';
import { useCours } from '../contexte-cours.js';
import { type Placements, placer, retirer } from './glisser.js';
import { CLE_FEUILLES, type PropsDeTache, resultatsDeTache, useEtatDesElements } from './tache.js';
import { useGlisser } from './useGlisser.js';

type TacheAPoser = PropsDeTache<'appariement' | 'classement'>['tache'];

/** Un terme à poser : l'élément de la tâche, et l'identifiant de sa bonne cible. */
interface Terme {
  id: string;
  terme: string;
  bonne: string;
}

/** Une cible : la case d'une paire (l'identifiant de la paire) ou la zone d'une catégorie. */
interface Cible {
  id: string;
  libelle: string;
}

interface Etat {
  /** La cible où le terme est posé, `null` dans la réserve. */
  place: string | null;
  /** Un tirage fait une fois pour toutes : la réserve range ses termes dans cet ordre. */
  rang: number;
}

/** Les termes et les cibles de la tâche. Un appariement n'a qu'un terme par case (`unique`). */
function plateauDe(tache: TacheAPoser): { termes: Terme[]; cibles: Cible[]; unique: boolean } {
  if (tache.genre === 'appariement') {
    return {
      termes: tache.paires.map(({ id, terme }) => ({ id, terme, bonne: id })),
      cibles: tache.paires.map(({ id, cible }) => ({ id, libelle: cible })),
      unique: true,
    };
  }
  return {
    termes: tache.elements.map(({ id, terme, categorie }) => ({ id, terme, bonne: categorie })),
    cibles: tache.categories.map((categorie) => ({ id: categorie, libelle: categorie })),
    unique: false,
  };
}

/** Le verdict d'une cible, une fois tout posé : `null` si elle n'attendait et ne reçut rien. */
function verdictDe(cible: Cible, termes: readonly Terme[], placements: Placements) {
  const attendus = termes.filter(({ bonne }) => bonne === cible.id);
  const poses = termes.filter(({ id }) => placements.get(id) === cible.id);
  if (attendus.length === 0 && poses.length === 0) return null;
  const juste = poses.length === attendus.length && poses.every(({ bonne }) => bonne === cible.id);
  return juste ? 'ok' : 'ko';
}

export function TacheAGlisser(props: PropsDeTache<'appariement' | 'classement'>) {
  const { tache, onRepondu } = props;
  const { t, hasard, useEtatDOnglet } = useCours();
  const { termes, cibles, unique } = plateauDe(tache);
  const [etats, changer] = useEtatDesElements<Terme, Etat>(tache, termes, () => ({
    place: null,
    rang: hasard(),
  }));
  const [jugee, juger] = useEtatDOnglet<boolean>(`${CLE_FEUILLES}/${tache.id}/jugee`, () => false);
  const [choisi, choisir] = useEtatDOnglet<string | null>(
    `${CLE_FEUILLES}/${tache.id}/choisi`,
    () => null,
  );
  const reserve = useRef<HTMLDivElement>(null);
  const zones = useRef<HTMLDivElement>(null);
  const pruefen = useRef<HTMLButtonElement>(null);
  /** Le terme à focaliser après le rendu (`null` : « Prüfen »), et s'il faut l'amener à l'écran. */
  const aFocaliser = useRef<{ terme: string | null; defiler: boolean } | null>(null);

  // Une place qui n'est pas une cible de cette tâche ne compte pas : le terme est dans la réserve.
  const ids = new Set(cibles.map(({ id }) => id));
  const placements: Placements = new Map(
    termes.flatMap(({ id }): [string, string][] => {
      const { place } = etats[id];
      return place !== null && ids.has(place) ? [[id, place]] : [];
    }),
  );
  const ordonnes = [...termes].sort((a, b) => etats[a.id].rang - etats[b.id].rang);
  const libres = ordonnes.filter(({ id }) => !placements.has(id));
  const choix = libres.some(({ id }) => id === choisi) ? choisi : null;

  /** Les nouvelles places, gardées terme par terme. */
  const appliquer = (suivants: Placements) => {
    for (const { id } of termes) {
      const place = suivants.get(id) ?? null;
      if (place !== (placements.get(id) ?? null)) changer(id, { ...etats[id], place });
    }
  };
  /** Le terme posé sur la cible ; le focus ira au terme libre suivant, ou à « Prüfen ». */
  const deposer = (terme: string, cible: string, defiler: boolean) => {
    const suivants = placer(placements, terme, cible, unique);
    appliquer(suivants);
    if (choix === terme) choisir(null);
    const rang = ordonnes.findIndex(({ id }) => id === terme);
    const restants = ordonnes.filter(({ id }) => !suivants.has(id));
    const suivant = restants.find((x) => ordonnes.indexOf(x) > rang) ?? restants[0];
    aFocaliser.current = { terme: suivant?.id ?? null, defiler };
  };
  const glisser = useGlisser({
    cibles: () => zones.current,
    deposer: (terme, cible) => deposer(terme, cible, false),
    actif: !jugee,
  });

  useEffect(() => {
    const vise = aFocaliser.current;
    if (vise === null) return;
    aFocaliser.current = null;
    const termesDeLaReserve = reserve.current?.querySelectorAll<HTMLElement>('[data-terme]') ?? [];
    const element =
      vise.terme === null
        ? pruefen.current
        : Array.from(termesDeLaReserve).find((x) => x.dataset.terme === vise.terme);
    // Au doigt, la page ne saute pas vers le terme ; au clavier, il vient à l'écran.
    element?.focus({ preventScroll: !vise.defiler });
  });

  // Un clic venu du clavier n'a pas de `detail` ; celui d'un doigt ou d'une souris en a un.
  const toucherTerme = (terme: string, e: MouseEvent) => {
    if (glisser.clicDeGlisser() || jugee) return;
    if (placements.has(terme)) {
      appliquer(retirer(placements, terme));
      aFocaliser.current = { terme, defiler: e.detail === 0 };
      return;
    }
    choisir(choix === terme ? null : terme);
  };
  const toucherCible = (cible: string, e: MouseEvent) => {
    if (choix !== null && !jugee) deposer(choix, cible, e.detail === 0);
  };
  const verifier = () => {
    const resultats = resultatsDeTache(termes, etats, ({ id, bonne }) => {
      const place = placements.get(id);
      return place === undefined ? undefined : place === bonne;
    });
    if (resultats === undefined) return;
    juger(true);
    onRepondu(resultats);
  };

  const bouton = (terme: Terme) => {
    const place = placements.get(terme.id);
    const classes = ['pastille', 'terme'];
    if (glisser.glisse === terme.id) classes.push('glisse');
    if (jugee && place !== undefined) classes.push(place === terme.bonne ? 'ok' : 'ko');
    return (
      <button
        key={terme.id}
        type="button"
        class={classes.join(' ')}
        data-terme={terme.id}
        aria-pressed={place === undefined ? choix === terme.id : undefined}
        disabled={jugee}
        onClick={(e) => toucherTerme(terme.id, e)}
        {...glisser.poignees(terme.id)}
      >
        {terme.terme}
      </button>
    );
  };

  return (
    <>
      {!jugee && <p class="hint">{t.feuilles_hinweis_ziehen}</p>}
      <div class="reserve" ref={reserve}>
        {libres.map(bouton)}
      </div>
      <div class={choix === null ? 'zones' : 'zones attend'} ref={zones}>
        {cibles.map((cible, i) => {
          const verdict = jugee ? verdictDe(cible, termes, placements) : null;
          const poses = ordonnes.filter(({ id }) => placements.get(id) === cible.id);
          const bons = termes.filter(({ bonne }) => bonne === cible.id);
          return (
            <div
              key={`${i}|${cible.id}`}
              class={verdict === null ? 'zone' : `zone ${verdict}`}
              data-zone
            >
              <button
                type="button"
                class="cible"
                data-cible={cible.id}
                disabled={jugee}
                onClick={(e) => toucherCible(cible.id, e)}
              >
                {cible.libelle}
              </button>
              {poses.length > 0 && <div class="poses">{poses.map(bouton)}</div>}
              {verdict === 'ko' && bons.length > 0 && (
                <p class="correction">{bons.map(({ terme }) => terme).join(' · ')}</p>
              )}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        class="small-btn"
        ref={pruefen}
        disabled={jugee || libres.length > 0}
        onClick={verifier}
      >
        {t.pruefen}
      </button>
    </>
  );
}
