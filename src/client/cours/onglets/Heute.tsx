/*
 * « Heute » (M2), la séance du jour : une seule file qui mêle tout ce qui est dû aujourd'hui, quel
 * que soit le type de l'unité, puis quelques cartes neuves (`composerSeance`). Sans planning, les
 * neuves viennent du choix fait dans Karteikarten (M2-P10), et `nouvelles_par_seance` est un
 * plafond par jour (M2-P9) : le quota est ce que laissent les cartes déjà découvertes aujourd'hui,
 * où qu'elles aient été répondues, et une fois le plafond atteint « Nächste Runde » ne reprend que
 * les dues. Chaque élément se pose avec l'écran de son onglet (`questions/`), et sa réponse entre
 * au journal comme une réponse ordinaire : rien de nouveau n'est écrit. Une faute remet l'élément
 * en fin de file une fois.
 *
 * La séance vit dans l'écran du cours (`useEtatDOnglet`) : un détour par un autre onglet retrouve
 * la même question et la même file, et retient la mise à jour de l'application (`heuteEnCours`).
 * Elle se compose avant tout geste, puisque le cours s'ouvre ici : tant qu'aucune réponse n'y est
 * donnée, elle se recompose quand la liste des dues, les cartes neuves candidates ou le quota
 * changent (M2-P6) ; après la première réponse, elle ne suit plus le journal, comme une séance de
 * cartes.
 *
 * Avec un planning (M4), les cartes neuves viennent des modules ouverts, dans l'ordre du planning
 * et sans égard au chapitre choisi dans Karteikarten (B-D2), à un rythme calculé : ce qui est
 * ouvert se répartit sur les jours avant l'ouverture suivante, `nouvelles_par_seance` restant un
 * plafond (B-D3, `neuvesDuJour`). Ce qui est dû reste dû (A1-D7). Le compte à rebours avant
 * l'examen se dit sur les trois écrans de l'onglet, sans lien avec le planning (A1-D8).
 *
 * À une étape de révision (M4, C-D8), la séance mêle aux dues et aux cartes neuves des révisions :
 * des éléments déjà vus des étapes ouvertes, repris à la moitié de leur intervalle, tour à tour
 * entre les étapes (`revisionsDuJour`, `avecRevisions`). Sans planning, ou à une autre étape, rien
 * ne change : même file, même clé, même hasard. Une séance entamée ne change pas de file.
 *
 * Un geste, une écriture (M2-P7) : la réponse et le verdict, ou la suite et la question d'après,
 * s'écrivent d'un seul bloc.
 */
import { useMemo, useRef } from 'preact/hooks';
import type { CoursPrepare } from '../../../domaine/cours/prepare.js';
import type { Hasard } from '../../../domaine/hasard.js';
import type { ModeDeReponse } from '../../../domaine/journal/evenement.js';
import {
  apresReponseDuJour,
  bilanDuJour,
  cartesNeuves,
  composerSeance,
  duesDuJour,
  type Posable,
  posablesDuCours,
  type SeanceDuJour,
} from '../../../domaine/seances/heute.js';
import { joursAvantExamen } from '../../../domaine/seances/planning.js';
import { pretestDuJour } from '../../../domaine/seances/pretest.js';
import { avecRevisions, revisionsDuJour } from '../../../domaine/seances/revisions.js';
import { neuvesDuJour } from '../../../domaine/seances/rythme.js';
import { optionsDuPoint } from '../../../domaine/seances/schemas.js';
import { etapeEnCours, modulesDesPosables } from '../../../domaine/seances/semestre.js';
import { ligneDExamen } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { usePlanningDuCours } from '../planning-du-cours.js';
import {
  QuestionAChoix,
  type QuestionDeChoix,
  questionDeLElement,
} from '../questions/QuestionAChoix.js';
import { ETAT_DE_CARTE_NEUF, type EtatDeCarte, QuestionCarte } from '../questions/QuestionCarte.js';
import { QuestionDExercice, type ReponseDExercice } from '../questions/QuestionDExercice.js';
import { QuestionDeSchema, type TacheDeSchema } from '../questions/QuestionDeSchema.js';
import { QuestionMot, type TacheDeMot, tacheDeMot } from '../questions/QuestionMot.js';
import { heuteEnCours, pretestEnCours } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';
import {
  demarrerPretest,
  type EtatDuPretest,
  OffreDePretest,
  PretestDeHeute,
} from './PretestDeHeute.js';

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
  /** Les révisions retenues par la séance (C-D12) ; absent sans révision. */
  revisions?: readonly string[];
}

/**
 * La clé d'une séance : le jour, les identifiants des dues du moment, ceux des cartes neuves
 * candidates, puis le quota du jour (M2-P6, M2-P9, B-D7). Le rythme y entre par ces candidates et
 * ce quota. Une carte neuve répondue ailleurs, ou un changement de chapitre dans Karteikarten sans
 * planning, change la clé, comme une due. Les révisions s'y ajoutent en cinquième part, seulement
 * quand il y en a (C-D12) : sans révision, la clé est celle d'avant.
 */
