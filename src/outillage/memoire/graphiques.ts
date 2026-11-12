import { ajouterJours, joursEntre } from '../../domaine/journal/temps.js';

/*
 * Les graphiques du rapport de suivi, en SVG écrit dans la page : rien ne se charge du réseau, aucun
 * script. Les couleurs sont des classes (`s1`, `b3`…) que la feuille de style de la page lie à ses
 * jetons, clairs et sombres. Le texte est toujours en couleur d'encre, jamais dans celle d'une série.
 * Chaque dessin porte un titre pour le lecteur d'écran, et chaque valeur une infobulle `<title>`.
 */

const LARGEUR = 720;
const RAYON = 4;
const ECART_DE_SEGMENT = 2;
const MOIS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

export function echapper(texte: string): string {
  return texte
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

const arrondi = (n: number): string => String(Math.round(n * 10) / 10);
const NOMBRE = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });
export const nombre = (n: number): string => NOMBRE.format(n);
export const pourcent = (part: number): string => `${Math.round(part * 100)} %`;

/** `JJ/MM/AAAA` d'un jour `AAAA-MM-JJ`. */
export function jourFrancais(jour: string): string {
  return `${jour.slice(8, 10)}/${jour.slice(5, 7)}/${jour.slice(0, 4)}`;
}

function jourCourt(jour: string): string {
  return `${Number(jour.slice(8, 10))} ${MOIS[Number(jour.slice(5, 7)) - 1]}`;
}

/** Une échelle de 0 à un maximum rond, et ses graduations (cinq au plus). */
function echelle(maximum: number): { haut: number; graduations: number[] } {
  const visee = Math.max(1, maximum);
  const grandeur = 10 ** Math.floor(Math.log10(visee));
  const pas = [1, 2, 5, 10].map((m) => m * grandeur).find((p) => visee / p <= 5) ?? grandeur * 10;
  const haut = Math.ceil(visee / pas) * pas;
  return { haut, graduations: Array.from({ length: haut / pas + 1 }, (_, i) => i * pas) };
}

/** Le premier jour de chaque mois entre deux jours, avec son étiquette. */
function reperesDeMois(debut: string, fin: string): { jour: string; etiquette: string }[] {
  const reperes: { jour: string; etiquette: string }[] = [];
  const total = joursEntre(debut, fin);
  for (let i = 0; i <= total; i++) {
    const jour = ajouterJours(debut, i);
    if (jour.endsWith('-01')) {
      const mois = MOIS[Number(jour.slice(5, 7)) - 1] ?? '';
      reperes.push({
        jour,
        etiquette: jour.slice(5, 7) === '01' ? `${mois} ${jour.slice(0, 4)}` : mois,
      });
    }
  }
  return reperes;
}

export interface SerieDeLigne {
  nom: string;
  /** Le nom court, écrit en bout de ligne. */
  etiquette: string;
  classe: 's1' | 's2' | 's3';
  pointille: boolean;
  /** Une moyenne par jour sur `duree` jours à partir de `jour`. */
  points: { jour: string; duree: number; valeur: number }[];
}

export interface EntreeDeCharge {
  /** Des jours qui se suivent ; `null` : un jour que le rapport n'a pas le droit de montrer. */
  barres: { jour: string; valeur: number | null }[];
  series: SerieDeLigne[];
  aujourdhui: string;
  examen: string | null;
  unite: string;
}

/** Écarte des étiquettes qui se chevaucheraient : au moins `ecart` de hauteur entre deux. */
function ecarter(positions: readonly number[], ecart: number, bas: number): number[] {
  const ordre = positions.map((y, rang) => ({ y, rang })).sort((a, b) => a.y - b.y);
  let precedent = Number.NEGATIVE_INFINITY;
  const resultat = new Array<number>(positions.length).fill(0);
  for (const { y, rang } of ordre) {
    const place = Math.min(Math.max(y, precedent + ecart), bas);
    resultat[rang] = place;
    precedent = place;
  }
  // Un bas atteint ramène les étiquettes d'au-dessus.
  for (let i = ordre.length - 2; i >= 0; i--) {
    const courant = ordre[i]?.rang ?? 0;
    const suivant = ordre[i + 1]?.rang ?? 0;
    resultat[courant] = Math.min(resultat[courant] ?? 0, (resultat[suivant] ?? 0) - ecart);
  }
  return resultat;
}

