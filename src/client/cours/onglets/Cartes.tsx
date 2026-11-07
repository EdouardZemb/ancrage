/*
 * « Karteikarten », la séance Leitner (`renderLearn`, H:1742-1818, et les touches de H:2238-2246) :
 * les cartes dues d'abord, puis des neuves. Une unité directe se retourne ; une unité inverse se
 * retourne aussi, sauf si « Begriffe eintippen » est cochée (H:1767) : on tape alors le terme, qui
 * est jugé juste, presque juste (une faute de frappe) ou faux. Une réponse fausse remet la carte en
 * fin de file. Chaque réponse entre au journal ; la fin de la série déclenche la synchronisation
 * (décision 15).
 *
 * La séance se construit une fois, au premier affichage et à chaque changement de chapitre ou de
 * sens, puis vit dans l'écran du cours (`useEtatDOnglet`) : les réponses qui arrivent au journal ne
 * la changent pas, et un détour par un autre onglet la retrouve telle quelle.
 */
import { reponsesAcceptees } from '../../../domaine/cartes/unites.js';
import { juger } from '../../../domaine/correction.js';
import { etatDe } from '../../../domaine/progression/etat.js';
import {
  apresReponse,
  construireSeance,
  type SeanceCartes,
  seanceDeNouvelles,
  unitesDuChoix,
} from '../../../domaine/seances/cartes.js';
import { useTouches } from '../clavier.js';
import { ChoixDeCartes, Enonce, focaliser } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import type { Preferences } from '../preferences.js';
import { cartesEnCours } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';

/** Le jugement d'une saisie, avec ce que la personne a tapé. */
interface Verdict {
  juste: boolean;
  presque: boolean;
  donnee: string;
}

/**
 * Une série en cours. `cle` (chapitre et sens) et `imposee` (la séance imposée reçue alors) disent
 * de quoi elle est issue : si l'un des deux change, la série est à refaire.
 */
interface Serie {
  cle: string;
  imposee: SeanceCartes | undefined;
  seance: SeanceCartes;
  retournee: boolean;
  verdict: Verdict | null;
}

