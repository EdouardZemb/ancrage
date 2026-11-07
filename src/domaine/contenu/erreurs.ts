/** Une erreur de contenu, localisée pour que la personne qui écrit le contenu la retrouve. */
export interface ErreurContenu {
  /** Chemin relatif au dossier de contenu, avec `/` comme séparateur (par exemple `ids.lock`). */
  fichier: string;
  /** Chemin dans le fichier (`cartes[12].recto`) ou ligne (`ligne 14`). */
  lieu: string;
  /** Message en français. */
  message: string;
}