/** Les réponses par jour passées en barres, la projection par semaine en lignes, sur un seul axe. */
export function graphiqueDeCharge(entree: EntreeDeCharge): string {
  const { barres, series, aujourdhui, examen, unite } = entree;
  const hauteur = 300;
  const gauche = 46;
  const droite = 140;
  const haut = 24;
  const bas = 34;
  const largeurUtile = LARGEUR - gauche - droite;
  const hauteurUtile = hauteur - haut - bas;

  const premier = barres[0]?.jour ?? aujourdhui;
  const dernierDesBarres = barres.at(-1)?.jour ?? aujourdhui;
  const fin = examen ?? dernierDesBarres;
  const debut = [premier, aujourdhui].sort()[0] ?? premier;
  const jours = Math.max(1, joursEntre(debut, fin) + 1);
  const cellule = largeurUtile / jours;
  const x = (position: number): number => gauche + position * cellule;
  const rang = (jour: string): number => joursEntre(debut, jour);

  const valeurs = [
    ...barres.map((b) => b.valeur ?? 0),
    ...series.flatMap((s) => s.points.map((p) => p.valeur)),
  ];
  const { haut: maximum, graduations } = echelle(Math.max(0, ...valeurs));
  const y = (valeur: number): number => haut + hauteurUtile * (1 - valeur / maximum);

  const parties: string[] = [];
  for (const g of graduations) {
    parties.push(
      `<line class="grille" x1="${gauche}" x2="${LARGEUR - droite}" y1="${arrondi(y(g))}" y2="${arrondi(y(g))}"/>`,
      `<text class="axe" x="${gauche - 8}" y="${arrondi(y(g) + 4)}" text-anchor="end">${nombre(g)}</text>`,
    );
  }
  parties.push(
    `<line class="base" x1="${gauche}" x2="${LARGEUR - droite}" y1="${y(0)}" y2="${y(0)}"/>`,
  );
  for (const repere of reperesDeMois(debut, fin)) {
    const position = x(rang(repere.jour));
    parties.push(
      `<line class="grille" x1="${arrondi(position)}" x2="${arrondi(position)}" y1="${y(0)}" y2="${y(0) + 5}"/>`,
      `<text class="axe" x="${arrondi(position)}" y="${hauteur - 12}" text-anchor="start">${echapper(repere.etiquette)}</text>`,
    );
  }

  const ecartDeBarre = cellule > 4 ? 1 : 0;
  for (const barre of barres) {
    if (barre.valeur === null || barre.valeur <= 0) continue;
    const largeur = Math.max(1, cellule - ecartDeBarre);
    const hauteurDeBarre = y(0) - y(barre.valeur);
    parties.push(
      `<rect class="barre" x="${arrondi(x(rang(barre.jour)))}" y="${arrondi(y(barre.valeur))}" width="${arrondi(largeur)}" height="${arrondi(hauteurDeBarre)}" rx="${arrondi(Math.min(RAYON, largeur / 2))}"><title>${echapper(`${jourCourt(barre.jour)} : ${nombre(barre.valeur)} ${unite}`)}</title></rect>`,
    );
  }

  for (const serie of series) {
    const points = serie.points.map((p) => ({
      ...p,
      x: x(rang(p.jour) + p.duree / 2),
      y: y(p.valeur),
    }));
    if (points.length === 0) continue;
    parties.push(
      `<polyline class="ligne ${serie.classe}${serie.pointille ? ' pointille' : ''}" points="${points.map((p) => `${arrondi(p.x)},${arrondi(p.y)}`).join(' ')}"/>`,
    );
    for (const p of points) {
      parties.push(
        `<circle class="point ${serie.classe}" cx="${arrondi(p.x)}" cy="${arrondi(p.y)}" r="2.5"><title>${echapper(`semaine du ${jourCourt(p.jour)}, ${serie.nom} : ${nombre(p.valeur)} ${unite}`)}</title></circle>`,
      );
    }
  }
  // Les étiquettes directes, en bout de ligne.
  const bouts = series.filter((s) => s.points.length > 0);
  const ys = ecarter(
    bouts.map((s) => y(s.points.at(-1)?.valeur ?? 0)),
    15,
    hauteur - bas,
  );
  bouts.forEach((serie, i) => {
    const bout = serie.points.at(-1);
    const position = x(rang(bout?.jour ?? aujourdhui) + (bout?.duree ?? 0) / 2);
    const etiquette = ys[i] ?? 0;
    parties.push(
      `<circle class="point ${serie.classe}" cx="${LARGEUR - droite + 12}" cy="${arrondi(etiquette)}" r="4"/>`,
      `<text class="encre" x="${LARGEUR - droite + 22}" y="${arrondi(etiquette + 4)}">${echapper(serie.etiquette)}</text>`,
    );
    if (Math.abs(etiquette - y(bout?.valeur ?? 0)) > 2) {
      parties.push(
        `<line class="grille" x1="${arrondi(position)}" x2="${LARGEUR - droite + 8}" y1="${arrondi(y(bout?.valeur ?? 0))}" y2="${arrondi(etiquette)}"/>`,
      );
    }
  });

  if (aujourdhui >= debut && aujourdhui <= fin) {
    const position = arrondi(x(rang(aujourdhui)));
    parties.push(
      `<line class="repere" x1="${position}" x2="${position}" y1="${haut - 6}" y2="${y(0)}"/>`,
      `<text class="axe" x="${position}" y="${haut - 10}" text-anchor="middle">aujourd’hui</text>`,
    );
  }
  if (examen !== null) {
    const position = arrondi(x(jours));
    parties.push(
      `<line class="repere" x1="${position}" x2="${position}" y1="${haut - 6}" y2="${y(0)}"/>`,
      `<text class="axe" x="${position}" y="${haut - 10}" text-anchor="end">examen</text>`,
    );
  }

  return `<svg viewBox="0 0 ${LARGEUR} ${hauteur}" role="img" aria-label="${echapper(`Les ${unite} par jour, passées et projetées`)}">${parties.join('')}</svg>`;
}

