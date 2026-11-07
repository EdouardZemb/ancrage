/*
 * Le parcours d'un compte sur Android (Pixel 7), de bout en bout. Le propriétaire crée son compte
 * par le lien de la ligne de commande (`amorcage.ts`) et invite une personne en lui ouvrant le
 * cours d'exemple (S1-D11). Elle crée son compte, se déconnecte (sa session est alors supprimée sur
 * le serveur) et se reconnecte. Le propriétaire lui crée ensuite un lien de secours, qu'elle ouvre
 * sur un nouveau téléphone. Depuis celui-ci, elle voit ses deux téléphones et supprime, en
 * confirmant, la passkey de l'ancien.
 *
 * Puis elle révise sur ses deux téléphones, dont la session reste ouverte : en ligne sur le premier,
 * hors ligne sur les deux (le service worker sert l'application, IndexedDB le cours et le
 * journal), et au retour du réseau chacun retrouve les réponses de l'autre (le critère du cadrage :
 * une révision faite hors ligne est retrouvée sur un second appareil). Enfin, chaque onglet du cours
 * reçoit une réponse, sans défilement horizontal. Le journal ne compte que les réponses de ce
 * parcours : avant l'étape 9, aucun onglet n'en a reçu.
 *
 * Enfin, les droits de la personne sur ses données (lot 1e) : la notice de confidentialité, que le
 * pied de page ouvre sans compte et qui bascule de langue (étape 13) ; son nom affiché, qu'elle
 * change (14) ; l'export de ses données, en pièce jointe, avec ses sessions et ses passkeys (15) ;
 * la déconnexion que des réponses en attente retiennent, quand le propriétaire a fermé ses
 * sessions, puis l'abandon de ces réponses, que le journal du serveur ne reçoit jamais (16 et 17) ;
 * la suppression de son compte (17) ; les passkeys que l'administration montre (18).
 *
 * Il n'y a qu'un cours : chaque connexion mène à lui (décision 4 du lot 1d). Le compte, et par lui
 * les appareils et l'administration, s'ouvrent par le lien de l'en-tête.
 *
 * Chaque téléphone est un contexte neuf (ses cookies) avec son authentificateur (ses passkeys).
 * Le cours d'exemple a une dérogation de diffusion : un groupe pourrait l'ouvrir (invariant 9). Le
 * droit reste pourtant personnel, porté par l'invitation : la base est neuve et n'a aucun groupe,
 * et une invitation n'ouvre jamais un cours à un groupe (`routes-auth.ts`). C'est ce droit que
 * l'étape 5 lit dans la fiche de l'invitée.
 *
 * Les libellés viennent de `textes.ts` : le test suit l'interface, pas une copie de ses mots.
 *
 * Sur tout le parcours, aucune page ni aucun service worker d'aucun téléphone n'enfreint la
 * politique de sécurité du contenu (R37, `aide-csp.ts`), la console du service worker comprise.
 */
import { readFile } from 'node:fs/promises';
import {
  type BrowserContext,
  devices,
  expect,
  type Locator,
  type Page,
  request,
  test,
} from '@playwright/test';
import { formater, TEXTES_COURS } from '../src/client/cours/textes-cours.js';
import { textes, textesAdmin } from '../src/client/textes.js';
import { GABARIT_DE_NOTICE } from '../src/domaine/notice-gabarit.js';
import { NOM_COOKIE_SESSION } from '../src/serveur/comptes/cookie.js';
import type { ExportPersonne } from '../src/serveur/comptes/export.js';
import {
  chiffresDeLApercu,
  envoiEchoue,
  etatSynchro,
  ouvrirOnglet,
  repondreGewusst,
  reponsesAuTotal,
  reponsesDuJour,
} from './aide-cours.js';
import { aucuneViolation, surveillerLaCsp } from './aide-csp.js';
import {
  essayerLaSante,
  pageControlee,
  retourDuReseau,
  serviceWorkerActif,
} from './aide-hors-ligne.js';
import { sansDefilementHorizontal } from './aide-mise-en-page.js';
import { ajouterAuthentificateur } from './aide-webauthn.js';

const PROPRIETAIRE = 'Prüfer Test';
const LERNENDE = 'Lernende Test';
/** Le titre du cours d'exemple (S1-D11), que le serveur sert sans contenu monté. */
const COURS = 'Küchenwörter (Beispielkurs)';
/** Le nom que l'invitée se donne à l'étape 14. */
const RENOMMEE = 'Schülerin Test';

const fr = textes.fr;
const de = textes.de;

/** L'attente d'une synchronisation qui part 3 s après la dernière réponse (décision 15). */
const DELAI_SYNCHRO_APRES_REPONSE_MS = 15_000;

/** La réponse tapée aux questions de l'examen : fausse partout, et plus large que l'écran. */
const REPONSE_FAUSSE_ET_LONGUE =
  'Das Blech mit dem Kuchenteig kommt erst nach dem Vorheizen in den Ofen';

const parcours = test.extend<{
  /** Un téléphone neuf, dont la langue est `langue` (`navigator.language`). */
  telephone: (langue: string) => Promise<Page>;
}>({
  telephone: async ({ browser, baseURL }, use) => {
    const contextes: BrowserContext[] = [];
    const violations: string[][] = [];
    await use(async (langue) => {
      const contexte = await browser.newContext({ ...devices['Pixel 7'], baseURL, locale: langue });
      contextes.push(contexte);
      violations.push(await surveillerLaCsp(contexte));
      const page = await contexte.newPage();
      await ajouterAuthentificateur(page);
      return page;
    });
    await Promise.all(contextes.map((contexte) => contexte.close()));
    aucuneViolation(violations.flat());
  },
});

function titre(page: Page, nom: string): Locator {
  return page.getByRole('heading', { name: nom });
}

function cours(page: Page): Locator {
  return page.getByTestId('liste-cours').getByRole('listitem');
}

/** La fiche d'une personne dans l'administration, d'après son nom affiché. */
function fiche(page: Page, nom: string): Locator {
  return page.getByTestId('liste-personnes').getByRole('listitem').filter({ hasText: nom });
}

/** Les passkeys que l'administration montre dans la fiche d'une personne. */
function passkeysDeLaFiche(laFiche: Locator): Locator {
  return laFiche.getByRole('list', { name: textesAdmin.passkeys_titre }).getByRole('listitem');
}

