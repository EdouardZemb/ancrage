/*
 * Les gestes communs de l'écran d'un cours, pour les tests de bout en bout : ouvrir un onglet,
 * répondre à des cartes, lire un compteur (les réponses du jour dans « Übersicht », le total dans
 * « Fortschritt ») et l'état de la synchronisation.
 *
 * Et, dans « Heute », le compte de la séance, la réponse à la question de tête et le résultat final.
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

/** Ce que « Heute » dit de la séance : ses dues, ses cartes neuves, et la file (faites, restantes). */
export async function compteDeHeute(page: Page): Promise<{
  dues: number;
  neues: number;
  faites: number;
  restantes: number;
}> {
  // biome-ignore lint/performance/useDomNodeTextContent: `innerText` respecte la mise en page, que `lireNombre` lit.
  const texte = await ongletCourant(page).innerText();
  const lire = (modele: string, nom: string) => lireNombre(texte, modele, nom) ?? Number.NaN;
  return {
    dues: lire(de.heute_compte, 'dues'),
    neues: lire(de.heute_compte, 'neues'),
    faites: lire(de.heute_progression, 'faites'),
    restantes: lire(de.heute_progression, 'restantes'),
  };
}

/** Le résultat que dit l'écran de fin de « Heute » (« 5 von 7 richtig. »), ou `undefined` sans lui. */
export async function resultatDeHeute(
  page: Page,
): Promise<{ justes: number; faites: number } | undefined> {
  // biome-ignore lint/performance/useDomNodeTextContent: `innerText` respecte la mise en page, que `lireNombre` lit.
  const texte = await ongletCourant(page).innerText();
  const justes = lireNombre(texte, de.heute_resultat, 'justes');
  const faites = lireNombre(texte, de.heute_resultat, 'faites');
  return justes === undefined || faites === undefined ? undefined : { justes, faites };
}

/** Le genre de la question de tête de « Heute ». */
export type GenreDeHeute = 'carte' | 'mot' | 'point' | 'exercice' | 'fermee';

/**
 * Répond à la question de tête de « Heute », quel que soit son genre, puis passe à la suivante :
 * une carte se retourne et se dit sue (ou, saisie, se vérifie à vide) ; un mot se décompose en
 * choisissant la première proposition, ou se bâtit d'une tuile ; un point, un exercice et une
 * question de fiche reçoivent la première proposition, ou une saisie quelconque. Rend le genre.
 */
export async function repondreALaTete(page: Page): Promise<GenreDeHeute> {
  const cours = ongletCourant(page);
  const visible = (cible: Locator) => cible.isVisible();
  const bouton = (nom: string) => cours.getByRole('button', { name: nom, exact: true });
  const premiereProposition = cours.locator('.options button:enabled').first();
  // La question est posée : une carte, ou l'écran de fin, que l'appelant a déjà écarté.
  await expect(cours.locator('.card').first()).toBeVisible();

  const retourner = cours.getByRole('button', { name: de.cartes_retourner });
  if (await visible(retourner)) {
    await retourner.click();
    await bouton(de.cartes_su).click();
    return 'carte';
  }
  if (await visible(cours.getByLabel(de.cartes_saisie_etiquette))) {
    await bouton(de.cartes_verifier).click();
    await bouton(de.cartes_suivante).click();
    return 'carte';
  }
  if (await visible(cours.locator('.tiles'))) {
    await cours.locator('.tiles .tile:enabled').first().click();
    await bouton(de.pruefen).click();
    await bouton(de.suivante).click();
    return 'mot';
  }
  if (await visible(cours.locator('.word'))) {
    // Une partie après l'autre, jusqu'au mot fini (un mot a quelques parties).
    for (let partie = 0; partie < 8 && !(await visible(bouton(de.suivante))); partie++) {
      await premiereProposition.click();
    }
    await bouton(de.suivante).click();
    return 'mot';
  }
  if (await visible(cours.locator('svg.sv'))) {
    await premiereProposition.click();
    await bouton(de.suivante).click();
    return 'point';
  }
  if (await visible(cours.getByLabel(de.exercices_antwort))) {
    await cours.getByLabel(de.exercices_antwort).fill('x');
    await bouton(de.pruefen).click();
    await bouton(de.suivante).click();
    return 'exercice';
  }
  // Des propositions : un exercice à options (sa ligne d'aide le dit), sinon une question de fiche.
  const exercice = await visible(cours.getByText(de.exercices_hinweis, { exact: true }));
  await premiereProposition.click();
  await bouton(de.suivante).click();
  return exercice ? 'exercice' : 'fermee';
}
