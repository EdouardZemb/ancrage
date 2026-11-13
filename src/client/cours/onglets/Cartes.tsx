/*
 * « Karteikarten », la séance de révision (`renderLearn`, H:1742-1818, et les touches de H:2238-2246) :
 * les cartes dues d'abord, à l'échéance que donne l'algorithme du cours (`ordonnanceur.ts`), puis
 * des neuves. Une unité directe se retourne ; une unité inverse se
 * retourne aussi, sauf si « Begriffe eintippen » est cochée (H:1767) : on tape alors le terme, qui
 * est jugé juste, presque juste (une faute de frappe) ou faux. Une réponse fausse remet la carte en
 * fin de file. Chaque réponse entre au journal ; la fin de la série déclenche la synchronisation
 * (décision 15).
 *
 * La séance se construit une fois, au premier affichage et à chaque changement de chapitre ou de
 * sens, puis vit dans l'écran du cours (`useEtatDOnglet`) : les réponses qui arrivent au journal ne
 * la changent pas, et un détour par un autre onglet la retrouve telle quelle.
 */
import type { ModeDeReponse } from '../../../domaine/journal/evenement.js';
import {
  apresReponse,
  construireSeance,
  type SeanceCartes,
  seanceDeNouvelles,
  unitesDuChoix,
} from '../../../domaine/seances/cartes.js';
import { ChoixDeCartes } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import type { Preferences } from '../preferences.js';
import type { EtatDeCarte } from '../questions/QuestionCarte.js';
import { QuestionCarte } from '../questions/QuestionCarte.js';
import { cartesEnCours } from '../seances-en-cours.js';
import { formater } from '../textes-cours.js';

/**
 * Une série en cours. `cle` (chapitre et sens) et `imposee` (la séance imposée reçue alors) disent
 * de quoi elle est issue : si l'un des deux change, la série est à refaire.
 */
interface Serie {
  cle: string;
  imposee: SeanceCartes | undefined;
  seance: SeanceCartes;
  retournee: boolean;
  verdict: EtatDeCarte['verdict'];
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
  const choisir = (suite: Partial<Preferences['cartes']>) =>
    changerPreferences({ ...preferences, cartes: { ...preferences.cartes, ...suite } });

  const repondre = (juste: boolean, mode: ModeDeReponse) => {
    if (unite === undefined) return;
    const suivante = apresReponse(seance, juste);
    setCourante({ ...serie, seance: suivante, retournee: false, verdict: null });
    const rangee = enregistrer(unite.id, juste, mode);
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
      ) : (
        <QuestionCarte
          unite={unite}
          saisie={saisie}
          etat={{ retournee: serie.retournee, verdict: serie.verdict }}
          onEtat={(etat) => setCourante({ ...serie, ...etat })}
          onReponse={repondre}
        />
      )}
    </section>
  );
}
