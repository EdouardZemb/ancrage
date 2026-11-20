import { expect, test } from 'vitest';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { type Cellule, CLES_DE_MODE } from './cellules.js';
import { coursDExemple } from './cours-exemple.fixture.js';
import { reponseInventee } from './ecrire-journal.fixture.js';
import { caseAdmise, mesures, sommerMesures } from './mesures.js';
import {
  construireRapport,
  couvrirLesModes,
  type DonneesDeCle,
  type LigneDeReprise,
  lignesDesMoments,
  premierEchecDeReunion,
  type TableDeReprises,
  tablesDesReprises,
} from './rapport.js';
import { type ElementDeMotif, journauxAuxReprises, journeeDeMotifs } from './reprises.fixture.js';
import {
  CLES_APRES_UNE_FAUTE,
  CLES_D_ESPACEMENT,
  CLES_DE_RANG,
  CLES_DE_REPARTITION,
  CLES_DE_VERDICT,
  type CleDeVerdict,
} from './reprises.js';

const cours = coursDExemple();
const ID_DU_COURS = cours.cours.id;
const AUJOURDHUI = '2026-01-10';
const JOUR_1 = Date.UTC(2026, 0, 5, 8);
const JOUR_2 = Date.UTC(2026, 0, 6, 8);
const NOM_DE_LA_SECTION = 'Les reprises du jour';

const ensemble = (journaux: readonly (readonly Evenement[])[]): string =>
  construireRapport({ cours, journaux, aujourdhui: AUJOURDHUI });
const dUnePersonne = (journal: readonly Evenement[]): string =>
  construireRapport({ cours, journaux: [journal], aujourdhui: AUJOURDHUI, accord: '25/01/2026' });

/** `n` éléments qui répondent selon `motif`, d'unités `<prefixe><i>`. */
function couples(motif: string, n: number, prefixe: string, mode?: ElementDeMotif['mode']) {
  return Array.from(
    { length: n },
    (_, i): ElementDeMotif => ({ unite: `${prefixe}${i}`, motif, mode }),
  );
}

/** Le jour 1 d'une personne : ses éléments l'un après l'autre. */
function premierJour(elements: readonly ElementDeMotif[], rangDepart = 1): Evenement[] {
  return journeeDeMotifs({ debut: JOUR_1, rangDepart, elements, cours: ID_DU_COURS });
}

/** Le jour 2 d'une personne : une réponse juste à chacune des `unites`. */
function lendemain(unites: readonly string[], rangDepart: number): Evenement[] {
  return journeeDeMotifs({
    debut: JOUR_2,
    rangDepart,
    prefixe: 'l',
    cours: ID_DU_COURS,
    elements: unites.map((unite) => ({ unite, motif: 'J' })),
  });
}

const mesuresDe = (journaux: readonly (readonly Evenement[])[]) =>
  journaux.map((journal) => mesures(journal, cours, AUJOURDHUI));

/** La section de la page, ou `''`. */
function section(html: string): string {
  const debut = html.indexOf(`<section><h2>${NOM_DE_LA_SECTION}</h2>`);
  if (debut < 0) return '';
  return html.slice(debut, html.indexOf('</section>', debut));
}

/** Les `<th scope="row">` exacts d'un sous-titre de la section. */
function lignesDuTableau(html: string, titre: string): string[] {
  const morceau =
    section(html)
      .split('<h3>')
      .find((m) => m.startsWith(`${titre}</h3>`)) ?? '';
  return [...morceau.matchAll(/<th scope="row">(.*?)<\/th>/g)].map((m) => m[1] ?? '');
}

const TITRES = {
  rangs: 'Selon le rang de la reprise',
  espacements: 'Selon les autres réponses entre les deux',
  modes: 'Selon le mode de la reprise',
  repartition: 'Combien de reprises par élément et par jour',
  apres: 'Après un jour de faute : la première réponse d’un autre jour',
} as const;

const noms = (lignes: readonly LigneDeReprise[]): string[] => lignes.map((l) => l.nom);

const nomsDeTable = (table: TableDeReprises | null): string[] =>
  table === null
    ? []
    : table.forme === 'reunies'
      ? noms(table.lignes)
      : [...noms(table.faute), ...noms(table.juste)];

const videOuAdmis = (reste: readonly number[]): boolean =>
  reste.every((n) => n === 0) || caseAdmise(reste);

const sommeDe = (liste: readonly number[]): number => liste.reduce((s, n) => s + n, 0);

type Genre = 'rangs' | 'espacements' | 'modes' | 'repartition';
const CLES_DU_GENRE: Record<Genre, readonly string[]> = {
  rangs: CLES_DE_RANG,
  espacements: CLES_D_ESPACEMENT,
  modes: CLES_DE_MODE,
  repartition: CLES_DE_REPARTITION,
};

/** Le compte de chaque personne dans `cles` du genre, pour les moitiés données, sans lire la ligne. */
function recompter(
  parPersonne: ReturnType<typeof mesuresDe>,
  genre: Genre,
  cles: readonly string[],
  moities: readonly CleDeVerdict[],
): number[] {
  return parPersonne.map((m) =>
    sommeDe(
      moities.flatMap((verdict) =>
        cles.map((cle) => {
          const r = m.reprises;
          if (genre === 'repartition') {
            return (r.repartition[verdict] as Record<string, number>)[cle] ?? 0;
          }
          return (r[genre][verdict] as Record<string, Cellule>)[cle]?.reponses ?? 0;
        }),
      ),
    ),
  );
}

/** Toutes les parties non vides de `liste`. */
function parties<T>(liste: readonly T[]): T[][] {
  const resultat: T[][] = [];
  for (let masque = 1; masque < 2 ** liste.length; masque++) {
    resultat.push(liste.filter((_, i) => (masque >> i) % 2 === 1));
  }
  return resultat;
}

/**
 * Le reste de chaque réunion de lignes affichées de la section des moments (ou des modes), une fois
 * retirées les lignes affichées des reprises qu'elle contient, est vide ou passe la règle : ce qui
 * donne, par différence, la même garantie pour toute partie de ces lignes. Recalculé ici, sans
 * appeler la porte du rapport.
 */
function verifierLesReunions(journaux: readonly (readonly Evenement[])[]): void {
  const parPersonne = mesuresDe(journaux);
  const tables = tablesDesReprises(parPersonne, false);
  const affichees = lignesDesMoments(parPersonne, sommerMesures(parPersonne), caseAdmise, false);
  // Les comptes de chaque ligne sont recalculés depuis les mesures, jamais lus dans `ligne.comptes`.
  const lignesDuModeRecomptees = (
    tables.modes === null
      ? []
      : tables.modes.forme === 'reunies'
        ? tables.modes.lignes.map((l) => ({ cles: l.cles, verdicts: [...CLES_DE_VERDICT] }))
        : [
            ...tables.modes.faute.map((l) => ({ cles: l.cles, verdicts: ['faute' as const] })),
            ...tables.modes.juste.map((l) => ({ cles: l.cles, verdicts: ['juste' as const] })),
          ]
  ).map((l) => ({ cles: l.cles, comptes: recompter(parPersonne, 'modes', l.cles, l.verdicts) }));
  const apres = (tables.apresUnJourDeFaute ?? []).map((l) => ({
    cles: l.cles,
    comptes: parPersonne.map((m) =>
      sommeDe(l.cles.map((k) => m.reprises.apresUnJourDeFaute[k as 'apres-faute-0'].reponses)),
    ),
  }));
  const reprisesAffichees = [tables.rangs, tables.espacements, tables.modes].some(
    (t) => t !== null,
  );
  const apresContenue = (
    ligne: { cles: readonly string[]; comptes: readonly number[] },
    cles: readonly string[],
    genre: 'Mode' | 'Moment',
  ) =>
    parPersonne.every((m, i) => {
      const dedans = sommeDe(
        ligne.cles.flatMap((k) =>
          cles.map((c) =>
            genre === 'Mode'
              ? m.reprises.apresParMode[k as 'apres-faute-0'][c as 'saisie']
              : m.reprises.apresParMoment[k as 'apres-faute-0'][c as 'premiere'],
          ),
        ),
      );
      return dedans === (ligne.comptes[i] ?? 0);
    }) && ligne.comptes.some((n) => n > 0);
  for (const reunion of parties(affichees.mode)) {
    const cles = reunion.flatMap((l) => l.cles);
    const retirees = [
      ...lignesDuModeRecomptees.filter((l) => l.cles.every((c) => cles.includes(c))),
      ...apres.filter((l) => apresContenue(l, cles, 'Mode')),
    ];
    const reste = parPersonne.map(
      (m, i) =>
        sommeDe(cles.map((c) => m.modes[c as 'saisie'].reponses)) -
        sommeDe(retirees.map((l) => l.comptes[i] ?? 0)),
    );
    expect(videOuAdmis(reste), `modes ${cles.join('+')}`).toBe(true);
  }
  for (const reunion of parties(affichees.delai)) {
    const cles = reunion.flatMap((l) => l.cles);
    const retirees = apres.filter((l) => apresContenue(l, cles, 'Moment'));
    const reprises = reprisesAffichees && cles.includes('meme-jour');
    const reste = parPersonne.map(
      (m, i) =>
        sommeDe(cles.map((c) => m.delais[c as 'premiere'].reponses)) -
        (reprises ? m.delais['meme-jour'].reponses : 0) -
        sommeDe(retirees.map((l) => l.comptes[i] ?? 0)),
    );
    expect(videOuAdmis(reste), `moments ${cles.join('+')}`).toBe(true);
  }
  verifierLeSensInverse(parPersonne, tables, affichees);
}

