import type { ErreurContenu } from './erreurs.js';
import { estIdentifiant } from './identifiants.js';

/** Le nom d'`ids.lock`, à la racine du dossier de contenu : la seule écriture de ce nom. */
export const FICHIER_VERROU = 'ids.lock';
const SUFFIXE_RETIRE = ' retiré';

export interface EntreeVerrou {
  id: string;
  retire: boolean;
  /** Numéro de ligne, à partir de 1. */
  ligne: number;
}

function erreurVerrou(ligne: number, message: string): ErreurContenu {
  return { fichier: FICHIER_VERROU, lieu: `ligne ${ligne}`, message };
}

/**
 * Lit `ids.lock` : une ligne par identifiant, `<id>` ou `<id> retiré`. Les lignes vides et celles
 * qui commencent par `#` sont ignorées. En cas de doublon, la première ligne est gardée.
 */
export function lireVerrou(texte: string): { entrees: EntreeVerrou[]; erreurs: ErreurContenu[] } {
  const entrees: EntreeVerrou[] = [];
  const erreurs: ErreurContenu[] = [];
  const parId = new Map<string, EntreeVerrou>();

  texte.split(/\r?\n/).forEach((contenu, index) => {
    const ligne = index + 1;
    const nette = contenu.trim();
    if (nette === '' || nette.startsWith('#')) return;

    const retire = contenu.endsWith(SUFFIXE_RETIRE);
    const id = retire ? contenu.slice(0, -SUFFIXE_RETIRE.length) : contenu;
    if (!estIdentifiant(id)) {
      erreurs.push(
        erreurVerrou(
          ligne,
          `Ligne mal formée : attendu « <identifiant> » ou « <identifiant> retiré », sans espace avant ni après, avec un identifiant de 8 caractères.`,
        ),
      );
      return;
    }

    const existante = parId.get(id);
    if (existante) {
      erreurs.push(
        erreurVerrou(
          ligne,
          `L'identifiant ${id} figure déjà dans ids.lock (ligne ${existante.ligne}).`,
        ),
      );
      return;
    }

    const entree = { id, retire, ligne };
    parId.set(id, entree);
    entrees.push(entree);
  });

  return { entrees, erreurs };
}

/**
 * Confronte les identifiants du contenu au verrou. `idsDuContenu` associe chaque identifiant à
 * son lieu, au format `fichier:lieu`.
 */
export function verifierVerrou(
  idsDuContenu: ReadonlyMap<string, string>,
  verrou: readonly EntreeVerrou[],
): ErreurContenu[] {
  const erreurs: ErreurContenu[] = [];
  const parId = new Map(verrou.map((entree) => [entree.id, entree]));

  for (const [id, emplacement] of idsDuContenu) {
    const separateur = emplacement.indexOf(':');
    const fichier = separateur === -1 ? emplacement : emplacement.slice(0, separateur);
    const lieu = separateur === -1 ? '' : emplacement.slice(separateur + 1);
    const entree = parId.get(id);

    if (!entree) {
      erreurs.push({
        fichier,
        lieu,
        message: `L'identifiant ${id} est absent d'ids.lock : l'y ajouter avec « corepack pnpm contenus:verrouiller » avant de le publier.`,
      });
    } else if (entree.retire) {
      erreurs.push({
        fichier,
        lieu,
        message: `L'identifiant ${id} est marqué retiré dans ids.lock : il ne peut pas être réutilisé.`,
      });
    }
  }

  for (const entree of verrou) {
    if (!entree.retire && !idsDuContenu.has(entree.id)) {
      erreurs.push(
        erreurVerrou(
          entree.ligne,
          `L'identifiant ${entree.id} a disparu sans être marqué retiré : s'il est supprimé à dessein, ajouter « retiré » à sa ligne.`,
        ),
      );
    }
  }

  return erreurs;
}

/**
 * Compare le verrou de la base (`main`) à celui de la branche : il ne fait que grandir. Une ligne
 * de la base ne disparaît pas et un retrait n'est pas annulé.
 */
export function comparerVerrous(
  base: readonly EntreeVerrou[],
  courant: readonly EntreeVerrou[],
): ErreurContenu[] {
  const erreurs: ErreurContenu[] = [];
  const parId = new Map(courant.map((entree) => [entree.id, entree]));

  for (const ancienne of base) {
    const actuelle = parId.get(ancienne.id);
    if (!actuelle) {
      erreurs.push(
        erreurVerrou(
          ancienne.ligne,
          `La ligne de l'identifiant ${ancienne.id} (ligne ${ancienne.ligne} de la base) a disparu d'ids.lock : le verrou ne fait que grandir.`,
        ),
      );
    } else if (ancienne.retire && !actuelle.retire) {
      erreurs.push(
        erreurVerrou(
          actuelle.ligne,
          `L'identifiant ${ancienne.id} était retiré dans la base et ne l'est plus : le retrait est définitif, il ne peut pas être annulé.`,
        ),
      );
    }
  }

  return erreurs;
}

/** Ajoute une ligne par identifiant à la fin du verrou, sans toucher au texte existant. */
export function ajouterAuVerrou(texte: string, ids: readonly string[]): string {
  const debut = texte === '' || texte.endsWith('\n') ? texte : `${texte}\n`;
  return debut + ids.map((id) => `${id}\n`).join('');
}
