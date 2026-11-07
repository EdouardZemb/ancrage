// @vitest-environment happy-dom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAPITRE_1,
  CHAPITRE_2,
  coursAvecReglages,
  coursSans,
  coursServiDeTest,
} from '../../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../../domaine/cours/servi.js';
import { FAUX, VRAI } from '../../../domaine/feuilles/correction.js';
import { hasardDeterministe } from '../../../domaine/hasard.js';
import type { SeanceCartes } from '../../../domaine/seances/cartes.js';
import {
  composerExamen,
  corrigerExamen,
  type Examen as ExamenComposee,
  groupeDeQuestion,
  type QuestionExamen,
  type ReponseExamen,
  reponseAttendue,
} from '../../../domaine/seances/examen.js';
import { enAttente } from '../../attente.fixture.js';
import {
  AllerRetour,
  contexteDeTest,
  rendreDansLeCours,
  rendreDansUnCoursVivant,
} from '../contexte-cours.fixture.js';
import { CLE_SEANCE_IMPOSEE, type ContexteCours, ContexteDuCours } from '../contexte-cours.js';
import type { Preferences } from '../preferences.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { Examen } from './Examen.js';
import { progression, texteDe } from './onglets.fixture.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const t = TEXTES_COURS.de;

const MODULES_ANNEXES = ['morphologie', 'schema', 'texte-annote', 'exercices', 'feuille'];
/** Ce que la case « avec modules » mêle aux questions : pas les mots, qui viennent avec leurs chapitres. */
const MODULES_MELES = ['schema', 'texte-annote', 'exercices', 'feuille'];

/** Le contexte d'un examen de 20 questions (la taille par défaut du contenu est 30). */
function contexteDe(
  options: { cours?: CoursServi; examen?: Partial<Preferences['examen']> } = {},
): ContexteCours {
  const contexte = contexteDeTest({ cours: options.cours });
  contexte.preferences = {
    ...contexte.preferences,
    examen: { ...contexte.preferences.examen, taille: 20, ...options.examen },
  };
  return contexte;
}

/** L'examen que l'onglet compose au départ : même cours, mêmes choix, même hasard. */
function composee(
  contexte: ContexteCours,
  surcharge: Partial<Preferences['examen']> = {},
): ExamenComposee {
  return composerExamen(
    contexte.cours,
    contexte.etats,
    { ...contexte.preferences.examen, ...surcharge },
    hasardDeterministe(1),
  );
}

type Choix = 'juste' | 'fausse' | 'sauter';
type Plan = (question: QuestionExamen, rang: number) => Choix;

/** Ce qu'un choix répond à une question : l'indice de l'option, la saisie, ou rien. */
function reponseDe(question: QuestionExamen, choix: Choix): ReponseExamen {
  if (choix === 'sauter') return undefined;
  const attendue = reponseAttendue(question);
  if (question.options !== undefined) {
    return choix === 'juste'
      ? question.options.indexOf(attendue)
      : question.options.findIndex((option) => option !== attendue);
  }
  return choix === 'juste' ? attendue : 'xyz';
}

/** L'énoncé d'une question, tel que l'écran l'affiche. */
function enonceAttendu(question: QuestionExamen): string {
  switch (question.genre) {
    case 'carte':
      return question.unite.question;
    case 'mot':
      return `Was bedeutet «${question.mot.mot}»?`;
    case 'schema':
      return `${question.schema.titre}: Wie heisst Nummer ${question.point + 1}?`;
    case 'jeton':
      return `Was bedeutet «${question.jeton.forme}»?`;
    case 'exercice':
      return question.exercice.invite;
    case 'feuille': {
      const { element } = question;
      switch (element.genre) {
        case 'qcm':
          return element.question.question;
        case 'vrai-faux':
          return element.affirmation.affirmation;
        case 'trous':
          return element.phrase.texte;
        case 'orthographe':
          return `Richtig schreiben: ${element.mot.fautif}`;
      }
    }
  }
}

/** Ce que l'écran montre d'une option : un vrai/faux en « Richtig » ou « Falsch » (F1-D7). */
function libelleAttendu(option: string | undefined): string | undefined {
  return option === VRAI ? t.feuille_richtig : option === FAUX ? t.feuille_falsch : option;
}

function cliquer(nom: string): void {
  fireEvent.click(screen.getByRole('button', { name: nom }));
}

function demarrer(): void {
  cliquer(t.examen_starten);
}

function minuteur(): HTMLElement | null {
  return document.querySelector('.timer');
}

function boutonsDOptions(): HTMLButtonElement[] {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('.options button'));
}

function champ(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('form.typed input');
}

function saisir(texte: string): void {
  const saisie = champ() as HTMLInputElement;
  fireEvent.input(saisie, { target: { value: texte } });
  fireEvent.submit(saisie.closest('form') as HTMLFormElement);
}

function sauter(): void {
  fireEvent.click(
    screen.getByRole('button', {
      name: (nom) => nom === t.examen_ueberspringen || nom === t.examen_zur_abgabe,
    }),
  );
}

function zurueck(): void {
  cliquer(t.examen_zurueck);
}

function enonce(): string {
  return document.querySelector('.card .front')?.textContent ?? '';
}

function etiquette(): string {
  return document.querySelector('.card .kind')?.textContent ?? '';
}

/** Répond à la question affichée, comme le fait la personne. */
function repondre(question: QuestionExamen, choix: Choix): void {
  const reponse = reponseDe(question, choix);
  if (reponse === undefined) sauter();
  else if (typeof reponse === 'number') fireEvent.click(boutonsDOptions()[reponse]);
  else saisir(reponse);
}

