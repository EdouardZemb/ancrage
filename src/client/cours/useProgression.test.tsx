// @vitest-environment happy-dom
import { act, cleanup, render, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coursServiDeTest } from '../../domaine/cours/cours.fixture.js';
import { type CoursPrepare, preparerCours } from '../../domaine/cours/prepare.js';
import { schemaEvenement, trierEvenements } from '../../domaine/journal/evenement.js';
import { identifiantAppareil } from '../appareil.js';
import { annulerSynchrosProgrammees, demanderSyncArrierePlan } from '../declencheurs.js';
import { fermerLesBasesDeTest, ouvrirBaseDeTest } from '../stockage/base-locale.fixture.js';
import type { BaseLocale } from '../stockage/base-locale.js';
import { ALICE, BERTHE } from '../stockage/evenements.fixture.js';
import {
  ajouterEvenement,
  evenementsDuCours,
  fileDuCours,
  recevoirEvenements,
} from '../stockage/journal-local.js';
import { synchroniserCours } from '../synchro.js';
import { reponseDeTest } from './contexte-cours.fixture.js';
import { useProgression } from './useProgression.js';

// La synchronisation est simulée ; la base de la page est celle du test.
vi.mock('../synchro.js', async (original) => ({
  ...(await original<typeof import('../synchro.js')>()),
  synchroniserCours: vi.fn(),
}));
vi.mock('../declencheurs.js', async (original) => ({
  ...(await original<typeof import('../declencheurs.js')>()),
  demanderSyncArrierePlan: vi.fn(async () => {}),
}));
const page = vi.hoisted(() => ({ base: undefined as BaseLocale | undefined }));
vi.mock('../stockage/base-de-la-page.js', () => ({
  baseDeLaPage: async () => {
    if (page.base === undefined) throw new Error('base de test absente');
    return page.base;
  },
}));

const cours = preparerCours(coursServiDeTest());
const ID = cours.cours.id;

type Progression = ReturnType<typeof useProgression>;
let courante: Progression | undefined;

function Sonde(props: { personne: string; cours: CoursPrepare }) {
  courante = useProgression(props.personne, props.cours);
  return null;
}

function progression(): Progression {
  if (courante === undefined) throw new Error('la sonde n’est pas affichée');
  return courante;
}

async function afficher(personne = ALICE): Promise<BaseLocale> {
  render(<Sonde personne={personne} cours={cours} />);
  await waitFor(() => expect(progression().enCours).toBe(false));
  return page.base as BaseLocale;
}

beforeEach(async () => {
  page.base = await ouvrirBaseDeTest();
  // Remis à zéro après l'attente : un appel resté en vol du test précédent ne compte pas ici.
  vi.mocked(synchroniserCours).mockReset();
  vi.mocked(synchroniserCours).mockResolvedValue({ etat: 'a_jour', enAttente: 0 });
  vi.mocked(demanderSyncArrierePlan).mockClear();
});

