import type { CoursPrepare } from '../../domaine/cours/prepare.js';
import { memoireDuCours, seuilDesRebelles } from '../../domaine/cours/servi.js';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { ajouterJours, joursEntre } from '../../domaine/journal/temps.js';
import { FAUTES_PAR_DEFAUT } from '../../domaine/progression/reglages.js';
import { posablesDuCours } from '../../domaine/seances/heute.js';
import {
  barreEmpilee,
  barresHorizontales,
  echapper,
  graphiqueDeCharge,
  jourFrancais,
  type Ligne,
  nombre,
  pourcent,
  type Segment,
  type SerieDeLigne,
} from './graphiques.js';
import {
  type Cellule,
  CLES_DE_DELAI,
  CLES_DE_MODE,
  type CleDeDelai,
  type CleDeMode,
  caseAdmise,
  estActive,
  type Mesures,
  MINIMUM_D_UNE_CASE,
  mesures,
  PART_MAXIMALE_D_UNE_PERSONNE,
  PERSONNES_ACTIVES_MINIMUM,
  partDeJustes,
  reussiteObservee,
  sommerMesures,
} from './mesures.js';
import { moyenneDeProjections, type Projection, projeter, TIRAGES } from './projection.js';
import { FEUILLE_DE_STYLE } from './rapport-style.js';
import {
  CLES_APRES_UNE_FAUTE,
  CLES_D_ESPACEMENT,
  CLES_DE_RANG,
  CLES_DE_REPARTITION,
  CLES_DE_VERDICT,
  type CleApresUneFaute,
  type CleDeVerdict,
} from './reprises.js';

/*
 * Le rapport de suivi d'un cours (M3) : une page HTML autonome, sans script, sans rien qui se charge
 * du réseau. Deux sortes de rapport, et jamais un identifiant ni un nom affiché dans aucun :
 * - le rapport d'une personne, que le responsable demande avec la date de l'accord de la personne ;
 * - le rapport d'ensemble, sur tous les journaux du cours, qui ne dit que le nombre d'éléments du
 *   cours s'il y a moins de trois personnes actives au jour du rapport, et omet toute case (jour,
 *   semaine, moment, mode, boîte, chapitre, reprise) où moins de trois personnes distinctes comptent
 *   (ont répondu, ou ont un élément rebelle pour un chapitre) ou qui compte moins de 20 réponses
 *   (éléments pour une boîte, rebelles pour un chapitre, couples pour la répartition des reprises)
 *   (M3-P6, M6, M7).
 */

/** Les scénarios de la projection : l'algorithme, et le nombre de nouveautés par jour. */
const SCENARIOS = [
  { algorithme: 'leitner', nouvelles: 5 },
  { algorithme: 'leitner', nouvelles: 10 },
  { algorithme: 'leitner', nouvelles: 20 },
  { algorithme: 'leitner', nouvelles: 40 },
  { algorithme: 'fsrs', nouvelles: 10 },
] as const;
/** Celui qui donne le chiffre de tête. */
const SCENARIO_DE_TETE = 2;
/** Ceux du graphique, avec leur série. */
const SCENARIOS_DU_GRAPHIQUE: { rang: number; classe: SerieDeLigne['classe'] }[] = [
  { rang: 0, classe: 's1' },
  { rang: 2, classe: 's2' },
  { rang: 4, classe: 's3' },
];
const GRAINE = 20_261_112;
const JOURS_PAR_SEMAINE = 7;
const SECONDES_PAR_MINUTE = 60;
const POURCENT = 100;

const NOMS_DE_MODE: Record<(typeof CLES_DE_MODE)[number], string> = {
  retournee: 'Carte retournée',
  saisie: 'Réponse tapée',
  corrigee: 'Tapée fausse, déclarée juste',
  choix: 'Choix parmi des propositions',
  assemblage: 'Tuiles d’un mot',
  pointage: 'Point touché sur un dessin',
  association: 'Appariement ou classement',
  montree: 'Réponse montrée',
  lecture: 'Bilan d’un texte',
  'sans-mode': 'sans mode',
};

const NOMS_DE_DELAI: Record<(typeof CLES_DE_DELAI)[number], string> = {
  premiere: 'Première réponse',
  'meme-jour': 'Redonnée le jour même',
  'boite-1': 'À l’échéance, depuis la boîte 1',
  'boite-2': 'À l’échéance, depuis la boîte 2',
  'boite-3': 'À l’échéance, depuis la boîte 3',
  'boite-4': 'À l’échéance, depuis la boîte 4',
  'boite-5': 'À l’échéance, depuis la boîte 5',
  'avant-echeance': 'Revue avant l’échéance',
};

const NOMS_DE_BOITE = [
  'Jamais vus',
  'Boîte 1',
  'Boîte 2',
  'Boîte 3',
  'Boîte 4 (sûrs)',
  'Boîte 5 (sûrs)',
];

export interface DonneesDuRapport {
  cours: CoursPrepare;
  /** Un journal par personne : un seul pour le rapport d'une personne. */
  journaux: readonly (readonly Evenement[])[];
  /** Le rapport d'une personne : la date de l'accord, `JJ/MM/AAAA`, que le responsable déclare. */
  accord?: string;
  /** Le jour du rapport, `AAAA-MM-JJ`. */
  aujourdhui: string;
  /** Le jour de l'examen ; sans lui, pas de projection. */
  jusquau?: string;
}

interface Scenario {
  nom: string;
  algorithme: 'leitner' | 'fsrs';
  nouvelles: number;
  projection: Projection;
}

const p = (texte: string): string => `<p>${texte}</p>`;
const li = (texte: string): string => `<li>${texte}</li>`;

/**
 * Les cases d'un découpage : celles que la règle refuse se fondent dans « autres », omise si elle est
 * refusée à son tour. Aucune case refusée n'est affichée seule.
 */
function fondre<T extends { nom: string }>(
  cases: readonly T[],
  nombreDe: (c: T) => number,
  admise: (c: T) => boolean,
  fusionner: (petites: readonly T[], nom: string) => T,
  nomDesAutres: string,
): T[] {
  const presentes = cases.filter((c) => nombreDe(c) > 0);
  const grandes = presentes.filter(admise);
  const petites = presentes.filter((c) => !admise(c));
  const autres = petites.length === 0 ? undefined : fusionner(petites, nomDesAutres);
  return autres !== undefined && admise(autres) ? [...grandes, autres] : grandes;
}

const sommeDeCellules = (liste: readonly Cellule[]): Cellule => ({
  reponses: liste.reduce((s, c) => s + c.reponses, 0),
  justes: liste.reduce((s, c) => s + c.justes, 0),
});

interface CaseDeReussite {
  nom: string;
  /** Les clés de délai ou de mode que la case réunit : une seule, sauf pour « autres ». */
  cles: readonly string[];
  cellule: Cellule;
  /** Les réponses de chaque personne dans la case. */
  comptes: readonly number[];
}

/** Une ligne affichée, avec les clés qu'elle réunit. */
type LigneDeCase = Ligne & { cles: readonly string[] };

function lignesDeReussite(
  cases: readonly CaseDeReussite[],
  admise: (comptes: readonly number[]) => boolean,
  nomDesAutres: string,
  pourcentsEntiers: boolean,
): LigneDeCase[] {
  return fondre(
    cases,
    (c) => c.cellule.reponses,
    (c) => admise(c.comptes),
    (petites, nom) => ({
      nom,
      cles: petites.flatMap((c) => c.cles),
      cellule: sommeDeCellules(petites.map((c) => c.cellule)),
      comptes:
        petites[0]?.comptes.map((_, i) => petites.reduce((s, c) => s + (c.comptes[i] ?? 0), 0)) ??
        [],
    }),
    nomDesAutres,
  ).map(({ nom, cles, cellule }) => ({
    nom,
    cles,
    part: pourcentsEntiers
      ? Math.round((partDeJustes(cellule) ?? 0) * POURCENT) / POURCENT
      : (partDeJustes(cellule) ?? 0),
    reponses: cellule.reponses,
  }));
}

/**
 * Les lignes de la section des moments et des modes : celles que la règle admet, les autres fondues
 * dans « autres ». Les reprises du jour les relisent, pour qu'aucune de leurs lignes ne laisse
 * retrouver par différence une case refusée (M7-D6).
 */
export function lignesDesMoments(
  parPersonne: readonly Mesures[],
  total: Mesures,
  admise: (comptes: readonly number[]) => boolean,
  personne: boolean,
): { delai: LigneDeCase[]; mode: LigneDeCase[] } {
  return {
    delai: lignesDeReussite(
      CLES_DE_DELAI.map((cle) => ({
        nom: NOMS_DE_DELAI[cle],
        cles: [cle],
        cellule: total.delais[cle],
        comptes: parPersonne.map((m) => m.delais[cle].reponses),
      })),
      admise,
      'Autres moments',
      !personne,
    ),
    mode: lignesDeReussite(
      CLES_DE_MODE.map((cle) => ({
        nom: NOMS_DE_MODE[cle],
        cles: [cle],
        cellule: total.modes[cle],
        comptes: parPersonne.map((m) => m.modes[cle].reponses),
      })),
      admise,
      'Autres modes',
      !personne,
    ),
  };
}

function tableau(entetes: readonly string[], lignes: readonly (readonly string[])[]): string {
  const tete = entetes.map((e) => `<th scope="col">${echapper(e)}</th>`).join('');
  const corps = lignes
    .map(
      (ligne) =>
        `<tr>${ligne.map((cellule, i) => (i === 0 ? `<th scope="row">${cellule}</th>` : `<td>${cellule}</td>`)).join('')}</tr>`,
    )
    .join('');
  return `<div class="tableau"><table><thead><tr>${tete}</tr></thead><tbody>${corps}</tbody></table></div>`;
}

const chiffres = (contenu: string): string =>
  `<details><summary>Les chiffres</summary>${contenu}</details>`;

function legende(entrees: readonly { classe: string; texte: string }[]): string {
  return `<ul class="legende">${entrees
    .map(({ classe, texte }) => `<li class="${classe}"><i class="puce"></i>${echapper(texte)}</li>`)
    .join('')}</ul>`;
}

