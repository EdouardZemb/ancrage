// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it } from 'vitest';
import type { Jeton, TexteAnnote } from '../../../domaine/contenu/modele.js';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import { AllerRetour, contexteDeTest, rendreDansUnCoursVivant } from '../contexte-cours.fixture.js';
import type { ContexteCours } from '../contexte-cours.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { boutons, progression, texteDe, touche } from './onglets.fixture.js';
import { Textes } from './Textes.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;

const BERICHT_1 = 't1000001';
const BERICHT_2 = 't1000002';
const QUESTION_1 = {
  question: 'Was kommt in die Pfanne?',
  reponse: 'Butter',
};

/** Le cours de test dont le module de textes est remplacé par `modifier`. */
function coursAvecTextes(
  modifier: (module: ModuleServiDe<'texte-annote'>) => ModuleServiDe<'texte-annote'>,
): CoursServi {
  const servi = coursServiDeTest();
  return {
    ...servi,
    modules: servi.modules.map((module) =>
      module.type === 'texte-annote' ? modifier(module) : module,
    ),
  };
}

function jeton(n: number): Jeton {
  return { id: `j200000${n}`, forme: `Term${n}`, sens: `Sens ${n}` };
}

/** Un texte de quatre jetons et d'une question : cinq réponses en tout. */
function texteDeCinqReponses(): TexteAnnote {
  return {
    id: 't2000001',
    titre: 'Bericht Fünf',
    texte: 'A [[Term1|Sens 1|j2000001]] [[Term2|Sens 2|j2000002]] ...',
    statut: 'source',
    segments: [
      { texte: 'A ' },
      { jeton: jeton(1) },
      { texte: ' ' },
      { jeton: jeton(2) },
      { texte: ' ' },
      { jeton: jeton(3) },
      { texte: ' ' },
      { jeton: jeton(4) },
      { texte: '.' },
    ],
    questions: [
      {
        id: 'k2000001',
        question: 'Wie war es?',
        reponse: 'Gut',
        distracteurs: ['Schlecht', 'Mittel', 'Unklar'],
      },
    ],
  };
}

function coursDeCinqReponses(reussite: number): CoursServi {
  return coursAvecTextes((module) => ({
    ...module,
    consigne: 'Test.',
    reussite,
    textes: [texteDeCinqReponses()],
  }));
}

function contexteDe(cours?: CoursServi, indice = 0): ContexteCours {
  const contexte = contexteDeTest({ cours });
  contexte.preferences = { ...contexte.preferences, textes: { indice } };
  return contexte;
}

/** La phrase qui pose la question en cours (la consigne, elle, est en `.muted`). */
function invite(): string {
  return document.querySelector('section > p:not(.muted)')?.textContent ?? '';
}

function titre(): string {
  return document.querySelector('section > h2')?.textContent ?? '';
}

function termes(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.report .tk'));
}

/** Tous les jetons du module de textes du contexte. */
function tousLesJetons(contexte: ContexteCours): Jeton[] {
  return (
    contexte.cours.textes?.textes.flatMap((texte) =>
      texte.segments.flatMap((segment) => ('jeton' in segment ? [segment.jeton] : [])),
    ) ?? []
  );
}

/** Traduit le terme en cours : le bon sens ou un autre. */
function traduire(contexte: ContexteCours, juste: boolean): void {
  const forme = /«(.+)»/.exec(invite())?.[1];
  const sens = tousLesJetons(contexte).find((x) => x.forme === forme)?.sens;
  const bouton = boutons().find((x) => (texteDe(x) === sens) === juste);
  if (bouton === undefined) throw new Error(`Aucune option pour « ${forme} »`);
  fireEvent.click(bouton);
}

function repondre(reponse: string, juste: boolean): void {
  const bouton = boutons().find((x) => (texteDe(x) === reponse) === juste);
  if (bouton === undefined) throw new Error(`Aucune option pour ${reponse}`);
  fireEvent.click(bouton);
}

