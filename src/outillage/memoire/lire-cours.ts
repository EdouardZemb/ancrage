import { type CoursPrepare, preparerCours } from '../../domaine/cours/prepare.js';
import { versCoursServi } from '../../domaine/cours/servi.js';
import { chargerContenus } from '../../serveur/contenus/chargeur.js';

/**
 * Le cours `id` du dossier de contenu, préparé comme le client le prépare ; `undefined` si le
 * contenu est illisible ou si le cours n'y est pas. Commun aux outils du poste de la mémoire (M3).
 */
export function lireCours(dossier: string, id: string): CoursPrepare | undefined {
  const lu = chargerContenus(dossier);
  if (lu.erreurs.length > 0) return undefined;
  const cours = lu.cours.find((candidat) => candidat.id === id);
  return cours === undefined ? undefined : preparerCours(versCoursServi(cours));
}
