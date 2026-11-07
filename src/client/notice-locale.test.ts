/*
 * La copie de la notice sur l'appareil (S1-D8) : chargée par `GET /api/notice`, rangée dans le
 * magasin `etat`, relue sans réseau.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { valeursDeNoticeDExemple } from '../domaine/contenu/exemple.fixture.js';
import { chargerNotice, lireNoticeLocale } from './notice-locale.js';
import { json } from './reponse.fixture.js';
import { fermerLesBasesDeTest, ouvrirBaseDeTest } from './stockage/base-locale.fixture.js';
import { memoriserMoi, moiLocal } from './stockage/base-locale.js';

afterEach(fermerLesBasesDeTest);

const NOTICE = valeursDeNoticeDExemple();

/** Un `fetch` qui rend `reponse` (ou lève), et retient les adresses demandées. */
function serveur(reponse: () => Response) {
  const adresses: string[] = [];
  const recuperer = vi.fn(async (entree: string | URL | Request) => {
    adresses.push(String(entree));
    return reponse();
  }) as unknown as typeof fetch;
  return { recuperer, adresses };
}

function horsLigne(): typeof fetch {
  return vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  }) as unknown as typeof fetch;
}

describe('notice-locale', () => {
  it('notice_garde_la_derniere_copie', async () => {
    const base = await ouvrirBaseDeTest();
    expect(await lireNoticeLocale(base)).toBeUndefined();

    const premier = serveur(() => json(NOTICE));
    expect(await chargerNotice(base, premier.recuperer)).toEqual(NOTICE);
    expect(premier.adresses).toEqual(['/api/notice']);
    // La copie se relit, et sert sans réseau.
    expect(await lireNoticeLocale(base)).toEqual(NOTICE);
    expect(await chargerNotice(base, horsLigne())).toEqual(NOTICE);

    // Une réponse plus récente remplace la copie.
    const plusRecente = { ...NOTICE, date: '2026-12-01', liens: [] };
    expect(await chargerNotice(base, serveur(() => json(plusRecente)).recuperer)).toEqual(
      plusRecente,
    );
    expect(await lireNoticeLocale(base)).toEqual(plusRecente);
  });

  it('notice_sans_reseau_ni_copie_rend_undefined', async () => {
    const base = await ouvrirBaseDeTest();

    expect(await chargerNotice(base, horsLigne())).toBeUndefined();
    expect(await chargerNotice(undefined, horsLigne())).toBeUndefined();
    // Sans base, la réponse du serveur sert, sans rien ranger.
    expect(await chargerNotice(undefined, serveur(() => json(NOTICE)).recuperer)).toEqual(NOTICE);
  });

  it('notice_refusee_ne_remplace_pas_la_copie', async () => {
    // Une erreur du serveur (une route qu'il n'a pas encore, par exemple) ou une réponse d'une autre
    // forme rendent la copie, et ne la touchent pas.
    const base = await ouvrirBaseDeTest();
    await chargerNotice(base, serveur(() => json(NOTICE)).recuperer);
    const { tunnel: _tunnel, ...sansTunnel } = NOTICE.valeurs.de;

    for (const reponse of [
      () => json({ erreur: 'introuvable' }, 404),
      () => new Response('pas du JSON', { status: 200 }),
      () => json({ ...NOTICE, valeurs: { ...NOTICE.valeurs, de: sansTunnel } }),
      () => json({ ...NOTICE, liens: [{ texte: 'x' }] }),
      () => json({ ...NOTICE, date: 3 }),
      () => json([NOTICE]),
    ]) {
      expect(await chargerNotice(base, serveur(reponse).recuperer)).toEqual(NOTICE);
    }
    expect(await lireNoticeLocale(base)).toEqual(NOTICE);
  });

  it('notice_plus_ancienne_remplace_aussi_la_copie', async () => {
    // Le serveur fait foi, même après un retour arrière vers des valeurs plus anciennes.
    const base = await ouvrirBaseDeTest();
    await chargerNotice(base, serveur(() => json(NOTICE)).recuperer);
    const plusAncienne = { ...NOTICE, date: '2026-01-15', liens: [] };

    expect(await chargerNotice(base, serveur(() => json(plusAncienne)).recuperer)).toEqual(
      plusAncienne,
    );
    expect(await lireNoticeLocale(base)).toEqual(plusAncienne);
    expect(await chargerNotice(base, horsLigne())).toEqual(plusAncienne);
  });

  it('notice_copie_d_une_autre_forme_n_est_pas_relue', async () => {
    // Une copie rangée par une version dont le gabarit attendait moins de clés : la composer ferait
    // lever l'écran. Elle n'est pas relue, et sans réseau il n'y a pas de notice.
    const base = await ouvrirBaseDeTest();
    const { tunnel: _tunnel, ...sansTunnel } = NOTICE.valeurs.fr;
    await base.put('etat', {
      cle: 'notice',
      valeur: { ...NOTICE, valeurs: { ...NOTICE.valeurs, fr: sansTunnel } },
    });

    expect(await lireNoticeLocale(base)).toBeUndefined();
    expect(await chargerNotice(base, horsLigne())).toBeUndefined();
    // La réponse suivante du serveur la remplace.
    expect(await chargerNotice(base, serveur(() => json(NOTICE)).recuperer)).toEqual(NOTICE);
    expect(await lireNoticeLocale(base)).toEqual(NOTICE);
  });

  it('notice_rangee_a_cote_de_la_personne', async () => {
    // Le même magasin que la personne connue : l'une ne remplace pas l'autre.
    const base = await ouvrirBaseDeTest();
    const moi = {
      id: 'p-1',
      nomAffiche: 'Lernende Test',
      langue: 'de' as const,
      proprietaire: false,
    };
    await memoriserMoi(base, moi);

    await chargerNotice(base, serveur(() => json(NOTICE)).recuperer);

    expect(await moiLocal(base)).toEqual(moi);
    expect(await lireNoticeLocale(base)).toEqual(NOTICE);
  });
});
