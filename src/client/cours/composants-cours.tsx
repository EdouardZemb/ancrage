/*
 * Ce que les onglets se partagent : les deux listes de choix des cartes (chapitre et sens,
 * H:1703-1705), l'énoncé d'une carte (son type, son sens, sa question, H:1705-1706), le focus d'un
 * bouton qui apparaît, un libellé dont les valeurs sont en gras, le libellé et les boutons des
 * options d'une question à choix, le champ où l'on tape une réponse et la barre d'avancement d'une
 * ligne de liste.
 */
import type { ComponentChildren } from 'preact';
import type { UniteDeCarte } from '../../domaine/cartes/unites.js';
import { FAUX, VRAI } from '../../domaine/feuilles/correction.js';
import type { SensChoisi } from '../../domaine/seances/cartes.js';
import { useCours } from './contexte-cours.js';
import { type CleTexteCours, formater } from './textes-cours.js';

/** La question en plus petit au-delà de cette longueur (H:1706). */
const LONGUEUR_D_UNE_QUESTION_COURTE = 34;

/** Les classes du texte d'une question : `front`, ou `front long` quand elle est longue. */
export function classeDeLaQuestion(question: string): string {
  return question.length > LONGUEUR_D_UNE_QUESTION_COURTE ? 'front long' : 'front';
}

const SENS: readonly SensChoisi[] = ['mix', 'direct', 'inverse'];

/**
 * Les deux listes en tête d'un onglet de cartes : un chapitre (ou tous) et un sens (ou les deux).
 * Elles rendent les deux `select` à la suite, pour la ligne `controls` de l'onglet.
 */
export function ChoixDeCartes(props: {
  chapitre: string | 'tous';
  sens: SensChoisi;
  /** Ajoute le choix « Arbeitsblätter » (les questions fermées des feuilles, dans le Quiz). */
  avecFeuilles?: boolean;
  /** Reçoit le seul choix qui change : le chapitre, ou le sens. */
  choisir(suite: { chapitre?: string; sens?: SensChoisi }): void;
}) {
  const { cours, t } = useCours();
  const libelles: Record<SensChoisi, string> = {
    mix: t.choix_sens_mixte,
    direct: t.sens_direct,
    inverse: t.sens_inverse,
  };
  return (
    <>
      <select
        aria-label={t.choix_chapitre}
        value={props.chapitre}
        onChange={(e) => props.choisir({ chapitre: e.currentTarget.value })}
      >
        {cours.chapitres.map((chapitre) => (
          <option key={chapitre.id} value={chapitre.id}>
            {chapitre.numero} · {chapitre.titre}
          </option>
        ))}
        <option value="tous">{t.choix_tous_chapitres}</option>
        {props.avecFeuilles === true && <option value="feuilles">{t.onglet_feuilles}</option>}
      </select>
      <select
        aria-label={t.choix_sens}
        value={props.sens}
        onChange={(e) => props.choisir({ sens: e.currentTarget.value as SensChoisi })}
      >
        {SENS.map((sens) => (
          <option key={sens} value={sens}>
            {libelles[sens]}
          </option>
        ))}
      </select>
    </>
  );
}

/**
 * La liste en tête d'un onglet d'exercices ou de mots : le mélange, puis chaque famille ou chaque
 * mode. Elle rend le `select` pour la ligne `controls` de l'onglet.
 */
export function ChoixDeMode(props: {
  valeur: string;
  modes: readonly { valeur: string; libelle: string }[];
  onChoix(valeur: string): void;
}) {
  const { t } = useCours();
  return (
    <select
      aria-label={t.choix_exercice}
      value={props.valeur}
      onChange={(e) => props.onChoix(e.currentTarget.value)}
    >
      <option value="mix">{t.choix_melange}</option>
      {props.modes.map((mode) => (
        <option key={mode.valeur} value={mode.valeur}>
          {mode.libelle}
        </option>
      ))}
    </select>
  );
}

/**
 * Le haut d'une carte : son étiquette (le type du cours, le sens et, si demandé, le chapitre) puis
 * la question. Le libellé du type vient du contenu du cours, pas du code.
 */
