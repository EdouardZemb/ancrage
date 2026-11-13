import type { CoursPrepare } from '../../domaine/cours/prepare.js';
import { memoireDuCours } from '../../domaine/cours/servi.js';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { ajouterJours, joursEntre } from '../../domaine/journal/temps.js';
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

/*
 * Le rapport de suivi d'un cours (M3) : une page HTML autonome, sans script, sans rien qui se charge
 * du réseau. Deux sortes de rapport, et jamais un identifiant ni un nom affiché dans aucun :
 * - le rapport d'une personne, que le responsable demande avec la date de l'accord de la personne ;
 * - le rapport d'ensemble, sur tous les journaux du cours, qui ne dit que le nombre d'éléments du
 *   cours s'il y a moins de trois personnes actives au jour du rapport, et omet toute case (jour,
 *   semaine, moment, mode, boîte) où moins de trois personnes distinctes ont répondu ou qui compte
 *   moins de 20 réponses (M3-P6).
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
  const lignesDeDelai = lignesDeReussite(
    CLES_DE_DELAI.map((cle) => ({
      nom: NOMS_DE_DELAI[cle],
      cles: [cle],
      cellule: total.delais[cle],
      comptes: parPersonne.map((m) => m.delais[cle].reponses),
    })),
    admise,
    'Autres moments',
    !personne,
  );
  const lignesDeMode = lignesDeReussite(
    CLES_DE_MODE.map((cle) => ({
      nom: NOMS_DE_MODE[cle],
      cles: [cle],
      cellule: total.modes[cle],
      comptes: parPersonne.map((m) => m.modes[cle].reponses),
    })),
    admise,
    'Autres modes',
    !personne,
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
      : `Document privé : chiffres d’ensemble de ${nombre(journaux.length)} personnes actives. Une case n’est affichée qu’à ${PERSONNES_ACTIVES_MINIMUM} personnes, ${MINIMUM_D_UNE_CASE} réponses (éléments, pour une boîte) et si aucune personne n’y fait plus de ${PART_MAXIMALE_D_UNE_PERSONNE} %. Ni compte exact ni total : des pourcentages entiers et des moyennes par personne.`
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
${p(`${personne ? 'Le nombre de réponses de chaque ligne suit son pourcentage. ' : 'Seules les lignes qui passent la règle sont affichées, en pourcentages entiers : le rapport d’ensemble ne donne ni nombre de réponses, ni total. '}Les réponses données avant que le journal note le mode n’en portent pas : elles sont comptées à part, « sans mode ».`)}`,
      constat,
    ),
  );

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
${li('<strong>Une réponse</strong> est un élément répondu une fois : une carte retournée, une saisie, un choix, un exercice, une question de fiche ou d’examen. Une faute redonnée le jour même compte pour une réponse de plus.')}
${li(`<strong>La projection</strong> part de l’état du jour et simule jour après jour jusqu’à l’examen : les éléments dus sont répondus, puis les nouveautés sont découvertes dans l’ordre du cours. Le verdict de chaque réponse se tire au hasard, d’une graine fixe, et le résultat est la moyenne de ${nombre(TIRAGES)} tirages : la même graine rend la même projection. Avec Leitner, la réussite est celle observée dans le journal pour la boîte d’avant (0,5 sans donnée affichée) et pour les premières réponses. Une faute se redonne une fois le même jour.`)}
${li(`<strong>La ligne FSRS est une hypothèse.</strong> Elle suppose que chaque révision réussit à la rétention visée du cours (${pourcent(memoire?.retention ?? 0.9)}), ce qu’aucune mesure ne vérifie. À côté, la réussite réellement observée à l’échéance, sur les lignes affichées, est de ${observeeALEcheance.reponses === 0 ? 'inconnue (aucune révision à l’échéance affichée)' : `${pourcent(partDeJustes(observeeALEcheance) ?? 0)}${personne ? ` sur ${nombre(observeeALEcheance.reponses)} réponses` : ''}`}.`)}
${li(`<strong>Les limites.</strong> ${jourDuJournal === null ? 'Aucun jour n’est détaillé. ' : `Les jours détaillés couvrent ${nombre(jourDuJournal)} jours : une courte durée dit peu de l’oubli à long terme. `}Les taux mêlent les modes d’avant, dont les réponses sans mode. Le cours grandira : la projection ne compte que les éléments d’aujourd’hui (${nombre(elements)}).`)}
${li(`<strong>Les minutes</strong> viennent de l’écart médian entre deux réponses qui se suivent à moins de deux minutes${personne ? '' : ', celui de la personne médiane (la valeur de l’une des personnes actives, sans dire laquelle) ; les minutes par jour sont la charge moyenne multipliée par cet écart'}${ecartMedian === null ? ' (non communiqué : durée inconnue)' : ` (${nombre(ecartMedian)} secondes)`}.`)}
${li(
  personne
    ? `Document privé : il décrit la progression d’une personne. Accord donné le ${echapper(accord)}, d’après la déclaration du responsable ; l’outil ne peut pas le contrôler.`
    : `Document privé : chiffres d’ensemble. Seules les personnes actives y comptent (vingt réponses au moins dans les vingt-huit jours qui finissent au jour du rapport). Toute case (jour, semaine, moment, mode, boîte, minutes) où moins de ${PERSONNES_ACTIVES_MINIMUM} personnes ont répondu, ou de moins de ${MINIMUM_D_UNE_CASE} réponses, ou dont une personne fait plus de ${PART_MAXIMALE_D_UNE_PERSONNE} %, est omise ou fondue dans « autres ». Les boîtes refusées se fondent avec leur voisine. Les réponses par jour sont des moyennes par personne de la case ; le rapport ne donne ni compte exact ni total, mais des pourcentages entiers. <strong>Ce que cela ne garantit pas</strong> : un pourcentage entier laisse encore estimer une case fondue à quelques unités près ; à trois personnes, une médiane est la valeur de l’une d’elles, sans dire laquelle ; les moyennes de la projection n’ont pas de contrôle de dominance ; deux rapports de dates voisines peuvent se comparer.`,
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
