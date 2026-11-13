/*
 * « Arbeitsblätter », les fiches d'exercices des Units (F1, ancrage-donnees#90). La liste montre les feuilles du
 * cours, de la plus récente à la plus ancienne, chacune avec son score : ses éléments dont la
 * dernière réponse est juste, sur tous ses éléments (F1-D3). Ses boutons suivent son état, lu dans
 * le journal : une fiche neuve s'ouvre par « Bearbeiten », qui déroule toutes ses tâches dans
 * l'ordre du papier ; une fiche entamée se reprend par « Weitermachen », qui ne déroule que les
 * éléments jamais répondus, ou se refait par « Neu beginnen » ; une fiche faite offre
 * « Neu beginnen » (F1-R20) et « Ergebnis ». « Fehler wiederholen », qui n'apparaît que s'il y a
 * une erreur, dans la liste comme sur le bilan, ne déroule que les éléments dont la dernière
 * réponse est fausse.
 *
 * Une tâche rend chaque élément dès qu'il est jugé (R17, voir `feuilles/tache.ts`) : l'onglet
 * l'enregistre aussitôt, un événement par élément (ADR-0004), si bien que « Zurück », un rechargement
 * ou une application fermée ne perdent aucune réponse vue. « Weiter » attend que tous les éléments
 * de la tâche soient jugés, puis porte le focus sur la consigne de la suivante, qu'un lecteur
 * d'écran lit. Un bilan clôt le déroulé.
 *
 * Le déroulé vit dans la mémoire des onglets, sans préférence stockée (F1-D10) : un changement
 * d'onglet le retrouve à la même tâche, mais « Zurück » ou un rechargement l'oublient, et la
 * reprise se lit alors dans le journal (« Weitermachen »). Ses éléments sont figés à son départ.
 * Une fiche en cours est une séance (2a-D3) : une réponse donnée et une tâche qui reste, ou la
 * tâche affichée entamée (2b-D5, `useEtatDesElements`). « Weiter » oublie l'état de la tâche
 * faite, qui ne revient plus : au bilan, la séance prend fin.
 * Une tâche d'un genre que cette version n'affiche pas est sautée (F1-D11).
 *
 * Un troisième écran, après la liste et le déroulé, montre le résultat d'une fiche entamée ou faite,
 * par « Ergebnis » (F3, ancrage-donnees#175). C'est une lecture du journal, qui se dérive à chaque rendu : une
 * réponse donnée ailleurs y paraît aussitôt. Son état vit sous une sous-clé de la mémoire de
 * l'onglet, sans prédicat de séance (F3-D6) : la vue n'est jamais une séance et ne retient pas la
 * mise à jour de l'application. « Zurück » rend la liste.
 */
import type { ComponentChild } from 'preact';
import { useEffect, useMemo, useRef } from 'preact/hooks';
import { idsDeTache } from '../../../domaine/contenu/feuille.js';
import type { Tache } from '../../../domaine/contenu/modele.js';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import {
  dernieresReponses,
  type EtatDeFeuille,
  etatDeFeuille,
  type ModeDeDeroule,
  scoreDeFeuille,
  tachesADerouler,
} from '../../../domaine/feuilles/deroulement.js';
import { Avancement, focaliser } from '../composants-cours.js';
import { useCours } from '../contexte-cours.js';
import { ErgebnisDeFeuille } from '../feuilles/ErgebnisDeFeuille.js';
import { TacheAChoix, TacheVraiFaux } from '../feuilles/TacheAChoix.js';
import { TacheAGlisser } from '../feuilles/TacheAGlisser.js';
import { TacheATrous } from '../feuilles/TacheATrous.js';
import { TacheOrthographe } from '../feuilles/TacheOrthographe.js';
import { TacheOuverte } from '../feuilles/TacheOuverte.js';
import { CLE_FEUILLES, type ResultatDElement } from '../feuilles/tache.js';
import { feuilleEnCours } from '../seances-en-cours.js';
import { type CleTexteCours, formater } from '../textes-cours.js';

/** L'écran « Ergebnis » : l'`id` de la fiche affichée, ou `null`. Ce n'est pas une séance (F3-D6). */
const CLE_ERGEBNIS = `${CLE_FEUILLES}/ergebnis`;

