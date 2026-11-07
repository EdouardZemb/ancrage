/*
 * Le contenu des cours sur l'appareil (décision 11 du lot 1d) : ce que l'API a servi, rangé par
 * personne dans IndexedDB, jamais dans le cache du service worker. Il permet de réviser hors
 * ligne.
 *
 * Un cours dont le droit est retiré ou suspendu s'oublie (`oublierCours`, décision 13) : son
 * contenu, ses événements et son curseur (avec sa note des envois) disparaissent, mais pas sa file
 * d'envoi, pour ne perdre aucune révision.
 */
import type { CoursServi } from '../../domaine/cours/servi.js';
import type { CoursResume } from '../api.js';
import type { BaseLocale } from './base-locale.js';

export async function enregistrerCours(
  base: BaseLocale,
  personne: string,
  cours: CoursServi,
): Promise<void> {
  await base.put('cours', { personne, id: cours.id, contenu: cours });
}

/**
 * La copie rangée d'un cours, telle quelle : une version antérieure de l'application a pu la
 * ranger sous une autre forme. À contrôler (`coursServiUtilisable`) avant de l'afficher.
 */
export async function coursLocal(base: BaseLocale, personne: string, id: string): Promise<unknown> {
  return (await base.get('cours', [personne, id]))?.contenu;
}

export async function enregistrerListe(
  base: BaseLocale,
  personne: string,
  liste: CoursResume[],
): Promise<void> {
  await base.put('listes', { personne, liste });
}

/** La liste des cours de la personne telle qu'on l'a gardée, ou `undefined` si l'on n'en a pas. */
export async function listeLocale(
  base: BaseLocale,
  personne: string,
): Promise<CoursResume[] | undefined> {
  return (await base.get('listes', personne))?.liste;
}

/**
 * Oublie un cours : son contenu, ses événements, son curseur (et sa note des envois, rangée avec
 * lui), et son entrée dans la liste locale (le titre d'un cours dont la personne n'a plus le droit
 * ne reste pas affiché). **Pas sa file d'envoi** : les réponses en attente survivent et partent
 * quand le droit revient.
 */
export async function oublierCours(base: BaseLocale, personne: string, id: string): Promise<void> {
  const tx = base.transaction(['cours', 'evenements', 'curseurs', 'listes'], 'readwrite');
  const evenements = tx.objectStore('evenements');
  const listes = tx.objectStore('listes');

  const effacerLesEvenements = async () => {
    const cles = await evenements.index('par_cours').getAllKeys([personne, id]);
    await Promise.all(cles.map((cle) => evenements.delete(cle)));
  };
  const retirerDeLaListe = async () => {
    const locale = await listes.get(personne);
    if (locale?.liste.some((cours) => cours.id === id)) {
      await listes.put({ personne, liste: locale.liste.filter((cours) => cours.id !== id) });
    }
  };

  await Promise.all([
    tx.objectStore('cours').delete([personne, id]),
    tx.objectStore('curseurs').delete([personne, id]),
    effacerLesEvenements(),
    retirerDeLaListe(),
    tx.done,
  ]);
}
