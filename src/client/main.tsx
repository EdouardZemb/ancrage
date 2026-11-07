// Le premier : avant que le moindre schéma de zod ne soit construit (R37).
import './zod-sans-jit.js';
import { render } from 'preact';
import { App } from './App.js';
import { enregistrerSw } from './enregistrer-sw.js';
import { installerMiseAJour } from './mise-a-jour.js';
// Les polices du prototype, hébergées par l'application (décision 26).
import './polices.css';

const racine = document.getElementById('racine');
if (!racine) {
  throw new Error('élément #racine introuvable');
}
render(<App />, racine);

// Après le chargement de la page : le précache ne dispute pas le réseau au premier affichage. Le
// service worker enregistré, une version qui attend s'applique au bon moment (2a-D2).
window.addEventListener('load', () => {
  void enregistrerSw().then((ok) => {
    if (ok) void installerMiseAJour();
  });
});
