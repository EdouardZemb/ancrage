/*
 * Ce que « Mes appareils » et l'administration disent d'un appareil, écrit une fois (1f-D4) : son
 * nom, et la ligne « depuis … · dernière activité … ». L'écran de la personne passe les textes de
 * sa langue ; l'administration, qui est en français seulement, passe `textes.fr`.
 */
import { formaterDate } from '../composants.js';
import type { Langue } from '../textes.js';

/** Le type d'appareil vient du serveur ; seul « autre » est un mot à traduire (`autre`). */
export function nomAppareil(appareil: string, autre: string): string {
  return appareil === 'autre' ? autre : appareil;
}

/**
 * « Depuis le … · Dernière activité … » : la dernière activité est « jamais utilisée » quand
 * `utiliseLe` est `null` (une passkey qui n'a pas encore servi). Du texte seul, sans élément : c'est
 * l'appelant qui pose la balise (un `<p>` ou un `<span>`) et sa classe.
 */
export function DetailAppareil(props: {
  creeLe: string;
  utiliseLe: string | null;
  langue: Langue;
  textes: { depuis: string; derniere_activite: string; jamais_utilisee: string };
}) {
  const { creeLe, utiliseLe, langue, textes } = props;
  return (
    <>
      {textes.depuis} {formaterDate(creeLe, langue)} · {textes.derniere_activite}{' '}
      {utiliseLe === null ? textes.jamais_utilisee : formaterDate(utiliseLe, langue)}
    </>
  );
}
