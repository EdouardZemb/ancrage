/*
 * Un contexte d'application factice pour les tests d'écran : la langue et ses textes, la personne,
 * et des fonctions espionnes (`vi.fn`) à la place de la relecture de la session et de la
 * déconnexion. Exclu de la construction, comme tout `*.fixture.*`.
 */
import { render } from '@testing-library/preact';
import type { ComponentChild } from 'preact';
import { vi } from 'vitest';
import type { Moi } from './api.js';
import { ContexteApp } from './contexte.js';
import { type Langue, textes } from './textes.js';

/**
 * Le contexte d'un écran : en français et sans personne par défaut. `definirMoi` se donne quand le
 * test l'observe ; sinon, c'est une fonction espionne neuve.
 */
export function contexteAppDeTest(
  options: { langue?: Langue; moi?: Moi; definirMoi?: ContexteApp['definirMoi'] } = {},
): ContexteApp {
  const langue = options.langue ?? 'fr';
  const { moi } = options;
  return {
    langue,
    t: textes[langue],
    moi,
    actualiserMoi: vi.fn(async () => moi),
    definirMoi: options.definirMoi ?? vi.fn(),
    fermerSession: vi.fn(),
  };
}

/** `enfant` dans ce contexte, pour `render` ou `rerender`. */
export function dansLApp(enfant: ComponentChild, contexte: ContexteApp) {
  return <ContexteApp.Provider value={contexte}>{enfant}</ContexteApp.Provider>;
}

/** Affiche `enfant` dans ce contexte. */
export function rendreDansLApp(enfant: ComponentChild, contexte: ContexteApp) {
  return render(dansLApp(enfant, contexte));
}
