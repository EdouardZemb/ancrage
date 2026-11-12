/*
 * L'écran d'un cours (`/cours/<id>[/<onglet>]`) : en tête le titre du cours et l'état de la
 * synchronisation, puis la barre des onglets (H:195-208), puis l'onglet courant. Les écrans du cours
 * sont dans la langue du cours (décision 3), le reste de l'application dans celle de la personne.
 *
 * Le contenu est d'abord lu dans IndexedDB, pour s'afficher sans attendre le réseau, puis toujours
 * relu sur le réseau et rangé : un contenu qui change, ou un cours dont le droit revient, est ainsi
 * à jour. Si le serveur dit le cours introuvable, l'écran ne montre que cela, même s'il en a une
 * copie : effacer la copie est le travail de la synchronisation (`synchroniserCours`).
 *
 * Un contenu qui n'a pas la forme que cet écran sait afficher (`coursServiUtilisable`) n'est ni
 * rangé ni affiché : c'est celui d'un serveur d'une autre version, après un retour arrière vers la
 * v0.3.0 par exemple. La copie de l'appareil reste alors affichée ; sans copie utilisable, l'écran
 * dit le cours indisponible.
 *
 * L'écran est propre à une personne (sa clé la contient, `App.tsx`) : une fois démonté, rien de ce
 * qu'il a lu ne s'écrit plus.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  type CoursPrepare,
  type Onglet,
  ongletsDuCours,
  preparerCours,
} from '../../domaine/cours/prepare.js';
import { type CoursServi, coursServiUtilisable } from '../../domaine/cours/servi.js';
import type { SeanceCartes } from '../../domaine/seances/cartes.js';
import { ErreurApi, lireCours } from '../api.js';
import { MessageErreur, Rattrapage } from '../composants.js';
import { useApp } from '../contexte.js';
import { messageDErreur, sessionPerdue } from '../erreurs.js';
import { cheminDuCours, naviguer } from '../routeur.js';
import { declarerSeance } from '../seance.js';
import { baseDeLaPage } from '../stockage/base-de-la-page.js';
import type { BaseLocale } from '../stockage/base-locale.js';
import { coursLocal, enregistrerCours } from '../stockage/cours-local.js';
import { defilementPourVoir, placeDansLaBarre } from './barre-d-onglets.js';
import {
  CLE_SEANCE_IMPOSEE,
  type ContexteCours,
  ContexteDuCours,
  etatDOngletSur,
  oubliDOngletSur,
  type PredicatsDeSeance,
  seanceDansLaMemoire,
  useCours,
} from './contexte-cours.js';
import { Apercu } from './onglets/Apercu.js';
import { Cartes } from './onglets/Cartes.js';
import { Examen } from './onglets/Examen.js';
import { Exercices } from './onglets/Exercices.js';
import { Feuilles } from './onglets/Feuilles.js';
import { Heute } from './onglets/Heute.js';
import { Mots } from './onglets/Mots.js';
// Le type `Progression` de `useProgression` porte déjà ce nom.
import { Progression as OngletProgression } from './onglets/Progression.js';
import { Quiz } from './onglets/Quiz.js';
import { Schemas } from './onglets/Schemas.js';
import { Textes } from './onglets/Textes.js';
import { ecrirePreferences, lirePreferences, type Preferences } from './preferences.js';
import { type CleTexteCours, formater, textesDuCours } from './textes-cours.js';
import { type Progression, useProgression } from './useProgression.js';

type Contenu =
  | { etat: 'chargement' }
  | { etat: 'pret'; cours: CoursServi }
  | { etat: 'introuvable' }
  | { etat: 'erreur'; message: string };

/** Deux contenus identiques : le second ne remplace pas le premier, les onglets ne bougent pas. */
function memeContenu(a: CoursServi, b: CoursServi): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Le texte de l'état de la synchronisation, en tête du cours. Il dit ce qui compte pour la
 * personne : ses réponses sont-elles chez le serveur ? La file vide, elles le sont toutes, même si
 * la dernière synchronisation n'a pas pu lire celles des autres appareils. Sans stockage sur
 * l'appareil, rien n'est gardé : il le dit, et jamais « Gespeichert ».
 */
