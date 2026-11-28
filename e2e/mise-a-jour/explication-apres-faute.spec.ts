/*
 * L'explication d'une faute dans les fiches (M10), de bout en bout, au Pixel 7 et en allemand : un
 * compte neuf ouvre la Unit 1 du cours d'exemple dans Arbeitsblätter
 * (`exemple-contenu/kueche/feuilles/blatt-01.yaml`).
 *
 *  - Tâche 1, l'appariement, posé en dérangement complet : les quatre cases sont fausses, et les deux
 *    paires qui portent une explication, « Sieb » et « Reibe », la montrent dans leur case, sans
 *    `role` (« Prüfen » en fait paraître plusieurs d'un coup) ; les deux autres n'en montrent aucune ;
 *  - tâche 3, le QCM : une première réponse juste ne montre rien ; une seconde fausse montre un bloc
 *    `role="status"`, l'explication du choix puis celle de la bonne réponse. Le bas du bloc et de
 *    « Weiter » restent dans l'écran (M10-C7) ;
 *  - « Ergebnis » : toujours l'explication de la bonne réponse, et celles des distracteurs de la
 *    dernière réponse fausse, sans `role`.
 *
 * Pourquoi Arbeitsblätter et non « Heute » : un compte neuf n'a aucun QCM de fiche dû, et « Heute »
 * ne pose que ce qui est dû ou des cartes neuves. La hauteur du bloc dans « Heute » n'est pas
 * mesurée ici (E1).
 *
 * Il tourne avec les tests des deux versions (`pnpm e2e:mise-a-jour`), sur son compte et sa base.
 */
import { expect, type Locator } from '@playwright/test';
import { TEXTES_COURS } from '../../src/client/cours/textes-cours.js';
import { ouvrirOnglet } from '../aide-cours.js';
import { test } from '../aide-csp.js';
import { blocEtBoutonDansLEcran } from '../aide-mise-en-page.js';
import type { VersionServie } from './aide-versions.js';
import { compteNeufSurHeute } from './compte-neuf.js';

// Les écrans en allemand, comme sur le téléphone de l'apprenante.
test.use({ locale: 'de-DE' });

const deCours = TEXTES_COURS.de;

/** Les textes de la fiche d'exemple, `exemple-contenu/kueche/feuilles/blatt-01.yaml` (tâche 5). */
const FICHE = {
  chemin: 'exemple-contenu/kueche/feuilles/blatt-01.yaml',
  paires: {
    // Le dérangement : chaque terme dans la case d'une autre paire.
    derangement: [
      ['Schwingbesen', 'Teigwaren abgiessen'],
      ['Sieb', 'Käse raffeln'],
      ['Reibe', 'Suppe anrichten'],
      ['Schöpfkelle', 'Rahm steif schlagen'],
    ],
    // La case porte l'explication de sa paire, jamais celle du terme posé.
    explications: {
      'Teigwaren abgiessen':
        'Durch die Löcher des Siebs läuft das Kochwasser ab, die Teigwaren bleiben drin.',
      'Käse raffeln': 'Die scharfen Löcher der Reibe zerkleinern den Käse in feine Streifen.',
    } as Record<string, string>,
    sansExplication: ['Suppe anrichten', 'Rahm steif schlagen'],
  },
  qcm: {
    juste: {
      question: 'Womit misst du einen Deziliter Milch ab?',
      choix: 'Mit dem Messbecher',
      explicationDeLaReponse: 'Der Messbecher hat Striche für Deziliter und Milliliter.',
    },
    fausse: {
      question: 'Bei wie viel Grad kocht Wasser auf Meereshöhe?',
      choix: 'Bei 60 °C',
      explicationDuChoix: 'Bei 60 °C ist Wasser heiss, aber es kocht noch lange nicht.',
      autreDistracteur: 'Bei 140 °C',
      explicationAutreDistracteur:
        'So heiss wird Wasser im offenen Topf nie, nur Öl in der Pfanne.',
      explicationDeLaReponse:
        'Auf Meereshöhe kocht Wasser bei 100 °C, in den Bergen schon etwas früher.',
    },
  },
};

let serveur: VersionServie | undefined;

test.afterEach(async () => {
  await serveur?.arreter();
  serveur = undefined;
});

/** La case d'une cible d'appariement, par son libellé. */
function caseDe(tache: Locator, libelle: string): Locator {
  return tache
    .locator('.zone')
    .filter({ has: tache.page().locator('.cible', { hasText: libelle }) });
}