export function cleDuJour(
  aujourdhui: string,
  dues: readonly Posable[],
  neuves: readonly Posable[],
  quota: number,
  revisions: readonly Posable[] = [],
): string {
  const ids = (liste: readonly Posable[]) => liste.map(({ id }) => id).join(',');
  const base = `${aujourdhui}|${ids(dues)}|${ids(neuves)}|${quota}`;
  return revisions.length === 0 ? base : `${base}|${ids(revisions)}`;
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
  const posables = useMemo(() => posablesDuCours(cours), [cours]);
  const dues = useMemo(
    () => duesDuJour(posables, etats, aujourdhui),
    [posables, etats, aujourdhui],
  );
  // Le planning ne règle que les cartes neuves : ce qui est dû reste dû (A1-D7). Le départ relit
  // tout le journal, il ne se refait que si le journal ou le jour change.
  const { planning, depart, examen } = usePlanningDuCours();
  // Les cartes neuves du jour et leur quota (M2-P9, B-D2, B-D3). Sans planning, les neuves du choix
  // de Karteikarten et le plafond moins les cartes découvertes aujourd'hui ; avec un planning, les
  // premières cartes neuves des modules ouverts, au rythme du jour. Le compte relit le journal :
  // il ne se refait que si le journal, le jour, le cours ou le choix changent.
  const { candidates, quota } = useMemo(
    () =>
      neuvesDuJour(
        cours,
        posables,
        { etats, evenements, aujourdhui },
        { chapitre: preferences.cartes.chapitre, sens: preferences.cartes.sens },
        planning === undefined ? undefined : { planning, depart, examen },
      ),
    [
      cours,
      posables,
      etats,
      evenements,
      aujourdhui,
      planning,
      depart,
      examen,
      preferences.cartes.chapitre,
      preferences.cartes.sens,
    ],
  );
  // Les révisions du jour (C-D8 à C-D10) : vides hors d'une étape de révision, et sans planning.
  // Elles relisent le journal : elles ne se refont que si le journal, le jour ou le cours changent.
  const modules = useMemo(() => modulesDesPosables(cours), [cours]);
  const revisions = useMemo(
    () =>
      planning === undefined
        ? []
        : revisionsDuJour(
            posables,
            modules,
            { etats, evenements, aujourdhui },
            { planning, depart, examen },
          ),
    [posables, modules, etats, evenements, aujourdhui, planning, depart, examen],
  );
  // Le titre de l'étape de révision en cours, pour dire la raison des révisions (C-D13).
  const etapeDeRevision = useMemo(() => {
    if (planning === undefined) return undefined;
    const courante = etapeEnCours({ planning, depart, examen }, aujourdhui);
    return courante?.genre === 'revision' ? courante.titre : undefined;
  }, [planning, depart, examen, aujourdhui]);
  const cle = cleDuJour(aujourdhui, dues, candidates, quota, revisions);
  // Le pré-test que le jour propose (B-D11) : il se dérive du journal, du planning et du jour.
  const propose = useMemo(
    () =>
      planning === undefined
        ? undefined
        : pretestDuJour(planning, depart, aujourdhui, cours.unites, etats, evenements),
    [planning, depart, aujourdhui, cours, etats, evenements],
  );

  // Les éléments que la séance en cours a réussis : le journal ne les montre qu'une fois rangés,
  // et l'écran de fin ne les compte plus parmi les dues. Une séance neuve repart d'un ensemble vide.
  const reussis = useRef(new Set<string>());
  const composer = (): EtatDeHeute => {
    reussis.current = new Set();
    const composee = composerSeance(posables, etats, aujourdhui, { candidates, quota }, hasard);
    // Sans révision, `avecRevisions` n'est pas appelé : même séance, mêmes tirages (C-D11).
    const seance =
      revisions.length === 0 ? composee : avecRevisions(composee, revisions, etats, hasard);
    // Les révisions que la séance a retenues : celles qu'elle ajoute à la file composée.
    const avant = new Set(composee.file.map(({ id }) => id));
    const retenues = seance.file.filter(({ id }) => !avant.has(id)).map(({ id }) => id);
    return {
      cle,
      seance,
      question: questionDe(seance.file[0], cours, hasard),
      repondue: null,
      ...(retenues.length === 0 ? {} : { revisions: retenues }),
    };
  };
  const [courante, setCourante] = useEtatDOnglet<EtatDeHeute>('heute', composer, heuteEnCours);
  // Le pré-test commencé : une sous-clé de la séance, qui reste gardée telle quelle (B-D16).
  const [pretest, setPretest] = useEtatDOnglet<EtatDuPretest | null>(
    'heute/pretest',
    () => null,
    pretestEnCours,
  );
  // Un pré-test terminé ne survit pas à l'onglet : au montage, son écran de fin est déjà vu et
  // l'état se vide ; un pré-test en cours, lui, revient tel quel (B-D16).
  const aMonter = useRef(true);
  let pretestCourant = pretest;
  if (aMonter.current) {
    aMonter.current = false;
    if (pretest !== null && pretest.rang >= pretest.questions.length) {
      pretestCourant = null;
      setPretest(null);
    }
  }
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
  const ranger = (id: string, juste: boolean, mode: ModeDeReponse) => {
    rangement.current = enregistrer(id, juste, mode);
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
  const juger = (suivante: QuestionDeTete, juste: boolean, mode: ModeDeReponse) => {
    if (tete === undefined || repondue !== null) return;
    setCourante({ ...etat, question: suivante, repondue: juste });
    ranger(tete.id, juste, mode);
  };
  // La suite, une fois la question jugée.
  const suivante = () => {
    if (repondue !== null) setCourante(avancer(repondue));
  };
  const encore = () => setCourante(composer());

  const neuves = cartesNeuves(seance.file, etats).length;
  // Les révisions encore dans la file et pas dues : une révision manquée est due (C-D13).
  const duesDuMoment = new Set(dues.map(({ id }) => id));
  const retenues = new Set(etat.revisions);
  const aRafraichir = seance.file.filter(
    ({ id }) => retenues.has(id) && !duesDuMoment.has(id),
  ).length;
  const compteARebours = ligneDExamen(joursAvantExamen(examen, aujourdhui), t);
  // À l'écran de fin : les dues que la séance n'a pas déjà réussies, le journal pouvant être en retard.
  const restantes = dues.filter(({ id }) => !reussis.current.has(id)).length;

  if (pretestCourant !== null) {
    return <PretestDeHeute etat={pretestCourant} changer={setPretest} />;
  }

  // L'offre : jamais en pleine séance, avant le premier geste, ou quand la file est vide (B-D14).
  const offre =
    propose !== undefined && (tete === undefined || question === null || avantLePremierGeste) ? (
      <OffreDePretest
        etape={propose.etape.titre}
        commencer={() => setPretest(demarrerPretest(propose, cours, hasard))}
      />
    ) : null;

  if (tete === undefined || question === null) {
    const { elements, justes } = bilanDuJour(seance);
    return (
      <section>
        {offre}
        {seance.faites > 0 ? (
          <div class="done">
            <h2>{t.heute_fin}</h2>
            {compteARebours}
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
            {compteARebours}
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
      {offre}
      <div class="controls">
        <span class="progressline">
          {formater(t.heute_compte, { dues: dues.length, neues: neuves })}
          {aRafraichir > 0 && ` · ${formater(t.heute_revisions, { n: aRafraichir })}`}
          {' · '}
          {formater(t.heute_progression, { faites: seance.faites, restantes: seance.file.length })}
        </span>
        {compteARebours}
      </div>
      {aRafraichir > 0 && etapeDeRevision !== undefined && (
        <p class="muted">{formater(t.heute_revision, { etape: etapeDeRevision })}</p>
      )}
      {tete.genre === 'carte' && question.genre === 'carte' && (
        <QuestionCarte
          unite={tete.unite}
          saisie={preferences.cartes.saisie}
          etat={question.etat}
          onEtat={(suite) => poser({ genre: 'carte', etat: suite })}
          onReponse={(juste, mode) => {
            // Réponse et suite ne font qu'un geste : la file avance dans la même écriture.
            ranger(tete.id, juste, mode);
            setCourante(avancer(juste));
          }}
        />
      )}
      {tete.genre === 'mot' && question.genre === 'mot' && cours.morphologie !== undefined && (
        <QuestionMot
          module={cours.morphologie}
          tache={question.tache}
          onTache={(suite, jugement) =>
            jugement === undefined
              ? poser({ genre: 'mot', tache: suite })
              : juger({ genre: 'mot', tache: suite }, jugement.juste, jugement.mode)
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
          repondre={(j, mode) =>
            juger(
              { genre: 'point', tache: { ...question.tache, choisi: j } },
              j === question.tache.cible,
              mode,
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
          onReponse={(reponse, mode) => juger({ genre: 'exercice', reponse }, reponse.juste, mode)}
          onSuivante={suivante}
        />
      )}
      {tete.genre === 'fermee' && question.genre === 'fermee' && (
        <QuestionAChoix
          question={question.question}
          libelleSuivante={t.suivante}
          onChoix={(i, juste, mode) =>
            juger({ genre: 'fermee', question: { ...question.question, choisie: i } }, juste, mode)
          }
          onSuivante={suivante}
        />
      )}
    </section>
  );
}
