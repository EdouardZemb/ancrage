import * as z from 'zod';
import { CLES_DE_NOTICE, estUneCibleAdmise, type ValeursDeNotice } from '../notice.js';
import { date } from './schemas.js';

/*
 * `notice.yaml`, à la racine d'un contenu (S1-D7) : les valeurs de la notice de confidentialité de
 * l'instance. Il est obligatoire. Son schéma est strict, comme ceux des cours : chaque langue porte
 * exactement les clés de `CLES_DE_NOTICE`, et rien d'autre.
 */

/** Le nom du fichier, à la racine du contenu. */
export const FICHIER_NOTICE = 'notice.yaml';

/** Une valeur peut être vide : la puce ou le paragraphe qu'elle remplit disparaît. */
const valeursDUneLangue = z.strictObject(
  Object.fromEntries(CLES_DE_NOTICE.map((cle) => [cle, z.string()])) as Record<
    (typeof CLES_DE_NOTICE)[number],
    z.ZodString
  >,
);

const lien = z.strictObject({
  texte: z.string().min(1, { error: 'Le texte est vide.' }),
  cible: z.string().refine(estUneCibleAdmise, {
    error: 'Cible non admise : un lien commence par https:// ou par mailto:.',
  }),
});

export const schemaDeNotice = z.strictObject({
  format: z.literal(1),
  date,
  fr: valeursDUneLangue,
  de: valeursDUneLangue,
  liens: z.array(lien),
});

export type NoticeEcrite = z.infer<typeof schemaDeNotice>;

/** Les valeurs telles que l'application les sert, à partir de la notice écrite. */
export function valeursDeNotice(ecrite: NoticeEcrite): ValeursDeNotice {
  return {
    date: ecrite.date,
    valeurs: { fr: ecrite.fr, de: ecrite.de },
    liens: ecrite.liens.map(({ texte, cible }) => ({ texte, cible })),
  };
}