/** Le nombre arrondi à la dizaine au-delà de 50 : « environ » un chiffre qui n'a pas plus de précision. */
function environ(valeur: number): number {
  return valeur >= 50 ? Math.round(valeur / 10) * 10 : Math.round(valeur);
}

function projeterTout(
  journaux: readonly (readonly Evenement[])[],
  cours: CoursPrepare,
  donnees: { aujourdhui: string; jusquau: string },
  pooled: Mesures,
): Scenario[] {
  const reussite = reussiteObservee(pooled);
  return SCENARIOS.map(({ algorithme, nouvelles }) => ({
    algorithme,
    nouvelles,
    nom:
      algorithme === 'leitner'
        ? `Leitner, ${nouvelles} nouveautés par jour`
        : `FSRS, ${nouvelles} nouveautés par jour`,
    projection: moyenneDeProjections(
      journaux.map((journal) =>
        projeter(journal, cours, {
          ...donnees,
          nouvellesParJour: nouvelles,
          algorithme,
          graine: GRAINE,
          reussite,
        }),
      ),
    ),
  }));
}

/**
 * Les moyennes par jour et par personne de chaque semaine passée, en remontant d'aujourd'hui de sept
 * en sept jours. Une semaine ne compte que ses jours affichés (`estAffiche`), n'a de valeur que si
 * sa case passe la règle, et se divise par les personnes qui y ont répondu.
 */
function semainesPassees(
  parPersonne: readonly Mesures[],
  estAffiche: (jour: string) => boolean,
  premierJour: string | null,
  aujourdhui: string,
  admise: (comptes: readonly number[]) => boolean,
): { debut: string; valeur: number | null }[] {
  if (premierJour === null) return [];
  const semaines = Math.ceil(joursEntre(premierJour, aujourdhui) / JOURS_PAR_SEMAINE);
  return Array.from({ length: semaines }, (_, i) => {
    const debut = ajouterJours(aujourdhui, -JOURS_PAR_SEMAINE * (semaines - i));
    const comptes = parPersonne.map(() => 0);
    let jours = 0;
    for (let k = 0; k < JOURS_PAR_SEMAINE; k++) {
      const jour = ajouterJours(debut, k);
      if (jour < premierJour || !estAffiche(jour)) continue;
      jours += 1;
      parPersonne.forEach((m, rang) => {
        comptes[rang] = (comptes[rang] ?? 0) + (m.parJour[jour]?.reponses ?? 0);
      });
    }
    const total = comptes.reduce((s, n) => s + n, 0);
    const qui = comptes.filter((n) => n > 0).length;
    return {
      debut,
      valeur: jours === 0 || !admise(comptes) ? null : total / jours / Math.max(1, qui),
    };
  });
}

const feuille = (contenu: string, titre: string): string =>
  `<section><h2>${echapper(titre)}</h2>${contenu}</section>`;

