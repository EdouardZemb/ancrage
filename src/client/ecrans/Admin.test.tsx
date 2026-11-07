// @vitest-environment happy-dom
/*
 * L'écran d'administration, sur un faux serveur (`fetch` simulé) : la liste des personnes, leurs
 * passkeys et la suppression d'un compte (lot 1e, décisions 4 et 8), puis l'état d'échec propre à
 * chaque fiche et la suppression que seul un serveur du lot 1e connaît (lot 1f, 1f-D10).
 */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Moi, PasskeyEnregistree } from '../api.js';
import { formaterDate } from '../composants.js';
import { contexteAppDeTest, rendreDansLApp } from '../contexte.fixture.js';
import { json } from '../reponse.fixture.js';
import { textes, textesAdmin } from '../textes.js';
import { Admin } from './Admin.js';

const PROPRIETAIRE = 'p-proprietaire';
const LERNENDE = 'p-lernende';
const GROUPE = 'g-test';
const COURS = 'cours-de-test';

const MOI: Moi = {
  id: PROPRIETAIRE,
  nomAffiche: 'Propriétaire Test',
  langue: 'fr',
  proprietaire: true,
};
const t = textes.fr;
const T = textesAdmin;

/** Une personne comme `GET /api/admin/personnes` la donne ; `passkeys` manque d'un serveur d'avant. */
interface PersonneServie {
  id: string;
  nomAffiche: string;
  proprietaire: boolean;
  groupes: string[];
  droits: string[];
  nbAppareils: number;
  passkeys?: PasskeyEnregistree[];
}

/** Le faux serveur : les personnes qu'il connaît, et ce qu'il a reçu. */
interface FauxServeur {
  personnes: PersonneServie[];
  /** Les écritures reçues, dans l'ordre. */
  appels: string[];
  /** La suppression d'un compte répond 409 `proprietaire`, quelle que soit la personne. */
  refuseLesComptes: boolean;
  /** Les écritures qui échouent (500 `interne`), nommées comme dans `appels` : `POST lien <id>`… */
  echecs: Set<string>;
}

let serveur: FauxServeur;

/** Note une écriture reçue ; rend la réponse d'échec si `echecs` la nomme. */
function recevoir(appel: string): Response | undefined {
  serveur.appels.push(appel);
  return serveur.echecs.has(appel) ? json({ erreur: 'interne' }, 500) : undefined;
}

function repondre(url: string, methode: string): Response {
  // Chaque segment est décodé : une adresse mal encodée n'aurait pas la forme d'une route.
  const segments = (url.split('?')[0] ?? '').split('/').map(decodeURIComponent);
  const [, api, admin, ressource, id, sous, passkey] = segments;
  if (url === '/api/cours') return json([{ id: COURS, titre: 'Cours Test', langue: 'de' }]);
  if (api !== 'api' || admin !== 'admin') return json({ erreur: 'introuvable' }, 404);
  if (ressource === 'groupes') return json([{ id: GROUPE, nom: 'Groupe Test' }]);
  if (ressource === 'autorisations') return json([]);
  if (ressource !== 'personnes') return json({ erreur: 'introuvable' }, 404);

  if (id === undefined) return json(serveur.personnes);
  const personne = serveur.personnes.find((candidate) => candidate.id === id);
  if (personne === undefined) return json({ erreur: 'introuvable' }, 404);

  if (sous === undefined && methode === 'DELETE') {
    serveur.appels.push(`DELETE compte ${id}`);
    if (serveur.refuseLesComptes || personne.proprietaire) {
      return json({ erreur: 'proprietaire' }, 409);
    }
    serveur.personnes = serveur.personnes.filter((candidate) => candidate.id !== id);
    return new Response(null, { status: 204 });
  }
  if (sous === 'passkeys' && passkey !== undefined && methode === 'DELETE') {
    serveur.appels.push(`DELETE passkey ${id} ${passkey}`);
    const gardees = (personne.passkeys ?? []).filter((candidate) => candidate.id !== passkey);
    // Une clé qui n'est pas à cette personne répond comme une clé inconnue.
    if (gardees.length === (personne.passkeys ?? []).length) {
      return json({ erreur: 'introuvable' }, 404);
    }
    personne.passkeys = gardees;
    return new Response(null, { status: 204 });
  }
  if (sous === 'lien' && methode === 'POST') {
    return recevoir(`POST lien ${id}`) ?? json({ lien: 'https://ancrage.test/lien/exemple' });
  }
  if (sous === 'sessions' && methode === 'DELETE') {
    const echec = recevoir(`DELETE sessions ${id}`);
    if (echec !== undefined) return echec;
    // Les appareils sont déconnectés : la liste relue le montre.
    personne.nbAppareils = 0;
    return new Response(null, { status: 204 });
  }
  return json({ erreur: 'introuvable' }, 404);
}

