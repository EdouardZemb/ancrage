/*
 * Le glisser d'un terme, au doigt comme à la souris, par les Pointer Events (F1, ancrage-donnees#90). Le terme
 * capture le pointeur (`setPointerCapture`) et le suit par `transform` dès qu'il s'est éloigné de
 * `SEUIL_DE_GLISSER` ; en deçà, le geste est un toucher, et le clic qui le suit fait le reste. Au
 * lâcher, la cible est celle dont la zone (`[data-zone]`) contient le point : un terme lâché sur un terme
 * déjà posé va dans sa zone. Un geste interrompu (`pointercancel`, capture perdue) ou lâché hors de
 * toute zone rend le terme à sa place, sans rien poser.
 *
 * Le clic que le navigateur envoie après un glisser fini n'est pas un toucher : `clicDeGlisser` le
 * dit, une fois. Au doigt, ce clic ne vient pas toujours : le prochain appui ou la prochaine touche
 * sur un terme oublie le glisser.
 */
import type { TargetedPointerEvent } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { type Cadre, cibleSous, SEUIL_DE_GLISSER } from './glisser.js';

type Pointeur = TargetedPointerEvent<HTMLButtonElement>;

interface Geste {
  terme: string;
  pointeur: number;
  /** Le point de départ. */
  x: number;
  y: number;
  /** Le seuil est franchi : c'est un glisser, plus un toucher. */
  glisse: boolean;
  element: HTMLElement;
}

/** Les cibles (`[data-cible]`) de `racine`, chacune avec le cadre de sa zone. */
function cadresDesCibles(racine: HTMLElement): { id: string; cadre: Cadre }[] {
  return Array.from(racine.querySelectorAll<HTMLElement>('[data-cible]'), (cible) => {
    const { left, top, right, bottom } = (
      cible.closest('[data-zone]') ?? cible
    ).getBoundingClientRect();
    const cadre = { gauche: left, haut: top, droite: right, bas: bottom };
    return { id: cible.dataset.cible ?? '', cadre };
  });
}

export function useGlisser(options: {
  /** L'élément qui contient les cibles, mesurées au lâcher. */
  cibles(): HTMLElement | null;
  deposer(terme: string, cible: string): void;
  actif: boolean;
}) {
  const geste = useRef<Geste | null>(null);
  const apresGlisser = useRef(false);
  /** Le terme qui suit le pointeur, pour sa classe `glisse`. */
  const [glisse, setGlisse] = useState<string | null>(null);

  /** Le geste fini : le terme reprend sa place à l'écran. */
  const finir = (fini: Geste) => {
    geste.current = null;
    fini.element.style.transform = '';
    setGlisse(null);
  };
  /** Le geste de ce pointeur, s'il y en a un. */
  const de = (e: Pointeur): Geste | null =>
    geste.current?.pointeur === e.pointerId ? geste.current : null;
  const abandonner = (e: Pointeur) => {
    const g = de(e);
    if (g !== null) finir(g);
  };

  const poignees = (terme: string) => ({
    onPointerDown(e: Pointeur) {
      apresGlisser.current = false;
      const ancien = geste.current;
      // Un second doigt pendant un glisser est ignoré ; un geste dont le terme a quitté la page
      // (un nouveau rendu) ne retient plus rien.
      if (ancien?.element.isConnected) return;
      if (ancien !== null) finir(ancien);
      if (!options.actif || e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const { pointerId: pointeur, clientX: x, clientY: y, currentTarget: element } = e;
      geste.current = { terme, pointeur, x, y, glisse: false, element };
    },
    onPointerMove(e: Pointeur) {
      const g = de(e);
      if (g === null) return;
      const dx = e.clientX - g.x;
      const dy = e.clientY - g.y;
      if (!g.glisse) {
        if (Math.hypot(dx, dy) < SEUIL_DE_GLISSER) return;
        g.glisse = true;
        setGlisse(g.terme);
      }
      g.element.style.transform = `translate(${dx}px, ${dy}px)`;
    },
    onPointerUp(e: Pointeur) {
      const g = de(e);
      if (g === null) return;
      finir(g);
      // Un toucher : le clic qui suit le traite.
      if (!g.glisse) return;
      apresGlisser.current = true;
      const racine = options.cibles();
      const cible = racine && cibleSous(e.clientX, e.clientY, cadresDesCibles(racine));
      if (cible) options.deposer(g.terme, cible);
    },
    onPointerCancel: abandonner,
    onLostPointerCapture: abandonner,
    // Le doigt qui glisse ne fait pas un défilement pour Chromium : sans cela, un lâcher rapide
    // lance une inertie invisible, et le toucher suivant, où qu'il soit, ne fait que l'arrêter.
    onTouchMove(e: TouchEvent) {
      if (geste.current?.glisse) e.preventDefault();
    },
    onKeyDown() {
      apresGlisser.current = false;
    },
  });

  /** Vrai, une fois, pour le clic qui suit un glisser fini : ce n'est pas un toucher. */
  const clicDeGlisser = (): boolean => {
    const oui = apresGlisser.current;
    apresGlisser.current = false;
    return oui;
  };

  return { glisse, poignees, clicDeGlisser };
}
