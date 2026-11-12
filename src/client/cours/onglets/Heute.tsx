/*
 * « Heute » (M2), la séance du jour : une seule file qui mêle tout ce qui est dû aujourd'hui, quel
 * que soit le type de l'unité, puis quelques cartes neuves (`composerSeance`). Les neuves viennent
 * du choix fait dans Karteikarten (M2-P10), et `nouvelles_par_seance` est un plafond par jour
 * (M2-P9) : le quota est ce que laissent les cartes déjà découvertes aujourd'hui, où qu'elles aient
 * été répondues, et une fois le plafond atteint « Nächste Runde » ne reprend que les dues. Chaque élément se
 * pose avec l'écran de son onglet (`questions/`), et sa réponse entre au journal comme une réponse
 * ordinaire : rien de nouveau n'est écrit. Une faute remet l'élément en fin de file une fois.
 *
 * La séance vit dans l'écran du cours (`useEtatDOnglet`) : un détour par un autre onglet retrouve
 * la même question et la même file, et retient la mise à jour de l'application (`heuteEnCours`).
 * Elle se compose avant tout geste, puisque le cours s'ouvre ici : tant qu'aucune réponse n'y est
 * donnée, elle se recompose quand la liste des dues, les neuves du choix ou le quota changent
 * (M2-P6) ; après la première réponse,
 * elle ne suit plus le journal, comme une séance de cartes.
 *
 * Un geste, une écriture (M2-P7) : la réponse et le verdict, ou la suite et la question d'après,
 * s'écrivent d'un seul bloc.
 */
import { useMemo, useRef } from 'preact/hooks';
import type { CoursPrepare } from '../../../domaine/cours/prepare.js';
import type { Hasard } from '../../../domaine/hasard.js';
import { unitesDuChoix } from '../../../domaine/seances/cartes.js';
import {
  apresReponseDuJour,
  bilanDuJour,
  cartesNeuves,
  composerSeance,
  decouvertesLe,
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

/**
 * La clé d'une séance : le jour, les identifiants des dues du moment, ceux des cartes neuves du
 * choix, puis le quota du jour (M2-P6, M2-P9). Une carte neuve répondue ailleurs, ou un changement
 * de chapitre dans Karteikarten, change la clé, comme une due.
 */
export function cleDuJour(
  aujourdhui: string,
  dues: readonly Posable[],
  neuves: readonly Posable[],
  quota: number,
): string {
  const ids = (liste: readonly Posable[]) => liste.map(({ id }) => id).join(',');
  return `${aujourdhui}|${ids(dues)}|${ids(neuves)}|${quota}`;
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
    evenements,
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
  // Les candidates sont les cartes du choix de Karteikarten (M2-P10).
  const candidates = useMemo(() => {
    const choix = new Set(
      unitesDuChoix(cours, preferences.cartes.chapitre, preferences.cartes.sens).map(
        ({ id }) => id,
      ),
    );
    return posables.filter((p) => p.genre === 'carte' && choix.has(p.id));
  }, [cours, posables, preferences.cartes.chapitre, preferences.cartes.sens]);
  const neuvesDuChoix = useMemo(() => cartesNeuves(candidates, etats), [candidates, etats]);
  // Le plafond du jour moins les cartes du cours découvertes aujourd'hui (M2-P9).
  // Le compte relit le journal : il ne se refait que si le journal, le jour ou le cours changent.
  const decouvertes = useMemo(
    () => decouvertesLe(evenements, aujourdhui, new Set(cours.unites.map(({ id }) => id))),
    [evenements, aujourdhui, cours],
  );
  const quota = Math.max(0, nouvelles - decouvertes);
  const cle = cleDuJour(aujourdhui, dues, neuvesDuChoix, quota);

  // Les éléments que la séance en cours a réussis : le journal ne les montre qu'une fois rangés,
  // et l'écran de fin ne les compte plus parmi les dues. Une séance neuve repart d'un ensemble vide.
  const reussis = useRef(new Set<string>());
  const composer = (): EtatDeHeute => {
    reussis.current = new Set();
    const seance = composerSeance(posables, etats, aujourdhui, { candidates, quota }, hasard);
    return { cle, seance, question: questionDe(seance.file[0], cours, hasard), repondue: null };
  };
  const [courante, setCourante] = useEtatDOnglet<EtatDeHeute>('heute', composer, heuteEnCours);
  // Les dues ou les cartes neuves ont changé avant le premier geste, ou la séance est finie et le
  // jour a changé (une application restée ouverte la nuit) : on recompose.
  let etat = courante;
  const avantLePremierGeste = courante.seance.faites === 0 && courante.repondue === null;
  const finieUnAutreJour =
    courante.seance.file.length === 0 && !courante.cle.startsWith(`${aujourdhui}|`);
  if ((courante.cle !== cle && avantLePremierGeste) || finieUnAutreJour) {
    etat = composer();
  }
  if (etat !== courante) setCourante(etat);

  const { seance, question, repondue } = etat;
  const tete = seance.file[0];

  // La dernière réponse enregistrée : la synchronisation attend qu'elle soit rangée.
  const rangement = useRef<Promise<boolean>>(Promise.resolve(true));
  const ranger = (id: string, juste: boolean) => {
    rangement.current = enregistrer(id, juste);
    // Le journal ne la montre qu'une fois rangée : l'écran de fin ne compte plus cet élément dû.
    if (juste) reussis.current.add(id);
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

  const neuves = cartesNeuves(seance.file, etats).length;
  // À l'écran de fin : les dues que la séance n'a pas déjà réussies, le journal pouvant être en retard.
  const restantes = dues.filter(({ id }) => !reussis.current.has(id)).length;

  if (tete === undefined || question === null) {
    const { elements, justes } = bilanDuJour(seance);
    return (
      <section>
        {seance.faites > 0 ? (
          <div class="done">
            <h2>{t.heute_fin}</h2>
            <p class="muted">
              {formater(t.heute_resultat, { justes, faites: elements })}
              {restantes > 0 && ` ${formater(t.heute_reste, { n: restantes })}`}
            </p>
            {restantes > 0 ? (
              <div class="controls">
                <button type="button" class="primary" onClick={encore}>
                  {t.heute_encore}
                </button>
              </div>
            ) : (
              <>
                <p class="muted">{t.heute_fertig}</p>
                <p class="muted">{t.heute_rien_suite}</p>
                <div class="controls">
                  <button type="button" class="primary" onClick={() => aller('apercu')}>
                    {t.heute_vers_apercu}
                  </button>
                </div>
              </>
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
          libelleSuivante={t.suivante}
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
          libelleSuivante={t.suivante}
          onChoix={(i, juste) =>
            juger({ genre: 'fermee', question: { ...question.question, choisie: i } }, juste)
          }
          onSuivante={suivante}
        />
      )}
    </section>
  );
}