/** Deux passkeys : un identifiant avec des caractères qui s'encodent, pour vérifier l'adresse. */
const PASSKEY_TELEPHONE: PasskeyEnregistree = {
  id: 'passkey/telephone+1',
  appareil: 'Android',
  creeLe: '2026-10-10T08:00:00.000Z',
  utiliseLe: '2026-10-17T09:30:00.000Z',
};
const PASSKEY_AUTRE: PasskeyEnregistree = {
  id: 'passkey/autre+2',
  appareil: 'autre',
  creeLe: '2026-10-12T08:00:00.000Z',
  utiliseLe: null,
};

const definirMoi = vi.fn();

function afficher() {
  return rendreDansLApp(<Admin />, contexteAppDeTest({ langue: 'fr', moi: MOI, definirMoi }));
}

/** La fiche d'une personne dans la liste, une fois les données chargées. */
async function fiche(nom: string): Promise<HTMLElement> {
  const liste = await screen.findByTestId('liste-personnes');
  const trouvee = within(liste)
    .getAllByRole('listitem')
    .find((candidate) => within(candidate).queryByText(nom, { selector: 'strong' }) !== null);
  if (trouvee === undefined) throw new Error(`pas de fiche pour ${nom}`);
  return trouvee;
}

beforeEach(() => {
  serveur = {
    personnes: [
      {
        id: PROPRIETAIRE,
        nomAffiche: 'Propriétaire Test',
        proprietaire: true,
        groupes: [],
        droits: [],
        nbAppareils: 1,
        passkeys: [{ ...PASSKEY_TELEPHONE, id: 'passkey/proprietaire+0' }],
      },
      {
        id: LERNENDE,
        nomAffiche: 'Lernende Test',
        proprietaire: false,
        groupes: [GROUPE],
        droits: [COURS],
        nbAppareils: 2,
        passkeys: [{ ...PASSKEY_TELEPHONE }, { ...PASSKEY_AUTRE }],
      },
    ],
    appels: [],
    refuseLesComptes: false,
    echecs: new Set(),
  };
  vi.stubGlobal('fetch', async (entree: string | URL | Request, init?: RequestInit) =>
    repondre(String(entree), init?.method ?? 'GET'),
  );
  definirMoi.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('personnes', () => {
  it('admin_liste_les_personnes', async () => {
    afficher();

    const proprietaire = await fiche('Propriétaire Test');
    expect(within(proprietaire).getByText(T.proprietaire)).toBeTruthy();
    expect(proprietaire.textContent).toContain(`${T.groupes_de} : ${T.aucun}`);

    const lernende = await fiche('Lernende Test');
    expect(within(lernende).queryByText(T.proprietaire)).toBeNull();
    // Les noms viennent des groupes et des cours chargés, pas de leurs identifiants.
    expect(lernende.textContent).toContain(`${T.groupes_de} : Groupe Test`);
    expect(lernende.textContent).toContain(`${T.cours_de} : Cours Test`);
    expect(lernende.textContent).toContain(`${T.appareils_connectes} : 2`);
  });

  it('admin_cree_un_lien_de_secours', async () => {
    afficher();
    const lernende = await fiche('Lernende Test');

    fireEvent.click(
      within(lernende).getByRole('button', { name: `${T.lien_secours} : Lernende Test` }),
    );

    expect((await within(lernende).findByTestId('lien-genere')).textContent).toBe(
      'https://ancrage.test/lien/exemple',
    );
    expect(serveur.appels).toEqual([`POST lien ${LERNENDE}`]);
  });

  it('deconnecter_ses_appareils_appelle_le_serveur_et_recharge', async () => {
    afficher();
    const lernende = await fiche('Lernende Test');
    expect(lernende.textContent).toContain(`${T.appareils_connectes} : 2`);
    const deconnecter = within(lernende).getByRole('button', {
      name: `${T.deconnecter_appareils} : Lernende Test`,
    });

    // Un seul toucher ne déconnecte rien : le bouton demande confirmation.
    fireEvent.click(deconnecter);
    expect(deconnecter.textContent).toBe(t.confirmer);
    expect(serveur.appels).toEqual([]);

    // Le second part vers le serveur, une seule fois, puis la liste est relue : le faux serveur
    // n'a plus d'appareil connecté à cette personne.
    fireEvent.click(deconnecter);
    await waitFor(() => expect(lernende.textContent).toContain(`${T.appareils_connectes} : 0`));
    expect(serveur.appels).toEqual([`DELETE sessions ${LERNENDE}`]);
  });

  it('l_erreur_d_une_action_s_affiche_dans_sa_fiche', async () => {
    // Le lien de secours de la première personne échoue ; la seconde n'a rien à voir avec lui.
    serveur.echecs.add(`POST lien ${LERNENDE}`);
    afficher();
    const ficheA = await fiche('Lernende Test');
    const ficheB = await fiche('Propriétaire Test');

    fireEvent.click(
      within(ficheA).getByRole('button', { name: `${T.lien_secours} : Lernende Test` }),
    );

    // L'échec se lit dans la fiche de A, après ses boutons, et nulle part ailleurs.
    expect((await within(ficheA).findByRole('alert')).textContent).toBe(t.erreur_interne);
    expect(within(ficheB).queryByRole('alert')).toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(1);

    // Une action réussie sur B ne touche pas l'échec de A.
    const deconnecterB = within(ficheB).getByRole('button', {
      name: `${T.deconnecter_appareils} : Propriétaire Test`,
    });
    fireEvent.click(deconnecterB);
    fireEvent.click(deconnecterB);
    await waitFor(() => expect(ficheB.textContent).toContain(`${T.appareils_connectes} : 0`));
    expect(within(ficheA).getByRole('alert').textContent).toBe(t.erreur_interne);

    // Une action réussie sur A efface son échec : plus aucune alerte.
    serveur.echecs.clear();
    fireEvent.click(
      within(ficheA).getByRole('button', { name: `${T.lien_secours} : Lernende Test` }),
    );
    expect(await within(ficheA).findByTestId('lien-genere')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/** Les lignes de la liste des passkeys d'une fiche. */
function lignesDePasskeys(laFiche: HTMLElement): HTMLElement[] {
  return within(within(laFiche).getByRole('list', { name: T.passkeys_titre })).getAllByRole(
    'listitem',
  );
}

/** Le nom accessible du bouton qui supprime une passkey, avant le toucher qui confirme. */
function nomDeSuppression(personne: string, passkey: PasskeyEnregistree): string {
  const appareil = passkey.appareil === 'autre' ? t.appareil_autre : passkey.appareil;
  return `${t.supprimer} : ${T.passkeys_titre}, ${personne}, ${appareil}, ${formaterDate(passkey.creeLe, 'fr')}`;
}

describe('passkeys', () => {
  it('admin_liste_les_passkeys_d_une_personne', async () => {
    // Une troisième personne n'a aucune passkey : l'écran le dit.
    serveur.personnes.push({
      id: 'p-sans-passkey',
      nomAffiche: 'Sans Passkey Test',
      proprietaire: false,
      groupes: [],
      droits: [],
      nbAppareils: 0,
      passkeys: [],
    });
    afficher();

    const lignes = lignesDePasskeys(await fiche('Lernende Test'));
    expect(lignes).toHaveLength(2);
    // Le type d'appareil, la création et le dernier usage.
    const [telephone, autre] = lignes.map((ligne) => ligne.textContent);
    expect(telephone).toContain('Android');
    expect(telephone).toContain(`${t.depuis} ${formaterDate(PASSKEY_TELEPHONE.creeLe, 'fr')}`);
    expect(telephone).toContain(
      `${t.derniere_activite} ${formaterDate(PASSKEY_TELEPHONE.utiliseLe ?? '', 'fr')}`,
    );
    // « autre » est un mot à traduire ; une passkey jamais utilisée le dit.
    expect(autre).toContain(t.appareil_autre);
    expect(autre).toContain(t.jamais_utilisee);
    for (const ligne of lignes) {
      expect(within(ligne).getByRole('button').textContent).toBe(t.supprimer);
    }

    const sans = await fiche('Sans Passkey Test');
    expect(within(sans).getByText(T.aucune_passkey)).toBeTruthy();
    expect(within(sans).queryByRole('list', { name: T.passkeys_titre })).toBeNull();
  });

  it('admin_supprime_une_passkey', async () => {
    afficher();
    const lernende = await fiche('Lernende Test');
    const supprimer = within(lernende).getByRole('button', {
      name: nomDeSuppression('Lernende Test', PASSKEY_TELEPHONE),
    });

    // Un seul toucher ne supprime rien : le bouton demande confirmation.
    fireEvent.click(supprimer);
    expect(supprimer.textContent).toBe(t.confirmer);
    expect(serveur.appels).toEqual([]);

    // Le second supprime la passkey, dont l'identifiant est encodé dans l'adresse.
    fireEvent.click(supprimer);
    await waitFor(() => expect(lignesDePasskeys(lernende)).toHaveLength(1));
    expect(serveur.appels).toEqual([`DELETE passkey ${LERNENDE} ${PASSKEY_TELEPHONE.id}`]);
    expect(lignesDePasskeys(lernende)[0]?.textContent).toContain(t.appareil_autre);

    // Même la dernière : le propriétaire retire ainsi la clé d'un téléphone perdu (1e-D8).
    const derniere = within(lernende).getByRole('button', {
      name: nomDeSuppression('Lernende Test', PASSKEY_AUTRE),
    });
    fireEvent.click(derniere);
    fireEvent.click(derniere);
    expect(await within(lernende).findByText(T.aucune_passkey)).toBeTruthy();
    expect(serveur.appels).toEqual([
      `DELETE passkey ${LERNENDE} ${PASSKEY_TELEPHONE.id}`,
      `DELETE passkey ${LERNENDE} ${PASSKEY_AUTRE.id}`,
    ]);
  });

  it('admin_supporte_un_serveur_sans_passkeys', async () => {
    // Après un retour arrière, l'application précachée lit la réponse d'un serveur d'avant le
    // lot 1e : ses personnes n'ont pas de champ `passkeys` (ADR-0008, §3).
    for (const personne of serveur.personnes) {
      delete personne.passkeys;
    }
    afficher();

    const lernende = await fiche('Lernende Test');
    expect(lernende.textContent).toContain(`${T.appareils_connectes} : 2`);
    // Rien n'est dit des passkeys, plutôt qu'« aucune » : on ne les connaît pas.
    expect(within(lernende).queryByRole('list', { name: T.passkeys_titre })).toBeNull();
    expect(within(lernende).queryByText(T.aucune_passkey)).toBeNull();
    expect(within(await fiche('Propriétaire Test')).queryByText(T.aucune_passkey)).toBeNull();
  });
});

describe('suppression d’un compte', () => {
  it('admin_supprime_un_compte', async () => {
    afficher();
    const lernende = await fiche('Lernende Test');
    const supprimer = within(lernende).getByRole('button', {
      name: `${T.supprimer_compte} : Lernende Test`,
    });
    expect(supprimer.textContent).toBe(T.supprimer_compte);

    // Un seul toucher ne supprime rien : le bouton dit ce qui sera effacé.
    fireEvent.click(supprimer);
    expect(supprimer.textContent).toBe(T.supprimer_compte_confirmer);
    expect(serveur.appels).toEqual([]);

    // Le second supprime le compte, et la liste est relue.
    fireEvent.click(supprimer);
    await waitFor(() =>
      expect(screen.queryByText('Lernende Test', { selector: 'strong' })).toBeNull(),
    );
    expect(serveur.appels).toEqual([`DELETE compte ${LERNENDE}`]);
    expect(await fiche('Propriétaire Test')).toBeTruthy();
  });

  it('admin_pas_de_suppression_pour_le_proprietaire', async () => {
    afficher();

    // Le compte du propriétaire ne se supprime pas (1e-D4) ; ses autres actions restent.
    const proprietaire = await fiche('Propriétaire Test');
    expect(within(proprietaire).queryByRole('button', { name: /Supprimer le compte/ })).toBeNull();
    expect(
      within(proprietaire).getByRole('button', { name: `${T.lien_secours} : Propriétaire Test` }),
    ).toBeTruthy();
    // Une autre personne a le bouton.
    expect(
      within(await fiche('Lernende Test')).getByRole('button', {
        name: `${T.supprimer_compte} : Lernende Test`,
      }),
    ).toBeTruthy();
  });

  it('serveur_d_avant_le_lot_1e_sans_suppression_de_compte', async () => {
    // Un serveur d'avant le lot 1e ne connaît pas la suppression d'un compte, et ses personnes
    // n'ont pas de champ `passkeys` : l'application précachée n'offre pas le bouton (1f-D10).
    for (const personne of serveur.personnes) {
      delete personne.passkeys;
    }
    afficher();

    const lernende = await fiche('Lernende Test');
    // La fiche est bien là, avec ses autres actions.
    expect(
      within(lernende).getByRole('button', { name: `${T.lien_secours} : Lernende Test` }),
    ).toBeTruthy();
    expect(
      within(lernende).getByRole('button', { name: `${T.deconnecter_appareils} : Lernende Test` }),
    ).toBeTruthy();
    expect(within(lernende).queryByRole('button', { name: /Supprimer le compte/ })).toBeNull();
  });

  it('admin_suppression_refusee_dit_pourquoi_et_garde_la_personne', async () => {
    // La liste date d'avant : le serveur refuse un compte devenu celui du propriétaire.
    serveur.refuseLesComptes = true;
    afficher();
    const supprimer = within(await fiche('Lernende Test')).getByRole('button', {
      name: `${T.supprimer_compte} : Lernende Test`,
    });

    fireEvent.click(supprimer);
    fireEvent.click(supprimer);

    expect((await screen.findByRole('alert')).textContent).toBe(t.erreur_proprietaire);
    expect(serveur.appels).toEqual([`DELETE compte ${LERNENDE}`]);
    expect(await fiche('Lernende Test')).toBeTruthy();
  });
});
