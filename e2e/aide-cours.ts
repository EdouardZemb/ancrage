/*
 * Les gestes communs de l'écran d'un cours, pour les tests de bout en bout : ouvrir un onglet,
 * répondre à des cartes, lire un compteur (les réponses du jour dans « Übersicht », le total dans
 * « Fortschritt ») et l'état de la synchronisation.
 *
 * Les libellés et les phrases viennent de `textes-cours.ts` : le test suit l'interface, pas une
 * copie de ses mots. Un compteur se lit dans la phrase qui le porte, d'après son modèle.
 */
import { expect, type Locator, type Page, type Request } from '@playwright/test';
import { TEXTES_COURS } from '../src/client/cours/textes-cours.js';

const de = TEXTES_COURS.de;

/** L'état de la synchronisation, en tête du cours (« Gespeichert in deinem Konto »…). */
export function etatSynchro(page: Page): Locator {
  return page.getByTestId('etat-synchro');
}

/**
 * Attend un envoi de réponses au journal du cours (`POST /api/cours/<id>/journal`) qui échoue,
 * faute de réseau : la synchronisation a été tentée, et la file a gardé les réponses.
 */
export function envoiEchoue(page: Page, timeout: number): Promise<Request> {
  return page.waitForEvent('requestfailed', {
    predicate: (requete) =>
      requete.method() === 'POST' &&
      /^\/api\/cours\/[^/]+\/journal$/.test(new URL(requete.url()).pathname),
    timeout,
  });
}

/** L'onglet affiché. */
function ongletCourant(page: Page): Locator {
  return page.locator('#onglet-courant');
}

/** Ouvre un onglet du cours par son identifiant (`apercu`, `cartes`, `progression`…). */
export async function ouvrirOnglet(page: Page, onglet: string): Promise<void> {
  const bouton = page.locator(`#onglet-${onglet}`);
  await bouton.click();
  await expect(bouton).toHaveAttribute('aria-selected', 'true');
}

/**
 * La valeur du repère `{nom}` dans `texte`, lue d'après la phrase `modele` où chaque repère est un
 * nombre ; `undefined` si la phrase n'y est pas.
 */
function lireNombre(texte: string, modele: string, nom: string): number | undefined {
  const echapper = (morceau: string) => morceau.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Les morceaux pairs sont le texte de la phrase, les impairs les noms de ses repères.
  const source = modele
    .split(/\{([a-z_]+)\}/)
    .map((morceau, i) => (i % 2 === 0 ? echapper(morceau) : `(?<${morceau}>\\d+)`))
    .join('');
  const valeur = new RegExp(source).exec(texte)?.groups?.[nom];
  return valeur === undefined ? undefined : Number(valeur);
}

/**
 * Le nombre de réponses du jour que dit « Übersicht » (« … · 3 Antworten heute. »). L'onglet doit
 * être ouvert ; à lire par `expect.poll`, qui attend que le journal soit à jour.
 */
export async function reponsesDuJour(page: Page): Promise<number | undefined> {
  // biome-ignore lint/performance/useDomNodeTextContent: `innerText` respecte la mise en page, que `lireNombre` lit.
  return lireNombre(await ongletCourant(page).innerText(), de.apercu_serie, 'aujourdhui');
}

/**
 * Le nombre de réponses que dit « Fortschritt » (« 7 Antworten insgesamt »). L'onglet doit être
 * ouvert ; à lire par `expect.poll`.
 */
export async function reponsesAuTotal(page: Page): Promise<number | undefined> {
  // biome-ignore lint/performance/useDomNodeTextContent: `innerText` respecte la mise en page, que `lireNombre` lit.
  return lireNombre(await ongletCourant(page).innerText(), de.progression_antworten, 'n');
}

/** Tout ce que dit « Übersicht » : ses chiffres, sa série, ses chapitres. L'onglet est ouvert. */
export function chiffresDeLApercu(page: Page): Promise<string> {
  // biome-ignore lint/performance/useDomNodeTextContent: `innerText` respecte la mise en page, que `lireNombre` lit.
  return ongletCourant(page).innerText();
}

/**
 * Répond « Gewusst » à `n` cartes de la série de Karteikarten : chaque carte est retournée, puis
 * jugée sue. La saisie (« Begriffe eintippen ») est décochée d'abord : une carte inverse se
 * retourne alors aussi, et la réponse ne dépend pas de la carte tirée. Chaque réponse est comptée
 * par la série avant la suivante.
 */
export async function repondreGewusst(page: Page, n: number): Promise<void> {
  await ouvrirOnglet(page, 'cartes');
  await page.getByRole('checkbox', { name: de.cartes_saisie }).uncheck();
  const progression = page.locator('.cours .progressline');
  const faites = async () =>
    lireNombre((await progression.textContent()) ?? '', de.cartes_progression, 'faites');
  const avant = (await faites()) ?? 0;
  for (let i = 1; i <= n; i++) {
    await page.getByRole('button', { name: de.cartes_retourner }).click();
    // `exact` : « Nicht gewusst » contient aussi « gewusst ».
    await page.getByRole('button', { name: de.cartes_su, exact: true }).click();
    await expect.poll(faites, { message: 'cartes répondues dans la série' }).toBe(avant + i);
  }
}
