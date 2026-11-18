import { expect, it } from 'vitest';
import { analyserContenus } from './analyse.js';
import { exempleDeCours, modifier } from './exemple.fixture.js';

const COURS = 'essai/cours.yaml';

function avecRebelles(bloc: string) {
  return modifier(exempleDeCours(), COURS, 'modules:\n', `${bloc}modules:\n`);
}

it('rebelles_un_seuil_admis_est_recopie', () => {
  for (const fautes of [2, 3, 20]) {
    const { cours, erreurs } = analyserContenus(avecRebelles(`rebelles:\n  fautes: ${fautes}\n`));
    expect(erreurs, String(fautes)).toEqual([]);
    expect(cours[0].rebelles, String(fautes)).toEqual({ fautes });
  }
});

it('rebelles_absente_le_cours_n_en_porte_pas', () => {
  const { cours, erreurs } = analyserContenus(exempleDeCours());
  expect(erreurs).toEqual([]);
  expect(cours[0]).not.toHaveProperty('rebelles');
});

it('rebelles_les_refus_sont_en_francais', () => {
  const borne = 'Attendu un nombre entier entre 2 et 20.';
  const cas: [string, string, string][] = [
    ['rebelles:\n  fautes: 1\n', 'rebelles.fautes', borne],
    ['rebelles:\n  fautes: 21\n', 'rebelles.fautes', borne],
    ['rebelles:\n  fautes: 4.5\n', 'rebelles.fautes', borne],
    ['rebelles:\n  fautes: "4"\n', 'rebelles.fautes', borne],
    ['rebelles: {}\n', 'rebelles.fautes', 'Champ obligatoire absent.'],
    [
      'rebelles:\n  fautes: 4\n  autre: 1\n',
      'rebelles.autre',
      "Clé inconnue : le format 1 ne l'admet pas ici.",
    ],
  ];
  for (const [bloc, lieu, message] of cas) {
    const { erreurs } = analyserContenus(avecRebelles(bloc));
    expect(erreurs, bloc).toHaveLength(1);
    expect(erreurs[0], bloc).toMatchObject({ fichier: COURS, lieu, message });
  }
});