/**
 * Le sens inverse : pour toute réunion W de lignes affichées d'un même tableau des reprises (le mode,
 * le lendemain), soit T la réunion des lignes de la section des moments et des modes que W contient
 * entièrement, personne par personne ; W - T est vide ou passe la règle. Les comptes de W sont
 * recalculés depuis les mesures (`recompter`), jamais lus dans `ligne.comptes`.
 */
function verifierLeSensInverse(
  parPersonne: ReturnType<typeof mesuresDe>,
  tables: ReturnType<typeof tablesDesReprises>,
  affichees: ReturnType<typeof lignesDesMoments>,
): void {
  const lignesDuMode =
    tables.modes === null
      ? []
      : tables.modes.forme === 'reunies'
        ? tables.modes.lignes.map((l) => ({
            cles: l.cles,
            verdicts: CLES_DE_VERDICT as readonly CleDeVerdict[],
          }))
        : [
            ...tables.modes.faute.map((l) => ({
              cles: l.cles,
              verdicts: ['faute'] as readonly CleDeVerdict[],
            })),
            ...tables.modes.juste.map((l) => ({
              cles: l.cles,
              verdicts: ['juste'] as readonly CleDeVerdict[],
            })),
          ];
  for (const w of parties(lignesDuMode)) {
    const total = parPersonne.map((_, i) =>
      sommeDe(w.map((l) => recompter(parPersonne, 'modes', l.cles, l.verdicts)[i] ?? 0)),
    );
    const retire = affichees.mode.flatMap((ligne) => {
      const toutes = parPersonne.map((m) =>
        sommeDe(ligne.cles.map((c) => m.modes[c as 'saisie'].reponses)),
      );
      const dedans = parPersonne.map((m) =>
        sommeDe(
          w.flatMap((l) =>
            l.verdicts.flatMap((v) =>
              l.cles
                .filter((c) => ligne.cles.includes(c))
                .map((c) => m.reprises.modes[v][c as 'saisie'].reponses),
            ),
          ),
        ),
      );
      return toutes.some((n) => n > 0) && dedans.every((n, i) => n === toutes[i]) ? [toutes] : [];
    });
    const reste = total.map((n, i) => n - sommeDe(retire.map((r) => r[i] ?? 0)));
    expect(videOuAdmis(reste), `W modes ${w.flatMap((l) => l.cles).join('+')}`).toBe(true);
  }
  const apres = (tables.apresUnJourDeFaute ?? []).map(
    (l) => l.cles as readonly (typeof CLES_APRES_UNE_FAUTE)[number][],
  );
  for (const w of parties(apres)) {
    const total = parPersonne.map((m) =>
      sommeDe(w.flatMap((cles) => cles.map((k) => m.reprises.apresUnJourDeFaute[k].reponses))),
    );
    for (const genre of ['Moment', 'Mode'] as const) {
      const lignes = genre === 'Moment' ? affichees.delai : affichees.mode;
      const retire = lignes.flatMap((ligne) => {
        const toutes = parPersonne.map((m) =>
          sommeDe(
            ligne.cles.map((c) =>
              genre === 'Moment'
                ? m.delais[c as 'premiere'].reponses
                : m.modes[c as 'saisie'].reponses,
            ),
          ),
        );
        const dedans = parPersonne.map((m) =>
          sommeDe(
            w.flatMap((cles) =>
              cles.flatMap((k) =>
                ligne.cles.map((c) =>
                  genre === 'Moment'
                    ? m.reprises.apresParMoment[k][c as 'premiere']
                    : m.reprises.apresParMode[k][c as 'saisie'],
                ),
              ),
            ),
          ),
        );
        return toutes.some((n) => n > 0) && dedans.every((n, i) => n === toutes[i]) ? [toutes] : [];
      });
      const reste = total.map((n, i) => n - sommeDe(retire.map((r) => r[i] ?? 0)));
      expect(videOuAdmis(reste), `W après ${w.flat().join('+')} dans ${genre}`).toBe(true);
    }
  }
}

/**
 * La structure d'un rapport d'ensemble (M7-D6, M7-D14), sans croire les comptes de `tablesDesReprises` :
 * chaque ligne passe la règle recalculée depuis les mesures, les plages se suivent sans trou, les
 * lignes de la page sont celles des tables, et la forme est commune au rang, à l'espacement et au mode.
 */
function verifierLaStructure(journaux: readonly (readonly Evenement[])[]): void {
  verifierLesReunions(journaux);
  const parPersonne = mesuresDe(journaux);
  const tables = tablesDesReprises(parPersonne, false);
  const html = ensemble(journaux);
  const affichees = lignesDesMoments(parPersonne, sommerMesures(parPersonne), caseAdmise, false);
  for (const genre of ['rangs', 'espacements', 'modes', 'repartition'] as const) {
    const table = tables[genre];
    if (table === null) continue;
    const moities: [readonly LigneDeReprise[], readonly CleDeVerdict[]][] =
      table.forme === 'reunies'
        ? [[table.lignes, CLES_DE_VERDICT]]
        : [
            [table.faute, ['faute']],
            [table.juste, ['juste']],
          ];
    for (const [lignes, verdicts] of moities) {
      expect(lignes.length).toBeGreaterThan(0);
      for (const ligne of lignes) {
        const comptes = recompter(parPersonne, genre, ligne.cles, verdicts);
        expect(caseAdmise(comptes), `${genre} : ${ligne.nom}`).toBe(true);
        if (genre === 'repartition') continue;
        // Les reprises sont des réponses « redonnées le jour même » : le reste de cette ligne des
        // moments est vide ou admis (une réunion d'autres lignes admises, par construction).
        const memeJour = parPersonne.map((m) => m.delais['meme-jour'].reponses);
        if (affichees.delai.some((l) => l.cles.length === 1 && l.cles[0] === 'meme-jour')) {
          expect(
            videOuAdmis(memeJour.map((n, i) => n - (comptes[i] ?? 0))),
            `${genre} : ${ligne.nom} dans « Redonnée le jour même »`,
          ).toBe(true);
        }
        if (genre === 'modes') {
          for (const affichee of affichees.mode) {
            if (!ligne.cles.every((cle) => affichee.cles.includes(cle))) continue;
            const reste = parPersonne.map(
              (m, i) =>
                sommeDe(affichee.cles.map((cle) => m.modes[cle as 'saisie'].reponses)) -
                (comptes[i] ?? 0),
            );
            expect(videOuAdmis(reste), `${ligne.nom} dans ${affichee.nom}`).toBe(true);
          }
        }
      }
      const reunies = lignes.flatMap((l) => l.cles);
      if (genre === 'modes') {
        // Chaque mode qui a une réponse est dans une ligne, une seule fois.
        expect(new Set(reunies).size).toBe(reunies.length);
        for (const cle of CLES_DE_MODE) {
          const avecReponse = sommeDe(recompter(parPersonne, genre, [cle], verdicts)) > 0;
          if (avecReponse) expect(reunies, `${genre} : ${cle}`).toContain(cle);
        }
      } else {
        // Les plages se suivent sans trou, de la première clé à la dernière.
        expect(reunies).toEqual([...CLES_DU_GENRE[genre]]);
      }
    }
    expect(lignesDuTableau(html, TITRES[genre])).toEqual(nomsDeTable(table));
  }
  const apres = tables.apresUnJourDeFaute;
  if (apres !== null) {
    for (const ligne of apres) {
      const comptes = parPersonne.map((m) =>
        sommeDe(
          ligne.cles.map(
            (cle) =>
              m.reprises.apresUnJourDeFaute[cle as (typeof CLES_APRES_UNE_FAUTE)[number]].reponses,
          ),
        ),
      );
      expect(caseAdmise(comptes), `après : ${ligne.nom}`).toBe(true);
    }
    expect(apres.flatMap((l) => l.cles)).toEqual([...CLES_APRES_UNE_FAUTE]);
    expect(lignesDuTableau(html, TITRES.apres)).toEqual(noms(apres));
    // Le reste d'une ligne de moment ou de mode qui contient les réponses d'une ligne est vide ou admis.
    const dansLesMoments = [
      ...affichees.delai.map((l) => ({ ...l, reste: 'moment' as const })),
      ...affichees.mode.map((l) => ({ ...l, reste: 'mode' as const })),
    ];
    for (const groupe of apres.map((l) => l.cles)) {
      const cles = groupe as (typeof CLES_APRES_UNE_FAUTE)[number][];
      const total = parPersonne.map((m) =>
        sommeDe(cles.map((cle) => m.reprises.apresUnJourDeFaute[cle].reponses)),
      );
      for (const ligne of dansLesMoments) {
        const dedans = parPersonne.map((m) =>
          sommeDe(
            cles.flatMap((cle) =>
              ligne.cles.map((c) =>
                ligne.reste === 'moment'
                  ? m.reprises.apresParMoment[cle][c as 'premiere']
                  : m.reprises.apresParMode[cle][c as 'saisie'],
              ),
            ),
          ),
        );
        if (dedans.some((n, i) => n !== total[i])) continue;
        const reste = parPersonne.map(
          (m, i) =>
            sommeDe(
              ligne.cles.map((c) =>
                ligne.reste === 'moment'
                  ? m.delais[c as 'premiere'].reponses
                  : m.modes[c as 'saisie'].reponses,
              ),
            ) - (total[i] ?? 0),
        );
        expect(videOuAdmis(reste), `après dans ${ligne.nom}`).toBe(true);
      }
    }
  } else {
    expect(lignesDuTableau(html, TITRES.apres)).toEqual([]);
  }
  // Le rang, l'espacement et le mode ont la même forme, ou sont tous trois omis.
  const formes = [tables.rangs, tables.espacements, tables.modes].map((t) => t?.forme ?? null);
  // Le mode seul peut être omis : son croisement avec la section des modes le refuse parfois.
  expect(new Set(formes.slice(0, 2)).size).toBe(1);
  if (tables.modes !== null) expect(formes[2]).toBe(formes[0]);
  // Affichés, ils font de « Redonnée le jour même » leur réunion exacte, elle aussi affichée.
  if (tables.rangs !== null) expect(html).toContain('<th scope="row">Redonnée le jour même</th>');
}

