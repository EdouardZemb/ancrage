// @vitest-environment happy-dom
import { cleanup, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import { preparerCours } from '../../../domaine/cours/prepare.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import type { Evenement } from '../../../domaine/journal/evenement.js';
import { posablesDuCours } from '../../../domaine/seances/heute.js';
import { contexteDeTest, rendreDansLeCours, reponseDeTest } from '../contexte-cours.fixture.js';
import { TacheAChoix, TacheVraiFaux } from '../feuilles/TacheAChoix.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { Cartes } from './Cartes.js';
import { Examen } from './Examen.js';
import { Exercices } from './Exercices.js';
import { Mots } from './Mots.js';
import { cliquer } from './onglets.fixture.js';
import { Quiz } from './Quiz.js';
import { Schemas } from './Schemas.js';

/*
 * La marque « schwierig » (M6, T2-D5) : sur la question d'un rebelle dans Karteikarten, Wortbaukasten,
 * les schémas, les exercices et les questions fermées d'une fiche ; jamais dans le Quiz. Tous les
 * éléments du cours de test sont rebelles (seuil de 2 fautes) : quel que soit celui que l'onglet
 * pose, il porte la marque. Données factices, écrites à la main (invariant 7).
 */

afterEach(cleanup);

const t = TEXTES_COURS.de;

/** Chaque posable du cours : juste, puis faux deux autres jours, soit rebelle. */
function toutRebelle(): Evenement[] {
  let n = 0;
  return posablesDuCours(preparerCours(coursServiDeTest())).flatMap(({ id }) => [
    reponseDeTest(n++, id, true, '2026-10-10'),
    reponseDeTest(n++, id, false, '2026-10-11'),
    reponseDeTest(n++, id, false, '2026-10-12'),
  ]);
}

function contexteRebelle(evenements: Evenement[] = toutRebelle()) {
  const servi: CoursServi = { ...coursServiDeTest(), rebelles: { fautes: 2 } };
  const contexte = contexteDeTest({ cours: servi, evenements });
  contexte.hasard = () => 0;
  return contexte;
}

describe('la marque des rebelles dans les onglets', () => {
  it.each([
    ['Karteikarten', <Cartes />],
    ['Wortbaukasten', <Mots />],
    ['les schémas', <Schemas />],
    ['les exercices', <Exercices />],
  ])('%s_marque_un_rebelle', (_nom, onglet) => {
    rendreDansLeCours(onglet, contexteRebelle());

    expect(screen.getAllByText(t.rebelle_marque)).toHaveLength(1);
  });

  it.each([
    ['Karteikarten', <Cartes />],
    ['Wortbaukasten', <Mots />],
    ['les schémas', <Schemas />],
    ['les exercices', <Exercices />],
  ])('%s_ne_marque_pas_un_element_qui_n_est_pas_rebelle', (_nom, onglet) => {
    rendreDansLeCours(onglet, contexteRebelle([]));

    expect(screen.queryByText(t.rebelle_marque)).toBeNull();
  });

  it('le_quiz_ne_marque_pas_un_rebelle', () => {
    rendreDansLeCours(<Quiz />, contexteRebelle());

    expect(screen.queryByText(t.rebelle_marque)).toBeNull();
  });

  it('la_pruefung_ne_marque_ni_n_aide_un_rebelle', () => {
    rendreDansLeCours(<Examen />, contexteRebelle());
    cliquer(t.examen_starten);

    expect(screen.queryByText(t.rebelle_marque)).toBeNull();
    expect(screen.queryByText(t.aide_titre)).toBeNull();
    // L'examen est bien lancé : sa première question est posée.
    expect(screen.queryByRole('button', { name: t.examen_starten })).toBeNull();
  });

  it('une_note_de_schema_n_est_pas_repetee_dans_l_onglet_des_schemas', () => {
    rendreDansLeCours(<Schemas />, contexteRebelle());

    expect(screen.getAllByText('Übungsschema ohne Vorbild')).toHaveLength(1);
    expect(screen.queryByText(t.aide_titre)).toBeNull();
  });
});

describe('la marque des rebelles dans les fiches', () => {
  const qcm = {
    id: 'fa000003',
    genre: 'qcm' as const,
    consigne: 'Wählen Sie die richtige Antwort.',
    questions: [
      {
        id: 'fb000007',
        question: 'Was bedeutet hyper-?',
        reponse: 'über dem Mass',
        distracteurs: ['unter dem Mass', 'schnell', 'langsam'],
        statut: 'source' as const,
      },
      {
        id: 'fb000010',
        question: 'Was bedeutet hypo-?',
        reponse: 'unter dem Mass',
        distracteurs: ['über dem Mass', 'schnell', 'langsam'],
        statut: 'source' as const,
      },
    ],
  };
  const vraiFaux = {
    id: 'fa000004',
    genre: 'vrai-faux' as const,
    consigne: 'Richtig oder falsch?',
    affirmations: [
      {
        id: 'fb000008',
        affirmation: 'Die Milz filtert das Blut.',
        vrai: true,
        statut: 'source' as const,
      },
      {
        id: 'fb000009',
        affirmation: 'Der Magen ist ein paariges Organ.',
        vrai: false,
        statut: 'source' as const,
      },
    ],
  };

  it('une_question_a_choix_rebelle_est_marquee_et_les_autres_non', () => {
    const evenements = [
      reponseDeTest(1, 'fb000007', true, '2026-10-10'),
      reponseDeTest(2, 'fb000007', false, '2026-10-11'),
      reponseDeTest(3, 'fb000007', false, '2026-10-12'),
    ];
    rendreDansLeCours(<TacheAChoix tache={qcm} onRepondu={vi.fn()} />, contexteRebelle(evenements));

    const marques = screen.getAllByText(t.rebelle_marque);
    expect(marques).toHaveLength(1);
    expect(marques[0].closest('fieldset')?.textContent).toContain('hyper-');
  });

  it('une_affirmation_rebelle_est_marquee_et_pas_sa_voisine', () => {
    const evenements = [
      reponseDeTest(1, 'fb000009', true, '2026-10-10'),
      reponseDeTest(2, 'fb000009', false, '2026-10-11'),
      reponseDeTest(3, 'fb000009', false, '2026-10-12'),
    ];
    rendreDansLeCours(
      <TacheVraiFaux tache={vraiFaux} onRepondu={vi.fn()} />,
      contexteRebelle(evenements),
    );

    const marques = screen.getAllByText(t.rebelle_marque);
    expect(marques).toHaveLength(1);
    expect(marques[0].closest('fieldset')?.textContent).toContain('Der Magen');
  });
});
