import { describe, expect, it } from 'vitest';
import type { Cours, Module, Statut, Tache } from '../../domaine/contenu/modele.js';
import { htmlAVerifier, listeAVerifier, nombreDElements } from './a-verifier.js';
import { coursDExemple } from './exemple.disque.fixture.js';

const V: Statut = 'à vérifier';
const S: Statut = 'source';
const OK: Statut = 'vérifié';

function cours(modules: Module[]): Cours {
  return {
    id: 'cours',
    dossier: 'essai',
    titre: 'Essai',
    langue: 'de',
    typesDeCarte: {},
    leitner: { intervalles: [0, 1, 2, 4, 8, 16], nouvellesParSeance: 15 },
    modules,
  };
}

function carte(id: string, statut: Statut, recto = 'r', extra: { reponses?: string[] } = {}) {
  return { id, type: 'b', recto, verso: 'v', statut, ...extra };
}

function tache(reste: Record<string, unknown>): Tache {
  return { id: 't', consigne: 'Zuordnen Sie.', ...reste } as Tache;
}

const TACHES: Tache[] = [
  tache({ genre: 'appariement', paires: [{ id: 'ap', terme: 'Herz', cible: 'cor', statut: V }] }),
  tache({
    genre: 'classement',
    categories: ['a', 'b'],
    elements: [{ id: 'cl', terme: 'Niere', categorie: 'a', statut: V }],
  }),
  tache({
    genre: 'qcm',
    questions: [
      { id: 'qc', question: 'Q?', reponse: 'A', distracteurs: ['B', 'C', 'D'], statut: V },
    ],
  }),
  tache({
    genre: 'vrai-faux',
    affirmations: [
      { id: 'vf', affirmation: 'Das Herz pumpt.', vrai: false, correction: 'Doch', statut: V },
    ],
  }),
  tache({
    genre: 'trous',
    phrases: [{ id: 'tr', texte: 'Das ___ ist rot.', reponses: ['Blut'], statut: V }],
  }),
  tache({
    genre: 'orthographe',
    mots: [{ id: 'or', fautif: 'Hertz', reponse: 'Herz', statut: V }],
  }),
  tache({
    genre: 'ouverte',
    questions: [{ id: 'ou', question: 'Warum?', reponse: 'Darum', statut: V }],
  }),
];

function coursComplet(): Cours {
  return cours([
    {
      type: 'cartes',
      id: 'mc',
      fichier: 'cartes/01.yaml',
      numero: 1,
      titre: 'Karten',
      cartes: [
        carte('c1', S),
        carte('c2', V, 'Vorne', { reponses: ['eins', 'zwei'] }),
        carte('c3', OK),
        carte('c4', V),
      ],
    },
    {
      type: 'cartes',
      id: 'mr',
      fichier: 'cartes/02.yaml',
      numero: 2,
      titre: 'Ruhig',
      cartes: [carte('r1', S), carte('r2', OK)],
    },
    {
      type: 'morphologie',
      id: 'mm',
      fichier: 'morphologie.yaml',
      titre: 'Wortbaukasten',
      chapitres: [],
      morphemes: [
        { id: 'm1', categorie: 'p', forme: 'a-', sens: 'ohne', statut: V },
        { id: 'm2', categorie: 's', forme: '-itis', sens: 'Entzündung', statut: S },
      ],
      mots: [
        { id: 'w1', mot: 'Anämie', segments: [], sens: 'Blutarmut', statut: V },
        { id: 'w2', mot: 'Gastritis', segments: [], sens: 'x', statut: OK },
      ],
    },
    {
      type: 'schema',
      id: 'ms',
      fichier: 'schemas/herd.yaml',
      titre: 'Der Kochherd',
      viewbox: '0 0 1 1',
      dessin: '<g/>',
      note: 'Hinweis',
      points: [{ id: 'p1', x: 0, y: 0, terme: 'Atrium', sens: 'Vorhof' }],
      statut: V,
    },
    {
      type: 'texte-annote',
      id: 'mt',
      fichier: 'comptes-rendus.yaml',
      titre: 'Berichte',
      reussite: 0.7,
      textes: [
        {
          id: 'x1',
          titre: 'Bericht',
          // Le balisage du fichier n'est pas imprimé : le texte se recompose de ses segments.
          texte: 'Der [[Patient|Kranker|j1]]',
          segments: [{ texte: 'Der ' }, { jeton: { id: 'j1', forme: 'Patient', sens: 'Kranker' } }],
          questions: [{ id: 'q1', question: 'Wer?', reponse: 'Patient', distracteurs: ['Arzt'] }],
          statut: V,
        },
        { id: 'x2', titre: 'Ruhig', texte: '', segments: [], questions: [], statut: S },
      ],
    },
    {
      type: 'exercices',
      id: 'me',
      fichier: 'exercices.yaml',
      titre: 'Übungen',
      familles: [
        {
          code: 'f',
          libelle: 'F',
          exercices: [
            {
              id: 'e1',
              invite: 'Plural?',
              reponse: 'Herzen',
              options: ['Herzen', 'Herze'],
              regle: 'en',
              statut: V,
            },
            { id: 'e2', invite: 'x', reponse: 'y', statut: OK },
          ],
        },
      ],
    },
    {
      type: 'feuille',
      id: 'mf',
      fichier: 'feuilles/unit-01.yaml',
      numero: 1,
      titre: 'Unit 1',
      parties: [{ titre: 'Teil', taches: TACHES }],
    },
    {
      type: 'examen',
      id: 'mx',
      fichier: 'examen.yaml',
      titre: 'Prüfung',
      tailles: [10],
      tailleParDefaut: 10,
      secondesParQuestion: 1,
      minutesMinimum: 1,
      noteSuffisante: 4,
      seuilChapitre: 0.7,
      tirage: { schema: 0, texte: 0, exercice: 0, mot: 0, direct: 0, aTaper: 0 },
    },
  ]);
}

