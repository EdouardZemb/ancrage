import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyserContenus } from '../../domaine/contenu/analyse.js';
import {
  exempleDeCours,
  modifier,
  valeursDeNoticeDExemple,
} from '../../domaine/contenu/exemple.fixture.js';
import {
  chercherTextesDansClient,
  desechapperJs,
  LONGUEUR_MINIMALE_TEXTE,
  textesDeLaNotice,
  textesDuCours,
} from './client.js';
import {
  creerDepotTemporaire,
  creerLien,
  supprimerDepotsTemporaires,
} from './depot-temporaire.fixture.js';

afterEach(supprimerDepotsTemporaires);

const TEXTE_AVEC_TREMA = 'Erfundenes Organ für Übungszwecke';

/** Une barre oblique inverse, écrite sans échappement : le source du test n'en dépend pas. */
const BARRE = String.fromCharCode(92);

function textesDeLExemple(): string[] {
  const resultat = analyserContenus(exempleDeCours());
  expect(resultat.erreurs).toEqual([]);
  return textesDuCours(resultat.cours[0]);
}

/** Un dossier `dist/client` temporaire, aux fichiers donnés. */
function dossierServi(fichiers: Record<string, string>): string {
  const racine = creerDepotTemporaire(new Map());
  const dossier = path.join(racine, 'dist', 'client');
  for (const [chemin, texte] of Object.entries(fichiers)) {
    const cible = path.join(dossier, ...chemin.split('/'));
    fs.mkdirSync(path.dirname(cible), { recursive: true });
    fs.writeFileSync(cible, texte);
  }
  return dossier;
}

describe('textesDuCours', () => {
  it('prend_les_textes_de_douze_caracteres_ou_plus', () => {
    const textes = textesDeLExemple();

    expect(LONGUEUR_MINIMALE_TEXTE).toBe(12);
    expect(textes).toContain(TEXTE_AVEC_TREMA); // verso
    expect(textes).toContain('Übungsberichte'); // titre de module
    expect(textes).toContain('Seit wann bestehen die Beschwerden?'); // question
    expect(textes).toContain('Die Endung bestimmt das Geschlecht.'); // règle
    expect(textes).toContain('Übungsschema ohne Vorbild'); // note
    expect(textes).toContain('erfundene Entzündung der Vorlage'); // sens d'un mot
    expect(textes.every((texte) => texte.trim().length >= LONGUEUR_MINIMALE_TEXTE)).toBe(true);
  });

  it('descriptions_cherchees_dans_le_client', () => {
    const textes = textesDeLExemple();

    expect(textes).toContain('Rezeptwörter in Teile zerlegen und neu bilden'); // description d'une morphologie
    expect(textes).toContain('Übungsschema mit drei Punkten'); // description d'un schéma
    expect(textes).toContain('Kochbegriffe und Zutaten in Rezepten verstehen'); // d'un texte annoté
    expect(textes).toContain('Artikel und Plural zum Üben'); // d'un module d'exercices
    expect(textes).toContain('Probeprüfung zum Üben'); // titre du module d'examen
    expect(textes).toContain('Rezepttexte zum Lesen und Üben – frei erfunden.'); // consigne

    const dossier = dossierServi({
      'assets/index.js': 'const a = "Rezeptwörter in Teile zerlegen und neu bilden";',
    });
    const erreurs = chercherTextesDansClient(dossier, textes);
    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].fichier).toBe('assets/index.js');
  });

  it('exclut_les_textes_courts_et_l_interieur_des_dessins', () => {
    const textes = textesDeLExemple();

    expect(textes).not.toContain('Musterorgan');
    expect(textes).not.toContain('proto-');
    expect(textes.some((texte) => texte.includes('<circle'))).toBe(false);
    expect(textes.some((texte) => texte.includes('stroke='))).toBe(false);
  });

  it('textes_du_cours_comprennent_ceux_des_feuilles', () => {
    const textes = textesDeLExemple();

    for (const texte of [
      'Übungsblatt 1 – Musterkunde', // titre de la feuille
      'Teil A: Zuordnungsaufgaben', // titre d'une partie
      'Ordnen Sie die Begriffe den Erklärungen zu.', // consigne
      'Musterorganum', // terme d'un appariement
      'Erfundenes Übungsorgan', // cible
      'Lagebezeichnung', // catégorie d'un classement
      'supramuster-', // terme d'un classement
      'Was bedeutet die Vorsilbe proto-?', // question d'un QCM
      'erfunden, zur Übung', // réponse d'un QCM
      'gegen etwas gerichtet', // distracteur
      'Das Musterorgan ist frei erfunden.', // affirmation
      'Die Vorsilbe kontra- bedeutet gegen.', // correction
      'Der Oberpol ist das ___, der Unterpol das ___.', // phrase à trous
      'seitlicher Rand', // mot de la liste
      'Probelapenentzündung', // forme fautive
      'Probelappenentzündung', // mot corrigé
      'Wozu dient das Musterorgan?', // question ouverte
      'Es dient nur zum Üben der Begriffe.', // réponse modèle
    ]) {
      expect(textes, texte).toContain(texte);
    }

    // Sans liste de mots, les réponses d'une phrase sont cherchées pour elles-mêmes.
    const sansListe = analyserContenus(
      modifier(
        exempleDeCours(),
        'essai/feuille.yaml',
        '        liste: ["oberes Ende", "unteres Ende", "seitlicher Rand"]\n',
        '',
      ),
    );
    expect(sansListe.erreurs).toEqual([]);
    expect(textesDuCours(sansListe.cours[0])).toContain('unteres Ende');
  });
});