test('le_rapport_d_une_personne_donne_les_deux_moities_en_nombres_ligne_par_ligne', () => {
  const journal = premierJour([
    { unite: 'xyv4pn7g', motif: 'FJFJ' },
    { unite: 'xyv4pn7g:inverse', motif: 'JJ' },
  ]);
  const html = dUnePersonne(journal);
  const sec = section(html);
  expect(sec).toContain(`<h2>${NOM_DE_LA_SECTION}</h2>`);
  for (const titre of Object.values(TITRES)) expect(sec).toContain(`<h3>${titre}</h3>`);
  expect(sec).toContain('<h4>Après une faute</h4>');
  expect(sec).toContain('<h4>Après une réponse juste</h4>');
  expect(sec).toContain('<h4>La première réponse du jour est fausse</h4>');
  expect(sec).toContain('<h4>La première réponse du jour est juste</h4>');
  const tables = tablesDesReprises(mesuresDe([journal]), true);
  expect(tables.rangs).toMatchObject({ forme: 'moities' });
  const rangs = tables.rangs as Extract<TableDeReprises, { forme: 'moities' }>;
  expect(noms(rangs.faute)).toEqual(['1re reprise', '3e reprise']);
  expect(noms(rangs.juste)).toEqual(['1re reprise', '2e reprise']);
  // Ligne par ligne : la part de justes, puis le nombre de réponses.
  expect(sec).toContain('<th scope="row">3e reprise</th><td>100 %</td><td>1</td>');
  expect(sec).toContain('<th scope="row">2e reprise</th><td>0 %</td><td>1</td>');
  expect(sec).toContain(
    '<th scope="row">Aucune autre réponse entre les deux</th><td>100 %</td><td>2</td>',
  );
  // La répartition : les couples et leur part de la moitié.
  expect(sec).toContain('<th scope="row">3 reprises</th><td>100 %</td><td>1</td>');
  expect(sec).toContain('<th scope="row">1 reprise</th><td>100 %</td><td>1</td>');
  expect(lignesDuTableau(html, TITRES.repartition)).toEqual(['3 reprises', '1 reprise']);
  // Une personne : des nombres, et le rapport dit le nombre de réponses.
  expect(sec).toContain('<th scope="col">Réponses</th>');
});

test('une_moitie_sans_reprise_le_dit_et_l_autre_s_affiche_et_un_jour_de_faute_isole_ne_compte_pas', () => {
  const sans = dUnePersonne(premierJour([{ unite: 'xyv4pn7g', motif: 'FJ' }]));
  expect(section(sans)).toContain('Aucune reprise après une réponse juste');
  expect(section(sans)).not.toContain('Aucune reprise après une faute');
  expect(section(sans)).toContain('<th scope="row">1re reprise</th>');
  expect(section(sans)).toContain('Aucun couple dont la première réponse est juste');
  expect(section(sans)).toContain('Aucun jour de faute suivi d’une réponse un autre jour.');
  expect(lignesDuTableau(sans, TITRES.apres)).toEqual([]);
  // Le lendemain, la première réponse d'un autre jour est mesurée.
  const suivi = dUnePersonne([
    ...premierJour([{ unite: 'xyv4pn7g', motif: 'FJ' }]),
    ...lendemain(['xyv4pn7g'], 1000),
  ]);
  expect(lignesDuTableau(suivi, TITRES.apres)).toEqual(['1 reprise après la faute']);
  expect(section(suivi)).toContain(
    '<th scope="row">1 reprise après la faute</th><td>100 %</td><td>1</td>',
  );
  expect(section(suivi)).not.toContain('Aucun jour de faute suivi');
});

test('un_rapport_d_ensemble_aux_deux_moities_a_chaque_cle_seule_en_pourcentages_entiers', () => {
  const journaux = journauxAuxReprises(3, ID_DU_COURS);
  const html = ensemble(journaux);
  const sec = section(html);
  const rang = [...CLES_DE_RANG.keys()].map(
    (i) => ['1re reprise', '2e reprise', '3e reprise', '4e reprise et au-delà'][i],
  );
  const tables = tablesDesReprises(mesuresDe(journaux), false);
  for (const genre of ['rangs', 'espacements', 'modes', 'repartition'] as const) {
    expect(tables[genre]?.forme).toBe('moities');
  }
  expect(lignesDuTableau(html, TITRES.rangs)).toEqual([...rang, ...rang]);
  const espacement = [
    'Aucune autre réponse entre les deux',
    '1 ou 2 autres réponses',
    '3 à 5 autres réponses',
    '6 à 10 autres réponses',
    '11 autres réponses ou plus',
  ];
  expect(lignesDuTableau(html, TITRES.espacements)).toEqual([...espacement, ...espacement]);
  const modes = ['Carte retournée', 'Réponse tapée'];
  expect(lignesDuTableau(html, TITRES.modes)).toEqual([...modes, ...modes]);
  const repartition = ['0 reprise', '1 reprise', '2 reprises', '3 reprises', '4 reprises ou plus'];
  expect(lignesDuTableau(html, TITRES.repartition)).toEqual([...repartition, ...repartition]);
  expect(lignesDuTableau(html, TITRES.apres)).toEqual([
    '0 reprise après la faute',
    '1 reprise après la faute',
    '2 reprises après la faute',
    '3 reprises ou plus après la faute',
  ]);
  // Des pourcentages entiers, ni compte, ni total.
  expect(sec).not.toContain('<th scope="col">Réponses</th>');
  expect(sec).not.toMatch(/sur [\d  ]+ réponses/);
  expect(sec).not.toMatch(/ · \d/);
  expect(sec).not.toContain('Couples</th>');
  for (const cellule of sec.matchAll(/<td>([^<]*)<\/td>/g)) {
    expect(cellule[1]).toMatch(/^\d+\s%$/);
  }
  // Chaque barre : 4 de large par point, et une infobulle « N % de justes ».
  const barres = [...sec.matchAll(/<rect class="s\d" x="200" y="[\d.]+" width="([\d.]+)"/g)];
  expect(barres.length).toBeGreaterThan(20);
  for (const barre of barres) expect(Number(barre[1]) % 4).toBe(0);
  const infobulles = [...sec.matchAll(/<title>([^<]*)<\/title>/g)].map((m) => m[1] ?? '');
  expect(infobulles.length).toBe(barres.length);
  for (const infobulle of infobulles) expect(infobulle).toMatch(/ : \d+\s% de justes$/);
  verifierLaStructure(journaux);
});

/** Les éléments d'une personne : `n` couples de chaque motif, d'unités à eux. */
function demande(personne: string, motifs: Record<string, number>): ElementDeMotif[] {
  return Object.entries(motifs).flatMap(([motif, n]) => couples(motif, n, `${personne}${motif}`));
}

