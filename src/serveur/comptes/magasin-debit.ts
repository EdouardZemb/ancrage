/*
 * Le magasin de la limite de débit (1f-D9, d'après 1e-R23) : il compte comme `LocalStore`, le
 * magasin par défaut de `@fastify/rate-limit`, mais oublie une adresse à la fin de sa fenêtre.
 * Celui du greffon n'a pas de durée de vie : il garde une adresse jusqu'au redémarrage, ou jusqu'à
 * ce que 5000 autres, utilisées plus récemment, l'aient fait sortir.
 *
 * Une minuterie par adresse, armée quand sa fenêtre commence, la retire à la fin de la fenêtre.
 * Elle ne retient pas le processus (`unref`). Le nombre d'adresses gardées reste borné, comme dans
 * le magasin du greffon, dont le `LruMap` de toad-cache évince la moins récemment utilisée : chaque
 * `incr` rajeunit une adresse, et une adresse de plus fait sortir la moins récemment utilisée, avec
 * sa minuterie. `read` ne rajeunit pas, alors que `LocalStore.read` le fait (il passe par `get`) :
 * lire n'est pas utiliser, et la limite de connexion n'appelle jamais `read`.
 *
 * La fenêtre est celle de la limite (`LIMITE_DEBIT_AUTH`), la même à chaque appel : la minuterie
 * est armée avec la durée du premier appel de la fenêtre. Les adresses ne sont ni écrites, ni
 * journalisées (ADR-0007) ; ce fichier n'en fait que des clés de `Map`.
 */
import type { FastifyRateLimitStore } from '@fastify/rate-limit';

/** Comme `cache` dans le magasin du greffon : au-delà, la moins récemment utilisée sort. */
const PLAFOND_ADRESSES = 5000;

/**
 * Au-delà, `setTimeout` ramène la durée à 1 ms (Node avertit) : l'adresse serait oubliée aussitôt,
 * et la limite ne limiterait plus rien.
 */
const DUREE_MAXIMALE_MS = 2 ** 31 - 1;

type Rappel = (erreur: Error | null, resultat?: { current: number; ttl: number }) => void;

/** La fenêtre en cours d'une adresse. */
interface Fenetre {
  /** Les requêtes comptées depuis le début de la fenêtre. */
  compte: number;
  /** Son premier instant, en millisecondes. */
  debut: number;
  /** Ce qui retire l'adresse à la fin de la fenêtre. */
  minuterie: NodeJS.Timeout;
}

export class MagasinQuiOublie implements FastifyRateLimitStore {
  // L'ordre d'insertion est celui des usages : `ouvrir` et `incr` replacent une adresse en dernier.
  // La première est donc la moins récemment utilisée, celle qui sort quand le plafond est dépassé.
  private readonly fenetres = new Map<string, Fenetre>();

  /** Le nombre d'adresses gardées, pour les tests. */
  get taille(): number {
    return this.fenetres.size;
  }

  /**
   * Compte une requête, comme `LocalStore.incr`, sans `continueExceeding` ni `exponentialBackoff`,
   * dont la limite de connexion ne se sert pas.
   */
  incr(cle: string, rappel: Rappel, timeWindow: number, _max: number): void {
    const maintenant = Date.now();
    const fenetre = this.fenetres.get(cle);
    if (fenetre === undefined || fenetre.debut + timeWindow <= maintenant) {
      this.ouvrir(cle, timeWindow, maintenant);
      rappel(null, { current: 1, ttl: timeWindow });
      return;
    }
    fenetre.compte += 1;
    // Rajeunie, comme `lru.get` puis `lru.set` dans `LocalStore.incr` ; sa minuterie reste la même.
    this.fenetres.delete(cle);
    this.fenetres.set(cle, fenetre);
    rappel(null, { current: fenetre.compte, ttl: timeWindow - (maintenant - fenetre.debut) });
  }

  /** Lit sans compter, comme `LocalStore.read` : une fenêtre finie est dite vierge. */
  read(cle: string, rappel: Rappel, timeWindow: number, _max: number): void {
    const maintenant = Date.now();
    const fenetre = this.fenetres.get(cle);
    if (fenetre === undefined || fenetre.debut + timeWindow <= maintenant) {
      rappel(null, { current: 0, ttl: 0 });
      return;
    }
    rappel(null, {
      current: fenetre.compte,
      ttl: timeWindow - (maintenant - fenetre.debut),
    });
  }

  /** Un magasin vide pour un groupe de routes : le greffon en tire un de `rateLimit(…)`. */
  child(): MagasinQuiOublie {
    return new MagasinQuiOublie();
  }

  /**
   * Ouvre la fenêtre de l'adresse, avec une seule minuterie ; si plein, la moins récemment utilisée
   * sort. Une durée que `setTimeout` ne tiendrait pas est refusée avant que rien ne change.
   */
  private ouvrir(cle: string, duree: number, debut: number): void {
    if (!(duree >= 0 && duree <= DUREE_MAXIMALE_MS)) {
      throw new RangeError(
        `fenêtre de ${duree} ms : la limite de débit veut de 0 à ${DUREE_MAXIMALE_MS} ms`,
      );
    }
    this.retirer(cle);
    const minuterie = setTimeout(() => this.fenetres.delete(cle), duree);
    minuterie.unref();
    this.fenetres.set(cle, { compte: 1, debut, minuterie });
    if (this.fenetres.size > PLAFOND_ADRESSES) {
      const [moinsRecente] = this.fenetres.keys();
      if (moinsRecente !== undefined) {
        this.retirer(moinsRecente);
      }
    }
  }

  /** Retire l'adresse et sa minuterie : aucune ne survit à son adresse. */
  private retirer(cle: string): void {
    const fenetre = this.fenetres.get(cle);
    if (fenetre !== undefined) {
      clearTimeout(fenetre.minuterie);
      this.fenetres.delete(cle);
    }
  }
}