describe('listeAVerifier', () => {
  it('ne_garde_que_les_elements_a_verifier_dans_l_ordre', () => {
    const liste = listeAVerifier(coursComplet());

    expect(liste.map((m) => [m.fichier, m.type, m.titre])).toEqual([
      ['cartes/01.yaml', 'cartes', 'Karten'],
      ['morphologie.yaml', 'morphologie', 'Wortbaukasten'],
      ['schemas/herd.yaml', 'schema', 'Der Kochherd'],
      ['comptes-rendus.yaml', 'texte-annote', 'Berichte'],
      ['exercices.yaml', 'exercices', 'Übungen'],
      ['feuilles/unit-01.yaml', 'feuille', 'Unit 1'],
    ]);
    expect(liste[0].elements.map((e) => e.id)).toEqual(['c2', 'c4']);
    expect(liste[1].elements.map((e) => e.id)).toEqual(['m1', 'w1']);
    expect(liste[5].elements.map((e) => e.id)).toEqual(['ap', 'cl', 'qc', 'vf', 'tr', 'or', 'ou']);
    expect(nombreDElements(liste)).toBe(2 + 2 + 1 + 1 + 1 + 7);
  });

  it('donne_les_champs_de_chaque_nature', () => {
    const [cartes, morpho, schema, texte, exercices, feuille] = listeAVerifier(coursComplet());

    expect(cartes.elements[0].champs).toEqual([
      { libelle: 'Vorderseite', valeur: 'Vorne' },
      { libelle: 'Rückseite', valeur: 'v' },
      { libelle: 'Antworten', valeur: ['eins', 'zwei'] },
    ]);
    expect(cartes.elements[1].champs).toHaveLength(2);
    expect(morpho.elements[0].champs).toEqual([
      { libelle: 'Form', valeur: 'a-' },
      { libelle: 'Bedeutung', valeur: 'ohne' },
    ]);
    expect(morpho.elements[1].champs[0]).toEqual({ libelle: 'Wort', valeur: 'Anämie' });
    expect(schema.elements[0].champs).toEqual([
      { libelle: 'Titel', valeur: 'Der Kochherd' },
      { libelle: 'Zeichnung', valeur: 'siehe App' },
      { libelle: 'Hinweis', valeur: 'Hinweis' },
      { libelle: 'Atrium', valeur: 'Vorhof' },
    ]);
    expect(texte.elements[0].champs).toEqual([
      { libelle: 'Titel', valeur: 'Bericht' },
      { libelle: 'Text', valeur: 'Der Patient' },
      { libelle: 'Patient', valeur: 'Kranker' },
      { libelle: 'Frage', valeur: 'Wer?' },
      { libelle: 'Antwort', valeur: 'Patient' },
      { libelle: 'Falsche Antworten', valeur: ['Arzt'] },
    ]);
    expect(exercices.elements[0].champs).toEqual([
      { libelle: 'Aufgabe', valeur: 'Plural?' },
      { libelle: 'Antwort', valeur: 'Herzen' },
      { libelle: 'Optionen', valeur: ['Herzen', 'Herze'] },
      { libelle: 'Regel', valeur: 'en' },
    ]);
    const parGenre = Object.fromEntries(feuille.elements.map((e) => [e.id, e.champs]));
    expect(parGenre.ap).toEqual([
      { libelle: 'Aufgabe', valeur: 'Zuordnen Sie.' },
      { libelle: 'Begriff', valeur: 'Herz' },
      { libelle: 'Ziel', valeur: 'cor' },
    ]);
    expect(parGenre.cl.slice(1)).toEqual([
      { libelle: 'Begriff', valeur: 'Niere' },
      { libelle: 'Kategorie', valeur: 'a' },
    ]);
    expect(parGenre.qc.slice(1)).toEqual([
      { libelle: 'Frage', valeur: 'Q?' },
      { libelle: 'Antwort', valeur: 'A' },
      { libelle: 'Falsche Antworten', valeur: ['B', 'C', 'D'] },
    ]);
    expect(parGenre.vf.slice(1)).toEqual([
      { libelle: 'Aussage', valeur: 'Das Herz pumpt.' },
      { libelle: 'Lösung', valeur: 'falsch' },
      { libelle: 'Korrektur', valeur: 'Doch' },
    ]);
    expect(parGenre.tr.slice(1)).toEqual([
      { libelle: 'Text', valeur: 'Das ___ ist rot.' },
      { libelle: 'Antworten', valeur: ['Blut'] },
    ]);
    expect(parGenre.or.slice(1)).toEqual([
      { libelle: 'Falsch', valeur: 'Hertz' },
      { libelle: 'Richtig', valeur: 'Herz' },
    ]);
    expect(parGenre.ou.slice(1)).toEqual([
      { libelle: 'Frage', valeur: 'Warum?' },
      { libelle: 'Antwort', valeur: 'Darum' },
    ]);
  });

  it('un_cours_sans_element_a_verifier_donne_une_liste_vide', () => {
    const calme = cours([
      {
        type: 'cartes',
        id: 'm',
        fichier: 'a.yaml',
        numero: 1,
        titre: 'A',
        cartes: [carte('a', S), carte('b', OK)],
      },
    ]);

    expect(listeAVerifier(calme)).toEqual([]);
  });
});

