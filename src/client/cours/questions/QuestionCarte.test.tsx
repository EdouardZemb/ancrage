// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from '@testing-library/preact';
import { useState } from 'preact/hooks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type UniteDeCarte, unitesDeCartes } from '../../../domaine/cartes/unites.js';
import { coursServiDeTest } from '../../../domaine/cours/cours.fixture.js';
import { contexteDeTest, rendreDansLeCours } from '../contexte-cours.fixture.js';
import { touche } from '../onglets/onglets.fixture.js';
import { TEXTES_COURS } from '../textes-cours.js';
import { ETAT_DE_CARTE_NEUF, type EtatDeCarte, QuestionCarte } from './QuestionCarte.js';

afterEach(cleanup);

const t = TEXTES_COURS.de;
const unites = unitesDeCartes(
  coursServiDeTest().modules.flatMap((m) => (m.type === 'cartes' ? [m] : [])),
);
const HERZ = unites.find((u) => u.id === 'c1000001');
const HERZ_INVERSE = unites.find((u) => u.id === 'c1000001:inverse');
if (HERZ === undefined || HERZ_INVERSE === undefined) throw new Error('cours de test changé');

/** La carte, avec l'état qu'un appelant en garderait. */
function Posee(props: {
  unite: UniteDeCarte;
  saisie?: boolean;
  onReponse(juste: boolean): void;
  onEtat?(e: EtatDeCarte): void;
  rebelle?: boolean;
}) {
  const [etat, setEtat] = useState<EtatDeCarte>(ETAT_DE_CARTE_NEUF);
  return (
    <QuestionCarte
      unite={props.unite}
      saisie={props.saisie ?? false}
      etat={etat}
      onEtat={(e) => {
        setEtat(e);
        props.onEtat?.(e);
      }}
      onReponse={props.onReponse}
      rebelle={props.rebelle}
    />
  );
}

/** Un terme assez long pour qu'une lettre fausse soit tolérée (M5-D1), absent de l'index du cours. */
const LONG = {
  ...HERZ_INVERSE,
  id: 'c9000001:inverse',
  question: 'Tierchen im Brummelwald',
  reponse: 'Murmelkrat',
};

const AIDE = 'Ein Murmelkrat brummt im Wald.';
const AVEC_AIDE = { ...LONG, aide: AIDE };
const GRUENWURM = { ...LONG, id: 'c9000002:inverse', question: 'Gartentier', reponse: 'Grünwurm' };
const GRUENWURM_AIDE = { ...GRUENWURM, aide: AIDE };

/** Le bloc de l'aide, ou `null` : la classe que rend `AideDeLElement`. */
const bloc = () => document.querySelector('.aide');

function saisir(valeur: string) {
  fireEvent.input(screen.getByLabelText(t.cartes_saisie_etiquette), { target: { value: valeur } });
  fireEvent.click(screen.getByRole('button', { name: t.cartes_verifier }));
}

