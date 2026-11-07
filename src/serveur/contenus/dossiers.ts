/**
 * Le dossier du contenu, quand aucune option de la CLI de contenu ne le donne : le cours d'exemple,
 * que le dépôt porte, relatif à la racine du dépôt, avec `/` (S3-D4, ADR-0011). Le cours d'une
 * instance vit dans un autre dépôt et se désigne par `--contenu`. Il n'y a pas de dossier des
 * instantanés par défaut : `reference` exige `--references`.
 */
export const DOSSIER_DE_CONTENU_PAR_DEFAUT = 'exemple-contenu';