/** L'adresse d'un cours : `/cours/` et l'identifiant du cours, huit chiffres ou minuscules. */
function adresseDuCours(origine: string): RegExp {
  const echappee = origine.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${echappee}/cours/[0-9a-z]{8}$`);
}

/**
 * Après une connexion, on arrive sur le cours : son titre en tête, ses onglets, et l'état de la
 * synchronisation, qui finit à jour (le journal du serveur a répondu).
 */
async function surLeCours(page: Page, origine: string): Promise<void> {
  await expect(page).toHaveURL(adresseDuCours(origine));
  await expect(titre(page, COURS)).toBeVisible();
  await expect(page.getByRole('tablist')).toBeVisible();
  await expect(etatSynchro(page)).toHaveText(TEXTES_COURS.de.synchro_a_jour);
}

/**
 * Le titre du cours a l'allure du titre du prototype (1,6 rem, graisse 800), et non celle d'un
 * intertitre (« Kapitel », 1,1 rem, graisse 700).
 */
async function titreDuCoursEnGrand(page: Page): Promise<void> {
  const { taille, graisse } = await titre(page, COURS).evaluate((element) => {
    const style = getComputedStyle(element);
    return { taille: Number.parseFloat(style.fontSize), graisse: Number(style.fontWeight) };
  });
  expect(taille, 'taille du titre du cours, en px').toBeGreaterThanOrEqual(24);
  expect(graisse, 'graisse du titre du cours').toBeGreaterThanOrEqual(800);
}

/**
 * Sur un téléphone (412 px), la barre des onglets défile. Ouvert par son adresse (la page
 * rechargée sur « Fortschritt », le dernier onglet), l'onglet choisi y est ramené entier : la barre
 * a défilé d'elle-même, sans que rien ne prenne le focus (R40).
 */
async function ongletChoisiDansLaBarre(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/progression$/);
  await page.reload();
  const onglet = page.locator('#onglet-progression');
  await expect(onglet).toHaveAttribute('aria-selected', 'true');
  const place = () =>
    onglet.evaluate((element) => {
      const barre = element.closest('[role="tablist"]') as HTMLElement;
      const boite = element.getBoundingClientRect();
      const vue = barre.getBoundingClientRect();
      return {
        deborde: barre.scrollWidth > barre.clientWidth,
        entier: boite.left >= vue.left - 0.5 && boite.right <= vue.right + 0.5,
        focus: document.activeElement === element,
      };
    });
  await expect.poll(place, { message: 'onglet choisi dans la barre' }).toEqual({
    deborde: true,
    entier: true,
    focus: false,
  });
}

/**
 * Au clavier, l'anneau de focus d'un onglet se voit en entier : la barre d'onglets défile à
 * l'horizontale, et une boîte qui défile rogne tout ce qui dépasse de sa boîte intérieure, en haut
 * et en bas aussi (WCAG 2.4.7). On va au premier onglet par Tab, puis on vérifie que le contour
 * (épaisseur et décalage compris) tient dans la barre.
 */
async function anneauDeFocusDesOngletsEntier(page: Page): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    const role = await page.evaluate(() => document.activeElement?.getAttribute('role'));
    if (role === 'tab') break;
  }
  await expect(page.getByRole('tab').first()).toBeFocused();
  const anneau = await page.evaluate(() => {
    const onglet = document.activeElement as HTMLElement;
    const barre = onglet.closest('[role="tablist"]') as HTMLElement;
    const style = getComputedStyle(onglet);
    const depasse = Number.parseFloat(style.outlineWidth) + Number.parseFloat(style.outlineOffset);
    const o = onglet.getBoundingClientRect();
    const b = barre.getBoundingClientRect();
    // La boîte intérieure de la barre : sans ses bordures. Un pixel de marge pour les arrondis.
    const haut = b.top + barre.clientTop - 1;
    const gauche = b.left + barre.clientLeft - 1;
    return {
      contour: style.outlineStyle,
      haut: o.top - depasse >= haut,
      bas: o.bottom + depasse <= haut + barre.clientHeight + 2,
      gauche: o.left - depasse >= gauche,
      droite: o.right + depasse <= gauche + barre.clientWidth + 2,
    };
  });
  expect(anneau).toEqual({ contour: 'solid', haut: true, bas: true, gauche: true, droite: true });
}

/** Ouvre le compte par le lien de l'en-tête. */
async function ouvrirLeCompte(page: Page, libelle: string, origine: string): Promise<void> {
  await page.getByRole('link', { name: libelle, exact: true }).click();
  await expect(page).toHaveURL(`${origine}/compte`);
}

/** Le nombre d'entrées de l'historique de navigation de la page. */
function historique(page: Page): Promise<number> {
  return page.evaluate(() => history.length);
}

/** Le lien vise l'écran attendu. Un échec ne l'affiche pas : c'est un secret. */
function verifierDebut(lien: string, debut: string): void {
  expect(lien.startsWith(debut), `le lien commence par ${debut}`).toBe(true);
}

/**
 * Le lien à usage unique que l'écran vient d'afficher, lu sur la page plutôt que par le menu de
 * partage ou le presse-papiers.
 */
async function lienAffiche(zone: Page | Locator, debut: string): Promise<string> {
  const affiche = zone.getByTestId('lien-genere');
  await expect(affiche).toBeVisible();
  const lien = (await affiche.textContent()) ?? '';
  verifierDebut(lien, debut);
  return lien;
}

/**
 * Le statut de `GET /api/moi` avec ce seul cookie de session, depuis un contexte de requête neuf :
 * ni le téléphone ni ses autres cookies n'interviennent.
 */
async function statutMoi(origine: string, session: string): Promise<number> {
  const contexte = await request.newContext({
    baseURL: origine,
    extraHTTPHeaders: { cookie: `${NOM_COOKIE_SESSION}=${session}` },
  });
  try {
    return (await contexte.get('/api/moi')).status();
  } finally {
    await contexte.dispose();
  }
}

/**
 * Le nombre d'événements que le serveur garde pour la personne de cette page, tous cours visibles
 * confondus. Il est lu dans son export (`GET /api/moi/export`, complet et sans pagination) avec la
 * session de la page : c'est le journal tel que le serveur le tient, que ni l'état de
 * l'application ni son IndexedDB ne peuvent fausser.
 */
async function evenementsDuServeur(page: Page): Promise<number> {
  const reponse = await page.request.get('/api/moi/export');
  expect(reponse.status(), 'statut de l’export').toBe(200);
  const donnees = (await reponse.json()) as ExportPersonne;
  return donnees.cours.reduce((somme, unCours) => somme + unCours.evenements.length, 0);
}

/**
 * Ce que montre l'onglet ouvert tient dans la marge de l'écran : rien ne dépasse la marge droite de
 * l'en-tête du cours, ni les listes de choix aux options longues, ni les cartes, ni un dessin de
 * schéma, ni un texte annoté, ni des tuiles, ni les boutons d'une feuille, ni une tâche avec ses
 * termes et ses zones. Et la page ne défile pas à l'horizontale.
 */
async function ongletDansLaMarge(page: Page, nom: string): Promise<void> {
  const { marge, droite } = await page.evaluate(() => {
    const bord = (element: Element | null) => element?.getBoundingClientRect().right ?? 0;
    const contenus = [
      '.cours select',
      '.cours .card',
      '.cours svg.sv',
      '.cours .study',
      '.cours .report',
      '.cours .done',
      '.cours .tiles',
      '.cours .slots',
      '.cours .options button',
      '.cours .verdict',
      '.cours .checks',
      '.cours .checks label',
      '.cours .confirm',
      '.cours form.typed',
      '.cours .table',
      '.cours .days',
      '.cours .boutons-feuille',
      '.cours .resultats',
      '.cours .tache',
      '.cours .pastille',
      '.cours .zone',
    ].join(', ');
    return {
      marge: bord(document.querySelector('.cours header.top')),
      droite: Math.max(...Array.from(document.querySelectorAll(contenus)).map(bord)),
    };
  });
  expect(droite, `bord droit de ${nom}`).toBeLessThanOrEqual(marge);
  await sansDefilementHorizontal(page);
}

/**
 * Chaque faute du résultat de l'examen se lit sur toute la largeur : la question, la réponse
 * attendue et la réponse donnée, l'une sous l'autre. Une réponse longue ne serre pas les deux
 * autres, et ne déborde pas.
 */
async function fautesSurTouteLaLargeur(page: Page, fautes: number): Promise<void> {
  const de = TEXTES_COURS.de;
  const table = page
    .getByRole('heading', { name: formater(de.examen_fehler, { n: fautes }) })
    .locator('xpath=following-sibling::div[1]');
  const largeurs = await table.evaluate((element) =>
    Array.from(element.children).map((ligne) => ({
      ligne: Math.round(ligne.getBoundingClientRect().width),
      cellules: Array.from(ligne.children).map((cellule) =>
        Math.round(cellule.getBoundingClientRect().width),
      ),
    })),
  );
  expect(largeurs).toHaveLength(fautes);
  for (const { ligne, cellules } of largeurs) {
    expect(cellules, 'question, réponse attendue, réponse donnée').toEqual([ligne, ligne, ligne]);
  }
}

/**
 * Ouvre un onglet du cours qui a des listes de choix, par son identifiant (`mots`...) : le titre
 * de certains onglets vient du contenu.
 */
async function ouvrirUnOnglet(page: Page, onglet: string): Promise<void> {
  await ouvrirOnglet(page, onglet);
  await expect(page.locator('.cours select').first()).toBeVisible();
}

/**
 * Les onglets Karteikarten et Quiz tiennent dans la marge de l'écran : leurs listes de choix, aux
 * options longues, n'élargissent pas la page au-delà de la marge droite de l'en-tête du cours. Une
 * question du quiz reçoit une réponse : la bonne s'affiche, et « Nächste Frage ».
 */
async function ongletsDeCartesDansLaMarge(page: Page): Promise<void> {
  const de = TEXTES_COURS.de;
  await ouvrirUnOnglet(page, 'cartes');
  await ongletDansLaMarge(page, `l'onglet ${de.onglet_cartes}`);
  await ouvrirUnOnglet(page, 'quiz');
  await ongletDansLaMarge(page, `l'onglet ${de.onglet_quiz}`);
  await page.locator('.cours .options button').first().click();
  await expect(page.locator('.cours .options button.right')).toHaveCount(1);
  await expect(page.getByRole('button', { name: de.quiz_suivante })).toBeVisible();
  await ongletDansLaMarge(page, `l'onglet ${de.onglet_quiz} (réponse)`);
}