test('un_rang_refuse_se_fond_deux_fois_de_suite_et_donne_la_2e_reprise_et_au_dela', () => {
  // Après une faute : rang 1 [10,10,10], rang 2 [10,10,10], rang 3 [7,7,7], rang 4 et au-delà [26,0,0].
  const sept = { FJ: 10, JFJ: 10, JJFJ: 7 };
  const journaux = [
    premierJour(demande('a', { ...sept, JJJFJ: 26 })),
    premierJour(demande('b', sept)),
    premierJour(demande('c', sept)),
  ];
  const tables = tablesDesReprises(mesuresDe(journaux), false);
  expect(tables.rangs).toMatchObject({ forme: 'moities' });
  const rangs = tables.rangs as Extract<TableDeReprises, { forme: 'moities' }>;
  expect(noms(rangs.faute)).toEqual(['1re reprise', '2e reprise et au-delà']);
  expect(lignesDuTableau(ensemble(journaux), TITRES.rangs).slice(0, 2)).toEqual([
    '1re reprise',
    '2e reprise et au-delà',
  ]);
  verifierLaStructure(journaux);
});

test('deux_modes_admis_rejoignent_l_un_apres_l_autre_les_autres_modes', () => {
  const parMode: Record<string, number[]> = {
    pointage: [30, 0, 0],
    retournee: [7, 7, 7],
    saisie: [8, 8, 8],
    choix: [9, 9, 9],
  };
  const donnees: DonneesDeCle[] = CLES_DE_MODE.map((cle) => {
    const comptes = parMode[cle] ?? [0, 0, 0];
    return { cellule: { reponses: sommeDe(comptes), justes: 0 }, comptes };
  });
  const lignes = couvrirLesModes(donnees, caseAdmise, false) ?? [];
  expect(noms(lignes)).toEqual(['Choix parmi des propositions', 'Autres modes']);
  // Le mode refusé, puis les deux admis les moins fournis : [30,0,0] + [7,7,7] reste refusé.
  expect(lignes[1]?.cles).toEqual(['retournee', 'saisie', 'pointage']);
  expect(lignes[1]?.comptes).toEqual([45, 15, 15]);
  expect(caseAdmise(lignes[1]?.comptes ?? [])).toBe(true);
  // Deux modes refusés, réunis, passent : « Toutes les reprises ». Un mode refusé seul : rien.
  const seul: DonneesDeCle[] = CLES_DE_MODE.map((cle) => {
    const comptes = cle === 'pointage' ? [10, 0, 0] : cle === 'saisie' ? [5, 5, 5] : [0, 0, 0];
    return { cellule: { reponses: sommeDe(comptes), justes: 0 }, comptes };
  });
  expect(noms(couvrirLesModes(seul, caseAdmise, false) ?? [])).toEqual(['Toutes les reprises']);
  const refuse: DonneesDeCle[] = CLES_DE_MODE.map((cle) => {
    const comptes = cle === 'pointage' ? [30, 0, 0] : [0, 0, 0];
    return { cellule: { reponses: sommeDe(comptes), justes: 0 }, comptes };
  });
  expect(couvrirLesModes(refuse, caseAdmise, false)).toBeNull();
});

test('si_seule_la_moitie_apres_une_faute_passe_le_rang_l_espacement_et_le_mode_sont_reunis', () => {
  // Trois personnes ont des reprises après une faute ; deux seulement, après une réponse juste.
  // En répartition, les trois personnes ont des couples dans chaque moitié.
  const journaux = [
    premierJour([...couples('FJ', 8, 'f'), ...couples('JJ', 15, 'j')]),
    premierJour([...couples('FJ', 8, 'f'), ...couples('JJ', 15, 'j')]),
    premierJour([...couples('FJ', 8, 'f'), ...couples('J', 15, 'j')]),
  ];
  const tables = tablesDesReprises(mesuresDe(journaux), false);
  expect(tables.rangs).toMatchObject({ forme: 'reunies' });
  expect(tables.espacements).toMatchObject({ forme: 'reunies' });
  expect(tables.modes).toMatchObject({ forme: 'reunies' });
  expect(tables.repartition).toMatchObject({ forme: 'moities' });
  const html = ensemble(journaux);
  expect(lignesDuTableau(html, TITRES.rangs)).toEqual(['Toutes les reprises']);
  expect(lignesDuTableau(html, TITRES.repartition)).toEqual([
    'Tous les couples',
    'Tous les couples',
  ]);
  expect(section(html)).not.toContain('<h4>Après une faute</h4>');
  expect(html).toContain('<th scope="row">Redonnée le jour même</th>');
  verifierLaStructure(journaux);
});

test('une_personne_qui_fait_plus_de_70_pour_cent_des_reprises_les_fait_omettre', () => {
  // Trois personnes sans reprise, 12 couples de chaque première réponse ; la quatrième fait toutes
  // les reprises, en trois couples, qu'elle reprend un autre jour.
  const sansReprise = (n: string) =>
    premierJour([
      ...couples('F', 12, `${n}f`),
      ...couples('J', 12, `${n}j`),
      // Deux reprises chacune : la quatrième en fait 15 sur 21, soit plus de 70 %.
      ...couples('JJ', 2, `${n}r`),
    ]);
  const quatrieme = premierJour(couples('FJFJFJ', 3, 'q'));
  const journaux = [
    sansReprise('a'),
    sansReprise('b'),
    sansReprise('c'),
    [...quatrieme, ...lendemain(['q0', 'q1', 'q2'], 5000)],
  ];
  const tables = tablesDesReprises(mesuresDe(journaux), false);
  expect(tables.rangs).toBeNull();
  expect(tables.espacements).toBeNull();
  expect(tables.modes).toBeNull();
  // La répartition passe en deux moitiés, et le dernier tableau (à la seule quatrième) est omis.
  expect(tables.repartition).toMatchObject({ forme: 'moities' });
  expect(tables.apresUnJourDeFaute).toBeNull();
  const html = ensemble(journaux);
  expect(html).not.toContain('<th scope="row">Redonnée le jour même</th>');
  expect(section(html)).toContain('Ce tableau est omis');
  expect(lignesDuTableau(html, TITRES.rangs)).toEqual([]);
  expect(lignesDuTableau(html, TITRES.apres)).toEqual([]);
  verifierLaStructure(journaux);
});

test('vingt_cinq_reponses_d_une_seule_personne_a_un_element_ne_disent_rien_d_un_couple', () => {
  const troisSansReprise = [1, 2, 3].map((n) =>
    premierJour(couples('F', 24, `p${n}`), n * 100_000),
  );
  // Seule, la quatrième personne répond 25 fois au même élément le même jour.
  const seule = premierJour([{ unite: 'xyv4pn7g', motif: 'J'.repeat(25), mode: 'pointage' }]);
  const html = ensemble([...troisSansReprise, seule]);
  expect(section(html)).toContain('Ce tableau est omis');
  for (const titre of [TITRES.rangs, TITRES.espacements, TITRES.modes, TITRES.apres]) {
    expect(lignesDuTableau(html, titre)).toEqual([]);
  }
  // La répartition, si elle s'affiche, ne dit que « Tous les couples » : jamais un couple à 24 reprises.
  for (const ligne of lignesDuTableau(html, TITRES.repartition)) {
    expect(ligne).toBe('Tous les couples');
  }
  expect(html).not.toContain('4 reprises ou plus');
  expect(html).not.toContain('Point touché');
  // Avec trois personnes qui ont des reprises, la quatrième est fondue : rien ne nomme une case.
  const avecReprises = [1, 2, 3].map((n) => premierJour(couples('JJ', 12, `r${n}`), n * 100_000));
  const fondu = ensemble([...avecReprises, seule]);
  verifierLaStructure([...avecReprises, seule]);
  expect(lignesDuTableau(fondu, TITRES.repartition)).toEqual(['Tous les couples']);
  expect(lignesDuTableau(fondu, TITRES.modes)).toEqual(['Toutes les reprises']);
  expect(lignesDuTableau(fondu, TITRES.rangs)).toEqual(['Toutes les reprises']);
  expect(section(fondu)).not.toContain('4 reprises ou plus');
  expect(section(fondu)).not.toMatch(/ \+ /);
});

test('sous_trois_personnes_actives_le_rapport_limite_ne_dit_rien_des_reprises', () => {
  const html = ensemble(journauxAuxReprises(2, ID_DU_COURS));
  expect(html).toContain('moins de trois personnes actives');
  expect(html).not.toContain(NOM_DE_LA_SECTION);
  expect(html).not.toContain('reprise');
});

