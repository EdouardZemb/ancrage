/*
 * « Heute » (M2), la séance du jour : une seule file qui mêle tout ce qui est dû aujourd'hui, quel
 * que soit le type de l'unité, puis quelques cartes neuves (`composerSeance`). Chaque élément se
 * pose avec l'écran de son onglet (`questions/`), et sa réponse entre au journal comme une réponse
 * ordinaire : rien de nouveau n'est écrit. Une faute remet l'élément en fin de file une fois.
 *
 * La séance vit dans l'écran du cours (`useEtatDOnglet`) : un détour par un autre onglet retrouve
 * la même question et la même file, et retient la mise à jour de l'application (`heuteEnCours`).
 * Elle se compose avant tout geste, puisque le cours s'ouvre ici : tant qu'aucune réponse n'y est
 * donnée, elle se recompose quand la liste des dues change (M2-P6) ; après la première réponse,
 * elle ne suit plus le journal, comme une séance de cartes.
 *
 * Un geste, une écriture (M2-P7) : la réponse et le verdict, ou la suite et la question d'après,
 * s'écrivent d'un seul bloc.
 */
import { useMemo, useRef } from 'preact/hooks';
import type { CoursPrepare } from '../../../domaine/cours/prepare.js';
import type { Hasard } from '../../../domaine/hasard.js';
import { etatDe } from '../../../domaine/progression/etat.js';
import {
  apresReponseDuJour,
  composerSeance,
  duesDuJour,
  type Posable,
  posablesDuCours,
  type SeanceDuJour,
} from '../../../domaine/seances/heute.js';
import { optionsDuPoint } from '../../../domaine/seances/schemas.js';
import { useCours } from '../contexte-cours.js';
import {
  QuestionAChoix,
  type QuestionDeChoix,
  questionDeLElement,
} from '../questions/QuestionAChoix.js';
import { ETAT_DE_CARTE_NEUF, type EtatDeCarte, QuestionCarte } from '../questions/QuestionCarte.js';
import { QuestionDExercice, type ReponseDExercice } from '../questions/QuestionDExercice.js';
import { QuestionDeSchema, type TacheDeSchema } from '../questions/QuestionDeSchema.js';
import { QuestionMot, type TacheDeMot, tacheDeMot } from '../questions/QuestionMot.js';
import { heuteEnCours } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';

/** L'état de la question de tête, selon le genre de l'élément posé. */
export type QuestionDeTete =
  | { genre: 'carte'; etat: EtatDeCarte }
  | { genre: 'mot'; tache: TacheDeMot }
  | { genre: 'point'; tache: TacheDeSchema }
  | { genre: 'exercice'; reponse: ReponseDExercice | null }
  | { genre: 'fermee'; question: QuestionDeChoix };

/**
 * La séance en cours. `cle` dit de quoi elle est issue : le jour et les dues du moment. `question`
 * est `null` quand la file est vide ; `repondue` est le verdict de la question de tête, tant que sa
 * suite n'est pas donnée.
 */
export interface EtatDeHeute {
  cle: string;
  seance: SeanceDuJour;
  question: QuestionDeTete | null;
  repondue: boolean | null;
}

/** La clé d'une séance : le jour, puis les identifiants des dues du moment (M2-P6). */
export function cleDuJour(aujourdhui: string, dues: readonly Posable[]): string {
  return `${aujourdhui}|${dues.map(({ id }) => id).join(',')}`;
}

/**
 * La question d'un élément qu'on pose, ses propositions tirées (M2-P4) : un mot se décompose ou se
 * bâtit au hasard, un point se nomme parmi quatre propositions. `null` pour une file vide.
 */
export function questionDe(
  tete: Posable | undefined,
  cours: CoursPrepare,
  hasard: Hasard,
): QuestionDeTete | null {
  if (tete === undefined) return null;
  switch (tete.genre) {
    case 'carte':
      return { genre: 'carte', etat: ETAT_DE_CARTE_NEUF };
    case 'mot': {
      const module = cours.morphologie;
      // Un mot ne vient que du module de morphologie du cours.
      if (module === undefined) throw new Error(`Mot sans module de morphologie : ${tete.id}`);
      const mode = hasard() < 0.5 ? 'zerlegen' : 'bilden';
      return { genre: 'mot', tache: tacheDeMot(tete.mot, mode, module, hasard) };
    }
    case 'point':
      return {
        genre: 'point',
        tache: {
          cible: tete.rang,
          options: optionsDuPoint(tete.schema, tete.rang, hasard),
          choisi: null,
        },
      };
    case 'exercice':
      return { genre: 'exercice', reponse: null };
    case 'fermee':
      return { genre: 'fermee', question: questionDeLElement(tete.element, hasard) };
  }
}