/** Répond à la question en cours : le premier choix, ou une saisie. */
async function repondreAuHasard(page: Page): Promise<void> {
  const choix = page.locator('.cours .options button');
  if ((await choix.count()) > 0) {
    await choix.first().click();
    return;
  }
  await page.getByLabel(TEXTES_COURS.de.exercices_antwort).fill('x');
  await page.getByRole('button', { name: TEXTES_COURS.de.pruefen }).click();
}

/**
 * Les onglets Wortbaukasten, Schemata, Berichte et Grammatik tiennent dans la marge de l'écran
 * (412 px) : chaque exercice, chaque schéma dans ses trois modes (le dessin tient dans la largeur),
 * des tuiles posées, un bilan de bericht, un verdict de grammaire. Chacun reçoit des réponses : un
 * segment d'un mot, un nom d'un point de schéma, les termes (jetons) et les questions d'un bericht,
 * un exercice de chaque famille. Et, au clavier, un point d'un schéma se choisit par Entrée.
 */
async function exercicesAnnexesDansLaMarge(page: Page): Promise<void> {
  const de = TEXTES_COURS.de;

  await ouvrirUnOnglet(page, 'mots');
  await ongletDansLaMarge(page, 'Wortbaukasten (mélange)');
  const modeDesMots = page.getByLabel(de.choix_exercice);
  await modeDesMots.selectOption('zerlegen');
  await expect(page.locator('.cours .word')).toBeVisible();
  await page.locator('.cours .options button').first().click();
  await ongletDansLaMarge(page, 'Wortbaukasten (zerlegen)');
  await modeDesMots.selectOption('bilden');
  await expect(page.locator('.cours .tiles')).toBeVisible();
  const tuiles = page.locator('.cours .tiles .tile');
  for (let i = 0; i < 6; i++) await tuiles.nth(i).click();
  await ongletDansLaMarge(page, 'Wortbaukasten (bilden, tuiles posées)');

  await ouvrirUnOnglet(page, 'schemas');
  const schemas = page.getByLabel(de.schemas_choix, { exact: true });
  const modes = page.getByLabel(de.choix_exercice);
  const identifiants = await schemas
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(identifiants.length, 'schémas du cours').toBeGreaterThan(1);
  for (const identifiant of identifiants) {
    await schemas.selectOption(identifiant);
    for (const mode of ['benennen', 'zeigen', 'lernen']) {
      await modes.selectOption(mode);
      await expect(page.locator('.cours svg.sv')).toBeVisible();
      await ongletDansLaMarge(page, `Schemata ${identifiant} (${mode})`);
      // Le dessin tient dans la largeur de la carte (ou de la zone d'étude), sans la déborder.
      const { dessin, conteneur } = await page.evaluate(() => {
        const svg = document.querySelector('.cours svg.sv') as Element;
        const boite = svg.closest('.card, .study') as Element;
        return {
          dessin: svg.getBoundingClientRect().right,
          conteneur: boite.getBoundingClientRect().right,
        };
      });
      expect(dessin, `dessin ${identifiant} (${mode})`).toBeLessThanOrEqual(conteneur);
    }
  }
  // « Benennen » : un nom choisi pour le point numéroté, puis son verdict.
  await modes.selectOption('benennen');
  await page.locator('.cours .options button').first().click();
  await expect(page.locator('.cours .verdict')).toBeVisible();
  await ongletDansLaMarge(page, 'Schemata (verdict de Benennen)');
  // « Zeigen » au clavier : un point reçoit le focus, Entrée le choisit.
  await modes.selectOption('zeigen');
  const premierPoint = page.locator('.cours svg.sv .mk').first();
  await premierPoint.focus();
  await expect(premierPoint).toBeFocused();
  // Atteint au clavier (`:focus-visible`), le repère se voit : son trait s'épaissit.
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(premierPoint).toBeFocused();
  const traits = await page
    .locator('.cours svg.sv .mk circle')
    .evaluateAll((cercles) =>
      cercles.slice(0, 2).map((cercle) => Number.parseFloat(getComputedStyle(cercle).strokeWidth)),
    );
  expect(traits[0], 'trait du repère qui a le focus').toBeGreaterThan(traits[1]);
  await page.keyboard.press('Enter');
  await expect(page.locator('.cours .verdict')).toBeVisible();
  await ongletDansLaMarge(page, 'Schemata (verdict de Zeigen)');

  await ouvrirUnOnglet(page, 'textes');
  const nombreDeBerichts = await page.getByLabel(de.textes_choix).locator('option').count();
  expect(nombreDeBerichts, 'berichte du cours').toBeGreaterThan(1);
  await ongletDansLaMarge(page, 'Berichte (premier terme)');
  // Un bericht jusqu'à son bilan, ses termes traduits avec leur sens en dessous.
  while ((await page.locator('.cours .options button').count()) > 0) {
    await page.locator('.cours .options button').first().click();
  }
  await expect(page.locator('.cours .done')).toBeVisible();
  await ongletDansLaMarge(page, 'Berichte (bilan)');

  await ouvrirUnOnglet(page, 'exercices');
  const familles = page.getByLabel(de.choix_exercice);
  const codes = await familles
    .locator('option')
    .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value));
  expect(codes.length, 'familles de grammaire').toBeGreaterThan(2);
  for (const code of codes) {
    await familles.selectOption(code);
    await ongletDansLaMarge(page, `Grammatik ${code}`);
    await repondreAuHasard(page);
    await expect(page.locator('.cours .verdict')).toBeVisible();
    await ongletDansLaMarge(page, `Grammatik ${code} (verdict)`);
  }
}

