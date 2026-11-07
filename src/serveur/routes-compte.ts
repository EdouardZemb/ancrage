/*
 * Le compte de la personne connectée, sous `/api/moi` (ADR-0002) : son profil, ses appareils (les
 * sessions ouvertes et les passkeys enregistrées) et un lien pour en ajouter un. Toutes ces routes
 * sont classées `connecte` (`acces/`), et chacune n'agit que sur la personne de la session : une
 * session ou une passkey d'une autre personne répond comme une qui n'existe pas. Une personne peut
 * aussi supprimer son compte (`DELETE /api/moi`, 1e-D4), sauf le propriétaire, et télécharger ses
 * données (`GET /api/moi/export`, 1e-D5).
 *
 * La suppression du compte exige l'en-tête `x-ancrage-personne` (1e-R13) : la personne dont l'écran
 * est ouvert. Sur un téléphone partagé, une autre personne a pu se connecter entre-temps (un autre
 * onglet) : sans lui, la suppression frapperait le compte de la session, qui n'est plus celui que
 * la personne a sous les yeux, et ne se défait pas. Sans l'en-tête, la requête est refusée (400) ;
 * s'il nomme une autre personne que celle de la session, elle l'est aussi (409 `autre_personne`),
 * avant toute suppression. La route est neuve dans ce lot : aucun client d'avant ne l'appelle, et
 * l'en-tête obligatoire ne casse rien (invariant 8).
 *
 * Une personne n'a qu'un lien actif pour un autre appareil : en créer un annule le précédent. Les
 * appareils disent s'il y en a un, et jusqu'à quand (`lien`) ; `DELETE /api/moi/lien` l'annule
 * (1e-D7).
 *
 * Les appareils contrôlent l'en-tête `x-ancrage-personne` quand il est présent (1e-R15) : l'écran
 * qui les lit dit au téléphone quelles passkeys garder, et la liste d'une autre personne lui ferait
 * retirer celles de la personne de l'écran. Le profil (`PATCH /api/moi`) et le lien pour un autre
 * appareil (`POST` et `DELETE /api/moi/lien`) le contrôlent de même : sous la session d'une autre
 * personne, l'écran renommerait son compte, ou créerait son lien, le montrerait et annulerait le
 * précédent. S'il nomme une autre personne que celle de la session, la réponse est 409
 * `autre_personne`, avant tout effet et sans rien de la personne de la session. Sans l'en-tête,
 * aucun contrôle : ces routes existent déjà, et l'application de la version précédente, gardée au
 * précache, ne l'envoie pas (invariant 8, comme R36 pour `GET /api/cours`).
 *
 * Aucune réponse ne cite un jeton déjà émis ni une empreinte. Le lien de `POST /api/moi/lien` est
 * rendu une fois, par la réponse qui le crée. Les réponses ne se mettent jamais en cache.
 */
import type { FastifyPluginAsync } from 'fastify';
import * as z from 'zod';
import { coursVisiblesPour, INTROUVABLE, personneConnectee } from './acces/index.js';
import type { Base } from './base/base.js';
import type { Depot } from './comptes/depot.js';
import { exporterPersonne } from './comptes/export.js';
import { creerEmetteurDeLiens } from './comptes/liens.js';
import { langue, nomAffiche } from './comptes/routes-auth.js';
import { fermerSession, sessionValide } from './comptes/session.js';
import { supprimerPersonne } from './comptes/suppression.js';
import { AUTRE_PERSONNE, autrePersonneNommee, refusDeLaPersonne } from './entete-personne.js';

export interface OptionsRoutesCompte {
  base: Base;
  depot: Depot;
  urlPublique: string;
  horloge: () => Date;
}

const SANS_CACHE = 'no-store';
const CLASSEE_CONNECTE = { config: { acces: 'connecte' } } as const;
const REQUETE = { erreur: 'requete' };
const DERNIERE_PASSKEY = { erreur: 'derniere_passkey' };
const PROPRIETAIRE = { erreur: 'proprietaire' };