export function texteDeSynchro(
  t: Record<CleTexteCours, string>,
  progression: Pick<Progression, 'enAttente' | 'enCours' | 'stockageIndisponible'>,
): string {
  if (progression.stockageIndisponible) return t.synchro_stockage_indisponible;
  if (progression.enCours) return t.synchro_en_cours;
  if (progression.enAttente === 0) return t.synchro_a_jour;
  if (progression.enAttente === 1) return t.synchro_une_en_attente;
  return formater(t.synchro_en_attente, { n: progression.enAttente });
}

/** Le libellé d'un onglet : un texte d'interface, ou le titre de son module (décision 19). */
function libelleDOnglet(
  onglet: Onglet,
  cours: CoursPrepare,
  t: Record<CleTexteCours, string>,
): string {
  switch (onglet) {
    case 'heute':
      return t.onglet_heute;
    case 'apercu':
      return t.onglet_apercu;
    case 'cartes':
      return t.onglet_cartes;
    case 'quiz':
      return t.onglet_quiz;
    case 'mots':
      return cours.morphologie?.titre ?? '';
    case 'schemas':
      return t.onglet_schemas;
    case 'textes':
      return cours.textes?.titre ?? '';
    case 'exercices':
      return cours.exercices?.titre ?? '';
    case 'feuilles':
      return t.onglet_feuilles;
    case 'examen':
      return cours.examen?.titre ?? '';
    case 'progression':
      return t.onglet_progression;
  }
}

/**
 * Les cartes, avec la séance que l'examen leur a imposée, s'il en a imposé une (« Fehler als
 * Karteikarten üben »). La séance est gardée dans la mémoire des onglets : c'est toujours le même
 * objet, que `Cartes` reconnaît à sa référence.
 */
function CartesDuCours() {
  const { useEtatDOnglet } = useCours();
  const [imposee] = useEtatDOnglet<SeanceCartes | undefined>(CLE_SEANCE_IMPOSEE, () => undefined);
  return <Cartes seanceImposee={imposee} />;
}

/** L'onglet courant. */
function OngletCourant(props: { onglet: Onglet }) {
  const { onglet } = props;
  switch (onglet) {
    case 'heute':
      return <Heute />;
    case 'apercu':
      return <Apercu />;
    case 'cartes':
      return <CartesDuCours />;
    case 'quiz':
      return <Quiz />;
    case 'mots':
      return <Mots />;
    case 'schemas':
      return <Schemas />;
    case 'textes':
      return <Textes />;
    case 'exercices':
      return <Exercices />;
    case 'feuilles':
      return <Feuilles />;
    case 'examen':
      return <Examen />;
    case 'progression':
      return <OngletProgression />;
    default: {
      // Un onglet oublié ici ne s'afficherait pas, sans erreur : `pnpm types` le signale.
      const _exhaustif: never = onglet;
      return null;
    }
  }
}