type Feuille = ModuleServiDe<'feuille'>;
type Dernieres = ReadonlyMap<string, boolean>;
type Repondu = (resultats: readonly ResultatDElement[]) => void;

/** Une fiche en cours : son mode, le rang de la tâche affichée et les réponses déjà données. */
interface Deroule {
  feuille: string;
  mode: ModeDeDeroule;
  rang: number;
  resultats: Record<string, boolean>;
  /**
   * Les éléments du déroulé, figés à son départ : une réponse donnée ailleurs en route (le Quiz,
   * la Prüfung, F1-D3) ne change ni ses tâches ni leurs éléments.
   */
  elements: string[];
}

/**
 * La vue d'une tâche selon son genre, ou `undefined` pour un genre que cette version n'affiche
 * pas : la tâche est alors sautée, comme un genre inconnu (F1-D11).
 */
function vueDeTache(tache: Tache): ((onRepondu: Repondu) => ComponentChild) | undefined {
  switch (tache.genre) {
    case 'qcm':
      return (onRepondu) => <TacheAChoix key={tache.id} tache={tache} onRepondu={onRepondu} />;
    case 'vrai-faux':
      return (onRepondu) => <TacheVraiFaux key={tache.id} tache={tache} onRepondu={onRepondu} />;
    case 'trous':
      return (onRepondu) => <TacheATrous key={tache.id} tache={tache} onRepondu={onRepondu} />;
    case 'orthographe':
      return (onRepondu) => <TacheOrthographe key={tache.id} tache={tache} onRepondu={onRepondu} />;
    case 'ouverte':
      return (onRepondu) => <TacheOuverte key={tache.id} tache={tache} onRepondu={onRepondu} />;
    case 'appariement':
    case 'classement':
      return (onRepondu) => <TacheAGlisser key={tache.id} tache={tache} onRepondu={onRepondu} />;
    default: {
      // Un genre nouveau du modèle doit être placé ici : `pnpm types` échoue tant qu'il ne l'est
      // pas. Une tâche d'un genre inconnu, servie par une version suivante, arrive ici.
      const _exhaustif: never = tache;
      return undefined;
    }
  }
}

/** Les tâches à dérouler que cette version sait afficher, dans l'ordre du papier. */
function tachesAffichees(feuille: Feuille, mode: ModeDeDeroule, dernieres: Dernieres) {
  return tachesADerouler(feuille, mode, dernieres).filter(
    ({ tache }) => vueDeTache(tache) !== undefined,
  );
}

/** La feuille a au moins un élément dont la dernière réponse est fausse : « Fehler wiederholen ». */
function aDesErreurs(feuille: Feuille, dernieres: Dernieres): boolean {
  return tachesAffichees(feuille, 'erreurs', dernieres).length > 0;
}

/** L'état de la feuille, en ne comptant que les tâches que cette version sait afficher. */
function etatAffiche(feuille: Feuille, dernieres: Dernieres) {
  const parties = feuille.parties.map((partie) => ({
    ...partie,
    taches: partie.taches.filter((tache) => vueDeTache(tache) !== undefined),
  }));
  return etatDeFeuille({ parties }, dernieres);
}

/** Le déroulé qui commence : ses éléments sont ceux des tâches à faire à cet instant. */
function deroulement(feuille: Feuille, mode: ModeDeDeroule, dernieres: Dernieres): Deroule {
  const elements = tachesAffichees(feuille, mode, dernieres).flatMap(({ tache }) =>
    idsDeTache(tache),
  );
  return { feuille: feuille.id, mode, rang: 0, resultats: {}, elements };
}

/**
 * Les tâches d'un déroulé, réduites à ses éléments figés, sans relire le journal. Le mode
 * `erreurs` de `tachesADerouler` garde les éléments marqués faux : on n'y marque que ceux-là.
 */
function tachesDuDeroule(feuille: Feuille, deroule: Deroule) {
  const duDeroule: Dernieres = new Map(deroule.elements.map((id) => [id, false]));
  return tachesAffichees(feuille, 'erreurs', duDeroule);
}