test('des_pretests_entre_deux_reponses_d_un_element_ne_changent_pas_la_page', () => {
  const sans = journauxAuxReprises(3, ID_DU_COURS);
  // Pour chaque élément à plusieurs réponses, un pré-test de la même unité entre ses deux premières.
  const avec = sans.map((journal, personne) => {
    const vues = new Map<string, number>();
    const pretests: Evenement[] = [];
    for (const evenement of journal) {
      if (evenement.type !== 'reponse') continue;
      const instant = Date.parse(evenement.repondu_a);
      const premier = vues.get(evenement.unite);
      if (premier === undefined) {
        vues.set(evenement.unite, instant);
      } else if (premier >= 0) {
        vues.set(evenement.unite, -1);
        pretests.push(
          reponseInventee(
            (premier + instant) / 2,
            9_000_000 + personne * 10_000 + pretests.length,
            evenement.unite,
            pretests.length % 2 === 0,
            ID_DU_COURS,
            'pretest',
          ),
        );
      }
    }
    expect(pretests.length).toBeGreaterThan(60);
    return [...journal, ...pretests];
  });
  expect(ensemble(avec)).toBe(ensemble(sans));
  expect(tablesDesReprises(mesuresDe(avec), false)).toEqual(
    tablesDesReprises(mesuresDe(sans), false),
  );
});

test('une_valeur_affichee_est_arrondie_au_pour_cent_et_la_repartition_se_lit_sur_ses_couples', () => {
  // Trois personnes identiques : 5 reprises justes et 2 fautes après une réponse juste (71,4 %), et
  // 14 couples sans reprise contre 7 avec une (66,7 % et 33,3 % des couples).
  const personne = () =>
    premierJour([...couples('JJ', 5, 'a'), ...couples('JF', 2, 'b'), ...couples('J', 14, 'c')]);
  const html = ensemble([personne(), personne(), personne()]);
  const sec = section(html);
  const pct = (n: number) => `${n} %`;
  expect(sec).toContain(`<th scope="row">Toutes les reprises</th><td>${pct(71)}</td>`);
  expect(lignesDuTableau(html, TITRES.rangs)).toEqual(['Toutes les reprises']);
  // Une barre de 4 de large par point : 284 pour 71 %.
  expect(sec).toContain('width="284"');
  expect(sec).toContain(`Toutes les reprises : ${pct(71)} de justes`);
  expect(lignesDuTableau(html, TITRES.repartition)).toEqual(['0 reprise', '1 reprise ou plus']);
  expect(sec).toContain(`<th scope="row">0 reprise</th><td>${pct(67)}</td>`);
  expect(sec).toContain(`<th scope="row">1 reprise ou plus</th><td>${pct(33)}</td>`);
});

/** Un constructeur de journal : une réponse par seconde, au jour `jour` de janvier 2026. */
function constructeur() {
  const evenements: Evenement[] = [];
  const secondes = new Map<number, number>();
  const ajouter = (jour: number, unite: string, juste: boolean, mode?: ElementDeMotif['mode']) => {
    const s = secondes.get(jour) ?? 0;
    secondes.set(jour, s + 1);
    const instant = Date.UTC(2026, 0, jour, 8) + s * 1000;
    evenements.push(
      reponseInventee(instant, evenements.length + 1, unite, juste, ID_DU_COURS, mode),
    );
  };
  return { evenements, ajouter };
}

test('un_mode_dont_le_reste_est_refuse_ne_s_affiche_pas_seul_dans_les_reprises', () => {
  // A : 40 premières réponses en saisie, 10 reprises en saisie et 10 en retournée. B et C : 5
  // premières réponses en saisie, 10 reprises en saisie, 10 en retournée, puis 20 réponses en
  // retournée les jours suivants. « Réponse tapée » vaut [50,15,15] à la section des moments, et
  // [10,10,10] aux reprises : la différence [40,5,5] est refusée (80 %).
  const a = constructeur();
  for (let i = 0; i < 40; i++) {
    a.ajouter(5, `a${i}`, true, 'saisie');
    if (i < 10) a.ajouter(5, `a${i}`, true, 'saisie');
    else if (i < 20) a.ajouter(5, `a${i}`, true, 'retournee');
  }
  const bc = (p: string) => {
    const j = constructeur();
    for (let u = 0; u < 5; u++) {
      j.ajouter(5, `${p}${u}`, true, 'saisie');
      for (let k = 0; k < 5; k++) {
        if (u < 2) j.ajouter(5, `${p}${u}`, true, 'saisie');
        else if (u < 4) j.ajouter(5, `${p}${u}`, true, 'retournee');
      }
    }
    for (let jour = 6; jour <= 9; jour++) {
      for (let u = 0; u < 5; u++) j.ajouter(jour, `${p}${u}`, true, 'retournee');
    }
    return j.evenements;
  };
  const journaux = [a.evenements, bc('b'), bc('c')];
  const parPersonne = mesuresDe(journaux);
  const saisie = parPersonne.map((m) => m.modes.saisie.reponses);
  const reprisesEnSaisie = parPersonne.map(
    (m) => m.reprises.modes.juste.saisie.reponses + m.reprises.modes.faute.saisie.reponses,
  );
  expect(saisie).toEqual([50, 15, 15]);
  expect(reprisesEnSaisie).toEqual([10, 10, 10]);
  expect(caseAdmise(saisie.map((n, i) => n - (reprisesEnSaisie[i] ?? 0)))).toBe(false);
  const html = ensemble(journaux);
  // La section des moments et des modes montre « Réponse tapée » ; les reprises ne la montrent pas seule.
  const debutDesModes = html.indexOf('Selon le mode de la réponse</h3>');
  const dessMoments = html.slice(debutDesModes, html.indexOf('</details>', debutDesModes));
  expect(dessMoments).toContain('<th scope="row">Réponse tapée</th>');
  const modes = lignesDuTableau(html, TITRES.modes);
  expect(modes).not.toContain('Réponse tapée');
  // Les deux modes se fondent : seule la ligne qui les réunit ne laisse rien retrouver de « Réponse
  // tapée » ([40,5,5]), car elle n'est dans aucune ligne affichée seule.
  expect(modes).toEqual(['Toutes les reprises']);
  verifierLaStructure(journaux);
});

test('apres_un_jour_de_faute_est_omis_si_le_reste_d_un_moment_est_refuse', () => {
  // Tous les retours d'un autre jour suivent un jour de faute : « Autres moments » [95,22,30] moins
  // « Tous les jours de faute suivis » [15,6,15] donnerait [80,16,15], refusé (72 %). Ces retours sont
  // les seuls en « choix » : le reste de « Choix parmi des propositions » est vide, seul le moment refuse.
  const a = constructeur();
  for (let i = 0; i < 15; i++) a.ajouter(5, `af${i}`, false);
  for (let i = 0; i < 20; i++) {
    a.ajouter(5, `aj${i}`, true);
    a.ajouter(5, `aj${i}`, true);
  }
  for (let i = 0; i < 45; i++) a.ajouter(5, `ax${i}`, true);
  for (let i = 0; i < 15; i++) a.ajouter(6, `af${i}`, true, 'choix');
  const b = constructeur();
  for (let i = 0; i < 3; i++) b.ajouter(5, `bf${i}`, false);
  for (let i = 0; i < 3; i++) {
    b.ajouter(5, `bg${i}`, false);
    b.ajouter(5, `bg${i}`, true);
  }
  for (let i = 0; i < 10; i++) b.ajouter(5, `bx${i}`, true);
  for (let i = 0; i < 3; i++) b.ajouter(6, `bf${i}`, true, 'choix');
  for (let i = 0; i < 3; i++) b.ajouter(6, `bg${i}`, true, 'choix');
  const c = constructeur();
  for (let i = 0; i < 15; i++) {
    c.ajouter(5, `cg${i}`, false);
    c.ajouter(5, `cg${i}`, true);
  }
  for (let i = 0; i < 15; i++) c.ajouter(6, `cg${i}`, true, 'choix');
  const journaux = [a.evenements, b.evenements, c.evenements];
  const parPersonne = mesuresDe(journaux);
  const apres = parPersonne.map((m) =>
    sommeDe(CLES_APRES_UNE_FAUTE.map((cle) => m.reprises.apresUnJourDeFaute[cle].reponses)),
  );
  expect(apres).toEqual([15, 6, 15]);
  const html = ensemble(journaux);
  expect(html).toContain('<th scope="row">Autres moments</th>');
  expect(tablesDesReprises(parPersonne, false).apresUnJourDeFaute).toBeNull();
  expect(lignesDuTableau(html, TITRES.apres)).toEqual([]);
  expect(section(html)).toContain('Ce tableau est omis');
  expect(tablesDesReprises(parPersonne, false).omisParCroisement.apresUnJourDeFaute).toBe(true);
  expect(section(html)).toContain('un croisement avec la section des moments et des modes');
  // Le reste vient du lendemain : on l'omet avant de fondre des modes.
  verifierLaStructure(journaux);
});

