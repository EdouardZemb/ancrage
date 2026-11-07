/*
 * Les routes des cours (ADR-0001) : la liste des cours visibles, et le contenu d'un cours. Le
 * contrôle des droits est fait avant elles par `acces/`, d'après leur classement : elles n'en font
 * aucun elles-mêmes. Le contenu d'un cours ne sort que par `GET /api/cours/:id` (invariant 3).
 *
 * Le téléphone nomme, par l'en-tête `x-ancrage-personne`, la personne sous laquelle il rangera la
 * liste ou le contenu (R36). S'il en nomme une autre que celle de la session, rien n'est rendu
 * (409 `autre_personne`), après le contrôle des droits. Sans en-tête, aucun contrôle : un client
 * précaché d'une version précédente ne l'envoie pas.
 */
import type { FastifyPluginAsync } from 'fastify';
import type { Cours } from '../domaine/contenu/modele.js';
import { versCoursServi } from '../domaine/cours/servi.js';
import { coursAutorise, coursVisiblesPour } from './acces/index.js';
import { AUTRE_PERSONNE, autrePersonneNommee } from './entete-personne.js';

// Ce qui est servi dépend des droits, relus à chaque requête : aucun cache ne doit le garder.
const SANS_CACHE = 'no-store';

/** Ce que la liste dit d'un cours. */
function resume(cours: Cours) {
  return { id: cours.id, titre: cours.titre, langue: cours.langue };
}

export const routesCours: FastifyPluginAsync = async (routes) => {
  routes.get('/api/cours', { config: { acces: 'connecte' } }, async (requete, reponse) => {
    reponse.header('cache-control', SANS_CACHE);
    if (autrePersonneNommee(requete)) return reponse.code(409).send(AUTRE_PERSONNE);
    return coursVisiblesPour(requete).map(resume);
  });

  routes.get('/api/cours/:id', { config: { acces: 'cours' } }, async (requete, reponse) => {
    reponse.header('cache-control', SANS_CACHE);
    const cours = coursAutorise(requete);
    if (autrePersonneNommee(requete)) return reponse.code(409).send(AUTRE_PERSONNE);
    return versCoursServi(cours);
  });
};
