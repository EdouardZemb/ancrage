/*
 * Ce que les sections de l'administration partagent : leurs libellés, la forme des données que
 * l'écran lit d'un coup, et ce qu'il donne à chaque section.
 */
import type { CoursResume, PasskeyEnregistree } from '../api.js';
import { textes, textesAdmin } from '../textes.js';

export const T = textesAdmin;
// Les libellés des échecs et du partage : le français courant, et les refus de l'administration.
export const LIBELLES = { ...textes.fr, ...textesAdmin };

export interface Personne {
  id: string;
  nomAffiche: string;
  proprietaire: boolean;
  /** Les identifiants de ses groupes. */
  groupes: string[];
  /** Les identifiants des cours qu'elle a nommément. */
  droits: string[];
  nbAppareils: number;
  /**
   * Ses passkeys (1e-D8). Absent de la réponse d'un serveur d'avant le lot 1e : après un retour
   * arrière, l'application précachée lit cette réponse (ADR-0008, §3).
   */
  passkeys?: PasskeyEnregistree[];
}

export interface Groupe {
  id: string;
  nom: string;
}

export type TypeSujet = 'personne' | 'groupe';

export interface Droit {
  id: string;
  cours: string;
  /** Nul si le cours n'est plus chargé : le droit reste visible, et on peut le retirer. */
  coursTitre: string | null;
  sujet: { type: TypeSujet; id: string };
}

export interface Donnees {
  personnes: Personne[];
  groupes: Groupe[];
  droits: Droit[];
  cours: CoursResume[];
}

export interface PropsSection {
  donnees: Donnees;
  recharger: () => Promise<void>;
}
