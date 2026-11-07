import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  exempleDeCours,
  modifier,
  valeursDeNoticeDExemple,
} from '../domaine/contenu/exemple.fixture.js';
import { lireConfig } from './config.js';
import {
  creerDepotTemporaire,
  dossierDuContenu,
  supprimerDepotsTemporaires,
} from './contenus/depot-temporaire.fixture.js';
import { DOSSIER_EXEMPLE } from './contenus/exemple.disque.fixture.js';
import { contenusAuDemarrage, lancerLEntree } from './demarrage.js';
import type { ContenusCharges, demarrerServeur } from './serveur.js';

afterEach(supprimerDepotsTemporaires);

describe('contenusAuDemarrage', () => {
  it('demarrage_refuse_un_contenu_invalide', () => {
    const fichiers = exempleDeCours();
    fichiers.set('ids.lock', `${fichiers.get('ids.lock')}zzzzzzzz\n`);
    const racine = creerDepotTemporaire(fichiers);
    const lignes: string[] = [];

    const cours = contenusAuDemarrage(dossierDuContenu(racine), (ligne) => lignes.push(ligne));

    expect(cours).toBeUndefined();
    expect(lignes.length).toBeGreaterThan(0);
    expect(lignes).toEqual([expect.stringMatching(/^ids\.lock ligne \d+ : .*zzzzzzzz/)]);
  });

  it('demarrage_refuse_un_dossier_absent', () => {
    const racine = creerDepotTemporaire(new Map());
    const lignes: string[] = [];

    const cours = contenusAuDemarrage(path.join(dossierDuContenu(racine), 'vide'), (ligne) =>
      lignes.push(ligne),
    );

    expect(cours).toBeUndefined();
    expect(lignes).toEqual([expect.stringMatching(/^\. : dossier de contenus introuvable : /)]);
  });

  it('demarrage_accepte_le_cours_d_exemple', () => {
    const lignes: string[] = [];

    const contenus = contenusAuDemarrage(DOSSIER_EXEMPLE, (ligne) => lignes.push(ligne));

    expect(contenus?.cours.map((c) => c.dossier)).toEqual(['kueche']);
    expect(contenus?.notice.liens.length).toBeGreaterThan(0);
    expect(lignes).toEqual(['contenus chargés : 1 cours']);
  });

  it('demarrage_refuse_une_notice_absente_ou_invalide', () => {
    // Un lien qui n'est ni https:// ni mailto: rend le contenu non conforme (S1-D7).
    const sansNotice = exempleDeCours();
    sansNotice.delete('notice.yaml');
    const lienNonAdmis = modifier(
      exempleDeCours(),
      'notice.yaml',
      'cible: "https://protection.exemple.test"',
      'cible: "http://protection.exemple.test"',
    );

    for (const fichiers of [sansNotice, lienNonAdmis]) {
      const lignes: string[] = [];
      const racine = creerDepotTemporaire(fichiers);

      const contenus = contenusAuDemarrage(dossierDuContenu(racine), (ligne) => lignes.push(ligne));

      expect(contenus).toBeUndefined();
      expect(lignes).toEqual([expect.stringMatching(/^notice\.yaml /)]);
    }
  });

  it('demarrage_sans_notice_ni_erreur_le_dit', () => {
    // L'analyse rend toujours la notice, ou une erreur : un chargement qui ne rend ni l'une ni
    // l'autre refuse aussi le démarrage, avec une ligne qui le dit.
    const lignes: string[] = [];

    const contenus = contenusAuDemarrage(
      'dossier-fictif',
      (ligne) => lignes.push(ligne),
      () => ({ cours: [], erreurs: [], identifiants: new Map() }),
    );

    expect(contenus).toBeUndefined();
    expect(lignes).toEqual(['notice.yaml : valeurs introuvables.']);
  });

  it('demarrage_rend_les_cours_et_la_notice_de_l_exemple', () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    const contenus = contenusAuDemarrage(dossierDuContenu(racine), () => undefined);

    expect(contenus?.cours.map((c) => c.dossier)).toEqual(['essai']);
    expect(contenus?.notice).toEqual(valeursDeNoticeDExemple());
  });
});