describe('textesDeLaNotice', () => {
  it('textes_de_la_notice_prennent_les_valeurs_longues_et_les_adresses', () => {
    const textes = textesDeLaNotice(valeursDeNoticeDExemple());

    // Une valeur de chaque langue, d'au moins douze caractères.
    expect(textes).toContain('Aucune donnée ne quitte l’Exemplie.');
    expect(textes).toContain('Keine Daten verlassen Exemplien.');
    // La cible d'un lien `mailto:`, et l'adresse seule, quelle que soit leur longueur.
    expect(textes).toContain('mailto:contact@exemple.test');
    expect(textes).toContain('contact@exemple.test');
    // Trop courts pour prouver quoi que ce soit : un fragment, un nom.
    expect(textes).not.toContain('Passerelle');
    expect(textes).not.toContain('chez Coffre');
    // Un site public n'est pas cherché pour lui-même.
    expect(textes).not.toContain('https://protection.exemple.test');
    expect(new Set(textes).size).toBe(textes.length);

    const courte = textesDeLaNotice({
      ...valeursDeNoticeDExemple(),
      liens: [{ texte: 'a@b.ch', cible: 'mailto:a@b.ch' }],
    });
    expect(courte).toContain('mailto:a@b.ch');
    expect(courte).toContain('a@b.ch');
  });

  it('client_trouve_une_valeur_de_notice', () => {
    const textes = textesDeLaNotice(valeursDeNoticeDExemple());
    const dossier = dossierServi({
      'index.html': '<!doctype html><title>x</title>',
      'assets/index.js': 'const a = "Keine Daten verlassen Exemplien.";',
      'assets/contact.js': 'const b = "contact@exemple.test";',
      'assets/propre.js': 'const c = "Passerelle";',
    });

    const erreurs = chercherTextesDansClient(dossier, textes);

    expect(erreurs.map((e) => e.fichier).sort()).toEqual(['assets/contact.js', 'assets/index.js']);
    expect(erreurs.find((e) => e.fichier === 'assets/index.js')?.message).toContain(
      'Keine Daten verlassen Exemplien.',
    );
  });
});

