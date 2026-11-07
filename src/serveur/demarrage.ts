import path from 'node:path';
import { FICHIER_LISEZMOI } from '../domaine/contenu/analyse.js';
import { FICHIER_NOTICE } from '../domaine/contenu/notice.js';
import type { Config } from './config.js';
import {
  chargerContenus,
  estUnDossier,
  LienSymboliqueRefuse,
  listerFichiers,
} from './contenus/chargeur.js';
import { formaterErreur } from './contenus/erreurs.js';
import { type ContenusCharges, demarrerServeur } from './serveur.js';

/**
 * Vrai si `dossier` manque, ou s'il ne porte aucun fichier hors du `README.md` de sa racine : le
 * gabarit du dépôt de données en sème un, qui ne fait pas un contenu (S1-D3). Un lien symbolique
 * compte comme un fichier : le chargement le refusera, avec son message.
 */
function contenuVide(dossier: string): boolean {
  if (!estUnDossier(dossier)) return true;
  try {
    return listerFichiers(dossier, [FICHIER_LISEZMOI]).length === 0;
  } catch (erreur) {
    if (erreur instanceof LienSymboliqueRefuse) return false;
    throw erreur;
  }
}

/**
 * Le dossier que le démarrage sert (S1-D3) : le contenu monté s'il n'est pas vide
 * (`contenuVide`). Sinon, la prod refuse, et tout autre environnement (`dev`, `ci`, `staging`, ou
 * sans `ANCRAGE_ENV`) se replie sur le cours d'exemple. La prod refuse aussi un contenu monté qui
 * est le dossier de l'exemple, comparé en chemins absolus : elle ne le sert jamais. Le message
 * d'erreur dit le chemin absolu.
 */
export function resoudreContenu(
  config: Config,
): { dossier: string; repli: boolean } | { erreur: string } {
  const monte = config.dossierContenus;
  const enProd = config.environnement === 'prod';
  const refus = (quoi: string) => ({
    erreur: `contenu absent : ${quoi} ; la prod ne sert jamais l'exemple`,
  });
  const repli = { dossier: config.dossierExemple, repli: true };
  if (monte === undefined) return enProd ? refus('ANCRAGE_CONTENUS non définie') : repli;
  const chemin = path.resolve(monte);
  if (enProd && chemin === path.resolve(config.dossierExemple)) {
    return refus(`${chemin} est le dossier de l'exemple`);
  }
  if (!contenuVide(monte)) return { dossier: monte, repli: false };
  return enProd ? refus(chemin) : repli;
}

/**
 * Charge et valide le contenu des cours et la notice avant que le serveur ne s'ouvre. Le contenu
 * invalide empêche le démarrage : une ligne par erreur (`fichier lieu : message`, comme
 * `pnpm contenus:verifier`), puis `undefined`. Les messages ne citent jamais le texte d'un cours ;
 * le seul renseignement sur les cours que le journal donne est leur nombre (invariant 1).
 * `charger` est remplaçable par les tests.
 */
export function contenusAuDemarrage(
  dossier: string,
  ecrire: (ligne: string) => void,
  charger: typeof chargerContenus = chargerContenus,
): ContenusCharges | undefined {
  const { cours, erreurs, notice } = charger(dossier);
  if (erreurs.length > 0) {
    for (const erreur of erreurs) ecrire(formaterErreur(erreur));
    return undefined;
  }
  // Sans erreur, l'analyse rend la notice (S1-D7) ; sans elle, le refus se dit quand même.
  if (notice === undefined) {
    ecrire(`${FICHIER_NOTICE} : valeurs introuvables.`);
    return undefined;
  }
  ecrire(`contenus chargés : ${cours.length} cours`);
  return { cours, notice };
}

/**
 * L'entrée du serveur : résout le dossier servi (`resoudreContenu`), charge les contenus, puis
 * démarre. Rend le code de sortie du processus, 1 quand la prod n'a pas de contenu, quand le
 * contenu est invalide (ni base, ni écoute) ou que le démarrage échoue, sinon 0 ; le serveur
 * démarré reste à l'écoute, et SIGTERM ou SIGINT l'arrête. `ecrire` reçoit les lignes du
 * démarrage, le repli sur l'exemple compris ; `demarrer` est remplaçable par les tests.
 */
export async function lancerLEntree(
  config: Config,
  ecrire: (ligne: string) => void,
  demarrer: typeof demarrerServeur = demarrerServeur,
): Promise<number> {
  const resolu = resoudreContenu(config);
  if ('erreur' in resolu) {
    ecrire(resolu.erreur);
    return 1;
  }
  if (resolu.repli) {
    ecrire(`contenu : l'exemple (${path.resolve(resolu.dossier)}), aucun contenu monté`);
  }
  const contenus = contenusAuDemarrage(resolu.dossier, ecrire);
  if (contenus === undefined) {
    return 1;
  }
  try {
    const serveur = await demarrer(config, contenus);
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      process.on(signal, () => {
        serveur.app.log.info({ signal }, 'arrêt demandé');
        void serveur.arreter();
      });
    }
    return 0;
  } catch (erreur) {
    // Toute erreur de démarrage s'imprime ici, sans distinguer les cas : un échec d'écoute, que
    // `demarrerServeur` a déjà journalisé, paraît donc deux fois.
    ecrire(erreur instanceof Error ? (erreur.stack ?? String(erreur)) : String(erreur));
    return 1;
  }
}
