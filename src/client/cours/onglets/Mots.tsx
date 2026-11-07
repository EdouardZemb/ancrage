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
import { useMemo } from 'preact/hooks';
import type { Morpheme, Mot } from '../../../domaine/contenu/modele.js';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import { reussis } from '../../../domaine/progression/statistiques.js';
import {
  choisirMot,
  motBienForme,
  optionsDeSens,
  tuilesDuMot,
} from '../../../domaine/seances/mots.js';
import { useTouches } from '../clavier.js';
import { ChoixDeMode, enGras, focaliser, Options } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import type { Preferences } from '../preferences.js';
import { serieCommencee } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';

/** Les touches 1 à 4 choisissent la première à la quatrième option (H:2247). */
const NUMEROS_D_OPTIONS = ['1', '2', '3', '4'];

type Tache =
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

/** `tache` est `null` quand le module n'a aucun mot à proposer. */
interface Serie {
  cle: string;
  faites: number;
  justes: number;
  tache: Tache | null;
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

  const morphemes = useMemo(() => new Map(module.morphemes.map((m) => [m.id, m])), [module]);
  const morpheme = (id: string): Morpheme => {
    const trouve = morphemes.get(id);
    if (trouve === undefined) throw new Error(`Morphème inconnu : ${id}`);
    return trouve;
  };
  // Un mot sans segment n'a rien à zerlegen ni à bâtir.
  const jouables = module.mots.filter((mot) => mot.segments.length > 0);
  const categories: Record<Morpheme['categorie'], string> = {
    p: t.mots_prefixe,
    s: t.mots_radical,
    x: t.mots_suffixe,
  };

  const tirer = (): Tache | null => {
    if (jouables.length === 0) return null;
    const mot = choisirMot(jouables, etats, hasard);
    const mode = choix === 'mix' ? (hasard() < 0.5 ? 'zerlegen' : 'bilden') : choix;
    if (mode === 'zerlegen') {
      const options = optionsDeSens(morpheme(mot.segments[0].morpheme), module.morphemes, hasard);
      return { mode, mot, etape: 0, resultats: [], options, fini: false };
    }
    return {
      mode,
      mot,
      tuiles: tuilesDuMot(mot, module.morphemes, hasard),
      choisies: [],
      verifie: null,
    };
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

  const choisirUnePartie = (i: number) => {
    if (tache?.mode !== 'zerlegen' || tache.fini || tache.options[i] === undefined) return;
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
      setCourante({ ...serie, tache: { ...tache, resultats, etape, options } });
      return;
    }
    const juste = resultats.every(Boolean);
    setCourante({ ...comptee(juste), tache: { ...tache, resultats, etape, fini: true } });
    void enregistrer(mot.id, juste);
  };

  const poser = (id: string) => {
    if (tache?.mode !== 'bilden' || tache.verifie !== null || tache.choisies.includes(id)) return;
    setCourante({ ...serie, tache: { ...tache, choisies: [...tache.choisies, id] } });
  };
  const retirerLeDernier = () => {
    if (tache?.mode !== 'bilden' || tache.verifie !== null) return;
    setCourante({ ...serie, tache: { ...tache, choisies: tache.choisies.slice(0, -1) } });
  };
  const verifier = () => {
    if (tache?.mode !== 'bilden' || tache.verifie !== null || tache.choisies.length === 0) return;
    const juste = motBienForme(tache.mot, tache.choisies);
    setCourante({ ...comptee(juste), tache: { ...tache, verifie: { juste } } });
    void enregistrer(tache.mot.id, juste);
  };

  const touches = Object.fromEntries(
    NUMEROS_D_OPTIONS.map((numero, i) => [numero, () => choisirUnePartie(i)]),
  );
  useTouches(touches, tache?.mode === 'zerlegen' && !tache.fini);

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
                <NaechstesWort onClick={() => setCourante({ ...serie, tache: tirer() })} />
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
                <NaechstesWort onClick={() => setCourante({ ...serie, tache: tirer() })} />
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
      )}
    </section>
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