describe('Textes', () => {
  it('jetons_puis_questions_puis_bilan', () => {
    const contexte = contexteDe();
    rendreDansUnCoursVivant(<Textes />, contexte);

    // En tête : la consigne du contenu, puis la phrase de l'interface.
    expect(document.querySelector('section > p.muted')?.textContent).toBe(
      `Rezepte zum Lesen – frei erfunden. ${t.textes_anleitung}`,
    );
    expect(progression()).toBe('0 von 2 Berichten geschafft');
    const choix = screen.getByLabelText(t.textes_choix) as HTMLSelectElement;
    expect(Array.from(choix.options).map((x) => [x.value, x.textContent])).toEqual([
      ['0', 'Bericht 1'],
      ['1', 'Bericht 2'],
    ]);
    expect(choix.value).toBe('0');
    expect(titre()).toBe('Bericht 1');

    // Le texte, et le premier terme à traduire en cours.
    expect(document.querySelector('.report')?.textContent).toBe('Pfanne mit EL und Rösti.');
    expect(termes().map((x) => x.className)).toEqual(['tk cur', 'tk']);
    expect(invite()).toBe('Begriff 1 von 2: Was bedeutet «EL»?');
    expect(document.querySelector('section > p b')?.textContent).toBe('«EL»');
    // Les options viennent de tous les termes du module, pas seulement de ce texte (R8).
    const options = boutons().map(texteDe);
    expect([...options].sort()).toEqual(
      ['Kartoffelgericht', 'Esslöffel', 'Kuchen', 'Teelöffel'].sort(),
    );
    expect(boutons().map((x) => x.querySelector('.mono')?.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);

    // Le bon sens : le terme passe en vert avec sa glose, le suivant est en cours.
    traduire(contexte, true);
    expect(termes().map((x) => x.className)).toEqual(['tk ok', 'tk cur']);
    expect(document.querySelector('.report')?.textContent).toBe(
      'Pfanne mit ELEsslöffel und Rösti.',
    );
    expect(document.querySelector('.report .gloss')?.textContent).toBe('Esslöffel');
    expect(invite()).toBe('Begriff 2 von 2: Was bedeutet «Rösti»?');

    // Un mauvais sens : le terme passe en rouge, avec le bon sens pour glose.
    traduire(contexte, false);
    expect(termes().map((x) => x.className)).toEqual(['tk ok', 'tk ko']);
    expect(
      Array.from(document.querySelectorAll('.report .gloss')).map((x) => x.textContent),
    ).toEqual(['Esslöffel', 'Kartoffelgericht']);

    // Puis la question sur le contenu : la réponse et ses trois distracteurs.
    expect(invite()).toBe('Frage 1 von 1: Was kommt in die Pfanne?');
    expect(document.querySelector('section > p b')?.textContent).toBe('Was kommt in die Pfanne?');
    expect([...boutons().map(texteDe)].sort()).toEqual(
      ['Butter', 'Wasser', 'Mehl', 'Zucker'].sort(),
    );
    expect(termes().every((x) => !x.classList.contains('cur'))).toBe(true);
    // Les termes et les questions ne sont pas journalisés (décision 8).
    expect(contexte.enregistrer).not.toHaveBeenCalled();
    repondre(QUESTION_1.reponse, true);

    // Le bilan : le texte, journalisé une seule fois, avec ses chiffres.
    expect(document.querySelector('.options')).toBeNull();
    expect(document.querySelector('.done h2')?.textContent).toBe(t.textes_abgeschlossen);
    expect(document.querySelector('.done > p')?.textContent).toBe(
      '1 von 2 Begriffen richtig übersetzt · 1 von 1 Inhaltsfragen richtig.',
    );
    const lignes = Array.from(document.querySelectorAll('.done p.muted'));
    expect(lignes.map((x) => x.textContent)).toEqual(['✓ Was kommt in die Pfanne? → Butter']);
    expect(lignes[0].querySelector('b')?.textContent).toBe('Butter');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    // 2 réponses justes sur 3, soit moins de 80 % : le texte n'est pas réussi.
    expect(contexte.enregistrer).toHaveBeenCalledWith(BERICHT_1, false);
    expect(progression()).toBe('0 von 2 Berichten geschafft');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: t.textes_naechster }));
    expect(screen.getByRole('button', { name: t.textes_nochmals })).toBeTruthy();
  });

  it('bilan_tout_juste_et_texte_marque_d_un_crochet', () => {
    const contexte = contexteDe();
    rendreDansUnCoursVivant(<Textes />, contexte);

    traduire(contexte, true);
    traduire(contexte, true);
    repondre(QUESTION_1.reponse, true);

    expect(document.querySelector('.done h2')?.textContent).toBe(t.textes_alles_richtig);
    expect(document.querySelector('.done > p')?.textContent).toBe(
      '2 von 2 Begriffen richtig übersetzt · 1 von 1 Inhaltsfragen richtig.',
    );
    expect(contexte.enregistrer).toHaveBeenCalledWith(BERICHT_1, true);
    // Le sélecteur marque d'un ✓ les textes réussis, et le compte les suit.
    const choix = screen.getByLabelText(t.textes_choix) as HTMLSelectElement;
    expect(Array.from(choix.options).map((x) => x.textContent)).toEqual([
      '✓ Bericht 1',
      'Bericht 2',
    ]);
    expect(progression()).toBe('1 von 2 Berichten geschafft');
  });

  it('bilan_montre_une_question_ratee_avec_sa_bonne_reponse', () => {
    const contexte = contexteDe();
    rendreDansUnCoursVivant(<Textes />, contexte);

    traduire(contexte, true);
    traduire(contexte, true);
    repondre(QUESTION_1.reponse, false);

    expect(document.querySelector('.done > p')?.textContent).toBe(
      '2 von 2 Begriffen richtig übersetzt · 0 von 1 Inhaltsfragen richtig.',
    );
    expect(
      Array.from(document.querySelectorAll('.done p.muted')).map((x) => x.textContent),
    ).toEqual(['✗ Was kommt in die Pfanne? → Butter']);
    expect(document.querySelector('.done h2')?.textContent).toBe(t.textes_abgeschlossen);
  });

  it('texte_journalise_juste_a_80_pourcent', () => {
    // Quatre termes justes et une question fausse : 4 sur 5, soit exactement 80 %.
    const juste = contexteDe(coursDeCinqReponses(0.8));
    rendreDansUnCoursVivant(<Textes />, juste);
    for (let i = 0; i < 4; i++) traduire(juste, true);
    repondre('Gut', false);
    expect(juste.enregistrer).toHaveBeenCalledTimes(1);
    expect(juste.enregistrer).toHaveBeenCalledWith('t2000001', true);
    cleanup();

    // Une réponse juste de moins : 3 sur 5, sous le seuil.
    const faux = contexteDe(coursDeCinqReponses(0.8));
    rendreDansUnCoursVivant(<Textes />, faux);
    for (let i = 0; i < 3; i++) traduire(faux, true);
    traduire(faux, false);
    repondre('Gut', false);
    expect(faux.enregistrer).toHaveBeenCalledTimes(1);
    expect(faux.enregistrer).toHaveBeenCalledWith('t2000001', false);
  });

  it('le_seuil_de_reussite_vient_du_contenu', () => {
    // 3 sur 5 : réussi à 60 %, pas à 80 %.
    for (const [reussite, attendu] of [
      [0.6, true],
      [0.8, false],
    ] as const) {
      const contexte = contexteDe(coursDeCinqReponses(reussite));
      rendreDansUnCoursVivant(<Textes />, contexte);
      for (let i = 0; i < 3; i++) traduire(contexte, true);
      traduire(contexte, false);
      repondre('Gut', false);
      expect(contexte.enregistrer).toHaveBeenCalledWith('t2000001', attendu);
      cleanup();
    }

    // Tout juste est exigé à 100 %, et suffit.
    const exigeant = contexteDe(coursDeCinqReponses(1));
    rendreDansUnCoursVivant(<Textes />, exigeant);
    for (let i = 0; i < 4; i++) traduire(exigeant, true);
    repondre('Gut', true);
    expect(exigeant.enregistrer).toHaveBeenCalledWith('t2000001', true);
  });

  it('nochmals_et_naechster_bericht', () => {
    const contexte = contexteDe();
    rendreDansUnCoursVivant(<Textes />, contexte);
    traduire(contexte, true);
    traduire(contexte, true);
    repondre(QUESTION_1.reponse, true);
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);

    // « Nochmals » : le même texte, repris au premier terme, sans rien journaliser de plus.
    fireEvent.click(screen.getByRole('button', { name: t.textes_nochmals }));
    expect(titre()).toBe('Bericht 1');
    expect(document.querySelector('.done')).toBeNull();
    expect(termes().map((x) => x.className)).toEqual(['tk cur', 'tk']);
    expect(invite()).toBe('Begriff 1 von 2: Was bedeutet «EL»?');
    expect(document.querySelector('.report')?.textContent).toBe('Pfanne mit EL und Rösti.');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    // Un texte déjà réussi garde sa coche.
    expect((screen.getByLabelText(t.textes_choix) as HTMLSelectElement).value).toBe('0');

    traduire(contexte, true);
    traduire(contexte, false);
    repondre(QUESTION_1.reponse, true);
    expect(contexte.enregistrer).toHaveBeenCalledTimes(2);
    expect(contexte.enregistrer).toHaveBeenLastCalledWith(BERICHT_1, false);

    // « Nächster Bericht » : le texte suivant, retenu dans les préférences.
    fireEvent.click(screen.getByRole('button', { name: t.textes_naechster }));
    expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
      ...contexte.preferences,
      textes: { indice: 1 },
    });
    expect(titre()).toBe('Bericht 2');
    expect((screen.getByLabelText(t.textes_choix) as HTMLSelectElement).value).toBe('1');
    expect(document.querySelector('.report')?.textContent).toBe('TL, Wähe.');
    expect(invite()).toBe('Begriff 1 von 2: Was bedeutet «TL»?');

    // Le dernier texte rend le premier.
    traduire(contexte, true);
    traduire(contexte, true);
    fireEvent.click(screen.getByRole('button', { name: t.textes_naechster }));
    expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
      ...contexte.preferences,
      textes: { indice: 0 },
    });
    expect(titre()).toBe('Bericht 1');
    expect(invite()).toBe('Begriff 1 von 2: Was bedeutet «EL»?');
  });

  it('naechster_bericht_avec_un_seul_texte_le_recommence', () => {
    const contexte = contexteDe(
      coursAvecTextes((module) => ({ ...module, textes: module.textes.slice(0, 1) })),
    );
    rendreDansUnCoursVivant(<Textes />, contexte);
    traduire(contexte, true);
    traduire(contexte, true);
    repondre(QUESTION_1.reponse, true);

    fireEvent.click(screen.getByRole('button', { name: t.textes_naechster }));

    expect(document.querySelector('.done')).toBeNull();
    expect(invite()).toBe('Begriff 1 von 2: Was bedeutet «EL»?');
    expect(termes().map((x) => x.className)).toEqual(['tk cur', 'tk']);
  });

  it('texte_sans_question_journalise_apres_le_dernier_terme', () => {
    const contexte = contexteDe(undefined, 1);
    rendreDansUnCoursVivant(<Textes />, contexte);
    expect(titre()).toBe('Bericht 2');

    traduire(contexte, true);
    expect(contexte.enregistrer).not.toHaveBeenCalled();
    traduire(contexte, true);

    // Aucune question à poser : on passe au bilan.
    expect(document.querySelector('.options')).toBeNull();
    expect(document.querySelector('.done h2')?.textContent).toBe(t.textes_alles_richtig);
    expect(document.querySelector('.done > p')?.textContent).toBe(
      '2 von 2 Begriffen richtig übersetzt · 0 von 0 Inhaltsfragen richtig.',
    );
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(contexte.enregistrer).toHaveBeenCalledWith(BERICHT_2, true);
  });

  it('texte_sans_terme_commence_par_ses_questions', () => {
    const contexte = contexteDe(
      coursAvecTextes((module) => ({
        ...module,
        textes: [
          {
            ...module.textes[0],
            segments: [{ texte: 'Nur Text.' }],
          },
        ],
      })),
    );
    rendreDansUnCoursVivant(<Textes />, contexte);

    expect(invite()).toBe('Frage 1 von 1: Was kommt in die Pfanne?');
    expect(termes()).toHaveLength(0);
    repondre(QUESTION_1.reponse, true);

    expect(document.querySelector('.done h2')?.textContent).toBe(t.textes_alles_richtig);
    expect(document.querySelector('.done > p')?.textContent).toBe(
      '0 von 0 Begriffen richtig übersetzt · 1 von 1 Inhaltsfragen richtig.',
    );
    expect(contexte.enregistrer).toHaveBeenCalledWith(BERICHT_1, true);
  });

  it('texte_sans_terme_ni_question_n_est_pas_journalise', () => {
    const contexte = contexteDe(
      coursAvecTextes((module) => ({
        ...module,
        textes: [{ ...module.textes[0], segments: [{ texte: 'Nichts.' }], questions: [] }],
      })),
    );
    rendreDansUnCoursVivant(<Textes />, contexte);

    expect(document.querySelector('.report')?.textContent).toBe('Nichts.');
    expect(document.querySelector('.done')).not.toBeNull();
    expect(contexte.enregistrer).not.toHaveBeenCalled();
  });

  it('module_sans_texte_affiche_un_etat_vide_sans_planter', () => {
    const contexte = contexteDe(coursAvecTextes((module) => ({ ...module, textes: [] })));
    rendreDansUnCoursVivant(<Textes />, contexte);

    expect(screen.getByText(t.onglet_vide)).toBeTruthy();
    expect(progression()).toBe('0 von 0 Berichten geschafft');
    expect(document.querySelector('.report')).toBeNull();
    touche('1');
    expect(contexte.enregistrer).not.toHaveBeenCalled();
  });

  it('sans_consigne_seule_la_phrase_de_l_interface', () => {
    const contexte = contexteDe(
      coursAvecTextes(({ consigne: _consigne, ...module }) => ({ ...module })),
    );
    rendreDansUnCoursVivant(<Textes />, contexte);

    expect(document.querySelector('section > p.muted')?.textContent).toBe(t.textes_anleitung);
  });

  it('texte_choisi_dans_la_liste_et_retenu_dans_les_preferences', () => {
    const contexte = contexteDe();
    rendreDansUnCoursVivant(<Textes />, contexte);
    traduire(contexte, true);

    fireEvent.change(screen.getByLabelText(t.textes_choix), { target: { value: '1' } });

    expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
      ...contexte.preferences,
      textes: { indice: 1 },
    });
    expect(titre()).toBe('Bericht 2');
    expect(invite()).toBe('Begriff 1 von 2: Was bedeutet «TL»?');
    expect(termes().map((x) => x.className)).toEqual(['tk cur', 'tk']);
  });

  it('indice_au_dela_du_dernier_texte_prend_le_dernier', () => {
    const contexte = contexteDe(undefined, 9);
    rendreDansUnCoursVivant(<Textes />, contexte);

    expect(titre()).toBe('Bericht 2');
    expect((screen.getByLabelText(t.textes_choix) as HTMLSelectElement).value).toBe('1');
  });

  it('touches_1_a_4_pour_les_termes_et_les_questions_pas_pour_le_bilan', () => {
    const contexte = contexteDe();
    rendreDansUnCoursVivant(<Textes />, contexte);

    touche('5');
    touche('a');
    expect(termes()[0].className).toBe('tk cur');

    const premier = boutons().findIndex((x) => {
      const forme = /«(.+)»/.exec(invite())?.[1];
      return texteDe(x) === tousLesJetons(contexte).find((j) => j.forme === forme)?.sens;
    });
    touche(String(premier + 1));
    expect(termes()[0].className).toBe('tk ok');
    touche('1');
    expect(invite()).toMatch(/^Frage 1 von 1/);
    touche('1');
    expect(document.querySelector('.done')).not.toBeNull();
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);

    // Le bilan n'écoute plus les chiffres.
    touche('1');
    touche('2');
    expect(contexte.enregistrer).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.done')).not.toBeNull();
  });

  it('texte_en_cours_conserve_apres_un_aller_retour_d_onglet', () => {
    const contexte = contexteDe();
    rendreDansUnCoursVivant(
      <AllerRetour>
        <Textes />
      </AllerRetour>,
      contexte,
    );
    traduire(contexte, true);
    const options = boutons().map(texteDe);

    fireEvent.click(screen.getByTestId('ailleurs'));
    expect(document.querySelector('.report')).toBeNull();
    fireEvent.click(screen.getByTestId('retour'));

    // Le même terme en cours, les mêmes options, le premier terme déjà traduit.
    expect(invite()).toBe('Begriff 2 von 2: Was bedeutet «Rösti»?');
    expect(termes().map((x) => x.className)).toEqual(['tk ok', 'tk cur']);
    expect(boutons().map(texteDe)).toEqual(options);
    expect(contexte.enregistrer).not.toHaveBeenCalled();
  });
});