test('l_explication_d_une_faute_se_voit_dans_les_fiches', async ({ page }) => {
  test.setTimeout(120_000);
  serveur = await compteNeufSurHeute(page, test.info().outputPath('ancrage.sqlite'));
  const cours = page.locator('.cours');
  const tache = cours.locator('.tache');
  const weiter = page.getByRole('button', { name: deCours.suivante, exact: true });

  await ouvrirOnglet(page, 'feuilles');
  const unit1 = cours
    .locator('.chap')
    .filter({ has: page.locator('.num').getByText('1', { exact: true }) });
  await expect(unit1).toHaveCount(1);
  await unit1.getByRole('button', { name: deCours.feuilles_bearbeiten, exact: true }).click();

  // Tâche 1, l'appariement, en dérangement complet.
  for (const [terme, libelle] of FICHE.paires.derangement) {
    await tache.locator('.reserve [data-terme]', { hasText: terme }).tap();
    await caseDe(tache, libelle).locator('[data-cible]').tap();
    await expect(caseDe(tache, libelle).locator('.poses')).toContainText(terme);
  }
  await tache.getByRole('button', { name: deCours.pruefen, exact: true }).tap();
  // Le verdict d'abord : une absence ne se constate qu'une fois la tâche jugée.
  await expect(tache.locator('.zone.ko')).toHaveCount(FICHE.paires.derangement.length);
  for (const [libelle, texte] of Object.entries(FICHE.paires.explications)) {
    const bloc = caseDe(tache, libelle).locator('.explication');
    await expect(bloc, `l'explication de la case « ${libelle} »`).toHaveCount(1);
    await expect(bloc).toContainText(deCours.explication_titre);
    await expect(bloc).toContainText(texte);
    await expect(bloc).not.toHaveAttribute('role', /.+/);
  }
  for (const libelle of FICHE.paires.sansExplication) {
    await expect(caseDe(tache, libelle).locator('.explication'), `case « ${libelle} »`).toHaveCount(
      0,
    );
  }
  await expect(tache.locator('.explication')).toHaveCount(
    Object.keys(FICHE.paires.explications).length,
  );
  await weiter.tap();

  // Tâche 2, le classement : un simple passage, qui n'a pas d'explication (la garde est un test
  // unitaire, `un_classement_ne_montre_aucune_explication`).
  const premiereZone = tache.locator('.zone').first();
  const termes = await tache.locator('.reserve [data-terme]').count();
  expect(termes, 'termes du classement').toBeGreaterThan(1);
  for (let restants = termes - 1; restants >= 0; restants--) {
    await tache.locator('.reserve [data-terme]').first().tap();
    await premiereZone.locator('[data-cible]').tap();
    await expect(tache.locator('.reserve [data-terme]')).toHaveCount(restants);
  }
  await tache.getByRole('button', { name: deCours.pruefen, exact: true }).tap();
  await expect(tache.locator('.zone.ok, .zone.ko')).toHaveCount(2);
  await weiter.tap();

  // Tâche 3, le QCM : la première question, juste, ne montre rien ; la seconde, fausse, un bloc.
  const { juste, fausse } = FICHE.qcm;
  const questionJuste = tache.locator('fieldset.element').filter({ hasText: juste.question });
  await questionJuste.locator('.options button', { hasText: juste.choix }).tap();
  await expect(questionJuste.locator('.options .right')).toHaveCount(1);
  await expect(questionJuste.locator('.explication')).toHaveCount(0);

  const questionFausse = tache.locator('fieldset.element').filter({ hasText: fausse.question });
  await questionFausse.locator('.options button', { hasText: fausse.choix }).tap();
  await expect(questionFausse.locator('.options .wrong')).toHaveCount(1);
  const bloc = questionFausse.locator('.explication');
  await expect(bloc).toHaveCount(1);
  await expect(bloc).toHaveAttribute('role', 'status');
  await expect(bloc.locator('.kind')).toHaveText(deCours.explication_titre);
  // L'explication du choix d'abord, puis celle de la bonne réponse.
  await expect(bloc.locator('p')).toHaveText([
    fausse.explicationDuChoix,
    fausse.explicationDeLaReponse,
  ]);
  await expect(weiter).toBeFocused();
  await blocEtBoutonDansLEcran(page, bloc, weiter, 'l’explication');

  // « Ergebnis » : la bonne réponse toujours, les distracteurs après une dernière réponse fausse.
  await weiter.tap();
  await page.getByRole('button', { name: deCours.feuilles_zurueck, exact: true }).first().tap();
  await unit1.getByRole('button', { name: deCours.feuilles_ergebnis, exact: true }).tap();
  const resultats = cours.locator('.resultats li.element');
  await expect(resultats.first()).toBeVisible();
  await expect(cours.locator('[role="status"]')).toHaveCount(0);

  const ligneFausse = resultats.filter({ hasText: fausse.question });
  await expect(ligneFausse.locator('.pill.ko')).toHaveCount(1);
  await expect(ligneFausse.locator('.explication p')).toHaveText([
    `${fausse.choix} – ${fausse.explicationDuChoix}`,
    `${fausse.autreDistracteur} – ${fausse.explicationAutreDistracteur}`,
    fausse.explicationDeLaReponse,
  ]);
  const ligneJuste = resultats.filter({ hasText: juste.question });
  await expect(ligneJuste.locator('.pill.ok')).toHaveCount(1);
  await expect(ligneJuste.locator('.explication p')).toHaveText([juste.explicationDeLaReponse]);
  const ligneSieb = resultats.filter({ has: page.locator('.enonce', { hasText: /^Sieb$/ }) });
  await expect(ligneSieb.locator('.pill.ko')).toHaveCount(1);
  await expect(ligneSieb.locator('.explication p')).toHaveText([
    FICHE.paires.explications['Teigwaren abgiessen'],
  ]);
});