export function Cartes(props: {
  /**
   * Une séance toute faite, les erreurs d'un examen révisées en cartes (« Fehler als Karteikarten
   * üben ») : elle remplace la première série. Dès qu'elle est finie, ou que le chapitre ou le
   * sens change, les séries sont à nouveau celles du choix. L'onglet la reconnaît à sa référence :
   * l'appelant garde le même objet tant que la séance est la même.
   */
  seanceImposee?: SeanceCartes;
}) {
  const { seanceImposee } = props;
  const {
    cours,
    t,
    etats,
    aujourdhui,
    enregistrer,
    finDeSeance,
    preferences,
    changerPreferences,
    hasard,
    aller,
    useEtatDOnglet,
    oublierEtatDOnglet,
  } = useCours();
  const { chapitre, sens, saisie } = preferences.cartes;
  const cle = `${chapitre}|${sens}`;
  const nouvelles = cours.cours.leitner.nouvellesParSeance;

  const demarrer = (depart: SeanceCartes | undefined): Serie => ({
    cle,
    imposee: seanceImposee,
    seance:
      depart ??
      construireSeance(unitesDuChoix(cours, chapitre, sens), etats, aujourdhui, nouvelles, hasard),
    retournee: false,
    verdict: null,
  });
  const [courante, setCourante] = useEtatDOnglet<Serie>(
    'cartes',
    () => demarrer(seanceImposee),
    cartesEnCours,
  );
  // Un autre choix de chapitre ou de sens, ou une autre séance imposée : on recommence.
  let serie = courante;
  if (courante.imposee !== seanceImposee) serie = demarrer(seanceImposee);
  else if (courante.cle !== cle) serie = demarrer(undefined);
  if (serie !== courante) setCourante(serie);

  const { seance } = serie;
  const unite = seance.file[0];
  // La saisie ne vaut que pour une inverse (H:1767).
  const saisieAttendue = unite !== undefined && unite.sens === 'inverse' && saisie;

  const choisir = (suite: Partial<Preferences['cartes']>) =>
    changerPreferences({ ...preferences, cartes: { ...preferences.cartes, ...suite } });

  const retourner = () => {
    if (!serie.retournee) setCourante({ ...serie, retournee: true });
  };
  const verifier = (donnee: string) => {
    if (unite === undefined) return;
    const jugement = juger(donnee, reponsesAcceptees(unite, cours.index));
    setCourante({ ...serie, verdict: { ...jugement, donnee } });
  };
  const repondre = (juste: boolean) => {
    if (unite === undefined) return;
    const suivante = apresReponse(seance, juste);
    setCourante({ ...serie, seance: suivante, retournee: false, verdict: null });
    const rangee = enregistrer(unite.id, juste);
    // La synchronisation lit la file : elle attend que cette dernière réponse y soit.
    if (suivante.file.length === 0) void rangee.then(() => finDeSeance());
  };
  const plusDeCartes = () =>
    setCourante({
      ...serie,
      seance: seanceDeNouvelles(unitesDuChoix(cours, chapitre, sens), etats, nouvelles, hasard),
      retournee: false,
      verdict: null,
    });
  const versLeQuiz = () => {
    changerPreferences({ ...preferences, quiz: { ...preferences.quiz, chapitre } });
    // Une question neuve, même sur le chapitre du quiz en cours (H:1766).
    oublierEtatDOnglet('quiz');
    aller('quiz');
  };

  // Espace ou Enter retourne la carte, 1 et 2 répondent (H:2240-2243). Une saisie a ses touches.
  const touches: Record<string, () => void> = {
    ' ': retourner,
    Enter: retourner,
    ...(serie.retournee ? { '1': () => repondre(false), '2': () => repondre(true) } : {}),
  };
  useTouches(touches, unite !== undefined && !saisieAttendue);

  const boite = unite === undefined ? 0 : etatDe(etats, unite.id).boite;
  const meta = (
    <span class="meta">{boite > 0 ? formater(t.cartes_boite, { n: boite }) : t.cartes_neuve}</span>
  );

  return (
    <section>
      <div class="controls">
        <ChoixDeCartes chapitre={chapitre} sens={sens} choisir={choisir} />
        <label class="inline">
          <input
            type="checkbox"
            checked={saisie}
            onChange={(e) => {
              choisir({ saisie: e.currentTarget.checked });
              setCourante({ ...serie, verdict: null });
            }}
          />{' '}
          {t.cartes_saisie}
        </label>
        <span class="progressline">
          {formater(t.cartes_progression, { faites: seance.faites, restantes: seance.file.length })}
          {seance.deLExamen && ` · ${t.cartes_de_l_examen}`}
        </span>
      </div>

      {unite === undefined ? (
        <div class="done">
          <h2>{seance.faites > 0 ? t.cartes_serie_finie : t.cartes_rien_a_reviser}</h2>
          <p class="muted">
            {seance.faites > 0 &&
              `${formater(t.cartes_resultat, { justes: seance.justes, faites: seance.faites })} `}
            {t.cartes_retour_des_dues}
          </p>
          <div class="controls">
            <button type="button" class="primary" onClick={plusDeCartes}>
              {t.cartes_plus}
            </button>
            <button type="button" class="ghost" onClick={versLeQuiz}>
              {t.cartes_vers_quiz}
            </button>
          </div>
        </div>
      ) : saisieAttendue ? (
        <>
          <div class="card">
            <Enonce unite={unite} avecChapitre />
            {serie.verdict === null ? (
              <SaisieDuTerme onVerifier={verifier} />
            ) : (
              <>
                <div
                  class={`verdict ${serie.verdict.juste ? 'ok' : serie.verdict.presque ? 'near' : 'ko'}`}
                >
                  <span>
                    {serie.verdict.juste
                      ? t.cartes_juste
                      : serie.verdict.presque
                        ? t.cartes_presque
                        : t.cartes_fausse}
                  </span>
                  {serie.verdict.donnee !== '' && !serie.verdict.juste && (
                    <s>{serie.verdict.donnee}</s>
                  )}
                  <b>{unite.reponse}</b>
                  {!serie.verdict.juste && (
                    <button type="button" class="linkbtn" onClick={() => repondre(true)}>
                      {t.cartes_aussi_juste}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  class="primary"
                  ref={focaliser}
                  onClick={() => repondre(serie.verdict?.juste ?? false)}
                >
                  {t.cartes_suivante}
                </button>
              </>
            )}
            {meta}
          </div>
          <p class="kbd">{t.cartes_touches_saisie}</p>
        </>
      ) : (
        <>
          {/* biome-ignore lint/a11y/useSemanticElements: le bloc de la carte garde la mise en page du prototype (H:1789). */}
          {/* biome-ignore lint/a11y/useKeyWithClickEvents: Espace et Enter retournent la carte, pour tout l'onglet (useTouches). */}
          <div
            class="card flip"
            role="button"
            tabIndex={0}
            aria-label={t.cartes_retourner}
            onClick={retourner}
          >
            <Enonce unite={unite} avecChapitre />
            {serie.retournee ? (
              <span class="back">{unite.reponse}</span>
            ) : (
              <span class="hint">{t.cartes_indice}</span>
            )}
            {meta}
          </div>
          {serie.retournee && (
            <div class="answer">
              <button type="button" class="no" onClick={() => repondre(false)}>
                {t.cartes_pas_su}
              </button>
              <button type="button" class="yes" onClick={() => repondre(true)}>
                {t.cartes_su}
              </button>
            </div>
          )}
          <p class="kbd">{t.cartes_touches}</p>
        </>
      )}
    </section>
  );
}

/** Le champ où l'on tape le terme, et son bouton (H:1768-1770). */
function SaisieDuTerme(props: { onVerifier(saisie: string): void }) {
  const { t } = useCours();
  return (
    <>
      <form
        class="typed"
        autocomplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          const champ = e.currentTarget.elements.namedItem('saisie') as HTMLInputElement;
          props.onVerifier(champ.value);
        }}
      >
        <input
          name="saisie"
          ref={focaliser}
          aria-label={t.cartes_saisie_etiquette}
          placeholder={t.cartes_saisie_modele}
          spellcheck={false}
          autocapitalize="off"
        />
        <button type="submit" class="small-btn">
          {t.cartes_verifier}
        </button>
      </form>
      <span class="hint">{t.cartes_saisie_indice}</span>
    </>
  );
}
