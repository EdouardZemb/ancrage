/*
 * La progression d'une personne dans un cours, côté écran : le journal local, l'état qui en dérive,
 * l'enregistrement des réponses et la synchronisation (ADR-0004, invariant 5).
 *
 * Au montage, le journal est lu dans IndexedDB (affichage immédiat), puis une synchronisation part.
 * Une réponse entre au journal local et dans la file d'envoi (`ajouterEvenements`) ; elle part à la
 * synchronisation suivante (décision 15, `declencheurs.ts`) : 3 s après la dernière réponse (ou
 * aussitôt si l'écran est quitté avant), en fin de séance (`finDeSeance`), au retour du réseau, au
 * passage en arrière-plan. Si le réseau manque, le service worker est chargé de l'envoi
 * (`demanderSyncArrierePlan`).
 *
 * Le journal en mémoire ne fait que grandir : ce qui arrive (réponse, lecture après une
 * synchronisation) s'y ajoute par `fusionnerEvenements`, sans doublon d'`id`. Une lecture lente ne
 * peut donc pas effacer une réponse donnée entre-temps.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CoursPrepare } from '../../domaine/cours/prepare.js';
import { memoireDuCours } from '../../domaine/cours/servi.js';
import {
  creerIdEvenement,
  type Evenement,
  fusionnerEvenements,
  type ResultatExamen,
  VERSION_EVENEMENT,
} from '../../domaine/journal/evenement.js';
import { horodatage, jourDe } from '../../domaine/journal/temps.js';
import { ordonnanceurDe } from '../../domaine/progression/ordonnanceur.js';
import { identifiantAppareil } from '../appareil.js';
import {
  demanderSyncArrierePlan,
  installerDeclencheurs,
  planifierApresReponse,
  retirerSynchroProgrammee,
} from '../declencheurs.js';
import { baseDeLaPage } from '../stockage/base-de-la-page.js';
import type { BaseLocale } from '../stockage/base-locale.js';
import { ajouterEvenements, evenementsDuCours, fileDuCours } from '../stockage/journal-local.js';
import { type EtatSynchro, synchroniserCours } from '../synchro.js';
import type { ContexteCours } from './contexte-cours.js';

export type Progression = Pick<
  ContexteCours,
  'evenements' | 'etats' | 'aujourdhui' | 'enregistrer' | 'enregistrerExamen' | 'finDeSeance'
> & {
  /**
   * Le journal local est lu (ou illisible) : `evenements` et `etats` sont ceux de l'appareil. Un
   * onglet qui construit une série d'après le journal attend ce moment, sans attendre le réseau.
   */
  charge: boolean;
  /**
   * Le dernier rangement d'une réponse a échoué (stockage de l'appareil refusé) : la réponse n'est
   * pas au journal. L'écran le dit ; le prochain rangement réussi efface l'erreur.
   */
  erreurEnregistrement: boolean;
  /** L'état de la dernière synchronisation terminée (`en_attente` avant la première). */
  synchro: EtatSynchro;
  /** Le nombre de réponses de ce cours qui attendent dans la file d'envoi. */
  enAttente: number;
  /** Une synchronisation est en cours. */
  enCours: boolean;
  /**
   * La base de l'appareil ne s'ouvre pas (fenêtre privée, stockage refusé) : rien n'est gardé ici,
   * et l'écran ne doit pas dire le contraire.
   */
  stockageIndisponible: boolean;
};

/** Les octets aléatoires d'un identifiant d'événement (`creerIdEvenement`). */
const OCTETS_ALEATOIRES = 10;

type Corps =
  | { type: 'reponse'; unite: string; resultat: { juste: boolean } }
  | { type: 'examen'; unite: string; resultat: ResultatExamen };

/** L'horodatage de `instant` à l'heure locale de l'appareil, avec son décalage. */
export function horodatageLocal(instant: number): string {
  return horodatage(instant, -new Date(instant).getTimezoneOffset());
}

