/*
 * L'administration, sous `/api/admin` : les personnes, les invitations, les liens de secours, les
 * groupes et les autorisations des cours. Toutes ces routes sont classées `proprietaire`
 * (`acces/`) : pour une autre personne connectée, elles n'existent pas.
 *
 * Le contrôle des droits sur un cours reste dans `acces/`. Ici, seule la règle d'ouverture d'un cours
 * à un sujet (invariant 9) est demandée à ce module, à la création d'une autorisation. Une
 * invitation, elle, ne l'appelle pas : son octroi donne des droits à la personne qui sera créée et
 * des appartenances à des groupes, jamais un droit de groupe.
 *
 * Les identifiants d'un corps de requête qui ne désignent rien (un cours qui n'est pas chargé, une
 * personne ou un groupe inconnus) donnent 400 `requete` ; ceux du chemin, 404 `introuvable`. Les
 * liens ne sont rendus qu'une fois, par la réponse qui les crée, et ne sont jamais journalisés. Les
 * réponses ne se mettent jamais en cache.
 *
 * Le propriétaire peut supprimer le compte d'une personne, jamais le sien ni un autre compte de
 * propriétaire : 409 `proprietaire` (1e-D4). Il voit les passkeys de chaque personne et peut en
 * supprimer une, même la dernière : la personne en recrée une avec un lien (1e-D8). Un lien de
 * secours annule le lien de connexion précédent de la personne (1e-D7).
 */
import type { FastifyPluginAsync } from 'fastify';
import * as z from 'zod';
import type { Autorisation } from '../domaine/acces.js';
import type { Cours } from '../domaine/contenu/modele.js';
import { INTROUVABLE, ouvertureAutoriseePour, personneConnectee } from './acces/index.js';
import type { Base } from './base/base.js';
import { type AutorisationEnregistree, type Depot, estViolationUnicite } from './comptes/depot.js';
import { creerEmetteurDeLiens } from './comptes/liens.js';
import { nomAffichable } from './comptes/routes-auth.js';
import { fermerSession, sessionValide } from './comptes/session.js';
import { supprimerPersonne } from './comptes/suppression.js';

export interface OptionsRoutesAdmin {
  base: Base;
  depot: Depot;
  /** Les cours chargés au démarrage : les droits et les invitations ne portent que sur eux. */
  cours: readonly Cours[];
  urlPublique: string;
  horloge: () => Date;
}

const SANS_CACHE = 'no-store';
const CLASSEE_PROPRIETAIRE = { config: { acces: 'proprietaire' } } as const;
const REQUETE = { erreur: 'requete' };
const NOM_DEJA_PRIS = { erreur: 'nom_deja_pris' };
const PROPRIETAIRE = { erreur: 'proprietaire' };

const NOM_GROUPE_MAX = 60;
const IDENTIFIANTS_MAX = 100;
// Un identifiant de cours (8 caractères) ou un UUID (36) : large, sans rien laisser passer d'énorme.
const identifiant = z.string().min(1).max(64);

const corpsInvitation = z.strictObject({
  groupes: z.array(identifiant).max(IDENTIFIANTS_MAX).optional(),
  cours: z.array(identifiant).max(IDENTIFIANTS_MAX).optional(),
});
const corpsGroupe = z.strictObject({ nom: nomAffichable(NOM_GROUPE_MAX) });
const corpsMembre = z.strictObject({ personne: identifiant });
const corpsAutorisation = z.strictObject({
  cours: identifiant,
  sujet: z.strictObject({ type: z.enum(['personne', 'groupe']), id: identifiant }),
});

