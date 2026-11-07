// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Seance } from '../seance.js';
import {
  etatDOngletSur,
  oubliDOngletSur,
  type PredicatsDeSeance,
  seanceDansLaMemoire,
} from './contexte-cours.js';

afterEach(cleanup);

type UtiliserEtat = ReturnType<typeof etatDOngletSur>;

/** Un compteur qui garde sa valeur dans la mémoire de l'écran ; un clic l'augmente. */
function Compteur(props: { utiliser: UtiliserEtat; cle: string; initial: () => number }) {
  const [valeur, ecrire] = props.utiliser(props.cle, props.initial);
  return (
    <button type="button" onClick={() => ecrire(valeur + 1)}>
      {`${props.cle}=${valeur}`}
    </button>
  );
}

describe('useEtatDOnglet', () => {
  it('valeur_gardee_apres_un_demontage', () => {
    const utiliser = etatDOngletSur(new Map());
    const initial = vi.fn(() => 10);
    const premier = render(<Compteur utiliser={utiliser} cle="a" initial={initial} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('a=12');

    // L'onglet est quitté, puis retrouvé : sa valeur, et `initial` n'est pas rappelé.
    premier.unmount();
    render(<Compteur utiliser={utiliser} cle="a" initial={initial} />);

    expect(screen.getByRole('button').textContent).toBe('a=12');
    expect(initial).toHaveBeenCalledTimes(1);
  });

  it('cles_independantes', () => {
    const utiliser = etatDOngletSur(new Map());
    render(
      <>
        <Compteur utiliser={utiliser} cle="a" initial={() => 0} />
        <Compteur utiliser={utiliser} cle="b" initial={() => 100} />
      </>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'a=0' }));

    expect(screen.getByRole('button', { name: 'a=1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'b=100' })).toBeTruthy();
  });

  it('oublier_une_cle_la_fait_repartir_de_initial_sans_toucher_aux_autres', () => {
    const memoire = new Map<string, unknown>();
    const utiliser = etatDOngletSur(memoire);
    const oublier = oubliDOngletSur(memoire);
    const premier = render(
      <>
        <Compteur utiliser={utiliser} cle="a" initial={() => 0} />
        <Compteur utiliser={utiliser} cle="b" initial={() => 100} />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'a=0' }));
    fireEvent.click(screen.getByRole('button', { name: 'b=100' }));
    premier.unmount();

    oublier('a');
    oublier('inconnue');
    render(
      <>
        <Compteur utiliser={utiliser} cle="a" initial={() => 0} />
        <Compteur utiliser={utiliser} cle="b" initial={() => 100} />
      </>,
    );

    expect(screen.getByRole('button', { name: 'a=0' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'b=101' })).toBeTruthy();
  });

  it('oublier_une_cle_oublie_aussi_ses_sous_cles', () => {
    const memoire = new Map<string, unknown>();
    const utiliser = etatDOngletSur(memoire);
    const oublier = oubliDOngletSur(memoire);
    const tout = (
      <>
        <Compteur utiliser={utiliser} cle="a" initial={() => 0} />
        <Compteur utiliser={utiliser} cle="a/b" initial={() => 10} />
        <Compteur utiliser={utiliser} cle="ab" initial={() => 20} />
      </>
    );
    const premier = render(tout);
    for (const nom of ['a=0', 'a/b=10', 'ab=20']) {
      fireEvent.click(screen.getByRole('button', { name: nom }));
    }
    premier.unmount();

    // Une sous-clé dépend de sa clé : l'oublier seule laisse la clé.
    oublier('a/b');
    render(tout);
    expect(screen.getByRole('button', { name: 'a=1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'a/b=10' })).toBeTruthy();
    // La sous-clé repart de zéro : on la modifie pour que son oubli, plus bas, se voie.
    fireEvent.click(screen.getByRole('button', { name: 'a/b=10' }));
    cleanup();

    // Oublier la clé emporte ses sous-clés, mais pas une clé qui commence par les mêmes lettres.
    oublier('a');
    render(tout);
    expect(screen.getByRole('button', { name: 'a=0' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'a/b=10' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'ab=21' })).toBeTruthy();
  });

  it('ecrire_suit_la_memoire_remplacee_sous_un_onglet_monte', () => {
    const premiere = etatDOngletSur(new Map());
    const rendu = render(<Compteur utiliser={premiere} cle="a" initial={() => 0} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('a=1');

    // L'écran du cours remplace sa mémoire sans démonter l'onglet : la lecture et l'écriture vont
    // toutes deux à la nouvelle.
    rendu.rerender(<Compteur utiliser={etatDOngletSur(new Map())} cle="a" initial={() => 0} />);
    expect(screen.getByRole('button').textContent).toBe('a=0');
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByRole('button').textContent).toBe('a=1');
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('a=2');
  });

  it('memoire_neuve_repart_de_initial', () => {
    const premiere = etatDOngletSur(new Map());
    const rendu = render(<Compteur utiliser={premiere} cle="a" initial={() => 0} />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('a=1');
    rendu.unmount();

    // Un autre cours, ou un autre contenu : une autre mémoire.
    render(<Compteur utiliser={etatDOngletSur(new Map())} cle="a" initial={() => 0} />);

    expect(screen.getByRole('button').textContent).toBe('a=0');
  });
});

describe('la séance dans la mémoire', () => {
  /** Une série en cours dès une réponse ; sans `seance`, le genre par défaut. */
  function Serie(props: { utiliser: UtiliserEtat; cle: string; seance?: Seance }) {
    const [valeur, ecrire] = props.utiliser(
      props.cle,
      () => 0,
      (faites) => faites > 0,
      props.seance,
    );
    return (
      <button type="button" onClick={() => ecrire(valeur + 1)}>
        {`${props.cle}=${valeur}`}
      </button>
    );
  }

  it('le_predicat_suit_l_etat_ecrit_et_la_seance_est_journalisee_par_defaut', () => {
    const memoire = new Map<string, unknown>();
    const predicats: PredicatsDeSeance = new Map();
    render(<Serie utiliser={etatDOngletSur(memoire, predicats)} cle="quiz" />);
    expect(seanceDansLaMemoire(memoire, predicats)).toBeNull();

    fireEvent.click(screen.getByRole('button'));

    expect(seanceDansLaMemoire(memoire, predicats)).toBe('journalisee');
  });

  it('une_seance_retenue_l_emporte_sur_une_journalisee', () => {
    const memoire = new Map<string, unknown>();
    const predicats: PredicatsDeSeance = new Map();
    const utiliser = etatDOngletSur(memoire, predicats);
    render(
      <>
        <Serie utiliser={utiliser} cle="quiz" />
        <Serie utiliser={utiliser} cle="examen" seance="retenue" />
      </>,
    );
    expect(seanceDansLaMemoire(memoire, predicats)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'quiz=0' }));
    expect(seanceDansLaMemoire(memoire, predicats)).toBe('journalisee');

    // L'onglet retenu est lu après le journalisé : il l'emporte tout de même.
    fireEvent.click(screen.getByRole('button', { name: 'examen=0' }));
    expect(seanceDansLaMemoire(memoire, predicats)).toBe('retenue');
  });

  it('un_onglet_sans_predicat_n_est_pas_une_seance', () => {
    const memoire = new Map<string, unknown>([['textes', 5]]);
    expect(seanceDansLaMemoire(memoire, new Map())).toBeNull();
  });

  it('l_oubli_retire_la_seance', () => {
    const memoire = new Map<string, unknown>();
    const predicats: PredicatsDeSeance = new Map();
    render(<Serie utiliser={etatDOngletSur(memoire, predicats)} cle="quiz" seance="retenue" />);
    fireEvent.click(screen.getByRole('button'));
    expect(seanceDansLaMemoire(memoire, predicats)).toBe('retenue');

    oubliDOngletSur(memoire, predicats)('quiz');

    expect(seanceDansLaMemoire(memoire, predicats)).toBeNull();
    expect(predicats.has('quiz')).toBe(false);
  });

  it('l_oubli_retire_aussi_les_predicats_des_sous_cles', () => {
    const memoire = new Map<string, unknown>([
      ['cartes', 1],
      ['cartes/imposee', 1],
    ]);
    const enCours = { enCours: () => true, seance: 'journalisee' } as const;
    const predicats: PredicatsDeSeance = new Map([
      ['cartes', enCours],
      ['cartes/imposee', enCours],
      ['cartesx', enCours],
    ]);

    oubliDOngletSur(memoire, predicats)('cartes');

    expect([...predicats.keys()]).toEqual(['cartesx']);
  });
});