export function Heute() {
  const {
    cours,
    t,
    etats,
    aujourdhui,
    enregistrer,
    finDeSeance,
    preferences,
    hasard,
    aller,
    useEtatDOnglet,
  } = useCours();
  const nouvelles = cours.cours.leitner.nouvellesParSeance;
  const posables = useMemo(() => posablesDuCours(cours), [cours]);
  const dues = useMemo(
    () => duesDuJour(posables, etats, aujourdhui),
    [posables, etats, aujourdhui],
  );
  const cle = cleDuJour(aujourdhui, dues);

  const composer = (): EtatDeHeute => {
    const seance = composerSeance(posables, etats, aujourdhui, nouvelles, hasard);
    return { cle, seance, question: questionDe(seance.file[0], cours, hasard), repondue: null };
  };
  const [courante, setCourante] = useEtatDOnglet<EtatDeHeute>('heute', composer, heuteEnCours);
  // La liste des dues a changé avant le premier geste : on recompose.
  let etat = courante;
  if (courante.cle !== cle && courante.seance.faites === 0 && courante.repondue === null) {
    etat = composer();
  }
  if (etat !== courante) setCourante(etat);

  const { seance, question, repondue } = etat;
  const tete = seance.file[0];

  // La dernière réponse enregistrée : la synchronisation attend qu'elle soit rangée.
  const rangement = useRef<Promise<boolean>>(Promise.resolve(true));
  const ranger = (id: string, juste: boolean) => {
    rangement.current = enregistrer(id, juste);
  };
  const finir = (suivante: SeanceDuJour) => {
    if (suivante.file.length === 0) void rangement.current.then(() => finDeSeance());
  };

  /** L'état après la question de tête, juste ou non : la file avance, la question d'après se tire. */
  const avancer = (juste: boolean): EtatDeHeute => {
    const suivante = apresReponseDuJour(seance, juste);
    finir(suivante);
    return {
      ...etat,
      seance: suivante,
      question: questionDe(suivante.file[0], cours, hasard),
      repondue: null,
    };
  };
  // Un geste de plus sur la question de tête, sans la juger.
  const poser = (suivante: QuestionDeTete) => setCourante({ ...etat, question: suivante });
  // Le geste qui juge la question de tête : elle, son verdict et l'enregistrement d'un bloc.
  const juger = (suivante: QuestionDeTete, juste: boolean) => {
    if (tete === undefined || repondue !== null) return;
    setCourante({ ...etat, question: suivante, repondue: juste });
    ranger(tete.id, juste);
  };
  // La suite, une fois la question jugée.
  const suivante = () => {
    if (repondue !== null) setCourante(avancer(repondue));
  };
  const encore = () => setCourante(composer());

  const neuves = seance.file.filter(
    (p) => p.genre === 'carte' && etatDe(etats, p.id).boite === 0,
  ).length;

  if (tete === undefined || question === null) {
    return (
      <section>
        {seance.faites > 0 ? (
          <div class="done">
            <h2>{t.heute_fin}</h2>
            <p class="muted">
              {formater(t.heute_resultat, { justes: seance.justes, faites: seance.faites })}
              {dues.length > 0 && ` ${formater(t.heute_reste, { n: dues.length })}`}
            </p>
            {dues.length > 0 && (
              <div class="controls">
                <button type="button" class="primary" onClick={encore}>
                  {t.heute_encore}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div class="done">
            <h2>{t.heute_rien}</h2>
            <p class="muted">{t.heute_rien_suite}</p>
            <div class="controls">
              <button type="button" class="primary" onClick={() => aller('apercu')}>
                {t.heute_vers_apercu}
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  return (
    <section>
      <div class="controls">
        <span class="progressline">
          {formater(t.heute_compte, { dues: dues.length, neues: neuves })}
          {' · '}
          {formater(t.heute_progression, { faites: seance.faites, restantes: seance.file.length })}
        </span>
      </div>
      {tete.genre === 'carte' && question.genre === 'carte' && (
        <QuestionCarte
          unite={tete.unite}
          saisie={preferences.cartes.saisie}
          etat={question.etat}
          onEtat={(suite) => poser({ genre: 'carte', etat: suite })}
          onReponse={(juste) => {
            // Réponse et suite ne font qu'un geste : la file avance dans la même écriture.
            ranger(tete.id, juste);
            setCourante(avancer(juste));
          }}
        />
      )}
      {tete.genre === 'mot' && question.genre === 'mot' && cours.morphologie !== undefined && (
        <QuestionMot
          module={cours.morphologie}
          tache={question.tache}
          onTache={(suite, juste) =>
            juste === undefined
              ? poser({ genre: 'mot', tache: suite })
              : juger({ genre: 'mot', tache: suite }, juste)
          }
          onSuivante={suivante}
        />
      )}
      {tete.genre === 'point' && question.genre === 'point' && (
        <QuestionDeSchema
          schema={tete.schema}
          mode="benennen"
          tache={question.tache}
          repondre={(j) =>
            juger(
              { genre: 'point', tache: { ...question.tache, choisi: j } },
              j === question.tache.cible,
            )
          }
          suivante={suivante}
        />
      )}
      {tete.genre === 'exercice' && question.genre === 'exercice' && (
        <QuestionDExercice
          famille={tete.famille}
          exercice={tete.exercice}
          reponse={question.reponse}
          onReponse={(reponse) => juger({ genre: 'exercice', reponse }, reponse.juste)}
          onSuivante={suivante}
        />
      )}
      {tete.genre === 'fermee' && question.genre === 'fermee' && (
        <QuestionAChoix
          question={question.question}
          libelleSuivante={t.quiz_suivante}
          onChoix={(i, juste) =>
            juger({ genre: 'fermee', question: { ...question.question, choisie: i } }, juste)
          }
          onSuivante={suivante}
        />
      )}
    </section>
  );
}