/** Laisse passer le temps, l'écran regarde. */
function avancer(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** Passe toutes les questions ; l'examen attend ensuite la confirmation de la remise. */
function passer(examen: ExamenComposee, plan: Plan): void {
  examen.questions.forEach((question, rang) => {
    repondre(question, plan(question, rang));
  });
}

/** Les réponses d'un plan, telles que `corrigerExamen` les attend. */
function reponsesDuPlan(examen: ExamenComposee, plan: Plan): ReponseExamen[] {
  return examen.questions.map((question, rang) => reponseDe(question, plan(question, rang)));
}

/** Les `n` premières questions justes, les autres sautées. */
const lesPremieresJustes =
  (n: number): Plan =>
  (_, rang) =>
    rang < n ? 'juste' : 'sauter';

/** Tout est sauté : la remise est celle d'un examen vide. */
function toutSauter(): void {
  for (let i = 0; i < 20; i++) sauter();
}

/** Les lignes du tableau qui suit le titre. */
function lignes(titre: string): HTMLElement[] {
  const entete = screen.getByRole('heading', { name: titre });
  const table = entete.nextElementSibling as HTMLElement;
  return Array.from(table.querySelectorAll<HTMLElement>(':scope > div'));
}

function note(): string {
  return document.querySelector('.grade')?.textContent ?? '';
}

function verdict(): string {
  return document.querySelector('.pill')?.textContent ?? '';
}

/** Le contenu de la séance imposée, lu après coup dans la mémoire du contexte. */
function seanceImposee(contexte: ContexteCours): SeanceCartes | undefined {
  let lue: SeanceCartes | undefined;
  function Sonde() {
    [lue] = contexte.useEtatDOnglet<SeanceCartes | undefined>(CLE_SEANCE_IMPOSEE, () => undefined);
    return null;
  }
  rendreDansLeCours(<Sonde />, contexte).unmount();
  return lue;
}

const DEPART = { now: new Date('2026-10-17T10:00:00+02:00') };

describe('Examen', () => {
  describe('reglages', () => {
    it('reglages_puis_vingt_questions', () => {
      const contexte = contexteDeTest();
      rendreDansUnCoursVivant(<Examen />, contexte);

      expect(screen.getByRole('heading', { name: t.examen_titre })).toBeTruthy();
      expect(
        screen.getByText(
          'Gemischte Fragen aus den gewählten Kapiteln: Multiple Choice in beide Richtungen, ' +
            'Fachbegriffe eintippen und Wörter zerlegen. Die Lösungen siehst du erst am Ende. ' +
            'Note nach Schweizer Skala: 6 = beste Note, ab 4 bestanden.',
        ),
      ).toBeTruthy();
      // Un choix par chapitre du cours, tous cochés ; la taille par défaut vient du contenu.
      const chapitres = screen.getAllByRole('checkbox', { name: /^\d · / });
      expect(chapitres.map((c) => (c as HTMLInputElement).checked)).toEqual([true, true]);
      expect(screen.getByRole('checkbox', { name: '1 · Anfangskapitel' })).toBeTruthy();
      expect(screen.getByRole('checkbox', { name: '2 · Vorsilben' })).toBeTruthy();
      const taille = screen.getByRole('combobox', { name: t.examen_fragen }) as HTMLSelectElement;
      expect(taille.value).toBe('30');
      expect(Array.from(taille.options).map((o) => o.textContent)).toEqual(['20', '30', '50']);
      const chrono = screen.getByRole('checkbox', { name: 'mit Zeitlimit (45 s pro Frage)' });
      expect((chrono as HTMLInputElement).checked).toBe(true);
      const modules = screen.getByRole('checkbox', {
        name: 'mit Schemata, Berichten, Grammatik und Arbeitsblättern',
      });
      expect((modules as HTMLInputElement).checked).toBe(true);
      const depart = screen.getByRole('button', { name: t.examen_starten }) as HTMLButtonElement;
      expect(depart.disabled).toBe(false);
      expect(minuteur()).toBeNull();

      // Vingt questions : le choix est gardé dans les préférences, puis l'examen les pose.
      fireEvent.change(taille, { target: { value: '20' } });
      expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
        ...contexte.preferences,
        examen: { ...contexte.preferences.examen, taille: 20 },
      });
      expect(composee(contexte, { taille: 20 }).questions).toHaveLength(20);
      demarrer();

      expect(progression()).toBe('Frage 1 / 20 · 0 beantwortet');
      expect(minuteur()?.textContent).toBe('15:00');
      expect(screen.queryByRole('button', { name: t.examen_starten })).toBeNull();
      expect(
        (screen.getByRole('button', { name: t.examen_zurueck }) as HTMLButtonElement).disabled,
      ).toBe(true);
      // Dix-neuf fois « Überspringen », puis « Zur Abgabe » à la dernière.
      for (let i = 2; i <= 20; i++) {
        sauter();
        expect(progression()).toBe(`Frage ${i} / 20 · 0 beantwortet`);
      }
      expect(screen.queryByRole('button', { name: t.examen_ueberspringen })).toBeNull();
      expect(screen.getByRole('button', { name: t.examen_zur_abgabe })).toBeTruthy();
      expect(screen.queryByText(t.examen_jetzt_abgeben)).toBeNull();
      sauter();
      expect(screen.getByText(t.examen_jetzt_abgeben)).toBeTruthy();
    });

    it('chapitres_chrono_et_modules_sont_gardes_dans_les_preferences', () => {
      const contexte = contexteDeTest();
      rendreDansUnCoursVivant(<Examen />, contexte);
      const base = contexte.preferences.examen;
      const derniere = () => vi.mocked(contexte.changerPreferences).mock.lastCall?.[0].examen;

      fireEvent.click(screen.getByRole('checkbox', { name: '1 · Anfangskapitel' }));
      expect(derniere()).toEqual({ ...base, chapitres: [CHAPITRE_2] });
      fireEvent.click(screen.getByRole('checkbox', { name: /Zeitlimit/ }));
      expect(derniere()).toEqual({ ...base, chapitres: [CHAPITRE_2], chrono: false });
      fireEvent.click(screen.getByRole('checkbox', { name: /Schemata/ }));
      expect(derniere()).toEqual({
        ...base,
        chapitres: [CHAPITRE_2],
        chrono: false,
        avecModules: false,
      });
      // Le chapitre rendu reprend sa place dans l'ordre du cours.
      fireEvent.click(screen.getByRole('checkbox', { name: '1 · Anfangskapitel' }));
      expect(derniere()?.chapitres).toEqual([CHAPITRE_1, CHAPITRE_2]);
    });

    it('sans_chapitre_pas_de_depart_alle_et_keine', () => {
      const contexte = contexteDeTest();
      rendreDansUnCoursVivant(<Examen />, contexte);
      const depart = screen.getByRole('button', { name: t.examen_starten }) as HTMLButtonElement;
      const coches = () =>
        screen
          .getAllByRole('checkbox', { name: /^\d · / })
          .map((c) => (c as HTMLInputElement).checked);
      expect(depart.disabled).toBe(false);

      cliquer(t.examen_keine);

      expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
        ...contexte.preferences,
        examen: { ...contexte.preferences.examen, chapitres: [] },
      });
      expect(coches()).toEqual([false, false]);
      expect(depart.disabled).toBe(true);
      // Un bouton désactivé ne démarre rien.
      fireEvent.click(depart);
      expect(screen.queryByText(/beantwortet/)).toBeNull();

      cliquer(t.examen_alle);

      expect(contexte.changerPreferences).toHaveBeenLastCalledWith({
        ...contexte.preferences,
        examen: { ...contexte.preferences.examen, chapitres: [CHAPITRE_1, CHAPITRE_2] },
      });
      expect(coches()).toEqual([true, true]);
      expect(depart.disabled).toBe(false);
    });

    it('seuls_les_chapitres_coches_sont_poses', () => {
      const contexte = contexteDe({ examen: { chapitres: [CHAPITRE_2] } });
      rendreDansUnCoursVivant(<Examen />, contexte);
      expect(
        screen
          .getAllByRole('checkbox', { name: /^\d · / })
          .map((c) => (c as HTMLInputElement).checked),
      ).toEqual([false, true]);

      demarrer();

      const attendue = composee(contexte);
      expect(progression()).toBe(`Frage 1 / ${attendue.questions.length} · 0 beantwortet`);
      // Chaque carte posée est du chapitre 2 ; il y en a, et les mots du Baukasten aussi.
      const etiquettes = attendue.questions.map(() => {
        const vue = etiquette();
        sauter();
        return vue;
      });
      const cartes = etiquettes.filter((vue) => vue.includes('Kap.'));
      expect(cartes.length).toBeGreaterThan(0);
      expect(cartes.every((vue) => vue.endsWith('Kap. 2'))).toBe(true);
    });

    it('modules_decoches_pas_de_question_de_module', () => {
      const contexte = contexteDe({ examen: { avecModules: false } });
      const attendue = composee(contexte);
      // Sans les modules, le tirage est autre, et plus court que les 20 demandées.
      expect(attendue.questions.map(enonceAttendu)).not.toEqual(
        composee(contexte, { avecModules: true }).questions.map(enonceAttendu),
      );
      expect(attendue.questions.length).toBeLessThan(20);
      rendreDansUnCoursVivant(<Examen />, contexte);

      demarrer();

      expect(progression()).toBe(`Frage 1 / ${attendue.questions.length} · 0 beantwortet`);
      for (const question of attendue.questions) {
        expect(enonce()).toBe(enonceAttendu(question));
        expect(['carte', 'mot']).toContain(question.genre);
        sauter();
      }
    });

    it('modules_proposes_seulement_si_le_cours_en_a', () => {
      const sans = rendreDansLeCours(
        <Examen />,
        contexteDeTest({ cours: coursSans(...MODULES_ANNEXES) }),
      );
      expect(screen.queryByRole('checkbox', { name: t.examen_avec_modules })).toBeNull();
      // Les autres choix y sont.
      expect(screen.getByRole('checkbox', { name: /Zeitlimit/ })).toBeTruthy();
      sans.unmount();

      // Les mots de la morphologie viennent avec leurs chapitres : la case n'y change rien, elle
      // n'est pas proposée pour elle seule.
      const motsSeuls = rendreDansLeCours(
        <Examen />,
        contexteDeTest({ cours: coursSans(...MODULES_MELES) }),
      );
      expect(screen.queryByRole('checkbox', { name: t.examen_avec_modules })).toBeNull();
      motsSeuls.unmount();

      // Un seul schéma, texte annoté, module d'exercices ou feuille suffit.
      for (const garde of MODULES_MELES) {
        const autres = MODULES_ANNEXES.filter((type) => type !== garde);
        const rendu = rendreDansLeCours(
          <Examen />,
          contexteDeTest({ cours: coursSans(...autres) }),
        );
        expect(screen.getByRole('checkbox', { name: t.examen_avec_modules }), garde).toBeTruthy();
        rendu.unmount();
      }
    });

    it('sans_module_a_meler_le_choix_garde_de_les_meler_ne_change_pas_le_tirage', () => {
      // Aucun module annexe, puis la seule morphologie : la case n'est pas là, et un choix gardé
      // d'avant (ou d'un autre contenu) ne change pas le tirage.
      for (const sans of [MODULES_ANNEXES, MODULES_MELES]) {
        const contexte = contexteDe({ cours: coursSans(...sans), examen: { avecModules: true } });
        const sansModules = composee(contexte, { avecModules: false });
        // Le tirage avec modules lit un nombre de plus par question : il serait autre.
        expect(composee(contexte, { avecModules: true }).questions.map(enonceAttendu)).not.toEqual(
          sansModules.questions.map(enonceAttendu),
        );
        rendreDansUnCoursVivant(<Examen />, contexte);

        demarrer();

        expect(enonce()).toBe(enonceAttendu(sansModules.questions[0]));
        cleanup();
      }
    });

    it('tailles_duree_et_note_viennent_du_contenu', () => {
      const cours = coursAvecReglages({
        tailles: [10, 25],
        tailleParDefaut: 25,
        secondesParQuestion: 30,
        noteSuffisante: 4.5,
      });
      rendreDansLeCours(<Examen />, contexteDeTest({ cours }));

      const taille = screen.getByRole('combobox', { name: t.examen_fragen }) as HTMLSelectElement;
      expect(Array.from(taille.options).map((o) => o.textContent)).toEqual(['10', '25']);
      expect(taille.value).toBe('25');
      expect(screen.getByRole('checkbox', { name: 'mit Zeitlimit (30 s pro Frage)' })).toBeTruthy();
      expect(screen.getByText(/6 = beste Note, ab 4\.5 bestanden\.$/)).toBeTruthy();
    });

    it('un_choix_sans_question_ne_demarre_pas', () => {
      const servi = coursServiDeTest();
      const cours: CoursServi = {
        ...servi,
        modules: servi.modules.map((module) =>
          module.type === 'cartes' && module.id === CHAPITRE_1 ? { ...module, cartes: [] } : module,
        ),
      };
      const contexte = contexteDe({
        cours,
        examen: { chapitres: [CHAPITRE_1], avecModules: false },
      });
      rendreDansUnCoursVivant(<Examen />, contexte);
      expect(screen.queryByText(t.onglet_vide)).toBeNull();

      demarrer();

      expect(screen.getByText(t.onglet_vide)).toBeTruthy();
      expect(screen.getByRole('button', { name: t.examen_starten })).toBeTruthy();
      expect(screen.queryByText(/beantwortet/)).toBeNull();
      expect(contexte.enregistrerExamen).not.toHaveBeenCalled();
    });

    it('sans_module_examen_rien_n_est_affiche', () => {
      const { container } = rendreDansLeCours(
        <Examen />,
        contexteDeTest({ cours: coursSans('examen') }),
      );

      expect(container.textContent).toBe('');
    });
  });

  describe('questions', () => {
    it('chaque_genre_de_question_a_son_etiquette_et_son_enonce', () => {
      const contexte = contexteDe({ examen: { taille: 30 } });
      const typesDeCarte = contexte.cours.cours.typesDeCarte;
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();

      const genres = new Set<string>();
      for (const question of attendue.questions) {
        genres.add(question.genre);
        expect(enonce()).toBe(enonceAttendu(question));
        switch (question.genre) {
          case 'carte': {
            const { unite } = question;
            const sens =
              question.options === undefined
                ? t.examen_eintippen
                : unite.sens === 'direct'
                  ? t.sens_direct
                  : t.sens_inverse;
            expect(etiquette()).toBe(
              `${typesDeCarte[unite.type]} · ${sens} · Kap. ${unite.numero}`,
            );
            break;
          }
          case 'mot':
            expect(etiquette()).toBe('Wort zerlegen');
            break;
          case 'schema':
            expect(etiquette()).toBe('Schema');
            // Le dessin du schéma, le point demandé mis en avant.
            expect(document.querySelector('svg.sv')?.getAttribute('aria-label')).toBe(
              question.schema.titre,
            );
            expect(document.querySelectorAll('svg.sv .mk.cur')).toHaveLength(1);
            expect(document.querySelector('svg.sv .mk.cur text')?.textContent).toBe(
              String(question.point + 1),
            );
            break;
          case 'jeton':
            expect(etiquette()).toBe(`Bericht · ${question.texte.titre}`);
            break;
          case 'exercice':
            expect(etiquette()).toBe(question.famille.libelle);
            break;
          case 'feuille':
            expect(etiquette()).toBe(question.feuille.titre);
            break;
        }
        if (question.genre !== 'schema') expect(document.querySelector('svg.sv')).toBeNull();
        // À choix : une option par proposition ; à taper : un champ, pas d'option.
        if (question.options === undefined) {
          expect(champ()).toBeTruthy();
          expect(boutonsDOptions()).toHaveLength(0);
        } else {
          expect(champ()).toBeNull();
          expect(boutonsDOptions().map(texteDe)).toEqual(question.options.map(libelleAttendu));
        }
        sauter();
      }
      // Les six genres, dont une carte à taper, sont posés par ce tirage.
      expect([...genres].sort()).toEqual([
        'carte',
        'exercice',
        'feuille',
        'jeton',
        'mot',
        'schema',
      ]);
    });

    it('etiquette_et_vrai_faux_dans_l_epreuve', () => {
      // Un tirage qui ne pose que des fiches : les cinq éléments tirables de la feuille.
      const cours = coursAvecReglages({
        tirage: {
          schema: 0,
          texte: 0,
          exercice: 0,
          feuille: 1,
          mot: 0,
          direct: 0.45,
          aTaper: 0.72,
        },
      });
      const contexte = contexteDe({ cours, examen: { avecModules: true, chrono: false } });
      const attendue = composee(contexte);
      expect(attendue.questions.map((q) => q.genre)).toEqual(Array(5).fill('feuille'));
      rendreDansUnCoursVivant(<Examen />, contexte);
      expect(
        screen.getByRole('checkbox', {
          name: 'mit Schemata, Berichten, Grammatik und Arbeitsblättern',
        }),
      ).toBeTruthy();
      demarrer();

      // Tout est juste, sauf les vrai/faux, où l'on choisit l'autre bouton.
      const plan: Plan = (question) =>
        question.genre === 'feuille' && question.element.genre === 'vrai-faux' ? 'fausse' : 'juste';
      const affirmations: QuestionExamen[] = [];
      for (const question of attendue.questions) {
        if (question.genre !== 'feuille') throw new Error(`genre inattendu : ${question.genre}`);
        // L'étiquette est le titre de la feuille.
        expect(etiquette()).toBe('Unit 1 – Übungsblatt');
        expect(enonce()).toBe(enonceAttendu(question));
        const { genre } = question.element;
        if (genre === 'vrai-faux') {
          // Le domaine parle en codes ; l'écran dit « Richtig » et « Falsch » (F1-D7).
          expect(boutonsDOptions().map(texteDe)).toEqual(['Richtig', 'Falsch']);
          affirmations.push(question);
        }
        // Une phrase sans liste et un mot à corriger se tapent.
        expect(champ() !== null, genre).toBe(genre === 'trous' || genre === 'orthographe');
        repondre(question, plan(question, 0));
      }
      expect(affirmations).toHaveLength(2);
      cliquer(t.examen_abgeben);

      // Les fiches font une ligne, sous le nom de l'onglet.
      expect(lignes(t.examen_nach_kapitel).map((ligne) => ligne.textContent)).toEqual([
        'Arbeitsblätter3 / 5 richtig60 %',
      ]);
      // Les fautes disent « Richtig » et « Falsch », pas les codes.
      expect(
        lignes('Fehler (2)').map((ligne) =>
          Array.from(ligne.children).map((cellule) => cellule.textContent),
        ),
      ).toEqual(
        affirmations.map((q) => [
          enonceAttendu(q),
          libelleAttendu(reponseAttendue(q)),
          libelleAttendu(q.options?.[reponseDe(q, 'fausse') as number]),
        ]),
      );
      expect(screen.queryByText(VRAI)).toBeNull();
      expect(screen.queryByText(FAUX)).toBeNull();
      // Chaque élément reçoit sa réponse sous son propre identifiant (F1-D3).
      const correction = corrigerExamen(contexte.cours, attendue, reponsesDuPlan(attendue, plan));
      expect(correction.reponses.map((r) => r.unite).sort()).toEqual([
        'fb000007',
        'fb000008',
        'fb000009',
        'fb000011',
        'fb000012',
      ]);
      expect(contexte.enregistrerExamen).toHaveBeenCalledWith(
        expect.objectContaining({ points: 3, questions: 5 }),
        correction.reponses,
      );
    });

    it('une_question_longue_est_en_plus_petit', () => {
      const contexte = contexteDe({ examen: { taille: 30 } });
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();

      const classes = attendue.questions.map(() => {
        const vue = [enonce().length, document.querySelector('.card .front')?.className];
        sauter();
        return vue;
      });

      expect(classes.some(([longueur]) => (longueur as number) > 34)).toBe(true);
      expect(classes.some(([longueur]) => (longueur as number) <= 34)).toBe(true);
      for (const [longueur, classe] of classes) {
        expect(classe).toBe((longueur as number) > 34 ? 'front long' : 'front');
      }
    });

    it('choisir_une_option_passe_a_la_suite_et_zurueck_la_retrouve', () => {
      const contexte = contexteDe();
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      const premierEnonce = enonce();
      expect(boutonsDOptions()).toHaveLength(4);

      // Une option : la réponse est prise, la question suivante s'affiche.
      fireEvent.click(boutonsDOptions()[2]);

      expect(progression()).toBe('Frage 2 / 20 · 1 beantwortet');
      expect(enonce()).not.toBe(premierEnonce);
      zurueck();
      expect(progression()).toBe('Frage 1 / 20 · 1 beantwortet');
      expect(enonce()).toBe(premierEnonce);
      expect(boutonsDOptions().map((bouton) => bouton.className)).toEqual(['', '', 'sel', '']);

      // Une autre option remplace la réponse : elle ne compte pas deux fois.
      fireEvent.click(boutonsDOptions()[0]);
      expect(progression()).toBe('Frage 2 / 20 · 1 beantwortet');
      zurueck();
      expect(boutonsDOptions().map((bouton) => bouton.className)).toEqual(['sel', '', '', '']);
      // « Überspringen » ne répond à rien et ne défait rien.
      sauter();
      sauter();
      zurueck();
      zurueck();
      expect(progression()).toBe('Frage 1 / 20 · 1 beantwortet');
      expect(boutonsDOptions().map((bouton) => bouton.className)).toEqual(['sel', '', '', '']);
    });

    it('options_numerotees_et_touches_1_a_4', () => {
      const contexte = contexteDe();
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      expect(boutonsDOptions().map((b) => b.querySelector('.mono')?.textContent)).toEqual([
        '1',
        '2',
        '3',
        '4',
      ]);
      const premierEnonce = enonce();

      // Une touche qui ne désigne aucune option ne fait rien.
      fireEvent.keyDown(window, { key: 'a' });
      expect(enonce()).toBe(premierEnonce);

      fireEvent.keyDown(window, { key: '2' });

      expect(progression()).toBe('Frage 2 / 20 · 1 beantwortet');
      zurueck();
      expect(boutonsDOptions().map((bouton) => bouton.className)).toEqual(['', 'sel', '', '']);
    });

    it('une_touche_chiffre_sur_une_question_a_taper_ne_choisit_rien', () => {
      const contexte = contexteDe();
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      const rang = attendue.questions.findIndex((q) => q.options === undefined);
      for (let i = 0; i < rang; i++) sauter();
      expect(champ()).toBeTruthy();

      // Pas d'option sur une question à taper ; et taper un chiffre reste de la saisie.
      fireEvent.keyDown(window, { key: '1' });
      fireEvent.keyDown(champ() as HTMLInputElement, { key: '1' });

      expect(progression()).toBe(`Frage ${rang + 1} / 20 · 0 beantwortet`);
    });

    it('saisie_vide_reste_sans_reponse', () => {
      const contexte = contexteDe();
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      const rang = attendue.questions.findIndex((q) => q.options === undefined);
      for (let i = 0; i < rang; i++) sauter();
      const question = attendue.questions[rang];

      // Rien, puis des espaces : la question reste sans réponse, et l'examen continue.
      saisir('');
      expect(progression()).toBe(`Frage ${rang + 2} / 20 · 0 beantwortet`);
      zurueck();
      expect(champ()?.value).toBe('');
      saisir('   ');
      expect(progression()).toBe(`Frage ${rang + 2} / 20 · 0 beantwortet`);

      // Une vraie saisie est rognée, et se retrouve en revenant.
      zurueck();
      saisir(`  ${reponseAttendue(question)}  `);
      expect(progression()).toBe(`Frage ${rang + 2} / 20 · 1 beantwortet`);
      zurueck();
      expect(champ()?.value).toBe(reponseAttendue(question));
      // Revenir et valider un champ vidé ne défait pas la réponse (comme le prototype, H:2063).
      saisir('');
      expect(progression()).toBe(`Frage ${rang + 2} / 20 · 1 beantwortet`);
    });

    it('le_champ_d_une_autre_question_ne_reprend_pas_la_saisie_precedente', () => {
      const contexte = contexteDe({ examen: { taille: 30 } });
      const attendue = composee(contexte);
      // Deux questions à taper qui se suivent dans ce tirage.
      const rang = attendue.questions.findIndex(
        (q, i) => q.options === undefined && attendue.questions[i + 1]?.options === undefined,
      );
      expect(rang).toBeGreaterThanOrEqual(0);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      for (let i = 0; i < rang; i++) sauter();

      saisir('Erste');

      expect(champ()?.value).toBe('');
    });

    it('une_saisie_en_cours_survit_au_chrono_et_aux_redessins', () => {
      vi.useFakeTimers(DEPART);
      const contexte = contexteDe();
      const attendue = composee(contexte);
      const fournir = () => (
        <ContexteDuCours.Provider value={contexte}>
          <Examen />
        </ContexteDuCours.Provider>
      );
      const rendu = rendreDansLeCours(<Examen />, contexte);
      demarrer();
      const rang = attendue.questions.findIndex((q) => q.options === undefined);
      for (let i = 0; i < rang; i++) sauter();

      // Quelques lettres tapées, pas encore envoyées.
      fireEvent.input(champ() as HTMLInputElement, { target: { value: 'Nie' } });
      avancer(3000);
      expect(minuteur()?.textContent).toBe('14:57');
      expect(champ()?.value).toBe('Nie');
      // L'écran se redessine (le journal a changé, les préférences aussi) : la saisie reste.
      rendu.rerender(fournir());

      expect(champ()?.value).toBe('Nie');
    });

    it('un_champ_a_taper_prend_le_focus', () => {
      const contexte = contexteDe();
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      const rang = attendue.questions.findIndex((q) => q.options === undefined);
      for (let i = 0; i < rang; i++) sauter();

      const saisie = champ() as HTMLInputElement;
      expect(document.activeElement).toBe(saisie);
      expect(saisie.getAttribute('aria-label')).toBe('Antwort');
      expect(saisie.getAttribute('placeholder')).toBe('Fachbegriff …');
      expect(within(saisie.closest('form') as HTMLElement).getByRole('button').textContent).toBe(
        'Weiter',
      );
    });
  });

  describe('remise', () => {
    it('abgeben_demande_confirmation', () => {
      const contexte = contexteDe();
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      sauter();

      cliquer(t.examen_abgeben);

      // La confirmation remplace le bouton ; rien n'est encore remis.
      expect(screen.getByText(t.examen_jetzt_abgeben)).toBeTruthy();
      const confirmation = document.querySelector('.confirm') as HTMLElement;
      expect(
        within(confirmation)
          .getAllByRole('button')
          .map((bouton) => bouton.textContent),
      ).toEqual(['Abgeben', 'Weiter']);
      expect(contexte.enregistrerExamen).not.toHaveBeenCalled();
      expect(note()).toBe('');

      // « Weiter » revient à l'examen, à la même question.
      fireEvent.click(within(confirmation).getByRole('button', { name: t.suivante }));
      expect(screen.queryByText(t.examen_jetzt_abgeben)).toBeNull();
      expect(progression()).toBe('Frage 2 / 20 · 0 beantwortet');
      expect(contexte.enregistrerExamen).not.toHaveBeenCalled();

      // « Abgeben » de la confirmation remet l'examen.
      cliquer(t.examen_abgeben);
      cliquer(t.examen_abgeben);
      expect(contexte.enregistrerExamen).toHaveBeenCalledTimes(1);
      expect(note()).not.toBe('');
    });

    it('la_derniere_question_demande_la_confirmation', () => {
      const contexte = contexteDe();
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      passer(attendue, (_, rang) => (rang < 19 ? 'sauter' : 'juste'));

      expect(screen.getByText(t.examen_jetzt_abgeben)).toBeTruthy();
      expect(contexte.enregistrerExamen).not.toHaveBeenCalled();
    });

    it('remise_journalise_les_reponses_puis_l_examen', async () => {
      const contexte = contexteDe();
      const attendue = composee(contexte);
      const rangement = enAttente<boolean>();
      contexte.enregistrerExamen = vi.fn(() => rangement.promesse);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      // Quinze justes, une fausse, le reste sauté.
      const plan: Plan = (_, rang) => (rang < 15 ? 'juste' : rang === 15 ? 'fausse' : 'sauter');
      passer(attendue, plan);
      const correction = corrigerExamen(contexte.cours, attendue, reponsesDuPlan(attendue, plan));
      expect(correction.points).toBe(15);

      cliquer(t.examen_abgeben);

      // Les réponses d'abord, puis l'examen : un seul appel, avec le résultat et les réponses.
      expect(contexte.enregistrerExamen).toHaveBeenCalledTimes(1);
      expect(contexte.enregistrerExamen).toHaveBeenCalledWith(
        {
          points: 15,
          questions: 20,
          note: correction.note,
          minutes: 1,
          chapitres: correction.chapitres,
        },
        correction.reponses,
      );
      expect(correction.chapitres).toBe(2);
      expect(correction.reponses.length).toBeGreaterThan(15);
      // Le résultat s'affiche sans attendre le rangement ; la synchronisation, elle, l'attend.
      expect(note()).toBe(correction.note.toFixed(1));
      expect(contexte.finDeSeance).not.toHaveBeenCalled();

      rangement.regler(true);

      await waitFor(() => expect(contexte.finDeSeance).toHaveBeenCalledTimes(1));
      const [remise] = vi.mocked(contexte.enregistrerExamen).mock.invocationCallOrder;
      const [fin] = vi.mocked(contexte.finDeSeance).mock.invocationCallOrder;
      expect(remise).toBeLessThan(fin);
    });

    it('un_rangement_refuse_n_empeche_ni_le_resultat_ni_la_synchronisation', async () => {
      const contexte = contexteDe();
      contexte.enregistrerExamen = vi.fn(async () => false);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      toutSauter();

      cliquer(t.examen_abgeben);

      expect(note()).toBe('1.0');
      await waitFor(() => expect(contexte.finDeSeance).toHaveBeenCalledTimes(1));
    });

    it('une_seule_remise_par_examen', () => {
      const contexte = contexteDe();
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      toutSauter();

      // Deux clics avant que l'écran ait changé : le second arrive sur le même bouton, qui ne
      // sait rien de la remise du premier.
      const oui = screen.getByRole('button', { name: t.examen_abgeben });
      oui.click();
      oui.click();

      expect(contexte.enregistrerExamen).toHaveBeenCalledTimes(1);
    });

    it('le_chrono_qui_expire_pendant_la_remise_ne_remet_pas_deux_fois', () => {
      vi.useFakeTimers(DEPART);
      const contexte = contexteDe();
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      toutSauter();
      avancer(14 * 60_000 + 59_000);

      // La remise part à la seconde où le temps s'écoule : le chrono tombe avant que l'écran ait
      // changé.
      screen.getByRole('button', { name: t.examen_abgeben }).click();
      vi.advanceTimersByTime(1000);

      expect(contexte.enregistrerExamen).toHaveBeenCalledTimes(1);
    });

    it('le_chrono_qui_expire_apres_la_remise_ne_remet_pas_deux_fois', () => {
      vi.useFakeTimers(DEPART);
      const contexte = contexteDe();
      const rangement = enAttente<boolean>();
      contexte.enregistrerExamen = vi.fn(() => rangement.promesse);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      toutSauter();
      avancer(14 * 60_000 + 59_000);

      // La remise est faite, le rangement n'est pas fini : le temps qui passe n'y change rien.
      cliquer(t.examen_abgeben);
      avancer(5000);

      expect(contexte.enregistrerExamen).toHaveBeenCalledTimes(1);
      expect(note()).toBe('1.0');
      expect(minuteur()).toBeNull();
    });

    it('duree_reelle_arrondie_a_la_minute', () => {
      vi.useFakeTimers(DEPART);
      const contexte = contexteDe({ examen: { chrono: false } });
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      toutSauter();
      // 3 min 40 s : quatre minutes.
      avancer(220_000);

      cliquer(t.examen_abgeben);

      expect(vi.mocked(contexte.enregistrerExamen).mock.lastCall?.[0].minutes).toBe(4);
      expect(screen.getByText('0 von 20 Punkten (0 %) · 4 Min.')).toBeTruthy();
    });

    it('remise_immediate_compte_une_minute', () => {
      const contexte = contexteDe();
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      toutSauter();

      cliquer(t.examen_abgeben);

      expect(vi.mocked(contexte.enregistrerExamen).mock.lastCall?.[0].minutes).toBe(1);
      expect(screen.getByText('0 von 20 Punkten (0 %) · 1 Min.')).toBeTruthy();
    });
  });

  describe('chrono', () => {
    it('chrono_ecoule_remet_l_examen', () => {
      vi.useFakeTimers(DEPART);
      const contexte = contexteDe();
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      // Cinq réponses justes, puis le temps passe, la confirmation affichée.
      passer(attendue, lesPremieresJustes(5));
      expect(minuteur()?.textContent).toBe('15:00');

      avancer(1000);
      expect(minuteur()?.textContent).toBe('14:59');
      avancer(14 * 60_000 + 57_000);
      expect(minuteur()?.textContent).toBe('0:02');
      avancer(1000);
      expect(minuteur()?.textContent).toBe('0:01');
      expect(contexte.enregistrerExamen).not.toHaveBeenCalled();
      expect(note()).toBe('');

      avancer(1000);

      // Le temps est écoulé : l'examen est remis tel qu'il était, sans confirmation.
      const correction = corrigerExamen(
        contexte.cours,
        attendue,
        reponsesDuPlan(attendue, lesPremieresJustes(5)),
      );
      expect(correction.points).toBe(5);
      expect(contexte.enregistrerExamen).toHaveBeenCalledTimes(1);
      expect(contexte.enregistrerExamen).toHaveBeenCalledWith(
        { points: 5, questions: 20, note: correction.note, minutes: 15, chapitres: 2 },
        correction.reponses,
      );
      expect(note()).toBe(correction.note.toFixed(1));
      expect(minuteur()).toBeNull();
      expect(screen.getByText('5 von 20 Punkten (25 %) · 15 Min.')).toBeTruthy();
    });

    it('chrono_ecoule_hors_de_la_confirmation_remet_aussi_l_examen', () => {
      vi.useFakeTimers(DEPART);
      const contexte = contexteDe();
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      sauter();

      avancer(15 * 60_000);

      expect(contexte.enregistrerExamen).toHaveBeenCalledTimes(1);
      expect(note()).toBe('1.0');
    });

    it('chrono_sous_soixante_secondes_en_rouge', () => {
      vi.useFakeTimers(DEPART);
      rendreDansUnCoursVivant(<Examen />, contexteDe());
      demarrer();
      expect(minuteur()?.className).toBe('timer');

      avancer(14 * 60_000);
      // Encore une minute : pas encore en rouge.
      expect(minuteur()?.textContent).toBe('1:00');
      expect(minuteur()?.className).toBe('timer');

      avancer(1000);
      expect(minuteur()?.textContent).toBe('0:59');
      expect(minuteur()?.className).toBe('timer low');
    });

    it('la_duree_suit_les_reglages_du_contenu', () => {
      // 20 questions à 10 s ne font que 3 minutes : le minimum du contenu, 5, l'emporte.
      const rapide = contexteDe({
        cours: coursAvecReglages({ secondesParQuestion: 10, minutesMinimum: 5 }),
      });
      rendreDansUnCoursVivant(<Examen />, rapide);
      demarrer();
      expect(minuteur()?.textContent).toBe('5:00');
      cleanup();

      // Et un minimum plus haut que les 15 minutes des questions l'emporte aussi.
      const long = contexteDe({ cours: coursAvecReglages({ minutesMinimum: 20 }) });
      rendreDansUnCoursVivant(<Examen />, long);
      demarrer();
      expect(minuteur()?.textContent).toBe('20:00');
    });

    it('sans_chrono_pas_de_minuteur_et_pas_de_remise_automatique', () => {
      vi.useFakeTimers(DEPART);
      const contexte = contexteDe({ examen: { chrono: false } });
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();

      expect(minuteur()).toBeNull();
      avancer(3 * 3600_000);

      expect(progression()).toBe('Frage 1 / 20 · 0 beantwortet');
      expect(contexte.enregistrerExamen).not.toHaveBeenCalled();
    });

    it('examen_en_cours_survit_au_changement_d_onglet', () => {
      vi.useFakeTimers(DEPART);
      const contexte = contexteDe();
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(
        <AllerRetour>
          <Examen />
        </AllerRetour>,
        contexte,
      );
      demarrer();
      repondre(attendue.questions[0], 'juste');
      sauter();
      const enonceAvant = enonce();
      avancer(60_000);
      expect(minuteur()?.textContent).toBe('14:00');

      // Un détour par un autre onglet : l'examen n'est pas recommencé, le temps a passé.
      fireEvent.click(screen.getByTestId('ailleurs'));
      expect(minuteur()).toBeNull();
      avancer(5 * 60_000);
      fireEvent.click(screen.getByTestId('retour'));

      expect(progression()).toBe('Frage 3 / 20 · 1 beantwortet');
      expect(enonce()).toBe(enonceAvant);
      expect(minuteur()?.textContent).toBe('9:00');
      expect(contexte.enregistrerExamen).not.toHaveBeenCalled();
      // Les réponses sont gardées, et le temps continue de s'écouler.
      zurueck();
      zurueck();
      expect(boutonsDOptions().filter((bouton) => bouton.className === 'sel')).toHaveLength(1);
      avancer(1000);
      expect(minuteur()?.textContent).toBe('8:59');
    });

    it('temps_ecoule_pendant_un_detour_remet_l_examen_au_retour_avec_la_duree_accordee', async () => {
      vi.useFakeTimers(DEPART);
      const contexte = contexteDe();
      rendreDansUnCoursVivant(
        <AllerRetour>
          <Examen />
        </AllerRetour>,
        contexte,
      );
      demarrer();
      fireEvent.click(screen.getByTestId('ailleurs'));

      // Une heure plus tard : rien n'a été remis pendant l'absence.
      avancer(3600_000);
      expect(contexte.enregistrerExamen).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId('retour'));

      // Au retour, le temps est écoulé : l'examen est remis, pour les 15 minutes accordées.
      expect(contexte.enregistrerExamen).toHaveBeenCalledTimes(1);
      expect(vi.mocked(contexte.enregistrerExamen).mock.lastCall?.[0].minutes).toBe(15);
      expect(note()).toBe('1.0');
      expect(minuteur()).toBeNull();
      await vi.waitFor(() => expect(contexte.finDeSeance).toHaveBeenCalledTimes(1));

      // Et il ne l'est qu'une fois, même en revenant encore.
      fireEvent.click(screen.getByTestId('ailleurs'));
      fireEvent.click(screen.getByTestId('retour'));
      expect(contexte.enregistrerExamen).toHaveBeenCalledTimes(1);
      expect(note()).toBe('1.0');
    });
  });

  describe('resultat', () => {
    it('bestanden_a_partir_de_la_note_suffisante', () => {
      // Vingt questions : 11 justes font 4.0 (bestanden), 10 font 3.5.
      const bestanden = contexteDe();
      const attendue = composee(bestanden);
      expect(
        corrigerExamen(bestanden.cours, attendue, reponsesDuPlan(attendue, lesPremieresJustes(11)))
          .note,
      ).toBe(4);
      rendreDansUnCoursVivant(<Examen />, bestanden);
      demarrer();
      passer(attendue, lesPremieresJustes(11));
      cliquer(t.examen_abgeben);

      expect(note()).toBe('4.0');
      expect(verdict()).toBe('bestanden');
      expect(document.querySelector('.pill')?.className).toBe('pill ok');
      expect(screen.getByText('11 von 20 Punkten (55 %) · 1 Min.')).toBeTruthy();
      expect(screen.getByText(t.examen_resultat)).toBeTruthy();
      cleanup();

      const knapp = contexteDe();
      rendreDansUnCoursVivant(<Examen />, knapp);
      demarrer();
      passer(attendue, lesPremieresJustes(10));
      cliquer(t.examen_abgeben);

      expect(note()).toBe('3.5');
      expect(verdict()).toBe('nicht bestanden');
      expect(document.querySelector('.pill')?.className).toBe('pill ko');
      expect(screen.getByText('10 von 20 Punkten (50 %) · 1 Min.')).toBeTruthy();
    });

    it('la_note_suffisante_vient_du_contenu', () => {
      const contexte = contexteDe({ cours: coursAvecReglages({ noteSuffisante: 4.5 }) });
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      passer(attendue, lesPremieresJustes(11));
      cliquer(t.examen_abgeben);

      // 4.0 suffisait avec la note de 4 ; avec 4,5 il manque un demi-point.
      expect(note()).toBe('4.0');
      expect(verdict()).toBe('nicht bestanden');
      cleanup();

      const exigeant = contexteDe({ cours: coursAvecReglages({ noteSuffisante: 3.5 }) });
      rendreDansUnCoursVivant(<Examen />, exigeant);
      demarrer();
      passer(attendue, lesPremieresJustes(10));
      cliquer(t.examen_abgeben);

      expect(note()).toBe('3.5');
      expect(verdict()).toBe('bestanden');
    });

    it('groupes_colores_selon_le_seuil_du_chapitre', () => {
      // Chapitre 1 : 4 sur 4. Chapitre 2 : 3 sur 4. Baukasten : 0 sur 1. Schemata : 3 sur 5.
      // Berichte : 0 sur 3. Grammatik : 0 sur 2. Arbeitsblätter : 1 sur 1.
      const reussites = new Map([
        [CHAPITRE_1, 4],
        [CHAPITRE_2, 3],
        ['schemas', 3],
        ['feuilles', 1],
      ]);
      const vues = new Map<string, number>();
      const plan: Plan = (question) => {
        const groupe = groupeDeQuestion(question);
        const n = vues.get(groupe) ?? 0;
        vues.set(groupe, n + 1);
        return n < (reussites.get(groupe) ?? 0) ? 'juste' : 'fausse';
      };
      const contexte = contexteDe();
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      passer(attendue, plan);
      cliquer(t.examen_abgeben);

      const resume = lignes(t.examen_nach_kapitel).map((ligne) => ({
        groupe: ligne.querySelector('b')?.textContent,
        compte: ligne.querySelector('span')?.textContent,
        pourcent: ligne.querySelector('em')?.textContent,
        couleur: (ligne.querySelector('em') as HTMLElement).style.color,
      }));
      // Les chapitres dans l'ordre du cours, puis les modules ; seuil du chapitre : 60 %, atteint
      // par les schémas. Les fiches viennent en dernier, sous le nom de leur onglet.
      expect(resume).toEqual([
        { groupe: 'Kapitel 1', compte: '4 / 4 richtig', pourcent: '100 %', couleur: 'var(--good)' },
        { groupe: 'Kapitel 2', compte: '3 / 4 richtig', pourcent: '75 %', couleur: 'var(--good)' },
        { groupe: 'Baukasten', compte: '0 / 1 richtig', pourcent: '0 %', couleur: 'var(--bad)' },
        { groupe: 'Schemata', compte: '3 / 5 richtig', pourcent: '60 %', couleur: 'var(--good)' },
        { groupe: 'Berichte', compte: '0 / 3 richtig', pourcent: '0 %', couleur: 'var(--bad)' },
        { groupe: 'Grammatik', compte: '0 / 2 richtig', pourcent: '0 %', couleur: 'var(--bad)' },
        {
          groupe: 'Arbeitsblätter',
          compte: '1 / 1 richtig',
          pourcent: '100 %',
          couleur: 'var(--good)',
        },
      ]);
    });

    it('le_seuil_du_chapitre_vient_du_contenu', () => {
      const couleurs: string[] = [];

      // 3 justes sur 4 au chapitre 2 : 75 %, rien de juste ailleurs.
      for (const seuilChapitre of [0.75, 0.76, 0.5]) {
        let justes = 0;
        const plan: Plan = (question) => {
          if (question.genre !== 'carte' || question.chapitre !== CHAPITRE_2) return 'fausse';
          return ++justes <= 3 ? 'juste' : 'fausse';
        };
        const contexte = contexteDe({ cours: coursAvecReglages({ seuilChapitre }) });
        rendreDansUnCoursVivant(<Examen />, contexte);
        demarrer();
        passer(composee(contexte), plan);
        cliquer(t.examen_abgeben);
        const ligne = lignes(t.examen_nach_kapitel).find(
          (chacune) => chacune.querySelector('b')?.textContent === 'Kapitel 2',
        );
        expect(ligne?.querySelector('span')?.textContent).toBe('3 / 4 richtig');
        couleurs.push((ligne?.querySelector('em') as HTMLElement | undefined)?.style.color ?? '');
        cleanup();
      }

      // 75 % atteint le seuil de 0,75 (inclus) mais pas celui de 0,76.
      expect(couleurs).toEqual(['var(--good)', 'var(--bad)', 'var(--good)']);
    });

    it('fautes_avec_la_reponse_attendue_et_la_reponse_donnee', () => {
      const contexte = contexteDe();
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      // Tout est juste, sauf : la question 0 (une option fausse), la question 1 (sautée) et la
      // première à taper (« xyz »).
      const taper = attendue.questions.findIndex((q) => q.options === undefined);
      const plan: Plan = (_, rang) =>
        rang === 0 || rang === taper ? 'fausse' : rang === 1 ? 'sauter' : 'juste';
      passer(attendue, plan);
      cliquer(t.examen_abgeben);

      expect(screen.getByRole('heading', { name: 'Fehler (3)' })).toBeTruthy();
      expect(screen.queryByText(t.examen_keine_fehler)).toBeNull();
      const fautes = lignes('Fehler (3)').map((ligne) => [
        ligne.querySelector('b')?.textContent,
        ligne.querySelector('span')?.textContent,
        ligne.querySelector('em')?.textContent,
      ]);
      const [q0, q1, qt] = [0, 1, taper].map((rang) => attendue.questions[rang]);
      // Dans l'ordre des questions.
      expect(fautes).toEqual([
        [enonceAttendu(q0), reponseAttendue(q0), q0.options?.[reponseDe(q0, 'fausse') as number]],
        [enonceAttendu(q1), reponseAttendue(q1), '—'],
        [enonceAttendu(qt), reponseAttendue(qt), 'xyz'],
      ]);
      // Les fautes ont leur mise en page, l'une sous l'autre (`.table.fautes`, `styles.css`) : une
      // réponse donnée peut être plus large que l'écran.
      expect(lignes('Fehler (3)')[0]?.parentElement?.classList.contains('fautes')).toBe(true);
    });

    it('sans_faute_le_resultat_le_dit', () => {
      const contexte = contexteDe();
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      passer(attendue, () => 'juste');
      cliquer(t.examen_abgeben);

      expect(note()).toBe('6.0');
      expect(screen.getByText(t.examen_keine_fehler)).toBeTruthy();
      expect(screen.queryByRole('heading', { name: /^Fehler/ })).toBeNull();
      expect(screen.getByText('20 von 20 Punkten (100 %) · 1 Min.')).toBeTruthy();
      // Rien à réviser en cartes.
      expect(screen.queryByRole('button', { name: t.examen_fehler_ueben })).toBeNull();
      expect(screen.getByRole('button', { name: t.examen_neue })).toBeTruthy();
    });

    it('fehler_als_karteikarten_ueben', () => {
      const contexte = contexteDe();
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      // Une carte sur deux est fausse, les autres justes ; tout schéma est faux, et n'a pas sa
      // place dans les cartes.
      const plan: Plan = (question, rang) =>
        question.genre === 'schema' || rang % 2 === 0 ? 'fausse' : 'juste';
      passer(attendue, plan);
      cliquer(t.examen_abgeben);
      const fausses = attendue.questions.flatMap((question, rang) =>
        question.genre === 'carte' && plan(question, rang) === 'fausse' ? [question.unite] : [],
      );
      const cartesJustes = attendue.questions.filter(
        (question, rang) => question.genre === 'carte' && plan(question, rang) === 'juste',
      );
      expect(fausses.length).toBeGreaterThan(0);
      expect(cartesJustes.length).toBeGreaterThan(0);
      expect(attendue.questions.some((q) => q.genre === 'schema')).toBe(true);

      cliquer(t.examen_fehler_ueben);

      // L'onglet des cartes s'ouvre sur une séance qui ne contient que ces cartes, dans l'ordre
      // de l'examen, et qui se reconnaît comme venant de l'examen.
      expect(contexte.aller).toHaveBeenCalledExactlyOnceWith('cartes');
      const imposee = seanceImposee(contexte) as SeanceCartes;
      expect(imposee.file).toEqual(fausses);
      expect(imposee).toMatchObject({ faites: 0, justes: 0, deLExamen: true });
      // Le même objet à chaque lecture : les cartes la reconnaissent à sa référence.
      expect(seanceImposee(contexte)).toBe(imposee);
    });

    it('fehler_als_karteikarten_ueben_absent_sans_carte_fausse', () => {
      const contexte = contexteDe();
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      // Toutes les cartes sont justes ; le reste est faux.
      passer(attendue, (question) => (question.genre === 'carte' ? 'juste' : 'fausse'));
      cliquer(t.examen_abgeben);

      expect(screen.getByRole('heading', { name: /^Fehler \(/ })).toBeTruthy();
      expect(screen.queryByRole('button', { name: t.examen_fehler_ueben })).toBeNull();
    });

    it('une_nouvelle_demande_construit_une_nouvelle_seance', () => {
      const contexte = contexteDe();
      const attendue = composee(contexte);
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      passer(attendue, () => 'fausse');
      cliquer(t.examen_abgeben);

      cliquer(t.examen_fehler_ueben);
      const premiere = seanceImposee(contexte);
      cliquer(t.examen_fehler_ueben);
      const seconde = seanceImposee(contexte);

      expect(contexte.aller).toHaveBeenCalledTimes(2);
      expect(seconde).not.toBe(premiere);
      expect(seconde).toEqual(premiere);
    });

    it('neue_pruefung_revient_aux_reglages', () => {
      const contexte = contexteDe();
      rendreDansUnCoursVivant(<Examen />, contexte);
      demarrer();
      toutSauter();
      cliquer(t.examen_abgeben);
      expect(note()).toBe('1.0');

      cliquer(t.examen_neue);

      expect(screen.getByRole('button', { name: t.examen_starten })).toBeTruthy();
      expect(note()).toBe('');
      // Une autre épreuve repart de zéro.
      demarrer();
      expect(progression()).toBe('Frage 1 / 20 · 0 beantwortet');
      expect(minuteur()?.textContent).toBe('15:00');
    });

    it('le_resultat_survit_au_changement_d_onglet', () => {
      const contexte = contexteDe();
      rendreDansUnCoursVivant(
        <AllerRetour>
          <Examen />
        </AllerRetour>,
        contexte,
      );
      demarrer();
      toutSauter();
      cliquer(t.examen_abgeben);

      fireEvent.click(screen.getByTestId('ailleurs'));
      fireEvent.click(screen.getByTestId('retour'));

      expect(note()).toBe('1.0');
      expect(contexte.enregistrerExamen).toHaveBeenCalledTimes(1);
    });
  });
});
