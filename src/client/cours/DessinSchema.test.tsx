// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModuleServiDe } from '../../domaine/cours/prepare.js';
import { contexteDeTest, rendreDansLeCours } from './contexte-cours.fixture.js';
import { DessinSchema } from './DessinSchema.js';

afterEach(cleanup);

function schemaDeTest(): ModuleServiDe<'schema'> {
  const schema = contexteDeTest().cours.schemas[0];
  if (schema === undefined) throw new Error('Aucun schéma de test');
  return schema;
}

function marqueurs(): SVGGElement[] {
  return Array.from(document.querySelectorAll<SVGGElement>('svg.sv .mk'));
}

/** Les classes d'un élément, dans l'ordre et sans espace en trop. */
function classe(element: Element): string {
  return (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean).join(' ');
}

describe('DessinSchema', () => {
  it('insere_le_dessin_du_contenu_et_un_repere_par_point', () => {
    const schema = schemaDeTest();
    rendreDansLeCours(<DessinSchema schema={schema} />, contexteDeTest());

    const svg = document.querySelector('svg.sv') as SVGElement;
    expect(svg.getAttribute('viewBox')).toBe('0 0 200 100');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Das Musterorgan');
    // L'intérieur du SVG est inséré tel quel : de vrais éléments SVG, dans l'espace SVG.
    const cercle = svg.querySelector('circle[cx="100"][cy="50"][r="20"]') as SVGElement;
    expect(cercle.namespaceURI).toBe('http://www.w3.org/2000/svg');
    // Les repères viennent du contenu : leur place, leur numéro.
    expect(marqueurs().map((x) => x.getAttribute('transform'))).toEqual(
      schema.points.map((point) => `translate(${point.x} ${point.y})`),
    );
    expect(marqueurs().map((x) => x.textContent)).toEqual(['1', '2', '3', '4', '5']);
    expect(marqueurs()[0].querySelector('circle')?.getAttribute('r')).toBe('10');
    expect(marqueurs()[0].querySelector('text')?.getAttribute('y')).toBe('3.5');
    // Ni image cliquable, ni repère mis en avant par défaut.
    expect(svg.classList.contains('clickable')).toBe(false);
    expect(marqueurs().every((x) => classe(x) === 'mk')).toBe(true);
    expect(marqueurs().every((x) => !x.hasAttribute('role') && !x.hasAttribute('tabindex'))).toBe(
      true,
    );
  });

  it('cible_et_marques_colorent_les_reperes', () => {
    rendreDansLeCours(
      <DessinSchema schema={schemaDeTest()} cible={1} marques={{ 3: 'ko', 0: 'ok' }} />,
      contexteDeTest(),
    );

    expect(marqueurs().map((x) => classe(x))).toEqual(['mk ok', 'mk cur', 'mk', 'mk ko', 'mk']);
  });

  it('cliquable_reperes_boutons_au_toucher_et_au_clavier', () => {
    const choisir = vi.fn();
    rendreDansLeCours(
      <DessinSchema schema={schemaDeTest()} cliquable choisir={choisir} />,
      contexteDeTest(),
    );

    const svg = document.querySelector('svg.sv') as SVGElement;
    expect(svg.classList.contains('clickable')).toBe(true);
    // Les repères sont des boutons : l'image devient un groupe, qui ne cache pas ses enfants.
    expect(svg.getAttribute('role')).toBe('group');
    expect(svg.getAttribute('aria-label')).toBe('Das Musterorgan');
    expect(screen.getAllByRole('button')).toHaveLength(5);
    expect(marqueurs().map((x) => x.getAttribute('aria-label'))).toEqual([
      'Nummer 1',
      'Nummer 2',
      'Nummer 3',
      'Nummer 4',
      'Nummer 5',
    ]);
    expect(marqueurs().every((x) => x.getAttribute('tabindex') === '0')).toBe(true);

    fireEvent.click(marqueurs()[2]);
    expect(choisir).toHaveBeenLastCalledWith(2);

    expect(fireEvent.keyDown(marqueurs()[4], { key: 'Enter' })).toBe(false);
    expect(choisir).toHaveBeenLastCalledWith(4);
    expect(fireEvent.keyDown(marqueurs()[0], { key: ' ' })).toBe(false);
    expect(choisir).toHaveBeenLastCalledWith(0);
    expect(choisir).toHaveBeenCalledTimes(3);

    // Une touche tenue enfoncée ne répond qu'une fois ; une autre touche garde son effet.
    expect(fireEvent.keyDown(marqueurs()[1], { key: 'Enter', repeat: true })).toBe(false);
    expect(fireEvent.keyDown(marqueurs()[1], { key: 'Escape' })).toBe(true);
    expect(choisir).toHaveBeenCalledTimes(3);
  });

  it('non_cliquable_ne_reagit_pas_au_toucher', () => {
    const choisir = vi.fn();
    rendreDansLeCours(<DessinSchema schema={schemaDeTest()} choisir={choisir} />, contexteDeTest());

    fireEvent.click(marqueurs()[0]);
    fireEvent.keyDown(marqueurs()[0], { key: 'Enter' });

    expect(choisir).not.toHaveBeenCalled();
  });
});
