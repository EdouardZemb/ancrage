// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Mot } from '../../../domaine/contenu/modele.js';
import type { ModuleServiDe } from '../../../domaine/cours/prepare.js';
import { hasardDeterministe } from '../../../domaine/hasard.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { boutons, texteDe, touche } from '../onglets/onglets.fixture.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { QuestionMot, type TacheDeMot, tacheDeMot } from './QuestionMot.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;
const module = contexteDeTest().cours.morphologie as ModuleServiDe<'morphologie'>;
const trouve = module.mots.find(({ id }) => id === 'w0000001');
if (trouve === undefined) throw new Error('cours de test changé');
const gastritis: Mot = trouve;

/** La question avec la tâche qu'un appelant en garderait ; `onTache` reçoit chaque appel. */
function Posee(props: { depart: TacheDeMot; onTache(t: TacheDeMot, juste?: boolean): void }) {
  const [tache, setTache] = useState(props.depart);
  return (
    <QuestionMot
      module={module}
      tache={tache}
      onTache={(suivante, ...juste) => {
        setTache(suivante);
        props.onTache(suivante, ...juste);
      }}
      onSuivante={() => {}}
    />
  );
}

function PoseeAvecLibelle() {
  const depart = tacheDeMot(gastritis, 'bilden', module, hasardDeterministe(1));
  if (depart.mode !== 'bilden') throw new Error('mode');
  return (
    <QuestionMot
      module={module}
      tache={{ ...depart, verifie: { juste: true } }}
      onTache={() => {}}
      onSuivante={() => {}}
      libelleSuivante="Weiter"
    />
  );
}

function poser(mode: 'zerlegen' | 'bilden') {
  const onTache = vi.fn();
  const depart = tacheDeMot(gastritis, mode, module, hasardDeterministe(1));
  rendreDansLeCours(<Posee depart={depart} onTache={onTache} />, contexteDeTest());
  return onTache;
}

const sens = (id: string) => module.morphemes.find((m) => m.id === id)?.sens ?? '';

function choisir(texte: string) {
  const bouton = boutons().find((b) => texteDe(b) === texte);
  if (bouton === undefined) throw new Error(`Pas d'option « ${texte} »`);
  fireEvent.click(bouton);
}

function tuile(forme: string) {
  const trouvee = Array.from(document.querySelectorAll<HTMLButtonElement>('.tiles .tile')).find(
    (x) => x.textContent === forme,
  );
  if (trouvee === undefined) throw new Error(`Aucune tuile « ${forme} »`);
  return trouvee;
}

describe('QuestionMot', () => {
  it('le_libelle_de_la_suite_se_donne_et_son_defaut_est_nachstes_wort', () => {
    rendreDansLeCours(<PoseeAvecLibelle />, contexteDeTest());
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: t.mots_naechstes })).toBeNull();
  });

  it('tacheDeMot_zerlegen_commence_a_la_premiere_partie_avec_quatre_sens', () => {
    const tache = tacheDeMot(gastritis, 'zerlegen', module, hasardDeterministe(1));
    expect(tache).toMatchObject({ mode: 'zerlegen', etape: 0, resultats: [], fini: false });
    if (tache.mode !== 'zerlegen') throw new Error('mode');
    expect(tache.options).toHaveLength(4);
    expect(tache.options).toContain('Magen');
  });

  it('un_mot_decompose_sans_faute_ne_juge_qu_a_la_derniere_partie_en_un_seul_rappel', () => {
    const onTache = poser('zerlegen');
    choisir(sens('s0000001'));
    // Une partie ne juge rien : un rappel, sans verdict.
    expect(onTache).toHaveBeenCalledTimes(1);
    expect(onTache.mock.calls[0]).toHaveLength(1);
    expect(onTache.mock.calls[0][0]).toMatchObject({ etape: 1, resultats: [true], fini: false });

    choisir(sens('x0000001'));
    // La dernière partie : un seul rappel de plus, avec la tâche finie et le verdict.
    expect(onTache).toHaveBeenCalledTimes(2);
    expect(onTache.mock.calls[1][1]).toBe(true);
    expect(onTache.mock.calls[1][0]).toMatchObject({
      etape: 2,
      resultats: [true, true],
      fini: true,
    });
    expect(screen.getByRole('button', { name: t.mots_naechstes })).toBeTruthy();
  });

  it('une_partie_fausse_rend_le_mot_faux_et_les_touches_choisissent', () => {
    const onTache = poser('zerlegen');
    // Les touches 1 à 4 choisissent la proposition de même rang ; on fait une faute sûre.
    const faux = boutons()
      .map(texteDe)
      .findIndex((o) => o !== sens('s0000001'));
    touche(String(faux + 1));
    expect(onTache).toHaveBeenCalledTimes(1);
    expect(onTache.mock.calls[0][0]).toMatchObject({ resultats: [false] });
    const bon = boutons()
      .map(texteDe)
      .findIndex((o) => o === sens('x0000001'));
    touche(String(bon + 1));
    expect(onTache).toHaveBeenCalledTimes(2);
    expect(onTache.mock.calls[1][1]).toBe(false);
    expect(onTache.mock.calls[1][0]).toMatchObject({ resultats: [false, true], fini: true });
  });

  it('un_mot_bati_juste_appelle_onTache_verifie_vrai_une_seule_fois', () => {
    const onTache = poser('bilden');
    fireEvent.click(tuile('gastr'));
    expect(onTache).toHaveBeenCalledTimes(1);
    expect(onTache.mock.calls[0]).toHaveLength(1);
    fireEvent.click(tuile('-itis'));
    expect(onTache).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: t.pruefen }));
    expect(onTache).toHaveBeenCalledTimes(3);
    expect(onTache.mock.calls[2][1]).toBe(true);
    expect(onTache.mock.calls[2][0]).toMatchObject({ verifie: { juste: true } });
    expect(screen.getByRole('button', { name: t.mots_naechstes })).toBeTruthy();
  });

  it('un_mot_mal_bati_appelle_onTache_verifie_faux', () => {
    const onTache = poser('bilden');
    fireEvent.click(tuile('-itis'));
    fireEvent.click(screen.getByRole('button', { name: t.pruefen }));
    expect(onTache).toHaveBeenCalledTimes(2);
    expect(onTache.mock.calls[1][1]).toBe(false);
    expect(onTache.mock.calls[1][0]).toMatchObject({ verifie: { juste: false } });
  });

  it('retirer_le_dernier_ne_juge_rien', () => {
    const onTache = poser('bilden');
    fireEvent.click(tuile('-itis'));
    fireEvent.click(screen.getByRole('button', { name: t.mots_retirer }));
    expect(onTache).toHaveBeenCalledTimes(2);
    expect(onTache.mock.calls[1]).toHaveLength(1);
    expect(onTache.mock.calls[1][0]).toMatchObject({ choisies: [] });
  });
});