describe('QuestionCarte', () => {
  it('retourner_puis_su_repond_juste', () => {
    const onReponse = vi.fn();
    rendreDansLeCours(<Posee unite={HERZ} onReponse={onReponse} />, contexteDeTest());
    expect(screen.getByText(t.cartes_indice)).toBeTruthy();
    expect(screen.getByText(t.cartes_neuve)).toBeTruthy();
    expect(screen.getByText(t.cartes_touches)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.cartes_retourner }));
    fireEvent.click(screen.getByRole('button', { name: t.cartes_su }));
    expect(onReponse).toHaveBeenCalledTimes(1);
    expect(onReponse).toHaveBeenCalledWith(true, 'retournee');
  });

  it('pas_su_repond_faux_et_les_touches_repondent', () => {
    const onReponse = vi.fn();
    rendreDansLeCours(<Posee unite={HERZ} onReponse={onReponse} />, contexteDeTest());
    touche('1');
    expect(onReponse).not.toHaveBeenCalled();
    touche(' ');
    touche('1');
    expect(onReponse).toHaveBeenLastCalledWith(false, 'retournee');
    touche('2');
    expect(onReponse).toHaveBeenLastCalledWith(true, 'retournee');
  });

  it('une_saisie_fausse_montre_le_verdict_et_aussi_juste_repond_juste', () => {
    const onReponse = vi.fn();
    rendreDansLeCours(
      <Posee unite={HERZ_INVERSE} saisie onReponse={onReponse} />,
      contexteDeTest(),
    );
    expect(screen.getByText(t.cartes_touches_saisie)).toBeTruthy();
    fireEvent.input(screen.getByLabelText(t.cartes_saisie_etiquette), {
      target: { value: 'Xyz' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.cartes_verifier }));
    expect(onReponse).not.toHaveBeenCalled();
    expect(screen.getByText(t.cartes_fausse)).toBeTruthy();
    expect(screen.getByText('Xyz')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.cartes_aussi_juste }));
    expect(onReponse).toHaveBeenCalledTimes(1);
    expect(onReponse).toHaveBeenCalledWith(true, 'corrigee');
  });

  it('une_saisie_fausse_puis_suivante_repond_faux', () => {
    const onReponse = vi.fn();
    rendreDansLeCours(
      <Posee unite={HERZ_INVERSE} saisie onReponse={onReponse} />,
      contexteDeTest(),
    );
    fireEvent.input(screen.getByLabelText(t.cartes_saisie_etiquette), {
      target: { value: 'Xyz' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.cartes_verifier }));
    fireEvent.click(screen.getByRole('button', { name: t.cartes_suivante }));
    expect(onReponse).toHaveBeenCalledTimes(1);
    expect(onReponse).toHaveBeenCalledWith(false, 'saisie');
  });

  it('la_saisie_ne_vaut_que_pour_une_inverse', () => {
    rendreDansLeCours(<Posee unite={HERZ} saisie onReponse={vi.fn()} />, contexteDeTest());
    expect(screen.queryByLabelText(t.cartes_saisie_etiquette)).toBeNull();
    expect(screen.getByText(t.cartes_indice)).toBeTruthy();
  });

  it('retourner_ne_rappelle_que_l_etat', () => {
    const onReponse = vi.fn();
    const onEtat = vi.fn();
    rendreDansLeCours(
      <Posee unite={HERZ} onReponse={onReponse} onEtat={onEtat} />,
      contexteDeTest(),
    );
    touche('Enter');
    expect(onEtat).toHaveBeenCalledTimes(1);
    expect(onEtat).toHaveBeenCalledWith({ retournee: true, verdict: null });
    expect(onReponse).not.toHaveBeenCalled();
  });

  it('une_faute_de_frappe_est_signalee_sans_bouton_de_correction_et_repond_juste', () => {
    const onReponse = vi.fn();
    const { container } = rendreDansLeCours(
      <Posee unite={LONG} saisie onReponse={onReponse} />,
      contexteDeTest(),
    );
    saisir('Murmelkat');
    expect(screen.getByText(t.cartes_frappe)).toBeTruthy();
    expect(container.querySelector('.verdict.ok')).not.toBeNull();
    expect(container.querySelector('s')?.textContent).toBe('Murmelkat');
    expect(container.querySelector('b')?.textContent).toBe('Murmelkrat');
    expect(screen.queryByRole('button', { name: t.cartes_aussi_juste })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t.cartes_suivante }));
    expect(onReponse).toHaveBeenCalledTimes(1);
    expect(onReponse).toHaveBeenCalledWith(true, 'saisie');
  });

  it('une_saisie_exacte_n_affiche_pas_la_saisie_barree', () => {
    const { container } = rendreDansLeCours(
      <Posee unite={LONG} saisie onReponse={vi.fn()} />,
      contexteDeTest(),
    );
    saisir('murmelkrat');
    expect(screen.getByText(t.cartes_juste)).toBeTruthy();
    expect(screen.queryByText(t.cartes_frappe)).toBeNull();
    expect(container.querySelector('s')).toBeNull();
  });

  it('une_saisie_fausse_garde_le_bouton_de_correction_et_corrigee', () => {
    const onReponse = vi.fn();
    rendreDansLeCours(<Posee unite={LONG} saisie onReponse={onReponse} />, contexteDeTest());
    saisir('Zimbolwesp');
    expect(screen.queryByText(t.cartes_frappe)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t.cartes_aussi_juste }));
    expect(onReponse).toHaveBeenCalledWith(true, 'corrigee');
  });

  it('une_reponse_admise_differente_du_recto_affiche_la_saisie_non_barree_et_le_recto', () => {
    const autre = { ...LONG, reponses: ['Brummelwicht'] };
    const { container } = rendreDansLeCours(
      <Posee unite={autre} saisie onReponse={vi.fn()} />,
      contexteDeTest(),
    );
    saisir('Brummelwicht');
    expect(screen.getByText(t.cartes_juste)).toBeTruthy();
    expect(container.querySelector('s')).toBeNull();
    const saisieAffichee = [...container.querySelectorAll('.verdict span')].find(
      (e) => e.textContent === 'Brummelwicht',
    );
    expect(saisieAffichee).toBeTruthy();
    const recto = container.querySelector('b');
    expect(recto?.textContent).toBe('Murmelkrat');
    // La saisie vient avant le recto.
    expect(saisieAffichee?.compareDocumentPosition(recto as Element)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('une_saisie_qui_ne_differe_que_par_un_repli_de_digramme_n_affiche_pas_la_saisie', () => {
    const { container } = rendreDansLeCours(
      <Posee unite={{ ...LONG, reponse: 'Grünwurm' }} saisie onReponse={vi.fn()} />,
      contexteDeTest(),
    );
    saisir('Gruenwurm');
    expect(screen.getByText(t.cartes_juste)).toBeTruthy();
    expect(container.querySelectorAll('.verdict span')).toHaveLength(1);
  });

  it('une_saisie_egale_au_recto_a_la_casse_pres_n_affiche_pas_la_saisie', () => {
    const { container } = rendreDansLeCours(
      <Posee unite={LONG} saisie onReponse={vi.fn()} />,
      contexteDeTest(),
    );
    saisir('MURMELKRAT');
    expect(container.querySelectorAll('.verdict span')).toHaveLength(1);
    expect(container.querySelector('s')).toBeNull();
  });
  it('une_carte_retournee_montre_son_aide_au_verso_sans_etre_rebelle', () => {
    rendreDansLeCours(<Posee unite={AVEC_AIDE} onReponse={vi.fn()} />, contexteDeTest());
    expect(bloc()).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: t.cartes_retourner }));

    expect(screen.getByText(t.aide_titre)).toBeTruthy();
    expect(screen.getByText(AIDE)).toBeTruthy();
    const carte = document.querySelector('.card') as HTMLElement;
    const reponses = document.querySelector('.answer') as HTMLElement;
    expect(carte.compareDocumentPosition(bloc() as Element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      (bloc() as Element).compareDocumentPosition(reponses) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('une_saisie_fausse_montre_l_aide_avec_le_verdict', () => {
    rendreDansLeCours(<Posee unite={AVEC_AIDE} saisie onReponse={vi.fn()} />, contexteDeTest());
    expect(bloc()).toBeNull();

    saisir('Zimbolwesp');

    expect(screen.getByText(t.cartes_fausse)).toBeTruthy();
    expect(screen.getByText(t.aide_titre)).toBeTruthy();
    expect(screen.getByText(AIDE)).toBeTruthy();
  });

  it('une_saisie_presque_juste_montre_l_aide', () => {
    rendreDansLeCours(<Posee unite={AVEC_AIDE} saisie onReponse={vi.fn()} />, contexteDeTest());

    saisir('Murmelkrattt');

    expect(screen.getByText(t.cartes_presque)).toBeTruthy();
    expect(screen.getByText(AIDE)).toBeTruthy();
  });

  it('une_saisie_juste_ne_montre_pas_l_aide', () => {
    rendreDansLeCours(<Posee unite={AVEC_AIDE} saisie onReponse={vi.fn()} />, contexteDeTest());

    saisir('murmelkrat');

    expect(screen.getByText(t.cartes_juste)).toBeTruthy();
    expect(bloc()).toBeNull();
  });

  it('une_saisie_toleree_ne_montre_pas_l_aide_sauf_a_un_rebelle', () => {
    const cas: [typeof AVEC_AIDE, string, string][] = [
      [AVEC_AIDE, 'Murmelkat', t.cartes_frappe],
      [GRUENWURM_AIDE, 'Grunwurm', t.cartes_frappe],
      [GRUENWURM_AIDE, 'Gruenwurm', t.cartes_juste],
    ];
    for (const rebelle of [false, true]) {
      for (const [unite, saisie, verdict] of cas) {
        cleanup();
        rendreDansLeCours(
          <Posee unite={unite} saisie rebelle={rebelle} onReponse={vi.fn()} />,
          contexteDeTest(),
        );
        saisir(saisie);
        expect(screen.getByText(verdict)).toBeTruthy();
        expect(bloc() !== null).toBe(rebelle);
      }
    }
  });

  it('une_carte_sans_aide_ne_montre_rien_apres_une_faute', () => {
    rendreDansLeCours(<Posee unite={LONG} saisie onReponse={vi.fn()} />, contexteDeTest());

    saisir('Zimbolwesp');

    expect(screen.getByText(t.cartes_fausse)).toBeTruthy();
    expect(bloc()).toBeNull();
  });

  it('la_confusion_s_affiche_apres_une_faute_sans_etre_rebelle', () => {
    const confondue = { ...LONG, confonduAvec: HERZ.id };
    rendreDansLeCours(<Posee unite={confondue} saisie onReponse={vi.fn()} />, contexteDeTest());

    saisir('Zimbolwesp');

    expect(screen.getByText(t.cartes_fausse)).toBeTruthy();
    expect(screen.getByText(/Nicht verwechseln mit:/)).toBeTruthy();
    expect(screen.getByText(HERZ.question)).toBeTruthy();
  });
});
