// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHAPITRE_1,
  CHAPITRE_2,
  coursSans,
  coursServiDeTest,
  coursServiParLaV030,
} from '../../domaine/cours/cours.fixture.js';
import type { CoursServi } from '../../domaine/cours/servi.js';
import { ajouterJours, horodatage, jourDe } from '../../domaine/journal/temps.js';
import { ErreurApi, lireCours, type Moi } from '../api.js';
import { enAttente } from '../attente.fixture.js';
import { contexteAppDeTest, dansLApp } from '../contexte.fixture.js';
import { annulerSynchrosProgrammees } from '../declencheurs.js';
import { differerApresLeRendu } from '../mise-a-jour.js';
import { naviguer, surNavigation, useChemin } from '../routeur.js';
import { type Seance, seanceEnCours } from '../seance.js';
import { fermerLesBasesDeTest, ouvrirBaseDeTest } from '../stockage/base-locale.fixture.js';
import type { BaseLocale } from '../stockage/base-locale.js';
import { coursLocal, enregistrerCours } from '../stockage/cours-local.js';
import { ALICE } from '../stockage/evenements.fixture.js';
import { ajouterEvenement, evenementsDuCours } from '../stockage/journal-local.js';
import { synchroniserCours } from '../synchro.js';
import { textes } from '../textes.js';
import { reponseDeTest } from './contexte-cours.fixture.js';
import { EcranCours, texteDeSynchro } from './EcranCours.js';
import { Quiz } from './onglets/Quiz.js';
import { TEXTES_COURS } from './textes-cours.js';

const page = vi.hoisted(() => ({ base: undefined as BaseLocale | undefined }));
vi.mock('../stockage/base-de-la-page.js', () => ({
  baseDeLaPage: async () => {
    if (page.base === undefined) throw new Error('base de test absente');
    return page.base;
  },
}));
vi.mock('../synchro.js', async (original) => ({
  ...(await original<typeof import('../synchro.js')>()),
  synchroniserCours: vi.fn(),
}));
vi.mock('../api.js', async (original) => ({
  ...(await original<typeof import('../api.js')>()),
  lireCours: vi.fn(),
}));
// Le quiz, réel, mais dont un test fait échouer le rendu (1e-D13).
vi.mock('./onglets/Quiz.js', async (original) => {
  const reel = await original<typeof import('./onglets/Quiz.js')>();
  return { ...reel, Quiz: vi.fn(reel.Quiz) };
});

const t = TEXTES_COURS.de;
const MOI: Moi = { id: ALICE, nomAffiche: 'Alice Test', langue: 'fr', proprietaire: false };
const servi = coursServiDeTest();
const ID = servi.id;

type OngletDeTest =
  | 'apercu'
  | 'cartes'
  | 'quiz'
  | 'mots'
  | 'schemas'
  | 'textes'
  | 'exercices'
  | 'feuilles'
  | 'examen'
  | 'progression';

const definirMoi = vi.fn();

function ecran(onglet: OngletDeTest) {
  return dansLApp(
    <EcranCours cours={ID} onglet={onglet} />,
    contexteAppDeTest({ langue: 'fr', moi: MOI, definirMoi }),
  );
}

function afficher(onglet: OngletDeTest = 'apercu') {
  const rendu = render(ecran(onglet));
  // Passer à un autre onglet : l'écran reste, seul l'onglet de l'adresse change.
  return { ...rendu, ouvrir: (suivant: OngletDeTest) => rendu.rerender(ecran(suivant)) };
}

/** Chaque onglet s'affiche à son adresse : son repère est à l'écran, et c'est lui qui est choisi. */
async function attendreLesOnglets(onglets: readonly (readonly [OngletDeTest, string])[]) {
  for (const [onglet, repere] of onglets) {
    history.replaceState(null, '', `/cours/${ID}/${onglet}`);
    afficher(onglet);

    expect(await screen.findByText(repere)).toBeTruthy();
    expect(screen.getByRole('tab', { selected: true }).id).toBe(`onglet-${onglet}`);
    cleanup();
  }
}

/** Les préférences des cartes : le chapitre 1, dans le sens direct (une carte se retourne). */
function cartesDirectes(): void {
  localStorage.setItem(
    `ancrage.preferences.${ALICE}.${ID}`,
    JSON.stringify({ cartes: { chapitre: CHAPITRE_1, sens: 'direct', saisie: true } }),
  );
}

/** Une préférence du cours, hors de la carte : le reste vient des valeurs par défaut. */
function preferer(onglet: string, valeur: unknown): void {
  localStorage.setItem(`ancrage.preferences.${ALICE}.${ID}`, JSON.stringify({ [onglet]: valeur }));
}

