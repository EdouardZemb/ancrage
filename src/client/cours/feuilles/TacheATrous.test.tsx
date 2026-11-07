// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Tache } from '../../../domaine/contenu/modele.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { TacheATrous } from './TacheATrous.js';

afterEach(cleanup);

/* Données factices, écrites à la main (invariant 7). */

type TacheTrous = Extract<Tache, { genre: 'trous' }>;

function tacheDe(liste: string[] | undefined): TacheTrous {
  return {
    id: 'fa000041',
    genre: 'trous',
    consigne: 'Ergänzen Sie die Lücken.',
    ...(liste === undefined ? {} : { liste }),
    phrases: [
      {
        id: 'fb000041',
        texte: 'Das ___ pumpt das ___.',
        reponses: ['Herz', 'Blut'],
        statut: 'source',
      },
      { id: 'fb000042', texte: 'Die ___ wird gespült.', reponses: ['Cervix'], statut: 'source' },
    ],
  };
}

const LISTE = ['Blut', 'Herz', 'Cervix', 'Leber'];

/** Les cases du rang `n` dans leur phrase : « Lücke n », suivi du mot posé s'il y en a un. */
const case_ = (n: number) => screen.getAllByLabelText(new RegExp(`^Lücke ${n}(: |$)`));
const pastille = (mot: string) => screen.getByRole('button', { name: mot }) as HTMLButtonElement;
const pruefen = () => screen.getByRole('button', { name: 'Prüfen' }) as HTMLButtonElement;