describe('htmlAVerifier', () => {
  it('echappe_le_contenu_et_n_injecte_aucune_balise', () => {
    const piege = cours([
      {
        type: 'cartes',
        id: 'm',
        fichier: 'a<b>.yaml',
        numero: 1,
        titre: 'T "x"',
        cartes: [carte('a', V, `<img src=x onerror=alert(1)> "&'`)],
      },
    ]);

    const html = htmlAVerifier(listeAVerifier(piege), '01.11.2026');

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt; &quot;&amp;&#39;');
    expect(html).toContain('a&lt;b&gt;.yaml');
    expect(html).toContain('T &quot;x&quot;');
  });

  it('imprime_les_cartes_en_tableau_une_ligne_par_carte', () => {
    const piege = cours([
      {
        type: 'cartes',
        id: 'm',
        fichier: 'a.yaml',
        numero: 1,
        titre: 'T',
        cartes: [
          carte('a1', V, '<b>Herz</b>', { reponses: ['<i>x</i>', 'y&z'] }),
          carte('a2', V, 'Niere'),
        ],
      },
    ]);

    const html = htmlAVerifier(listeAVerifier(piege), '01.11.2026');

    expect(html).toContain('<table>');
    expect(html).toContain('<th>Vorderseite</th><th>Rückseite</th>');
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html).toContain('&lt;b&gt;Herz&lt;/b&gt;');
    expect(html).toContain('Auch richtig:');
    expect(html).toContain('&lt;i&gt;x&lt;/i&gt;');
    expect(html).toContain('y&amp;z');
    expect(html).not.toContain('<b>');
    expect(html).not.toContain('<i>');
    expect(html.match(/Auch richtig:/g)).toHaveLength(1);
    expect(html).not.toContain('class="element"');
  });

  it('garde_les_cadres_pour_un_texte_annote', () => {
    const html = htmlAVerifier(listeAVerifier(coursComplet()), '01.11.2026');
    const texte = html.slice(html.indexOf('<h2>Berichte</h2>'), html.indexOf('<h2>Übungen</h2>'));

    expect(texte).toContain('class="element"');
    expect(texte).not.toContain('<table>');
    expect(texte.match(/class="korrektur"/g)).toHaveLength(2);
  });

  it('est_une_page_allemande_autonome_avec_date_et_decompte', () => {
    const html = htmlAVerifier(listeAVerifier(coursComplet()), '01.11.2026');

    expect(html).toContain('<html lang="de">');
    expect(html).toContain('<h1>Zu prüfen</h1>');
    expect(html).toContain('01.11.2026 · 14 Elemente');
    expect(html).toContain('☐ korrekt');
    expect(html).toContain(
      'Bitte jedes Element prüfen: „korrekt“ ankreuzen oder die Korrektur eintragen.',
    );
    // Les 4 cartes et mots sont en tableau ; les 10 autres éléments gardent un cadre.
    expect(html.match(/Korrektur:<\/p>/g)).toHaveLength(10);
    expect(html).toContain('break-inside: avoid');
    expect(html).toContain('@media print');
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<(link|script)\b/);
  });
});

describe("sur le cours d'exemple", () => {
  // Lu sur le disque, `exemple-contenu/kueche` n'a qu'un élément « à vérifier » : une carte des
  // Zutaten. Une carte « vérifié » de ses Geräte, et tout le reste « source », ne comptent pas.
  it('liste_les_modules_a_relire_de_l_exemple', () => {
    const liste = listeAVerifier(coursDExemple());

    expect(liste.map((m) => m.fichier)).toEqual(['kueche/cartes/02-zutaten.yaml']);
    expect(nombreDElements(liste)).toBe(1);
  });
});