export function Enonce(props: { unite: UniteDeCarte; avecChapitre: boolean }) {
  const { cours, t } = useCours();
  const { unite } = props;
  const etiquette = [
    cours.cours.typesDeCarte[unite.type],
    unite.sens === 'direct' ? t.sens_direct : t.sens_inverse,
    ...(props.avecChapitre ? [formater(t.carte_chapitre, { n: unite.numero })] : []),
  ].join(' · ');
  return (
    <>
      <span class="kind">{etiquette}</span>
      <span class={classeDeLaQuestion(unite.question)}>{unite.question}</span>
    </>
  );
}

/** La barre d'une ligne de liste (`.chap`) : la part réussie, `faits` sur `total`. */
export function Avancement(props: { faits: number; total: number }) {
  const { faits, total } = props;
  return (
    <div class="bar" aria-hidden="true">
      <i
        style={{ width: `${total > 0 ? (faits / total) * 100 : 0}%`, background: 'var(--box4)' }}
      />
    </div>
  );
}

/** Donne le focus à l'élément qui apparaît (H:1773, H:1780, H:1853) : `ref` d'un bouton « Weiter ». */
export function focaliser(element: HTMLElement | null): void {
  element?.focus();
}

/**
 * Le modèle avec ses repères `{nom}` remplacés par les valeurs en gras, comme le prototype les
 * montre. Un repère sans valeur reste tel quel, et une valeur n'est jamais relue comme un modèle.
 * `classe` va sur chaque `<b>`.
 */
export function enGras(
  modele: string,
  valeurs: Record<string, string>,
  classe?: string,
): ComponentChildren {
  return modele.split(/(\{[a-z_]+\})/).map((morceau) => {
    const nom = /^\{([a-z_]+)\}$/.exec(morceau)?.[1];
    return nom !== undefined && Object.hasOwn(valeurs, nom) ? (
      <b key={nom} class={classe}>
        {valeurs[nom]}
      </b>
    ) : (
      morceau
    );
  });
}

/**
 * Ce que montre une option du Quiz ou de la Prüfung : les codes du vrai/faux (`VRAI`, `FAUX`,
 * F1-D7) deviennent « Richtig » et « Falsch », toute autre option reste telle quelle.
 */
export function libelleDOption(option: string, t: Record<CleTexteCours, string>): string {
  return option === VRAI ? t.feuille_richtig : option === FAUX ? t.feuille_falsch : option;
}

/**
 * Les choix d'une question à choix multiple (H:1899, H:2090, H:2135, H:2184) : un bouton par
 * option, numéroté comme la touche qui le choisit (`useTouches`). L'index de l'option est donné à
 * `choisir`.
 *
 * Avec `repondu`, la question est répondue et ses boutons ne répondent plus : la bonne réponse est
 * en vert (`right`) et un mauvais choix en rouge (`wrong`), comme dans le Quiz (H:1836-1859).
 */
export function Options(props: {
  options: readonly string[];
  choisir(i: number): void;
  repondu?: { choisie: number; reponse: string };
}) {
  const { repondu } = props;
  const classe = (option: string, i: number): string | undefined => {
    if (repondu === undefined) return undefined;
    if (option === repondu.reponse) return 'right';
    return i === repondu.choisie ? 'wrong' : undefined;
  };
  return (
    <div class="options">
      {props.options.map((option, i) => (
        <button
          key={`${i}|${option}`}
          type="button"
          class={classe(option, i)}
          disabled={repondu !== undefined}
          onClick={() => props.choisir(i)}
        >
          <span class="mono muted">{i + 1}</span>&nbsp; {option}
        </button>
      ))}
    </div>
  );
}

/**
 * Le champ où l'on tape la réponse, et son bouton (H:2176). Ni majuscule automatique ni correcteur :
 * la graphie tapée est celle qui est jugée. `etiquette` remplace le nom accessible du champ
 * (`t.exercices_antwort` par défaut). Le champ prend le focus en apparaissant, sauf avec
 * `sansFocus` (plusieurs champs sur un même écran).
 */
export function SaisieDeLaReponse(props: {
  onVerifier(saisie: string): void;
  etiquette?: string;
  sansFocus?: boolean;
}) {
  const { t } = useCours();
  return (
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
        ref={props.sansFocus ? undefined : focaliser}
        aria-label={props.etiquette ?? t.exercices_antwort}
        placeholder={t.exercices_antwort_modele}
        spellcheck={false}
        autocapitalize="off"
      />
      <button type="submit" class="small-btn">
        {t.pruefen}
      </button>
    </form>
  );
}