test('apres_un_jour_de_faute_est_omis_si_le_reste_d_un_mode_est_refuse', () => {
  // Chaque personne : 15 fautes en saisie, reprises le lendemain en saisie. Les retours sont à eux
  // seuls la ligne de leur moment (le reste est vide), mais la première personne a 60 autres premières
  // réponses en saisie : « Réponse tapée » vaut [90,30,30] (15 + 60 + 15 pour la première), les retours [15,15,15], et le
  // reste [75,15,15] est refusé (71 %).
  const journaux = [60, 0, 0].map((autres) => {
    const j = constructeur();
    for (let i = 0; i < 15; i++) j.ajouter(5, `f${i}`, false, 'saisie');
    for (let i = 0; i < autres; i++) j.ajouter(5, `x${i}`, true, 'saisie');
    for (let i = 0; i < 15; i++) j.ajouter(6, `f${i}`, true, 'saisie');
    return j.evenements;
  });
  const parPersonne = mesuresDe(journaux);
  const retours = parPersonne.map((m) => m.reprises.apresUnJourDeFaute['apres-faute-0'].reponses);
  expect(retours).toEqual([15, 15, 15]);
  // Le moment des retours est affiché seul, et son reste est vide.
  const moments = lignesDesMoments(parPersonne, sommerMesures(parPersonne), caseAdmise, false);
  const duRetour = moments.delai.filter((l) => l.cles.includes('boite-1'));
  expect(duRetour.map((l) => l.cles)).toEqual([['boite-1']]);
  expect(parPersonne.map((m) => m.delais['boite-1'].reponses)).toEqual(retours);
  expect(tablesDesReprises(parPersonne, false).apresUnJourDeFaute).toBeNull();
  expect(lignesDuTableau(ensemble(journaux), TITRES.apres)).toEqual([]);
  verifierLaStructure(journaux);
});

test('un_mode_affiche_dans_les_deux_moities_ne_laisse_pas_retrouver_le_reste_d_une_ligne', () => {
  // A : 40 premières réponses en saisie ; 10 reprises en saisie après une faute, 10 après une juste,
  // et autant en retournée. B et C : une unité à 20 reprises en saisie, une à 20 en retournée.
  const a = constructeur();
  for (let i = 0; i < 40; i++) {
    a.ajouter(5, `a${i}`, i % 20 >= 10, 'saisie');
    a.ajouter(5, `a${i}`, true, i < 20 ? 'saisie' : 'retournee');
  }
  const bc = (p: string) => {
    const j = constructeur();
    j.ajouter(5, `${p}0`, false, 'saisie');
    for (let k = 0; k < 20; k++) j.ajouter(5, `${p}0`, k % 2 === 0, 'saisie');
    j.ajouter(5, `${p}1`, false, 'saisie');
    for (let k = 0; k < 20; k++) j.ajouter(5, `${p}1`, k % 2 === 0, 'retournee');
    for (let u = 2; u < 5; u++) j.ajouter(5, `${p}${u}`, true, 'saisie');
    for (let jour = 6; jour <= 9; jour++) {
      for (let u = 0; u < 5; u++) j.ajouter(jour, `${p}${u}`, true, 'retournee');
    }
    return j.evenements;
  };
  const journaux = [a.evenements, bc('b'), bc('c')];
  const parPersonne = mesuresDe(journaux);
  const parVerdict = (verdict: CleDeVerdict) =>
    parPersonne.map((m) => m.reprises.modes[verdict].saisie.reponses);
  // Deux moitiés de [10,10,10] : chacune passe seule, et leur reste dans la ligne des moments, non.
  expect(parVerdict('faute')).toEqual([10, 10, 10]);
  expect(parVerdict('juste')).toEqual([10, 10, 10]);
  const saisie = parPersonne.map((m) => m.modes.saisie.reponses);
  const reste = saisie.map(
    (n, i) => n - (parVerdict('faute')[i] ?? 0) - (parVerdict('juste')[i] ?? 0),
  );
  expect(caseAdmise(reste)).toBe(false);
  const html = ensemble(journaux);
  expect(lignesDuTableau(html, TITRES.modes)).toEqual([
    'Toutes les reprises',
    'Toutes les reprises',
  ]);
  verifierLaStructure(journaux);
});

test('apres_un_jour_de_faute_en_deux_lignes_ne_laisse_pas_retrouver_le_reste_d_un_mode', () => {
  // Deux lignes de retours : « choix » [224,50,70] moins elles deux laisserait [209,37,47] (71 %).
  const personne = (
    p: string,
    n: { l0: number; l1: number; x: number; xp: number; z: number; extra: number },
  ) => {
    const j = constructeur();
    for (let i = 0; i < n.l0; i++) j.ajouter(5, `${p}l0${i}`, false, 'choix');
    for (let i = 0; i < n.l1; i++) {
      j.ajouter(5, `${p}l1${i}`, false, 'choix');
      j.ajouter(5, `${p}l1${i}`, true, 'saisie');
    }
    for (let i = 0; i < n.x; i++) j.ajouter(5, `${p}x${i}`, true, 'choix');
    for (let i = 0; i < n.xp; i++) {
      j.ajouter(5, `${p}xp${i}`, true, 'choix');
      j.ajouter(5, `${p}xp${i}`, true, 'saisie');
    }
    for (let i = 0; i < n.z; i++) {
      j.ajouter(5, `${p}z${i}`, true, 'choix');
      j.ajouter(5, `${p}z${i}`, true, 'saisie');
    }
    for (let i = 0; i < n.extra; i++) j.ajouter(5, `${p}e${i}`, true, 'choix');
    for (let i = 0; i < n.l0; i++) j.ajouter(6, `${p}l0${i}`, true, 'choix');
    for (let i = 0; i < n.l1; i++) j.ajouter(6, `${p}l1${i}`, true, 'choix');
    for (let i = 0; i < n.x; i++) j.ajouter(6, `${p}x${i}`, true, 'saisie');
    for (let i = 0; i < n.xp; i++) j.ajouter(6, `${p}xp${i}`, true, 'saisie');
    for (let i = 0; i < n.z; i++) j.ajouter(7, `${p}z${i}`, true, 'saisie');
    return j.evenements;
  };
  const journaux = [
    personne('a', { l0: 10, l1: 5, x: 7, xp: 7, z: 0, extra: 180 }),
    personne('b', { l0: 8, l1: 5, x: 7, xp: 7, z: 10, extra: 0 }),
    personne('c', { l0: 8, l1: 15, x: 7, xp: 7, z: 10, extra: 0 }),
  ];
  const parPersonne = mesuresDe(journaux);
  const choix = parPersonne.map((m) => m.modes.choix.reponses);
  expect(choix).toEqual([224, 50, 70]);
  const apres = parPersonne.map((m) =>
    sommeDe(CLES_APRES_UNE_FAUTE.map((cle) => m.reprises.apresUnJourDeFaute[cle].reponses)),
  );
  expect(caseAdmise(choix.map((n, i) => n - (apres[i] ?? 0)))).toBe(false);
  // Avant la correction, le tableau avait deux lignes de retours, dont la somme (en « choix ») dépasse.
  verifierLaStructure(journaux);
  const html = ensemble(journaux);
  const lignes = lignesDuTableau(html, TITRES.apres);
  // Soit le tableau est omis, soit ses lignes ne laissent aucun reste refusé (la structure le dit).
  expect(lignes.length === 0 || lignes.length === 1).toBe(true);
});

test('un_mode_absent_seul_de_la_section_des_moments_ne_s_affiche_pas_seul_aux_reprises', () => {
  // « Point touché » est refusé à la section des moments (A y domine) : il passe la règle aux
  // reprises, mais n'y est pas affiché seul. Le reste de la ligne « Réponse tapée » est admis.
  const a = constructeur();
  for (let i = 0; i < 100; i++) a.ajouter(5, `ap${i}`, true, 'pointage');
  for (let i = 0; i < 7; i++) {
    a.ajouter(5, `ar${i}`, true, 'saisie');
    a.ajouter(5, `ar${i}`, true, 'pointage');
  }
  for (let i = 0; i < 30; i++) a.ajouter(5, `as${i}`, true, 'saisie');
  const bc = (p: string) => {
    const j = constructeur();
    for (let i = 0; i < 7; i++) {
      j.ajouter(5, `${p}r${i}`, true, 'saisie');
      j.ajouter(5, `${p}r${i}`, true, 'pointage');
    }
    for (let i = 0; i < 30; i++) j.ajouter(5, `${p}s${i}`, true, 'saisie');
    return j.evenements;
  };
  const journaux = [a.evenements, bc('b'), bc('c')];
  const html = ensemble(journaux);
  const debut = html.indexOf('Selon le mode de la réponse</h3>');
  const moments = html.slice(debut, html.indexOf('</details>', debut));
  expect(moments).not.toContain('Point touché');
  const modes = lignesDuTableau(html, TITRES.modes);
  // Il passe la règle aux reprises, mais n'est affiché seul qu'à la section des moments : il se fond.
  expect(modes).toEqual(['Toutes les reprises']);
  verifierLaStructure(journaux);
});