export function Feuilles() {
  const { cours, evenements, useEtatDOnglet, oublierEtatDOnglet } = useCours();
  const [deroule, setDeroule] = useEtatDOnglet<Deroule | null>(
    CLE_FEUILLES,
    () => null,
    (d) => {
      const fiche = cours.feuilles.find(({ id }) => id === d?.feuille);
      return (
        d !== null && fiche !== undefined && feuilleEnCours(d, tachesDuDeroule(fiche, d).length)
      );
    },
  );
  const [ergebnis, setErgebnis] = useEtatDOnglet<string | null>(CLE_ERGEBNIS, () => null);
  const dernieres = useMemo(() => dernieresReponses(evenements), [evenements]);
  const feuille = cours.feuilles.find(({ id }) => id === deroule?.feuille);

  /** Un autre déroulé, ou la liste (`null`) : l'état des tâches du précédent est oublié. */
  const ouvrir = (suivant: Deroule | null) => {
    oublierEtatDOnglet(CLE_FEUILLES);
    setDeroule(suivant);
  };
  const commencer = (choisie: Feuille, mode: ModeDeDeroule) =>
    ouvrir(deroulement(choisie, mode, dernieres));

  /** La vue d'une fiche : l'état du déroulé est oublié, puis l'`id` de la fiche est rangé. */
  const voir = (choisie: Feuille) => {
    oublierEtatDOnglet(CLE_FEUILLES);
    setErgebnis(choisie.id);
  };

  // La vue, si sa fiche est encore au contenu ; sinon le déroulé ; sinon la liste.
  const vue = cours.feuilles.find(({ id }) => id === ergebnis);
  if (vue !== undefined) return <ErgebnisDeFeuille feuille={vue} retour={() => ouvrir(null)} />;
  if (deroule === null || feuille === undefined) {
    return <ListeDesFeuilles dernieres={dernieres} commencer={commencer} voir={voir} />;
  }
  return (
    <DerouleDeFeuille
      feuille={feuille}
      deroule={deroule}
      changer={setDeroule}
      retour={() => ouvrir(null)}
      repeter={aDesErreurs(feuille, dernieres) ? () => commencer(feuille, 'erreurs') : undefined}
    />
  );
}

/** Les boutons d'une fiche selon son état (F1-R20) : le principal d'abord, « Fehler » à la fin. */
function boutonsDeFeuille(
  t: Record<CleTexteCours, string>,
  etat: EtatDeFeuille,
  avecErreurs: boolean,
): { libelle: string; mode: ModeDeDeroule; principal: boolean }[] {
  const boutons: { libelle: string; mode: ModeDeDeroule; principal: boolean }[] = [];
  if (etat === 'neuve')
    boutons.push({ libelle: t.feuilles_bearbeiten, mode: 'tout', principal: true });
  if (etat === 'entamee') {
    boutons.push({ libelle: t.feuilles_weitermachen, mode: 'nouveaux', principal: true });
    boutons.push({ libelle: t.feuilles_neu_beginnen, mode: 'tout', principal: false });
  }
  if (etat === 'faite')
    boutons.push({ libelle: t.feuilles_neu_beginnen, mode: 'tout', principal: true });
  if (avecErreurs) boutons.push({ libelle: t.feuilles_fehler, mode: 'erreurs', principal: false });
  return boutons;
}