function CoursOuvert(props: { personne: string; servi: CoursServi; onglet: Onglet }) {
  const { personne, servi } = props;
  const app = useApp();
  const cours = useMemo(() => preparerCours(servi), [servi]);
  const id = cours.cours.id;
  const t = textesDuCours(cours.cours.langue);
  const progression = useProgression(personne, cours);

  const [preferences, setPreferences] = useState<Preferences>(() =>
    lirePreferences(personne, cours),
  );
  // Un contenu nouveau peut ne plus connaître un choix gardé : on le relit.
  useEffect(() => setPreferences(lirePreferences(personne, cours)), [personne, cours]);
  const changerPreferences = useCallback(
    (choisies: Preferences) => {
      setPreferences(choisies);
      ecrirePreferences(personne, id, choisies);
    },
    [personne, id],
  );

  const onglets = useMemo(() => ongletsDuCours(cours), [cours]);
  // Un onglet que ce cours n'a pas (un module retiré, une adresse ancienne) : l'aperçu.
  const onglet = onglets.includes(props.onglet) ? props.onglet : 'apercu';
  // L'onglet choisi, ramené dans la barre qui défile, par son seul défilement (R40) : ni
  // `scrollIntoView` ni `focus()`, le point de départ du clavier ne bouge pas.
  const barre = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = barre.current;
    const choisi = element?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (element && choisi) {
      element.scrollLeft = defilementPourVoir(element, placeDansLaBarre(element, choisi));
    }
  }, [onglet]);
  useEffect(() => {
    if (onglet !== props.onglet) naviguer(cheminDuCours(id), { remplacer: true });
  }, [onglet, props.onglet, id]);
  const aller = useCallback((vers: Onglet) => naviguer(cheminDuCours(id, vers)), [id]);

  // La mémoire des onglets : un autre contenu du cours la remet à zéro, car les unités d'une série
  // gardée ne seraient plus celles du cours.
  const memoireDesOnglets = useMemo(() => new Map<string, unknown>(), [cours]);
  // Les prédicats de séance (2a-D3) vont avec elle : ils sont remis à zéro ensemble.
  const predicatsDeSeance = useMemo<PredicatsDeSeance>(() => new Map(), [memoireDesOnglets]);
  const useEtatDOnglet = useMemo(
    () => etatDOngletSur(memoireDesOnglets, predicatsDeSeance),
    [memoireDesOnglets, predicatsDeSeance],
  );
  const oublierEtatDOnglet = useMemo(
    () => oubliDOngletSur(memoireDesOnglets, predicatsDeSeance),
    [memoireDesOnglets, predicatsDeSeance],
  );
  // Tant qu'un état de la mémoire est une séance en cours, l'application ne se met pas à jour.
  // `useLayoutEffect`, car sa fin passe au démontage même : la règle d'une navigation, évaluée une
  // tâche après le rendu (2a-D2), ne voit plus la séance d'un cours quitté. Celle d'un `useEffect`
  // attendrait l'affichage suivant, et la version ne s'appliquerait pas à la sortie du cours.
  useLayoutEffect(
    () => declarerSeance(() => seanceDansLaMemoire(memoireDesOnglets, predicatsDeSeance)),
    [memoireDesOnglets, predicatsDeSeance],
  );

  // La session a expiré, ou elle est celle d'une autre personne : l'application le dit (bandeau),
  // la révision continue, la file attend (décision 14).
  const sessionTerminee = progression.synchro === 'reconnexion';
  const { definirMoi } = app;
  useEffect(() => {
    if (sessionTerminee) definirMoi(undefined);
  }, [sessionTerminee, definirMoi]);

  const { evenements, etats, aujourdhui, enregistrer, enregistrerExamen, finDeSeance } =
    progression;
  const contexte = useMemo<ContexteCours>(
    () => ({
      cours,
      t,
      evenements,
      etats,
      aujourdhui,
      enregistrer,
      enregistrerExamen,
      finDeSeance,
      preferences,
      changerPreferences,
      hasard: Math.random,
      aller,
      useEtatDOnglet,
      oublierEtatDOnglet,
    }),
    [
      cours,
      t,
      evenements,
      etats,
      aujourdhui,
      enregistrer,
      enregistrerExamen,
      finDeSeance,
      preferences,
      changerPreferences,
      aller,
      useEtatDOnglet,
      oublierEtatDOnglet,
    ],
  );

  // Le droit a été retiré : la synchronisation a oublié le cours (décision 13).
  if (progression.synchro === 'indisponible') {
    return <p>{app.t.cours_introuvable}</p>;
  }

  return (
    <div class="cours" lang={cours.cours.langue}>
      <header class="top">
        <h2 class="titre-cours">{cours.cours.titre}</h2>
        <span class="save" data-testid="etat-synchro">
          {texteDeSynchro(t, progression)}
        </span>
      </header>
      {progression.erreurEnregistrement && (
        <p class="erreur" role="alert" data-testid="erreur-enregistrement">
          {t.erreur_enregistrement}
        </p>
      )}
      <div class="tabs" role="tablist" aria-label={cours.cours.titre} ref={barre}>
        {onglets.map((chacun) => (
          <button
            key={chacun}
            type="button"
            role="tab"
            id={`onglet-${chacun}`}
            aria-selected={chacun === onglet ? 'true' : 'false'}
            aria-controls="onglet-courant"
            onClick={() => aller(chacun)}
          >
            {libelleDOnglet(chacun, cours, t)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="onglet-courant" aria-labelledby={`onglet-${onglet}`}>
        {/* Un onglet se construit d'après le journal : il attend de l'avoir lu sur l'appareil. */}
        {progression.charge && (
          <ContexteDuCours.Provider value={contexte}>
            {/* Un onglet dont le rendu échoue ne prend pas l'écran avec lui : la barre reste, et un
                autre onglet remet le filet à neuf (1e-D13). */}
            <Rattrapage key={onglet} message={t.onglet_en_erreur} libelleRecharger={t.recharger}>
              <OngletCourant onglet={onglet} />
            </Rattrapage>
          </ContexteDuCours.Provider>
        )}
      </div>
    </div>
  );
}

export function EcranCours(props: { cours: string; onglet: Onglet }) {
  const app = useApp();
  // Les libellés et `definirMoi` du moment, sans relancer la lecture quand ils changent.
  const appCourante = useRef(app);
  appCourante.current = app;
  const { t } = app;
  const personne = app.moi?.id;
  const id = props.cours;
  const [contenu, setContenu] = useState<Contenu>({ etat: 'chargement' });
  const [essai, setEssai] = useState(0);
  // Faux dès le démontage. Preact ne passe la fin d'un `useEffect` démonté qu'après l'affichage
  // suivant ; celle d'un `useLayoutEffect`, tout de suite.
  const monte = useRef(true);
  useLayoutEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  useEffect(() => {
    if (personne === undefined) return;
    let actif = true;
    // Rien de ce qui a été lu pour une autre personne, ou un autre cours, ne reste affiché.
    setContenu({ etat: 'chargement' });
    void (async () => {
      let base: BaseLocale | undefined;
      try {
        base = await baseDeLaPage();
        const local = await coursLocal(base, personne, id);
        if (actif && coursServiUtilisable(local)) {
          setContenu((avant) =>
            avant.etat === 'chargement' ? { etat: 'pret', cours: local } : avant,
          );
        }
      } catch {
        // Pas de base locale (stockage refusé) : le réseau seul.
      }

      let lu: unknown;
      try {
        // La personne nommée : sous la session d'une autre, le serveur ne rend rien (R36).
        lu = await lireCours(id, personne);
      } catch (echec) {
        if (!actif) return;
        if (echec instanceof ErreurApi && echec.code === 'introuvable') {
          setContenu({ etat: 'introuvable' });
          return;
        }
        if (sessionPerdue(echec)) appCourante.current.definirMoi(undefined);
        // La copie de l'appareil reste affichée ; sans copie, l'échec et « Réessayer ».
        setContenu((avant) =>
          avant.etat === 'pret'
            ? avant
            : { etat: 'erreur', message: messageDErreur(echec, appCourante.current.t) },
        );
        return;
      }
      // L'écran quitté (une autre personne s'est connectée, par exemple), plus rien ne s'écrit.
      if (!actif || !monte.current) return;
      if (!coursServiUtilisable(lu)) {
        // Un serveur d'une autre version : la copie de l'appareil reste, rien n'est rangé.
        setContenu((avant) =>
          avant.etat === 'pret'
            ? avant
            : { etat: 'erreur', message: appCourante.current.t.cours_indisponible },
        );
        return;
      }
      const servi = lu;
      if (base !== undefined) {
        // Ranger la copie ne doit pas empêcher d'afficher le cours : un échec ici la laisse
        // seulement plus ancienne.
        await enregistrerCours(base, personne, servi).catch(() => {});
      }
      if (actif) {
        setContenu((avant) =>
          avant.etat === 'pret' && memeContenu(avant.cours, servi)
            ? avant
            : { etat: 'pret', cours: servi },
        );
      }
    })();
    return () => {
      actif = false;
    };
  }, [personne, id, essai]);

  if (personne === undefined) {
    return null;
  }
  switch (contenu.etat) {
    case 'chargement':
      return <p>{t.chargement}</p>;
    case 'introuvable':
      return <p>{t.cours_introuvable}</p>;
    case 'erreur':
      return (
        <>
          <MessageErreur message={contenu.message} />
          <button type="button" class="secondaire" onClick={() => setEssai((n) => n + 1)}>
            {t.reessayer}
          </button>
        </>
      );
    case 'pret':
      return <CoursOuvert personne={personne} servi={contenu.cours} onglet={props.onglet} />;
  }
}
