/*
 * L'écran d'une question de mot (`renderWords`, H:1862-1928, touches H:2247) : trouver le sens des
 * parties d'un mot (« Wörter zerlegen »), ou bâtir un mot avec des morphèmes (« Wörter bilden »).
 * L'onglet « Wortbaukasten » et la séance « Heute » la posent de la même façon : le composant ne
 * connaît ni la série, ni le score, ni le tirage de l'appelant.
 *
 * Un seul rappel par geste (M2-P7) : `onTache` porte la tâche changée, et, au geste qui juge le
 * mot, le verdict avec elle. L'appelant écrit alors la tâche, son compte et son enregistrement
 * d'un bloc.
 */
import { useMemo } from 'preact/hooks';
import type { Morpheme, Mot } from '../../../domaine/contenu/modele.js';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import type { Hasard } from '../../../domaine/hasard.js';
import { motBienForme, optionsDeSens, tuilesDuMot } from '../../../domaine/seances/mots.js';
import { useTouches } from '../clavier.js';
import { enGras, focaliser, Options } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { formater } from '../textes-cours.js';

/** Les touches 1 à 4 choisissent la première à la quatrième option (H:2247). */
const NUMEROS_D_OPTIONS = ['1', '2', '3', '4'];

export type TacheDeMot =
  | {
      mode: 'zerlegen';
      mot: Mot;
      /** La partie en cours ; le nombre de parties une fois le mot fini. */
      etape: number;
      resultats: boolean[];
      options: string[];
      fini: boolean;
    }
  | {
      mode: 'bilden';
      mot: Mot;
      /** Les identifiants des morphèmes proposés. */
      tuiles: string[];
      /** Les identifiants des morphèmes posés, dans l'ordre. */
      choisies: string[];
      verifie: { juste: boolean } | null;
    };

/** La tâche d'un mot dans l'exercice donné, ses propositions tirées. Le mot a au moins un segment. */
export function tacheDeMot(
  mot: Mot,
  mode: 'zerlegen' | 'bilden',
  module: ModuleServiDe<'morphologie'>,
  hasard: Hasard,
): TacheDeMot {
  if (mode === 'zerlegen') {
    const premier = module.morphemes.find(({ id }) => id === mot.segments[0].morpheme);
    if (premier === undefined) throw new Error(`Morphème inconnu : ${mot.segments[0].morpheme}`);
    const options = optionsDeSens(premier, module.morphemes, hasard);
    return { mode, mot, etape: 0, resultats: [], options, fini: false };
  }
  return {
    mode,
    mot,
    tuiles: tuilesDuMot(mot, module.morphemes, hasard),
    choisies: [],
    verifie: null,
  };
}

