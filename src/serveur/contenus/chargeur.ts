import fs from 'node:fs';
import path from 'node:path';
import { analyserContenus } from '../../domaine/contenu/analyse.js';
import type { ErreurContenu } from '../../domaine/contenu/erreurs.js';
import type { ResultatContenus } from '../../domaine/contenu/modele.js';

/** Un lien symbolique dans un dossier que l'on parcourt : il n'est jamais suivi (ni ignoré). */
export class LienSymboliqueRefuse extends Error {
  constructor(readonly chemin: string) {
    super(`lien symbolique refusé : ${chemin}`);
  }

  /** L'erreur de contenu qui le dit, au chemin du lien. */
  versErreur(): ErreurContenu {
    return {
      fichier: this.chemin,
      lieu: '',
      message: 'lien symbolique refusé : un dossier de contenus ne contient que des fichiers.',
    };
  }
}

/** `true` si `chemin` existe et est un dossier. */
export function estUnDossier(chemin: string): boolean {
  return fs.existsSync(chemin) && fs.statSync(chemin).isDirectory();
}

/**
 * Chemins relatifs à `dossier`, avec `/` comme séparateur (y compris sous Windows), triés. Un lien
 * symbolique lève `LienSymboliqueRefuse` : il ne serait ni lu ni compté, et un fichier de cours
 * pourrait ainsi échapper au contrôle. Les noms d'`exclure` sont des entrées de la racine de
 * `dossier`, sautées sans être lues.
 */
export function listerFichiers(dossier: string, exclure: readonly string[] = []): string[] {
  const chemins: string[] = [];
  const parcourir = (relatif: string): void => {
    const entrees = fs.readdirSync(path.join(dossier, relatif), { withFileTypes: true });
    for (const entree of entrees.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
      if (relatif === '' && exclure.includes(entree.name)) continue;
      const chemin = relatif === '' ? entree.name : `${relatif}/${entree.name}`;
      if (entree.isSymbolicLink()) throw new LienSymboliqueRefuse(chemin);
      if (entree.isDirectory()) parcourir(chemin);
      else if (entree.isFile()) chemins.push(chemin);
    }
  };
  parcourir('');
  return chemins;
}

/** Lit tous les fichiers de `dossier`, récursivement, en UTF-8 et sans rien normaliser. */
export function lireFichiersContenus(dossier: string): Map<string, string> {
  const fichiers = new Map<string, string>();
  for (const chemin of listerFichiers(dossier)) {
    fichiers.set(chemin, fs.readFileSync(path.join(dossier, chemin), 'utf8'));
  }
  return fichiers;
}

/** Une erreur si `dossier` n'est pas un dossier, sinon `undefined`. */
export function erreurDossierAbsent(dossier: string): ErreurContenu | undefined {
  if (estUnDossier(dossier)) return undefined;
  return {
    fichier: '.',
    lieu: '',
    message: `dossier de contenus introuvable : ${path.resolve(dossier)}`,
  };
}

/** Lit et analyse `dossier` (en pratique `<racine>/contenus`). */
export function chargerContenus(dossier: string): ResultatContenus {
  const absent = erreurDossierAbsent(dossier);
  if (absent) return { cours: [], erreurs: [absent], identifiants: new Map() };
  try {
    return analyserContenus(lireFichiersContenus(dossier));
  } catch (erreur) {
    if (!(erreur instanceof LienSymboliqueRefuse)) throw erreur;
    return { cours: [], erreurs: [erreur.versErreur()], identifiants: new Map() };
  }
}
