import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DOSSIER_DE_CONTENU_PAR_DEFAUT } from './dossiers.js';

const crees: string[] = [];

/** Le dossier du contenu sous `racine` : celui que la CLI de contenu lit par défaut. */
export function dossierDuContenu(racine: string): string {
  return path.join(racine, ...DOSSIER_DE_CONTENU_PAR_DEFAUT.split('/'));
}

/**
 * Écrit `fichiers` (chemins relatifs au dossier du contenu, avec `/`) dans le dossier du contenu
 * d'une racine temporaire `<tmp>` (`dossierDuContenu`), et renvoie `<tmp>`, qui joue le rôle de la
 * racine du dépôt. À défaire par `supprimerDepotsTemporaires`.
 */
export function creerDepotTemporaire(fichiers: ReadonlyMap<string, string>): string {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'ancrage-contenus-'));
  crees.push(racine);
  for (const [chemin, texte] of fichiers) {
    const cible = path.join(dossierDuContenu(racine), ...chemin.split('/'));
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, texte);
  }
  return racine;
}

/** Un lien symbolique en `lien` vers `cible` ; `false` si le système n'en permet pas (EPERM). */
export function creerLien(cible: string, lien: string): boolean {
  try {
    fs.symlinkSync(cible, lien);
    return true;
  } catch (erreur) {
    if ((erreur as NodeJS.ErrnoException).code === 'EPERM') return false;
    throw erreur;
  }
}

export function supprimerDepotsTemporaires(): void {
  for (const racine of crees.splice(0)) {
    fs.rmSync(racine, { recursive: true, force: true });
  }
}
