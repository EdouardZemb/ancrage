// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { PointDeSchema } from '../../../domaine/contenu/modele.js';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import { AllerRetour, contexteDeTest, rendreDansUnCoursVivant } from '../contexte-cours.fixture.js';
import type { ContexteCours } from '../contexte-cours.js';
import type { Preferences } from '../preferences.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { boutons, progression, texteDe, touche } from './onglets.fixture.js';
import { Schemas } from './Schemas.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

const SCHEMA = 'sc000001';
const AUTRE_SCHEMA = 'sc000002';

function schemaDeTest(servi: CoursServi): ModuleServiDe<'schema'> {
  const schema = servi.modules.find((module) => module.type === 'schema');
  if (schema === undefined || schema.type !== 'schema') throw new Error('Aucun schéma de test');
  return schema;
}

const POINTS = schemaDeTest(coursServiDeTest()).points;

/** Le cours de test avec un deuxième schéma de trois points, après le premier. */
function coursAvecDeuxSchemas(): CoursServi {
  const servi = coursServiDeTest();
  const premier = schemaDeTest(servi);
  const trois: PointDeSchema[] = [
    { id: 'q1000001', x: 30, y: 20, terme: 'Nord', sens: 'oben' },
    { id: 'q1000002', x: 90, y: 60, terme: 'Süd', sens: 'unten' },
    { id: 'q1000003', x: 150, y: 40, terme: 'Ost', sens: 'rechts' },
  ];
  const autre = {
    ...premier,
    id: AUTRE_SCHEMA,
    titre: 'Das zweite Organ',
    note: 'Zweites Übungsschema',
    dessin: '<rect x="10" y="10" width="40" height="40"/>',
    points: trois,
  };
  const modules = servi.modules.flatMap((module) =>
    module === premier ? [module, autre] : [module],
  );
  return { ...servi, modules };
}

function coursSansPoint(): CoursServi {
  const servi = coursServiDeTest();
  return {
    ...servi,
    modules: servi.modules.map((module) =>
      module.type === 'schema' ? { ...module, points: [] } : module,
    ),
  };
}

function contexteDe(
  mode: Preferences['schemas']['mode'],
  options: { cours?: CoursServi; schema?: string } = {},
): ContexteCours {
  const contexte = contexteDeTest({ cours: options.cours });
  contexte.preferences = {
    ...contexte.preferences,
    schemas: { schema: options.schema ?? SCHEMA, mode },
  };
  return contexte;
}

function marqueurs(): SVGGElement[] {
  return Array.from(document.querySelectorAll<SVGGElement>('svg.sv .mk'));
}

/** L'indice du point que « Benennen » demande à nommer, lu dans « Wie heisst Nummer n ? ». */
function cibleNommee(): number {
  const numero = /Nummer (\d+)/.exec(document.querySelector('.card p b')?.textContent ?? '');
  if (numero === null) throw new Error('Aucune cible demandée');
  return Number(numero[1]) - 1;
}

/** L'indice du point que « Zeigen » demande de toucher, reconnu à son nom. */
function cibleMontree(): number {
  const terme = document.querySelector('.card p b')?.textContent;
  const rang = POINTS.findIndex((point) => point.terme === terme);
  if (rang < 0) throw new Error(`Aucun point « ${terme} »`);
  return rang;
}

/** Les classes d'un élément, dans l'ordre et sans espace en trop. */
function classe(element: Element): string {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).join(' ');
}

function marqueur(numero: number): Element {
  return screen.getByRole('button', { name: `Nummer ${numero}` });
}

