import { createRequire } from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MagasinQuiOublie } from './magasin-debit.js';

const FENETRE = 60_000;
const MAX = 20;
const PLAFOND = 5000;
const FENETRE_LA_PLUS_LONGUE = 2 ** 31 - 1;

interface Compte {
  current: number;
  ttl: number;
}

/** Ce que le greffon demande d'un magasin, et que `LocalStore` et `MagasinQuiOublie` partagent. */
type Magasin = Pick<MagasinQuiOublie, 'incr' | 'read'>;

/** Des adresses distinctes, sans rapport avec une personne (invariant 7). */
const adresse = (numero: number) => `10.${numero >> 8}.${numero & 255}.1`;

/** Le résultat de `incr` ou de `read`, que le magasin rend aussitôt, comme celui du greffon. */
function appeler(
  methode: 'incr' | 'read',
  magasin: Magasin,
  cle: string,
  fenetre: number = FENETRE,
): Compte {
  let compte: Compte | undefined;
  magasin[methode](
    cle,
    (erreur, resultat) => {
      if (erreur !== null) {
        throw erreur;
      }
      // Le greffon ne lit que `current` et `ttl` ; `LocalStore` rend aussi le début de la fenêtre.
      compte = resultat && { current: resultat.current, ttl: resultat.ttl };
    },
    fenetre,
    MAX,
  );
  if (compte === undefined) {
    throw new Error(`${methode} n'a pas rendu son résultat`);
  }
  return compte;
}

