/*
 * La synchronisation en arrière-plan (décision 15) : quand un envoi a échoué faute de réseau, la
 * page demande au navigateur un événement `sync` (étiquette `ancrage-journal`,
 * `demanderSyncArrierePlan`). Le navigateur le remet au service worker quand le réseau revient,
 * même application fermée. Le service worker envoie alors la file de la personne que l'appareil
 * connaît, et rien d'autre : ni lecture du journal, ni contenu.
 *
 * Chaque envoi nomme sa personne (`x-ancrage-personne`) : si la session du navigateur est celle
 * d'une autre personne, le serveur refuse (409) et la file reste (R21).
 *
 * Ce module est importé par `sw.ts` : ni `window`, ni `document`, ni `localStorage` ici, ni dans ce
 * qu'il importe (`tsconfig.sw.json` le vérifie).
 */
import { type BaseLocale, moiLocal, ouvrirBaseLocale } from './stockage/base-locale.js';
import { type ApiJournal, apiDuJournal, type EtatSynchro, envoyerFile } from './synchro.js';

/** L'étiquette de la synchronisation en arrière-plan du journal. */
export const ETIQUETTE_SYNC = 'ancrage-journal';

/** L'événement `sync` (Background Sync), que les types de TypeScript ne décrivent pas. */
export interface EvenementSync {
  readonly tag: string;
  waitUntil(promesse: Promise<unknown>): void;
}

/**
 * Ouvre la base de l'appareil, lit la personne connue et envoie sa file (`envoyerFile`). Sans
 * personne connue, rien ne part. La base est refermée ensuite : la page garde la sienne.
 */
export async function envoyerEnArrierePlan(
  ouvrir: () => Promise<BaseLocale> = () => ouvrirBaseLocale(),
  api: ApiJournal = apiDuJournal(),
): Promise<EtatSynchro> {
  const base = await ouvrir();
  try {
    const moi = await moiLocal(base);
    if (moi === undefined) return 'a_jour';
    return await envoyerFile(base, moi.id, api);
  } finally {
    base.close();
  }
}

/**
 * L'écouteur de l'événement `sync`. Le navigateur garde le service worker en vie jusqu'à la fin de
 * l'envoi (`waitUntil`). Si le serveur ne répond pas, la promesse échoue : le navigateur retentera
 * plus tard. Les autres échecs (session expirée ou d'une autre personne, refus) ne se règlent pas
 * en retentant : la file attend la page, et ses déclencheurs.
 */
export function surSync(
  evenement: EvenementSync,
  envoyer: () => Promise<EtatSynchro> = () => envoyerEnArrierePlan(),
): void {
  if (evenement.tag !== ETIQUETTE_SYNC) return;
  evenement.waitUntil(
    envoyer().then((etat) => {
      if (etat === 'hors_ligne') throw new Error('Serveur injoignable : envoi à reprendre.');
    }),
  );
}
