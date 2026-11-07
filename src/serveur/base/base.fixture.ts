/*
 * Le dossier temporaire d'un test et les bases qu'il y ouvre, installés pour tout un fichier de
 * test (1f-D4 : une seule copie de l'installation). Exclu de la construction, comme tout
 * `*.fixture.ts`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach } from 'vitest';
import { type Base, fermerBase, ouvrirBase } from './base.js';

/**
 * Pose, pour le fichier de test qui l'appelle, un dossier temporaire neuf avant chaque test et sa
 * suppression après, avec la fermeture des bases ouvertes par `ouvrir`. Le dossier du test en cours
 * est donné à `recevoir` avant chaque test. Rend `ouvrir`, qui ouvre une base dans ce dossier (ou
 * ailleurs) et la fait fermer après le test.
 */
export function installerBasesDeTest(
  recevoir: (dossier: string) => void,
): (chemin: string) => Base {
  let dossier = '';
  let ouvertes: Base[] = [];

  beforeEach(() => {
    dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'ancrage-'));
    ouvertes = [];
    recevoir(dossier);
  });

  afterEach(() => {
    // Windows verrouille les fichiers ouverts : on ferme avant de supprimer. Une base que le test
    // a déjà fermée n'est pas refermée.
    for (const base of ouvertes) {
      if (base.sqlite.open) {
        fermerBase(base);
      }
    }
    fs.rmSync(dossier, { recursive: true, force: true });
  });

  return (chemin) => {
    const base = ouvrirBase(chemin);
    ouvertes.push(base);
    return base;
  };
}