const incr = (magasin: Magasin, cle: string) => appeler('incr', magasin, cle);
const lire = (magasin: Magasin, cle: string) => appeler('read', magasin, cle);

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('magasin_de_debit', () => {
  it('compte_comme_le_magasin_par_defaut', () => {
    const magasin = new MagasinQuiOublie();
    let precedent = FENETRE + 1;

    for (let numero = 1; numero <= 21; numero += 1) {
      const { current, ttl } = incr(magasin, '192.0.2.1');
      expect(current).toBe(numero);
      // Le premier appel ouvre la fenêtre ; ensuite, ce qu'il en reste décroît.
      expect(ttl).toBe(numero === 1 ? FENETRE : FENETRE - (numero - 1) * 1000);
      expect(ttl).toBeLessThan(precedent);
      precedent = ttl;
      vi.advanceTimersByTime(1000);
    }
  });

  it('une_adresse_n_use_pas_le_budget_d_une_autre', () => {
    const magasin = new MagasinQuiOublie();

    for (let numero = 1; numero <= 21; numero += 1) {
      incr(magasin, '192.0.2.1');
    }

    expect(incr(magasin, '192.0.2.2').current).toBe(1);
    expect(incr(magasin, '192.0.2.1').current).toBe(22);
  });

  it('oublie_l_adresse_a_la_fin_de_sa_fenetre', () => {
    const magasin = new MagasinQuiOublie();
    incr(magasin, '192.0.2.1');
    incr(magasin, '192.0.2.1');
    incr(magasin, '192.0.2.1');
    expect(magasin.taille).toBe(1);

    // À une milliseconde de la fin, l'adresse est encore là, et son compte aussi.
    vi.advanceTimersByTime(FENETRE - 1);
    expect(magasin.taille).toBe(1);
    expect(lire(magasin, '192.0.2.1').current).toBe(3);

    // À l'instant exact de la fin, elle est oubliée.
    vi.advanceTimersByTime(1);
    expect(magasin.taille).toBe(0);
    expect(incr(magasin, '192.0.2.1')).toEqual({ current: 1, ttl: FENETRE });
  });

  it('un_incr_en_cours_de_fenetre_ne_prolonge_pas_l_adresse', () => {
    const magasin = new MagasinQuiOublie();
    incr(magasin, '192.0.2.1');
    vi.advanceTimersByTime(20_000);
    // Rajeunie par ce `incr`, l'adresse garde la minuterie de son premier `incr`.
    incr(magasin, '192.0.2.1');

    vi.advanceTimersByTime(FENETRE - 20_000 - 1);
    expect(magasin.taille).toBe(1);

    vi.advanceTimersByTime(1);
    expect(magasin.taille).toBe(0);
  });

  it('chaque_adresse_est_oubliee_a_la_fin_de_sa_propre_fenetre', () => {
    const magasin = new MagasinQuiOublie();
    incr(magasin, '192.0.2.1');
    vi.advanceTimersByTime(20_000);
    incr(magasin, '192.0.2.2');

    vi.advanceTimersByTime(FENETRE - 20_000);
    expect(magasin.taille).toBe(1);
    expect(lire(magasin, '192.0.2.2').current).toBe(1);

    vi.advanceTimersByTime(20_000);
    expect(magasin.taille).toBe(0);
  });

  it('une_seule_minuterie_par_adresse', () => {
    const magasin = new MagasinQuiOublie();
    incr(magasin, '192.0.2.1');
    incr(magasin, '192.0.2.1');
    expect(vi.getTimerCount()).toBe(1);

    // L'horloge saute sans que la minuterie parte : la fenêtre est finie, mais l'adresse est encore
    // là. Le `incr` suivant rouvre la fenêtre et réarme la minuterie, sans en laisser une seconde.
    vi.setSystemTime(Date.now() + FENETRE);
    expect(magasin.taille).toBe(1);
    expect(incr(magasin, '192.0.2.1')).toEqual({ current: 1, ttl: FENETRE });
    expect(vi.getTimerCount()).toBe(1);

    // La nouvelle fenêtre dure tout entière : l'ancienne minuterie ne l'écourte pas.
    vi.advanceTimersByTime(FENETRE - 1);
    expect(magasin.taille).toBe(1);
    vi.advanceTimersByTime(1);
    expect(magasin.taille).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('la_minuterie_ne_retient_pas_le_processus', () => {
    const magasin = new MagasinQuiOublie();
    const espion = vi.spyOn(globalThis, 'setTimeout');

    incr(magasin, '192.0.2.1');

    expect(espion).toHaveBeenCalledTimes(1);
    const minuterie = espion.mock.results[0]?.value as { hasRef(): boolean };
    expect(minuterie.hasRef()).toBe(false);
  });

  it('read_ne_compte_pas', () => {
    const magasin = new MagasinQuiOublie();

    // Une adresse inconnue : état vierge, rien n'est gardé, aucune minuterie n'est armée.
    expect(lire(magasin, '192.0.2.1')).toEqual({ current: 0, ttl: 0 });
    expect(magasin.taille).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    incr(magasin, '192.0.2.1');
    incr(magasin, '192.0.2.1');
    vi.advanceTimersByTime(5000);

    expect(lire(magasin, '192.0.2.1')).toEqual({ current: 2, ttl: FENETRE - 5000 });
    expect(lire(magasin, '192.0.2.1')).toEqual({ current: 2, ttl: FENETRE - 5000 });
    expect(incr(magasin, '192.0.2.1').current).toBe(3);

    // Une fenêtre finie, mais pas encore oubliée : comme `LocalStore`, `read` la dit vierge.
    vi.setSystemTime(Date.now() + FENETRE);
    expect(magasin.taille).toBe(1);
    expect(lire(magasin, '192.0.2.1')).toEqual({ current: 0, ttl: 0 });
    expect(magasin.taille).toBe(1);
  });

  it('plafond_de_5000_adresses', () => {
    const magasin = new MagasinQuiOublie();

    for (let numero = 0; numero <= PLAFOND; numero += 1) {
      incr(magasin, adresse(numero));
    }

    // 5001 adresses distinctes : la mémoire reste bornée, et la première (la moins récente) sort.
    expect(magasin.taille).toBe(PLAFOND);
    expect(lire(magasin, adresse(0))).toEqual({ current: 0, ttl: 0 });
    expect(lire(magasin, adresse(1)).current).toBe(1);
    expect(lire(magasin, adresse(PLAFOND)).current).toBe(1);
    // Une adresse sortie ne laisse pas de minuterie : une par adresse gardée.
    expect(vi.getTimerCount()).toBe(PLAFOND);

    // Le compte de chaque adresse gardée ne change pas : 20 par minute, puis le refus.
    for (let numero = 2; numero <= MAX; numero += 1) {
      expect(incr(magasin, adresse(PLAFOND)).current).toBe(numero);
    }
    expect(incr(magasin, adresse(PLAFOND)).current).toBe(MAX + 1);

    // Tout est oublié à la fin de la fenêtre.
    vi.advanceTimersByTime(FENETRE);
    expect(magasin.taille).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('eviction_de_la_moins_recemment_utilisee', () => {
    const magasin = new MagasinQuiOublie();
    incr(magasin, 'A');
    incr(magasin, 'A');
    for (let numero = 0; numero < PLAFOND - 1; numero += 1) {
      incr(magasin, adresse(numero));
    }
    expect(magasin.taille).toBe(PLAFOND);

    // A est la plus ancienne, mais elle insiste : elle est la plus récemment utilisée.
    expect(incr(magasin, 'A').current).toBe(3);
    incr(magasin, adresse(PLAFOND - 1));

    // C'est la première des adresses neuves qui sort, et A garde son compte.
    expect(magasin.taille).toBe(PLAFOND);
    expect(lire(magasin, adresse(0))).toEqual({ current: 0, ttl: 0 });
    expect(lire(magasin, adresse(1)).current).toBe(1);
    expect(lire(magasin, 'A').current).toBe(3);
    expect(vi.getTimerCount()).toBe(PLAFOND);
  });

  it('read_ne_rajeunit_pas', () => {
    const magasin = new MagasinQuiOublie();
    for (let numero = 0; numero < PLAFOND; numero += 1) {
      incr(magasin, adresse(numero));
    }

    // Lire n'est pas utiliser : `LocalStore.read` rajeunirait la clé, celui-ci non.
    lire(magasin, adresse(0));
    incr(magasin, adresse(PLAFOND));

    expect(lire(magasin, adresse(0))).toEqual({ current: 0, ttl: 0 });
    expect(lire(magasin, adresse(1)).current).toBe(1);
  });

  it.each([FENETRE_LA_PLUS_LONGUE + 1, -1, Number.NaN])(
    'fenetre_que_set_timeout_ne_tiendrait_pas_refusee %s',
    (fenetre) => {
      const magasin = new MagasinQuiOublie();
      incr(magasin, '192.0.2.1');

      // `setTimeout` la ramènerait à 1 ms : l'adresse serait oubliée aussitôt, sans bruit.
      expect(() => appeler('incr', magasin, '192.0.2.2', fenetre)).toThrow(RangeError);

      // Rien n'a changé : ni adresse gardée, ni minuterie armée.
      expect(magasin.taille).toBe(1);
      expect(vi.getTimerCount()).toBe(1);
    },
  );

  it('fenetre_la_plus_longue_que_set_timeout_tient', () => {
    const magasin = new MagasinQuiOublie();

    expect(appeler('incr', magasin, '192.0.2.1', FENETRE_LA_PLUS_LONGUE)).toEqual({
      current: 1,
      ttl: FENETRE_LA_PLUS_LONGUE,
    });

    vi.advanceTimersByTime(FENETRE_LA_PLUS_LONGUE - 1);
    expect(magasin.taille).toBe(1);
    vi.advanceTimersByTime(1);
    expect(magasin.taille).toBe(0);
  });

  it('child_rend_un_magasin_independant', () => {
    const magasin = new MagasinQuiOublie();
    const enfant = magasin.child();
    incr(enfant, '192.0.2.1');

    expect(enfant).toBeInstanceOf(MagasinQuiOublie);
    expect(enfant).not.toBe(magasin);
    expect(enfant.taille).toBe(1);
    expect(magasin.taille).toBe(0);
  });
});

// Le magasin par défaut du greffon, tel qu'il est installé : l'étalon du différentiel. Le paquet ne
// déclare pas de types pour ce fichier.
type ConstructeurLocalStore = new (
  continueExceeding: boolean,
  exponentialBackoff: boolean,
  cache: number,
) => Magasin;
const LocalStore: ConstructeurLocalStore = createRequire(import.meta.url)(
  '@fastify/rate-limit/store/LocalStore.js',
);

// `avancer` laisse partir les minuteries ; `sauter` déplace l'horloge sans qu'elles partent, comme
// une boucle d'événements en retard : l'adresse est alors encore là, à la fin de sa fenêtre.
type Pas =
  | { action: 'incr' | 'read'; cle: string }
  | { action: 'avancer'; duree: number }
  | { action: 'sauter'; duree: number };

const pasIncr = (cle: string): Pas => ({ action: 'incr', cle });
const pasRead = (cle: string): Pas => ({ action: 'read', cle });
const pasAvancer = (duree: number): Pas => ({ action: 'avancer', duree });
const pasSauter = (duree: number): Pas => ({ action: 'sauter', duree });

/** Joue les mêmes pas sur `LocalStore` et sur `MagasinQuiOublie` : même résultat à chaque pas. */
function comparerAvecLeGreffon(pas: readonly Pas[], etiquette: string): void {
  const etalon = new LocalStore(false, false, PLAFOND);
  const magasin = new MagasinQuiOublie();
  pas.forEach((etape, numero) => {
    if (etape.action === 'avancer') {
      vi.advanceTimersByTime(etape.duree);
      return;
    }
    if (etape.action === 'sauter') {
      vi.setSystemTime(Date.now() + etape.duree);
      return;
    }
    const message = `${etiquette}, pas ${numero} : ${etape.action} ${etape.cle}`;
    expect(appeler(etape.action, magasin, etape.cle), message).toEqual(
      appeler(etape.action, etalon, etape.cle),
    );
  });
}

describe('magasin_de_debit_contre_le_greffon', () => {
  const SAUTS = [0, 1, FENETRE - 1, FENETRE, FENETRE + 1];

  it.each([
    ['minuteries_qui_partent', pasAvancer],
    ['horloge_qui_saute', pasSauter],
  ])('identique_a_local_store_autour_de_la_fenetre %s', (cas, pasDeTemps) => {
    // Deux sauts de toutes les tailles : leurs sommes tombent aussi sur 59 999, 60 000, 60 001 ms.
    for (const premier of SAUTS) {
      for (const second of SAUTS) {
        comparerAvecLeGreffon(
          [
            pasIncr('A'),
            pasDeTemps(premier),
            pasIncr('A'),
            pasRead('A'),
            pasDeTemps(second),
            pasRead('A'),
            pasIncr('A'),
            pasIncr('B'),
            pasRead('B'),
            pasRead('C'),
          ],
          `${cas}, sauts ${premier} puis ${second}`,
        );
      }
    }
  });

  it('identique_a_local_store_quand_le_plafond_evince', () => {
    const pas: Pas[] = [];
    // A dépasse son budget de vingt requêtes.
    for (let numero = 1; numero <= MAX + 5; numero += 1) {
      pas.push(pasIncr('A'));
    }
    // 4999 adresses neuves : le magasin est plein. A insiste, puis une neuve de plus arrive.
    for (let numero = 0; numero < PLAFOND - 1; numero += 1) {
      pas.push(pasIncr(adresse(numero)));
    }
    pas.push(pasIncr('A'), pasIncr(adresse(PLAFOND - 1)));
    // A garde son compte, car c'est la moins récemment utilisée qui est sortie : la première des
    // neuves, puis la suivante à chaque retour.
    pas.push(pasIncr('A'), pasIncr(adresse(0)), pasIncr(adresse(1)), pasIncr(adresse(2)));

    comparerAvecLeGreffon(pas, 'éviction');
  });
});
