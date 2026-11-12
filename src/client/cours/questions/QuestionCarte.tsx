/*
 * L'écran d'une question de carte (H:1767-1818, touches H:2240-2243) : la carte qui se retourne,
 * ou, pour une unité inverse quand la saisie est cochée, le terme qu'on tape et son verdict
 * (juste, presque juste, faux). L'onglet « Karteikarten » et la séance « Heute » la posent de la
 * même façon : le composant ne connaît ni la série, ni les préférences, ni le tirage de l'appelant.
 */
import { reponsesAcceptees, type UniteDeCarte } from '../../../domaine/cartes/unites.js';
import { juger } from '../../../domaine/correction.js';
import { etatDe } from '../../../domaine/progression/etat.js';
import { useTouches } from '../clavier.js';
import { Enonce, focaliser } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { formater } from '../textes-cours.js';

/** L'état d'une carte posée : retournée ou non, et le jugement de la saisie, avec ce qui fut tapé. */
export interface EtatDeCarte {
  retournee: boolean;
  verdict: { juste: boolean; presque: boolean; donnee: string } | null;
}

/** L'état d'une carte qu'on vient de poser. */
export const ETAT_DE_CARTE_NEUF: EtatDeCarte = { retournee: false, verdict: null };

/**
 * `saisie` ne joue que pour une unité inverse. `onEtat` (retourner, juger une saisie) et
 * `onReponse` ne sont jamais appelés dans le même geste (M2-P7) : `onReponse` clôt la carte, et
 * c'est l'appelant qui remet l'état à neuf.
 */
export function QuestionCarte(props: {
  unite: UniteDeCarte;
  saisie: boolean;
  etat: EtatDeCarte;
  onEtat(etat: EtatDeCarte): void;
  onReponse(juste: boolean): void;
}) {
  const { unite, saisie, etat, onEtat, onReponse } = props;
  const { cours, t, etats } = useCours();
  // La saisie ne vaut que pour une inverse (H:1767).
  const saisieAttendue = unite.sens === 'inverse' && saisie;

  const retourner = () => {
    if (!etat.retournee) onEtat({ ...etat, retournee: true });
  };
  const verifier = (donnee: string) => {
    const jugement = juger(donnee, reponsesAcceptees(unite, cours.index));
    onEtat({ ...etat, verdict: { ...jugement, donnee } });
  };

  // Espace ou Enter retourne la carte, 1 et 2 répondent (H:2240-2243). Une saisie a ses touches.
  const touches: Record<string, () => void> = {
    ' ': retourner,
    Enter: retourner,
    ...(etat.retournee ? { '1': () => onReponse(false), '2': () => onReponse(true) } : {}),
  };
  useTouches(touches, !saisieAttendue);

  const boite = etatDe(etats, unite.id).boite;
  const meta = (
    <span class="meta">{boite > 0 ? formater(t.cartes_boite, { n: boite }) : t.cartes_neuve}</span>
  );

  if (saisieAttendue) {
    return (
      <>
        <div class="card">
          <Enonce unite={unite} avecChapitre />
          {etat.verdict === null ? (
            <SaisieDuTerme onVerifier={verifier} />
          ) : (
            <>
              <div
                class={`verdict ${etat.verdict.juste ? 'ok' : etat.verdict.presque ? 'near' : 'ko'}`}
              >
                <span>
                  {etat.verdict.juste
                    ? t.cartes_juste
                    : etat.verdict.presque
                      ? t.cartes_presque
                      : t.cartes_fausse}
                </span>
                {etat.verdict.donnee !== '' && !etat.verdict.juste && <s>{etat.verdict.donnee}</s>}
                <b>{unite.reponse}</b>
                {!etat.verdict.juste && (
                  <button type="button" class="linkbtn" onClick={() => onReponse(true)}>
                    {t.cartes_aussi_juste}
                  </button>
                )}
              </div>
              <button
                type="button"
                class="primary"
                ref={focaliser}
                onClick={() => onReponse(etat.verdict?.juste ?? false)}
              >
                {t.cartes_suivante}
              </button>
            </>
          )}
          {meta}
        </div>
        <p class="kbd">{t.cartes_touches_saisie}</p>
      </>
    );
  }

  return (
    <>
      {/* biome-ignore lint/a11y/useSemanticElements: le bloc de la carte garde la mise en page du prototype (H:1789). */}
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: Espace et Enter retournent la carte, pour tout l'écran (useTouches). */}
      <div
        class="card flip"
        role="button"
        tabIndex={0}
        aria-label={t.cartes_retourner}
        onClick={retourner}
      >
        <Enonce unite={unite} avecChapitre />
        {etat.retournee ? (
          <span class="back">{unite.reponse}</span>
        ) : (
          <span class="hint">{t.cartes_indice}</span>
        )}
        {meta}
      </div>
      {etat.retournee && (
        <div class="answer">
          <button type="button" class="no" onClick={() => onReponse(false)}>
            {t.cartes_pas_su}
          </button>
          <button type="button" class="yes" onClick={() => onReponse(true)}>
            {t.cartes_su}
          </button>
        </div>
      )}
      <p class="kbd">{t.cartes_touches}</p>
    </>
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
