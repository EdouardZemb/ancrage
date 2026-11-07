import type { ErreurContenu } from '../../domaine/contenu/erreurs.js';

/** `texte` sur une seule ligne : chaque saut de ligne, avec ses espaces, devient une espace. */
export function surUneLigne(texte: string): string {
  return texte.replace(/\s*\r?\n\s*/g, ' ');
}

/**
 * `fichier lieu : message`, sur une seule ligne. Les messages d'analyse ne citent jamais le texte
 * d'un cours (invariant 1) et cette fonction n'y change rien : le journal de démarrage et
 * `pnpm contenus:verifier` l'emploient tous deux.
 */
export function formaterErreur(erreur: ErreurContenu): string {
  const lieu = erreur.lieu === '' ? '' : ` ${erreur.lieu}`;
  return surUneLigne(`${erreur.fichier}${lieu} : ${erreur.message}`);
}