// Au moins un champ à changer ; rien d'autre n'est modifiable (ni le rôle, ni l'identifiant).
const corpsModification = z
  .strictObject({ nomAffiche: nomAffiche.optional(), langue: langue.optional() })
  .refine((corps) => corps.nomAffiche !== undefined || corps.langue !== undefined);

export const routesCompte: FastifyPluginAsync<OptionsRoutesCompte> = async (routes, options) => {
  const { base, depot, horloge } = options;
  const liens = creerEmetteurDeLiens(depot, options.urlPublique, horloge);

  // Après le crochet de contrôle des droits (`acces/`), qui répond avant lui à une requête
  // refusée : ce qui est refusé reste identique à ce qui n'existe pas.
  routes.addHook('preHandler', async (_requete, reponse) => {
    reponse.header('cache-control', SANS_CACHE);
  });

  routes.get('/api/moi', CLASSEE_CONNECTE, async (requete) => {
    const { id, nomAffiche, langue, proprietaire } = personneConnectee(requete);
    return { id, nomAffiche, langue, proprietaire };
  });

  routes.patch('/api/moi', CLASSEE_CONNECTE, async (requete, reponse) => {
    // Seulement si l'en-tête est là (invariant 8) : l'ancien client ne l'envoie pas.
    if (autrePersonneNommee(requete)) {
      return reponse.code(409).send(AUTRE_PERSONNE);
    }
    const corps = corpsModification.safeParse(requete.body);
    if (!corps.success) {
      return reponse.code(400).send(REQUETE);
    }
    const { id } = personneConnectee(requete);
    const personne = depot.modifierPersonne(id, corps.data);
    if (personne === undefined) {
      // La personne de la session a été supprimée entre-temps : son cookie ne mène plus nulle part,
      // on l'efface avec la réponse (1f-D12).
      fermerSession(requete, reponse);
      return reponse.code(404).send(INTROUVABLE);
    }
    return {
      id: personne.id,
      nomAffiche: personne.nomAffiche,
      langue: personne.langue,
      proprietaire: personne.proprietaire,
    };
  });

  routes.delete('/api/moi', CLASSEE_CONNECTE, async (requete, reponse) => {
    // La personne dont l'écran demande la suppression, avant toute suppression (1e-R13).
    const refus = refusDeLaPersonne(requete);
    if (refus !== undefined) {
      return reponse.code(refus[0]).send(refus[1]);
    }
    const { id } = personneConnectee(requete);
    const resultat = supprimerPersonne(base, id, horloge(), (message) => requete.log.warn(message));
    if (resultat === 'proprietaire') {
      // Le compte du propriétaire ne se supprime pas depuis l'application.
      return reponse.code(409).send(PROPRIETAIRE);
    }
    if (resultat === 'introuvable') {
      // La personne de la session a été supprimée entre-temps : son cookie ne mène plus nulle part,
      // on l'efface avec la réponse (1f-D12).
      fermerSession(requete, reponse);
      return reponse.code(404).send(INTROUVABLE);
    }
    // La cascade a emporté la session : reste à effacer le cookie. Ni identifiant ni nom au
    // journal (1e-D10).
    fermerSession(requete, reponse);
    requete.log.info({ par: 'personne' }, 'compte supprimé');
    return reponse.code(204).send();
  });

  routes.get('/api/moi/export', CLASSEE_CONNECTE, async (requete, reponse) => {
    const { id } = personneConnectee(requete);
    const instant = horloge();
    // Les cours visibles viennent d'`acces/` : l'export n'a aucun droit à contrôler et ne dit rien
    // des autres (invariant 1). Il ne reçoit que leur identifiant et leur titre.
    const visibles = coursVisiblesPour(requete).map((cours) => ({
      id: cours.id,
      titre: cours.titre,
    }));
    const donnees = exporterPersonne(base, depot, id, visibles, instant);
    if (donnees === undefined) {
      // La personne de la session a été supprimée entre-temps : son cookie ne mène plus nulle part,
      // on l'efface avec la réponse (1f-D12).
      fermerSession(requete, reponse);
      return reponse.code(404).send(INTROUVABLE);
    }
    // Le texte est déjà du JSON : Fastify l'envoie tel quel, avec l'indentation voulue. Le nom du
    // fichier ne porte que la date (UTC) : ni nom ni identifiant (1e-D10).
    return reponse
      .type('application/json')
      .header(
        'content-disposition',
        `attachment; filename="ancrage-export-${instant.toISOString().slice(0, 10)}.json"`,
      )
      .send(JSON.stringify(donnees, null, 2));
  });

  routes.get('/api/moi/appareils', CLASSEE_CONNECTE, async (requete, reponse) => {
    // Seulement si l'en-tête est là (1e-R15, invariant 8) : l'ancien client ne l'envoie pas.
    if (autrePersonneNommee(requete)) {
      return reponse.code(409).send(AUTRE_PERSONNE);
    }
    const { id, sessionId } = personneConnectee(requete);
    const instant = horloge();
    return {
      // Une session expirée n'ouvre plus rien : ce n'est plus un appareil connecté.
      sessions: depot
        .sessionsDe(id)
        .filter((session) => sessionValide(session, instant))
        .map((session) => ({
          id: session.id,
          appareil: session.appareil,
          creeLe: session.creeLe,
          utiliseLe: session.utiliseLe,
          courante: session.id === sessionId,
        })),
      passkeys: depot.passkeysDe(id).map((passkey) => ({
        id: passkey.id,
        appareil: passkey.appareil,
        creeLe: passkey.creeLe,
        utiliseLe: passkey.utiliseLe,
      })),
      // Le lien pour un autre appareil, s'il est encore utilisable : sa date d'expiration seule,
      // jamais son jeton, qui n'existe plus que chez celui qui l'a reçu (1e-D7).
      lien: depot.lienDeConnexionActif(id) ?? null,
    };
  });

  routes.delete('/api/moi/sessions/:id', CLASSEE_CONNECTE, async (requete, reponse) => {
    const { id: personne, sessionId } = personneConnectee(requete);
    const { id } = requete.params as { id: string };
    if (id === sessionId) {
      // Comme une déconnexion : la session part avec son cookie.
      fermerSession(requete, reponse);
      return reponse.code(204).send();
    }
    if (!depot.supprimerSession(id, personne)) {
      return reponse.code(404).send(INTROUVABLE);
    }
    return reponse.code(204).send();
  });

  routes.delete('/api/moi/passkeys/:id', CLASSEE_CONNECTE, async (requete, reponse) => {
    const { id: personne } = personneConnectee(requete);
    const { id } = requete.params as { id: string };
    // La lecture et la suppression se suivent sans attente : aucune autre requête ne s'intercale,
    // deux suppressions simultanées ne laissent donc pas la personne sans passkey.
    const passkeys = depot.passkeysDe(personne);
    // Une clé d'une autre personne répond comme une clé inconnue, avant tout autre refus.
    if (!passkeys.some((passkey) => passkey.id === id)) {
      return reponse.code(404).send(INTROUVABLE);
    }
    if (passkeys.length === 1) {
      return reponse.code(409).send(DERNIERE_PASSKEY);
    }
    depot.supprimerPasskey(id, personne);
    return reponse.code(204).send();
  });

  routes.post('/api/moi/lien', CLASSEE_CONNECTE, async (requete, reponse) => {
    // Seulement si l'en-tête est là (invariant 8) : l'ancien client ne l'envoie pas.
    if (autrePersonneNommee(requete)) {
      return reponse.code(409).send(AUTRE_PERSONNE);
    }
    const { id } = personneConnectee(requete);
    // Annule le lien précédent de la personne, quel qu'en soit l'auteur (1e-D7).
    return { lien: liens.connexion(id, id) };
  });

  // Idempotent : sans lien actif, rien à annuler, et la réponse reste la même. Aucune nouvelle
  // vérification par passkey (1e-D7).
  routes.delete('/api/moi/lien', CLASSEE_CONNECTE, async (requete, reponse) => {
    // Seulement si l'en-tête est là (invariant 8) : l'ancien client ne l'envoie pas.
    if (autrePersonneNommee(requete)) {
      return reponse.code(409).send(AUTRE_PERSONNE);
    }
    const { id } = personneConnectee(requete);
    depot.annulerLiensDeConnexion(id);
    return reponse.code(204).send();
  });
};