function pageHtml(titreDePage: string, corps: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${echapper(titreDePage)}</title>
<style>${FEUILLE_DE_STYLE}</style>
</head>
<body>
<main>
${corps}
</main>
</body>
</html>
`;
}

/**
 * Le rapport d'ensemble de moins de trois personnes actives : le nombre d'éléments du cours, et
 * rien d'autre. Un total de réponses, une période ou un jour décriraient une personne.
 */
function rapportLimite(cours: CoursPrepare, aujourdhui: string): string {
  return pageHtml(
    'Rapport de suivi',
    `<header><h1>Rapport d’ensemble : moins de trois personnes actives</h1>
<p class="meta">Cours « ${echapper(cours.cours.titre)} », rapport du ${jourFrancais(aujourdhui)}. Document privé.</p></header>
<section><p>Il y a moins de trois personnes actives (vingt réponses au moins dans les vingt-huit jours qui finissent au jour du rapport) : un chiffre, un graphique, une réussite ou une projection décriraient une personne plutôt que le cours. Le rapport ne garde donc que ce qui ne distingue personne : le nombre d’éléments du cours. Il n’imprime ni total de réponses, ni première ou dernière date du journal.</p>
${tableau(['Le cours', 'Valeur'], [['Éléments à savoir', nombre(posablesDuCours(cours).length)]])}</section>`,
  );
}

/** Les boîtes d'un rapport d'ensemble, regroupées avec leurs voisines jusqu'à ce que chaque groupe passe. */
export interface GroupeDeBoites {
  /** Les rangs de boîte du groupe, consécutifs. */
  rangs: number[];
  /** Les éléments du groupe, par personne. */
  comptes: number[];
}

/**
 * Regroupe les boîtes (`boites[rang][personne]` : les éléments de la personne dans la boîte) : une
 * boîte vide est laissée de côté, une boîte que la règle refuse se fond avec sa voisine de droite (de
 * gauche pour la dernière), jusqu'à ce que tous les groupes passent. `null` si même le tout est refusé.
 */
export function regrouperLesBoites(
  boites: readonly (readonly number[])[],
  admise: (comptes: readonly number[]) => boolean,
): GroupeDeBoites[] | null {
  const somme = (comptes: readonly number[]): number => comptes.reduce((s, n) => s + n, 0);
  let groupes: GroupeDeBoites[] = boites
    .map((comptes, rang) => ({ rangs: [rang], comptes: [...comptes] }))
    .filter((groupe) => somme(groupe.comptes) > 0);
  for (;;) {
    const refuse = groupes.findIndex((groupe) => !admise(groupe.comptes));
    if (refuse < 0) return groupes.length === 0 ? null : groupes;
    if (groupes.length === 1) return null;
    const gauche = refuse + 1 < groupes.length ? refuse : refuse - 1;
    const a = groupes[gauche];
    const b = groupes[gauche + 1];
    if (a === undefined || b === undefined) return null;
    groupes = [
      ...groupes.slice(0, gauche),
      {
        rangs: [...a.rangs, ...b.rangs],
        comptes: a.comptes.map((n, i) => n + (b.comptes[i] ?? 0)),
      },
      ...groupes.slice(gauche + 2),
    ];
  }
}

/**
 * Les tuiles « du cours déjà vu » et « du cours sûr » (boîtes 4 et 5) ne s'affichent que si leurs
 * boîtes sont une réunion exacte de groupes affichés : « vu » demande la boîte 0 seule en groupe, « sûr »
 * demande qu'aucun groupe ne chevauche les boîtes 4 et 5 et les autres. Sans quoi la part affichée,
 * rapprochée des groupes, isolerait une boîte que la règle a refusée.
 */
export function tuilesAffichables(groupes: readonly GroupeDeBoites[] | null): {
  vu: boolean;
  sur: boolean;
} {
  if (groupes === null) return { vu: false, sur: false };
  const dansLesSures = (groupe: GroupeDeBoites): boolean => groupe.rangs.every((rang) => rang >= 4);
  const horsDesSures = (groupe: GroupeDeBoites): boolean => groupe.rangs.every((rang) => rang <= 3);
  return {
    vu: groupes.some((groupe) => groupe.rangs.length === 1 && groupe.rangs[0] === 0),
    sur:
      groupes.some(dansLesSures) &&
      groupes.every((groupe) => dansLesSures(groupe) || horsDesSures(groupe)),
  };
}

/** Les éléments, par personne, des boîtes `rangs`. */
const elementsDesBoites = (parPersonne: readonly Mesures[], rangs: readonly number[]): number[] =>
  parPersonne.map((m) => rangs.reduce((s, rang) => s + (m.boites[rang] ?? 0), 0));

/** Les seuils que le tableau d'une personne essaie, sans le seuil du cours s'il est plus haut. */
const SEUILS_ESSAYES = [2, 3, 4, 5, 6, 7, 8];

/** Les éléments d'un module qui ont `seuil` fautes ou plus ; `fautes[n]` est le nombre à `n` fautes. */
const rebellesAuSeuil = (fautes: readonly number[] | undefined, seuil: number): number =>
  (fautes ?? []).slice(seuil).reduce((s, n) => s + n, 0);

const elementsDuModule = (fautes: readonly number[] | undefined): number =>
  (fautes ?? []).reduce((s, n) => s + n, 0);

interface CaseDeChapitre {
  nom: string;
  /** Les éléments rebelles de chaque personne dans le chapitre. */
  comptes: readonly number[];
  rebelles: number;
  /** Les éléments du chapitre, comptés pour chaque personne. */
  elements: number;
}

/**
 * La section « Les éléments rebelles » (M6, T1-D9), par chapitre, c'est-à-dire par module, dans
 * l'ordre du cours. Une personne : des nombres, et le compte du cours à chaque seuil. L'ensemble :
 * des pourcentages entiers, chaque chapitre par la règle d'une case, les refusés fondus dans « autres
 * chapitres ». Ni tableau selon le seuil ni total : la ligne d'un seuil serait la somme des cases de
 * chapitre, et laisserait retrouver par soustraction une case refusée.
 */
function sectionDesRebelles(
  cours: CoursPrepare,
  parPersonne: readonly Mesures[],
  total: Mesures,
  personne: boolean,
  admise: (comptes: readonly number[]) => boolean,
): string {
  const seuil = seuilDesRebelles(cours.cours);
  const chapitres = cours.cours.modules.filter(
    (module) => total.fautesParModule[module.id] !== undefined,
  );
  const definition = `Un élément est rebelle quand il compte ${nombre(seuil)} fautes ou plus : une faute ne compte qu’après une première réponse juste, une seule par jour ; trois réponses justes de suite remettent ses fautes à zéro. Le seuil est celui du cours (<code>rebelles</code> du manifeste, ${nombre(FAUTES_PAR_DEFAUT)} par défaut). Seuls les éléments que pose « Heute » comptent ; le chapitre est le module.`;
  if (personne) {
    const lignes = chapitres.map((module) => [
      echapper(module.titre),
      nombre(elementsDuModule(total.fautesParModule[module.id])),
      nombre(rebellesAuSeuil(total.fautesParModule[module.id], seuil)),
    ]);
    const seuils = [...new Set([...SEUILS_ESSAYES, seuil])].sort((a, b) => a - b);
    const selonLeSeuil = seuils.map((essaye) => [
      `${nombre(essaye)} fautes${essaye === seuil ? ' (seuil du cours)' : ''}`,
      nombre(
        chapitres.reduce(
          (s, module) => s + rebellesAuSeuil(total.fautesParModule[module.id], essaye),
          0,
        ),
      ),
    ]);
    return feuille(
      `${p(definition)}
${chiffres(tableau(['Chapitre', 'Éléments', 'Rebelles'], lignes))}
<h3>Selon le seuil</h3>
${chiffres(tableau(['Seuil', 'Éléments rebelles du cours'], selonLeSeuil))}
${p('Le second tableau aide à régler <code>rebelles.fautes</code> : il donne le nombre d’éléments rebelles du cours si le seuil était celui de la ligne.')}`,
      'Les éléments rebelles',
    );
  }
  const cases: CaseDeChapitre[] = chapitres.map((module) => ({
    nom: module.titre,
    comptes: parPersonne.map((m) => rebellesAuSeuil(m.fautesParModule[module.id], seuil)),
    rebelles: rebellesAuSeuil(total.fautesParModule[module.id], seuil),
    elements: elementsDuModule(total.fautesParModule[module.id]),
  }));
  const affichees = fondre(
    cases,
    (c) => c.rebelles,
    (c) => admise(c.comptes),
    (petites, nom): CaseDeChapitre => ({
      nom,
      comptes:
        petites[0]?.comptes.map((_, i) => petites.reduce((s, c) => s + (c.comptes[i] ?? 0), 0)) ??
        [],
      rebelles: petites.reduce((s, c) => s + c.rebelles, 0),
      elements: petites.reduce((s, c) => s + c.elements, 0),
    }),
    'Autres chapitres',
  );
  if (affichees.length === 0) {
    return feuille(
      p(
        `Les éléments rebelles par chapitre sont omis : les chapitres, même réunis, ne passent pas la règle (au moins ${PERSONNES_ACTIVES_MINIMUM} personnes qui y ont un rebelle, ${MINIMUM_D_UNE_CASE} rebelles en tout, et pas plus de ${PART_MAXIMALE_D_UNE_PERSONNE} % pour une personne). Un chapitre sans élément rebelle n’est pas dit non plus.`,
      ),
      'Les éléments rebelles par chapitre',
    );
  }
  return feuille(
    `${p(definition)}
${p('Pour chaque chapitre : la part des éléments rebelles, pour toutes les personnes actives ensemble. Un chapitre qui ne passe pas la règle se fond dans « Autres chapitres », omis s’il ne la passe pas non plus ; un chapitre sans élément rebelle n’a pas de ligne.')}
${chiffres(
  tableau(
    ['Chapitre', 'Part d’éléments rebelles'],
    affichees.map((c) => [echapper(c.nom), pourcent(c.rebelles / Math.max(1, c.elements))]),
  ),
)}`,
    'Les éléments rebelles par chapitre',
  );
}

// ---------------------------------------------------------------------------------------------
// Les reprises du jour (M7)
// ---------------------------------------------------------------------------------------------

/** Une ligne d'un tableau de reprises : les clés qu'elle réunit, et ses nombres. */
export interface LigneDeReprise {
  nom: string;
  /** Une plage de clés contiguës (le mode : les modes réunis). */
  cles: readonly string[];
  /** Pour la répartition, `reponses` compte des couples et `justes` vaut 0. */
  cellule: Cellule;
  /** Par personne, ce que compte la ligne. */
  comptes: readonly number[];
}

export type TableDeReprises =
  | { forme: 'moities'; faute: readonly LigneDeReprise[]; juste: readonly LigneDeReprise[] }
  | { forme: 'reunies'; lignes: readonly LigneDeReprise[] };

export interface TablesDesReprises {
  rangs: TableDeReprises | null;
  espacements: TableDeReprises | null;
  modes: TableDeReprises | null;
  repartition: TableDeReprises | null;
  apresUnJourDeFaute: readonly LigneDeReprise[] | null;
  /** Les tableaux omis par un croisement avec la section des moments et des modes (M7-D6). */
  omisParCroisement: { modes: boolean; apresUnJourDeFaute: boolean };
}

/** Les comptes d'une clé : sa cellule, tous journaux, et le compte de chaque personne. */
export interface DonneesDeCle {
  cellule: Cellule;
  comptes: number[];
}

type SourceDeCle<K extends string> = (m: Mesures, cle: K, moitie: CleDeVerdict) => Cellule;

const admiseDe =
  (personne: boolean) =>
  (comptes: readonly number[]): boolean =>
    personne || caseAdmise(comptes);

const sommeDeNombres = (liste: readonly number[]): number => liste.reduce((s, n) => s + n, 0);

function donneesDesCles<K extends string>(
  cles: readonly K[],
  parPersonne: readonly Mesures[],
  source: SourceDeCle<K>,
  moities: readonly CleDeVerdict[],
): DonneesDeCle[] {
  return cles.map((cle) => {
    const cellule: Cellule = { reponses: 0, justes: 0 };
    const comptes = parPersonne.map((m) => {
      let compte = 0;
      for (const moitie of moities) {
        const c = source(m, cle, moitie);
        cellule.reponses += c.reponses;
        cellule.justes += c.justes;
        compte += c.reponses;
      }
      return compte;
    });
    return { cellule, comptes };
  });
}

/** Les noms que prend une plage de clés, selon ses bornes (jamais la liste de ses cases). */
export interface NomsDePlage {
  uniques: readonly string[];
  /** Une plage qui finit à la dernière clé. */
  ouverte(debut: number): string;
  fermee(debut: number, fin: number): string;
  /** La plage de toutes les clés. */
  toutes: string;
}

function nommerPlage(noms: NomsDePlage, debut: number, fin: number): string {
  const derniere = noms.uniques.length - 1;
  if (debut === 0 && fin === derniere) return noms.toutes;
  if (debut === fin) return noms.uniques[debut] ?? '';
  return fin === derniere ? noms.ouverte(debut) : noms.fermee(debut, fin);
}

const RANGS_ORDINAUX = ['1re', '2e', '3e', '4e'] as const;
const NOMS_DE_RANG: NomsDePlage = {
  uniques: ['1re reprise', '2e reprise', '3e reprise', '4e reprise et au-delà'],
  ouverte: (debut) => `${RANGS_ORDINAUX[debut]} reprise et au-delà`,
  fermee: (debut, fin) => `de la ${RANGS_ORDINAUX[debut]} à la ${RANGS_ORDINAUX[fin]} reprise`,
  toutes: 'Toutes les reprises',
};

const AUTRES_MINIMUM = [0, 1, 3, 6, 11] as const;
const AUTRES_MAXIMUM = [0, 2, 5, 10] as const;
const autresReponses = (n: number): string =>
  `${n} autre${n > 1 ? 's' : ''} réponse${n > 1 ? 's' : ''}`;
const NOMS_D_ESPACEMENT: NomsDePlage = {
  uniques: [
    'Aucune autre réponse entre les deux',
    '1 ou 2 autres réponses',
    '3 à 5 autres réponses',
    '6 à 10 autres réponses',
    '11 autres réponses ou plus',
  ],
  ouverte: (debut) => `${autresReponses(AUTRES_MINIMUM[debut] ?? 0)} ou plus`,
  fermee: (debut, fin) => `de ${AUTRES_MINIMUM[debut]} à ${AUTRES_MAXIMUM[fin]} autres réponses`,
  toutes: 'Toutes les reprises',
};

const reprises = (n: number): string => `${n} reprise${n > 1 ? 's' : ''}`;
const NOMS_DE_REPARTITION: NomsDePlage = {
  uniques: ['0 reprise', '1 reprise', '2 reprises', '3 reprises', '4 reprises ou plus'],
  ouverte: (debut) => `${reprises(debut)} ou plus`,
  fermee: (debut, fin) => `de ${debut} à ${fin} reprises`,
  toutes: 'Tous les couples',
};

const NOMS_APRES_UNE_FAUTE: NomsDePlage = {
  uniques: [
    '0 reprise après la faute',
    '1 reprise après la faute',
    '2 reprises après la faute',
    '3 reprises ou plus après la faute',
  ],
  ouverte: (debut) => `${reprises(debut)} ou plus après la faute`,
  fermee: (debut, fin) => `de ${debut} à ${fin} reprises après la faute`,
  toutes: 'Tous les jours de faute suivis',
};

/** La ligne qui réunit les clés `indices` : ses cellules, et le compte de chaque personne. */
function ligneDe(
  cles: readonly string[],
  donnees: readonly DonneesDeCle[],
  indices: readonly number[],
  nom: string,
): LigneDeReprise {
  const parts = indices.flatMap((i) => (donnees[i] === undefined ? [] : [donnees[i]]));
  return {
    nom,
    cles: indices.flatMap((i) => (cles[i] === undefined ? [] : [cles[i]])),
    cellule: sommeDeCellules(parts.map((d) => d.cellule)),
    comptes:
      parts[0]?.comptes.map((_, i) => parts.reduce((s, d) => s + (d.comptes[i] ?? 0), 0)) ?? [],
  };
}

const plage = (debut: number, fin: number): number[] =>
  Array.from({ length: fin - debut + 1 }, (_, i) => debut + i);

/**
 * Les lignes d'un tableau ordonné. Une personne : une ligne par clé non vide. L'ensemble : les
 * groupes de `regrouperLesBoites` deviennent des plages sans trou, de la première clé à la dernière :
 * une clé vide rejoint le groupe de sa gauche, celles d'avant le premier groupe le premier, et le
 * dernier groupe va jusqu'à la dernière clé. Une plage se nomme par ses bornes. `null` si même la
 * plage entière est refusée.
 */
export function regrouperEnPlages(
  cles: readonly string[],
  donnees: readonly DonneesDeCle[],
  noms: NomsDePlage,
  admise: (comptes: readonly number[]) => boolean,
  personne: boolean,
): LigneDeReprise[] | null {
  if (personne) {
    return donnees.flatMap((d, rang) =>
      d.cellule.reponses > 0 ? [ligneDe(cles, donnees, [rang], nommerPlage(noms, rang, rang))] : [],
    );
  }
  const groupes = regrouperLesBoites(
    donnees.map((d) => d.comptes),
    admise,
  );
  if (groupes === null) return null;
  const derniere = cles.length - 1;
  return groupes.map((groupe, rang) => {
    const debut = rang === 0 ? 0 : (groupe.rangs[0] ?? 0);
    const fin = rang === groupes.length - 1 ? derniere : (groupes[rang + 1]?.rangs[0] ?? 1) - 1;
    return ligneDe(cles, donnees, plage(debut, fin), nommerPlage(noms, debut, fin));
  });
}

/**
 * Les lignes du mode : une case refusée se fond dans « Autres modes » ; si elle est refusée à son
 * tour, le mode admis le moins fourni la rejoint, et ainsi de suite. « Autres modes » ne dit pas
 * quels modes elle réunit, et la ligne de tous les modes se dit « Toutes les reprises ». Les modes
 * `ecartes` (leurs indices) ne s'affichent jamais seuls : ils se fondent comme une case refusée (M7-D6).
 */
export function couvrirLesModes(
  donnees: readonly DonneesDeCle[],
  admise: (comptes: readonly number[]) => boolean,
  personne: boolean,
  ecartes: ReadonlySet<number> = new Set(),
): LigneDeReprise[] | null {
  const cles: readonly string[] = CLES_DE_MODE;
  const nomDe = (i: number): string => NOMS_DE_MODE[CLES_DE_MODE[i] as CleDeMode];
  const total = (i: number): number => donnees[i]?.cellule.reponses ?? 0;
  const presents = cles.flatMap((_, i) => (total(i) > 0 ? [i] : []));
  if (personne) return presents.map((i) => ligneDe(cles, donnees, [i], nomDe(i)));
  const comptesDe = (indices: readonly number[]): readonly number[] =>
    ligneDe(cles, donnees, indices, '').comptes;
  const passe = (indices: readonly number[]): boolean => admise(comptesDe(indices));
  let gardes = presents.filter((i) => !ecartes.has(i) && passe([i]));
  const absorbes = presents.filter((i) => !gardes.includes(i));
  if (absorbes.length > 0) {
    while (!passe(absorbes) && gardes.length > 0) {
      const moins = gardes.reduce((a, b) => (total(b) < total(a) ? b : a));
      absorbes.push(moins);
      gardes = gardes.filter((i) => i !== moins);
    }
    if (!passe(absorbes)) return null;
  }
  const lignes = gardes.map((i) => ligneDe(cles, donnees, [i], nomDe(i)));
  if (absorbes.length === 0) return lignes;
  const nom = gardes.length === 0 ? 'Toutes les reprises' : 'Autres modes';
  return [
    ...lignes,
    ligneDe(
      cles,
      donnees,
      [...absorbes].sort((a, b) => a - b),
      nom,
    ),
  ];
}

/**
 * La forme d'un tableau : deux moitiés si chacune passe la règle, réunies si seul le tout la passe,
 * `null` (omis) sinon. Jamais les deux formes d'un même tableau : une ligne réunie moins une ligne de
 * moitié donnerait une part de l'autre moitié. Une personne a toujours les deux moitiés.
 */
function formeDe(
  faute: readonly number[],
  juste: readonly number[],
  admise: (comptes: readonly number[]) => boolean,
  personne: boolean,
): 'moities' | 'reunies' | null {
  if (personne || (admise(faute) && admise(juste))) return 'moities';
  return admise(faute.map((n, i) => n + (juste[i] ?? 0))) ? 'reunies' : null;
}

/**
 * La forme du rang, de l'espacement et du mode, qui partagent les mêmes reprises et les mêmes
 * moitiés : elle se décide une fois pour les trois, et aucun d'eux ne montre une moitié quand un autre
 * montre la réunion.
 */
export function formeDesReprises(
  parPersonne: readonly Mesures[],
  personne: boolean,
): 'moities' | 'reunies' | null {
  const duVerdict = (verdict: CleDeVerdict): number[] =>
    parPersonne.map((m) =>
      sommeDeNombres(CLES_DE_RANG.map((cle) => m.reprises.rangs[verdict][cle].reponses)),
    );
  return formeDe(duVerdict('faute'), duVerdict('juste'), admiseDe(personne), personne);
}

function tableDeReprises<K extends string>(
  forme: 'moities' | 'reunies' | null,
  cles: readonly K[],
  source: SourceDeCle<K>,
  parPersonne: readonly Mesures[],
  lignesDe: (
    donnees: readonly DonneesDeCle[],
    moities: readonly CleDeVerdict[],
  ) => LigneDeReprise[] | null,
): TableDeReprises | null {
  if (forme === null) return null;
  const lignes = (moities: readonly CleDeVerdict[]) =>
    lignesDe(donneesDesCles(cles, parPersonne, source, moities), moities);
  if (forme === 'reunies') {
    const reunies = lignes(CLES_DE_VERDICT);
    return reunies === null ? null : { forme, lignes: reunies };
  }
  const faute = lignes(['faute']);
  const juste = lignes(['juste']);
  return faute === null || juste === null ? null : { forme, faute, juste };
}

/** Le reste d'une réunion de lignes de la section des moments ou des modes est vide, ou passe la règle. */
const resteVideOuAdmis = (reste: readonly number[]): boolean =>
  reste.every((n) => n === 0) || caseAdmise(reste);

const lignesDeTable = (table: TableDeReprises | null): readonly LigneDeReprise[] =>
  table === null ? [] : table.forme === 'reunies' ? table.lignes : [...table.faute, ...table.juste];

/** Une ligne du mode des reprises, avec les moitiés (verdicts d'avant) qu'elle compte. */
export interface LigneDeModeAvecMoities {
  ligne: LigneDeReprise;
  verdicts: readonly CleDeVerdict[];
}

const lignesDuModeAvecMoities = (table: TableDeReprises | null): LigneDeModeAvecMoities[] =>
  table === null
    ? []
    : table.forme === 'reunies'
      ? table.lignes.map((ligne) => ({ ligne, verdicts: CLES_DE_VERDICT }))
      : [
          ...table.faute.map((ligne) => ({ ligne, verdicts: ['faute'] as const })),
          ...table.juste.map((ligne) => ({ ligne, verdicts: ['juste'] as const })),
        ];

/** Au-delà, les réunions de lignes des reprises ne s'énumèrent plus : on replie, par prudence. */
const LIGNES_MAXIMALES_D_UN_TABLEAU = 12;

/** Toutes les parties non vides d'une liste de lignes (au plus 2^12 - 1 : le mode des reprises). */
function reunionsDe<T>(lignes: readonly T[]): T[][] {
  return Array.from({ length: 2 ** lignes.length - 1 }, (_, i) =>
    lignes.filter((_ligne, rang) => ((i + 1) >> rang) & 1),
  );
}

interface EchecDeReunion {
  tableau: 'mode' | 'moment';
  /** Les clés de mode ou de délai de la réunion de lignes affichées qui laisse un reste refusé. */
  cles: readonly string[];
  /** Une ligne de « Après un jour de faute » est en cause : on l'omet avant de fondre des modes. */
  viaApres: boolean;
}

/**
 * Les croisements des reprises avec la section des moments et des modes (M7-D6). Pour chaque réunion V
 * de lignes affichées d'un même tableau de cette section (moments, ou modes), soit U la réunion de
 * toutes les lignes affichées des reprises que V contient : les lignes du mode dont tous les modes sont
 * dans V, les lignes de « Après un jour de faute » dont toutes les réponses (pour chaque personne) sont
 * dans V. Ces lignes sont disjointes (le mode ne compte que des reprises, l'après-faute que des
 * réponses qui n'en sont pas). Les reprises sont exactement « Redonnée le jour même » : une réunion V
 * qui la contient a pour reste celui de V sans elle, déjà vérifié comme réunion. Il faut que V - U soit
 * vide ou passe `caseAdmise`. Cela suffit : pour toute partie S de ces lignes, V - S = (V - U) union
 * (U - S), une réunion disjointe d'un ensemble vide ou admis et de lignes admises, donc admise (une
 * réunion de cases admises disjointes l'est). Le sens inverse est symétrique, même lemme : pour toute
 * réunion W de lignes affichées d'un même tableau des reprises (le mode, ou le lendemain), soit T la
 * réunion des lignes affichées d'un même tableau de la section des moments et des modes que W
 * contient entièrement, personne par personne ; W - T est vide ou passe la règle. Rend la première
 * réunion qui échoue, ou `null`.
 */
export function premierEchecDeReunion(
  parPersonne: readonly Mesures[],
  affichees: { delai: readonly LigneDeCase[]; mode: readonly LigneDeCase[] },
  modes: readonly LigneDeModeAvecMoities[],
  apres: readonly LigneDeReprise[],
): EchecDeReunion | null {
  const sommes = (comptes: readonly (readonly number[])[]): number[] =>
    parPersonne.map((_, i) => sommeDeNombres(comptes.map((c) => c[i] ?? 0)));
  /** Les lignes du tableau de l'après-faute que la réunion contient entièrement, personne par personne. */
  const apresContenues = (
    dans: (m: Mesures, cleDeFaute: CleApresUneFaute, cle: string) => number,
    cles: readonly string[],
  ): readonly LigneDeReprise[] =>
    apres.filter((ligne) => {
      const dedans = parPersonne.map((m) =>
        sommeDeNombres(
          ligne.cles.flatMap((k) => cles.map((c) => dans(m, k as CleApresUneFaute, c))),
        ),
      );
      return ligne.comptes.some((n) => n > 0) && dedans.every((n, i) => n === ligne.comptes[i]);
    });
  for (const reunion of reunionsDe(affichees.mode)) {
    const cles = reunion.flatMap((ligne) => ligne.cles);
    const contenues = [
      ...modes.map((l) => l.ligne).filter((ligne) => ligne.cles.every((c) => cles.includes(c))),
      ...apresContenues((m, k, c) => m.reprises.apresParMode[k][c as CleDeMode], cles),
    ];
    const viaApres =
      apresContenues((m, k, c) => m.reprises.apresParMode[k][c as CleDeMode], cles).length > 0;
    const retire = sommes(contenues.map((ligne) => ligne.comptes));
    const reste = parPersonne.map(
      (m, i) =>
        sommeDeNombres(cles.map((c) => m.modes[c as CleDeMode].reponses)) - (retire[i] ?? 0),
    );
    if (!resteVideOuAdmis(reste)) return { tableau: 'mode', cles, viaApres };
  }
  for (const reunion of reunionsDe(affichees.delai)) {
    const cles = reunion.flatMap((ligne) => ligne.cles);
    const contenues = apresContenues(
      (m, k, c) => m.reprises.apresParMoment[k][c as CleDeDelai],
      cles,
    );
    const retire = sommes(contenues.map((ligne) => ligne.comptes));
    const reste = parPersonne.map(
      (m, i) =>
        sommeDeNombres(cles.map((c) => m.delais[c as CleDeDelai].reponses)) - (retire[i] ?? 0),
    );
    if (!resteVideOuAdmis(reste)) return { tableau: 'moment', cles, viaApres: true };
  }
  /** La part de `ligne` (une ligne de la section 6) que `dansW` donne : elle y est toute, ou non. */
  const contenue = (
    ligne: LigneDeCase,
    dansW: (m: Mesures, c: string) => number,
    toutes: (m: Mesures, c: string) => number,
  ): number[] | null => {
    const total = parPersonne.map((m) => sommeDeNombres(ligne.cles.map((c) => toutes(m, c))));
    const dedans = parPersonne.map((m) => sommeDeNombres(ligne.cles.map((c) => dansW(m, c))));
    return total.some((n) => n > 0) && dedans.every((n, i) => n === total[i]) ? total : null;
  };
  // Le sens inverse : le mode des reprises, puis le lendemain, contre la section des moments et des modes.
  if (modes.length > LIGNES_MAXIMALES_D_UN_TABLEAU) {
    return { tableau: 'mode', cles: [], viaApres: false };
  }
  for (const w of reunionsDe(modes)) {
    const reste = sommes(w.map((l) => l.ligne.comptes));
    const retire = affichees.mode.flatMap((ligne) => {
      const total = contenue(
        ligne,
        (m, c) =>
          sommeDeNombres(
            w.flatMap((l) =>
              l.ligne.cles.includes(c)
                ? l.verdicts.map((v) => m.reprises.modes[v][c as CleDeMode].reponses)
                : [],
            ),
          ),
        (m, c) => m.modes[c as CleDeMode].reponses,
      );
      return total === null ? [] : [total];
    });
    const sansT = reste.map((n, i) => n - sommeDeNombres(retire.map((t) => t[i] ?? 0)));
    if (!resteVideOuAdmis(sansT)) {
      return { tableau: 'mode', cles: w.flatMap((l) => l.ligne.cles), viaApres: false };
    }
  }
  for (const w of reunionsDe(apres)) {
    const reste = sommes(w.map((l) => l.comptes));
    const sources = [
      {
        lignes: affichees.delai,
        dans: (m: Mesures, k: string, c: string) =>
          m.reprises.apresParMoment[k as CleApresUneFaute][c as CleDeDelai],
        toutes: (m: Mesures, c: string) => m.delais[c as CleDeDelai].reponses,
      },
      {
        lignes: affichees.mode,
        dans: (m: Mesures, k: string, c: string) =>
          m.reprises.apresParMode[k as CleApresUneFaute][c as CleDeMode],
        toutes: (m: Mesures, c: string) => m.modes[c as CleDeMode].reponses,
      },
    ];
    for (const source of sources) {
      const retire = source.lignes.flatMap((ligne) => {
        const total = contenue(
          ligne,
          (m, c) => sommeDeNombres(w.flatMap((l) => l.cles.map((k) => source.dans(m, k, c)))),
          source.toutes,
        );
        return total === null ? [] : [total];
      });
      const sansT = reste.map((n, i) => n - sommeDeNombres(retire.map((t) => t[i] ?? 0)));
      if (!resteVideOuAdmis(sansT)) return { tableau: 'moment', cles: [], viaApres: true };
    }
  }
  return null;
}

/** Ce que la section « Les reprises du jour » affiche ; `null`, un tableau omis (ensemble seulement). */
export function tablesDesReprises(
  parPersonne: readonly Mesures[],
  personne: boolean,
): TablesDesReprises {
  const admise = admiseDe(personne);
  const forme = formeDesReprises(parPersonne, personne);
  const enPlages =
    (cles: readonly string[], noms: NomsDePlage) =>
    (donnees: readonly DonneesDeCle[]): LigneDeReprise[] | null =>
      regrouperEnPlages(cles, donnees, noms, admise, personne);
  const couples = (verdict: CleDeVerdict): number[] =>
    parPersonne.map((m) => sommeDeNombres(Object.values(m.reprises.repartition[verdict])));
  const apres = donneesDesCles(
    CLES_APRES_UNE_FAUTE,
    parPersonne,
    (m, cle) => m.reprises.apresUnJourDeFaute[cle],
    ['faute'],
  );
  // Les lignes de la section des moments et des modes, que la personne ne lit pas : un rapport
  // d'une personne n'a pas de règle de case, donc pas de croisement à garder.
  const affichees = personne
    ? { delai: [], mode: [] }
    : lignesDesMoments(parPersonne, sommerMesures(parPersonne), admise, personne);
  const lignesApres = regrouperEnPlages(
    CLES_APRES_UNE_FAUTE,
    apres,
    NOMS_APRES_UNE_FAUTE,
    admise,
    personne,
  );
  const rangs = tableDeReprises(
    forme,
    CLES_DE_RANG,
    (m, cle, verdict) => m.reprises.rangs[verdict][cle],
    parPersonne,
    enPlages(CLES_DE_RANG, NOMS_DE_RANG),
  );
  const espacements = tableDeReprises(
    forme,
    CLES_D_ESPACEMENT,
    (m, cle, verdict) => m.reprises.espacements[verdict][cle],
    parPersonne,
    enPlages(CLES_D_ESPACEMENT, NOMS_D_ESPACEMENT),
  );
  // Un mode des reprises ne s'affiche seul que si ce même mode s'affiche seul à la section des moments
  // et des modes ; puis, tant qu'un croisement laisse un reste refusé, les modes en cause se fondent
  // dans « Autres modes », ou le tableau du mode, ou celui de l'après-faute, est omis. Chaque pas
  // écarte un mode ou un tableau : la boucle se termine.
  const seuls = new Set(affichees.mode.flatMap((l) => (l.cles.length === 1 ? l.cles : [])));
  const ecartes = new Set(
    CLES_DE_MODE.flatMap((cle, i) => (seuls.has(cle) || personne ? [] : [i])),
  );
  let modesActifs = true;
  let apresActif = true;
  let modes: TableDeReprises | null = null;
  for (;;) {
    modes = modesActifs
      ? tableDeReprises(
          forme,
          CLES_DE_MODE,
          (m, cle, verdict) => m.reprises.modes[verdict][cle],
          parPersonne,
          (donnees) => couvrirLesModes(donnees, admise, personne, ecartes),
        )
      : null;
    if (personne) break;
    const lignesDuMode = lignesDuModeAvecMoities(modes);
    const lignesDeLApres = apresActif ? (lignesApres ?? []) : [];
    const echec = premierEchecDeReunion(parPersonne, affichees, lignesDuMode, lignesDeLApres);
    if (echec === null) break;
    if (echec.viaApres && apresActif && lignesDeLApres.length > 0) {
      apresActif = false;
      continue;
    }
    // Un reste de moment ne vient jamais de la composition des lignes du mode : seul le tableau de
    // l'après-faute s'écarte alors. Pour un reste de mode, le moins fourni des modes affichés seuls
    // rejoint « Autres modes » : un mode seul dans ce groupe resterait contenu dans la même ligne.
    const autres =
      echec.tableau === 'mode'
        ? lignesDuMode
            .map((l) => l.ligne)
            .filter(
              (l) =>
                l.cles.length === 1 && !ecartes.has(CLES_DE_MODE.indexOf(l.cles[0] as CleDeMode)),
            )
            .sort((x, y) => x.cellule.reponses - y.cellule.reponses)[0]
        : undefined;
    if (autres !== undefined) {
      ecartes.add(CLES_DE_MODE.indexOf(autres.cles[0] as CleDeMode));
      continue;
    }
    if (apresActif && lignesDeLApres.length > 0) apresActif = false;
    else if (modesActifs && lignesDuMode.length > 0) modesActifs = false;
    else break;
  }
  // Le lendemain n'est omis qu'en repli : si la porte passe avec le tableau des modes final, on le garde.
  if (
    !personne &&
    !apresActif &&
    lignesApres !== null &&
    premierEchecDeReunion(parPersonne, affichees, lignesDuModeAvecMoities(modes), lignesApres) ===
      null
  ) {
    apresActif = true;
  }
  const apresAffiche = apresActif ? lignesApres : null;
  return {
    rangs,
    espacements,
    modes,
    repartition: tableDeReprises(
      formeDe(couples('faute'), couples('juste'), admise, personne),
      CLES_DE_REPARTITION,
      (m, cle, verdict) => ({ reponses: m.reprises.repartition[verdict][cle], justes: 0 }),
      parPersonne,
      enPlages(CLES_DE_REPARTITION, NOMS_DE_REPARTITION),
    ),
    apresUnJourDeFaute: apresAffiche,
    omisParCroisement: {
      modes: !modesActifs || (modes === null && forme !== null && ecartes.size > 0),
      apresUnJourDeFaute: !apresActif && lignesApres !== null,
    },
  };
}

/** La part de justes d'une ligne ; arrondie au pour cent dans un rapport d'ensemble. */
function partDeLigne(ligne: LigneDeReprise, personne: boolean): number {
  const part = partDeJustes(ligne.cellule) ?? 0;
  return personne ? part : Math.round(part * POURCENT) / POURCENT;
}

function reussiteDeReprises(
  lignes: readonly LigneDeReprise[],
  classe: string,
  titre: string,
  entete: string,
  personne: boolean,
): string {
  const dessinees: Ligne[] = lignes.map((l) => ({
    nom: l.nom,
    part: partDeLigne(l, personne),
    reponses: l.cellule.reponses,
  }));
  const corps = dessinees.map((l) =>
    personne
      ? [echapper(l.nom), pourcent(l.part), nombre(l.reponses)]
      : [echapper(l.nom), pourcent(l.part)],
  );
  const entetes = personne ? [entete, 'Réponses justes', 'Réponses'] : [entete, 'Réponses justes'];
  return `${barresHorizontales(dessinees, classe, titre, personne)}
${chiffres(tableau(entetes, corps))}`;
}

/** La répartition : des couples, en part de la moitié (ou de tous) ; un nombre, pour une personne. */
function tableDeRepartition(lignes: readonly LigneDeReprise[], personne: boolean): string {
  const total = Math.max(1, sommeDeNombres(lignes.map((l) => l.cellule.reponses)));
  const corps = lignes.map((l) => [
    echapper(l.nom),
    pourcent(l.cellule.reponses / total),
    ...(personne ? [nombre(l.cellule.reponses)] : []),
  ]);
  const entetes = ['Reprises par couple', 'Part des couples', ...(personne ? ['Couples'] : [])];
  return chiffres(tableau(entetes, corps));
}

interface RenduDeTable {
  titre: string;
  moities: { faute: string; juste: string };
  /** Ce que dit une moitié sans ligne (rapport d'une personne). */
  vides: { faute: string; juste: string };
  dessiner(lignes: readonly LigneDeReprise[], titre: string): string;
}

const OMIS_PAR_CROISEMENT =
  'Ce tableau est omis : un croisement avec la section des moments et des modes laisserait retrouver, par différence, une case que la règle refuse.';
const TABLEAU_OMIS = 'Ce tableau est omis : même réunies, ses lignes ne passent pas la règle.';

function sousSection(
  table: TableDeReprises | null,
  rendu: RenduDeTable,
  parCroisement = false,
): string {
  const entete = `<h3>${echapper(rendu.titre)}</h3>`;
  if (table === null) {
    return `${entete}\n${p(parCroisement ? OMIS_PAR_CROISEMENT : TABLEAU_OMIS)}`;
  }
  if (table.forme === 'reunies') return `${entete}\n${rendu.dessiner(table.lignes, rendu.titre)}`;
  const moitie = (cle: CleDeVerdict): string => {
    const lignes = table[cle];
    const sousTitre = rendu.moities[cle];
    return `<h4>${echapper(sousTitre)}</h4>
${lignes.length === 0 ? p(rendu.vides[cle]) : rendu.dessiner(lignes, `${rendu.titre} : ${sousTitre}`)}`;
  };
  return `${entete}\n${moitie('faute')}\n${moitie('juste')}`;
}

/**
 * La section « Les reprises du jour » (M7) : une reprise est une réponse à un élément déjà répondu le
 * même jour. Cinq tableaux, rendus d'après `tablesDesReprises` ; un rapport d'ensemble n'y met que des
 * pourcentages entiers et des lignes que la règle admet, nommées par plage (M7-D6).
 */
function sectionDesReprises(tables: TablesDesReprises, personne: boolean): string {
  const apresUneFaute = { faute: 'Après une faute', juste: 'Après une réponse juste' };
  const videsDeReprise = {
    faute: 'Aucune reprise après une faute',
    juste: 'Aucune reprise après une réponse juste',
  };
  const tableDeReussite = (
    titre: string,
    table: TableDeReprises | null,
    classe: string,
    entete: string,
    parCroisement = false,
  ) =>
    sousSection(
      table,
      {
        titre,
        moities: apresUneFaute,
        vides: videsDeReprise,
        dessiner: (lignes, titreDuDessin) =>
          reussiteDeReprises(lignes, classe, titreDuDessin, entete, personne),
      },
      parCroisement,
    );
  const repartition = sousSection(tables.repartition, {
    titre: 'Combien de reprises par élément et par jour',
    moities: {
      faute: 'La première réponse du jour est fausse',
      juste: 'La première réponse du jour est juste',
    },
    vides: {
      faute: 'Aucun couple dont la première réponse est fausse',
      juste: 'Aucun couple dont la première réponse est juste',
    },
    dessiner: (lignes) => tableDeRepartition(lignes, personne),
  });
  const definition = `Une reprise est une réponse donnée à un élément qui a déjà été répondu le même jour : ce sont les réponses que réunit la ligne des moments. Le rang, les autres réponses et le mode séparent les reprises qui suivent une faute et celles qui suivent une réponse juste, d’après la réponse d’avant du même élément ce jour-là ; la répartition sépare les couples d’après leur première réponse du jour ; le dernier tableau n’a pas de moitiés. Le rang est le nombre de réponses du jour avant la reprise ; « autres réponses » compte celles des autres éléments entre les deux ; un couple est un élément et un jour, compté selon ses reprises. Les réponses de pré-test sont écartées.${
    personne
      ? ' Une ligne donne la part de justes et le nombre de réponses ; une case vide n’a pas de ligne.'
      : ' Un tableau s’affiche en deux moitiés si chacune passe la règle, réuni sinon, et il est omis si même réuni il ne la passe pas ; une ligne qui ne la passe pas se fond avec sa voisine en une plage (« de … à … », « … et au-delà »), ou, pour le mode, dans une ligne d’autres modes ; un mode, ou le tableau après un jour de faute, qui à lui seul laisserait retrouver une case refusée par différence avec une réunion de lignes d’un même tableau des moments ou des modes, dans l’un ou l’autre sens, se fond de même, ou est omis. Ni compte ni total : des pourcentages entiers.'
  }`;
  const apres = tables.apresUnJourDeFaute;
  const dernier =
    apres === null
      ? p(tables.omisParCroisement.apresUnJourDeFaute ? OMIS_PAR_CROISEMENT : TABLEAU_OMIS)
      : apres.length === 0
        ? p('Aucun jour de faute suivi d’une réponse un autre jour.')
        : reussiteDeReprises(
            apres,
            's1',
            'La réussite à la première réponse d’un autre jour',
            'Reprises après la faute',
            personne,
          );
  return feuille(
    `${p(definition)}
${tableDeReussite('Selon le rang de la reprise', tables.rangs, 's1', 'Rang')}
${tableDeReussite('Selon les autres réponses entre les deux', tables.espacements, 's2', 'Entre les deux')}
${tableDeReussite('Selon le mode de la reprise', tables.modes, 's3', 'Mode', tables.omisParCroisement.modes)}
${repartition}
<h3>Après un jour de faute : la première réponse d’un autre jour</h3>
${dernier}
${p('Le jour de faute est un jour où l’élément a une réponse fausse ; les reprises se comptent depuis cette première faute. La réponse mesurée est la première de l’élément un autre jour. Le délai jusqu’à cette réponse n’est pas mesuré : il suit l’ordonnanceur et l’assiduité. Un jour de faute sans réponse un autre jour ne compte pas.')}`,
    'Les reprises du jour',
  );
}

/** Construit le rapport : une page HTML complète. */
export function construireRapport(donnees: DonneesDuRapport): string {
  const { cours, accord, aujourdhui } = donnees;
  const personne = accord !== undefined;
  // Le rapport d'ensemble ne lit que les journaux des personnes actives au jour du rapport : un
  // compte qui n'est plus actif n'entre dans aucun chiffre, aucune date, aucun graphique.
  const journaux = personne
    ? donnees.journaux
    : donnees.journaux.filter((journal) => estActive(journal, aujourdhui));
  if (!personne && journaux.length < PERSONNES_ACTIVES_MINIMUM) {
    return rapportLimite(cours, aujourdhui);
  }
  const elements = posablesDuCours(cours).length;
  const parPersonne = journaux.map((journal) => mesures(journal, cours, aujourdhui));
  const total = sommerMesures(parPersonne);
  // La règle d'une case, la seule : toute agrégation affichée l'appelle (le rapport d'une personne
  // décrit une personne, par définition : il n'a pas cette règle).
  const admise = (comptes: readonly number[]): boolean => personne || caseAdmise(comptes);

  // Les jours affichés : ceux dont la case passe la règle. Rien d'autre ne fixe la période.
  const valeursDesJours = new Map<string, number>();
  if (total.premierJour !== null && total.dernierJour !== null) {
    for (let jour = total.premierJour; jour <= total.dernierJour; jour = ajouterJours(jour, 1)) {
      const comptes = parPersonne.map((m) => m.parJour[jour]?.reponses ?? 0);
      if (!admise(comptes)) continue;
      const reponses = comptes.reduce((s, n) => s + n, 0);
      const qui = comptes.filter((n) => n > 0).length;
      valeursDesJours.set(jour, reponses / Math.max(1, qui));
    }
  }
  const joursAffiches = [...valeursDesJours.keys()].sort();
  const premierAffiche = joursAffiches[0] ?? null;
  const dernierAffiche = joursAffiches.at(-1) ?? null;
  const estAffiche = (jour: string): boolean =>
    personne ? premierAffiche !== null && jour >= premierAffiche : valeursDesJours.has(jour);

  const jusquau =
    donnees.jusquau !== undefined && donnees.jusquau > aujourdhui ? donnees.jusquau : undefined;
  const unite = personne ? 'réponses' : 'réponses par personne';

  // 6. La réussite, selon le délai et selon le mode : les lignes affichées, et rien d'autre.
  const { delai: lignesDeDelai, mode: lignesDeMode } = lignesDesMoments(
    parPersonne,
    total,
    admise,
    personne,
  );
  // Les moments affichés seuls : la réussite observée n'en lit pas d'autres, ni la projection.
  const delaisAffiches = new Set(
    lignesDeDelai.filter((ligne) => ligne.cles.length === 1).flatMap((ligne) => ligne.cles),
  );
  const mesuresAffichees: Mesures = {
    ...total,
    delais: Object.fromEntries(
      CLES_DE_DELAI.map((cle) => [
        cle,
        delaisAffiches.has(cle) ? total.delais[cle] : { reponses: 0, justes: 0 },
      ]),
    ) as Mesures['delais'],
  };
  // L'écart médian d'un rapport d'ensemble est celui de la personne médiane (la valeur de l'une
  // d'elles), jamais un écart mêlé de tous les journaux.
  const medianesDePersonne = parPersonne
    .flatMap((m) => (m.ecartMedian === null ? [] : [m.ecartMedian]))
    .sort((a, b) => a - b);
  const ecartMedian = personne
    ? total.ecartMedian
    : admise(parPersonne.map((m) => m.ecarts.length))
      ? (medianesDePersonne[Math.floor(medianesDePersonne.length / 2)] ?? null)
      : null;

  const scenarios =
    jusquau === undefined
      ? []
      : projeterTout(journaux, cours, { aujourdhui, jusquau }, mesuresAffichees);
  const tete = scenarios[SCENARIO_DE_TETE];
  const joursRestants = jusquau === undefined ? 0 : joursEntre(aujourdhui, jusquau);

  const minutes =
    ecartMedian === null || tete === undefined
      ? null
      : (tete.projection.chargeMoyenne * ecartMedian) / SECONDES_PAR_MINUTE;

  // Les boîtes d'abord : les tuiles « vu » et « sûr » ne s'affichent que si leurs boîtes sont une
  // réunion exacte de groupes affichés, sans quoi la tuile isolerait une boîte refusée.
  const groupes = regrouperLesBoites(
    total.boites.map((_, rang) => elementsDesBoites(parPersonne, [rang])),
    admise,
  );
  const tuilesDeBoite = personne ? { vu: true, sur: true } : tuilesAffichables(groupes);
  const vusAffiche = tuilesDeBoite.vu;
  const sursAffiche = tuilesDeBoite.sur;
  const vus = elements === 0 ? 0 : 1 - (total.boites[0] ?? 0) / total.elements;
  const sursNombre = (total.boites[4] ?? 0) + (total.boites[5] ?? 0);
  const partSure = total.elements === 0 ? 0 : sursNombre / total.elements;

  // Le titre de la page dit le constat principal.
  const titre =
    tete === undefined
      ? personne
        ? `${nombre(total.reponses)} réponses${total.premierJour === null ? '' : ` depuis le ${jourFrancais(total.premierJour)}`}`
        : `Rapport d’ensemble de ${nombre(journaux.length)} personnes actives`
      : `Environ ${nombre(environ(tete.projection.chargeMoyenne))} réponses par jour${personne ? '' : ' et par personne'} jusqu’à l’examen`;
  const periode = personne
    ? total.premierJour === null || total.dernierJour === null
      ? 'journal vide'
      : `journal du ${jourFrancais(total.premierJour)} au ${jourFrancais(total.dernierJour)}`
    : premierAffiche === null || dernierAffiche === null
      ? 'aucun jour détaillé'
      : `jours détaillés du ${jourFrancais(premierAffiche)} au ${jourFrancais(dernierAffiche)}`;
  const objectif =
    jusquau === undefined ? 'aucune date d’examen' : `examen le ${jourFrancais(jusquau)}`;
  const enTete = `<header><h1>${echapper(titre)}</h1>
<p class="meta">Cours « ${echapper(cours.cours.titre)} », rapport du ${jourFrancais(aujourdhui)} · ${periode} · ${personne ? `${nombre(total.reponses)} réponses · ` : ''}objectif : ${objectif}.</p>
<p class="meta">${
    personne
      ? `Document privé : il décrit la progression d’une personne, la personne suivie. Accord donné le ${echapper(accord)}, d’après la déclaration du responsable.`
      : `Document privé : chiffres d’ensemble de ${nombre(journaux.length)} personnes actives. Une case n’est affichée qu’à ${PERSONNES_ACTIVES_MINIMUM} personnes, ${MINIMUM_D_UNE_CASE} réponses (éléments, pour une boîte ; rebelles, pour un chapitre ; couples, pour la répartition des reprises) et si aucune personne n’y fait plus de ${PART_MAXIMALE_D_UNE_PERSONNE} %. Ni compte exact ni total : des pourcentages entiers et des moyennes par personne.`
  }</p></header>`;

  const tuiles: string[] = [];
  const tuile = (valeur: string, texte: string, detail = ''): void => {
    tuiles.push(
      `<div class="tuile"><div class="valeur">${valeur}</div><div class="texte">${texte}</div>${detail === '' ? '' : `<div class="detail">${detail}</div>`}</div>`,
    );
  };
  if (tete !== undefined) {
    tuile(
      nombre(environ(tete.projection.chargeMoyenne)),
      `réponses par jour à tenir${personne ? '' : ', par personne'}`,
      `${minutes === null ? 'durée inconnue' : `environ ${nombre(Math.round(minutes))} min par jour${personne ? '' : ', au rythme de la personne médiane'}`} · ${echapper(tete.nom)}`,
    );
    tuile(nombre(joursRestants), 'jours avant l’examen');
  }
  tuile(
    nombre(elements),
    'éléments à savoir',
    personne ? `dont ${nombre(total.dues)} dus aujourd’hui` : '',
  );
  if (vusAffiche) tuile(pourcent(vus), 'du cours déjà vu');
  if (sursAffiche) tuile(pourcent(partSure), 'du cours sûr', 'boîtes 4 et 5');
  if (tete !== undefined) {
    tuile(
      pourcent(tete.projection.partSure),
      'sûr à l’examen',
      `projection, ${echapper(tete.nom)}`,
    );
  }

  const sections: string[] = [];

  // 3. La charge, passée et projetée.
  const barres: { jour: string; valeur: number | null }[] = [];
  if (premierAffiche !== null && dernierAffiche !== null) {
    for (let jour = premierAffiche; jour <= dernierAffiche; jour = ajouterJours(jour, 1)) {
      barres.push({ jour, valeur: valeursDesJours.get(jour) ?? null });
    }
  }
  const series: SerieDeLigne[] = [];
  if (tete !== undefined && jusquau !== undefined) {
    for (const { rang, classe } of SCENARIOS_DU_GRAPHIQUE) {
      const scenario = scenarios[rang];
      if (scenario === undefined) continue;
      series.push({
        nom: scenario.algorithme === 'fsrs' ? `${scenario.nom} (hypothèse)` : scenario.nom,
        etiquette: `${scenario.algorithme === 'fsrs' ? 'FSRS' : 'Leitner'}, ${scenario.nouvelles}/j`,
        classe,
        pointille: scenario.algorithme === 'fsrs',
        points: scenario.projection.parSemaine.map((semaine, i, toutes) => ({
          jour: semaine.debut,
          duree: i === toutes.length - 1 ? joursEntre(semaine.debut, jusquau) : JOURS_PAR_SEMAINE,
          valeur: semaine.moyenne,
        })),
      });
    }
  }
  const passees = semainesPassees(parPersonne, estAffiche, premierAffiche, aujourdhui, admise);
  const semainesProjetees = tete?.projection.parSemaine ?? [];
  const pic = semainesProjetees.reduce(
    (haut, semaine) => (semaine.moyenne > haut.moyenne ? semaine : haut),
    semainesProjetees[0] ?? { debut: aujourdhui, moyenne: 0 },
  );
  const titreDeCharge =
    tete === undefined
      ? 'Les réponses de chaque jour, jusqu’à aujourd’hui'
      : `${tete.nom} : de ${nombre(Math.round(semainesProjetees[0]?.moyenne ?? 0))} réponses par jour la première semaine à ${nombre(Math.round(pic.moyenne))} au plus haut, la semaine du ${jourFrancais(pic.debut)}`;
  sections.push(
    feuille(
      `${graphiqueDeCharge({ barres, series, aujourdhui, examen: jusquau ?? null, unite })}
${legende([
  { classe: 'barre-grise', texte: 'Réponses par jour, passées' },
  ...series.map((s) => ({ classe: s.classe, texte: s.nom })),
])}
${chiffres(
  tableau(
    ['Semaine du', 'Passé, par jour', ...series.map((s) => s.nom)],
    [
      ...passees.map((semaine) => [
        jourFrancais(semaine.debut),
        semaine.valeur === null ? '—' : nombre(semaine.valeur),
        ...series.map(() => '—'),
      ]),
      ...semainesProjetees.map((semaine, i) => [
        jourFrancais(semaine.debut),
        '—',
        ...series.map((s) => nombre(s.points[i]?.valeur ?? 0)),
      ]),
    ],
  ),
)}
${p(`Les barres grises sont les réponses de chaque jour ; les lignes, la moyenne par jour de chaque semaine jusqu’à l’examen, selon l’algorithme et le nombre de nouveautés par jour. La ligne en pointillé (FSRS) est une hypothèse : voir « Comment lire ces chiffres ».${personne ? '' : ' Une semaine passée ne compte que ses jours affichés, et se divise par les personnes qui y ont répondu.'}`)}`,
      titreDeCharge,
    ),
  );

  // 4. Les nouveautés par jour.
  if (tete === undefined) {
    sections.push(
      feuille(
        p(
          'Pas de date d’examen : le manifeste du cours n’en donne pas, et la commande n’a pas reçu <code>--jusquau</code>. Le rapport ne projette donc rien ; il garde l’état d’aujourd’hui et les réussites observées.',
        ),
        'Pas de projection',
      ),
    );
  } else {
    const tout = tete.projection.jourToutVu;
    sections.push(
      feuille(
        tableau(
          [
            'Nouveautés par jour',
            'Algorithme',
            personne ? 'Tout le cours est vu le' : 'Tout le cours est vu le (personne médiane)',
            'Réponses par jour',
            personne ? 'Minutes par jour' : 'Minutes par jour (au rythme de la personne médiane)',
            'Sûr à l’examen',
          ],
          scenarios.map((s) => [
            nombre(s.nouvelles),
            s.algorithme === 'fsrs' ? 'FSRS (hypothèse)' : 'Leitner',
            s.projection.jourToutVu === null
              ? 'pas avant l’examen'
              : jourFrancais(s.projection.jourToutVu),
            nombre(Math.round(s.projection.chargeMoyenne)),
            ecartMedian === null
              ? '—'
              : nombre(
                  Math.round((s.projection.chargeMoyenne * ecartMedian) / SECONDES_PAR_MINUTE),
                ),
            pourcent(s.projection.partSure),
          ]),
        ),
        vusAffiche && vus === 1
          ? 'Tout le cours est déjà vu : la charge ne vient plus que des révisions'
          : tout === null
            ? `À ${tete.nouvelles} nouveautés par jour, le cours n’est pas entièrement vu avant l’examen`
            : `À ${tete.nouvelles} nouveautés par jour, tout le cours est vu le ${jourFrancais(tout)}${personne ? '' : ' pour la personne médiane'}`,
      ),
    );
  }

  // 5. Les éléments par boîte : les boîtes que la règle refuse se fondent avec leur voisine.
  if (groupes === null) {
    sections.push(
      feuille(
        p(
          `Les éléments par boîte sont omis : même réunis, ils ne passent pas la règle (au moins ${PERSONNES_ACTIVES_MINIMUM} personnes, ${MINIMUM_D_UNE_CASE} éléments, aucune personne à plus de ${PART_MAXIMALE_D_UNE_PERSONNE} %).`,
        ),
        'Les éléments du cours par boîte',
      ),
    );
  } else {
    const segments: Segment[] = groupes.map((groupe) => ({
      nom: groupe.rangs.map((rang) => NOMS_DE_BOITE[rang] ?? `Boîte ${rang}`).join(' + '),
      valeur: groupe.comptes.reduce((s, n) => s + n, 0),
      classe: `b${groupe.rangs[0] ?? 0}`,
    }));
    // Un rapport d'ensemble ne dessine que des pourcentages entiers : ni compte, ni largeur exacte.
    const dessines = personne
      ? segments
      : segments.map((s) => ({
          ...s,
          valeur: Math.round((POURCENT * s.valeur) / Math.max(1, total.elements)),
        }));
    const partDe = (valeur: number): string =>
      pourcent(total.elements === 0 ? 0 : valeur / total.elements);
    const partsDeBoite = segments.map(
      (s) => `${s.nom} : ${partDe(s.valeur)}${personne ? ` (${nombre(s.valeur)} éléments)` : ''}`,
    );
    sections.push(
      feuille(
        `${barreEmpilee(dessines, 'Les éléments du cours par boîte', !personne)}
${legende(segments.map((s, i) => ({ classe: s.classe, texte: partsDeBoite[i] ?? '' })))}
${chiffres(
  tableau(
    ['Boîte', 'Part du cours'],
    segments.map((s) => [
      echapper(s.nom),
      `${partDe(s.valeur)}${personne ? `, ${nombre(s.valeur)} éléments` : ''}`,
    ]),
  ),
)}`,
        vusAffiche && sursAffiche
          ? `${pourcent(partSure)} du cours est sûr (boîtes 4 et 5), ${pourcent(total.elements === 0 ? 0 : (total.boites[0] ?? 0) / total.elements)} n’est pas encore vu`
          : 'Les éléments du cours par boîte',
      ),
    );
  }

  // 5 bis. Les éléments rebelles, par chapitre.
  sections.push(sectionDesRebelles(cours, parPersonne, total, personne, admise));

  // 6. La réussite, selon le délai et selon le mode.
  const extremes = [...lignesDeDelai].sort((a, b) => a.part - b.part);
  const bas = extremes[0];
  const haut = extremes.at(-1);
  const constat =
    bas === undefined || haut === undefined || bas === haut
      ? 'Pas assez de réponses pour comparer la réussite'
      : `La réussite va de ${pourcent(bas.part)} (${bas.nom.toLowerCase()}) à ${pourcent(haut.part)} (${haut.nom.toLowerCase()})`;
  const tableauDeLignes = (lignes: readonly Ligne[]): string =>
    personne
      ? tableau(
          ['Moment ou mode', 'Réponses justes', 'Réponses'],
          lignes.map((l) => [echapper(l.nom), pourcent(l.part), nombre(l.reponses)]),
        )
      : tableau(
          ['Moment ou mode', 'Réponses justes'],
          lignes.map((l) => [echapper(l.nom), pourcent(l.part)]),
        );
  sections.push(
    feuille(
      `<h3>Selon le moment où l’élément revient</h3>
${barresHorizontales(lignesDeDelai, 's1', 'La réussite selon le moment où l’élément revient', personne)}
${chiffres(tableauDeLignes(lignesDeDelai))}
<h3>Selon le mode de la réponse</h3>
${barresHorizontales(lignesDeMode, 's2', 'La réussite selon le mode de la réponse', personne)}
${chiffres(tableauDeLignes(lignesDeMode))}
${p(`${personne ? 'Le nombre de réponses de chaque ligne suit son pourcentage. ' : 'Seules les lignes qui passent la règle sont affichées, en pourcentages entiers : le rapport d’ensemble ne donne ni nombre de réponses, ni total. '}Les réponses données avant que le journal note le mode n’en portent pas : elles sont comptées à part, « sans mode ». Les réponses de pré-test, données avant d’avoir appris l’élément, sont écartées : elles ne sont dans aucune ligne.`)}`,
      constat,
    ),
  );

  // 6 bis. Les reprises du jour.
  sections.push(sectionDesReprises(tablesDesReprises(parPersonne, personne), personne));

  // 7. Comment lire ces chiffres.
  const memoire = memoireDuCours(cours.cours);
  const clesALEcheance = ['boite-1', 'boite-2', 'boite-3', 'boite-4', 'boite-5'] as const;
  const observeeALEcheance = sommeDeCellules(
    clesALEcheance.filter((cle) => delaisAffiches.has(cle)).map((cle) => total.delais[cle]),
  );
  const jourDuJournal =
    premierAffiche === null || dernierAffiche === null
      ? null
      : joursEntre(premierAffiche, dernierAffiche) + 1;
  sections.push(
    feuille(
      `<ul>
${li('<strong>Une réponse</strong> est un élément répondu une fois : une carte retournée, une saisie, un choix, un exercice, une question de fiche ou d’examen, sauf une réponse de pré-test, écartée de tous les chiffres. Une faute redonnée le jour même compte pour une réponse de plus.')}
${li(`<strong>La projection</strong> part de l’état du jour et simule jour après jour jusqu’à l’examen : les éléments dus sont répondus, puis les nouveautés sont découvertes dans l’ordre du cours. Le verdict de chaque réponse se tire au hasard, d’une graine fixe, et le résultat est la moyenne de ${nombre(TIRAGES)} tirages : la même graine rend la même projection. Avec Leitner, la réussite est celle observée dans le journal pour la boîte d’avant (0,5 sans donnée affichée) et pour les premières réponses. Une faute se redonne une fois le même jour. La projection ne modélise pas les éléments rebelles, qui ne sont pas redonnés le jour même, et surestime d’autant la charge.`)}
${li(`<strong>La ligne FSRS est une hypothèse.</strong> Elle suppose que chaque révision réussit à la rétention visée du cours (${pourcent(memoire?.retention ?? 0.9)}), ce qu’aucune mesure ne vérifie. À côté, la réussite réellement observée à l’échéance, sur les lignes affichées, est de ${observeeALEcheance.reponses === 0 ? 'inconnue (aucune révision à l’échéance affichée)' : `${pourcent(partDeJustes(observeeALEcheance) ?? 0)}${personne ? ` sur ${nombre(observeeALEcheance.reponses)} réponses` : ''}`}.`)}
${li(`<strong>Les limites.</strong> ${jourDuJournal === null ? 'Aucun jour n’est détaillé. ' : `Les jours détaillés couvrent ${nombre(jourDuJournal)} jours : une courte durée dit peu de l’oubli à long terme. `}Les taux mêlent les modes d’avant, dont les réponses sans mode. Le cours grandira : la projection ne compte que les éléments d’aujourd’hui (${nombre(elements)}).`)}
${li(`<strong>Les minutes</strong> viennent de l’écart médian entre deux réponses qui se suivent à moins de deux minutes${personne ? '' : ', celui de la personne médiane (la valeur de l’une des personnes actives, sans dire laquelle) ; les minutes par jour sont la charge moyenne multipliée par cet écart'}${ecartMedian === null ? ' (non communiqué : durée inconnue)' : ` (${nombre(ecartMedian)} secondes)`}.`)}
${li(
  personne
    ? `Document privé : il décrit la progression d’une personne. Accord donné le ${echapper(accord)}, d’après la déclaration du responsable ; l’outil ne peut pas le contrôler.`
    : `Document privé : chiffres d’ensemble. Seules les personnes actives y comptent (vingt réponses au moins dans les vingt-huit jours qui finissent au jour du rapport). Toute case (jour, semaine, moment, mode, boîte, chapitre, reprise, minutes) où moins de ${PERSONNES_ACTIVES_MINIMUM} personnes comptent (ont répondu ; ont un élément rebelle, pour un chapitre), ou de moins de ${MINIMUM_D_UNE_CASE} réponses (éléments, pour une boîte ; rebelles, pour un chapitre ; couples, pour la répartition des reprises), ou dont une personne fait plus de ${PART_MAXIMALE_D_UNE_PERSONNE} %, est omise ou fondue dans « autres » (pour une reprise, réunie avec sa voisine en une plage). Les boîtes refusées se fondent avec leur voisine. Les réponses par jour sont des moyennes par personne de la case ; le rapport ne donne ni compte exact ni total, mais des pourcentages entiers. <strong>Ce que cela ne garantit pas</strong> : un pourcentage entier laisse encore estimer une case fondue à quelques unités près, et celui d’un chapitre, dont le nombre d’éléments se lit dans le cours, redonne son nombre de rebelles à un demi pour cent près du produit « éléments × personnes », exactement quand ce produit ne dépasse pas 100 ; un chapitre absent du tableau se lit « zéro, fondu ou omis » ; à trois personnes, une médiane est la valeur de l’une d’elles, sans dire laquelle ; les moyennes de la projection n’ont pas de contrôle de dominance ; deux rapports de dates voisines, ou faits à deux seuils, peuvent se comparer.`,
)}
</ul>`,
      'Comment lire ces chiffres',
    ),
  );

  return pageHtml(
    'Rapport de suivi',
    `${enTete}
<section class="tuiles">${tuiles.join('')}</section>
${sections.join('\n')}`,
  );
}