describe('TacheATrous', () => {
  it('pastille_remplit_la_premiere_case_vide', () => {
    rendreDansLeCours(<TacheATrous tache={tacheDe(LISTE)} onRepondu={vi.fn()} />, contexteDeTest());

    fireEvent.click(pastille('Herz'));
    expect(case_(1)[0].textContent).toBe('Herz');
    expect(case_(2)[0].textContent?.trim()).toBe('');

    // La case suivante ; la phrase pleine, c'est la première case vide de la suivante.
    fireEvent.click(pastille('Blut'));
    expect(case_(2)[0].textContent).toBe('Blut');
    fireEvent.click(pastille('Leber'));
    expect(case_(1)[0].textContent).toBe('Herz');
    expect(case_(1)[1].textContent).toBe('Leber');
  });

  it('case_pleine_touchee_se_vide', () => {
    rendreDansLeCours(<TacheATrous tache={tacheDe(LISTE)} onRepondu={vi.fn()} />, contexteDeTest());
    fireEvent.click(pastille('Herz'));
    fireEvent.click(pastille('Blut'));

    fireEvent.click(case_(1)[0]);

    expect(case_(1)[0].textContent?.trim()).toBe('');
    expect(case_(2)[0].textContent).toBe('Blut');
    fireEvent.click(pastille('Leber'));
    expect(case_(1)[0].textContent).toBe('Leber');
  });

  it('phrase_a_deux_trous_juste_seulement_si_les_deux_le_sont', () => {
    const onRepondu = vi.fn();
    rendreDansLeCours(
      <TacheATrous tache={tacheDe(LISTE)} onRepondu={onRepondu} />,
      contexteDeTest(),
    );
    fireEvent.click(pastille('Herz'));
    fireEvent.click(pastille('Leber'));
    expect(onRepondu).not.toHaveBeenCalled();
    fireEvent.click(pastille('Cervix'));
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));

    expect(onRepondu).toHaveBeenCalledExactlyOnceWith([
      { id: 'fb000041', juste: false },
      { id: 'fb000042', juste: true },
    ]);
  });

  it('pastille_remplit_la_case_visee_dans_le_desordre', () => {
    const phrase = (n: number, reponse: string) => ({
      id: `fb00006${n}`,
      texte: `Satz ${n}: ___.`,
      reponses: [reponse],
      statut: 'source' as const,
    });
    const mots = ['Gewuerzmischung', 'Terminus', 'Nomenklatur'];
    const tache: TacheTrous = {
      id: 'fa000060',
      genre: 'trous',
      consigne: 'Ergänzen Sie.',
      liste: mots,
      phrases: [phrase(1, mots[0]), phrase(2, mots[1]), phrase(3, mots[2])],
    };
    const onRepondu = vi.fn();
    rendreDansLeCours(<TacheATrous tache={tache} onRepondu={onRepondu} />, contexteDeTest());
    const textes = () => case_(1).map((x) => x.textContent?.trim());
    // Par défaut, la visée est la première case vide.
    expect(case_(1).map((x) => x.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);

    // La phrase 3 d'abord, puis la phrase 1 : chaque pastille va dans la case visée.
    fireEvent.click(case_(1)[2]);
    expect(case_(1)[2].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pastille('Nomenklatur'));
    expect(textes()).toEqual(['', '', 'Nomenklatur']);
    // Phrase 3 pleine, sans case vide suivante dans la phrase : la première case vide de la tâche.
    expect(case_(1)[0].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pastille('Gewuerzmischung'));
    expect(textes()).toEqual(['Gewuerzmischung', '', 'Nomenklatur']);

    // Une case pleine touchée se vide et devient la visée.
    fireEvent.click(case_(1)[2]);
    expect(textes()).toEqual(['Gewuerzmischung', '', '']);
    expect(case_(1)[2].getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pastille('Terminus'));
    expect(textes()).toEqual(['Gewuerzmischung', '', 'Terminus']);
    fireEvent.click(pastille('Terminus'));
    expect(textes()).toEqual(['Gewuerzmischung', 'Terminus', 'Terminus']);

    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));
    expect(onRepondu).toHaveBeenCalledExactlyOnceWith([
      { id: 'fb000061', juste: true },
      { id: 'fb000062', juste: true },
      { id: 'fb000063', juste: false },
    ]);
  });

  it('case_annonce_le_mot_pose', () => {
    // Un lecteur d'écran entend la case et ce qu'elle contient (point 8 de la revue finale).
    rendreDansLeCours(<TacheATrous tache={tacheDe(LISTE)} onRepondu={vi.fn()} />, contexteDeTest());
    const etiquettes = () => case_(1).map((x) => x.getAttribute('aria-label'));
    expect(etiquettes()).toEqual(['Lücke 1', 'Lücke 1']);

    fireEvent.click(pastille('Herz'));

    expect(etiquettes()).toEqual(['Lücke 1: Herz', 'Lücke 1']);
    expect(case_(2)[0].getAttribute('aria-label')).toBe('Lücke 2');
    // Vidée, elle ne l'annonce plus.
    fireEvent.click(case_(1)[0]);
    expect(etiquettes()).toEqual(['Lücke 1', 'Lücke 1']);
  });

  it('pruefen_inactif_tant_qu_une_case_avec_liste_est_vide', () => {
    // Une case vide n'est pas une réponse fausse : rien n'est jugé ni enregistré (R16).
    const onRepondu = vi.fn();
    rendreDansLeCours(
      <TacheATrous tache={tacheDe(LISTE)} onRepondu={onRepondu} />,
      contexteDeTest(),
    );
    expect(pruefen().disabled).toBe(true);
    fireEvent.click(pastille('Herz'));
    fireEvent.click(pastille('Blut'));

    fireEvent.click(pruefen());

    expect(pruefen().disabled).toBe(true);
    expect(onRepondu).not.toHaveBeenCalled();
    expect(pastille('Cervix').disabled).toBe(false);
    fireEvent.click(pastille('Cervix'));
    expect(pruefen().disabled).toBe(false);
    // Une case vidée : « Prüfen » attend de nouveau.
    fireEvent.click(case_(1)[1]);
    expect(pruefen().disabled).toBe(true);
  });

  it('pruefen_inactif_tant_qu_une_case_sans_liste_est_vide', () => {
    const onRepondu = vi.fn();
    rendreDansLeCours(
      <TacheATrous tache={tacheDe(undefined)} onRepondu={onRepondu} />,
      contexteDeTest(),
    );
    const champs = [case_(1)[0], case_(2)[0], case_(1)[1]] as HTMLInputElement[];
    fireEvent.input(champs[0], { target: { value: 'Herz' } });
    // Des espaces seuls ne remplissent pas une case.
    fireEvent.input(champs[1], { target: { value: '  ' } });
    fireEvent.input(champs[2], { target: { value: 'Cervix' } });

    fireEvent.click(pruefen());

    expect(pruefen().disabled).toBe(true);
    expect(onRepondu).not.toHaveBeenCalled();
    expect(champs.every((champ) => !champ.disabled)).toBe(true);
    fireEvent.input(champs[1], { target: { value: 'Blut' } });
    fireEvent.click(pruefen());
    expect(onRepondu).toHaveBeenCalledExactlyOnceWith([
      { id: 'fb000041', juste: true },
      { id: 'fb000042', juste: true },
    ]);
  });

  it('trous_sans_liste_jugent_en_canonique', () => {
    const onRepondu = vi.fn();
    rendreDansLeCours(
      <TacheATrous tache={tacheDe(undefined)} onRepondu={onRepondu} />,
      contexteDeTest(),
    );
    expect(screen.queryByRole('button', { name: 'Herz' })).toBeNull();
    const champs = [case_(1)[0], case_(2)[0], case_(1)[1]] as HTMLInputElement[];
    expect(champs.every((champ) => champ.getAttribute('autocapitalize') === 'off')).toBe(true);

    // « herz » (casse) et « Zervix » (c et z) sont justes en canonique ; « Blutt » ne l'est pas.
    fireEvent.input(champs[0], { target: { value: 'herz' } });
    fireEvent.input(champs[1], { target: { value: 'Blutt' } });
    fireEvent.input(champs[2], { target: { value: 'Zervix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Prüfen' }));

    expect(onRepondu).toHaveBeenCalledExactlyOnceWith([
      { id: 'fb000041', juste: false },
      { id: 'fb000042', juste: true },
    ]);
  });
});
