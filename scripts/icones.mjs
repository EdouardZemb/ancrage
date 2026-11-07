// Les icônes de l'application installée (décision 6), rendues à partir de
// `src/client/public/icone.svg` par le Chromium de Playwright : `node scripts/icones.mjs`. Les PNG
// produits sont versionnés ; on relance le script après toute modification du SVG.
//
// - `icone-192.png` et `icone-512.png` (`purpose: any`) : le SVG dans un carré aux coins arrondis,
//   transparents, tel qu'il s'affiche sans masque.
// - `icone-masquable-512.png` (`purpose: maskable`) : le SVG à fond perdu ; Android y découpe sa
//   propre forme, et l'ancre tient dans la zone sûre.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const racine = path.resolve(import.meta.dirname, '..');
const dossier = path.join(racine, 'src', 'client', 'public');
const svg = fs.readFileSync(path.join(dossier, 'icone.svg'), 'utf8');

const ICONES = [
  { fichier: 'icone-192.png', taille: 192, masquable: false },
  { fichier: 'icone-512.png', taille: 512, masquable: false },
  { fichier: 'icone-masquable-512.png', taille: 512, masquable: true },
];

// L'arrondi des coins d'une icône sans masque, en part de son côté.
const ARRONDI = '20%';

function page(taille, masquable) {
  const coins = masquable ? '0' : ARRONDI;
  return `<!doctype html>
<style>
  html, body { margin: 0; background: transparent; }
  div { width: ${taille}px; height: ${taille}px; border-radius: ${coins}; overflow: hidden; }
  svg { display: block; width: 100%; height: 100%; }
</style>
<div>${svg}</div>`;
}

const navigateur = await chromium.launch();
try {
  for (const { fichier, taille, masquable } of ICONES) {
    const onglet = await navigateur.newPage({
      viewport: { width: taille, height: taille },
      deviceScaleFactor: 1,
    });
    await onglet.setContent(page(taille, masquable));
    const image = await onglet.screenshot({ type: 'png', omitBackground: true });
    fs.writeFileSync(path.join(dossier, fichier), image);
    await onglet.close();
    console.log(`icône produite : ${path.relative(racine, path.join(dossier, fichier))}`);
  }
} finally {
  await navigateur.close();
}