async function repondreALaCarte(libelle: string): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: t.cartes_retourner }));
  fireEvent.click(screen.getByRole('button', { name: libelle }));
}

/**
 * Les premières réponses d'une série (Wörter, Schemata, Übungen) : un choix d'option ou une saisie,
 * et « Weiter », jusqu'à ce qu'une réponse soit comptée (un mot décomposé en compte plusieurs).
 */
async function repondreAUneSerie(): Promise<void> {
  await screen.findByRole('tablist');
  for (let essai = 0; essai < 6 && seanceEnCours() === null; essai++) {
    const option = screen.queryAllByRole('button', { name: /^\d\s/ })[0];
    const champ = screen.queryByLabelText(t.exercices_antwort);
    const suivante = screen.queryByRole('button', { name: t.suivante });
    if (option !== undefined) fireEvent.click(option);
    else if (champ !== null) {
      fireEvent.input(champ, { target: { value: 'x' } });
      fireEvent.click(screen.getByRole('button', { name: t.pruefen }));
    } else if (suivante !== null) fireEvent.click(suivante);
    else await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** La première tâche de la fiche (un appariement) : ouverte, remplie, jugée. */
async function remplirLAppariement(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: t.feuilles_bearbeiten }));
  const paires: [string, string][] = [
    ['Herz', 'Organ im Brustkorb'],
    ['Leber', 'Grosse Drüse im Oberbauch'],
    ['Niere', 'Organ der Harnbildung'],
  ];
  for (const [terme, cible] of paires) {
    fireEvent.click(screen.getByRole('button', { name: terme }));
    fireEvent.click(screen.getByRole('button', { name: cible }));
  }
  fireEvent.click(screen.getByRole('button', { name: t.pruefen }));
}

beforeEach(async () => {
  page.base = await ouvrirBaseDeTest();
  // Remis à zéro après l'attente ci-dessus : une synchronisation lancée à la fin du test précédent
  // a pu appeler la fonction simulée entre-temps, et ne doit pas compter ici.
  vi.mocked(synchroniserCours).mockReset();
  vi.mocked(lireCours).mockReset();
  vi.mocked(Quiz).mockReset();
  definirMoi.mockReset();
  vi.mocked(synchroniserCours).mockResolvedValue({ etat: 'a_jour', enAttente: 0 });
  vi.mocked(lireCours).mockResolvedValue(coursServiDeTest());
  history.replaceState(null, '', `/cours/${ID}`);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // Une synchronisation programmée par un test ne part pas pendant le suivant.
  annulerSynchrosProgrammees();
  fermerLesBasesDeTest();
  localStorage.clear();
});

