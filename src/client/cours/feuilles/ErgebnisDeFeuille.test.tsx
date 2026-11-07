// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import { contexteDeTest, rendreDansLeCours, reponseDeTest } from '../contexte-cours.fixture.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { ErgebnisDeFeuille } from './ErgebnisDeFeuille.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

// fb000007 est faux le 14, puis juste le 16 ; fb000008 est faux le 15.
const REPONSES = [
  reponseDeTest(1, 'fb000007', false, '2026-10-14'),
  reponseDeTest(2, 'fb000008', false, '2026-10-15'),
  reponseDeTest(3, 'fb000007', true, '2026-10-16'),
];

function afficher() {
  const contexte = contexteDeTest({ evenements: REPONSES });
  const unit1 = contexte.cours.feuilles.find(
    ({ id }) => id === 'fe000001',
  ) as ModuleServiDe<'feuille'>;
  const retour = vi.fn();
  const { container } = rendreDansLeCours(
    <ErgebnisDeFeuille feuille={unit1} retour={retour} />,
    contexte,
  );
  return { contexte, retour, container };
}

const textes = (container: Element, selecteur: string): string[] =>
  [...container.querySelectorAll(selecteur)].map((noeud) => noeud.textContent ?? '');

function ligne(container: Element, enonce: string): HTMLElement {
  const trouvee = [...container.querySelectorAll<HTMLElement>('li.element')].find(
    (li) => li.querySelector('.enonce')?.textContent === enonce,
  );
  if (trouvee === undefined) throw new Error(`Aucune ligne pour « ${enonce} »`);
  return trouvee;
}

const verdict = (li: Element): string => li.querySelector('.pill')?.textContent ?? '';

describe('ErgebnisDeFeuille', () => {
  it('ergebnis_suit_l_ordre_de_la_fiche', () => {
    const { container } = afficher();
    expect(textes(container, '.tache .kind')).toEqual([
      'Teil A: Zuordnen',
      'Teil A: Zuordnen',
      'Teil B: Auswählen',
      'Teil B: Auswählen',
      'Teil C: Ergänzen',
      'Teil C: Ergänzen',
      'Teil C: Ergänzen',
      'Teil D: Offene Fragen',
    ]);
    expect(textes(container, '.tache .consigne')).toEqual([
      'Ordnen Sie die Begriffe den Erklärungen zu.',
      'Ordnen Sie die Vorsilben zu.',
      'Wählen Sie die richtige Antwort.',
      'Richtig oder falsch?',
      'Ergänzen Sie mit den Wörtern der Liste.',
      'Ergänzen Sie.',
      'Korrigieren Sie die Schreibweise.',
      'Beantworten Sie die Frage.',
    ]);
    const enonces = textes(container, 'li.element .enonce');
    expect(enonces).toHaveLength(13);
    expect(enonces[0]).toBe('Herz');
    expect(enonces[12]).toBe('Wozu dient die Leber?');
  });

  it('ergebnis_montre_la_loesung_de_chaque_genre', () => {
    const { container } = afficher();
    const loesung = (enonce: string) =>
      ligne(container, enonce).querySelector('.loesung')?.textContent;
    expect(loesung('Herz')).toBe('Lösung: Organ im Brustkorb');
    expect(loesung('tachy-')).toBe('Lösung: Tempo');
    expect(loesung('Was bedeutet hyper-?')).toBe('Lösung: über dem Mass');
    expect(loesung('Die Milz filtert das Blut.')).toBe('Lösung: Richtig');
    expect(ligne(container, 'Die Milz filtert das Blut.').querySelector('.correction')).toBeNull();
    expect(loesung('Der Magen ist ein paariges Organ.')).toBe('Lösung: Falsch');
    expect(
      ligne(container, 'Der Magen ist ein paariges Organ.').querySelector('.correction')
        ?.textContent,
    ).toBe('Der Magen ist ein Hohlorgan.');
    expect(loesung('Das ___ hat vier Kammern, die ___ bildet den Harn.')).toBe(
      'Lösung: Herz · Niere',
    );
    expect(loesung('Tachykardi')).toBe('Lösung: Tachykardie');
    expect(loesung('Wozu dient die Leber?')).toBe('Lösung: Sie verarbeitet Nährstoffe.');
  });

  it('ergebnis_dit_le_verdict_et_la_date_de_la_derniere_reponse', () => {
    const { container } = afficher();
    const juste = ligne(container, 'Was bedeutet hyper-?');
    expect(verdict(juste)).toBe('Richtig · 2026-10-16');
    expect(juste.querySelector('.pill')?.classList.contains('ok')).toBe(true);
    const faux = ligne(container, 'Die Milz filtert das Blut.');
    expect(verdict(faux)).toBe('Falsch · 2026-10-15');
    expect(faux.querySelector('.pill')?.classList.contains('ko')).toBe(true);
    const neuf = ligne(container, 'Herz');
    expect(verdict(neuf)).toBe('Noch nicht beantwortet');
    expect(neuf.querySelector('.pill')?.classList.contains('offen')).toBe(true);
  });

  it('ergebnis_compte_comme_la_liste', () => {
    const { container } = afficher();
    expect(container.textContent).toContain('1/13 richtig');
  });

  it('ergebnis_dit_que_quiz_et_pruefung_comptent', () => {
    afficher();
    expect(screen.getByText(t.feuilles_ergebnis_hinweis)).toBeTruthy();
  });

  it('ergebnis_question_ouverte_auto_evaluee', () => {
    const { container } = afficher();
    const mentions = screen.getAllByText(t.feuilles_ergebnis_selbst);
    expect(mentions).toHaveLength(1);
    const tache = mentions[0]?.closest('.tache');
    expect(tache?.querySelector('.consigne')?.textContent).toBe('Beantworten Sie die Frage.');
    expect(container.querySelectorAll('.tache')).toHaveLength(8);
  });

  it('ergebnis_zurueck_prend_le_focus_et_revient', () => {
    const { retour } = afficher();
    const [bouton] = screen.getAllByRole('button', { name: t.feuilles_zurueck });
    expect(document.activeElement).toBe(bouton);
    fireEvent.click(bouton);
    expect(retour).toHaveBeenCalledTimes(1);
  });

  it('ergebnis_zurueck_aussi_en_bas', () => {
    const { retour, container } = afficher();
    const boutons = screen.getAllByRole('button', { name: t.feuilles_zurueck });
    expect(boutons).toHaveLength(2);
    const dernier = boutons[1] as HTMLElement;
    const listes = container.querySelectorAll('.resultats');
    const derniereListe = listes[listes.length - 1] as Element;
    expect(
      derniereListe.compareDocumentPosition(dernier) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(document.activeElement).toBe(boutons[0]);
    fireEvent.click(dernier);
    expect(retour).toHaveBeenCalledTimes(1);
  });

  it('ergebnis_listes_nommees_par_leur_consigne', () => {
    afficher();
    const listes = screen.getAllByRole('list', {
      name: 'Ordnen Sie die Begriffe den Erklärungen zu.',
    });
    expect(listes).toHaveLength(1);
    expect(listes[0]?.classList.contains('resultats')).toBe(true);
  });

  it('ergebnis_n_ecrit_rien', () => {
    const { contexte } = afficher();
    fireEvent.click(screen.getAllByRole('button', { name: t.feuilles_zurueck })[0] as HTMLElement);
    expect(contexte.enregistrer).not.toHaveBeenCalled();
    expect(contexte.enregistrerExamen).not.toHaveBeenCalled();
  });
});
