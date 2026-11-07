// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tache } from '../../../domaine/contenu/modele.js';
import {
  AUJOURDHUI_DE_TEST,
  contexteDeTest,
  rendreDansLeCours,
  rendreDansUnCoursVivant,
  reponseDeTest,
} from '../contexte-cours.fixture.js';
import { Feuilles } from '../onglets/Feuilles.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { TacheAGlisser } from './TacheAGlisser.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

/* Données factices, écrites à la main (invariant 7). */

const APPARIEMENT: Extract<Tache, { genre: 'appariement' }> = {
  id: 'fa000051',
  genre: 'appariement',
  consigne: 'Ordnen Sie die Organe zu.',
  paires: [
    { id: 'fb000051', terme: 'Milz', cible: 'Filtert das Blut', statut: 'source' },
    { id: 'fb000052', terme: 'Magen', cible: 'Verdaut die Nahrung', statut: 'source' },
    { id: 'fb000053', terme: 'Lunge', cible: 'Tauscht die Atemgase aus', statut: 'source' },
  ],
};

function rendre() {
  const onRepondu = vi.fn();
  rendreDansLeCours(<TacheAGlisser tache={APPARIEMENT} onRepondu={onRepondu} />, contexteDeTest());
  return onRepondu;
}

/** Un terme ou une cible, par son texte : chacun est un bouton, affiché une seule fois. */
const bouton = (nom: string) => screen.getByRole('button', { name: nom }) as HTMLButtonElement;
const zoneDe = (cible: string) => bouton(cible).closest('.zone') as HTMLElement;
const textes = (racine: Element) =>
  Array.from(racine.querySelectorAll('[data-terme]'), (terme) => terme.textContent);
const reserve = () => document.querySelector('.reserve') as HTMLElement;
const dansLaReserve = () => textes(reserve()).sort();
const posesDans = (cible: string) => textes(zoneDe(cible)).sort();
const correction = (cible: string) => zoneDe(cible).querySelector('.correction')?.textContent;
const pruefen = () => bouton(t.pruefen);

/** Le chemin du toucher : le terme, puis la cible. */
function poser(terme: string, cible: string): void {
  fireEvent.click(bouton(terme));
  fireEvent.click(bouton(cible));
}

/** Le cadre d'un élément à l'écran, que happy-dom ne calcule pas. */
function cadrer(element: HTMLElement, gauche: number, haut: number, droite: number, bas: number) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    left: gauche,
    top: haut,
    right: droite,
    bottom: bas,
  } as DOMRect);
}

/** Un doigt posé en `de`, déplacé en `vers` : il ne se lève pas. */
function appuyerPuisDeplacer(terme: HTMLElement, de: [number, number], vers: [number, number]) {
  fireEvent.pointerDown(terme, { pointerId: 1, button: 0, clientX: de[0], clientY: de[1] });
  fireEvent.pointerMove(terme, { pointerId: 1, clientX: vers[0], clientY: vers[1] });
}

function lever(terme: HTMLElement, [x, y]: [number, number]) {
  fireEvent.pointerUp(terme, { pointerId: 1, button: 0, clientX: x, clientY: y });
}

/** Une fiche ouverte dans l'onglet, sur ses tâches à faire ou sur ses erreurs. */
function ouvrir(libelle: string, ...erreurs: string[]) {
  const evenements = erreurs.map((id, n) => reponseDeTest(n + 1, id, false, AUJOURDHUI_DE_TEST));
  const contexte = contexteDeTest({ evenements });
  rendreDansUnCoursVivant(<Feuilles />, contexte);
  fireEvent.click(bouton(libelle));
  return contexte;
}

