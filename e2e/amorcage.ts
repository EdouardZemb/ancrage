/*
 * L'amorçage des tests de bout en bout (`globalSetup`) : le lien d'invitation du propriétaire,
 * que `parcours-compte.spec.ts` lit dans `E2E_LIEN_PROPRIETAIRE`.
 * - Défini par l'appelant, il sert tel quel : c'est le cas de la CI, qui le crée dans le conteneur
 *   de l'image testée.
 * - Sinon, sur le serveur que Playwright vient de lancer, la commande `proprietaire` le crée dans
 *   la même base (`E2E_BASE`, fixée par `playwright.config.ts`). Contre un serveur extérieur
 *   (`E2E_URL`), rien n'est créé : le parcours échouera en le disant.
 *
 * Le test des deux versions (`mise-a-jour/`) crée son lien de la même façon
 * (`lienDuProprietaire`), sur sa propre base.
 *
 * Le lien est un secret : il ne passe que par l'environnement, dont les tests héritent. Jamais
 * par un journal ni par un fichier.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { FullConfig } from '@playwright/test';

/**
 * Retire de `env` le contenu monté (`ANCRAGE_CONTENUS`), sous toutes ses casses (Windows ne les
 * distingue pas), puis rend `env`. Une variable restée au poste ne doit jamais entrer dans les
 * tests de bout en bout : sans elle, hors de la prod, le serveur sert le cours d'exemple (S1-D3),
 * le seul que les tests connaissent. `playwright.config.ts` la retire de son propre processus, dont
 * Playwright passe l'environnement au serveur et à l'amorçage ; chaque lancement en retire une
 * copie.
 */
export function sansContenuMonte(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  for (const nom of Object.keys(env)) {
    if (nom.toUpperCase() === 'ANCRAGE_CONTENUS') Reflect.deleteProperty(env, nom);
  }
  return env;
}

/**
 * Le lien d'invitation du propriétaire, que `cli.js proprietaire` crée dans `base` pour l'origine
 * `urlPublique`. `dossier` est celui d'où le serveur construit se lance.
 */
export function lienDuProprietaire(options: {
  dossier: string;
  base: string;
  urlPublique: string;
}): string {
  const resultat = spawnSync(process.execPath, ['dist/serveur/cli.js', 'proprietaire'], {
    cwd: options.dossier,
    encoding: 'utf8',
    env: {
      ...sansContenuMonte({ ...process.env }),
      ANCRAGE_ENV: 'ci',
      ANCRAGE_BASE: options.base,
      ANCRAGE_URL_PUBLIQUE: options.urlPublique,
    },
  });
  if (resultat.status !== 0) {
    // En échec, la commande n'écrit qu'un message d'erreur, jamais de lien.
    const message = [resultat.error?.message, resultat.stdout, resultat.stderr]
      .filter((partie) => partie !== undefined && partie.trim() !== '')
      .join(' ');
    throw new Error(`cli.js proprietaire a échoué (${resultat.status}) : ${message}`);
  }
  return resultat.stdout.trim();
}

export default function amorcer(config: FullConfig): void {
  if (process.env.E2E_LIEN_PROPRIETAIRE !== undefined || process.env.E2E_URL !== undefined) {
    return;
  }
  const base = process.env.E2E_BASE;
  const urlPublique = config.projects[0]?.use.baseURL;
  if (config.configFile === undefined || base === undefined || urlPublique === undefined) {
    throw new Error('amorçage : configuration, E2E_BASE ou baseURL manquants');
  }
  try {
    process.env.E2E_LIEN_PROPRIETAIRE = lienDuProprietaire({
      // Le dossier de la configuration, d'où Playwright lance aussi le serveur.
      dossier: path.dirname(config.configFile),
      base,
      urlPublique,
    });
  } catch (erreur) {
    // Avant tout test : le message dit d'où il vient. Celui de `lienDuProprietaire` ne le dit pas,
    // car le test des deux versions l'appelle aussi.
    const message = erreur instanceof Error ? erreur.message : String(erreur);
    throw new Error(`amorçage : ${message}`, { cause: erreur });
  }
}