describe('lancerLEntree', () => {
  // `vi.spyOn(process, 'on')` (`demarrageReussi`) ne survit pas au test.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const EN_PROD = { ANCRAGE_ENV: 'prod', ANCRAGE_URL_PUBLIQUE: 'https://ancrage.exemple.test' };
  const LISEZMOI: [string, string] = ['README.md', "# Le contenu de l'instance\n"];

  /** Un dossier de contenu valide, celui d'`exempleDeCours()`, avec ou sans `README.md`. */
  function contenuValide(avecLisezmoi = false): string {
    const fichiers = exempleDeCours();
    if (avecLisezmoi) fichiers.set(...LISEZMOI);
    return dossierDuContenu(creerDepotTemporaire(fichiers));
  }

  /** Un dossier qui ne porte que son `README.md`. */
  function lisezmoiSeul(): string {
    return dossierDuContenu(creerDepotTemporaire(new Map([LISEZMOI])));
  }

  /**
   * Un démarrage qui réussit, sans base ni écoute : `lancerLEntree` n'en lit que le journal, et les
   * signaux ne se branchent pas sur le processus des tests.
   */
  function demarrageReussi() {
    vi.spyOn(process, 'on').mockReturnValue(process);
    return vi.fn().mockResolvedValue({ app: { log: { info: vi.fn() } }, arreter: vi.fn() });
  }

  type Env = Record<string, string | undefined>;

  /** Lance l'entrée sur la configuration de `env` ; rend son code et les lignes écrites. */
  async function lancer(env: Env, demarrer: typeof demarrerServeur) {
    const lignes: string[] = [];
    const code = await lancerLEntree(lireConfig(env), (l) => lignes.push(l), demarrer);
    return { code, lignes };
  }

  /** L'entrée refuse, code 1, sans rien démarrer (ni base, ni écoute). Rend les lignes écrites. */
  async function refus(env: Env): Promise<string[]> {
    const demarrer = vi.fn();
    const { code, lignes } = await lancer(env, demarrer);
    expect(code, JSON.stringify(env)).toBe(1);
    expect(demarrer).not.toHaveBeenCalled();
    return lignes;
  }

  /** Le refus de la prod, sur `dossier` pour contenu monté ; l'exemple est valide par défaut. */
  function refusDeLaProd(
    dossier: string | undefined,
    exemple = contenuValide(),
  ): Promise<string[]> {
    return refus({ ...EN_PROD, ANCRAGE_CONTENUS: dossier, ANCRAGE_EXEMPLE_CONTENU: exemple });
  }

  /** Le démarrage réussit, code 0, et reçoit le cours `essai`. Rend les lignes écrites. */
  async function demarrageDeLEssai(env: Env): Promise<string[]> {
    const demarrer = demarrageReussi();
    const { code, lignes } = await lancer(env, demarrer);
    expect(code, JSON.stringify(env)).toBe(0);
    expect(demarrer).toHaveBeenCalledOnce();
    const [, contenus] = demarrer.mock.calls[0] as [unknown, ContenusCharges];
    expect(contenus.cours.map((c) => c.dossier)).toEqual(['essai']);
    return lignes;
  }

  /** La ligne du repli sur l'exemple. */
  function ligneDuRepli(exemple: string): string {
    return `contenu : l'exemple (${path.resolve(exemple)}), aucun contenu monté`;
  }

  it('entree_en_prod_sans_contenu_rend_1', async () => {
    const absent = path.join(creerDepotTemporaire(new Map()), 'contenu');
    // Un dossier qui manque, ou une variable absente : la prod ne sert jamais l'exemple.
    expect(await refusDeLaProd(absent)).toEqual([
      `contenu absent : ${path.resolve(absent)} ; la prod ne sert jamais l'exemple`,
    ]);
    expect(await refusDeLaProd(undefined)).toEqual([
      "contenu absent : ANCRAGE_CONTENUS non définie ; la prod ne sert jamais l'exemple",
    ]);
  });

  it('entree_en_prod_avec_un_readme_seul_rend_1', async () => {
    // Le gabarit du dépôt de données sème un README.md : seul, il ne fait pas un contenu (S1-D3).
    const dossier = lisezmoiSeul();

    expect(await refusDeLaProd(dossier)).toEqual([
      `contenu absent : ${path.resolve(dossier)} ; la prod ne sert jamais l'exemple`,
    ]);
  });

  it('entree_en_prod_sur_le_dossier_de_l_exemple_rend_1', async () => {
    // ANCRAGE_CONTENUS désigne l'exemple par erreur, même écrit autrement : la prod refuse.
    const exemple = contenuValide();
    for (const dossier of [
      exemple,
      path.relative(process.cwd(), exemple),
      `${exemple}${path.sep}`,
    ]) {
      expect(await refusDeLaProd(dossier, exemple)).toEqual([
        `contenu absent : ${exemple} est le dossier de l'exemple ; la prod ne sert jamais l'exemple`,
      ]);
    }
  });

  it('entree_sur_des_chemins_relatifs_ecrit_des_chemins_absolus', async () => {
    // Le défaut d'ANCRAGE_EXEMPLE_CONTENU est relatif : les lignes disent le chemin absolu.
    const exemple = contenuValide();
    const absent = path.join(creerDepotTemporaire(new Map()), 'contenu');
    const relatifs = [exemple, absent].map((chemin) => path.relative(process.cwd(), chemin));
    for (const relatif of relatifs) expect(path.isAbsolute(relatif), relatif).toBe(false);

    expect(
      await demarrageDeLEssai({ ANCRAGE_ENV: 'ci', ANCRAGE_EXEMPLE_CONTENU: relatifs[0] }),
    ).toEqual([
      `contenu : l'exemple (${exemple}), aucun contenu monté`,
      'contenus chargés : 1 cours',
    ]);
    expect(await refusDeLaProd(relatifs[1])).toEqual([
      `contenu absent : ${absent} ; la prod ne sert jamais l'exemple`,
    ]);
  });

  it('entree_sur_un_exemple_absent_ou_invalide_rend_1', async () => {
    // Hors de la prod, sans contenu monté : la ligne du repli, puis l'erreur de l'exemple.
    const absent = path.join(creerDepotTemporaire(new Map()), 'exemple');
    const fichiers = exempleDeCours();
    fichiers.set('ids.lock', `${fichiers.get('ids.lock')}zzzzzzzz\n`);
    const invalide = dossierDuContenu(creerDepotTemporaire(fichiers));
    for (const [exemple, erreur] of [
      [absent, /^\. : dossier de contenus introuvable : /],
      [invalide, /^ids\.lock ligne \d+ : .*zzzzzzzz/],
    ] as const) {
      expect(await refus({ ANCRAGE_ENV: 'ci', ANCRAGE_EXEMPLE_CONTENU: exemple })).toEqual([
        ligneDuRepli(exemple),
        expect.stringMatching(erreur),
      ]);
    }
  });

  it('entree_en_ci_sans_contenu_sert_l_exemple', async () => {
    const exemple = contenuValide();
    // Un dossier qui manque, ou qui ne porte que son README.md.
    for (const dossier of [
      path.join(dossierDuContenu(creerDepotTemporaire(new Map())), 'vide'),
      lisezmoiSeul(),
    ]) {
      const env = {
        ANCRAGE_ENV: 'ci',
        ANCRAGE_CONTENUS: dossier,
        ANCRAGE_EXEMPLE_CONTENU: exemple,
      };

      expect(await demarrageDeLEssai(env)).toEqual([
        ligneDuRepli(exemple),
        'contenus chargés : 1 cours',
      ]);
    }
  });

  it('entree_sans_environnement_sert_l_exemple', async () => {
    // Le cas du test de restauration : l'image lancée sans ANCRAGE_ENV ni contenu monté.
    const exemple = contenuValide();

    expect(await demarrageDeLEssai({ ANCRAGE_EXEMPLE_CONTENU: exemple })).toEqual([
      ligneDuRepli(exemple),
      'contenus chargés : 1 cours',
    ]);
  });

  it('entree_avec_un_contenu_monte_le_sert', async () => {
    // Un README.md à côté du contenu ne change rien ; l'exemple, qui manque, n'est jamais lu.
    const monte = contenuValide(true);
    for (const environnement of [EN_PROD, { ANCRAGE_ENV: 'ci' }]) {
      const env = {
        ...environnement,
        ANCRAGE_CONTENUS: monte,
        ANCRAGE_EXEMPLE_CONTENU: path.join(monte, 'absent'),
      };

      expect(await demarrageDeLEssai(env)).toEqual(['contenus chargés : 1 cours']);
    }
  });

  it('entree_dont_le_demarrage_echoue_rend_1', async () => {
    const config = lireConfig({ ANCRAGE_ENV: 'ci', ANCRAGE_CONTENUS: DOSSIER_EXEMPLE });
    const demarrer = vi.fn().mockRejectedValue(new Error('port pris'));
    const lignes: string[] = [];

    const code = await lancerLEntree(config, (ligne) => lignes.push(ligne), demarrer);

    expect(code).toBe(1);
    expect(lignes.at(-1)).toContain('Error: port pris');
  });
});
