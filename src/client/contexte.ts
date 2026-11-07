/*
 * Ce que tous les écrans partagent : la personne connectée et la langue (le contexte), puis deux
 * crochets pour parler à l'API. `useChargement` lit des données à l'ouverture d'un écran ;
 * `useAction` lance une opération déclenchée par la personne (un bouton) et garde son état
 * (occupé, message d'échec). Les deux traduisent les échecs (`erreurs.ts`) et, si la session a
 * pris fin, le disent à l'application (`definirMoi(undefined)`) : la personne connue de l'appareil
 * continue, avec un bandeau qui l'invite à se reconnecter (décision 14) ; sinon, l'application
 * renvoie à la connexion.
 */
import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useRef, useState } from 'preact/hooks';
import type { Moi } from './api.js';
import { messageDErreur, sessionPerdue } from './erreurs.js';
import type { CleTexte, Langue } from './textes.js';

export interface ContexteApp {
  /** Celle de la personne connectée, sinon celle du téléphone. */
  langue: Langue;
  t: Record<CleTexte, string>;
  /**
   * La personne de la session, ou, hors ligne et session expirée, celle que l'appareil connaît :
   * on révise sous son nom (décision 14).
   */
  moi: Moi | undefined;
  /**
   * Après une connexion : relit `GET /api/moi` et réserve l'appareil à la personne
   * (`adopterPersonne`) ; rend la personne, ou `undefined` sans session.
   */
  actualiserMoi: () => Promise<Moi | undefined>;
  /**
   * Fixe la personne connectée (son nom, sa langue ont changé). `undefined` : la session a pris
   * fin (401) ; la personne connue continue, en session expirée.
   */
  definirMoi: (moi: Moi | undefined) => void;
  /** La déconnexion est faite (`deconnecter`) : l'application ne connaît plus personne. */
  fermerSession: () => void;
}

export const ContexteApp = createContext<ContexteApp | undefined>(undefined);

export function useApp(): ContexteApp {
  const contexte = useContext(ContexteApp);
  if (contexte === undefined) {
    throw new Error("useApp : l'écran est affiché hors de l'application");
  }
  return contexte;
}

/** Les libellés d'un échec : ceux de la langue courante par défaut. */
export type Libelles = Readonly<Record<string, string | undefined>>;

/** Une référence qui garde la dernière valeur, pour que les rappels n'aient pas à changer. */
function useDernier<T>(valeur: T) {
  const reference = useRef(valeur);
  reference.current = valeur;
  return reference;
}

export function useAction(libelles?: Libelles) {
  const app = useDernier(useApp());
  const libellesCourants = useDernier(libelles);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState<string | undefined>();

  const lancer = useCallback(
    async (action: () => Promise<void>) => {
      setOccupe(true);
      setErreur(undefined);
      try {
        await action();
      } catch (echec) {
        if (sessionPerdue(echec)) {
          app.current.definirMoi(undefined);
        }
        setErreur(messageDErreur(echec, libellesCourants.current ?? app.current.t));
      } finally {
        setOccupe(false);
      }
    },
    [app, libellesCourants],
  );

  return { occupe, erreur, lancer };
}

/**
 * `useAction`, plus `agir` : lance le travail, puis relit les données (`recharger`) avant de rendre
 * la main. Un échec du travail saute la relecture et s'affiche comme tout échec de `useAction`
 * (1f-D4 : les quatre écrans qui écrivaient la même enveloppe la prennent d'ici).
 */
export function useAgir(recharger: () => unknown, libelles?: Libelles) {
  const action = useAction(libelles);
  const { lancer } = action;
  const agir = (travail: () => Promise<unknown>) =>
    lancer(async () => {
      await travail();
      await recharger();
    });
  return { ...action, agir };
}

export function useChargement<T>(charger: () => Promise<T>, libelles?: Libelles) {
  const app = useDernier(useApp());
  const chargeur = useDernier(charger);
  const libellesCourants = useDernier(libelles);
  const [donnees, setDonnees] = useState<T | undefined>();
  const [erreur, setErreur] = useState<string | undefined>();
  const actif = useRef(true);

  const recharger = useCallback(async () => {
    try {
      const lues = await chargeur.current();
      if (actif.current) {
        setDonnees(lues);
        setErreur(undefined);
      }
    } catch (echec) {
      if (sessionPerdue(echec)) {
        app.current.definirMoi(undefined);
      }
      if (actif.current) {
        setErreur(messageDErreur(echec, libellesCourants.current ?? app.current.t));
      }
    }
  }, [app, chargeur, libellesCourants]);

  useEffect(() => {
    actif.current = true;
    void recharger();
    return () => {
      actif.current = false;
    };
  }, [recharger]);

  return { donnees, erreur, recharger };
}
