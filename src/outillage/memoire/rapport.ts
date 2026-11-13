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
  estActive,
  type Mesures,
  MINIMUM_D_UNE_CASE,
  mesures,
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
 * Les cases d'un découpage : celles de moins de `seuil` réponses, ou de moins de `minimumDePersonnes`
 * personnes, se fondent dans « autres », omise si elle est encore trop petite.
 */
function fondre<T extends { nom: string }>(
  cases: readonly T[],
  nombreDe: (c: T) => number,
  personnesDe: (c: T) => number,
  seuil: number,
  minimumDePersonnes: number,
  fusionner: (petites: readonly T[], nom: string) => T,
  nomDesAutres: string,
): T[] {
  const presentes = cases.filter((c) => nombreDe(c) > 0);
  if (seuil === 0) return presentes;
  const assez = (c: T): boolean => nombreDe(c) >= seuil && personnesDe(c) >= minimumDePersonnes;
  const grandes = presentes.filter(assez);
  const petites = presentes.filter((c) => !assez(c));
  const autres = petites.length === 0 ? undefined : fusionner(petites, nomDesAutres);
  return autres !== undefined && assez(autres) ? [...grandes, autres] : grandes;
}

/** Les personnes (par rang) qui ont une valeur positive, d'après `valeurDe`. */
function personnesQui(
  parPersonne: readonly Mesures[],
  valeurDe: (m: Mesures) => number,
): ReadonlySet<number> {
  return new Set(parPersonne.flatMap((m, rang) => (valeurDe(m) > 0 ? [rang] : [])));
}

const reunion = (liste: readonly ReadonlySet<number>[]): ReadonlySet<number> =>
  new Set(liste.flatMap((ensemble) => [...ensemble]));

const sommeDeCellules = (liste: readonly Cellule[]): Cellule => ({
  reponses: liste.reduce((s, c) => s + c.reponses, 0),
  justes: liste.reduce((s, c) => s + c.justes, 0),
});

interface CaseDeReussite {
  nom: string;
  cellule: Cellule;
  /** Les personnes qui ont répondu dans la case. */
  personnes: ReadonlySet<number>;
}

