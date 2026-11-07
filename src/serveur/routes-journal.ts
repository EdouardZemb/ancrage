/*
 * Les routes du journal de progression d'un cours (ADR-0004) : le téléphone envoie ses événements
 * par lots, et relit ceux de la personne depuis un curseur (les siens, venus d'un autre appareil).
 *
 * Les deux routes sont classées `cours` : `acces/` répond avant elles, 401 sans session et la
 * réponse d'un cours inexistant sans droit de lecture (invariant 1). Elles ne contrôlent aucun
 * droit elles-mêmes (invariant 2). La personne est celle de la session : le message n'a pas le
 * droit d'en désigner une, et `schemaEvenement` refuse tout champ en plus.
 *
 * Les deux routes exigent l'en-tête `x-ancrage-personne` : la personne dont le téléphone envoie la
 * file (R21), ou dont il range le journal lu (R32). Sur un téléphone partagé, une autre personne a
 * pu se connecter entre-temps (un autre onglet, un cookie changé) : la file de l'une ne doit
 * jamais entrer au journal de l'autre, ce qui ne se défait pas (invariant 5), et le journal de
 * l'une ne doit jamais être rangé chez l'autre. Sans cet en-tête, la requête est refusée (400) ;
 * s'il nomme une autre personne que celle de la session, elle est refusée (409 `autre_personne`),
 * sans rien écrire ni rien rendre. Ce contrôle vient après celui des droits : sans droit, la
 * réponse reste celle d'un cours inexistant.
 *
 * Rien n'est journalisé ici : ni événement, ni personne, ni unité. Les réponses de ces
 * gestionnaires ne se mettent jamais en cache.
 */
import type { FastifyPluginAsync } from 'fastify';
import * as z from 'zod';
import { schemaEvenement } from '../domaine/journal/evenement.js';
import { coursAutorise, personneConnectee } from './acces/index.js';
import { refusDeLaPersonne } from './entete-personne.js';
import { type DepotJournal, LOT_MAX, PAGE_MAX } from './journal/depot-journal.js';

export interface OptionsRoutesJournal {
  depot: DepotJournal;
  /** L'heure de réception (`recu_a`) : celle de l'application, jamais celle du message. */
  horloge: () => Date;
}

const SANS_CACHE = 'no-store';
const CLASSEE_COURS = { config: { acces: 'cours' } } as const;
const REQUETE = { erreur: 'requete' };

const corpsEnvoi = z.strictObject({
  evenements: z.array(schemaEvenement).min(1).max(LOT_MAX),
});

// Un entier écrit sans signe, sans zéro en tête, sans exposant : `0`, `12`. Une valeur répétée
// (`depuis=1&depuis=2`) arrive en liste, et est refusée avec le reste.
const FORMAT_NUMERO = /^(0|[1-9]\d*)$/;
const requeteLecture = z.object({
  depuis: z.string().regex(FORMAT_NUMERO).transform(Number).refine(Number.isSafeInteger).default(0),
});

export const routesJournal: FastifyPluginAsync<OptionsRoutesJournal> = async (routes, options) => {
  const { depot, horloge } = options;

  // Après le crochet de contrôle des droits (`acces/`), qui répond avant lui à une requête
  // refusée : ce qui est refusé reste identique à ce qui n'existe pas.
  routes.addHook('preHandler', async (_requete, reponse) => {
    reponse.header('cache-control', SANS_CACHE);
  });

  routes.post('/api/cours/:id/journal', CLASSEE_COURS, async (requete, reponse) => {
    const cours = coursAutorise(requete);
    // La personne attendue, avant de lire le lot.
    const refus = refusDeLaPersonne(requete);
    if (refus !== undefined) {
      return reponse.code(refus[0]).send(refus[1]);
    }
    const { id } = personneConnectee(requete);
    const corps = corpsEnvoi.safeParse(requete.body);
    // Tous les événements du lot sont de ce cours : le droit contrôlé est celui de ce cours.
    if (!corps.success || corps.data.evenements.some((evenement) => evenement.cours !== cours.id)) {
      return reponse.code(400).send(REQUETE);
    }
    return { acceptes: depot.ajouter(id, corps.data.evenements, horloge().toISOString()) };
  });

  routes.get('/api/cours/:id/journal', CLASSEE_COURS, async (requete, reponse) => {
    const cours = coursAutorise(requete);
    const refus = refusDeLaPersonne(requete);
    if (refus !== undefined) {
      return reponse.code(refus[0]).send(refus[1]);
    }
    const lecture = requeteLecture.safeParse(requete.query);
    if (!lecture.success) {
      return reponse.code(400).send(REQUETE);
    }
    const { id } = personneConnectee(requete);
    return depot.lire(id, cours.id, lecture.data.depuis, PAGE_MAX);
  });
};