/**
 * L'onglet Arbeitsblätter tient dans la marge de l'écran (412 px) : la liste des feuilles, puis la
 * Unit 1, « Bearbeiten » (ou « Neu beginnen », si le Quiz vient de poser une de ses questions :
 * les deux déroulent toute la fiche). Sa tâche 1 (un appariement) se résout au toucher : chaque
 * terme de la réserve, puis la première zone libre, et se juge.
 * Un terme de sa tâche 2 (un classement) se glisse à la souris dans une zone (`dragTo`).
 * Puis « Zurück » rend la liste, et « Ergebnis » de la Unit 1, entamée, ouvre la vue des résultats.
 */
async function feuillesDansLaMarge(page: Page): Promise<void> {
  const de = TEXTES_COURS.de;

  await ouvrirOnglet(page, 'feuilles');
  const unit1 = page
    .locator('.cours .chap')
    .filter({ has: page.locator('.num').getByText('1', { exact: true }) });
  await expect(unit1).toHaveCount(1);
  await ongletDansLaMarge(page, 'Arbeitsblätter (liste)');
  await unit1
    .getByRole('button', {
      name: new RegExp(`^(${de.feuilles_bearbeiten}|${de.feuilles_neu_beginnen})$`),
    })
    .click();

  // Tâche 1 : toucher un terme le choisit, toucher une zone l'y pose.
  const tache = page.locator('.cours .tache');
  const reserve = tache.locator('.reserve [data-terme]');
  const zoneLibre = tache.locator('.zone:not(:has(.poses)) [data-cible]').first();
  await expect(reserve.first()).toBeVisible();
  await ongletDansLaMarge(page, 'Arbeitsblätter (tâche 1)');
  const termes = await reserve.count();
  expect(termes, 'termes de la tâche 1').toBeGreaterThan(1);
  for (let restants = termes - 1; restants >= 0; restants--) {
    const terme = reserve.first();
    await terme.tap();
    await expect(terme).toHaveAttribute('aria-pressed', 'true');
    await zoneLibre.tap();
    await expect(reserve).toHaveCount(restants);
  }
  await expect(tache.locator('.poses [data-terme]')).toHaveCount(termes);
  await ongletDansLaMarge(page, 'Arbeitsblätter (tâche 1, termes posés)');
  await tache.getByRole('button', { name: de.pruefen }).tap();
  await expect(tache.locator('.zone.ok, .zone.ko')).toHaveCount(termes);
  await ongletDansLaMarge(page, 'Arbeitsblätter (tâche 1 jugée)');
  await page.getByRole('button', { name: de.suivante, exact: true }).tap();

  // Tâche 2 : un terme glissé de la réserve jusqu'à la première zone.
  await expect(tache.locator('.zone')).not.toHaveCount(0);
  const glisse = reserve.first();
  const id = await glisse.getAttribute('data-terme');
  const zone = tache.locator('.zone').first();
  await glisse.dragTo(zone.locator('[data-cible]'));
  await expect(zone.locator(`.poses [data-terme="${id}"]`)).toBeVisible();
  await expect(tache.locator(`.reserve [data-terme="${id}"]`)).toHaveCount(0);
  await ongletDansLaMarge(page, 'Arbeitsblätter (tâche 2, un terme glissé)');

  // La vue « Ergebnis » de la Unit 1, entamée : elle tient dans la marge, et n'écrit rien.
  await page.getByRole('button', { name: de.feuilles_zurueck, exact: true }).tap();
  await unit1.getByRole('button', { name: de.feuilles_ergebnis, exact: true }).tap();
  await expect(page.locator('.cours .resultats').first()).toBeVisible();
  await ongletDansLaMarge(page, 'Arbeitsblätter (Ergebnis)');
  await page.getByRole('button', { name: de.feuilles_zurueck, exact: true }).first().tap();
}

/**
 * Les onglets Prüfung et Fortschritt tiennent dans la marge de l'écran (412 px) : les réglages (une
 * case par chapitre), chacune des questions d'un examen (dont les schémas et les champs à taper),
 * la confirmation de la remise, le résultat avec ses groupes et ses fautes, chacune sur toute la
 * largeur, même avec une réponse tapée plus large que l'écran. Les erreurs révisées en
 * cartes, puis Fortschritt, avec sa frise de 14 jours et ses tableaux.
 */
async function examenEtProgressionDansLaMarge(page: Page): Promise<void> {
  const de = TEXTES_COURS.de;

  await ouvrirUnOnglet(page, 'examen');
  await expect(page.getByRole('heading', { name: de.examen_titre })).toBeVisible();
  await ongletDansLaMarge(page, 'Prüfung (réglages)');
  await page.getByLabel(de.examen_fragen).selectOption('20');
  await page.getByRole('button', { name: de.examen_starten }).click();

  const progression = page.locator('.cours .progressline');
  await expect(progression).toContainText('Frage 1 / ');
  const total = Number(/ \/ (\d+)/.exec((await progression.textContent()) ?? '')?.[1]);
  expect(total, 'questions de l’examen').toBeGreaterThan(1);
  const saisie = page.locator('.cours form.typed input');
  for (let rang = 1; rang <= total; rang++) {
    await expect(progression).toContainText(`Frage ${rang} / ${total}`);
    await ongletDansLaMarge(page, `Prüfung (question ${rang})`);
    // Une question à taper reçoit une réponse fausse et longue, que le résultat montre ; les autres
    // sont sautées.
    if (await saisie.isVisible()) {
      await saisie.fill(REPONSE_FAUSSE_ET_LONGUE);
      await saisie.press('Enter');
      continue;
    }
    const suite = rang < total ? de.examen_ueberspringen : de.examen_zur_abgabe;
    await page.getByRole('button', { name: suite }).click();
  }
  const confirmation = page.locator('.cours .confirm');
  await expect(confirmation).toBeVisible();
  await ongletDansLaMarge(page, 'Prüfung (confirmation de la remise)');
  await confirmation.getByRole('button', { name: de.examen_abgeben }).click();

  // Aucune réponse juste : tous les groupes et toutes les fautes sont affichés.
  await expect(page.locator('.cours .grade')).toHaveText('1.0');
  await ongletDansLaMarge(page, 'Prüfung (résultat)');
  // Aucune n'est juste : chaque question est une faute.
  await fautesSurTouteLaLargeur(page, total);

  await page.getByRole('button', { name: de.examen_fehler_ueben }).click();
  await expect(page).toHaveURL(/\/cartes$/);
  await expect(page.locator('.cours .progressline')).toContainText(de.cartes_de_l_examen);
  await ongletDansLaMarge(page, 'Karteikarten (Fehler aus der Prüfung)');

  await page.locator('#onglet-progression').click();
  await expect(page.getByRole('heading', { name: de.progression_jours })).toBeVisible();
  await expect(page.locator('.cours .days > div')).toHaveCount(14);
  await ongletDansLaMarge(page, 'Fortschritt');
}