describe('TacheAGlisser', () => {
  it('toucher_terme_puis_cible_place_le_terme', () => {
    rendre();
    // Une cible touchée sans terme choisi : rien.
    fireEvent.click(bouton('Filtert das Blut'));
    expect(posesDans('Filtert das Blut')).toEqual([]);

    fireEvent.click(bouton('Milz'));
    expect(bouton('Milz').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(bouton('Filtert das Blut'));

    expect(posesDans('Filtert das Blut')).toEqual(['Milz']);
    expect(dansLaReserve()).toEqual(['Lunge', 'Magen']);
    // Le focus passe à un terme encore dans la réserve.
    expect(document.activeElement?.closest('.reserve')).toBeTruthy();
    expect(document.activeElement?.hasAttribute('data-terme')).toBe(true);

    // Une case occupée reçoit le nouveau terme : l'ancien retourne dans la réserve.
    poser('Magen', 'Filtert das Blut');
    expect(posesDans('Filtert das Blut')).toEqual(['Magen']);
    expect(dansLaReserve()).toEqual(['Lunge', 'Milz']);
    expect(bouton('Milz').getAttribute('aria-pressed')).toBe('false');
  });

  it('toucher_terme_place_le_rend', () => {
    rendre();
    poser('Milz', 'Filtert das Blut');

    fireEvent.click(bouton('Milz'));

    expect(posesDans('Filtert das Blut')).toEqual([]);
    expect(dansLaReserve()).toEqual(['Lunge', 'Magen', 'Milz']);
    expect(bouton('Milz').getAttribute('aria-pressed')).toBe('false');
    expect(document.activeElement).toBe(bouton('Milz'));
  });

  it('pruefen_inactif_tant_qu_un_terme_reste', () => {
    const onRepondu = rendre();
    expect(pruefen().disabled).toBe(true);
    poser('Milz', 'Filtert das Blut');
    poser('Magen', 'Verdaut die Nahrung');
    expect(pruefen().disabled).toBe(true);

    poser('Lunge', 'Tauscht die Atemgase aus');

    expect(pruefen().disabled).toBe(false);
    expect(document.activeElement).toBe(pruefen());
    expect(onRepondu).not.toHaveBeenCalled();
    // Un terme rendu à la réserve : « Prüfen » attend de nouveau.
    fireEvent.click(bouton('Lunge'));
    expect(pruefen().disabled).toBe(true);
  });

  it('appariement_enregistre_chaque_paire', () => {
    // La fiche du cours de test commence par l'appariement de trois organes.
    const contexte = ouvrir(t.feuilles_bearbeiten);
    expect(screen.getByText(t.feuilles_hinweis_ziehen)).toBeTruthy();

    // Herz et Leber échangés, Niere à sa place.
    poser('Herz', 'Grosse Drüse im Oberbauch');
    poser('Leber', 'Organ im Brustkorb');
    poser('Niere', 'Organ der Harnbildung');
    expect(contexte.enregistrer).not.toHaveBeenCalled();
    fireEvent.click(pruefen());

    // Une réponse par paire, sur l'identifiant de la paire, dans l'ordre du papier.
    expect(vi.mocked(contexte.enregistrer).mock.calls).toEqual([
      ['fb000001', false],
      ['fb000002', false],
      ['fb000003', true],
    ]);
    // Chaque case dit juste ou faux ; sous une case fausse, le bon terme.
    expect(zoneDe('Organ im Brustkorb').classList.contains('ko')).toBe(true);
    expect(correction('Organ im Brustkorb')).toBe('Herz');
    expect(zoneDe('Grosse Drüse im Oberbauch').classList.contains('ko')).toBe(true);
    expect(correction('Grosse Drüse im Oberbauch')).toBe('Leber');
    expect(zoneDe('Organ der Harnbildung').classList.contains('ok')).toBe(true);
    expect(correction('Organ der Harnbildung')).toBeUndefined();
    // La tâche jugée ne bouge plus ; « Weiter » mène à la suivante.
    expect(pruefen().disabled).toBe(true);
    expect(bouton('Herz').disabled).toBe(true);
    expect(bouton('Organ im Brustkorb').disabled).toBe(true);
    expect(document.activeElement).toBe(bouton(t.suivante));
  });

  it('classement_enregistre_chaque_element', () => {
    // Les trois éléments du classement sont faux : « Fehler wiederholen » ne montre que lui.
    const contexte = ouvrir(t.feuilles_fehler, 'fb000004', 'fb000005', 'fb000006');
    expect(document.querySelector('.tache .consigne')?.textContent).toBe(
      'Ordnen Sie die Vorsilben zu.',
    );

    poser('tachy-', 'Tempo');
    poser('brady-', 'Lage');
    poser('endo-', 'Lage');

    // Une zone reçoit plusieurs termes.
    expect(posesDans('Lage')).toEqual(['brady-', 'endo-']);
    expect(posesDans('Tempo')).toEqual(['tachy-']);
    fireEvent.click(pruefen());
    expect(vi.mocked(contexte.enregistrer).mock.calls).toEqual([
      ['fb000004', true],
      ['fb000005', false],
      ['fb000006', true],
    ]);
    // Chaque zone fausse donne ses bons termes ; chaque terme dit s'il est juste.
    expect(zoneDe('Tempo').classList.contains('ko')).toBe(true);
    expect(correction('Tempo')).toBe('tachy- · brady-');
    expect(zoneDe('Lage').classList.contains('ko')).toBe(true);
    expect(correction('Lage')).toBe('endo-');
    expect(bouton('brady-').classList.contains('ko')).toBe(true);
    expect(bouton('endo-').classList.contains('ok')).toBe(true);
  });

  it('pointercancel_rend_le_terme_sans_enregistrer', () => {
    const onRepondu = rendre();
    const milz = bouton('Milz');

    // Le terme suit le doigt…
    appuyerPuisDeplacer(milz, [20, 20], [120, 220]);
    expect(milz.style.transform).toBe('translate(100px, 200px)');
    expect(milz.classList.contains('glisse')).toBe(true);
    // … puis le geste est interrompu : il revient dans la réserve.
    fireEvent.pointerCancel(milz, { pointerId: 1 });
    expect(milz.style.transform).toBe('');
    expect(milz.classList.contains('glisse')).toBe(false);
    expect(dansLaReserve()).toEqual(['Lunge', 'Magen', 'Milz']);

    // Lâché hors de toute cible : il revient aussi, et le clic qui suit ne le choisit pas.
    cadrer(zoneDe('Filtert das Blut'), 0, 300, 360, 380);
    appuyerPuisDeplacer(milz, [20, 20], [180, 500]);
    lever(milz, [180, 500]);
    fireEvent.click(milz);
    expect(milz.style.transform).toBe('');
    expect(milz.getAttribute('aria-pressed')).toBe('false');
    expect(posesDans('Filtert das Blut')).toEqual([]);
    expect(dansLaReserve()).toEqual(['Lunge', 'Magen', 'Milz']);
    expect(onRepondu).not.toHaveBeenCalled();
  });

  it('glisser_sur_une_cible_place_le_terme', () => {
    rendre();
    cadrer(zoneDe('Filtert das Blut'), 0, 300, 360, 380);
    cadrer(zoneDe('Verdaut die Nahrung'), 0, 400, 360, 480);

    const milz = bouton('Milz');
    appuyerPuisDeplacer(milz, [20, 20], [180, 440]);
    // Le doigt qui glisse ne défile pas : sans inertie lancée, le toucher suivant n'est pas perdu.
    expect(fireEvent.touchMove(milz)).toBe(false);
    lever(milz, [180, 440]);

    expect(posesDans('Verdaut die Nahrung')).toEqual(['Milz']);
    expect(dansLaReserve()).toEqual(['Lunge', 'Magen']);
    // Le clic qui suit le glisser n'est pas un toucher : le terme posé reste.
    fireEvent.click(bouton('Milz'));
    expect(posesDans('Verdaut die Nahrung')).toEqual(['Milz']);

    // Un terme posé se glisse vers une autre case ; lâché hors de toute case, il reste.
    const pose = bouton('Milz');
    appuyerPuisDeplacer(pose, [180, 440], [180, 340]);
    lever(pose, [180, 340]);
    expect(posesDans('Filtert das Blut')).toEqual(['Milz']);
    expect(posesDans('Verdaut die Nahrung')).toEqual([]);
    appuyerPuisDeplacer(bouton('Milz'), [180, 340], [180, 900]);
    lever(bouton('Milz'), [180, 900]);
    fireEvent.click(bouton('Milz'));
    expect(posesDans('Filtert das Blut')).toEqual(['Milz']);
  });

  it('appui_bref_est_un_toucher', () => {
    rendre();
    // Le doigt se lève au-dessus d'une case : un appui bref n'y dépose rien.
    cadrer(zoneDe('Filtert das Blut'), 0, 0, 400, 400);
    const milz = bouton('Milz');

    appuyerPuisDeplacer(milz, [50, 50], [54, 53]);
    expect(milz.style.transform).toBe('');
    expect(fireEvent.touchMove(milz)).toBe(true);
    lever(milz, [54, 53]);
    expect(posesDans('Filtert das Blut')).toEqual([]);
    // Le navigateur envoie ensuite le clic : c'est un toucher, qui choisit le terme.
    fireEvent.click(milz);
    expect(milz.getAttribute('aria-pressed')).toBe('true');

    // À 8 px, c'est un glisser.
    appuyerPuisDeplacer(bouton('Magen'), [50, 50], [58, 50]);
    expect(bouton('Magen').style.transform).toBe('translate(8px, 0px)');
  });

  it('termes_portent_touch_action_none', () => {
    rendre();
    poser('Milz', 'Filtert das Blut');

    // Chaque terme est un bouton qui porte `data-terme`, dans la réserve comme posé.
    const termes = Array.from(document.querySelectorAll('[data-terme]'));
    expect(termes.map((terme) => terme.textContent).sort()).toEqual(['Lunge', 'Magen', 'Milz']);
    expect(termes.every((terme) => terme.tagName === 'BUTTON')).toBe(true);
    const cibles = Array.from(document.querySelectorAll('[data-cible]'));
    expect(cibles).toHaveLength(3);
    expect(cibles.every((cible) => cible.tagName === 'BUTTON')).toBe(true);
    // La feuille de style les rend au doigt : la page ne défile pas sous un terme (vigilance 3).
    const ici = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(join(ici, '../../styles.css'), 'utf8');
    expect(css).toMatch(/\[data-terme\]\s*\{[^}]*touch-action:\s*none;/);
  });

  it('placements_gardes_apres_un_detour', () => {
    // La tâche quittée puis retrouvée, dans la même mémoire d'onglets (vigilance 5).
    const contexte = contexteDeTest();
    const { unmount } = rendreDansLeCours(
      <TacheAGlisser tache={APPARIEMENT} onRepondu={vi.fn()} />,
      contexte,
    );
    poser('Milz', 'Verdaut die Nahrung');
    fireEvent.click(bouton('Lunge'));
    const ordre = textes(reserve());
    unmount();

    rendreDansLeCours(<TacheAGlisser tache={APPARIEMENT} onRepondu={vi.fn()} />, contexte);

    // Le terme posé, l'ordre tiré de la réserve et le terme choisi sont les mêmes.
    expect(posesDans('Verdaut die Nahrung')).toEqual(['Milz']);
    expect(textes(reserve())).toEqual(ordre);
    expect(bouton('Lunge').getAttribute('aria-pressed')).toBe('true');
  });

  it('capture_perdue_abandonne_le_glisser', () => {
    const onRepondu = rendre();
    const milz = bouton('Milz');
    cadrer(zoneDe('Filtert das Blut'), 0, 300, 360, 380);

    appuyerPuisDeplacer(milz, [20, 20], [120, 220]);
    expect(milz.classList.contains('glisse')).toBe(true);
    // Le navigateur reprend la capture (le terme quitte la page, un autre geste la prend) : le
    // terme revient, sans rien poser, et un lâcher ultérieur ne dépose rien.
    fireEvent.lostPointerCapture(milz, { pointerId: 1 });
    expect(milz.style.transform).toBe('');
    expect(milz.classList.contains('glisse')).toBe(false);
    lever(milz, [180, 340]);
    expect(posesDans('Filtert das Blut')).toEqual([]);
    expect(dansLaReserve()).toEqual(['Lunge', 'Magen', 'Milz']);
    expect(onRepondu).not.toHaveBeenCalled();
  });

  it('focus_apres_un_glisser', () => {
    rendre();
    cadrer(zoneDe('Verdaut die Nahrung'), 0, 400, 360, 480);
    const milz = bouton('Milz');

    appuyerPuisDeplacer(milz, [20, 20], [180, 440]);
    lever(milz, [180, 440]);

    // Le terme posé au glisser : le focus passe à un terme encore dans la réserve.
    expect(posesDans('Verdaut die Nahrung')).toEqual(['Milz']);
    expect(document.activeElement?.closest('.reserve')).toBeTruthy();
    expect(document.activeElement?.hasAttribute('data-terme')).toBe(true);
  });

  it('cle_de_zone_stable', () => {
    rendre();
    const cibles = ['Filtert das Blut', 'Verdaut die Nahrung', 'Tauscht die Atemgase aus'];
    const zones = cibles.map(zoneDe);

    poser('Milz', 'Verdaut die Nahrung');
    poser('Magen', 'Filtert das Blut');

    // Les zones sont les mêmes éléments : un placement ne les refait pas.
    cibles.forEach((cible, n) => {
      expect(zoneDe(cible)).toBe(zones[n]);
    });
  });

  it('terme_libre_suivant_dans_l_ordre', () => {
    rendre();
    const [premier, deuxieme, troisieme] = textes(reserve()) as string[];

    // Le deuxième posé : le focus va au troisième, le suivant dans l'ordre de la réserve.
    poser(deuxieme, 'Filtert das Blut');
    expect(document.activeElement).toBe(bouton(troisieme));

    // Le dernier posé : le focus revient au premier de ceux qui restent.
    poser(troisieme, 'Verdaut die Nahrung');
    expect(document.activeElement).toBe(bouton(premier));

    // Le dernier terme libre posé : le focus va à « Prüfen ».
    poser(premier, 'Tauscht die Atemgase aus');
    expect(document.activeElement).toBe(pruefen());
  });
});