describe('Schemas', () => {
  it('benennen_quatre_noms', () => {
    const contexte = contexteDe('benennen');
    rendreDansUnCoursVivant(<Schemas />, contexte);

    // La tête : les deux listes, le score et la note du schéma, qui viennent du contenu.
    const schemas = screen.getByLabelText(t.schemas_choix) as HTMLSelectElement;
    expect(Array.from(schemas.options).map((x) => [x.value, x.textContent])).toEqual([
      [SCHEMA, 'Das Musterorgan'],
    ]);
    const modes = screen.getByLabelText(t.choix_exercice) as HTMLSelectElement;
    expect(modes.value).toBe('benennen');
    expect(Array.from(modes.options).map((x) => [x.value, x.textContent])).toEqual([
      ['benennen', 'Benennen'],
      ['zeigen', 'Zeigen'],
      ['lernen', 'Lernansicht'],
    ]);
    expect(progression()).toBe('0 / 0 richtig · 0 von 5 Strukturen gekonnt');
    expect(screen.getByText('Übungsschema ohne Vorbild')).toBeTruthy();

    // Le dessin du contenu, avec un repère numéroté par point, celui à nommer en cours.
    const svg = document.querySelector('svg.sv') as SVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 100');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Das Musterorgan');
    expect(svg.querySelector('circle[cx="100"][cy="50"][r="20"]')).not.toBeNull();
    expect(marqueurs().map((x) => x.textContent)).toEqual(['1', '2', '3', '4', '5']);
    const cible = cibleNommee();
    expect(marqueurs().map((x) => classe(x))).toEqual(
      POINTS.map((_, rang) => (rang === cible ? 'mk cur' : 'mk')),
    );
    expect(svg.classList.contains('clickable')).toBe(false);
    expect(document.querySelector('.card p')?.textContent).toBe(`Wie heisst Nummer ${cible + 1}?`);

    // Quatre noms, numérotés, dont le bon.
    const noms = boutons().map(texteDe);
    expect(noms).toHaveLength(4);
    expect(new Set(noms).size).toBe(4);
    expect(noms).toContain(POINTS[cible].terme);
    expect(boutons().map((x) => x.querySelector('.mono')?.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    for (const nom of noms) expect(POINTS.map((x) => x.terme)).toContain(nom);

    // Un mauvais nom : verdict, le bon repère en vert, la réponse journalisée une seule fois.
    const faux = boutons().find((x) => texteDe(x) !== POINTS[cible].terme) as HTMLButtonElement;
    fireEvent.click(faux);

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(POINTS[cible].id, false);
    const verdict = document.querySelector('.verdict') as HTMLElement;
    expect(verdict.className).toBe('verdict ko');
    expect(verdict.querySelector('span')?.textContent).toBe(t.verdict_fausse);
    expect(verdict.querySelector('b')?.textContent).toBe(`${cible + 1} = ${POINTS[cible].terme}`);
    expect(verdict.querySelector('span.muted')?.textContent).toBe(POINTS[cible].sens);
    expect(marqueurs().map((x) => classe(x))).toEqual(
      POINTS.map((_, rang) => (rang === cible ? 'mk ok' : 'mk')),
    );
    expect(boutons()).toHaveLength(0);
    expect(progression()).toBe('0 / 1 richtig · 0 von 5 Strukturen gekonnt');
    const suivant = screen.getByRole('button', { name: t.suivante });
    expect(document.activeElement).toBe(suivant);

    // Une question neuve, la série se poursuit.
    fireEvent.click(suivant);
    expect(boutons()).toHaveLength(4);
    expect(document.querySelector('.verdict')).toBeNull();
    expect(progression()).toBe('0 / 1 richtig · 0 von 5 Strukturen gekonnt');
  });

  it('benennen_le_bon_nom_journalise_juste', () => {
    const contexte = contexteDe('benennen');
    rendreDansUnCoursVivant(<Schemas />, contexte);
    const cible = cibleNommee();

    fireEvent.click(boutons().find((x) => texteDe(x) === POINTS[cible].terme) as HTMLButtonElement);

    expect(contexte.enregistrer).toHaveBeenCalledWith(POINTS[cible].id, true);
    expect(document.querySelector('.verdict')?.className).toBe('verdict ok');
    expect(document.querySelector('.verdict span')?.textContent).toBe(t.verdict_juste);
    expect(progression()).toBe('1 / 1 richtig · 1 von 5 Strukturen gekonnt');
  });

  it('benennen_touches_1_a_4', () => {
    const contexte = contexteDe('benennen');
    rendreDansUnCoursVivant(<Schemas />, contexte);
    const cible = cibleNommee();
    const noms = boutons().map(texteDe);

    touche('5');
    touche('0');
    touche('a');
    expect(contexte.enregistrer).not.toHaveBeenCalled();

    touche('3');

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(
      POINTS[cible].id,
      noms[2] === POINTS[cible].terme,
    );
    // Répondue : les chiffres ne comptent plus, avant « Weiter ».
    touche('1');
    touche('4');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: t.suivante }));
    touche('4');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);
  });

  it('zeigen_toucher_le_bon_point', () => {
    const contexte = contexteDe('zeigen');
    rendreDansUnCoursVivant(<Schemas />, contexte);

    // « Tippe auf : terme (sens) », avec le schéma dont les repères se touchent.
    const cible = cibleMontree();
    expect(document.querySelector('.card p')?.textContent).toBe(
      `Tippe auf: ${POINTS[cible].terme} (${POINTS[cible].sens})`,
    );
    expect(document.querySelector('.card p span.muted')?.textContent).toBe(
      `(${POINTS[cible].sens})`,
    );
    const svg = document.querySelector('svg.sv') as SVGElement;
    expect(svg.classList.contains('clickable')).toBe(true);
    expect(boutons()).toHaveLength(0);
    // Aucun repère n'est mis en avant : on cherche le point soi-même.
    expect(marqueurs().some((x) => x.classList.contains('cur'))).toBe(false);
    for (const [rang, repere] of marqueurs().entries()) {
      expect(repere.getAttribute('role')).toBe('button');
      expect(repere.getAttribute('tabindex')).toBe('0');
      expect(repere.getAttribute('aria-label')).toBe(`Nummer ${rang + 1}`);
    }

    fireEvent.click(marqueur(cible + 1));

    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(POINTS[cible].id, true);
    expect(marqueurs().map((x) => classe(x))).toEqual(
      POINTS.map((_, rang) => (rang === cible ? 'mk ok' : 'mk')),
    );
    expect(document.querySelector('.verdict')?.className).toBe('verdict ok');
    expect(document.querySelector('.verdict b')?.textContent).toBe(
      `${cible + 1} = ${POINTS[cible].terme}`,
    );
    // Les repères ne se touchent plus ; « Weiter » a le focus.
    expect(svg.classList.contains('clickable')).toBe(false);
    expect(document.querySelector('svg.sv .mk[role="button"]')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: t.suivante }));
    expect(progression()).toBe('1 / 1 richtig · 1 von 5 Strukturen gekonnt');

    // Un deuxième toucher sur un repère ne compte pas.
    fireEvent.click(marqueurs()[(cible + 1) % POINTS.length]);
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
  });

  it('zeigen_un_mauvais_point_en_rouge_et_le_bon_en_vert', () => {
    const contexte = contexteDe('zeigen');
    rendreDansUnCoursVivant(<Schemas />, contexte);
    const cible = cibleMontree();
    const autre = (cible + 2) % POINTS.length;

    fireEvent.click(marqueur(autre + 1));

    expect(contexte.enregistrer).toHaveBeenCalledWith(POINTS[cible].id, false);
    expect(marqueurs().map((x) => classe(x))).toEqual(
      POINTS.map((_, rang) => (rang === cible ? 'mk ok' : rang === autre ? 'mk ko' : 'mk')),
    );
    expect(document.querySelector('.verdict')?.className).toBe('verdict ko');
    expect(document.querySelector('.verdict span')?.textContent).toBe(t.verdict_fausse);
    expect(progression()).toBe('0 / 1 richtig · 0 von 5 Strukturen gekonnt');
  });

  it('zeigen_au_clavier_entree_ou_espace_sur_un_point', () => {
    for (const touchePressee of ['Enter', ' ']) {
      const contexte = contexteDe('zeigen');
      rendreDansUnCoursVivant(<Schemas />, contexte);
      const cible = cibleMontree();

      // Une autre touche ne fait rien et garde son effet.
      expect(fireEvent.keyDown(marqueur(cible + 1), { key: 'a' })).toBe(true);
      expect(fireEvent.keyDown(marqueur(cible + 1), { key: 'Tab' })).toBe(true);
      expect(contexte.enregistrer).not.toHaveBeenCalled();

      // Tenue enfoncée, la touche ne répond pas deux fois ; la page ne défile pas.
      expect(fireEvent.keyDown(marqueur(cible + 1), { key: touchePressee, repeat: true })).toBe(
        false,
      );
      expect(contexte.enregistrer).not.toHaveBeenCalled();

      expect(fireEvent.keyDown(marqueur(cible + 1), { key: touchePressee })).toBe(false);

      expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
      expect(contexte.enregistrer).toHaveBeenCalledWith(POINTS[cible].id, true);
      expect(classe(marqueurs()[cible])).toBe('mk ok');
      cleanup();
    }
  });

  it('zeigen_expose_les_points_comme_des_boutons_a_la_technologie_d_assistance', () => {
    rendreDansUnCoursVivant(<Schemas />, contexteDe('zeigen'));

    // Une image dont les enfants sont présentationnels cacherait les boutons : le dessin cliquable
    // est un groupe nommé.
    const svg = document.querySelector('svg.sv') as SVGElement;
    expect(svg.getAttribute('role')).toBe('group');
    expect(svg.getAttribute('aria-label')).toBe('Das Musterorgan');
  });

  it('lernansicht_sans_journal', () => {
    const contexte = contexteDe('lernen');
    rendreDansUnCoursVivant(<Schemas />, contexte);

    // Pas de score : seulement ce qui est acquis. Le dessin et la liste des points.
    expect(progression()).toBe('0 von 5 Strukturen gekonnt');
    const etude = document.querySelector('.study') as HTMLElement;
    expect(etude.querySelector('svg.sv')).not.toBeNull();
    expect(etude.querySelector('svg.sv')?.classList.contains('clickable')).toBe(false);
    expect(marqueurs().map((x) => x.textContent)).toEqual(['1', '2', '3', '4', '5']);
    expect(marqueurs().every((x) => classe(x) === 'mk')).toBe(true);
    expect(marqueurs().every((x) => !x.hasAttribute('role'))).toBe(true);
    const lignes = Array.from(etude.querySelectorAll('ol li'));
    expect(lignes.map((x) => x.textContent)).toEqual(
      POINTS.map((point) => `${point.terme} – ${point.sens}`),
    );
    expect(lignes[0].querySelector('b')?.textContent).toBe('Oberpol');
    // Ni question, ni option, ni verdict, ni « Weiter ».
    expect(boutons()).toHaveLength(0);
    expect(document.querySelector('.card')).toBeNull();
    expect(document.querySelector('.verdict')).toBeNull();
    expect(screen.getByText('Übungsschema ohne Vorbild')).toBeTruthy();

    // Toucher un repère ou presser un chiffre ne journalise rien.
    fireEvent.click(marqueurs()[0]);
    touche('1');
    touche('2');
    fireEvent.keyDown(marqueurs()[0], { key: 'Enter' });
    expect(contexte.enregistrer).not.toHaveBeenCalled();
    expect(progression()).toBe('0 von 5 Strukturen gekonnt');
  });

  it('schema_et_mode_retenus_dans_les_preferences', () => {
    const contexte = contexteDe('benennen', { cours: coursAvecDeuxSchemas() });
    rendreDansUnCoursVivant(<Schemas />, contexte);
    const schemas = screen.getByLabelText(t.schemas_choix) as HTMLSelectElement;
    expect(Array.from(schemas.options).map((x) => [x.value, x.textContent])).toEqual([
      [SCHEMA, 'Das Musterorgan'],
      [AUTRE_SCHEMA, 'Das zweite Organ'],
    ]);
    // Une réponse donnée, puis un autre schéma : la série repart sur le nouveau dessin.
    fireEvent.click(boutons()[0]);
    expect(progression()).toMatch(/^[01] \/ 1 richtig · /);

    fireEvent.change(schemas, { target: { value: AUTRE_SCHEMA } });

    expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
      ...contexte.preferences,
      schemas: { schema: AUTRE_SCHEMA, mode: 'benennen' },
    });
    expect((screen.getByLabelText(t.schemas_choix) as HTMLSelectElement).value).toBe(AUTRE_SCHEMA);
    expect(progression()).toBe('0 / 0 richtig · 0 von 3 Strukturen gekonnt');
    expect(screen.getByText('Zweites Übungsschema')).toBeTruthy();
    expect(document.querySelector('svg.sv')?.getAttribute('aria-label')).toBe('Das zweite Organ');
    expect(document.querySelector('svg.sv rect[width="40"]')).not.toBeNull();
    expect(document.querySelector('svg.sv circle[r="20"]')).toBeNull();
    expect(marqueurs()).toHaveLength(3);
    // Trois points : trois noms seulement, comme le prototype.
    expect(boutons()).toHaveLength(3);

    fireEvent.change(screen.getByLabelText(t.choix_exercice), { target: { value: 'zeigen' } });

    expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
      ...contexte.preferences,
      schemas: { schema: AUTRE_SCHEMA, mode: 'zeigen' },
    });
    expect(progression()).toBe('0 / 0 richtig · 0 von 3 Strukturen gekonnt');
    expect(document.querySelector('svg.sv')?.classList.contains('clickable')).toBe(true);

    fireEvent.change(screen.getByLabelText(t.choix_exercice), { target: { value: 'lernen' } });
    expect(progression()).toBe('0 von 3 Strukturen gekonnt');
    expect(document.querySelectorAll('.study ol li')).toHaveLength(3);
  });

  it('schema_et_mode_de_la_serie_recommencent_a_zero', () => {
    const contexte = contexteDe('benennen');
    rendreDansUnCoursVivant(<Schemas />, contexte);
    const cible = cibleNommee();
    fireEvent.click(boutons().find((x) => texteDe(x) === POINTS[cible].terme) as HTMLButtonElement);
    expect(progression()).toBe('1 / 1 richtig · 1 von 5 Strukturen gekonnt');

    fireEvent.change(screen.getByLabelText(t.choix_exercice), { target: { value: 'zeigen' } });

    // Le score repart ; ce qui est acquis reste, il vient du journal.
    expect(progression()).toBe('0 / 0 richtig · 1 von 5 Strukturen gekonnt');
  });

  it('tache_conservee_apres_un_aller_retour_d_onglet', () => {
    const contexte = contexteDe('benennen');
    rendreDansUnCoursVivant(
      <AllerRetour>
        <Schemas />
      </AllerRetour>,
      contexte,
    );
    const cible = cibleNommee();
    const noms = boutons().map(texteDe);

    fireEvent.click(screen.getByTestId('ailleurs'));
    expect(document.querySelector('svg.sv')).toBeNull();
    fireEvent.click(screen.getByTestId('retour'));

    expect(cibleNommee()).toBe(cible);
    expect(boutons().map(texteDe)).toEqual(noms);
    expect(contexte.enregistrer).not.toHaveBeenCalled();

    // Répondue, elle reste répondue.
    fireEvent.click(boutons()[0]);
    fireEvent.click(screen.getByTestId('ailleurs'));
    fireEvent.click(screen.getByTestId('retour'));
    expect(document.querySelector('.verdict')).not.toBeNull();
    expect(boutons()).toHaveLength(0);
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
  });

  it('schema_sans_point_affiche_un_etat_vide_sans_planter', () => {
    for (const mode of ['benennen', 'zeigen'] as const) {
      const contexte = contexteDe(mode, { cours: coursSansPoint() });
      rendreDansUnCoursVivant(<Schemas />, contexte);

      expect(screen.getByText(t.onglet_vide)).toBeTruthy();
      expect(progression()).toBe('0 / 0 richtig · 0 von 0 Strukturen gekonnt');
      expect(document.querySelector('.card')).toBeNull();
      touche('1');
      expect(contexte.enregistrer).not.toHaveBeenCalled();
      cleanup();
    }

    // La Lernansicht n'a besoin d'aucun tirage : le dessin s'affiche.
    rendreDansUnCoursVivant(<Schemas />, contexteDe('lernen', { cours: coursSansPoint() }));
    expect(document.querySelector('.study svg.sv')).not.toBeNull();
    expect(document.querySelectorAll('.study ol li')).toHaveLength(0);
  });
});
