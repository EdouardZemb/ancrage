/*
 * Le défilement de la barre des onglets (R40). Sur un téléphone, la barre défile à l'horizontale :
 * l'onglet choisi (par son adresse, ou par un bouton d'un autre onglet) y est ramené en réglant le
 * `scrollLeft` de la barre elle-même. Jamais de `scrollIntoView` ni de `focus()` : Chromium y
 * déplace le point de départ de la navigation au clavier, et le Tab suivant sauterait l'en-tête et
 * l'onglet choisi.
 */

/** Ce qu'il faut savoir de la barre : son défilement et sa largeur visible. */
export interface BarreQuiDefile {
  scrollLeft: number;
  clientWidth: number;
}

/**
 * Ce qu'il faut savoir d'un onglet : sa place dans la barre, mesurée depuis le début de la barre,
 * quel que soit son défilement. Au sous-pixel près : `offsetLeft` et `offsetWidth` sont arrondis au
 * pixel, et l'onglet ramené au bord pouvait rester rogné d'une fraction de pixel.
 */
export interface PlaceDeLOnglet {
  debut: number;
  largeur: number;
}

/** La place de l'onglet dans la barre, d'après leurs cadres à l'écran. */
export function placeDansLaBarre(barre: HTMLElement, onglet: HTMLElement): PlaceDeLOnglet {
  const cadre = onglet.getBoundingClientRect();
  const bord = barre.getBoundingClientRect().left + barre.clientLeft;
  return { debut: cadre.left - bord + barre.scrollLeft, largeur: cadre.width };
}

/**
 * Le `scrollLeft` qui montre l'onglet entier, en bougeant le moins possible (comme « nearest ») :
 * inchangé s'il est déjà visible ; sinon l'onglet vient au bord le plus proche. Un onglet plus large
 * que la barre montre son début. Le défilement s'arrondit vers l'extérieur de l'onglet : aucune
 * fraction de pixel n'en reste cachée.
 */
export function defilementPourVoir(barre: BarreQuiDefile, onglet: PlaceDeLOnglet): number {
  const { debut, largeur } = onglet;
  const fin = debut + largeur;
  if (debut < barre.scrollLeft || largeur > barre.clientWidth) return Math.floor(debut);
  if (fin > barre.scrollLeft + barre.clientWidth) return Math.ceil(fin - barre.clientWidth);
  return barre.scrollLeft;
}
