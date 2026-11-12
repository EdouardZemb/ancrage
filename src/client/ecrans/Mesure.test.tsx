// @vitest-environment happy-dom
/*
 * L'écran de mesure du rejeu (M3-P7) : rien ne se mesure à l'ouverture, les durées s'affichent au
 * bouton, les 30 000 réponses demandent une confirmation, et l'écran ne touche ni l'API ni le
 * stockage de l'appareil.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlgorithmeMesure } from '../../domaine/progression/mesure-rejeu.js';
import { Mesure } from './Mesure.js';

const DUREES: Record<AlgorithmeMesure, number> = { leitner: 1.5, fsrs: 40, 'par-chapitre': 20.25 };

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function ligneDe(taille: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(`^${taille}`) });
}

describe('écran de mesure', () => {
  it('ne_mesure_rien_a_l_ouverture', () => {
    const mesurer = vi.fn((_taille: number) => DUREES);

    render(<Mesure mesurer={mesurer} />);

    expect(mesurer).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 2 })).toBeTruthy();
    expect(within(ligneDe('1 000')).getAllByText('—')).toHaveLength(3);
  });

  it('affiche_la_mediane_de_chaque_algorithme_au_bouton', async () => {
    const mesurer = vi.fn((_taille: number) => DUREES);
    render(<Mesure mesurer={mesurer} />);

    fireEvent.click(screen.getByRole('button', { name: /Mesurer 10 000/ }));

    await waitFor(() => expect(within(ligneDe('10 000')).getByText('40 ms')).toBeTruthy());
    expect(mesurer).toHaveBeenCalledTimes(1);
    expect(mesurer.mock.calls[0]?.[0]).toBe(10000);
    expect(within(ligneDe('10 000')).getByText('1,5 ms')).toBeTruthy();
    expect(within(ligneDe('10 000')).getByText('20,3 ms')).toBeTruthy();
    // Les autres tailles ne sont pas mesurées.
    expect(within(ligneDe('1 000')).getAllByText('—')).toHaveLength(3);
  });

  it('dit_mesure_en_cours_avant_le_calcul', async () => {
    vi.useFakeTimers();
    const mesurer = vi.fn((_taille: number) => DUREES);
    render(<Mesure mesurer={mesurer} />);

    fireEvent.click(screen.getByRole('button', { name: /Mesurer 1 000/ }));

    // Le rendu a eu lieu, le calcul n'a pas commencé.
    expect(screen.getByText(/mesure en cours/i)).toBeTruthy();
    expect(mesurer).not.toHaveBeenCalled();
    expect(
      (screen.getByRole('button', { name: /Mesurer 10 000/ }) as HTMLButtonElement).disabled,
    ).toBe(true);

    await vi.runAllTimersAsync();

    expect(mesurer).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/mesure en cours/i)).toBeNull();
  });

  it('avertit_avant_les_trente_mille_reponses_et_ne_mesure_qu_apres_confirmation', async () => {
    const mesurer = vi.fn((_taille: number) => DUREES);
    render(<Mesure mesurer={mesurer} />);

    fireEvent.click(screen.getByRole('button', { name: /Mesurer 30 000/ }));

    expect(screen.getByText(/se figer/i)).toBeTruthy();
    expect(mesurer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Annuler/ }));
    expect(screen.queryByText(/se figer/i)).toBeNull();
    expect(mesurer).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /Mesurer 30 000/ }));
    fireEvent.click(screen.getByRole('button', { name: /Lancer la mesure/ }));

    await waitFor(() => expect(mesurer).toHaveBeenCalledTimes(1));
    expect(mesurer.mock.calls[0]?.[0]).toBe(30000);
    await waitFor(() => expect(within(ligneDe('30 000')).getByText('40 ms')).toBeTruthy());
    expect(screen.queryByText(/se figer/i)).toBeNull();
  });

  it('dit_l_appareil_tel_que_le_navigateur_le_nomme', () => {
    render(<Mesure mesurer={() => DUREES} />);

    expect(screen.getByText(navigator.userAgent)).toBeTruthy();
  });

  it('n_appelle_ni_l_api_ni_le_stockage_de_l_appareil_meme_en_mesurant_pour_de_bon', async () => {
    const fetchEspion = vi.fn();
    vi.stubGlobal('fetch', fetchEspion);
    const ouvrir = vi.fn();
    vi.stubGlobal('indexedDB', { open: ouvrir });
    const stockage = vi.spyOn(Storage.prototype, 'setItem');
    render(<Mesure />);

    fireEvent.click(screen.getByRole('button', { name: /Mesurer 1 000/ }));

    await waitFor(() => expect(screen.queryByText(/mesure en cours/i)).toBeNull());
    expect(within(ligneDe('1 000')).queryByText('—')).toBeNull();
    expect(fetchEspion).not.toHaveBeenCalled();
    expect(ouvrir).not.toHaveBeenCalled();
    expect(stockage).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('aucun_ecran_ne_renvoie_vers_la_mesure', () => {
    // Un outil du responsable : on l'ouvre par son adresse, jamais depuis un écran.
    const sources: string[] = [];
    const parcourir = (dossier: string): void => {
      for (const entree of readdirSync(dossier, { withFileTypes: true })) {
        const chemin = join(dossier, entree.name);
        if (entree.isDirectory()) parcourir(chemin);
        else if (/\.tsx?$/.test(entree.name) && !/\.(test|fixture)\./.test(entree.name)) {
          if (/['"`]\/mesure/.test(readFileSync(chemin, 'utf8'))) sources.push(entree.name);
        }
      }
    };
    parcourir(join(process.cwd(), 'src', 'client'));

    // Le routeur lit `mesure` sans barre, et aucun lien n'écrit le chemin.
    expect(sources).toEqual([]);
  });
});