describe('EcranCours', () => {
  it('cours_lu_dans_la_base_puis_sur_le_reseau_et_range', async () => {
    const base = page.base as BaseLocale;
    const ancien: CoursServi = { ...coursServiDeTest(), titre: 'Alter Übungskurs' };
    await enregistrerCours(base, ALICE, ancien);
    const reseau = enAttente<CoursServi>();
    vi.mocked(lireCours).mockReturnValue(reseau.promesse);

    afficher();

    // D'abord la copie de l'appareil, sans attendre le réseau.
    expect(await screen.findByRole('heading', { name: 'Alter Übungskurs' })).toBeTruthy();
    reseau.regler(coursServiDeTest());
    expect(await screen.findByRole('heading', { name: 'Übungskurs' })).toBeTruthy();
    expect(lireCours).toHaveBeenCalledWith(ID, ALICE);
    await waitFor(async () =>
      expect(await coursLocal(base, ALICE, ID)).toEqual(coursServiDeTest()),
    );
  });

  it('cours_introuvable_n_affiche_que_cela', async () => {
    await enregistrerCours(page.base as BaseLocale, ALICE, coursServiDeTest());
    vi.mocked(lireCours).mockRejectedValue(new ErreurApi(404, 'introuvable'));

    afficher();

    expect(await screen.findByText(textes.fr.cours_introuvable)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Übungskurs' })).toBeNull();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('sans_reseau_ni_copie_locale_message_et_reessayer', async () => {
    vi.mocked(lireCours).mockRejectedValueOnce(new ErreurApi(0, 'reseau'));

    afficher();

    expect(await screen.findByText(textes.fr.erreur_reseau)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: textes.fr.reessayer }));
    expect(await screen.findByRole('heading', { name: 'Übungskurs' })).toBeTruthy();
  });

  it('sans_reseau_la_copie_locale_reste_affichee', async () => {
    await enregistrerCours(page.base as BaseLocale, ALICE, coursServiDeTest());
    vi.mocked(lireCours).mockRejectedValue(new ErreurApi(0, 'reseau'));

    afficher();

    expect(await screen.findByRole('heading', { name: 'Übungskurs' })).toBeTruthy();
    await waitFor(() => expect(lireCours).toHaveBeenCalled());
    expect(screen.queryByText(textes.fr.erreur_reseau)).toBeNull();
  });

  // Après un retour arrière vers la v0.3.0, le client précaché reçoit un contenu sans `leitner` :
  // il ne le range pas, et la copie de l'appareil reste affichée.
  it('contenu_d_une_version_anterieure_garde_la_copie_locale', async () => {
    const base = page.base as BaseLocale;
    await enregistrerCours(base, ALICE, coursServiDeTest());
    vi.mocked(lireCours).mockResolvedValue({
      ...coursServiParLaV030(),
      titre: 'Kurs der Vorversion',
    });

    afficher();

    expect(await screen.findByRole('heading', { name: 'Übungskurs' })).toBeTruthy();
    await waitFor(() => expect(lireCours).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole('heading', { name: 'Kurs der Vorversion' })).toBeNull();
    expect(screen.getByRole('tablist')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(await coursLocal(base, ALICE, ID)).toEqual(coursServiDeTest());
  });

  it('contenu_d_une_version_anterieure_sans_copie_cours_indisponible', async () => {
    const base = page.base as BaseLocale;
    vi.mocked(lireCours).mockResolvedValue(coursServiParLaV030());

    afficher();

    expect(await screen.findByText(textes.fr.cours_indisponible)).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(await coursLocal(base, ALICE, ID)).toBeUndefined();
  });

  it('copie_locale_inutilisable_ignoree', async () => {
    // Une copie qu'une version antérieure a pu laisser : elle ne s'affiche pas, le réseau la
    // remplace.
    const base = page.base as BaseLocale;
    await base.put('cours', {
      personne: ALICE,
      id: ID,
      contenu: coursServiParLaV030() as unknown as CoursServi,
    });
    const reseau = enAttente<CoursServi>();
    vi.mocked(lireCours).mockReturnValue(reseau.promesse);

    afficher();

    await waitFor(() => expect(lireCours).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByText(textes.fr.chargement)).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
    reseau.regler(coursServiDeTest());
    expect(await screen.findByRole('heading', { name: 'Übungskurs' })).toBeTruthy();
    await waitFor(async () =>
      expect(await coursLocal(base, ALICE, ID)).toEqual(coursServiDeTest()),
    );
  });

  it('barre_d_onglets_dans_l_ordre_du_prototype', async () => {
    afficher('quiz');

    const barre = await screen.findByRole('tablist');
    const onglets = within(barre).getAllByRole('tab');
    expect(onglets.map((onglet) => onglet.textContent)).toEqual([
      t.onglet_apercu,
      t.onglet_cartes,
      t.onglet_quiz,
      // Les titres des modules du cours (décision 19).
      'Baukasten',
      t.onglet_schemas,
      'Berichte',
      'Grammatik',
      t.onglet_feuilles,
      'Probeprüfung',
      t.onglet_progression,
    ]);
    expect(onglets.map((onglet) => onglet.getAttribute('aria-selected'))).toEqual([
      'false',
      'false',
      'true',
      'false',
      'false',
      'false',
      'false',
      'false',
      'false',
      'false',
    ]);

    fireEvent.click(onglets[9]);
    expect(location.pathname).toBe(`/cours/${ID}/progression`);
    fireEvent.click(onglets[0]);
    expect(location.pathname).toBe(`/cours/${ID}`);
  });

  it('onglet_feuilles_entre_exercices_et_examen', async () => {
    history.replaceState(null, '', `/cours/${ID}/feuilles`);
    afficher('feuilles');

    // « Arbeitsblätter » est un texte d'interface, placé entre la Grammatik et la Prüfung (F1-D1).
    const choisi = await screen.findByRole('tab', { selected: true });
    expect(choisi.id).toBe('onglet-feuilles');
    expect(choisi.textContent).toBe('Arbeitsblätter');
    const ids = within(screen.getByRole('tablist'))
      .getAllByRole('tab')
      .map((onglet) => onglet.id);
    expect(ids.slice(ids.indexOf('onglet-exercices'), ids.indexOf('onglet-examen') + 1)).toEqual([
      'onglet-exercices',
      'onglet-feuilles',
      'onglet-examen',
    ]);
    // L'onglet montre la liste des fiches du cours.
    expect(await screen.findByText('Unit 1 – Übungsblatt')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: t.onglet_progression }));
    expect(location.pathname).toBe(`/cours/${ID}/progression`);
    fireEvent.click(screen.getByRole('tab', { name: t.onglet_feuilles }));
    expect(location.pathname).toBe(`/cours/${ID}/feuilles`);
  });

  it('onglet_feuilles_absent_sans_feuille', async () => {
    // Un cours sans fiche, ou le contenu d'une version antérieure : ni onglet, ni adresse.
    vi.mocked(lireCours).mockResolvedValue(coursSans('feuille'));
    history.replaceState(null, '', `/cours/${ID}/feuilles`);

    afficher('feuilles');

    expect(await screen.findByText(t.apercu_sures)).toBeTruthy();
    expect(screen.queryByRole('tab', { name: t.onglet_feuilles })).toBeNull();
    expect(document.getElementById('onglet-feuilles')).toBeNull();
    await waitFor(() => expect(location.pathname).toBe(`/cours/${ID}`));
  });

  it('onglet_absent_du_cours_mene_a_l_apercu', async () => {
    const sansTextes: CoursServi = {
      ...servi,
      modules: servi.modules.filter((module) => module.type !== 'texte-annote'),
    };
    vi.mocked(lireCours).mockResolvedValue(sansTextes);
    history.replaceState(null, '', `/cours/${ID}/textes`);

    afficher('textes');

    expect(await screen.findByText(t.apercu_sures)).toBeTruthy();
    await waitFor(() => expect(location.pathname).toBe(`/cours/${ID}`));
  });

  it('onglet_cartes_construit_sa_serie_avec_le_journal_local', async () => {
    // Une carte répondue hier, à revoir aujourd'hui, et une seule carte neuve par série.
    const maintenant = Date.now();
    const aujourdhui = jourDe(horodatage(maintenant, -new Date(maintenant).getTimezoneOffset()));
    await ajouterEvenement(
      page.base as BaseLocale,
      ALICE,
      reponseDeTest(1, 'c1000001', true, ajouterJours(aujourdhui, -1)),
    );
    const base = coursServiDeTest();
    vi.mocked(lireCours).mockResolvedValue({
      ...base,
      leitner: { ...base.leitner, nouvellesParSeance: 1 },
    });

    afficher('cartes');

    // L'onglet attend le journal : sans lui, la carte due manquerait à la série.
    expect(await screen.findByText('0 beantwortet · 2 übrig')).toBeTruthy();
    await waitFor(() => expect(synchroniserCours).toHaveBeenCalled());
    expect(screen.getByText('0 beantwortet · 2 übrig')).toBeTruthy();
  });

  it('onglet_quiz_affiche_une_question', async () => {
    afficher('quiz');

    expect(await screen.findByText(t.quiz_touches)).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /^\d\s/ }).length).toBeGreaterThanOrEqual(2);
  });

  it('onglets_des_exercices_annexes_s_affichent', async () => {
    await attendreLesOnglets([
      ['mots', t.mots_touches],
      ['schemas', 'Übungsschema ohne Vorbild'],
      ['textes', `Rezepte zum Lesen – frei erfunden. ${t.textes_anleitung}`],
      ['exercices', t.exercices_hinweis],
      ['feuilles', t.feuilles_bearbeiten],
    ]);
  });

  it('exercice_repondu_entre_au_journal_local_et_survit_a_un_detour', async () => {
    localStorage.setItem(
      `ancrage.preferences.${ALICE}.${ID}`,
      JSON.stringify({ exercices: { famille: 'plural' } }),
    );
    const { ouvrir } = afficher('exercices');
    const champ = await screen.findByLabelText(t.exercices_antwort);
    // Le hasard de l'écran est `Math.random` : on répond à l'exercice qui est tombé.
    const invite = document.querySelector('.card .front')?.textContent;
    fireEvent.input(champ, {
      target: { value: invite?.includes('Musterus') ? 'Musteri' : 'Probelae' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.pruefen }));
    expect(document.querySelector('.verdict')?.className).toBe('verdict ok');
    // La réponse est au journal de l'appareil, prête à partir.
    await screen.findByText(t.synchro_une_en_attente);
    expect(screen.getByText('1 / 1 richtig', { exact: false })).toBeTruthy();

    // Un tour par l'aperçu : l'exercice et son verdict sont retrouvés, sans nouvelle réponse.
    ouvrir('apercu');
    expect(await screen.findByText(t.apercu_sures)).toBeTruthy();
    ouvrir('exercices');

    expect(await screen.findByRole('button', { name: t.suivante })).toBeTruthy();
    expect(document.querySelector('.card .front')?.textContent).toBe(invite);
    expect(screen.getByText(t.synchro_une_en_attente)).toBeTruthy();
  });

  it('onglets_pruefung_et_fortschritt_s_affichent', async () => {
    await attendreLesOnglets([
      ['examen', t.examen_starten],
      ['progression', t.progression_jours],
    ]);
  });

  it('pruefung_remise_journalisee_fehler_en_cartes_puis_lernen_repart_a_neuf', async () => {
    // Un examen sur le chapitre 2 seul, sans modules : des cartes et les mots du Baukasten.
    localStorage.setItem(
      `ancrage.preferences.${ALICE}.${ID}`,
      JSON.stringify({
        cartes: { chapitre: CHAPITRE_1, sens: 'direct', saisie: true },
        examen: { chapitres: [CHAPITRE_2], taille: 20, chrono: false, avecModules: false },
      }),
    );
    // Ce que le journal de l'appareil contient à chaque synchronisation.
    const vus: number[] = [];
    vi.mocked(synchroniserCours).mockImplementation(async (base, personne, cours) => {
      vus.push((await evenementsDuCours(base, personne, cours)).length);
      return { etat: 'a_jour', enAttente: 0 };
    });
    const { ouvrir } = afficher('examen');
    fireEvent.click(await screen.findByRole('button', { name: t.examen_starten }));

    // Tout est sauté, puis remis : toute carte posée est fausse.
    while (screen.queryByRole('button', { name: t.examen_ueberspringen }) !== null) {
      fireEvent.click(screen.getByRole('button', { name: t.examen_ueberspringen }));
    }
    fireEvent.click(screen.getByRole('button', { name: t.examen_zur_abgabe }));
    fireEvent.click(screen.getByRole('button', { name: t.examen_abgeben }));
    expect(document.querySelector('.grade')?.textContent).toBe('1.0');
    // Huit questions (cinq cartes, trois mots), toutes fausses : huit réponses puis l'examen,
    // au journal de l'appareil, et la synchronisation de la fin de séance les voit.
    await waitFor(() => expect(vus).toHaveLength(2));
    expect(vus).toEqual([0, 9]);
    const journal = await evenementsDuCours(page.base as BaseLocale, ALICE, ID);
    expect(journal.filter((evenement) => evenement.type === 'reponse')).toHaveLength(8);
    expect(
      journal.filter((evenement) => evenement.type === 'reponse' && evenement.resultat.juste),
    ).toHaveLength(0);
    const examens = journal.filter((evenement) => evenement.type === 'examen');
    expect(examens).toHaveLength(1);
    expect(examens[0].unite).toBe('ey000001');
    expect(examens[0].resultat).toEqual({
      points: 0,
      questions: 8,
      note: 1,
      minutes: 1,
      chapitres: 1,
    });

    // « Fehler als Karteikarten üben » ouvre les cartes, sur ces seules erreurs.
    fireEvent.click(screen.getByRole('button', { name: t.examen_fehler_ueben }));
    expect(location.pathname).toBe(`/cours/${ID}/cartes`);
    ouvrir('cartes');
    expect(await screen.findByText(/Fehler aus der Prüfung/)).toBeTruthy();
    expect(screen.getByText('0 beantwortet · 5 übrig · Fehler aus der Prüfung')).toBeTruthy();
    expect(screen.getByText(/Kap\. 2/, { selector: '.kind' })).toBeTruthy();
    // Un détour par l'aperçu : la même série, sans repartir des erreurs.
    ouvrir('apercu');
    expect(await screen.findByText(t.apercu_sures)).toBeTruthy();
    ouvrir('cartes');
    expect(
      await screen.findByText('0 beantwortet · 5 übrig · Fehler aus der Prüfung'),
    ).toBeTruthy();

    // « Lernen » repart d'une série du chapitre, pas des erreurs de l'examen.
    ouvrir('apercu');
    fireEvent.click((await screen.findAllByRole('button', { name: t.apercu_lernen }))[0]);
    ouvrir('cartes');
    expect(await screen.findByText('0 beantwortet · 8 übrig')).toBeTruthy();
    expect(screen.queryByText(/Fehler aus der Prüfung/)).toBeNull();
  });

  it('rangement_echoue_bandeau_et_serie_continue', async () => {
    cartesDirectes();
    const base = page.base as BaseLocale;
    afficher('cartes');
    expect(await screen.findByText('0 beantwortet · 8 übrig')).toBeTruthy();
    expect(screen.queryByTestId('erreur-enregistrement')).toBeNull();

    // Le stockage de l'appareil refuse la réponse : un bandeau le dit, la série continue.
    page.base = undefined;
    await repondreALaCarte(t.cartes_su);

    const bandeau = await screen.findByTestId('erreur-enregistrement');
    expect(bandeau.textContent).toBe('Antwort konnte nicht gespeichert werden.');
    expect(bandeau.getAttribute('role')).toBe('alert');
    expect(screen.getByText('1 beantwortet · 7 übrig')).toBeTruthy();
    await repondreALaCarte(t.cartes_pas_su);
    expect(screen.getByText('2 beantwortet · 7 übrig')).toBeTruthy();
    expect(screen.getByTestId('erreur-enregistrement')).toBeTruthy();

    // Le stockage revient : la réponse suivante est rangée, le bandeau s'efface.
    page.base = base;
    await repondreALaCarte(t.cartes_su);
    await waitFor(() => expect(screen.queryByTestId('erreur-enregistrement')).toBeNull());
    expect(screen.getByText('3 beantwortet · 6 übrig')).toBeTruthy();
  });

  it('etat_des_onglets_conserve_d_un_onglet_a_l_autre', async () => {
    cartesDirectes();
    const { ouvrir } = afficher('cartes');
    expect(await screen.findByText('0 beantwortet · 8 übrig')).toBeTruthy();
    await repondreALaCarte(t.cartes_su);
    fireEvent.click(await screen.findByRole('button', { name: t.cartes_retourner }));
    const courante = document.querySelector('.card .front')?.textContent;
    expect(screen.getByText('1 beantwortet · 7 übrig')).toBeTruthy();
    // La réponse est au journal : l'état dérivé est à jour avant qu'on quitte l'onglet.
    await screen.findByText(t.synchro_une_en_attente);

    // Un tour par l'aperçu : la série est celle d'avant, pas une série neuve de cartes neuves.
    ouvrir('apercu');
    expect(await screen.findByText(t.apercu_sures)).toBeTruthy();
    expect(screen.queryByText(/beantwortet/)).toBeNull();
    ouvrir('cartes');

    expect(await screen.findByText('1 beantwortet · 7 übrig')).toBeTruthy();
    expect(document.querySelector('.card .front')?.textContent).toBe(courante);
    expect(screen.getByRole('button', { name: t.cartes_su })).toBeTruthy();
  });

  it('etat_des_onglets_remis_a_zero_quand_le_contenu_change', async () => {
    cartesDirectes();
    await enregistrerCours(page.base as BaseLocale, ALICE, coursServiDeTest());
    const reseau = enAttente<CoursServi>();
    vi.mocked(lireCours).mockReturnValue(reseau.promesse);
    afficher('cartes');
    expect(await screen.findByText('0 beantwortet · 8 übrig')).toBeTruthy();
    await repondreALaCarte(t.cartes_su);
    expect(screen.getByText('1 beantwortet · 7 übrig')).toBeTruthy();
    await screen.findByText(t.synchro_une_en_attente);

    // Le serveur rend un contenu qui a changé : les unités de la série ne sont plus celles du cours.
    reseau.regler({ ...coursServiDeTest(), titre: 'Neuer Übungskurs' });

    expect(await screen.findByRole('heading', { name: 'Neuer Übungskurs' })).toBeTruthy();
    // Une série neuve : sans la carte répondue, qui n'est plus neuve ni due.
    expect(await screen.findByText('0 beantwortet · 7 übrig')).toBeTruthy();
  });

  it('onglet_repond_apres_un_contenu_remplace', async () => {
    // L'onglet des cartes est ouvert sur la copie de l'appareil quand le réseau rend un autre contenu.
    cartesDirectes();
    await enregistrerCours(page.base as BaseLocale, ALICE, coursServiDeTest());
    const reseau = enAttente<CoursServi>();
    vi.mocked(lireCours).mockReturnValue(reseau.promesse);
    afficher('cartes');
    expect(await screen.findByText('0 beantwortet · 8 übrig')).toBeTruthy();
    reseau.regler({ ...coursServiDeTest(), titre: 'Neuer Übungskurs' });
    expect(await screen.findByRole('heading', { name: 'Neuer Übungskurs' })).toBeTruthy();
    expect(await screen.findByText('0 beantwortet · 8 übrig')).toBeTruthy();

    // La mémoire des onglets a été remplacée sous l'onglet monté : il doit toujours répondre.
    fireEvent.click(await screen.findByRole('button', { name: t.cartes_retourner }));
    fireEvent.click(await screen.findByRole('button', { name: t.cartes_su }));

    expect(await screen.findByText('1 beantwortet · 7 übrig')).toBeTruthy();
  });

  it('etat_de_synchronisation_en_tete', async () => {
    vi.mocked(synchroniserCours).mockResolvedValue({ etat: 'hors_ligne', enAttente: 2 });

    afficher();

    const etat = await screen.findByTestId('etat-synchro');
    await waitFor(() => expect(etat.textContent).toBe('2 Antworten warten auf Verbindung'));
    expect(synchroniserCours).toHaveBeenCalledTimes(1);
  });

  it('texte_de_synchro_selon_la_file', () => {
    const texte = (enAttente: number, enCours = false, stockageIndisponible = false) =>
      texteDeSynchro(t, { enAttente, enCours, stockageIndisponible });

    // La file vide : tout ce qui a été répondu ici est chez le serveur.
    expect(texte(0)).toBe('Gespeichert in deinem Konto');
    expect(texte(1)).toBe('1 Antwort wartet auf Verbindung');
    expect(texte(3)).toBe('3 Antworten warten auf Verbindung');
    // Pendant une synchronisation, quelle que soit la file.
    expect(texte(0, true)).toBe('Speichere …');
    expect(texte(3, true)).toBe('Speichere …');
    // Sans stockage sur l'appareil, rien n'est gardé : jamais « Gespeichert ».
    expect(texte(0, false, true)).toBe('Speicher nicht verfügbar');
    expect(texte(0, true, true)).toBe('Speicher nicht verfügbar');
  });

  it('stockage_indisponible_l_en_tete_ne_dit_pas_gespeichert', async () => {
    // IndexedDB ne s'ouvre pas (fenêtre privée, stockage refusé) : le cours vient du réseau.
    page.base = undefined;

    afficher();

    expect(await screen.findByRole('heading', { name: 'Übungskurs' })).toBeTruthy();
    const etat = screen.getByTestId('etat-synchro');
    await waitFor(() => expect(etat.textContent).toBe(t.synchro_stockage_indisponible));
    expect(etat.textContent).not.toBe(t.synchro_a_jour);
  });

  it('contenu_lu_apres_le_demontage_n_est_pas_range', async () => {
    const base = page.base as BaseLocale;
    const reseau = enAttente<CoursServi>();
    vi.mocked(lireCours).mockReturnValue(reseau.promesse);
    const { unmount } = afficher();
    await waitFor(() => expect(lireCours).toHaveBeenCalled());

    // L'écran est quitté (une autre personne se connecte, par exemple) avant la réponse.
    unmount();
    reseau.regler(coursServiDeTest());
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(await coursLocal(base, ALICE, ID)).toBeUndefined();
  });

  // Le premier geste de chaque onglet qui ouvre une séance (2a-D3) : le branchement du prédicat
  // dans l'onglet, que `seances-en-cours.test.ts` ne voit pas.
  it.each([
    ['cartes', async () => repondreALaCarte(t.cartes_su)],
    ['mots', repondreAUneSerie],
    ['schemas', repondreAUneSerie],
    ['exercices', repondreAUneSerie],
    ['feuilles', async () => remplirLAppariement()],
  ] as const)('premier_geste_ouvre_une_seance_%s', async (onglet, geste) => {
    if (onglet === 'cartes') cartesDirectes();
    // Un mot se décompose sans hasard : le mode « mix » tirerait au sort.
    if (onglet === 'mots') preferer('mots', { mode: 'zerlegen' });
    history.replaceState(null, '', `/cours/${ID}/${onglet}`);
    afficher(onglet);
    await screen.findByRole('tab', { selected: true });
    expect(seanceEnCours()).toBeNull();

    await geste();

    expect(seanceEnCours()).toBe('journalisee');
  });

  it('changement_de_contenu_efface_la_seance', async () => {
    const base = page.base as BaseLocale;
    await enregistrerCours(base, ALICE, coursServiDeTest());
    const reseau = enAttente<CoursServi>();
    vi.mocked(lireCours).mockReturnValue(reseau.promesse);
    history.replaceState(null, '', `/cours/${ID}/quiz`);
    afficher('quiz');
    const [reponse] = await screen.findAllByRole('button', { name: /^\d\s/ });
    fireEvent.click(reponse as HTMLElement);
    expect(seanceEnCours()).toBe('journalisee');

    // Un autre contenu arrive du réseau : la mémoire des onglets, et la séance avec elle, repart
    // de zéro, car les unités de la série ne seraient plus celles du cours.
    reseau.regler({ ...coursServiDeTest(), titre: 'Neuer Kurs' });
    expect(await screen.findByRole('heading', { name: 'Neuer Kurs' })).toBeTruthy();

    expect(seanceEnCours()).toBeNull();
  });

  it('seance_retiree_avant_l_evaluation_de_la_navigation', async () => {
    // Le cours ou le compte selon l'adresse, comme dans App : sortir du cours démonte son écran.
    function CoursOuCompte() {
      return useChemin().startsWith('/cours') ? ecran('quiz') : <p>Konto</p>;
    }
    const adresseAvant = location.pathname + location.search + location.hash;
    history.replaceState(null, '', `/cours/${ID}/quiz`);
    // La règle de la navigation, différée comme dans `mise-a-jour.ts` (2a-D2), lit la séance.
    let seanceVue: Seance | null | undefined;
    const retirer = surNavigation(() =>
      differerApresLeRendu(() => {
        seanceVue = seanceEnCours();
      }),
    );
    try {
      render(<CoursOuCompte />);
      const [reponse] = await screen.findAllByRole('button', { name: /^\d\s/ });
      fireEvent.click(reponse as HTMLElement);
      await screen.findByText(t.synchro_une_en_attente);
      expect(seanceEnCours()).toBe('journalisee');

      // La navigation part hors de `act`, qui viderait d'office les fins d'effet en attente :
      // Preact garde ainsi l'ordre d'un navigateur.
      naviguer('/compte');
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(screen.getByText('Konto')).toBeTruthy();
      expect(seanceVue).toBeNull();
    } finally {
      retirer();
      history.replaceState(null, '', adresseAvant);
    }
  });

  it('bericht_commence_est_une_seance_retenue', async () => {
    history.replaceState(null, '', `/cours/${ID}/textes`);
    afficher('textes');
    const [option] = await screen.findAllByRole('button', { name: /^\d\s/ });
    expect(seanceEnCours()).toBeNull();

    // Un premier terme traduit : rien n'entre au journal avant le bilan, et une absence longue
    // n'abandonne pas le texte (2a-D4).
    fireEvent.click(option as HTMLElement);

    expect(document.querySelector('.report .tk.cur')?.textContent).toBe('Rösti');
    expect(seanceEnCours()).toBe('retenue');
  });

  it('pruefung_commencee_est_une_seance_retenue', async () => {
    history.replaceState(null, '', `/cours/${ID}/examen`);
    afficher('examen');
    const commencer = await screen.findByRole('button', { name: t.examen_starten });
    expect(seanceEnCours()).toBeNull();

    // Ses réponses n'iront au journal qu'à la remise (2a-D4).
    fireEvent.click(commencer);

    expect(screen.getByRole('button', { name: t.examen_ueberspringen })).toBeTruthy();
    expect(seanceEnCours()).toBe('retenue');
  });

  it('session_perdue_a_la_synchronisation_le_dit_a_l_application', async () => {
    vi.mocked(synchroniserCours).mockResolvedValue({ etat: 'reconnexion', enAttente: 1 });

    afficher();

    // L'application passe en « session expirée » ; l'écran du cours reste ouvert.
    await waitFor(() => expect(definirMoi).toHaveBeenCalledWith(undefined));
    expect(screen.getByRole('tablist')).toBeTruthy();
  });

  it('droit_retire_a_la_synchronisation_cours_introuvable', async () => {
    vi.mocked(synchroniserCours).mockResolvedValue({ etat: 'indisponible', enAttente: 1 });

    afficher();

    expect(await screen.findByText(textes.fr.cours_introuvable)).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('onglet en erreur', () => {
  /** Le rendu du quiz échoue ; la console ne montre pas l'erreur attendue. */
  function quizCasse() {
    const journal = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(Quiz).mockImplementation(() => {
      throw new Error('quiz cassé');
    });
    return journal;
  }

  it('onglet_en_erreur_garde_la_barre_d_onglets', async () => {
    const journal = quizCasse();
    const recharge = vi.spyOn(location, 'reload').mockImplementation(() => {});

    afficher('quiz');

    // Le message est dans la langue du cours (l'allemand), avec « Neu laden » ; l'erreur est
    // consignée dans la console.
    const alerte = await screen.findByRole('alert');
    expect(alerte.textContent).toContain(t.onglet_en_erreur);
    expect(journal).toHaveBeenCalled();
    // L'en-tête et la barre d'onglets restent là, l'onglet en erreur est le sélectionné.
    expect(screen.getByRole('heading', { name: 'Übungskurs' })).toBeTruthy();
    const barre = screen.getByRole('tablist');
    expect(
      within(barre).getByRole('tab', { name: t.onglet_quiz }).getAttribute('aria-selected'),
    ).toBe('true');
    // La barre répond : un autre onglet mène à son adresse.
    fireEvent.click(within(barre).getByRole('tab', { name: t.onglet_cartes }));
    expect(location.pathname).toBe(`/cours/${ID}/cartes`);
    // Et « Neu laden » recharge la page.
    fireEvent.click(within(alerte).getByRole('button', { name: t.recharger }));
    expect(recharge).toHaveBeenCalledTimes(1);
  });

  it('rattrapage_se_rearme_au_changement_d_onglet', async () => {
    quizCasse();
    const { ouvrir } = afficher('quiz');
    expect((await screen.findByRole('alert')).textContent).toContain(t.onglet_en_erreur);

    // Un autre onglet s'affiche normalement : l'erreur du quiz ne le suit pas.
    ouvrir('cartes');
    expect(await screen.findByText(/beantwortet/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    // Revenu au quiz, qui ne casse plus, il s'affiche : le Rattrapage a été remis à neuf.
    vi.mocked(Quiz).mockReset();
    ouvrir('quiz');
    expect(await screen.findByText(t.quiz_touches)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