test('un_reste_vide_ou_une_ligne_non_contenue_laisse_les_tableaux_affiches', () => {
  // Chaque personne : 15 fautes en saisie, reprises le lendemain en saisie. Les retours sont à eux
  // seuls la ligne « boîte 1 » (reste vide), et le reste de « Réponse tapée » est admis ([15,15,15]).
  const journaux = [1, 2, 3].map(() => {
    const j = constructeur();
    for (let i = 0; i < 15; i++) j.ajouter(5, `f${i}`, false, 'saisie');
    for (let i = 0; i < 15; i++) j.ajouter(6, `f${i}`, true, 'saisie');
    return j.evenements;
  });
  const html = ensemble(journaux);
  expect(lignesDuTableau(html, TITRES.apres)).toEqual(['Tous les jours de faute suivis']);
  verifierLaStructure(journaux);
  // Et sans croisement possible : les journaux aux reprises gardent leurs quatre lignes.
  const completes = journauxAuxReprises(3, ID_DU_COURS);
  expect(lignesDuTableau(ensemble(completes), TITRES.apres)).toHaveLength(4);
});

test('un_mode_seul_dont_le_reste_est_refuse_omet_le_tableau_des_modes_et_dit_pourquoi', () => {
  // Un seul mode : « Réponse tapée » vaut [80,20,20] à la section des moments (66 %), [10,10,10]
  // aux reprises, et le reste [70,10,10] est refusé (77 %). Rien à lui joindre : le tableau est omis.
  const journaux = [60, 0, 0].map((premieres) => {
    const j = constructeur();
    for (let i = 0; i < premieres; i++) j.ajouter(5, `p${i}`, true, 'saisie');
    for (let u = 0; u < 10; u++) {
      j.ajouter(5, `r${u}`, true, 'saisie');
      j.ajouter(5, `r${u}`, true, 'saisie');
    }
    return j.evenements;
  });
  const parPersonne = mesuresDe(journaux);
  expect(parPersonne.map((m) => m.modes.saisie.reponses)).toEqual([80, 20, 20]);
  const html = ensemble(journaux);
  expect(lignesDuTableau(html, TITRES.modes)).toEqual([]);
  expect(tablesDesReprises(parPersonne, false).omisParCroisement.modes).toBe(true);
  expect(section(html)).toContain('un croisement avec la section des moments et des modes');
  verifierLaStructure(journaux);
});

test('apres_un_jour_de_faute_a_cheval_sur_deux_moments_est_omis_si_leur_reunion_laisse_un_reste_refuse', () => {
  // Chaque personne : 4 fautes isolées (retour le lendemain) et 4 « faux, juste » (retour le
  // lendemain), soit deux clés de 12 refusées seules, réunies en une ligne de 24 qui a des retours dans
  // deux moments. Chaque moment, avec ses retours qui ne suivent pas une faute (40 pour la première
  // personne, 6 pour les autres), passe seul ; leur réunion moins la ligne, [80,12,12], est refusée.
  const journaux = [40, 6, 6].map((autres, personne) => {
    const j = constructeur();
    for (let i = 0; i < 4; i++) j.ajouter(5, `f${i}`, false, 'saisie');
    for (let i = 0; i < 4; i++) {
      j.ajouter(5, `g${i}`, false, 'saisie');
      j.ajouter(5, `g${i}`, true, 'saisie');
    }
    for (let i = 0; i < autres; i++) j.ajouter(5, `x${i}`, true, 'saisie');
    for (let i = 0; i < autres; i++) {
      j.ajouter(5, `y${i}`, true, 'saisie');
      j.ajouter(5, `y${i}`, true, 'saisie');
    }
    for (let i = 0; i < 4; i++) j.ajouter(6, `f${i}`, true, 'saisie');
    for (let i = 0; i < 4; i++) j.ajouter(6, `g${i}`, true, 'saisie');
    for (let i = 0; i < autres; i++) j.ajouter(6, `x${i}`, true, 'saisie');
    for (let i = 0; i < autres; i++) j.ajouter(6, `y${i}`, true, 'saisie');
    // Des premières réponses en plus pour les deux autres : « Première réponse » passe seule.
    for (let i = 0; i < (personne === 0 ? 0 : 40); i++) j.ajouter(5, `z${i}`, true, 'saisie');
    return j.evenements;
  });
  const parPersonne = mesuresDe(journaux);
  const ligne = (m: (typeof parPersonne)[number]) => ({
    premier: m.reprises.apresParMoment['apres-faute-0'],
    second: m.reprises.apresParMoment['apres-faute-1'],
  });
  const moments = (cle: 'boite-1' | 'avant-echeance') =>
    parPersonne.map((m) => m.delais[cle].reponses);
  // Les deux clés ont leurs retours dans deux moments différents, chacun affiché seul.
  expect(
    Object.entries(ligne(parPersonne[0] as (typeof parPersonne)[number]).premier).find(
      ([, n]) => n > 0,
    )?.[0],
  ).not.toBe(
    Object.entries(ligne(parPersonne[0] as (typeof parPersonne)[number]).second).find(
      ([, n]) => n > 0,
    )?.[0],
  );
  expect(moments('boite-1')).toEqual([44, 10, 10]);
  expect(moments('avant-echeance')).toEqual([44, 10, 10]);
  const html = ensemble(journaux);
  // Aucune ligne de moment ne contient seule la ligne des retours : elle est à cheval sur deux.
  const affichees = lignesDesMoments(parPersonne, sommerMesures(parPersonne), caseAdmise, false);
  expect(affichees.delai.map((l) => l.cles)).toEqual(
    expect.arrayContaining([['boite-1'], ['avant-echeance'], ['premiere']]),
  );
  expect(tablesDesReprises(parPersonne, false).apresUnJourDeFaute).toBeNull();
  expect(lignesDuTableau(html, TITRES.apres)).toEqual([]);
  expect(tablesDesReprises(parPersonne, false).omisParCroisement.apresUnJourDeFaute).toBe(true);
  expect(section(html)).toContain('un croisement avec la section des moments et des modes');
  verifierLaStructure(journaux);
});

test('une_ligne_des_moments_contenue_dans_une_ligne_des_reprises_ne_laisse_pas_retrouver_la_difference', () => {
  // « Choix » ne sert qu'aux reprises : sa ligne de la section des moments ([7,7,7]) est faite de
  // reprises. « Point touché » est absent seul de cette section et refusé aux reprises ([5,5,5]) :
  // il tirerait « Choix » dans « Autres modes » [12,12,12], dont la différence avec « Choix » est [5,5,5].
  const personne = (p: string, pointageEnPlus: number) => {
    const j = constructeur();
    for (let i = 0; i < 10; i++) {
      j.ajouter(5, `${p}s${i}`, true, 'saisie');
      j.ajouter(5, `${p}s${i}`, true, 'saisie');
    }
    for (let i = 0; i < 7; i++) {
      j.ajouter(5, `${p}c${i}`, true, 'saisie');
      j.ajouter(5, `${p}c${i}`, true, 'choix');
    }
    for (let i = 0; i < 5; i++) {
      j.ajouter(5, `${p}p${i}`, true, 'saisie');
      j.ajouter(5, `${p}p${i}`, true, 'pointage');
    }
    for (let i = 0; i < pointageEnPlus; i++) j.ajouter(5, `${p}x${i}`, true, 'pointage');
    return j.evenements;
  };
  const journaux = [personne('a', 50), personne('b', 0), personne('c', 0)];
  const parPersonne = mesuresDe(journaux);
  expect(parPersonne.map((m) => m.modes.choix.reponses)).toEqual([7, 7, 7]);
  const html = ensemble(journaux);
  const debut = html.indexOf('Selon le mode de la réponse</h3>');
  const moments = html.slice(debut, html.indexOf('</details>', debut));
  expect(moments).toContain('<th scope="row">Choix parmi des propositions</th>');
  expect(moments).not.toContain('Point touché');
  const modes = lignesDuTableau(html, TITRES.modes);
  // « Choix » reste seul (le groupe qui le contenait est défait) ; le reste se fond sans le contenir.
  expect(modes).toEqual(['Choix parmi des propositions', 'Autres modes']);
  verifierLaStructure(journaux);
});

