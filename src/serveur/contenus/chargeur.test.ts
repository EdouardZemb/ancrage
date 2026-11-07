import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exempleDeCours, valeursDeNoticeDExemple } from '../../domaine/contenu/exemple.fixture.js';
import { chargerContenus, estUnDossier, lireFichiersContenus } from './chargeur.js';
import {
  creerDepotTemporaire,
  creerLien,
  dossierDuContenu,
  supprimerDepotsTemporaires,
} from './depot-temporaire.fixture.js';
import { DOSSIER_EXEMPLE } from './exemple.disque.fixture.js';

afterEach(supprimerDepotsTemporaires);

describe('lireFichiersContenus', () => {
  it('lit_un_dossier_avec_des_chemins_en_barres', () => {
    const attendu = exempleDeCours();
    const racine = creerDepotTemporaire(attendu);

    const fichiers = lireFichiersContenus(dossierDuContenu(racine));

    expect([...fichiers.keys()].sort()).toEqual([...attendu.keys()].sort());
    expect(fichiers.get('essai/schemas/muster.svg')).toBe(attendu.get('essai/schemas/muster.svg'));
    expect(fichiers.get('essai/cours.yaml')).toBe(attendu.get('essai/cours.yaml'));
  });
});

describe('estUnDossier', () => {
  it('distingue_un_dossier_d_un_fichier_et_d_un_absent', () => {
    const racine = creerDepotTemporaire(new Map([['a.txt', 'x']]));

    expect(estUnDossier(dossierDuContenu(racine))).toBe(true);
    expect(estUnDossier(path.join(dossierDuContenu(racine), 'a.txt'))).toBe(false);
    expect(estUnDossier(path.join(dossierDuContenu(racine), 'nulle-part'))).toBe(false);
  });
});

describe('chargerContenus', () => {
  it('lien_symbolique_refuse', (contexte) => {
    const racine = creerDepotTemporaire(new Map([['a.txt', 'x']]));
    const dossier = dossierDuContenu(racine);
    if (!creerLien(path.join(dossier, 'a.txt'), path.join(dossier, 'lien.txt'))) contexte.skip();

    expect(() => lireFichiersContenus(dossier)).toThrow(/lien symbolique/);
    expect(chargerContenus(dossier).erreurs).toEqual([
      { fichier: 'lien.txt', lieu: '', message: expect.stringMatching(/lien symbolique/) },
    ]);
  });

  it('analyse_un_dossier_valide', () => {
    const racine = creerDepotTemporaire(exempleDeCours());

    const resultat = chargerContenus(dossierDuContenu(racine));

    expect(resultat.erreurs).toEqual([]);
    expect(resultat.cours.map((cours) => cours.dossier)).toEqual(['essai']);
  });

  it('la_notice_de_l_exemple_sur_le_disque_est_celle_de_la_fixture', () => {
    // La notice d'exemple est écrite deux fois : `exemple-contenu/notice.yaml`, que le serveur sert
    // hors de la prod, et la constante `NOTICE` d'`exemple.fixture.ts`. Analysées par le schéma de
    // `notice.yaml`, elles donnent la même date, les mêmes valeurs dans les deux langues et les
    // mêmes liens.
    const surLeDisque = chargerContenus(DOSSIER_EXEMPLE);

    expect(surLeDisque.erreurs).toEqual([]);
    expect(surLeDisque.notice).toEqual(valeursDeNoticeDExemple());
  });

  it('dossier_absent_donne_une_erreur', () => {
    const racine = creerDepotTemporaire(new Map());
    const absent = path.join(dossierDuContenu(racine), 'nulle-part');

    const resultat = chargerContenus(absent);

    expect(resultat.cours).toEqual([]);
    expect(resultat.identifiants.size).toBe(0);
    expect(resultat.erreurs).toEqual([
      {
        fichier: '.',
        lieu: '',
        message: `dossier de contenus introuvable : ${path.resolve(absent)}`,
      },
    ]);
  });
});
