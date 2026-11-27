import type { ExplicationDeDistracteur } from '../../../domaine/feuilles/explications.js';
import { useCours } from '../contexte-cours.js';

/**
 * Le bloc des explications d'un élément (M10-C7) : rien s'il n'y a rien à dire. D'abord ce qui est
 * faux (le choix, puis les distracteurs), puis la bonne réponse. Le texte vient du cours : Preact
 * l'échappe.
 */
export function Explication(props: {
  choix?: string;
  distracteurs?: readonly ExplicationDeDistracteur[];
  reponse?: string;
  /** `role="status"` : l'explication répond à un geste seul (M10-C7). */
  annonce?: boolean;
}) {
  const { t } = useCours();
  const { choix, distracteurs = [], reponse, annonce } = props;
  if (choix === undefined && distracteurs.length === 0 && reponse === undefined) return null;
  return (
    <div class="explication" role={annonce ? 'status' : undefined}>
      <b class="kind">{t.explication_titre}</b>
      {choix !== undefined && <p>{choix}</p>}
      {distracteurs.map(({ distracteur, texte }) => (
        <p key={distracteur}>
          <b>{distracteur}</b> – {texte}
        </p>
      ))}
      {reponse !== undefined && <p>{reponse}</p>}
    </div>
  );
}