export function QuestionMot(props: {
  module: ModuleServiDe<'morphologie'>;
  tache: TacheDeMot;
  /** La tâche changée ; `juste` n'est donné qu'au geste qui juge le mot, avec la tâche finie. */
  onTache(tache: TacheDeMot, juste?: boolean): void;
  onSuivante(): void;
}) {
  const { module, tache, onTache, onSuivante } = props;
  const { t, hasard } = useCours();

  const morphemes = useMemo(() => new Map(module.morphemes.map((m) => [m.id, m])), [module]);
  const morpheme = (id: string): Morpheme => {
    const trouve = morphemes.get(id);
    if (trouve === undefined) throw new Error(`Morphème inconnu : ${id}`);
    return trouve;
  };
  const categories: Record<Morpheme['categorie'], string> = {
    p: t.mots_prefixe,
    s: t.mots_radical,
    x: t.mots_suffixe,
  };

  const choisirUnePartie = (i: number) => {
    if (tache.mode !== 'zerlegen' || tache.fini || tache.options[i] === undefined) return;
    const { mot } = tache;
    const resultats = [
      ...tache.resultats,
      tache.options[i] === morpheme(mot.segments[tache.etape].morpheme).sens,
    ];
    const etape = tache.etape + 1;
    if (etape < mot.segments.length) {
      const options = optionsDeSens(
        morpheme(mot.segments[etape].morpheme),
        module.morphemes,
        hasard,
      );
      onTache({ ...tache, resultats, etape, options });
      return;
    }
    onTache({ ...tache, resultats, etape, fini: true }, resultats.every(Boolean));
  };

  const poser = (id: string) => {
    if (tache.mode !== 'bilden' || tache.verifie !== null || tache.choisies.includes(id)) return;
    onTache({ ...tache, choisies: [...tache.choisies, id] });
  };
  const retirerLeDernier = () => {
    if (tache.mode !== 'bilden' || tache.verifie !== null) return;
    onTache({ ...tache, choisies: tache.choisies.slice(0, -1) });
  };
  const verifier = () => {
    if (tache.mode !== 'bilden' || tache.verifie !== null || tache.choisies.length === 0) return;
    const juste = motBienForme(tache.mot, tache.choisies);
    onTache({ ...tache, verifie: { juste } }, juste);
  };

  const touches = Object.fromEntries(
    NUMEROS_D_OPTIONS.map((numero, i) => [numero, () => choisirUnePartie(i)]),
  );
  useTouches(touches, tache.mode === 'zerlegen' && !tache.fini);

  return (
    <>
      {tache.mode === 'zerlegen' ? (
        <>
          <div class="card">
            <span class="kind">
              {formater(t.mots_zerlegen_partie, {
                n: Math.min(tache.etape + 1, tache.mot.segments.length),
                total: tache.mot.segments.length,
              })}
            </span>
            <div class="word">
              {tache.mot.segments.map((segment, i) => {
                const resultat = tache.resultats[i];
                const etat =
                  i === tache.etape && !tache.fini
                    ? 'cur'
                    : resultat === undefined
                      ? ''
                      : resultat
                        ? 'ok'
                        : 'ko';
                return (
                  <span key={i} class={['seg', etat].filter(Boolean).join(' ')}>
                    {segment.texte}
                    {resultat !== undefined && <small>{morpheme(segment.morpheme).sens}</small>}
                  </span>
                );
              })}
            </div>
            {tache.fini ? (
              <p class="back">
                <b>{tache.mot.mot}</b> = {tache.mot.sens}
              </p>
            ) : (
              <p>
                {enGras(
                  formater(t.mots_was_bedeutet, {
                    categorie:
                      categories[morpheme(tache.mot.segments[tache.etape].morpheme).categorie],
                  }),
                  { forme: morpheme(tache.mot.segments[tache.etape].morpheme).forme },
                  'mono',
                )}
              </p>
            )}
          </div>
          {tache.fini ? (
            <NaechstesWort onClick={onSuivante} />
          ) : (
            <Options options={tache.options} choisir={choisirUnePartie} />
          )}
        </>
      ) : (
        <>
          <div class="card">
            <span class="kind">{t.mots_bilden}</span>
            <span class="front long">«{tache.mot.sens}»</span>
            <div class="slots">
              {tache.choisies.length === 0 ? (
                <span class="hint">{t.mots_indice_tuiles}</span>
              ) : (
                tache.choisies.map((id) => (
                  <span key={id} class="tile" data-t={morpheme(id).categorie}>
                    {morpheme(id).forme}
                  </span>
                ))
              )}
            </div>
            {tache.verifie !== null && (
              <div class={`verdict ${tache.verifie.juste ? 'ok' : 'ko'}`}>
                <span>{tache.verifie.juste ? t.verdict_juste : t.mots_nicht_ganz}</span>
                <b>{tache.mot.segments.map((segment) => segment.texte).join('·')}</b>
                <span class="muted">
                  {tache.mot.segments
                    .map(
                      (segment) =>
                        `${morpheme(segment.morpheme).forme} = ${morpheme(segment.morpheme).sens}`,
                    )
                    .join(' · ')}
                </span>
              </div>
            )}
          </div>
          {tache.verifie !== null ? (
            <NaechstesWort onClick={onSuivante} />
          ) : (
            <>
              <div class="tiles">
                {tache.tuiles.map((id) => (
                  <button
                    key={id}
                    type="button"
                    class="tile"
                    data-t={morpheme(id).categorie}
                    disabled={tache.choisies.includes(id)}
                    onClick={() => poser(id)}
                  >
                    {morpheme(id).forme}
                  </button>
                ))}
              </div>
              <div class="controls">
                <button
                  type="button"
                  class="ghost"
                  disabled={tache.choisies.length === 0}
                  onClick={retirerLeDernier}
                >
                  {t.mots_retirer}
                </button>
                <button
                  type="button"
                  class="primary"
                  disabled={tache.choisies.length === 0}
                  onClick={verifier}
                >
                  {t.pruefen}
                </button>
              </div>
            </>
          )}
          <div class="legend">
            <span>
              <i style={{ background: 'var(--box3)' }} />
              {categories.p}
            </span>
            <span>
              <i style={{ background: 'var(--warn)' }} />
              {categories.s}
            </span>
            <span>
              <i style={{ background: 'var(--bad)' }} />
              {categories.x}
            </span>
          </div>
        </>
      )}
      <p class="kbd">{t.mots_touches}</p>
    </>
  );
}

/** « Nächstes Wort », qui a le focus dès qu'il paraît (H:1884). */
function NaechstesWort(props: { onClick(): void }) {
  const { t } = useCours();
  return (
    <button type="button" class="primary" ref={focaliser} onClick={props.onClick}>
      {t.mots_naechstes}
    </button>
  );
}