function ListeDesFeuilles(props: {
  dernieres: Dernieres;
  commencer(feuille: Feuille, mode: ModeDeDeroule): void;
  voir(feuille: Feuille): void;
}) {
  const { dernieres, commencer, voir } = props;
  const { cours, t } = useCours();
  return (
    <section>
      <ul class="chapters" aria-label={t.onglet_feuilles}>
        {cours.feuilles.map((feuille) => {
          const { justes, total } = scoreDeFeuille(feuille, dernieres);
          const avecErreurs = aDesErreurs(feuille, dernieres);
          const etat = etatAffiche(feuille, dernieres);
          return (
            <li key={feuille.id} class="chap">
              <span class="num">{feuille.numero}</span>
              <span class="title">
                {feuille.titre}
                <br />
                <span class="meta">{formater(t.feuilles_score, { justes, total })}</span>
              </span>
              <span class="boutons-feuille">
                {boutonsDeFeuille(t, etat, avecErreurs).map(({ libelle, mode, principal }) => (
                  <button
                    key={libelle}
                    type="button"
                    class={principal ? 'small-btn' : 'ghost'}
                    onClick={() => commencer(feuille, mode)}
                  >
                    {libelle}
                  </button>
                ))}
                {etat !== 'neuve' && (
                  <button type="button" class="ghost" onClick={() => voir(feuille)}>
                    {t.feuilles_ergebnis}
                  </button>
                )}
              </span>
              <Avancement faits={justes} total={total} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function DerouleDeFeuille(props: {
  feuille: Feuille;
  deroule: Deroule;
  changer(deroule: Deroule): void;
  retour(): void;
  /** « Fehler wiederholen » sur le bilan, quand la feuille a des erreurs ; sinon absent. */
  repeter: (() => void) | undefined;
}) {
  const { feuille, deroule, changer, retour, repeter } = props;
  const { t, enregistrer, oublierEtatDOnglet } = useCours();
  const consigne = useRef<HTMLParagraphElement>(null);
  /** « Weiter » vient d'être touché : le focus va à la consigne de la tâche suivante (point 8). */
  const versLaConsigne = useRef(false);
  useEffect(() => {
    if (!versLaConsigne.current) return;
    versLaConsigne.current = false;
    consigne.current?.focus();
  });
  // Les tâches ne dépendent que des éléments figés au départ : une erreur corrigée en route, ici ou
  // ailleurs, ne raccourcit ni n'allonge le déroulé, et `rang` désigne toujours la même tâche.
  const taches = tachesDuDeroule(feuille, deroule);
  const courante = taches[deroule.rang];

  if (courante === undefined) {
    const reponses = Object.values(deroule.resultats);
    const justes = reponses.filter((juste) => juste).length;
    return (
      <section>
        <div class="done">
          <h2>{feuille.titre}</h2>
          <p>{formater(t.feuilles_bilan, { justes, total: reponses.length })}</p>
          <div class="controls">
            <button type="button" class="primary" ref={focaliser} onClick={retour}>
              {t.feuilles_zurueck}
            </button>
            {repeter !== undefined && (
              <button type="button" class="ghost" onClick={repeter}>
                {t.feuilles_fehler}
              </button>
            )}
          </div>
        </div>
      </section>
    );
  }

  const { partie, tache } = courante;
  const dejaRepondu = (id: string) => Object.hasOwn(deroule.resultats, id);
  const repondu: Repondu = (resultats) => {
    const nouveaux = resultats.filter(({ id }) => !dejaRepondu(id));
    if (nouveaux.length === 0) return;
    const ajoutes = Object.fromEntries(nouveaux.map(({ id, juste }) => [id, juste]));
    changer({ ...deroule, resultats: { ...deroule.resultats, ...ajoutes } });
    for (const { id, juste, mode } of nouveaux) void enregistrer(id, juste, mode);
  };

  return (
    <section>
      <div class="controls">
        <button type="button" class="ghost" onClick={retour}>
          {t.feuilles_zurueck}
        </button>
        <span class="progressline">
          {feuille.titre} ·{' '}
          {formater(t.feuilles_aufgabe, { n: deroule.rang + 1, total: taches.length })}
        </span>
      </div>
      <div class="tache">
        <span class="kind">{partie}</span>
        <p class="consigne" ref={consigne} tabIndex={-1}>
          {tache.consigne}
        </p>
        {vueDeTache(tache)?.(repondu)}
      </div>
      {idsDeTache(tache).every(dejaRepondu) && (
        <button
          type="button"
          class="primary"
          ref={focaliser}
          onClick={() => {
            versLaConsigne.current = true;
            // La tâche faite ne revient plus dans ce déroulé : son état est oublié, et sa séance
            // avec (2b-D5). Au bilan, aucune tâche n'est plus entamée.
            oublierEtatDOnglet(`${CLE_FEUILLES}/${tache.id}`);
            changer({ ...deroule, rang: deroule.rang + 1 });
          }}
        >
          {t.suivante}
        </button>
      )}
    </section>
  );
}