export const routesAdmin: FastifyPluginAsync<OptionsRoutesAdmin> = async (routes, options) => {
  const { base, depot, horloge } = options;
  const liens = creerEmetteurDeLiens(depot, options.urlPublique, horloge);
  const coursParId: ReadonlyMap<string, Cours> = new Map(
    options.cours.map((cours) => [cours.id, cours]),
  );

  // Après le crochet de contrôle des droits (`acces/`), qui répond avant lui à une requête
  // refusée : un refus reste identique à la réponse d'une route qui n'existe pas.
  routes.addHook('preHandler', async (_requete, reponse) => {
    reponse.header('cache-control', SANS_CACHE);
  });

  function groupeExiste(id: string): boolean {
    return depot.groupes().some((groupe) => groupe.id === id);
  }

  function sujetExiste(sujet: Autorisation['sujet']): boolean {
    return sujet.type === 'personne'
      ? depot.personne(sujet.id) !== undefined
      : groupeExiste(sujet.id);
  }

  function versAutorisation(autorisation: AutorisationEnregistree) {
    return {
      id: autorisation.id,
      cours: autorisation.cours,
      // Nul si le cours n'est plus chargé : le droit reste visible, et on peut le retirer.
      coursTitre: coursParId.get(autorisation.cours)?.titre ?? null,
      sujet: { type: autorisation.sujet.type, id: autorisation.sujet.id },
    };
  }

  // --- Personnes ---

  routes.get('/api/admin/personnes', CLASSEE_PROPRIETAIRE, async () => {
    const autorisations = depot.autorisationsAvecIdentifiant();
    const instant = horloge();
    return depot.personnes().map((personne) => ({
      id: personne.id,
      nomAffiche: personne.nomAffiche,
      proprietaire: personne.proprietaire,
      groupes: depot.groupesDe(personne.id),
      // Les droits qu'elle a elle-même, pas ceux que ses groupes lui donnent.
      droits: autorisations
        .filter(({ sujet }) => sujet.type === 'personne' && sujet.id === personne.id)
        .map(({ cours }) => cours),
      nbAppareils: depot.sessionsDe(personne.id).filter((s) => sessionValide(s, instant)).length,
      // De quoi choisir la clé à retirer : jamais la clé publique ni le compteur (1e-D8).
      passkeys: depot.passkeysDe(personne.id).map((passkey) => ({
        id: passkey.id,
        appareil: passkey.appareil,
        creeLe: passkey.creeLe,
        utiliseLe: passkey.utiliseLe,
      })),
    }));
  });

  routes.post('/api/admin/personnes/:id/lien', CLASSEE_PROPRIETAIRE, async (requete, reponse) => {
    const { id } = requete.params as { id: string };
    if (depot.personne(id) === undefined) {
      return reponse.code(404).send(INTROUVABLE);
    }
    return { lien: liens.connexion(id, personneConnectee(requete).id) };
  });

  // Le compte d'un propriétaire, le sien compris, est refusé (1e-D4).
  routes.delete('/api/admin/personnes/:id', CLASSEE_PROPRIETAIRE, async (requete, reponse) => {
    const { id } = requete.params as { id: string };
    const resultat = supprimerPersonne(base, id, horloge(), (message) => requete.log.warn(message));
    if (resultat === 'introuvable') {
      return reponse.code(404).send(INTROUVABLE);
    }
    if (resultat === 'proprietaire') {
      return reponse.code(409).send(PROPRIETAIRE);
    }
    // Ni l'identifiant ni le nom de la personne au journal (1e-D10).
    requete.log.info({ par: 'proprietaire' }, 'compte supprimé');
    return reponse.code(204).send();
  });

  routes.delete(
    '/api/admin/personnes/:id/sessions',
    CLASSEE_PROPRIETAIRE,
    async (requete, reponse) => {
      const { id } = requete.params as { id: string };
      if (depot.personne(id) === undefined) {
        return reponse.code(404).send(INTROUVABLE);
      }
      depot.supprimerSessionsDe(id);
      if (id === personneConnectee(requete).id) {
        // Le propriétaire se déconnecte lui-même : son cookie part avec sa session.
        fermerSession(requete, reponse);
      }
      return reponse.code(204).send();
    },
  );

  // Même la dernière passkey : contrairement à la personne (`DELETE /api/moi/passkeys/:id`), le
  // propriétaire peut retirer une clé perdue ou volée, puis donner un lien de secours (1e-D8). Une
  // clé qui n'est pas à cette personne répond comme une clé inconnue.
  routes.delete(
    '/api/admin/personnes/:id/passkeys/:passkey',
    CLASSEE_PROPRIETAIRE,
    async (requete, reponse) => {
      const { id, passkey } = requete.params as { id: string; passkey: string };
      if (!depot.supprimerPasskey(passkey, id)) {
        return reponse.code(404).send(INTROUVABLE);
      }
      return reponse.code(204).send();
    },
  );

  // --- Invitations ---

  routes.post('/api/admin/invitations', CLASSEE_PROPRIETAIRE, async (requete, reponse) => {
    // Sans corps, une invitation sans octroi.
    const corps = corpsInvitation.safeParse(requete.body === undefined ? {} : requete.body);
    if (!corps.success) {
      return reponse.code(400).send(REQUETE);
    }
    const groupes = [...new Set(corps.data.groupes)];
    const cours = [...new Set(corps.data.cours)];
    const groupesConnus = new Set(depot.groupes().map((groupe) => groupe.id));
    if (!groupes.every((id) => groupesConnus.has(id)) || !cours.every((id) => coursParId.has(id))) {
      return reponse.code(400).send(REQUETE);
    }
    return { lien: liens.invitation(personneConnectee(requete).id, { groupes, cours }) };
  });

  // --- Groupes ---

  routes.get('/api/admin/groupes', CLASSEE_PROPRIETAIRE, async () =>
    depot.groupes().map(({ id, nom }) => ({ id, nom })),
  );

  routes.post('/api/admin/groupes', CLASSEE_PROPRIETAIRE, async (requete, reponse) => {
    const corps = corpsGroupe.safeParse(requete.body);
    if (!corps.success) {
      return reponse.code(400).send(REQUETE);
    }
    try {
      const { id, nom } = depot.creerGroupe(corps.data.nom);
      return reponse.code(201).send({ id, nom });
    } catch (erreur) {
      if (estViolationUnicite(erreur)) {
        return reponse.code(409).send(NOM_DEJA_PRIS);
      }
      throw erreur;
    }
  });

  routes.post('/api/admin/groupes/:id/membres', CLASSEE_PROPRIETAIRE, async (requete, reponse) => {
    const { id } = requete.params as { id: string };
    if (!groupeExiste(id)) {
      return reponse.code(404).send(INTROUVABLE);
    }
    const corps = corpsMembre.safeParse(requete.body);
    if (!corps.success || depot.personne(corps.data.personne) === undefined) {
      return reponse.code(400).send(REQUETE);
    }
    depot.ajouterMembre(id, corps.data.personne);
    return reponse.code(204).send();
  });

  routes.delete(
    '/api/admin/groupes/:id/membres/:personne',
    CLASSEE_PROPRIETAIRE,
    async (requete, reponse) => {
      const { id, personne } = requete.params as { id: string; personne: string };
      if (!depot.retirerMembre(id, personne)) {
        return reponse.code(404).send(INTROUVABLE);
      }
      return reponse.code(204).send();
    },
  );

  // --- Autorisations ---

  routes.get('/api/admin/autorisations', CLASSEE_PROPRIETAIRE, async () =>
    depot.autorisationsAvecIdentifiant().map(versAutorisation),
  );

  routes.post('/api/admin/autorisations', CLASSEE_PROPRIETAIRE, async (requete, reponse) => {
    const corps = corpsAutorisation.safeParse(requete.body);
    if (!corps.success) {
      return reponse.code(400).send(REQUETE);
    }
    const { sujet } = corps.data;
    const cours = coursParId.get(corps.data.cours);
    if (cours === undefined || !sujetExiste(sujet)) {
      return reponse.code(400).send(REQUETE);
    }
    // Un cours « à vérifier » sans dérogation ne s'ouvre pas à un groupe (invariant 9).
    const refus = ouvertureAutoriseePour(cours, sujet);
    if (refus !== undefined) {
      return reponse.code(409).send({ erreur: refus });
    }
    return versAutorisation(depot.autoriser({ cours: cours.id, sujet }));
  });

  routes.delete('/api/admin/autorisations/:id', CLASSEE_PROPRIETAIRE, async (requete, reponse) => {
    const { id } = requete.params as { id: string };
    if (!depot.retirerAutorisation(id)) {
      return reponse.code(404).send(INTROUVABLE);
    }
    return reponse.code(204).send();
  });
};
