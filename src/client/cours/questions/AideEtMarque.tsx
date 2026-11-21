/*
 * Ce que montre un élément : l'étiquette « schwierig » d'un rebelle (M6), et une aide
 * tirée du contenu, jamais avant qu'il ait cherché. Les questions de « Heute » et des onglets, et la
 * liste de Fortschritt, les posent de la même façon : un seul composant (T2-D10). Le texte vient du
 * cours : Preact l'échappe.
 */
import type { AideDeCarte } from '../../../domaine/cartes/unites.js';
import { useCours } from '../contexte-cours.js';

/** L'étiquette de la classe `meta` ; `bloc` la pose sur sa propre ligne, au-dessus d'une question. */
export function MarqueDeRebelle(props: { bloc?: boolean }) {
  const { t } = useCours();
  const marque = <span class="meta">{t.rebelle_marque}</span>;
  return props.bloc ? <p class="rebelle">{marque}</p> : marque;
}

/** L'aide d'un élément : son texte sous « Merkhilfe », puis la carte qu'on confond avec lui. */
export function AideDeLElement(props: { aide: AideDeCarte | undefined }) {
  const { t } = useCours();
  const { aide } = props;
  // Un texte vide ou fait d'espaces (une `note` ou une `correction` que le schéma admet) n'est pas
  // une aide.
  const texte = aide?.texte?.trim() ? aide.texte : undefined;
  if (aide === undefined || (texte === undefined && aide.confusion === undefined)) return null;
  return (
    <div class="aide" role="status">
      <b class="kind">{t.aide_titre}</b>
      {texte !== undefined && <p>{texte}</p>}
      {aide.confusion !== undefined && (
        <p class="muted">
          {t.aide_confusion} <b>{aide.confusion.recto}</b> – {aide.confusion.verso}
        </p>
      )}
    </div>
  );
}
