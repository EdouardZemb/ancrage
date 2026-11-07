import { describe, expect, it } from 'vitest';
import { idsDeFeuille, idsDeTache, MARQUE_DE_TROU, morceauxDePhrase } from './feuille.js';
import type { PartieDeFeuille, Tache } from './modele.js';

/* Données factices, écrites à la main (invariant 7). */

describe('morceauxDePhrase', () => {
  it('morceaux_d_une_phrase_a_deux_trous', () => {
    expect(MARQUE_DE_TROU).toBe('___');
    expect(morceauxDePhrase('a ___ b ___ c')).toEqual(['a ', ' b ', ' c']);
    // Un trou en bord de phrase laisse un morceau vide : n + 1 morceaux pour n trous.
    expect(morceauxDePhrase('___ ist ein Organ.')).toEqual(['', ' ist ein Organ.']);
  });

  it('phrase_sans_trou_un_morceau', () => {
    expect(morceauxDePhrase('Das Herz hat vier Kammern.')).toEqual(['Das Herz hat vier Kammern.']);
    expect(morceauxDePhrase('')).toEqual(['']);
  });
});

describe('idsDeFeuille', () => {
  const source = { statut: 'source' } as const;
  const parties: PartieDeFeuille[] = [
    {
      titre: 'Teil A',
      taches: [
        {
          id: 'ta000001',
          genre: 'appariement',
          consigne: 'Ordnen Sie zu.',
          paires: [
            { id: 'pa000001', terme: 'Herz', cible: 'Organ', ...source },
            { id: 'pa000002', terme: 'Milz', cible: 'Filter', ...source },
          ],
        },
        {
          id: 'ta000002',
          genre: 'classement',
          consigne: 'Ordnen Sie ein.',
          categories: ['Lage', 'Tempo'],
          elements: [{ id: 'pa000003', terme: 'tachy-', categorie: 'Tempo', ...source }],
        },
      ],
    },
    {
      titre: 'Teil B',
      taches: [
        {
          id: 'ta000003',
          genre: 'qcm',
          consigne: 'Wählen Sie.',
          questions: [
            {
              id: 'pa000004',
              question: 'Wie viele Kammern?',
              reponse: 'Vier',
              distracteurs: ['Zwei', 'Drei', 'Fünf'],
              ...source,
            },
          ],
        },
        {
          id: 'ta000004',
          genre: 'vrai-faux',
          consigne: 'Richtig oder falsch?',
          affirmations: [
            { id: 'pa000005', affirmation: 'Die Milz filtert.', vrai: true, ...source },
          ],
        },
        {
          id: 'ta000005',
          genre: 'trous',
          consigne: 'Ergänzen Sie.',
          phrases: [{ id: 'pa000006', texte: 'Das ___ schlägt.', reponses: ['Herz'], ...source }],
        },
        {
          id: 'ta000006',
          genre: 'orthographe',
          consigne: 'Korrigieren Sie.',
          mots: [{ id: 'pa000007', fautif: 'Hertz', reponse: 'Herz', ...source }],
        },
        {
          id: 'ta000007',
          genre: 'ouverte',
          consigne: 'Antworten Sie.',
          questions: [{ id: 'pa000008', question: 'Wozu?', reponse: 'Zum Üben.', ...source }],
        },
      ],
    },
  ];

  it('ids_de_feuille_dans_l_ordre_du_papier', () => {
    // Les éléments seulement : ni les tâches, ni la feuille.
    expect(idsDeFeuille({ parties })).toEqual([
      'pa000001',
      'pa000002',
      'pa000003',
      'pa000004',
      'pa000005',
      'pa000006',
      'pa000007',
      'pa000008',
    ]);
    expect(idsDeTache(parties[0].taches[0])).toEqual(['pa000001', 'pa000002']);
    expect(idsDeFeuille({ parties: [] })).toEqual([]);
    // F1-D11 : une tâche d'un genre inconnu, servie par une version suivante, n'a pas d'élément
    // connu.
    const futur = { id: 'ta000008', genre: 'futur', consigne: 'Neu.' } as unknown as Tache;
    expect(idsDeTache(futur)).toEqual([]);
    expect(idsDeFeuille({ parties: [{ titre: 'Teil C', taches: [futur] }] })).toEqual([]);
  });
});
