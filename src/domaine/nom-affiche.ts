/*
 * La règle d'un nom saisi : le nom affiché d'une personne, le nom d'un groupe. Une seule règle,
 * que le serveur applique à chaque requête et le client avant de créer la passkey : un nom refusé
 * après la cérémonie WebAuthn laisserait sur le téléphone une passkey sans compte.
 *
 * Un nom compte de 1 à `longueurMax` points de code après `trim`. Il ne contient aucun caractère
 * qui permettrait de le déguiser dans les listes (un nom qui s'affiche vide, deux noms qui
 * s'affichent pareil, un nom qui renverse le texte qui le suit) :
 * - les caractères de contrôle (Cc), les séparateurs de ligne (Zl) et de paragraphe (Zp) ;
 * - les caractères de mise en forme (Cf) : contrôles bidirectionnels, marques de direction (LRM,
 *   RLM, ALM), espace sans largeur, gluon de mots, trait d'union conditionnel, U+FEFF… Sauf
 *   l'antiliant sans largeur (U+200C), dont certaines écritures ont besoin, et le liant sans
 *   largeur (U+200D), qui compose les émojis ;
 * - les remplissages hangul, qui s'affichent vides (U+115F, U+1160, U+3164, U+FFA0), et le
 *   séparateur de voyelles mongol (U+180E).
 *
 * Ce module est pur : le client l'importe aussi. Les caractères y sont écrits par leur échappement,
 * jamais tels quels.
 */

/** La longueur maximale d'un nom affiché, en points de code. */
export const NOM_AFFICHE_MAX = 40;

const CARACTERES_INTERDITS =
  /(?![\u{200C}\u{200D}])[\p{Cc}\p{Zl}\p{Zp}\p{Cf}\u{115F}\u{1160}\u{180E}\u{3164}\u{FFA0}]/u;

/** Le nom après `trim`, s'il a de 1 à `longueurMax` points de code et aucun caractère interdit. */
export function nomValide(brut: string, longueurMax: number): string | undefined {
  const nom = brut.trim();
  const longueur = [...nom].length;
  if (longueur < 1 || longueur > longueurMax || CARACTERES_INTERDITS.test(nom)) {
    return undefined;
  }
  return nom;
}

/** Le nom affiché après `trim`, s'il est valide ; `undefined` sinon. */
export function nomAfficheValide(brut: string): string | undefined {
  return nomValide(brut, NOM_AFFICHE_MAX);
}
