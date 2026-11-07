/*
 * L'émission des liens à usage unique, par l'API et par la ligne de commande d'amorçage : un jeton
 * neuf, dont la base ne garde que l'empreinte (ADR-0007), et l'adresse que la personne ouvre sur
 * son téléphone. Cette adresse est le seul endroit où le jeton existe en clair : l'appelant la
 * rend une fois, à celui qui crée le lien, et ne la journalise pas.
 *
 * Une personne n'a qu'un lien de connexion actif, quel que soit son auteur : en émettre un annule
 * celui qu'elle n'a pas utilisé (1e-D7). Les invitations, elles, s'ajoutent sans rien annuler.
 */
import type { Depot, Octroi, TypeLien } from './depot.js';
import { empreinte, nouveauJeton } from './jetons.js';

const UN_JOUR_MS = 24 * 60 * 60 * 1000;
const DUREE_INVITATION_MS = 7 * UN_JOUR_MS;
const DUREE_LIEN_CONNEXION_MS = UN_JOUR_MS;

const ECRAN_INVITATION = 'invitation';
const ECRAN_LIEN = 'lien';

/**
 * Les écrans du client dont le chemin porte un jeton. `emettre` n'accepte qu'un écran de cette
 * liste. Le journal du serveur n'a plus besoin de la connaître : il n'écrit que le modèle de la
 * route, ou le premier segment d'un chemin sans route, donc jamais un jeton (`app.ts`, 1e-D10).
 */
const ECRANS_A_JETON = [ECRAN_INVITATION, ECRAN_LIEN] as const;

export type EcranAJeton = (typeof ECRANS_A_JETON)[number];

export function creerEmetteurDeLiens(depot: Depot, urlPublique: string, horloge: () => Date) {
  function emettre(
    type: TypeLien,
    ecran: EcranAJeton,
    duree: number,
    donnees: {
      personne?: string;
      proprietaire?: boolean;
      octroi?: Octroi;
      /** Absent pour l'amorçage en ligne de commande : personne n'est encore connecté. */
      creePar?: string;
    },
  ): string {
    const jeton = nouveauJeton();
    const expireLe = new Date(horloge().getTime() + duree).toISOString();
    if (type === 'connexion') {
      // Annule le lien précédent de la personne et crée celui-ci, dans une transaction.
      const { personne, creePar } = donnees;
      if (personne === undefined) {
        throw new Error('lien de connexion sans personne');
      }
      depot.remplacerLienDeConnexion({ empreinte: empreinte(jeton), personne, creePar, expireLe });
    } else {
      depot.creerLien({ empreinte: empreinte(jeton), type, ...donnees, expireLe });
    }
    return `${urlPublique}/${ecran}/${jeton}`;
  }

  return {
    /** Une invitation de 7 jours : le compte n'existe pas encore, l'octroi s'applique à sa création. */
    invitation(creePar: string, octroi: Octroi): string {
      return emettre('invitation', ECRAN_INVITATION, DUREE_INVITATION_MS, { octroi, creePar });
    },

    /**
     * Un lien de 24 heures qui ajoute une passkey à un compte existant et ouvre sa session. Il
     * annule le lien de connexion précédent de la personne, s'il n'a pas servi.
     */
    connexion(personne: string, creePar: string): string {
      return emettre('connexion', ECRAN_LIEN, DUREE_LIEN_CONNEXION_MS, { personne, creePar });
    },

    /** L'invitation du premier propriétaire, sans auteur : la ligne de commande d'amorçage. */
    invitationProprietaire(): string {
      return emettre('invitation', ECRAN_INVITATION, DUREE_INVITATION_MS, { proprietaire: true });
    },

    /**
     * Le lien de 24 heures qui rend le compte au propriétaire, sans auteur : le secours. Comme
     * `connexion`, il annule le lien de connexion précédent du propriétaire.
     */
    connexionDeSecours(proprietaire: string): string {
      return emettre('connexion', ECRAN_LIEN, DUREE_LIEN_CONNEXION_MS, { personne: proprietaire });
    },
  };
}

export type EmetteurDeLiens = ReturnType<typeof creerEmetteurDeLiens>;
