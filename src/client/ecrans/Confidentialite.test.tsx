// @vitest-environment happy-dom
/*
 * L'écran de la notice de confidentialité (1e-D15, S1-D8) : la langue de l'application par défaut,
 * la bascule entre l'allemand et le français, les valeurs lues du serveur et leur copie sur
 * l'appareil, et des liens simples, tirés des valeurs.
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { valeursDeNoticeDExemple } from '../../domaine/contenu/exemple.fixture.js';
import type { ValeursDeNotice } from '../../domaine/notice.js';
import { GABARIT_DE_NOTICE } from '../../domaine/notice-gabarit.js';
import { contexteAppDeTest, rendreDansLApp } from '../contexte.fixture.js';
import { json } from '../reponse.fixture.js';
import { fermerLesBasesDeTest, ouvrirBaseDeTest } from '../stockage/base-locale.fixture.js';
import type { BaseLocale } from '../stockage/base-locale.js';
import { type Langue, textes } from '../textes.js';
import { Confidentialite } from './Confidentialite.js';

const page = vi.hoisted(() => ({ base: undefined as BaseLocale | undefined }));
vi.mock('../stockage/base-de-la-page.js', () => ({
  baseDeLaPage: async () => {
    if (page.base === undefined) throw new Error('base de test absente');
    return page.base;
  },
}));

const NOTICE = valeursDeNoticeDExemple();

/** Ce que le faux serveur rend à `GET /api/notice` ; `undefined` : l'appareil est hors ligne. */
let servie: ValeursDeNotice | undefined;
const requetes = vi.fn(async (_entree: string | URL | Request, _init?: RequestInit) => {
  if (servie === undefined) throw new TypeError('Failed to fetch');
  return json(servie);
});

/** L'écran, pour un visiteur anonyme dont l'application est en `langue`. */
function afficher(langue: Langue) {
  return rendreDansLApp(<Confidentialite />, contexteAppDeTest({ langue }));
}

/** L'article de la notice : il porte la langue de son texte. */
function article(): HTMLElement {
  const trouve = document.querySelector('article');
  if (!(trouve instanceof HTMLElement)) throw new Error('pas d’article');
  return trouve;
}

/** Des valeurs de l'exemple, dont `transferts`, une puce entière, est remplacée en français. */
function avecTransferts(transferts: string): ValeursDeNotice {
  return { ...NOTICE, valeurs: { ...NOTICE.valeurs, fr: { ...NOTICE.valeurs.fr, transferts } } };
}

beforeEach(async () => {
  page.base = await ouvrirBaseDeTest();
  servie = NOTICE;
  requetes.mockClear();
  vi.stubGlobal('fetch', requetes);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fermerLesBasesDeTest();
});

