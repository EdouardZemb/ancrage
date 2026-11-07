import { describe, expect, it } from 'vitest';
import {
  ajouterAuVerrou,
  comparerVerrous,
  type EntreeVerrou,
  lireVerrou,
  verifierVerrou,
} from './verrou.js';

const A = 'aaaaaaaa';
const B = 'bbbbbbbb';
const C = 'cccccccc';

const entree = (id: string, ligne: number, retire = false): EntreeVerrou => ({ id, retire, ligne });

describe('lireVerrou', () => {
  it('lit_les_entrees_et_ignore_les_commentaires', () => {
    const texte = `# Identifiants émis\n\n${A}\n${B} retiré\n   \n# fin\n`;

    expect(lireVerrou(texte)).toEqual({
      entrees: [entree(A, 3), entree(B, 4, true)],
      erreurs: [],
    });
    expect(lireVerrou(`${A}\r\n${B} retiré\r\n`)).toEqual({
      entrees: [entree(A, 1), entree(B, 2, true)],
      erreurs: [],
    });
    expect(lireVerrou('')).toEqual({ entrees: [], erreurs: [] });
  });

  it('refuse_une_ligne_mal_formee', () => {
    for (const ligne of ['abc', 'abcdefgh retire', 'abcdefgh retiré x']) {
      const { entrees, erreurs } = lireVerrou(`${A}\n${ligne}\n`);

      expect(entrees).toEqual([entree(A, 1)]);
      expect(erreurs).toEqual([
        { fichier: 'ids.lock', lieu: 'ligne 2', message: expect.stringMatching(/mal formée/) },
      ]);
    }
  });

  it('ligne_avec_espaces_refusee', () => {
    for (const ligne of [` ${A}`, `${A} `]) {
      const { erreurs } = lireVerrou(`${ligne}\n`);

      expect(erreurs).toEqual([
        {
          fichier: 'ids.lock',
          lieu: 'ligne 1',
          message: expect.stringContaining('sans espace avant ni après'),
        },
      ]);
    }
  });

  it('refuse_un_doublon_dans_le_verrou', () => {
    const { entrees, erreurs } = lireVerrou(`${A}\n${B}\n${A} retiré\n`);

    expect(entrees).toEqual([entree(A, 1), entree(B, 2)]);
    expect(erreurs).toEqual([
      {
        fichier: 'ids.lock',
        lieu: 'ligne 3',
        message: expect.stringMatching(new RegExp(`${A}.*déjà.*ligne 1`)),
      },
    ]);
  });
});

describe('verifierVerrou', () => {
  it('sonde_negative_identifiant_absent_du_verrou', () => {
    const contenu = new Map([
      [A, 'terminologie/cartes.yaml:cartes[0].id'],
      [B, 'terminologie/cartes.yaml:cartes[1].id'],
    ]);

    expect(verifierVerrou(contenu, [entree(A, 1)])).toEqual([
      {
        fichier: 'terminologie/cartes.yaml',
        lieu: 'cartes[1].id',
        message: expect.stringMatching(
          new RegExp(`${B}.*absent d'ids.lock.*corepack pnpm contenus:verrouiller`),
        ),
      },
    ]);
  });

  it('sonde_negative_identifiant_retire_reutilise', () => {
    const contenu = new Map([[A, 'terminologie/cartes.yaml:cartes[0].id']]);

    expect(verifierVerrou(contenu, [entree(A, 4, true)])).toEqual([
      {
        fichier: 'terminologie/cartes.yaml',
        lieu: 'cartes[0].id',
        message: expect.stringMatching(new RegExp(`${A}.*retiré.*réutilisé`)),
      },
    ]);
  });

  it('sonde_negative_identifiant_disparu_sans_retrait', () => {
    const contenu = new Map([[A, 'terminologie/cartes.yaml:cartes[0].id']]);

    expect(verifierVerrou(contenu, [entree(A, 1), entree(B, 7)])).toEqual([
      {
        fichier: 'ids.lock',
        lieu: 'ligne 7',
        message: expect.stringMatching(new RegExp(`${B}.*disparu sans être marqué retiré`)),
      },
    ]);
  });

  it('retrait_explicite_accepte', () => {
    const contenu = new Map([[A, 'terminologie/cartes.yaml:cartes[0].id']]);

    expect(verifierVerrou(contenu, [entree(A, 1), entree(B, 2, true)])).toEqual([]);
  });
});

describe('comparerVerrous', () => {
  it('sonde_negative_ligne_supprimee_du_verrou', () => {
    expect(comparerVerrous([entree(A, 1), entree(B, 2)], [entree(A, 1)])).toEqual([
      {
        fichier: 'ids.lock',
        lieu: 'ligne 2',
        message: expect.stringMatching(new RegExp(`${B}.*ne fait que grandir`)),
      },
    ]);
  });

  it('sonde_negative_retrait_annule', () => {
    expect(comparerVerrous([entree(A, 1, true)], [entree(A, 3)])).toEqual([
      {
        fichier: 'ids.lock',
        lieu: 'ligne 3',
        message: expect.stringMatching(new RegExp(`${A}.*retrait.*annulé`)),
      },
    ]);
  });

  it('accepte_un_verrou_qui_grandit', () => {
    const base = [entree(A, 1), entree(B, 2, true)];
    const courant = [entree(A, 2, true), entree(B, 3, true), entree(C, 4)];

    expect(comparerVerrous(base, courant)).toEqual([]);
    expect(comparerVerrous([], [])).toEqual([]);
  });
});

describe('ajouterAuVerrou', () => {
  it('ajouter_au_verrou_conserve_l_existant', () => {
    const texte = `# Identifiants émis\r\n${A}\r\n`;

    expect(ajouterAuVerrou(texte, [B, C])).toBe(`${texte}${B}\n${C}\n`);
    expect(ajouterAuVerrou(A, [B])).toBe(`${A}\n${B}\n`);
    expect(ajouterAuVerrou('', [A])).toBe(`${A}\n`);
    expect(ajouterAuVerrou(texte, [])).toBe(texte);
    expect(lireVerrou(ajouterAuVerrou(texte, [B])).entrees.map((e) => e.id)).toEqual([A, B]);
  });
});