parcours('invitation_passkey_reconnexion_et_lien_de_secours', async ({ telephone, baseURL }) => {
  // Le parcours mesure les onglets du cours un à un (vingt questions d'examen comprises), installe
  // le service worker sur deux téléphones, attend deux synchronisations 3 s après une réponse, puis
  // déroule les droits de la personne (notice, export, déconnexion retenue, suppression) : il
  // prend près de 50 s sur un poste, et bien plus sur une machine lente (runner de CI).
  parcours.setTimeout(240_000);
  const lienProprietaire = process.env.E2E_LIEN_PROPRIETAIRE;
  if (lienProprietaire === undefined || lienProprietaire === '' || baseURL === undefined) {
    throw new Error(
      'E2E_LIEN_PROPRIETAIRE manquant : contre E2E_URL, le créer sur ce serveur ' +
        '(`node dist/serveur/cli.js proprietaire`) et le passer dans cette variable.',
    );
  }
  const origine = new URL(baseURL).origin;
  const compte = `${origine}/compte`;

  const proprietaire = await telephone('fr-FR');
  await parcours.step('1. le propriétaire crée son compte par son lien', async () => {
    verifierDebut(lienProprietaire, `${origine}/invitation/`);
    await proprietaire.goto(lienProprietaire);
    await expect(titre(proprietaire, fr.invitation_titre)).toBeVisible();
    await sansDefilementHorizontal(proprietaire);

    await proprietaire.getByLabel(fr.nom_affiche).fill(PROPRIETAIRE);
    const entrees = await historique(proprietaire);
    await proprietaire.getByRole('button', { name: fr.creer_passkey }).click();

    // Le propriétaire voit tous les cours ; il n'y en a qu'un : on arrive sur lui.
    await surLeCours(proprietaire, origine);
    // L'adresse qui portait le jeton a été remplacée, pas seulement quittée : « retour » n'y
    // ramène pas.
    expect(await historique(proprietaire)).toBe(entrees);
    await sansDefilementHorizontal(proprietaire);

    await ouvrirLeCompte(proprietaire, fr.compte_lien, origine);
    await expect(titre(proprietaire, `${fr.bonjour} ${PROPRIETAIRE}`)).toBeVisible();
    await expect(proprietaire.getByRole('link', { name: fr.admin_lien })).toBeVisible();
    await sansDefilementHorizontal(proprietaire);
  });

  let invitation = '';
  await parcours.step('2. l’administration crée une invitation au cours', async () => {
    await proprietaire.getByRole('link', { name: fr.admin_lien }).click();
    await expect(proprietaire).toHaveURL(`${origine}/admin`);
    await expect(titre(proprietaire, textesAdmin.admin_titre)).toBeVisible();

    // Retour puis avance du navigateur : le client suit l'historique (`popstate`).
    await proprietaire.goBack();
    await expect(proprietaire).toHaveURL(compte);
    await expect(titre(proprietaire, `${fr.bonjour} ${PROPRIETAIRE}`)).toBeVisible();
    await proprietaire.goForward();
    await expect(proprietaire).toHaveURL(`${origine}/admin`);
    await expect(titre(proprietaire, textesAdmin.admin_titre)).toBeVisible();

    await proprietaire.getByRole('checkbox', { name: COURS }).check();
    await proprietaire.getByRole('button', { name: textesAdmin.inviter_creer }).click();
    invitation = await lienAffiche(proprietaire, `${origine}/invitation/`);
    await expect(proprietaire.getByTestId('partager')).toBeVisible();
    await sansDefilementHorizontal(proprietaire);
  });

  const lernende = await telephone('de-DE');
  await parcours.step('3. l’invitée crée son compte : elle arrive sur le cours', async () => {
    await lernende.goto(invitation);
    await expect(titre(lernende, de.invitation_titre)).toBeVisible();
    await sansDefilementHorizontal(lernende);

    await lernende.getByLabel(de.nom_affiche).fill(LERNENDE);
    await lernende.getByRole('button', { name: de.creer_passkey }).click();

    await surLeCours(lernende, origine);
    await sansDefilementHorizontal(lernende);
    await titreDuCoursEnGrand(lernende);
    await anneauDeFocusDesOngletsEntier(lernende);

    // Son compte liste le cours, et pas l'administration.
    await ouvrirLeCompte(lernende, de.compte_lien, origine);
    await expect(titre(lernende, `${de.bonjour} ${LERNENDE}`)).toBeVisible();
    await expect(cours(lernende)).toHaveText([COURS]);
    await expect(lernende.getByRole('link', { name: de.admin_lien })).toHaveCount(0);
    await sansDefilementHorizontal(lernende);
  });

  await parcours.step('4. elle se déconnecte, puis se reconnecte par passkey', async () => {
    // Le cookie de session d'avant la déconnexion, rejoué ensuite seul : la session doit être
    // supprimée sur le serveur, pas seulement oubliée par le téléphone.
    const cookies = await lernende.context().cookies();
    const session = cookies.find((cookie) => cookie.name === NOM_COOKIE_SESSION)?.value ?? '';
    expect(session, 'le cookie de session').not.toBe('');
    expect(await statutMoi(origine, session)).toBe(200);

    await lernende.getByRole('button', { name: de.deconnexion, exact: true }).click();
    await expect(lernende).toHaveURL(`${origine}/connexion`);
    await expect(titre(lernende, de.connexion_titre)).toBeVisible();
    expect(await statutMoi(origine, session)).toBe(401);
    await sansDefilementHorizontal(lernende);
    // La déconnexion a désinscrit le service worker, puis rechargé la page : il est de nouveau
    // enregistré et actif.
    await serviceWorkerActif(lernende);

    await lernende.getByRole('button', { name: de.connexion_bouton }).click();

    await surLeCours(lernende, origine);
  });

  let secours = '';
  await parcours.step('5. le propriétaire crée un lien de secours pour elle', async () => {
    // L'administration a été chargée avant que l'invitée ait un compte.
    await proprietaire.reload();
    const fiche = proprietaire
      .getByTestId('liste-personnes')
      .getByRole('listitem')
      .filter({ hasText: LERNENDE });
    // L'invitation lui a ouvert le cours, à elle nommément.
    await expect(fiche).toContainText(`${textesAdmin.cours_de} : ${COURS}`);

    await fiche.getByRole('button', { name: `${textesAdmin.lien_secours} : ${LERNENDE}` }).click();
    secours = await lienAffiche(fiche, `${origine}/lien/`);
    await sansDefilementHorizontal(proprietaire);
  });

  const nouveauTelephone = await telephone('de-DE');
  await parcours.step('6. un nouveau téléphone ouvre le lien et crée une passkey', async () => {
    await nouveauTelephone.goto(secours);
    await expect(titre(nouveauTelephone, de.lien_titre)).toBeVisible();
    await sansDefilementHorizontal(nouveauTelephone);

    const entrees = await historique(nouveauTelephone);
    await nouveauTelephone.getByRole('button', { name: de.creer_passkey }).click();

    await surLeCours(nouveauTelephone, origine);
    expect(await historique(nouveauTelephone)).toBe(entrees);
    await sansDefilementHorizontal(nouveauTelephone);
  });

  await parcours.step('7. pour elle, l’administration n’existe pas (404)', async () => {
    const reponse = await nouveauTelephone.evaluate(async () => {
      const lue = await fetch('/api/admin/personnes');
      return { statut: lue.status, corps: await lue.json() };
    });
    expect(reponse).toEqual({ statut: 404, corps: { erreur: 'introuvable' } });
  });

  await parcours.step('8. ses appareils : une passkey supprimée en confirmant', async () => {
    await ouvrirLeCompte(nouveauTelephone, de.compte_lien, origine);
    await nouveauTelephone.getByRole('link', { name: de.appareils_titre }).click();
    await expect(nouveauTelephone).toHaveURL(`${origine}/appareils`);
    await expect(titre(nouveauTelephone, de.appareils_titre)).toBeVisible();

    // L'ancien téléphone, reconnecté à l'étape 4, et celui-ci.
    const sessions = nouveauTelephone.getByTestId('liste-sessions').getByRole('listitem');
    await expect(sessions).toHaveCount(2);
    await expect(sessions.filter({ hasText: de.cet_appareil })).toHaveCount(1);
    // Une passkey par téléphone, la plus ancienne (celle de l'ancien téléphone) en tête.
    const passkeys = nouveauTelephone.getByTestId('liste-passkeys').getByRole('listitem');
    await expect(passkeys).toHaveCount(2);
    await sansDefilementHorizontal(nouveauTelephone);

    const supprimer = passkeys.first().getByRole('button');
    await expect(supprimer).toHaveText(de.supprimer);
    // Un seul toucher ne supprime rien : le bouton demande confirmation, puis revient de lui-même
    // à son état de départ au bout de 5 secondes.
    await supprimer.click();
    await expect(supprimer).toHaveText(de.confirmer);
    await expect(supprimer).toHaveText(de.supprimer, { timeout: 10_000 });
    await expect(passkeys).toHaveCount(2);

    // Deux touchers : la passkey de l'ancien téléphone est supprimée.
    await supprimer.click();
    await expect(supprimer).toHaveText(de.confirmer);
    await supprimer.click();
    await expect(passkeys).toHaveCount(1);
    await expect(sessions).toHaveCount(2);
    await sansDefilementHorizontal(nouveauTelephone);
  });

  const deCours = TEXTES_COURS.de;
  await parcours.step('9. elle révise en ligne sur le premier téléphone', async () => {
    // Sa session y est restée ouverte (étape 8) : elle est sur le cours depuis l'étape 4.
    await repondreGewusst(lernende, 3);
    await ouvrirOnglet(lernende, 'apercu');
    await expect.poll(() => reponsesDuJour(lernende), { message: 'réponses du jour' }).toBe(3);
    // Les trois sont parties ensemble, 3 s après la dernière : la file est vide. Ces 3 s laissent
    // peu de marge dans les 5 s par défaut d'`expect`, sur un runner lent.
    await expect(etatSynchro(lernende)).toHaveText(deCours.synchro_a_jour, {
      timeout: DELAI_SYNCHRO_APRES_REPONSE_MS,
    });
  });

  await parcours.step('10. les deux téléphones passent hors ligne, et chacun révise', async () => {
    for (const page of [lernende, nouveauTelephone]) {
      // L'application relancée : `/` mène au cours (le second téléphone était sur ses appareils).
      await page.goto('/');
      // Le service worker ne contrôle la page qu'après un rechargement (2a-D1). La page
      // rechargée en ligne relit le journal : les trois réponses du premier téléphone y sont.
      await pageControlee(page);
      await surLeCours(page, origine);
      await expect.poll(() => reponsesDuJour(page), { message: 'réponses du jour' }).toBe(3);

      // Playwright coupe le réseau de la page et de son service worker (Chromium).
      await page.context().setOffline(true);
      expect(await page.evaluate(essayerLaSante)).toBe('injoignable');

      // Sans réseau, l'application vient du précache, le cours et le journal d'IndexedDB.
      const rechargee = await page.reload();
      expect(rechargee?.fromServiceWorker()).toBe(true);
      await expect(page.getByTestId('bandeau-session')).toHaveText(de.session_hors_ligne);
      await expect(titre(page, COURS)).toBeVisible();
      await expect.poll(() => reponsesDuJour(page), { message: 'réponses du jour' }).toBe(3);

      // L'envoi part 3 s après la dernière réponse, et échoue : la file garde les deux réponses.
      // Il n'y a plus d'envoi en attente : seul le retour du réseau en relancera un.
      await Promise.all([
        envoiEchoue(page, DELAI_SYNCHRO_APRES_REPONSE_MS),
        repondreGewusst(page, 2),
      ]);
      await expect(etatSynchro(page)).toHaveText(formater(deCours.synchro_en_attente, { n: 2 }));
    }
  });

  await parcours.step('11. le réseau revient : chacun a les réponses de l’autre', async () => {
    // Le retour du réseau (`online`) synchronise : le premier téléphone envoie ses deux réponses.
    // L'application relit aussi la session : le bandeau « hors ligne » s'en va.
    await retourDuReseau(lernende);
    await expect(etatSynchro(lernende)).toHaveText(deCours.synchro_a_jour);
    await expect(lernende.getByTestId('bandeau-session')).toHaveCount(0);
    // Le second envoie les siennes et lit, dans la même synchronisation, celles du premier.
    await retourDuReseau(nouveauTelephone);
    await expect(etatSynchro(nouveauTelephone)).toHaveText(deCours.synchro_a_jour);
    await ouvrirOnglet(nouveauTelephone, 'apercu');
    await expect
      .poll(() => reponsesDuJour(nouveauTelephone), { message: 'second téléphone' })
      .toBe(7);
    // Le premier lit celles du second au démarrage suivant de l'application, sur l'aperçu.
    await ouvrirOnglet(lernende, 'apercu');
    await lernende.reload();
    await surLeCours(lernende, origine);
    await expect.poll(() => reponsesDuJour(lernende), { message: 'premier téléphone' }).toBe(7);

    // Le même journal, le même état : l'aperçu dit la même chose sur les deux.
    await expect
      .poll(
        async () =>
          (await chiffresDeLApercu(nouveauTelephone)) === (await chiffresDeLApercu(lernende)),
        { message: 'l’aperçu dit la même chose sur les deux téléphones' },
      )
      .toBe(true);
    for (const page of [lernende, nouveauTelephone]) {
      await ouvrirOnglet(page, 'progression');
      await expect.poll(() => reponsesAuTotal(page), { message: 'réponses au total' }).toBe(7);
    }
  });

  await parcours.step('12. chaque onglet répond, sans défilement horizontal', async () => {
    await ouvrirOnglet(lernende, 'apercu');
    // Le journal du serveur avant les réponses de l'étape : elles doivent s'y ajouter.
    const evenementsAvantLEtape = await evenementsDuServeur(lernende);
    await ongletDansLaMarge(lernende, deCours.onglet_apercu);
    await ongletsDeCartesDansLaMarge(lernende);
    await exercicesAnnexesDansLaMarge(lernende);
    await feuillesDansLaMarge(lernende);
    await examenEtProgressionDansLaMarge(lernende);
    // Les réponses de l'étape sont parties : leur envoi vient 3 s après la dernière (décision 15).
    // Sans cette attente, il pourrait tomber après le relevé du journal du serveur à l'étape 16, et
    // le total de l'étape 17 s'en trouverait augmenté sans que l'abandon y soit pour rien. Avant le
    // rechargement de `ongletChoisiDansLaBarre`, qui n'attend pas la file.
    await expect(etatSynchro(lernende)).toHaveText(deCours.synchro_a_jour, {
      timeout: DELAI_SYNCHRO_APRES_REPONSE_MS,
    });
    // Elles sont entrées au journal du serveur (hausse stricte : leur nombre dépend du hasard des
    // cartes tirées).
    await expect
      .poll(() => evenementsDuServeur(lernende), {
        message: 'les réponses de l’étape sont entrées au journal du serveur',
      })
      .toBeGreaterThan(evenementsAvantLEtape);
    await ongletChoisiDansLaBarre(lernende);
  });

  // Les étapes qui suivent se jouent sur le second téléphone : c'est lui qui garde la passkey de
  // l'invitée (celle du premier a été supprimée à l'étape 8).
  await parcours.step('13. le pied de page mène à la notice, qui bascule de langue', async () => {
    // Un téléphone sans compte : la notice est publique, avant tout compte comme après (1e-D15).
    const visiteuse = await telephone('de-DE');
    await visiteuse.goto('/connexion');
    await expect(titre(visiteuse, de.connexion_titre)).toBeVisible();
    await visiteuse.getByRole('contentinfo').getByRole('link', { name: de.notice_lien }).click();
    await expect(visiteuse).toHaveURL(`${origine}/confidentialite`);

    // Elle s'ouvre dans la langue du téléphone, avec les valeurs de l'instance, que le serveur
    // rend (S1-D8) : leurs adresses sont des liens.
    const notice = visiteuse.getByRole('article');
    await expect(titre(visiteuse, GABARIT_DE_NOTICE.de.titre)).toBeVisible();
    await expect(notice).toHaveAttribute('lang', 'de');
    await expect(notice.getByRole('link').first()).toBeVisible();
    await expect(notice).not.toContainText(de.notice_hors_ligne);
    await expect(visiteuse.getByRole('button', { name: de.langue_de })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await sansDefilementHorizontal(visiteuse);

    // La bascule change le texte et sa langue, puis le rend.
    await visiteuse.getByRole('button', { name: de.langue_fr }).click();
    await expect(titre(visiteuse, GABARIT_DE_NOTICE.fr.titre)).toBeVisible();
    await expect(notice).toHaveAttribute('lang', 'fr');
    await expect(visiteuse.getByRole('button', { name: de.langue_fr })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(visiteuse.getByRole('button', { name: de.langue_de })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await sansDefilementHorizontal(visiteuse);
    await visiteuse.getByRole('button', { name: de.langue_de }).click();
    await expect(titre(visiteuse, GABARIT_DE_NOTICE.de.titre)).toBeVisible();
    await expect(notice).toHaveAttribute('lang', 'de');

    // « Retour » ramène à la connexion, que le lien avait quittée sans recharger.
    await visiteuse.goBack();
    await expect(visiteuse).toHaveURL(`${origine}/connexion`);
    await expect(titre(visiteuse, de.connexion_titre)).toBeVisible();
  });

  await parcours.step('14. elle change son nom affiché', async () => {
    await ouvrirLeCompte(nouveauTelephone, de.compte_lien, origine);
    await expect(titre(nouveauTelephone, `${de.bonjour} ${LERNENDE}`)).toBeVisible();

    await nouveauTelephone.getByRole('textbox', { name: de.nom_affiche }).fill(RENOMMEE);
    await nouveauTelephone.getByRole('button', { name: de.enregistrer }).click();
    await expect(titre(nouveauTelephone, `${de.bonjour} ${RENOMMEE}`)).toBeVisible();

    // Le serveur l'a gardé : la page rechargée le relit.
    await nouveauTelephone.reload();
    await expect(titre(nouveauTelephone, `${de.bonjour} ${RENOMMEE}`)).toBeVisible();
    await sansDefilementHorizontal(nouveauTelephone);
  });

  await parcours.step(
    '15. elle télécharge ses données : son nom, ses appareils, des événements',
    async () => {
      const [telechargement] = await Promise.all([
        nouveauTelephone.waitForEvent('download'),
        nouveauTelephone.getByRole('link', { name: de.export_lien }).click(),
      ]);
      expect(await telechargement.failure(), 'échec du téléchargement').toBeNull();
      expect(telechargement.suggestedFilename()).toMatch(
        /^ancrage-export-\d{4}-\d{2}-\d{2}\.json$/,
      );

      const texte = await readFile(await telechargement.path(), 'utf8');
      // Sans `expect(texte)` : un échec afficherait tout le fichier.
      expect(texte.includes('empreinte'), 'une clé « empreinte » dans l’export').toBe(false);

      const donnees = JSON.parse(texte) as ExportPersonne;
      expect(donnees.format).toBe('ancrage-export');
      // Son nom d'à présent, pas celui d'avant.
      expect(donnees.personne.nomAffiche).toBe(RENOMMEE);
      // Ses sessions : au moins celle de ce téléphone, avec son identifiant et son appareil.
      expect(donnees.sessions, 'sessions de l’export').toBeDefined();
      expect(donnees.sessions.length, 'sessions de l’export').toBeGreaterThanOrEqual(1);
      for (const session of donnees.sessions) {
        expect(session.id, 'identifiant d’une session').not.toBe('');
        expect(session.appareil, 'appareil d’une session').not.toBe('');
      }
      // Ses passkeys : celle de ce téléphone, avec son identifiant et sa clé publique (base64url).
      expect(donnees.passkeys, 'passkeys de l’export').toBeDefined();
      expect(donnees.passkeys.length, 'passkeys de l’export').toBeGreaterThanOrEqual(1);
      for (const passkey of donnees.passkeys) {
        expect(passkey.id, 'identifiant d’une passkey').not.toBe('');
        expect(passkey.clePublique, 'clé publique d’une passkey').toMatch(/^[A-Za-z0-9_-]+$/);
      }
      // Le seul cours qu'elle voit, avec les réponses des étapes 9 à 11 (3, puis 2 et 2 hors ligne).
      expect(donnees.cours.map((unCours) => unCours.titre)).toEqual([COURS]);
      expect(donnees.cours[0]?.evenements.length, 'événements du cours').toBeGreaterThanOrEqual(7);
    },
  );

  // Les événements du journal du serveur avant les 2 réponses de l'étape 16 : à l'étape 17, il n'en
  // a pas gagné (les réponses abandonnées ne lui arrivent jamais).
  let evenementsAvant = 0;
  await parcours.step(
    '16. déconnectée par le propriétaire, elle abandonne 2 réponses',
    async () => {
      const page = nouveauTelephone;
      // Elle ouvre le cours (depuis son compte), puis le réseau se coupe : elle répond à 2 cartes.
      await cours(page).getByRole('link', { name: COURS }).click();
      await surLeCours(page, origine);
      // Le journal du serveur, une fois le cours à jour et avant le mode avion. Aucun envoi n'est en
      // vol : le premier téléphone a fini les siens à la fin de l'étape 12.
      evenementsAvant = await evenementsDuServeur(page);
      expect(evenementsAvant, 'événements du serveur avant l’abandon').toBeGreaterThanOrEqual(7);
      await page.context().setOffline(true);
      expect(await page.evaluate(essayerLaSante)).toBe('injoignable');
      await Promise.all([
        envoiEchoue(page, DELAI_SYNCHRO_APRES_REPONSE_MS),
        repondreGewusst(page, 2),
      ]);
      await expect(etatSynchro(page)).toHaveText(formater(deCours.synchro_en_attente, { n: 2 }));

      // Pendant ce temps, le propriétaire (son téléphone à lui) ferme les sessions de l'invitée,
      // sous son nouveau nom : l'administration relue le montre, avec sa passkey.
      await proprietaire.reload();
      const sienne = fiche(proprietaire, RENOMMEE);
      await expect(sienne).toContainText(`${textesAdmin.appareils_connectes} : 2`);
      await expect(passkeysDeLaFiche(sienne)).toHaveCount(1);
      // Le nom accessible du bouton garde sa description au second temps (« Confirmer ? … »).
      const deconnecter = sienne.getByRole('button', {
        name: `${textesAdmin.deconnecter_appareils} : ${RENOMMEE}`,
      });
      await deconnecter.click();
      await expect(deconnecter).toHaveText(fr.confirmer);
      await deconnecter.click();
      await expect(sienne).toContainText(`${textesAdmin.appareils_connectes} : 0`);

      // Le réseau revient : la synchronisation est refusée (401), la session est dite expirée.
      await retourDuReseau(page);
      await expect(page.getByTestId('bandeau-session')).toHaveText(de.session_expiree);

      // Elle veut se déconnecter : ses 2 réponses n'ont pas pu partir, rien n'est fermé ni effacé.
      await ouvrirLeCompte(page, de.compte_lien, origine);
      await page.getByRole('button', { name: de.deconnexion, exact: true }).click();
      await expect(page.getByText(de.deconnexion_attente_session)).toBeVisible();
      await expect(page).toHaveURL(compte);

      // Le bouton dit combien de réponses sont perdues, et se confirme.
      const abandonner = page.getByRole('button', {
        name: formater(de.deconnexion_abandonner, { n: 2 }),
      });
      await expect(abandonner).toBeVisible();
      await sansDefilementHorizontal(page);
      await abandonner.click();
      await expect(abandonner).toHaveText(formater(de.deconnexion_abandonner_confirmer, { n: 2 }));
      await abandonner.click();
      await expect(page).toHaveURL(`${origine}/connexion`);
      await expect(titre(page, de.connexion_titre)).toBeVisible();
    },
  );

  await parcours.step('17. elle se reconnecte, puis supprime son compte', async () => {
    const page = nouveauTelephone;
    await page.getByRole('button', { name: de.connexion_bouton }).click();
    // Le cours à jour : la synchronisation de la reconnexion est finie, et elle aurait envoyé les
    // réponses restées dans la file si l'abandon ne l'avait pas vidée.
    await surLeCours(page, origine);
    // Le journal du serveur n'a pas bougé : les 2 réponses abandonnées ne lui sont jamais arrivées.
    // Une attente stable d'abord (la file est vide, rien ne part) : un `poll` qui réussit tout de
    // suite ne prouverait pas l'absence d'un envoi tardif.
    await expect(etatSynchro(page)).toHaveText(deCours.synchro_a_jour);
    await expect
      .poll(() => evenementsDuServeur(page), { message: 'événements du serveur après l’abandon' })
      .toBe(evenementsAvant);

    // Le cookie de session de ce compte, rejoué ensuite seul : la suppression l'emporte.
    const cookies = await page.context().cookies();
    const session = cookies.find((cookie) => cookie.name === NOM_COOKIE_SESSION)?.value ?? '';
    expect(session, 'le cookie de session').not.toBe('');
    expect(await statutMoi(origine, session)).toBe(200);

    await ouvrirLeCompte(page, de.compte_lien, origine);
    await expect(titre(page, `${de.bonjour} ${RENOMMEE}`)).toBeVisible();
    // Deux touchers (le nom accessible du bouton garde sa description au second temps).
    const supprimer = page.getByRole('button', { name: de.suppression_bouton });
    await supprimer.click();
    await expect(supprimer).toHaveText(de.suppression_confirmer);
    await supprimer.click();

    // La page se recharge sur la connexion, qui confirme la suppression.
    await expect(page).toHaveURL(`${origine}/connexion?compte=supprime`);
    await expect(page.getByText(de.compte_supprime)).toBeVisible();
    await expect(titre(page, de.connexion_titre)).toBeVisible();
    expect(await statutMoi(origine, session)).toBe(401);

    // Le premier téléphone, dont la session est partie avec le compte, le découvre à son
    // rechargement : il se vide et le dit (2d-D4, 2d-D6). Il ne connaît plus personne.
    await lernende.reload();
    await expect(lernende).toHaveURL(`${origine}/connexion?compte=supprime&appareil=vide`);
    await expect(lernende.getByText(de.compte_supprime_appareil_vide)).toBeVisible();
    await expect(titre(lernende, de.connexion_titre)).toBeVisible();
    await sansDefilementHorizontal(lernende);
    await lernende.goto(`${origine}/`);
    await expect(lernende).toHaveURL(`${origine}/connexion`);
    await expect(titre(lernende, de.connexion_titre)).toBeVisible();

    // Pour le propriétaire, elle n'existe plus ; lui est toujours là (la liste est bien chargée).
    await proprietaire.reload();
    await expect(fiche(proprietaire, PROPRIETAIRE)).toHaveCount(1);
    await expect(fiche(proprietaire, RENOMMEE)).toHaveCount(0);
    await expect(fiche(proprietaire, LERNENDE)).toHaveCount(0);
  });

  await parcours.step('18. l’administration montre les passkeys du propriétaire', async () => {
    const sienne = fiche(proprietaire, PROPRIETAIRE);
    await expect(sienne.getByText(textesAdmin.passkeys_titre, { exact: true })).toBeVisible();
    // Celle qu'il a créée à l'étape 1.
    await expect(passkeysDeLaFiche(sienne)).toHaveCount(1);
    // Son compte ne se supprime pas depuis l'application (1e-D4) : la fiche n'en offre pas le bouton.
    await expect(sienne.getByRole('button', { name: textesAdmin.supprimer_compte })).toHaveCount(0);
    await sansDefilementHorizontal(proprietaire);
  });
});