describe('Confidentialite', () => {
  it('notice_dans_la_langue_de_l_application_par_defaut', async () => {
    afficher('fr');

    expect(
      screen.getByRole('heading', { level: 2, name: GABARIT_DE_NOTICE.fr.titre }),
    ).toBeTruthy();
    expect(article().lang).toBe('fr');
    expect(await screen.findByText(NOTICE.valeurs.fr.transferts)).toBeTruthy();
    for (const section of GABARIT_DE_NOTICE.fr.sections) {
      expect(screen.getByRole('heading', { level: 3, name: section.titre })).toBeTruthy();
    }
    expect(
      screen.getByRole('button', { name: textes.fr.langue_fr }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: textes.fr.langue_de }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('notice_bascule_de_langue', async () => {
    afficher('de');
    expect(
      screen.getByRole('heading', { level: 2, name: GABARIT_DE_NOTICE.de.titre }),
    ).toBeTruthy();
    expect(article().lang).toBe('de');
    expect(await screen.findByText(NOTICE.valeurs.de.transferts)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: textes.de.langue_fr }));

    expect(
      screen.getByRole('heading', { level: 2, name: GABARIT_DE_NOTICE.fr.titre }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('heading', { level: 2, name: GABARIT_DE_NOTICE.de.titre }),
    ).toBeNull();
    expect(article().lang).toBe('fr');
    expect(within(article()).getByText(GABARIT_DE_NOTICE.fr.sections[0]?.titre ?? '')).toBeTruthy();
    expect(within(article()).getByText(NOTICE.valeurs.fr.transferts)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: textes.de.langue_fr }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: textes.de.langue_de }).getAttribute('aria-pressed'),
    ).toBe('false');

    fireEvent.click(screen.getByRole('button', { name: textes.de.langue_de }));

    expect(
      screen.getByRole('heading', { level: 2, name: GABARIT_DE_NOTICE.de.titre }),
    ).toBeTruthy();
    expect(article().lang).toBe('de');
  });

  it('notice_ne_demande_que_ses_valeurs', async () => {
    afficher('de');
    expect(await screen.findByText(NOTICE.valeurs.de.transferts)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: textes.de.langue_fr }));
    fireEvent.click(screen.getByRole('button', { name: textes.de.langue_de }));

    // Une seule requête, celle des valeurs : la bascule de langue ne relit rien.
    expect(requetes).toHaveBeenCalledTimes(1);
    expect(String(requetes.mock.calls[0]?.[0])).toBe('/api/notice');
    expect(requetes.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET');
  });

  it('notice_hors_ligne_sans_copie_dit_qu_elle_attend_le_reseau', async () => {
    servie = undefined;
    afficher('de');

    expect(await screen.findByText(textes.de.notice_hors_ligne)).toBeTruthy();
    // Le titre reste, et rien d'autre : ni introduction, ni section, ni erreur.
    expect(
      screen.getByRole('heading', { level: 2, name: GABARIT_DE_NOTICE.de.titre }),
    ).toBeTruthy();
    expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([]);
    expect(screen.queryByRole('alert')).toBeNull();
    // La phrase suit la langue de la notice.
    fireEvent.click(screen.getByRole('button', { name: textes.de.langue_fr }));
    expect(within(article()).getByText(textes.fr.notice_hors_ligne)).toBeTruthy();
    // Pas de nouvel essai en boucle : une seule requête.
    await new Promise((resolu) => setTimeout(resolu, 50));
    expect(requetes).toHaveBeenCalledTimes(1);
  });

  it('notice_hors_ligne_montre_la_copie', async () => {
    // Une visite précédente a rangé la copie : sans réseau, c'est elle qui s'affiche.
    const copie = avecTransferts('Une copie gardée sur l’appareil.');
    await page.base?.put('etat', { cle: 'notice', valeur: copie });
    servie = undefined;
    afficher('fr');

    expect(await screen.findByText('Une copie gardée sur l’appareil.')).toBeTruthy();
    await waitFor(() => expect(requetes).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(textes.fr.notice_hors_ligne)).toBeNull();
  });

  it('notice_reponse_du_serveur_remplace_la_copie', async () => {
    await page.base?.put('etat', {
      cle: 'notice',
      valeur: avecTransferts('Une copie gardée sur l’appareil.'),
    });
    servie = avecTransferts('Une réponse plus récente du serveur.');
    afficher('fr');

    expect(await screen.findByText('Une réponse plus récente du serveur.')).toBeTruthy();
    expect(screen.queryByText('Une copie gardée sur l’appareil.')).toBeNull();
  });

  it('notice_affiche_une_valeur_balisee_en_texte', async () => {
    // Une valeur n'est jamais interprétée : une balise s'affiche telle quelle, un trou aussi.
    servie = avecTransferts('<b>x</b> {tunnel}');
    afficher('fr');

    expect(await screen.findByText('<b>x</b> {tunnel}')).toBeTruthy();
    expect(article().querySelector('b')).toBeNull();
  });

  it('notice_liens_viennent_des_valeurs', async () => {
    afficher('fr');

    // Des liens ordinaires, tirés des valeurs : une navigation quand on les touche.
    const contact = await screen.findByRole('link', { name: 'contact@exemple.test' });
    expect(contact.getAttribute('href')).toBe('mailto:contact@exemple.test');
    expect(screen.getByRole('link', { name: 'protection.exemple.test' }).getAttribute('href')).toBe(
      'https://protection.exemple.test',
    );
    fireEvent.click(screen.getByRole('button', { name: textes.fr.langue_de }));
    expect(screen.getByRole('link', { name: 'contact@exemple.test' }).getAttribute('href')).toBe(
      'mailto:contact@exemple.test',
    );
  });

  it('notice_ne_fait_pas_un_lien_d_une_cible_non_admise', async () => {
    // Le serveur refuse ces cibles au chargement ; l'écran ne les suit pas davantage.
    servie = {
      ...NOTICE,
      liens: [{ texte: 'contact@exemple.test', cible: 'javascript:alert(1)' }],
    };
    afficher('fr');

    expect(await screen.findByText(NOTICE.valeurs.fr.transferts)).toBeTruthy();
    expect(screen.queryAllByRole('link')).toEqual([]);
    expect(article().textContent).toContain('contact@exemple.test');
  });
});
