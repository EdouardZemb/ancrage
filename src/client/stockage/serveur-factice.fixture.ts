/*
 * Un faux serveur du journal pour les tests de la synchronisation. Il tient le même langage que le
 * vrai (`depot-journal.ts`) :
 * - un `id` déjà reçu est ignoré, le premier fait foi ;
 * - le curseur d'un cours est un numéro qui va de 1 à N, sans trou ;
 * - une page vide rend `min(depuis, N)`, si bien qu'un curseur qui dépasse N recule.
 *
 * Il garde la trace de tout ce qu'on lui demande, et peut tomber en panne ou perdre une réponse.
 * Exclu de la construction, comme tout `*.fixture.ts`.
 */
import type { Evenement } from '../../domaine/journal/evenement.js';
import { type CoursResume, ErreurApi } from '../api.js';
import type { ApiJournal } from '../synchro.js';

export function erreurReseau(): ErreurApi {
  return new ErreurApi(0, 'reseau');
}

export class ServeurFactice implements ApiJournal {
  /** Le journal de la personne, par cours, dans l'ordre d'arrivée : le numéro est le rang + 1. */
  readonly journal = new Map<string, Evenement[]>();
  /** Tous les envois reçus, y compris ceux dont la réponse s'est perdue. */
  readonly envois: { cours: string; evenements: Evenement[] }[] = [];
  readonly lectures: { cours: string; depuis: number }[] = [];
  /** Le nombre de fois où la liste des cours a été demandée. */
  listages = 0;
  /** La personne que nommait chaque demande de la liste des cours. */
  readonly listes: string[] = [];
  /** Les cours que `GET /api/cours` rend à la personne : par défaut aucun. */
  liste: CoursResume[] = [];
  /** Si défini, chaque envoi (ou lecture, ou liste) échoue avec cette erreur, avant de rien faire. */
  panneEnvoi: Error | undefined;
  panneLecture: Error | undefined;
  panneListe: Error | undefined;
  /** Le prochain envoi est enregistré, puis la réponse se perd : le client voit une panne réseau. */
  perdreLaReponse = false;
  pageMax = 1000;

  /** Tout ce que le serveur sait d'un cours, dans l'ordre d'arrivée. */
  evenements(cours: string): Evenement[] {
    return this.journal.get(cours) ?? [];
  }

  /** Reçoit des événements (d'un autre appareil, par exemple) ; rend le nombre de nouveaux. */
  deposer(cours: string, evenements: readonly Evenement[]): number {
    const connus = this.journal.get(cours) ?? [];
    this.journal.set(cours, connus);
    let nouveaux = 0;
    for (const evenement of evenements) {
      if (connus.some((e) => e.id === evenement.id)) continue;
      connus.push(structuredClone(evenement));
      nouveaux += 1;
    }
    return nouveaux;
  }

  /**
   * Restaure le serveur d'une sauvegarde plus ancienne : il « oublie » tout ce qui suit les
   * `garder` premiers événements du cours, et ses numéros reculent d'autant.
   */
  restaurer(cours: string, garder: number): void {
    this.journal.set(cours, this.evenements(cours).slice(0, garder));
  }

  async envoyer(cours: string, evenements: Evenement[]): Promise<void> {
    this.envois.push({ cours, evenements: structuredClone(evenements) });
    if (this.panneEnvoi) throw this.panneEnvoi;
    this.deposer(cours, evenements);
    if (this.perdreLaReponse) {
      this.perdreLaReponse = false;
      throw erreurReseau();
    }
  }

  async lire(
    cours: string,
    depuis: number,
  ): Promise<{ evenements: Evenement[]; curseur: number; suite: boolean }> {
    this.lectures.push({ cours, depuis });
    if (this.panneLecture) throw this.panneLecture;
    const tous = this.evenements(cours);
    const page = tous.slice(depuis, depuis + this.pageMax);
    return {
      evenements: structuredClone(page),
      curseur: page.length > 0 ? depuis + page.length : Math.min(depuis, tous.length),
      suite: depuis + page.length < tous.length,
    };
  }

  async lister(personne: string): Promise<CoursResume[]> {
    this.listages += 1;
    this.listes.push(personne);
    if (this.panneListe) throw this.panneListe;
    return structuredClone(this.liste);
  }
}

/**
 * L'API du faux serveur, dont on remplace des méthodes : pour glisser un événement ou une panne à un
 * moment précis d'une synchronisation.
 */
export function apiDe(serveur: ServeurFactice, surcharge: Partial<ApiJournal> = {}): ApiJournal {
  return {
    envoyer: (cours, evenements) => serveur.envoyer(cours, evenements),
    lire: (cours, depuis) => serveur.lire(cours, depuis),
    lister: (personne) => serveur.lister(personne),
    ...surcharge,
  };
}
