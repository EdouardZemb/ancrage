/*
 * La base locale de la page : une seule connexion IndexedDB, ouverte au premier besoin et partagée
 * par tous les écrans. Le blocage des synchronisations (`bloquerSynchronisations`) et leur suivi
 * sont attachés à cet objet : deux connexions ne se verraient pas l'une l'autre.
 */
import { type BaseLocale, ouvrirBaseLocale } from './base-locale.js';

let ouverture: Promise<BaseLocale> | undefined;

export function baseDeLaPage(): Promise<BaseLocale> {
  if (ouverture === undefined) {
    ouverture = ouvrirBaseLocale();
    // Une ouverture qui échoue sera retentée au besoin suivant.
    ouverture.catch(() => {
      ouverture = undefined;
    });
  }
  return ouverture;
}