test('apres_un_jour_de_faute_contenant_une_ligne_de_mode_est_omis_si_la_difference_est_refusee', () => {
  // Chaque personne : 4 fautes isolées et 4 « faux, juste », en saisie, avec retour le lendemain en
  // « choix » : deux clés refusées seules, réunies en une ligne [8,8,14]. La troisième personne a 6
  // fautes de plus, retournées en saisie. « Choix » vaut [8,8,8] à la section des moments : il est
  // contenu dans la ligne, dont la différence avec lui, [0,0,6], est refusée.
  const journaux = [0, 0, 6].map((en) => {
    const j = constructeur();
    for (let i = 0; i < 4; i++) j.ajouter(5, `f${i}`, false, 'saisie');
    for (let i = 0; i < 4; i++) {
      j.ajouter(5, `g${i}`, false, 'saisie');
      j.ajouter(5, `g${i}`, true, 'saisie');
    }
    for (let i = 0; i < en; i++) j.ajouter(5, `h${i}`, false, 'saisie');
    // Des reprises, pour que « Autres moments » (réponses redonnées le jour même comprises) passe.
    for (let i = 0; i < 6; i++) {
      j.ajouter(5, `k${i}`, true, 'saisie');
      j.ajouter(5, `k${i}`, true, 'saisie');
    }
    for (let i = 0; i < 4; i++) j.ajouter(6, `f${i}`, true, 'choix');
    for (let i = 0; i < 4; i++) j.ajouter(6, `g${i}`, true, 'choix');
    for (let i = 0; i < en; i++) j.ajouter(6, `h${i}`, true, 'saisie');
    return j.evenements;
  });
  const parPersonne = mesuresDe(journaux);
  expect(parPersonne.map((m) => m.modes.choix.reponses)).toEqual([8, 8, 8]);
  const retours = parPersonne.map((m) =>
    sommeDe(CLES_APRES_UNE_FAUTE.map((cle) => m.reprises.apresUnJourDeFaute[cle].reponses)),
  );
  expect(retours).toEqual([8, 8, 14]);
  const html = ensemble(journaux);
  expect(tablesDesReprises(parPersonne, false).apresUnJourDeFaute).toBeNull();
  expect(section(html)).toContain('un croisement avec la section des moments et des modes');
  verifierLaStructure(journaux);
});

test('un_reste_de_mode_venu_du_lendemain_omet_le_lendemain_sans_fondre_les_modes', () => {
  // Comme le cas où « Réponse tapée » a un reste refusé à cause des retours, avec en plus 10
  // reprises « choix » par personne, affichées seules : le tableau des modes n'a pas à changer.
  const journaux = [60, 0, 0].map((autres) => {
    const j = constructeur();
    for (let i = 0; i < 15; i++) j.ajouter(5, `f${i}`, false, 'saisie');
    for (let i = 0; i < autres; i++) j.ajouter(5, `x${i}`, true, 'saisie');
    for (let i = 0; i < 10; i++) {
      j.ajouter(5, `c${i}`, true, 'choix');
      j.ajouter(5, `c${i}`, true, 'choix');
    }
    for (let i = 0; i < 15; i++) j.ajouter(6, `f${i}`, true, 'saisie');
    return j.evenements;
  });
  const parPersonne = mesuresDe(journaux);
  const tables = tablesDesReprises(parPersonne, false);
  expect(tables.apresUnJourDeFaute).toBeNull();
  expect(tables.omisParCroisement.apresUnJourDeFaute).toBe(true);
  expect(lignesDuTableau(ensemble(journaux), TITRES.modes)).toEqual([
    'Choix parmi des propositions',
  ]);
  verifierLaStructure(journaux);
});

test('le_lendemain_contenant_une_ligne_de_moment_est_omis_si_la_difference_est_refusee', () => {
  // Chaque personne : 10 fautes sans reprise revues le lendemain (à l'échéance, depuis la boîte 1) et
  // 10 couples « juste, juste » revus le lendemain ; la première personne a 15 couples « faute, reprise
  // juste », les autres 1, revus le lendemain avant l'échéance. Le tableau du lendemain vaut
  // [25,11,11] ; « boîte 1 » [10,10,10] y est contenue, et la différence [15,1,1] est refusée.
  const journaux = [15, 1, 1].map((couples) => {
    const j = constructeur();
    for (let i = 0; i < couples; i++) {
      j.ajouter(5, `c${i}`, false, 'saisie');
      j.ajouter(5, `c${i}`, true, 'saisie');
    }
    for (let i = 0; i < 10; i++) j.ajouter(5, `n${i}`, false, 'saisie');
    for (let i = 0; i < 10; i++) {
      j.ajouter(5, `p${i}`, true, 'saisie');
      j.ajouter(5, `p${i}`, true, 'saisie');
    }
    for (let i = 0; i < couples; i++) j.ajouter(6, `c${i}`, true, 'saisie');
    for (let i = 0; i < 10; i++) j.ajouter(6, `n${i}`, i < 6, 'saisie');
    for (let i = 0; i < 10; i++) j.ajouter(6, `p${i}`, true, 'saisie');
    return j.evenements;
  });
  const parPersonne = mesuresDe(journaux);
  const retours = parPersonne.map((m) =>
    sommeDe(CLES_APRES_UNE_FAUTE.map((cle) => m.reprises.apresUnJourDeFaute[cle].reponses)),
  );
  expect(retours).toEqual([25, 11, 11]);
  expect(parPersonne.map((m) => m.delais['boite-1'].reponses)).toEqual([10, 10, 10]);
  const tables = tablesDesReprises(parPersonne, false);
  expect(tables.apresUnJourDeFaute).toBeNull();
  expect(tables.omisParCroisement.apresUnJourDeFaute).toBe(true);
  verifierLaStructure(journaux);
});

test('au_dela_de_douze_lignes_du_mode_la_porte_replie_sans_enumerer', () => {
  // Treize lignes de [10,10,10] chacune : toute réunion passerait la règle. Seul le plafond refuse.
  const parPersonne = mesuresDe([[], [], []]);
  const ligne = (i: number) => ({
    ligne: {
      nom: `ligne ${i}`,
      cles: ['saisie'],
      cellule: { reponses: 30, justes: 0 },
      comptes: [10, 10, 10],
    },
    verdicts: ['faute'] as readonly CleDeVerdict[],
  });
  const vide = { delai: [], mode: [] };
  const douze = Array.from({ length: 12 }, (_, i) => ligne(i));
  expect(premierEchecDeReunion(parPersonne, vide, douze, [])).toBeNull();
  expect(premierEchecDeReunion(parPersonne, vide, [...douze, ligne(12)], [])).toMatchObject({
    tableau: 'mode',
  });
});

test('le_sens_inverse_ne_compte_que_les_moities_de_la_reunion', () => {
  // « Choix » ne compte que des reprises, 10 après une faute et 10 après une juste par personne : sa
  // ligne de la section des moments vaut [20,20,20]. La ligne « Choix » de la moitié après une faute
  // ([10,10,10]) n'en est qu'une part : la réunion des deux lignes la contient, une seule non.
  const journaux = [1, 2, 3].map(() => {
    const j = constructeur();
    for (let i = 0; i < 10; i++) {
      j.ajouter(5, `f${i}`, false, 'saisie');
      j.ajouter(5, `f${i}`, true, 'choix');
    }
    for (let i = 0; i < 10; i++) {
      j.ajouter(5, `j${i}`, true, 'saisie');
      j.ajouter(5, `j${i}`, true, 'choix');
    }
    return j.evenements;
  });
  const parPersonne = mesuresDe(journaux);
  expect(parPersonne.map((m) => m.modes.choix.reponses)).toEqual([20, 20, 20]);
  const html = ensemble(journaux);
  expect(lignesDuTableau(html, TITRES.modes)).toEqual([
    'Choix parmi des propositions',
    'Choix parmi des propositions',
  ]);
  verifierLaStructure(journaux);
});

test('le_lendemain_omis_a_tort_par_le_repli_est_remis_si_la_porte_passe_avec_les_modes_finals', () => {
  // Chaque personne, en saisie : 30 couples « juste, juste », 10 couples dont la reprise est en
  // « choix », 8 fautes revues le lendemain ; 30 réponses en « choix » seules ; la première a 240
  // réponses de plus en saisie. Pour « Réponse tapée », le reste des reprises et des retours
  // ([288,...]) est refusé : le lendemain y est contenu, on l'omet d'abord, puis le mode se fond.
  // Avec le mode fondu, la porte passe avec le lendemain : il est remis.
  const journaux = [240, 0, 0].map((en) => {
    const j = constructeur();
    for (let i = 0; i < 30; i++) {
      j.ajouter(5, `k${i}`, true, 'saisie');
      j.ajouter(5, `k${i}`, true, 'saisie');
    }
    for (let i = 0; i < 10; i++) {
      j.ajouter(5, `c${i}`, true, 'saisie');
      j.ajouter(5, `c${i}`, true, 'choix');
    }
    for (let i = 0; i < 8; i++) j.ajouter(5, `f${i}`, false, 'saisie');
    for (let i = 0; i < 30; i++) j.ajouter(5, `y${i}`, true, 'choix');
    for (let i = 0; i < en; i++) j.ajouter(5, `x${i}`, true, 'saisie');
    for (let i = 0; i < 8; i++) j.ajouter(6, `f${i}`, true, 'saisie');
    return j.evenements;
  });
  const parPersonne = mesuresDe(journaux);
  const tables = tablesDesReprises(parPersonne, false);
  expect(tables.apresUnJourDeFaute).not.toBeNull();
  expect(tables.omisParCroisement.apresUnJourDeFaute).toBe(false);
  expect(lignesDuTableau(ensemble(journaux), TITRES.modes)).toEqual(['Toutes les reprises']);
  expect(lignesDuTableau(ensemble(journaux), TITRES.apres)).toEqual([
    'Tous les jours de faute suivis',
  ]);
  verifierLaStructure(journaux);
});