afterEach(() => {
  cleanup();
  // Une synchronisation programmée par un test ne part pas pendant le suivant.
  annulerSynchrosProgrammees();
  vi.useRealTimers();
  courante = undefined;
  fermerLesBasesDeTest();
  localStorage.clear();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('useProgression', () => {
  it('montage_lit_le_journal_local_puis_synchronise', async () => {
    const base = page.base as BaseLocale;
    const deja = reponseDeTest(1, 'c1000001', true, '2026-10-10');
    await ajouterEvenement(base, ALICE, deja);
    // Ce que la synchronisation rapporte d'un autre appareil entre aussi dans l'état.
    const dAilleurs = reponseDeTest(2, 'c1000002', true, '2026-10-11');
    vi.mocked(synchroniserCours).mockImplementation(async (b, personne, idCours) => {
      await recevoirEvenements(b, personne, idCours, [dAilleurs], 1);
      return { etat: 'a_jour', enAttente: 0 };
    });

    await afficher();

    expect(synchroniserCours).toHaveBeenCalledTimes(1);
    expect(synchroniserCours).toHaveBeenCalledWith(base, ALICE, ID);
    expect(progression().evenements).toEqual([deja, dAilleurs]);
    expect(progression().etats.get('c1000001')?.boite).toBe(1);
    expect(progression().etats.get('c1000002')?.boite).toBe(1);
    expect(progression().synchro).toBe('a_jour');
    expect(progression().enAttente).toBe(0);
  });

  it('charge_seulement_une_fois_le_journal_local_lu', async () => {
    const deja = reponseDeTest(1, 'c1000001', true, '2026-10-10');
    await ajouterEvenement(page.base as BaseLocale, ALICE, deja);
    // Chaque rendu de l'écran : un onglet qui se construit d'après le journal ne doit jamais voir
    // `charge` sans le journal.
    const rendus: [boolean, number][] = [];
    function Observe() {
      const { charge, evenements } = useProgression(ALICE, cours);
      rendus.push([charge, evenements.length]);
      return null;
    }

    render(<Observe />);
    expect(rendus[0]).toEqual([false, 0]);
    await waitFor(() => expect(rendus.at(-1)?.[0]).toBe(true));

    expect(rendus.at(-1)).toEqual([true, 1]);
    expect(rendus.some(([charge, nombre]) => charge && nombre === 0)).toBe(false);
  });

  it('enregistrer_ajoute_un_evenement_valide_et_recalcule', async () => {
    const base = await afficher();

    await act(async () => {
      await progression().enregistrer('c1000001:inverse', true);
    });

    const [evenement] = progression().evenements;
    expect(progression().evenements).toHaveLength(1);
    expect(schemaEvenement.safeParse(evenement).success).toBe(true);
    expect(evenement).toMatchObject({
      cours: ID,
      unite: 'c1000001:inverse',
      type: 'reponse',
      resultat: { juste: true },
      appareil: identifiantAppareil(),
      v: 1,
    });
    // Le jour de la réponse est le jour local : celui de `aujourdhui`.
    expect(evenement.repondu_a.slice(0, 10)).toBe(progression().aujourdhui);
    expect(progression().etats.get('c1000001:inverse')).toMatchObject({ boite: 1, justes: 1 });
    // Rangé au journal local et dans la file, sous la personne.
    expect(await evenementsDuCours(base, ALICE, ID)).toEqual([evenement]);
    expect(await fileDuCours(base, ALICE, ID)).toEqual([evenement]);
    expect(await evenementsDuCours(base, BERTHE, ID)).toEqual([]);
    expect(progression().enAttente).toBe(1);
    // Pas de synchronisation à chaque réponse : seulement au montage et en fin de séance.
    expect(synchroniserCours).toHaveBeenCalledTimes(1);
  });

  it('rangement_echoue_rend_faux_et_signale_l_erreur', async () => {
    const base = await afficher();
    expect(progression().erreurEnregistrement).toBe(false);
    const resultat = { points: 1, questions: 2, note: 3.5, minutes: 5, chapitres: 2 };
    let rangee: boolean | undefined;

    // Le stockage refuse (la base de la page est indisponible) : ni rejet, ni trace dans le journal.
    page.base = undefined;
    await act(async () => {
      rangee = await progression().enregistrer('c1000001', true);
    });
    expect(rangee).toBe(false);
    expect(progression().erreurEnregistrement).toBe(true);
    expect(progression().evenements).toEqual([]);
    expect(progression().enAttente).toBe(0);

    // L'examen remis de même.
    await act(async () => {
      rangee = await progression().enregistrerExamen(resultat, [
        { unite: 'c2000001', juste: true },
      ]);
    });
    expect(rangee).toBe(false);
    expect(progression().erreurEnregistrement).toBe(true);
    expect(progression().evenements).toEqual([]);

    // Le stockage revient : la réponse suivante est rangée, et l'erreur s'efface.
    page.base = base;
    await act(async () => {
      rangee = await progression().enregistrer('c1000001', true);
    });
    expect(rangee).toBe(true);
    expect(progression().erreurEnregistrement).toBe(false);
    expect(progression().evenements).toHaveLength(1);
    expect(progression().enAttente).toBe(1);
  });

  it('rangement_reussi_rend_vrai', async () => {
    await afficher();
    let rangee: boolean | undefined;

    await act(async () => {
      rangee = await progression().enregistrer('c1000001', false);
    });
    expect(rangee).toBe(true);
    await act(async () => {
      rangee = await progression().enregistrerExamen(
        { points: 1, questions: 1, note: 4, minutes: 5, chapitres: 1 },
        [{ unite: 'c1000001', juste: true }],
      );
    });
    expect(rangee).toBe(true);
    expect(progression().erreurEnregistrement).toBe(false);
  });

  it('enregistrer_examen_les_reponses_puis_l_examen_dans_l_ordre', async () => {
    const base = await afficher();
    const resultat = { points: 1, questions: 2, note: 3.5, minutes: 5, chapitres: 2 };

    await act(async () => {
      await progression().enregistrerExamen(resultat, [
        { unite: 'c2000001', juste: true },
        { unite: 'w0000001', juste: false },
      ]);
    });

    const evenements = await evenementsDuCours(base, ALICE, ID);
    expect(evenements.map(({ type, unite }) => [type, unite])).toEqual([
      ['reponse', 'c2000001'],
      ['reponse', 'w0000001'],
      // L'unité d'un examen est l'identifiant du module `examen` (décision 8).
      ['examen', cours.examen?.id],
    ]);
    expect(evenements[2]).toMatchObject({ type: 'examen', resultat });
    // Des instants strictement croissants : l'ordre ne dépend pas des `id` tirés au hasard.
    const instants = evenements.map(({ repondu_a }) => Date.parse(repondu_a));
    expect(instants[0]).toBeLessThan(instants[1]);
    expect(instants[1]).toBeLessThan(instants[2]);
    expect(trierEvenements(progression().evenements)).toEqual(evenements);
    expect(progression().evenements).toEqual(evenements);
    expect(progression().etats.get('w0000001')).toMatchObject({ boite: 1, fausses: 1 });
    expect(progression().enAttente).toBe(3);
  });

  it('une_reponse_synchronise_trois_secondes_apres_la_derniere', async () => {
    await afficher();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

    await act(async () => {
      await progression().enregistrer('c1000001', true);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
      await progression().enregistrer('c1000002', false);
      await vi.advanceTimersByTimeAsync(2999);
    });
    // Une seule synchronisation, celle du montage, tant que les réponses se suivent.
    expect(synchroniserCours).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(synchroniserCours).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    await waitFor(() => expect(progression().enCours).toBe(false));
  });

  it('quitter_le_cours_dans_les_3_s_envoie_quand_meme', async () => {
    const { unmount } = render(<Sonde personne={ALICE} cours={cours} />);
    await waitFor(() => expect(progression().enCours).toBe(false));
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await act(async () => {
      await progression().enregistrer('c1000001', true);
    });

    // L'écran est quitté avant les 3 s : la synchronisation programmée part tout de suite, pour
    // la même personne et le même cours (décision 15).
    unmount();
    await vi.waitFor(() => expect(synchroniserCours).toHaveBeenCalledTimes(2));
    expect(vi.mocked(synchroniserCours).mock.calls[1]?.slice(1)).toEqual([ALICE, ID]);
    // Et pas une seconde fois à l'échéance.
    await vi.advanceTimersByTimeAsync(5000);
    expect(synchroniserCours).toHaveBeenCalledTimes(2);
  });

  it('quitter_le_cours_hors_ligne_demande_la_synchronisation_en_arriere_plan', async () => {
    const { unmount } = render(<Sonde personne={ALICE} cours={cours} />);
    await waitFor(() => expect(progression().enCours).toBe(false));
    await act(async () => {
      await progression().enregistrer('c1000001', true);
    });
    vi.mocked(synchroniserCours).mockResolvedValue({ etat: 'hors_ligne', enAttente: 1 });

    // L'écran est quitté dans les 3 s, sans réseau : l'envoi part tout de suite, échoue, et le
    // service worker est chargé de le refaire au retour du réseau (décision 15).
    unmount();

    await vi.waitFor(() => expect(demanderSyncArrierePlan).toHaveBeenCalledTimes(1));
    expect(synchroniserCours).toHaveBeenCalledTimes(2);
  });

  it('retour_du_reseau_et_passage_en_arriere_plan_synchronisent', async () => {
    const { unmount } = render(<Sonde personne={ALICE} cours={cours} />);
    await waitFor(() => expect(progression().enCours).toBe(false));

    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(synchroniserCours).toHaveBeenCalledTimes(2));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(synchroniserCours).toHaveBeenCalledTimes(3));

    // L'écran quitté (une autre personne s'est connectée, par exemple), ses déclencheurs ne
    // synchronisent plus rien, pas même dans l'instant qui suit.
    unmount();
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    window.dispatchEvent(new Event('online'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(synchroniserCours).toHaveBeenCalledTimes(3);
  });

  it('hors_ligne_demande_la_synchronisation_en_arriere_plan', async () => {
    vi.mocked(synchroniserCours).mockResolvedValue({ etat: 'hors_ligne', enAttente: 1 });

    await afficher();

    expect(demanderSyncArrierePlan).toHaveBeenCalledTimes(1);
    // À jour, rien n'est demandé au service worker.
    vi.mocked(synchroniserCours).mockResolvedValue({ etat: 'a_jour', enAttente: 0 });
    act(() => progression().finDeSeance());
    await waitFor(() => expect(progression().synchro).toBe('a_jour'));
    expect(demanderSyncArrierePlan).toHaveBeenCalledTimes(1);
  });

  it('stockage_indisponible_se_signale', async () => {
    page.base = undefined;

    await afficher();

    expect(progression().stockageIndisponible).toBe(true);
    expect(progression().charge).toBe(true);
  });

  it('fin_de_seance_synchronise', async () => {
    await afficher();
    vi.mocked(synchroniserCours).mockResolvedValue({ etat: 'hors_ligne', enAttente: 2 });

    act(() => progression().finDeSeance());

    expect(progression().enCours).toBe(true);
    await waitFor(() => expect(progression().enCours).toBe(false));
    expect(synchroniserCours).toHaveBeenCalledTimes(2);
    expect(progression().synchro).toBe('hors_ligne');
    expect(progression().enAttente).toBe(2);
  });
});