/** Un événement de cet appareil, daté à l'heure locale de `instant` (décision 9). */
function evenementA(cours: string, instant: number, corps: Corps): Evenement {
  return {
    id: creerIdEvenement(instant, crypto.getRandomValues(new Uint8Array(OCTETS_ALEATOIRES))),
    cours,
    ...corps,
    repondu_a: horodatageLocal(instant),
    appareil: identifiantAppareil(),
    v: VERSION_EVENEMENT,
  };
}

/** Le jour local de l'appareil, maintenant. */
function aujourdhuiLocal(): string {
  const maintenant = Date.now();
  return jourDe(horodatageLocal(maintenant));
}

/**
 * La synchronisation d'un écran parti : rien à afficher, seul l'envoi compte. Si le réseau manque,
 * le service worker enverra la file à son retour, même page fermée (`demanderSyncArrierePlan`).
 */
function synchroniserSansEcran(personne: string, cours: string): void {
  void baseDeLaPage()
    .then((base) => synchroniserCours(base, personne, cours))
    .then(({ etat }) => {
      if (etat === 'hors_ligne') void demanderSyncArrierePlan();
    })
    .catch(() => {
      // La file reste : un déclencheur suivant la reprendra.
    });
}

export function useProgression(personne: string, cours: CoursPrepare): Progression {
  const id = cours.cours.id;
  const { leitner } = cours.cours;
  // `memoireDuCours` rend un objet neuf à chaque appel : l'ordonnanceur se mémorise sur ses champs.
  const memoire = memoireDuCours(cours.cours);
  const algorithme = memoire?.algorithme;
  const retention = memoire?.retention;
  const [evenements, setEvenements] = useState<readonly Evenement[]>([]);
  const [charge, setCharge] = useState(false);
  const [erreurEnregistrement, setErreurEnregistrement] = useState(false);
  const [synchro, setSynchro] = useState<EtatSynchro>('en_attente');
  const [enAttente, setEnAttente] = useState(0);
  // Une synchronisation part au montage : elle est en cours dès le premier affichage.
  const [enCours, setEnCours] = useState(true);
  const [stockageIndisponible, setStockageIndisponible] = useState(false);
  // Change à chaque (personne, cours) et au démontage : un résultat d'avant est ignoré.
  const generation = useRef(0);
  const synchronisations = useRef(0);
  // Faux dès le démontage. Preact ne passe la fin d'un `useEffect` démonté (qui retire les
  // déclencheurs) qu'après l'affichage suivant ; celle d'un `useLayoutEffect`, tout de suite.
  const monte = useRef(true);
  useLayoutEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  const ajouter = useCallback((nouveaux: readonly Evenement[]) => {
    setEvenements((courants) => fusionnerEvenements(courants, nouveaux));
  }, []);

  const synchroniser = useCallback(() => {
    // L'écran quitté (une autre personne s'est peut-être connectée), un déclencheur ou un minuteur
    // resté en place ne synchronise plus rien pour lui.
    if (!monte.current) return;
    const lancee = generation.current;
    synchronisations.current += 1;
    setEnCours(true);
    void (async () => {
      let base: BaseLocale | undefined;
      try {
        base = await baseDeLaPage();
        const resultat = await synchroniserCours(base, personne, id);
        const lus = await evenementsDuCours(base, personne, id);
        if (lancee !== generation.current) return;
        ajouter(lus);
        setSynchro(resultat.etat);
        setEnAttente(resultat.enAttente);
        setStockageIndisponible(false);
        // Le réseau manque : le service worker enverra la file à son retour, même page fermée.
        if (resultat.etat === 'hors_ligne') void demanderSyncArrierePlan();
      } catch {
        // Une panne du stockage, et non du réseau : la file reste, la prochaine fois la reprendra.
        if (lancee === generation.current) {
          setSynchro('en_attente');
          if (base === undefined) setStockageIndisponible(true);
        }
      } finally {
        // Le compte couvre toutes les synchronisations de l'écran, d'avant comme d'après un
        // changement de cours : la dernière à finir dit qu'il n'y en a plus.
        synchronisations.current -= 1;
        if (synchronisations.current === 0) setEnCours(false);
      }
    })();
  }, [personne, id, ajouter]);

  useEffect(() => {
    const lancee = ++generation.current;
    setEvenements([]);
    setCharge(false);
    void (async () => {
      try {
        const base = await baseDeLaPage();
        const [lus, file] = await Promise.all([
          evenementsDuCours(base, personne, id),
          fileDuCours(base, personne, id),
        ]);
        if (lancee !== generation.current) return;
        ajouter(lus);
        setEnAttente(file.length);
      } catch {
        // Le journal local est illisible : la synchronisation dira ce qu'il en est.
      }
      if (lancee === generation.current) {
        setCharge(true);
        synchroniser();
      }
    })();
    return () => {
      generation.current += 1;
    };
  }, [personne, id, ajouter, synchroniser]);

  // Le retour du réseau, le passage en arrière-plan : tant que l'écran est là.
  useEffect(() => installerDeclencheurs(synchroniser), [synchroniser]);

  // L'écran quitté (ou le cours changé) dans les 3 s qui suivent une réponse : la synchronisation
  // programmée n'est pas abandonnée, elle part tout de suite, pour la même personne et le même
  // cours (décision 15). La session est encore la même : un changement de session annule les
  // minuteurs avant (R19), et l'en-tête de la personne protège de toute façon (R21).
  useLayoutEffect(
    () => () => {
      if (retirerSynchroProgrammee(synchroniser)) synchroniserSansEcran(personne, id);
    },
    [synchroniser, personne, id],
  );

  /**
   * Range les événements dans l'ordre donné, d'un seul tenant (tous ou aucun : un examen remis ne
   * laisse jamais une partie de ses réponses), puis les ajoute au journal en mémoire. Un refus du
   * stockage ne rejette pas : il rend `false` et se signale (`erreurEnregistrement`), car la
   * personne continue de réviser et la fin de séance doit pouvoir partir quand même.
   */
  const ranger = useCallback(
    async (nouveaux: readonly Evenement[]): Promise<boolean> => {
      const lancee = generation.current;
      try {
        const base = await baseDeLaPage();
        await ajouterEvenements(base, personne, nouveaux);
        const file = await fileDuCours(base, personne, id);
        if (lancee !== generation.current) return true;
        ajouter(nouveaux);
        setEnAttente(file.length);
        setErreurEnregistrement(false);
        planifierApresReponse(synchroniser);
        return true;
      } catch {
        if (lancee === generation.current) setErreurEnregistrement(true);
        return false;
      }
    },
    [personne, id, ajouter, synchroniser],
  );

  const enregistrer = useCallback(
    (unite: string, juste: boolean) =>
      ranger([evenementA(id, Date.now(), { type: 'reponse', unite, resultat: { juste } })]),
    [id, ranger],
  );

  const examen = cours.examen;
  const enregistrerExamen = useCallback(
    async (resultat: ResultatExamen, reponses: readonly { unite: string; juste: boolean }[]) => {
      if (examen === undefined) {
        throw new Error("Ce cours n'a pas de module d'examen.");
      }
      // Une milliseconde d'écart entre deux événements : l'ordre du journal est celui de la remise,
      // les réponses d'abord, l'examen ensuite, quels que soient les `id` tirés.
      const debut = Date.now();
      return ranger([
        ...reponses.map(({ unite, juste }, i) =>
          evenementA(id, debut + i, { type: 'reponse', unite, resultat: { juste } }),
        ),
        evenementA(id, debut + reponses.length, { type: 'examen', unite: examen.id, resultat }),
      ]);
    },
    [id, examen, ranger],
  );

  const ordonnanceur = useMemo(
    () =>
      ordonnanceurDe({
        leitner,
        memoire:
          algorithme === undefined || retention === undefined
            ? undefined
            : { algorithme, retention },
      }),
    [leitner, algorithme, retention],
  );
  const etats = useMemo(() => ordonnanceur(evenements), [ordonnanceur, evenements]);

  return {
    evenements,
    etats,
    aujourdhui: aujourdhuiLocal(),
    enregistrer,
    enregistrerExamen,
    finDeSeance: synchroniser,
    charge,
    erreurEnregistrement,
    synchro,
    enAttente,
    enCours,
    stockageIndisponible,
  };
}
