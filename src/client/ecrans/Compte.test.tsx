// @vitest-environment happy-dom
/*
 * L'écran du compte et la mise à jour de l'application (2b-D5) : une déconnexion ou une
 * suppression du compte en cours est une séance retenue, qu'un rechargement couperait. Le reste de
 * l'écran est éprouvé dans l'application entière (`App.test.tsx`).
 */
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import type { Moi } from '../api.js';
import { contexteAppDeTest, rendreDansLApp } from '../contexte.fixture.js';
import { seanceEnCours } from '../seance.js';
import { deconnecter, supprimerLeCompte } from '../session-locale.js';
import { textes } from '../textes.js';
import { Compte } from './Compte.js';

// La liste des cours, vide ; la déconnexion et la suppression, que le test tient en suspens ; ni
// base locale ni rechargement de la page.
vi.mock('../api.js', async (original) => ({
  ...(await original<typeof import('../api.js')>()),
  listerCours: vi.fn(async () => []),
}));
vi.mock('../session-locale.js', async (original) => ({
  ...(await original<typeof import('../session-locale.js')>()),
  deconnecter: vi.fn(),
  supprimerLeCompte: vi.fn(),
}));
vi.mock('../stockage/base-de-la-page.js', () => ({
  baseDeLaPage: () => Promise.reject(new Error('base de test absente')),
}));
vi.mock('../routeur.js', async (original) => ({
  ...(await original<typeof import('../routeur.js')>()),
  rechargerSur: vi.fn(),
}));

afterEach(cleanup);

const t = textes.fr;
const MOI: Moi = {
  id: 'p-lernende',
  nomAffiche: 'Lernende Test',
  langue: 'fr',
  proprietaire: false,
};

/** Une opération que le test règle lui-même : elle reste en cours jusque-là. */
function enSuspens<T>() {
  let reussir: (valeur: T) => void = () => {};
  let echouer: (erreur: Error) => void = () => {};
  const promesse = new Promise<T>((resolve, reject) => {
    reussir = resolve;
    echouer = reject;
  });
  return { promesse, reussir, echouer };
}

it('compte_occupe_retient_la_version', async () => {
  rendreDansLApp(<Compte />, contexteAppDeTest({ moi: MOI }));
  expect(seanceEnCours()).toBeNull();

  // La déconnexion en cours : la nouvelle version attend.
  const deconnexion = enSuspens<void>();
  vi.mocked(deconnecter).mockReturnValueOnce(deconnexion.promesse);
  fireEvent.click(screen.getByRole('button', { name: t.deconnexion }));
  await waitFor(() => expect(seanceEnCours()).toBe('retenue'));
  // Elle échoue (des réponses attendent, le réseau manque) : l'écran n'est plus occupé, la séance
  // s'efface.
  deconnexion.echouer(new Error('hors ligne'));
  await waitFor(() => expect(seanceEnCours()).toBeNull());

  // La suppression du compte, de même, jusqu'à sa fin.
  const suppression = enSuspens<'complet'>();
  vi.mocked(supprimerLeCompte).mockReturnValueOnce(suppression.promesse);
  fireEvent.click(screen.getByRole('button', { name: t.suppression_bouton }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t.suppression_confirmer}`) }));
  await waitFor(() => expect(seanceEnCours()).toBe('retenue'));
  suppression.reussir('complet');
  await waitFor(() => expect(seanceEnCours()).toBeNull());
});