describe('desechapperJs', () => {
  it('desechapper_resout_chaque_forme', () => {
    const cas: [string, string][] = [
      [`f${BARRE}xfcr`, 'für'],
      [`f${BARRE}xFCr`, 'für'],
      [`f${BARRE}u00fcr`, 'für'],
      [`f${BARRE}u00FCr`, 'für'],
      [`f${BARRE}u{fc}r`, 'für'],
      [`f${BARRE}u{FC}r`, 'für'],
      [`${BARRE}uD83D${BARRE}uDE00`, '😀'],
      [`${BARRE}u{1F600}`, '😀'],
      [`a${BARRE}"b`, 'a"b'],
      [`a${BARRE}'b`, "a'b"],
      [`a${BARRE}${BARRE}b`, `a${BARRE}b`],
      [`a${BARRE}/b`, 'a/b'],
      [`a${BARRE}nb`, 'a\nb'],
      [`a${BARRE}tb`, 'a\tb'],
      [`a${BARRE}0b`, 'a\0b'],
      [`a${BARRE}\nb`, 'ab'],
      [`a${BARRE}qb`, 'aqb'],
      [`a${BARRE}rb`, `a${String.fromCharCode(13)}b`],
      [`a${BARRE}bb`, `a${String.fromCharCode(8)}b`],
      [`a${BARRE}fb`, `a${String.fromCharCode(12)}b`],
      [`a${BARRE}vb`, `a${String.fromCharCode(11)}b`],
      [`a${BARRE}${'`'}b`, 'a`b'],
      [`a${BARRE}${String.fromCharCode(13, 10)}b`, 'ab'],
      [`a${BARRE}${String.fromCharCode(0x2028)}b`, 'ab'],
      [`a${BARRE}${String.fromCharCode(0x2029)}b`, 'ab'],
    ];
    for (const [entree, attendu] of cas) expect(desechapperJs(entree), entree).toBe(attendu);
  });

  it('desechapper_lit_de_gauche_a_droite', () => {
    // Une barre échappée, puis `u00fcr` : ce n'est pas un `ü`.
    expect(desechapperJs(`f${BARRE}${BARRE}u00fcr`)).toBe(`f${BARRE}u00fcr`);
  });

  it('desechapper_laisse_une_sequence_mal_formee', () => {
    for (const entree of [`${BARRE}x4`, `${BARRE}u12`, `${BARRE}u{110000}`]) {
      expect(desechapperJs(entree), entree).toBe(entree);
    }
  });
});

describe('chercherTextesDansClient', () => {
  it('lien_symbolique_du_client_refuse', (contexte) => {
    const dossier = dossierServi({ 'index.html': 'x' });
    if (!creerLien(path.join(dossier, 'index.html'), path.join(dossier, 'lien.html')))
      contexte.skip();

    expect(chercherTextesDansClient(dossier, textesDeLExemple())).toEqual([
      { fichier: 'lien.html', lieu: '', message: expect.stringMatching(/lien symbolique/) },
    ]);
  });

  it('exclure_saute_un_dossier_de_la_racine_et_pas_un_lien_ailleurs', (contexte) => {
    const dossier = dossierServi({
      'index.html': 'x',
      'node_modules/m/a.js': `const a = "${TEXTE_AVEC_TREMA}";`,
      'assets/node_modules/b.js': `const a = "${TEXTE_AVEC_TREMA}";`,
    });

    const erreurs = chercherTextesDansClient(dossier, [TEXTE_AVEC_TREMA], ['node_modules']);

    expect(erreurs.map((erreur) => erreur.fichier)).toEqual(['assets/node_modules/b.js']);
    if (!creerLien(path.join(dossier, 'index.html'), path.join(dossier, 'assets', 'lien.html')))
      contexte.skip();
    expect(chercherTextesDansClient(dossier, [TEXTE_AVEC_TREMA], ['node_modules'])).toEqual([
      { fichier: 'assets/lien.html', lieu: '', message: expect.stringMatching(/lien symbolique/) },
    ]);
  });

  it('detecte_un_texte_de_cours_dans_un_fichier_servi', () => {
    const dossier = dossierServi({
      'index.html': '<!doctype html><title>x</title>',
      'assets/index.js': `const a = "${TEXTE_AVEC_TREMA}";`,
    });

    const erreurs = chercherTextesDansClient(dossier, textesDeLExemple());

    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].fichier).toBe('assets/index.js');
    expect(erreurs[0].message).toContain(TEXTE_AVEC_TREMA);
  });

  it('detecte_un_texte_echappe', () => {
    const echappe = TEXTE_AVEC_TREMA.replace(
      /[\u0080-\uffff]/g,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
    expect(echappe).toContain('\\u00fc');
    expect(echappe).not.toContain('ü');
    const dossier = dossierServi({ 'assets/index.js': `const a = "${echappe}";` });

    const erreurs = chercherTextesDansClient(dossier, textesDeLExemple());

    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].fichier).toBe('assets/index.js');
  });

  it('detecte_un_texte_sous_chaque_echappement', () => {
    const formes: [string, string, string][] = [
      ['Fürsorgepflicht', 'ü', `${BARRE}xfc`],
      ['Fürsorgepflicht', 'ü', `${BARRE}xFC`],
      ['Fürsorgepflicht', 'ü', `${BARRE}u00fc`],
      ['Fürsorgepflicht', 'ü', `${BARRE}u00FC`],
      ['Fürsorgepflicht', 'ü', `${BARRE}u{fc}`],
      ['Fürsorgepflicht', 'ü', `${BARRE}u{FC}`],
      ['Lächeln 😀 Emoji', '😀', `${BARRE}uD83D${BARRE}uDE00`],
      ['Lächeln 😀 Emoji', '😀', `${BARRE}u{1F600}`],
      ['Er sagte "Ja" laut', '"', `${BARRE}"`],
      ["Er sagte 'Ja' laut", "'", `${BARRE}'`],
      ['Pfad a/b/c und mehr', '/', `${BARRE}/`],
      ['Zeile eins\nZeile zwei', '\n', `${BARRE}n`],
      ['Spalte eins\tSpalte zwei', '\t', `${BARRE}t`],
      [`Pfad a${BARRE}b und mehr`, BARRE, `${BARRE}${BARRE}`],
    ];
    for (const [texte, brut, ecrit] of formes) {
      const servi = texte.split(brut).join(ecrit);
      expect(servi, servi).not.toBe(texte);
      const dossier = dossierServi({ 'assets/index.js': `const a = "${servi}";` });

      const erreurs = chercherTextesDansClient(dossier, [texte]);

      expect(erreurs, servi).toHaveLength(1);
      expect(erreurs[0].fichier).toBe('assets/index.js');
    }
  });

  it('detecte_un_melange_d_echappements', () => {
    const servi = `const a = "Er sagte: ${BARRE}"Herzkranzgef${BARRE}xe4${BARRE}u00DF${BARRE}"";`;
    expect(servi).toContain(`${BARRE}xe4${BARRE}u00DF`);
    const dossier = dossierServi({ 'assets/index.js': servi });

    const erreurs = chercherTextesDansClient(dossier, ['Er sagte: "Herzkranzgefäß"']);

    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].fichier).toBe('assets/index.js');
  });

  it('un_texte_trouve_n_est_signale_qu_une_fois_par_fichier', () => {
    const dossier = dossierServi({
      'assets/index.js': `"${TEXTE_AVEC_TREMA}" "${TEXTE_AVEC_TREMA.replace('ü', `${BARRE}u00fc`)}"`,
    });

    expect(chercherTextesDansClient(dossier, [TEXTE_AVEC_TREMA])).toHaveLength(1);
  });

  it('un_fichier_binaire_ne_fait_pas_echouer_la_recherche', () => {
    const dossier = dossierServi({});
    fs.mkdirSync(path.join(dossier, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(dossier, 'assets', 'donnees.bin'),
      Buffer.concat([
        Buffer.from([0xff, 0xfe, 0xc3, 0x28, 0x00]),
        Buffer.from(TEXTE_AVEC_TREMA, 'utf8'),
        Buffer.from([0x80, 0xff]),
      ]),
    );

    const erreurs = chercherTextesDansClient(dossier, [TEXTE_AVEC_TREMA]);

    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].fichier).toBe('assets/donnees.bin');
  });

  it('un_fichier_en_utf8_invalide_garde_ses_octets_bruts_cherches', () => {
    // 0xFF est invalide en UTF-8 ; la barre (0x5C) et le `n` du texte forment, une fois décodés,
    // un saut de ligne : seule la recherche dans les octets bruts trouve le texte.
    const texte = 'nervus vagus dexter et sinister';
    const octets = Buffer.concat([Buffer.from([0xff, 0x5c]), Buffer.from(texte, 'utf8')]);
    expect(desechapperJs(octets.toString('utf8')).includes(texte)).toBe(false);
    const dossier = dossierServi({});
    fs.mkdirSync(path.join(dossier, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dossier, 'assets', 'brut.bin'), octets);

    const erreurs = chercherTextesDansClient(dossier, [texte]);

    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].fichier).toBe('assets/brut.bin');
  });

  it('ne_cite_que_les_quarante_premiers_caracteres', () => {
    const texte = 'Seit wann bestehen die Beschwerden des Patienten, genau?';
    const dossier = dossierServi({ 'a.js': texte });

    const erreurs = chercherTextesDansClient(dossier, [texte]);

    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].message).toContain(texte.slice(0, 40));
    expect(erreurs[0].message).not.toContain(texte.slice(0, 41));
  });

  it('detecte_un_texte_recoupe_sur_plusieurs_lignes', () => {
    const texte = 'Erfundener Satz zum Üben in der Küche.';
    const dossier = dossierServi({
      'docs/note.md': 'Erfundener Satz zum\n  Üben in der\r\n\tKüche.',
    });

    const erreurs = chercherTextesDansClient(dossier, [texte]);

    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].fichier).toBe('docs/note.md');
  });

  it('detecte_un_texte_cite_sans_sa_ponctuation_finale', () => {
    const texte = 'Erfundener Satz zum Üben in der Küche?!';
    const dossier = dossierServi({
      'docs/note.md': 'Il cite « Erfundener Satz zum Üben in der Küche »',
    });

    const erreurs = chercherTextesDansClient(dossier, [texte]);

    expect(erreurs).toHaveLength(1);
    expect(erreurs[0].fichier).toBe('docs/note.md');
  });

  it('un_texte_trop_court_sans_sa_ponctuation_n_est_pas_cherche_ainsi', () => {
    const texte = 'Elf Zeichen.';
    expect(texte).toHaveLength(LONGUEUR_MINIMALE_TEXTE);
    const dossier = dossierServi({ 'docs/note.md': 'Elf Zeichen sans point' });

    expect(chercherTextesDansClient(dossier, [texte])).toEqual([]);
    expect(
      chercherTextesDansClient(dossierServi({ 'a.md': 'Elf\nZeichen.' }), [texte]),
    ).toHaveLength(1);
  });

  it('cherche_sans_sa_ponctuation_un_texte_qui_garde_juste_le_seuil', () => {
    const texte = 'Kochen macht.';
    expect(texte.slice(0, -1)).toHaveLength(LONGUEUR_MINIMALE_TEXTE);
    const dossier = dossierServi({ 'docs/note.md': 'Il écrit « Kochen macht » ici.' });

    expect(chercherTextesDansClient(dossier, [texte])).toHaveLength(1);
  });

  it('un_fichier_sans_texte_du_cours_ne_donne_rien_meme_recoupe', () => {
    const dossier = dossierServi({ 'docs/note.md': 'Un autre\n  propos, sans\nrapport.' });

    expect(chercherTextesDansClient(dossier, ['Erfundener Satz zum Üben in der Küche.'])).toEqual(
      [],
    );
  });

  it('ignore_les_textes_courts', () => {
    const dossier = dossierServi({ 'a.js': 'const a = "Musterorgan"; const b = "proto-";' });

    expect(chercherTextesDansClient(dossier, textesDeLExemple())).toEqual([]);
  });

  it('dossier_propre_sans_erreur', () => {
    const dossier = dossierServi({
      'index.html': '<!doctype html><title>Ancrage</title>',
      'assets/index.js': 'console.log("Anmelden und weiter lernen");',
    });

    expect(chercherTextesDansClient(dossier, textesDeLExemple())).toEqual([]);
  });

  it('dossier_absent_donne_une_erreur', () => {
    const racine = creerDepotTemporaire(new Map());
    const absent = path.join(racine, 'dist', 'client');

    const erreurs = chercherTextesDansClient(absent, textesDeLExemple());

    expect(erreurs).toEqual([
      {
        fichier: '.',
        lieu: '',
        message: `dossier du client introuvable : ${path.resolve(absent)}`,
      },
    ]);
  });
});
