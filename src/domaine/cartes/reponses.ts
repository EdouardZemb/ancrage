import type { Carte } from '../contenu/modele.js';

/*
 * Les règles de réponse des cartes, reprises du prototype (`terminologie-trainer.html`, fonctions
 * `norm`, `canon` et `alternatives`) sans changer leur comportement (ADR-0005) : majuscules,
 * ae/ä, oe/ö et c/k/z (germanisé ou non) comptent pour la même chose.
 */

/** `norm` : minuscules, NFC, ae→ä, oe→ö, sans ponctuation, espaces réduits, sans tirets de bord. */
export function normaliser(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/ae/g, 'ä')
    .replace(/oe/g, 'ö')
    .replace(/[«»"'.…!?]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[-–\s]+|[-–\s]+$/g, '');
}

/** `canon` : la forme normalisée, avec c→z devant e, i, y, ä, ö, et c→k ailleurs. */
export function canonique(s: string): string {
  return normaliser(s)
    .replace(/c(?=[eiyäö])/g, 'z')
    .replace(/c/g, 'k');
}

/**
 * Les réponses que le recto « annonce » : le recto entier, chaque partie séparée par `/` ou `,`
 * (hors parenthèses), le recto sans ses parenthèses, et le contenu des parenthèses qui n'est pas
 * une remarque (`gr`, `lat`, `!`, `nur`, `und`).
 */
export function alternatives(recto: string): Set<string> {
  const sortie = new Set([canonique(recto)]);
  const base = recto.replace(/\([^)]*\)/g, ' ');
  for (const partie of base.split(/[/,]/)) {
    const c = canonique(partie);
    if (c) sortie.add(c);
  }
  for (const m of recto.matchAll(/\(([^)]*)\)/g)) {
    if (!/\b(gr|lat)\b|!|nur|und/i.test(m[1])) {
      for (const partie of m[1].split(/[/,]/)) {
        const c = canonique(partie);
        if (c) sortie.add(c);
      }
    }
  }
  sortie.add(canonique(base));
  sortie.delete('');
  return sortie;
}

/**
 * Les réponses d'une carte. Sans `reponses`, ce sont les alternatives du recto, comme le
 * prototype. Avec `reponses`, l'auteur les donne : le recto canonisé et chacune d'elles.
 */
export function alternativesDeCarte(carte: Pick<Carte, 'recto' | 'reponses'>): Set<string> {
  if (carte.reponses === undefined) return alternatives(carte.recto);
  const sortie = new Set([canonique(carte.recto)]);
  for (const reponse of carte.reponses) sortie.add(canonique(reponse));
  sortie.delete('');
  return sortie;
}