export interface Segment {
  nom: string;
  classe: string;
  valeur: number;
}

/** Une barre empilée : un segment par classe, 2 px entre deux, coins de 4 px. */
export function barreEmpilee(segments: readonly Segment[], titre: string): string {
  const hauteur = 36;
  const total = segments.reduce((somme, s) => somme + s.valeur, 0);
  const presents = segments.filter((s) => s.valeur > 0);
  const utile = LARGEUR - ECART_DE_SEGMENT * Math.max(0, presents.length - 1);
  let position = 0;
  const rects = presents.map((segment) => {
    const largeur = total === 0 ? 0 : (utile * segment.valeur) / total;
    const rect = `<rect class="${segment.classe}" x="${arrondi(position)}" y="0" width="${arrondi(largeur)}" height="${hauteur}" rx="${arrondi(Math.min(RAYON, largeur / 2))}"><title>${echapper(`${segment.nom} : ${nombre(segment.valeur)}`)}</title></rect>`;
    position += largeur + ECART_DE_SEGMENT;
    return rect;
  });
  return `<svg viewBox="0 0 ${LARGEUR} ${hauteur}" role="img" aria-label="${echapper(titre)}">${rects.join('')}</svg>`;
}

export interface Ligne {
  nom: string;
  /** La part de justes, de 0 à 1. */
  part: number;
  reponses: number;
}

/** Des barres horizontales sur un seul axe, de 0 à 100 %, avec le nombre de réponses de chaque ligne. */
export function barresHorizontales(
  lignes: readonly Ligne[],
  classe: string,
  titre: string,
): string {
  const hauteurDeLigne = 30;
  const etiquette = 200;
  const valeur = 120;
  const largeurUtile = LARGEUR - etiquette - valeur;
  const hauteur = Math.max(1, lignes.length) * hauteurDeLigne + 4;
  const parties = lignes.map((ligne, i) => {
    const y0 = i * hauteurDeLigne + 4;
    const largeur = largeurUtile * ligne.part;
    return [
      `<text class="encre" x="0" y="${y0 + 15}">${echapper(ligne.nom)}</text>`,
      `<rect class="piste" x="${etiquette}" y="${y0 + 3}" width="${largeurUtile}" height="14" rx="${RAYON}"/>`,
      `<rect class="${classe}" x="${etiquette}" y="${y0 + 3}" width="${arrondi(Math.max(largeur, ligne.part > 0 ? 2 : 0))}" height="14" rx="${arrondi(Math.min(RAYON, largeur / 2))}"><title>${echapper(`${ligne.nom} : ${pourcent(ligne.part)} de justes sur ${nombre(ligne.reponses)} réponses`)}</title></rect>`,
      `<text class="encre" x="${etiquette + largeurUtile + 10}" y="${y0 + 15}">${pourcent(ligne.part)} · ${nombre(ligne.reponses)}</text>`,
    ].join('');
  });
  return `<svg viewBox="0 0 ${LARGEUR} ${hauteur}" role="img" aria-label="${echapper(titre)}">${parties.join('')}</svg>`;
}