function lignesDeReussite(
  cases: readonly CaseDeReussite[],
  seuil: number,
  minimumDePersonnes: number,
  nomDesAutres: string,
): Ligne[] {
  return fondre(
    cases,
    (c) => c.cellule.reponses,
    (c) => c.personnes.size,
    seuil,
    minimumDePersonnes,
    (petites, nom) => ({
      nom,
      cellule: sommeDeCellules(petites.map((c) => c.cellule)),
      personnes: reunion(petites.map((c) => c.personnes)),
    }),
    nomDesAutres,
  ).map(({ nom, cellule }) => ({
    nom,
    part: partDeJustes(cellule) ?? 0,
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
 * en sept jours. Une semaine n'a de valeur que si `seuil` réponses et `minimumDePersonnes` personnes
 * y contribuent ; elle se divise par les personnes qui y ont répondu.
 */
function semainesPassees(
  parPersonne: readonly Mesures[],
  premierJour: string | null,
  aujourdhui: string,
  seuil: number,
  minimumDePersonnes: number,
): { debut: string; valeur: number | null }[] {
  if (premierJour === null) return [];
  const semaines = Math.ceil(joursEntre(premierJour, aujourdhui) / JOURS_PAR_SEMAINE);
  return Array.from({ length: semaines }, (_, i) => {
    const debut = ajouterJours(aujourdhui, -JOURS_PAR_SEMAINE * (semaines - i));
    let total = 0;
    let jours = 0;
    const qui = new Set<number>();
    for (let k = 0; k < JOURS_PAR_SEMAINE; k++) {
      const jour = ajouterJours(debut, k);
      if (jour < premierJour) continue;
      jours += 1;
      parPersonne.forEach((m, rang) => {
        const reponses = m.parJour[jour]?.reponses ?? 0;
        total += reponses;
        if (reponses > 0) qui.add(rang);
      });
    }
    return {
      debut,
      valeur:
        jours === 0 || total < seuil || qui.size < minimumDePersonnes
          ? null
          : total / jours / Math.max(1, qui.size),
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

/** Construit le rapport : une page HTML complète. */
export function construireRapport(donnees: DonneesDuRapport): string {
  const { cours, journaux, accord, aujourdhui } = donnees;
  const personne = accord !== undefined;
  const elements = posablesDuCours(cours).length;
  const parPersonne = journaux.map((journal) => mesures(journal, cours, aujourdhui));
  const total = sommerMesures(parPersonne);

  if (
    !personne &&
    journaux.filter((journal) => estActive(journal, aujourdhui)).length < PERSONNES_ACTIVES_MINIMUM
  ) {
    return rapportLimite(cours, aujourdhui);
  }

  const seuil = personne ? 0 : MINIMUM_D_UNE_CASE;
  const minimumDePersonnes = personne ? 0 : PERSONNES_ACTIVES_MINIMUM;
  const unite = personne ? 'réponses' : 'réponses par personne';
  const jusquau =
    donnees.jusquau !== undefined && donnees.jusquau > aujourdhui ? donnees.jusquau : undefined;
  const scenarios =
    jusquau === undefined ? [] : projeterTout(journaux, cours, { aujourdhui, jusquau }, total);
  const tete = scenarios[SCENARIO_DE_TETE];
  const joursRestants = jusquau === undefined ? 0 : joursEntre(aujourdhui, jusquau);

  const minutes =
    total.ecartMedian === null || tete === undefined
      ? null
      : (tete.projection.chargeMoyenne * total.ecartMedian) / SECONDES_PAR_MINUTE;
  const vus = elements === 0 ? 0 : 1 - (total.boites[0] ?? 0) / total.elements;
  const sursNombre = (total.boites[4] ?? 0) + (total.boites[5] ?? 0);
  const surs = total.elements === 0 ? 0 : sursNombre / total.elements;

  // Le titre de la page dit le constat principal.
  const titre =
    tete === undefined
      ? `${nombre(total.reponses)} réponses${total.premierJour === null ? '' : ` depuis le ${jourFrancais(total.premierJour)}`}`
      : `Environ ${nombre(environ(tete.projection.chargeMoyenne))} réponses par jour${personne ? '' : ' et par personne'} jusqu’à l’examen`;
  const periode =
    total.premierJour === null || total.dernierJour === null
      ? 'journal vide'
      : `journal du ${jourFrancais(total.premierJour)} au ${jourFrancais(total.dernierJour)}`;
  const objectif =
    jusquau === undefined ? 'aucune date d’examen' : `examen le ${jourFrancais(jusquau)}`;
  const enTete = `<header><h1>${echapper(titre)}</h1>
<p class="meta">Cours « ${echapper(cours.cours.titre)} », rapport du ${jourFrancais(aujourdhui)} · ${periode} · ${nombre(total.reponses)} réponses · objectif : ${objectif}.</p>
<p class="meta">${
    personne
      ? `Document privé : il décrit la progression d’une personne, la personne suivie. Accord donné le ${echapper(accord)}, d’après la déclaration du responsable.`
      : `Document privé : chiffres d’ensemble de ${nombre(journaux.length)} personnes.`
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
      `${minutes === null ? 'durée inconnue' : `environ ${nombre(Math.round(minutes))} min par jour`} · ${echapper(tete.nom)}`,
    );
    tuile(nombre(joursRestants), 'jours avant l’examen');
  }
  tuile(
    nombre(elements),
    'éléments à savoir',
    personne ? `dont ${nombre(total.dues)} dus aujourd’hui` : '',
  );
  tuile(pourcent(vus), 'du cours déjà vu');
  tuile(pourcent(surs), 'du cours sûr', 'boîtes 4 et 5');
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
  if (total.premierJour !== null && total.dernierJour !== null) {
    for (let jour = total.premierJour; jour <= total.dernierJour; jour = ajouterJours(jour, 1)) {
      const reponses = total.parJour[jour]?.reponses ?? 0;
      const qui = personnesQui(parPersonne, (m) => m.parJour[jour]?.reponses ?? 0).size;
      barres.push({
        jour,
        valeur: reponses < seuil || qui < minimumDePersonnes ? null : reponses / Math.max(1, qui),
      });
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
  const passees = semainesPassees(
    parPersonne,
    total.premierJour,
    aujourdhui,
    seuil,
    minimumDePersonnes,
  );
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
${p('Les barres grises sont les réponses de chaque jour ; les lignes, la moyenne par jour de chaque semaine jusqu’à l’examen, selon l’algorithme et le nombre de nouveautés par jour. La ligne en pointillé (FSRS) est une hypothèse : voir « Comment lire ces chiffres ».')}`,
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
            'Tout le cours est vu le',
            'Réponses par jour',
            'Minutes par jour',
            'Sûr à l’examen',
          ],
          scenarios.map((s) => [
            nombre(s.nouvelles),
            s.algorithme === 'fsrs' ? 'FSRS (hypothèse)' : 'Leitner',
            s.projection.jourToutVu === null
              ? 'pas avant l’examen'
              : jourFrancais(s.projection.jourToutVu),
            nombre(Math.round(s.projection.chargeMoyenne)),
            total.ecartMedian === null
              ? '—'
              : nombre(
                  Math.round(
                    (s.projection.chargeMoyenne * total.ecartMedian) / SECONDES_PAR_MINUTE,
                  ),
                ),
            pourcent(s.projection.partSure),
          ]),
        ),
        vus === 1
          ? 'Tout le cours est déjà vu : la charge ne vient plus que des révisions'
          : tout === null
            ? `À ${tete.nouvelles} nouveautés par jour, le cours n’est pas entièrement vu avant l’examen`
            : `À ${tete.nouvelles} nouveautés par jour, tout le cours est vu le ${jourFrancais(tout)}`,
      ),
    );
  }

  // 5. Les éléments par boîte.
  const segmentsDeBoite = fondre(
    total.boites.map((valeur, rang) => ({
      nom: NOMS_DE_BOITE[rang] ?? `Boîte ${rang}`,
      valeur,
      classe: `b${rang}`,
      personnes: personnesQui(parPersonne, (m) => m.boites[rang] ?? 0),
    })),
    (s) => s.valeur,
    (s) => s.personnes.size,
    seuil,
    minimumDePersonnes,
    (petites, nom) => ({
      nom,
      classe: 'b0',
      valeur: petites.reduce((s, c) => s + c.valeur, 0),
      personnes: reunion(petites.map((c) => c.personnes)),
    }),
    'Autres boîtes',
  );
  const segments: Segment[] = segmentsDeBoite.map(({ nom, valeur, classe }) => ({
    nom,
    valeur,
    classe,
  }));
  const partsDeBoite = segments.map(
    (s) =>
      `${s.nom} : ${pourcent(total.elements === 0 ? 0 : s.valeur / total.elements)}${personne ? ` (${nombre(s.valeur)} éléments)` : ''}`,
  );
  sections.push(
    feuille(
      `${barreEmpilee(segments, 'Les éléments du cours par boîte')}
${legende(segments.map((s, i) => ({ classe: s.classe, texte: partsDeBoite[i] ?? '' })))}
${chiffres(
  tableau(
    ['Boîte', 'Part du cours'],
    segments.map((s) => [
      echapper(s.nom),
      `${pourcent(total.elements === 0 ? 0 : s.valeur / total.elements)}${personne ? `, ${nombre(s.valeur)} éléments` : ''}`,
    ]),
  ),
)}`,
      `${pourcent(surs)} du cours est sûr (boîtes 4 et 5), ${pourcent(total.elements === 0 ? 0 : (total.boites[0] ?? 0) / total.elements)} n’est pas encore vu`,
    ),
  );

  // 6. La réussite, selon le délai et selon le mode.
  const lignesDeDelai = lignesDeReussite(
    CLES_DE_DELAI.map((cle) => ({
      nom: NOMS_DE_DELAI[cle],
      cellule: total.delais[cle],
      personnes: personnesQui(parPersonne, (m) => m.delais[cle].reponses),
    })),
    seuil,
    minimumDePersonnes,
    'Autres moments',
  );
  const lignesDeMode = lignesDeReussite(
    CLES_DE_MODE.map((cle) => ({
      nom: NOMS_DE_MODE[cle],
      cellule: total.modes[cle],
      personnes: personnesQui(parPersonne, (m) => m.modes[cle].reponses),
    })),
    seuil,
    minimumDePersonnes,
    'Autres modes',
  );
  const extremes = [...lignesDeDelai].sort((a, b) => a.part - b.part);
  const bas = extremes[0];
  const haut = extremes.at(-1);
  const constat =
    bas === undefined || haut === undefined || bas === haut
      ? 'Pas assez de réponses pour comparer la réussite'
      : `La réussite va de ${pourcent(bas.part)} (${bas.nom.toLowerCase()}) à ${pourcent(haut.part)} (${haut.nom.toLowerCase()})`;
  const tableauDeLignes = (lignes: readonly Ligne[]): string =>
    tableau(
      ['Moment ou mode', 'Réponses justes', 'Réponses'],
      lignes.map((l) => [echapper(l.nom), pourcent(l.part), nombre(l.reponses)]),
    );
  sections.push(
    feuille(
      `<h3>Selon le moment où l’élément revient</h3>
${barresHorizontales(lignesDeDelai, 's1', 'La réussite selon le moment où l’élément revient')}
${chiffres(tableauDeLignes(lignesDeDelai))}
<h3>Selon le mode de la réponse</h3>
${barresHorizontales(lignesDeMode, 's2', 'La réussite selon le mode de la réponse')}
${chiffres(tableauDeLignes(lignesDeMode))}
${p(`Le nombre de réponses de chaque ligne suit son pourcentage. Les réponses données avant que le journal note le mode n’en portent pas : elles sont comptées à part, « sans mode ».`)}`,
      constat,
    ),
  );

  // 7. Comment lire ces chiffres.
  const memoire = memoireDuCours(cours.cours);
  const clesALEcheance = ['boite-1', 'boite-2', 'boite-3', 'boite-4', 'boite-5'] as const;
  const observeeALEcheance = sommeDeCellules(clesALEcheance.map((cle) => total.delais[cle]));
  const quiALEcheance = personnesQui(parPersonne, (m) =>
    clesALEcheance.reduce((s, cle) => s + m.delais[cle].reponses, 0),
  ).size;
  const observeeDicible =
    observeeALEcheance.reponses >= seuil && quiALEcheance >= minimumDePersonnes;
  const jourDuJournal =
    total.premierJour === null || total.dernierJour === null
      ? 0
      : joursEntre(total.premierJour, total.dernierJour) + 1;
  sections.push(
    feuille(
      `<ul>
${li('<strong>Une réponse</strong> est un élément répondu une fois : une carte retournée, une saisie, un choix, un exercice, une question de fiche ou d’examen. Une faute redonnée le jour même compte pour une réponse de plus.')}
${li(`<strong>La projection</strong> part de l’état du jour et simule jour après jour jusqu’à l’examen : les éléments dus sont répondus, puis les nouveautés sont découvertes dans l’ordre du cours. Le verdict de chaque réponse se tire au hasard, d’une graine fixe, et le résultat est la moyenne de ${nombre(TIRAGES)} tirages : la même graine rend la même projection. Avec Leitner, la réussite est celle observée dans le journal pour la boîte d’avant (0,5 sans donnée) et pour les premières réponses. Une faute se redonne une fois le même jour.`)}
${li(`<strong>La ligne FSRS est une hypothèse.</strong> Elle suppose que chaque révision réussit à la rétention visée du cours (${pourcent(memoire?.retention ?? 0.9)}), ce qu’aucune mesure ne vérifie. À côté, la réussite réellement observée à l’échéance est de ${observeeALEcheance.reponses === 0 ? 'inconnue (aucune révision à l’échéance)' : !observeeDicible ? 'non communiquée (trop peu de réponses ou de personnes)' : `${pourcent(partDeJustes(observeeALEcheance) ?? 0)} sur ${nombre(observeeALEcheance.reponses)} réponses`}.`)}
${li(`<strong>Les limites.</strong> Le journal couvre ${nombre(jourDuJournal)} jours : une courte durée dit peu de l’oubli à long terme. Les taux mêlent les modes d’avant, dont les réponses sans mode. Le cours grandira : la projection ne compte que les éléments d’aujourd’hui (${nombre(elements)}).`)}
${li(`<strong>Les minutes</strong> viennent de l’écart médian entre deux réponses qui se suivent à moins de deux minutes${total.ecartMedian === null ? ' (aucune ici : durée inconnue)' : ` (${nombre(total.ecartMedian)} secondes)`}.`)}
${li(
  personne
    ? `Document privé : il décrit la progression d’une personne. Accord donné le ${echapper(accord)}, d’après la déclaration du responsable ; l’outil ne peut pas le contrôler.`
    : `Document privé : chiffres d’ensemble. Une personne est active à vingt réponses au moins dans les vingt-huit jours qui finissent au jour du rapport ; toute case (jour, semaine, moment, mode, boîte) où moins de ${PERSONNES_ACTIVES_MINIMUM} personnes ont répondu, ou de moins de ${MINIMUM_D_UNE_CASE} réponses, est omise ou fondue dans « autres ». Les réponses par jour sont des moyennes par personne de la case.`,
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
