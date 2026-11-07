import path from 'node:path';
import type { Cours } from '../../domaine/contenu/modele.js';
import { type CoursServi, versCoursServi } from '../../domaine/cours/servi.js';
import { chargerContenus } from './chargeur.js';

/*
 * Le cours d'exemple, lu sur le disque comme le démarrage le lit, pour les tests qui lisaient le
 * vrai cours (S1-D6) : `exemple-contenu/` est chargé une fois par fichier de test, au premier appel,
 * et son cours `kueche` se prend tel que le chargeur le résout, ou tel que l'API le sert
 * (`versCoursServi`). Exclu de la construction, comme tout `*.fixture.ts`.
 */

/** Le dossier du cours d'exemple, celui que sert le repli hors de la prod (S1-D3). */
export const DOSSIER_EXEMPLE = path.resolve(import.meta.dirname, '../../../exemple-contenu');

let charge: Cours | undefined;

/** Le cours `kueche`, tel que le chargeur le résout. Un exemple en erreur arrête le test. */
export function coursDExemple(): Cours {
  if (charge === undefined) {
    const { cours, erreurs } = chargerContenus(DOSSIER_EXEMPLE);
    if (erreurs.length > 0) {
      throw new Error(
        `exemple-contenu/ a ${erreurs.length} erreur(s) : ${JSON.stringify(erreurs)}`,
      );
    }
    charge = cours.find((c) => c.dossier === 'kueche');
    if (charge === undefined) throw new Error('cours kueche introuvable dans exemple-contenu/');
  }
  return charge;
}

/** Le cours `kueche` tel que l'API le sert (`GET /api/cours/:id`). */
export function coursDExempleServi(): CoursServi {
  return versCoursServi(coursDExemple());
}
