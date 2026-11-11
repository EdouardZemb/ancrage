/*
 * Un contexte de cours factice pour les tests des onglets : le cours de test (`cours.fixture.ts`),
 * les textes allemands, un journal donné, et des fonctions espionnes (`vi.fn`) à la place de
 * l'enregistrement, de la synchronisation et de la navigation. Exclu de la construction, comme
 * tout `*.fixture.*`.
 */
import { act, render } from '@testing-library/preact';
import type { ComponentChild } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { vi } from 'vitest';
import { coursServiDeTest } from '../../domaine/cours/cours.fixture.js';
import { type Onglet, preparerCours } from '../../domaine/cours/prepare.js';
import { type CoursServi, memoireDuCours } from '../../domaine/cours/servi.js';
import { hasardDeterministe } from '../../domaine/hasard.js';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { ordonnanceurDe } from '../../domaine/progression/ordonnanceur.js';
import { APPAREIL_DE_TEST, idDeTest } from '../stockage/evenements.fixture.js';
import {
  type ContexteCours,
  ContexteDuCours,
  etatDOngletSur,
  oubliDOngletSur,
} from './contexte-cours.js';
import { preferencesParDefaut } from './preferences.js';
import { TEXTES_COURS } from './textes-cours.js';

/** L'état des unités, selon l'algorithme du cours, comme `useProgression`. */
function etatsDuCours(evenements: readonly Evenement[], cours: CoursServi) {
  return ordonnanceurDe({ leitner: cours.leitner, memoire: memoireDuCours(cours) })(evenements);
}

export const AUJOURDHUI_DE_TEST = '2026-10-17';

export function contexteDeTest(
  options: { cours?: CoursServi; evenements?: Evenement[]; aujourdhui?: string } = {},
): ContexteCours {
  const cours = preparerCours(options.cours ?? coursServiDeTest());
  const evenements = options.evenements ?? [];
  const memoire = new Map<string, unknown>();
  const oublier = oubliDOngletSur(memoire);
  return {
    cours,
    t: TEXTES_COURS.de,
    evenements,
    etats: etatsDuCours(evenements, cours.cours),
    aujourdhui: options.aujourdhui ?? AUJOURDHUI_DE_TEST,
    enregistrer: vi.fn(async () => true),
    enregistrerExamen: vi.fn(async () => true),
    finDeSeance: vi.fn(),
    preferences: preferencesParDefaut(cours),
    changerPreferences: vi.fn(),
    hasard: hasardDeterministe(1),
    aller: vi.fn(),
    useEtatDOnglet: etatDOngletSur(memoire),
    oublierEtatDOnglet: vi.fn(oublier),
  };
}

/** Affiche un onglet dans ce contexte. */
export function rendreDansLeCours(onglet: ComponentChild, contexte: ContexteCours) {
  return render(<ContexteDuCours.Provider value={contexte}>{onglet}</ContexteDuCours.Provider>);
}

/**
 * Comme `rendreDansLeCours`, mais le journal et les préférences vivent, comme dans `EcranCours` :
 * une réponse enregistrée entre au journal (donc dans les états) et un changement de préférences
 * s'applique. Les fonctions espionnes du contexte donné reçoivent tout de même les appels.
 */
export function rendreDansUnCoursVivant(onglet: ComponentChild, contexte: ContexteCours) {
  function Vivant() {
    const [evenements, setEvenements] = useState(contexte.evenements);
    const [preferences, setPreferences] = useState(contexte.preferences);
    const rang = useRef(0);
    const vivant = useMemo<ContexteCours>(
      () => ({
        ...contexte,
        evenements,
        etats: etatsDuCours(evenements, contexte.cours.cours),
        preferences,
        enregistrer: (unite, juste) => {
          rang.current += 1;
          const reponse = reponseDeTest(1000 + rang.current, unite, juste, contexte.aujourdhui);
          setEvenements((courants) => [...courants, reponse]);
          return contexte.enregistrer(unite, juste);
        },
        changerPreferences: (choisies) => {
          setPreferences(choisies);
          contexte.changerPreferences(choisies);
        },
      }),
      [evenements, preferences],
    );
    return <ContexteDuCours.Provider value={vivant}>{onglet}</ContexteDuCours.Provider>;
  }
  return render(<Vivant />);
}

/**
 * Comme `rendreDansUnCoursVivant`, avec plusieurs onglets entre lesquels `aller` (celui du contexte,
 * ou le retour rendu) passe : un seul est affiché à la fois, et la mémoire des onglets, elle, reste.
 */
export function rendreDansUnCoursNavigable(
  onglets: Partial<Record<Onglet, () => ComponentChild>>,
  depart: Onglet,
  contexte: ContexteCours,
) {
  let allerA: (onglet: Onglet) => void = () => {};
  const navigable: ContexteCours = {
    ...contexte,
    aller: (onglet) => {
      contexte.aller(onglet);
      allerA(onglet);
    },
  };
  function Onglets() {
    const [courant, setCourant] = useState<Onglet>(depart);
    allerA = setCourant;
    return <>{onglets[courant]?.()}</>;
  }
  const rendu = rendreDansUnCoursVivant(<Onglets />, navigable);
  return {
    ...rendu,
    /** La personne ouvre un autre onglet (par la barre d'onglets, par exemple). */
    aller: (onglet: Onglet) => {
      act(() => allerA(onglet));
    },
  };
}

/**
 * Un onglet que la personne quitte et retrouve : « ailleurs » le démonte (elle va voir un autre
 * onglet), « retour » le remonte. Ce que l'onglet garde de lui-même se voit à son retour.
 */
export function AllerRetour(props: { children: ComponentChild }) {
  const [ici, setIci] = useState(true);
  return (
    <>
      <button type="button" data-testid="ailleurs" onClick={() => setIci(false)}>
        ailleurs
      </button>
      <button type="button" data-testid="retour" onClick={() => setIci(true)}>
        retour
      </button>
      {ici && props.children}
    </>
  );
}

const sur2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Des événements du cours de test, écrits à la main (invariant 7) : le `n`-ième (de 0 à 3599)
 * porte l'identifiant `n` et la seconde `n` de 8 h, le jour donné.
 */
export function reponseDeTest(n: number, unite: string, juste: boolean, jour: string): Evenement {
  return {
    id: idDeTest(n),
    cours: 'cs000001',
    unite,
    type: 'reponse',
    resultat: { juste },
    repondu_a: `${jour}T08:${sur2(Math.floor(n / 60))}:${sur2(n % 60)}.000+02:00`,
    appareil: APPAREIL_DE_TEST,
    v: 1,
  };
}

export function examenDeTest(n: number, note: number, jour: string): Evenement {
  return {
    id: idDeTest(n),
    cours: 'cs000001',
    unite: 'ey000001',
    type: 'examen',
    resultat: { points: 15, questions: 20, note, minutes: 15, chapitres: 2 },
    repondu_a: `${jour}T08:${sur2(Math.floor(n / 60))}:${sur2(n % 60)}.000+02:00`,
    appareil: APPAREIL_DE_TEST,
    v: 1,
  };
}
