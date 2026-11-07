/*
 * Une base locale pour les tests : IndexedDB est simulée en mémoire (`fake-indexeddb`), et chaque
 * base porte un nom unique, si bien que deux tests ne partagent rien. Exclu de la construction,
 * comme tout `*.fixture.ts`.
 */
import 'fake-indexeddb/auto';
import { type BaseLocale, ouvrirBaseLocale } from './base-locale.js';

const ouvertes: BaseLocale[] = [];

export async function ouvrirBaseDeTest(): Promise<BaseLocale> {
  const base = await ouvrirBaseLocale(`ancrage-test-${crypto.randomUUID()}`);
  ouvertes.push(base);
  return base;
}

/**
 * Une seconde connexion à la même base, comme celle du service worker à côté de celle de la page :
 * deux écrivains, une seule base.
 */
export async function ouvrirAutreConnexion(base: BaseLocale): Promise<BaseLocale> {
  const autre = await ouvrirBaseLocale(base.name);
  ouvertes.push(autre);
  return autre;
}

/** À appeler après chaque test : ferme les bases que `ouvrirBaseDeTest` a ouvertes. */
export function fermerLesBasesDeTest(): void {
  for (const base of ouvertes.splice(0)) base.close();
}
