import { expect, it } from 'vitest';
import { analyserContenus } from './analyse.js';
import { exempleDeCours, modifier } from './exemple.fixture.js';

const COURS = 'essai/cours.yaml';

function avecPose(valeur: string) {
  return modifier(
    exempleDeCours(),
    COURS,
    'modules:\n',
    `pose_des_cartes: "${valeur}"\nmodules:\n`,
  );
}

it('pose_des_cartes_les_deux_valeurs_sont_recopiees', () => {
  for (const valeur of ['ecrite', 'retournee'] as const) {
    const { cours, erreurs } = analyserContenus(avecPose(valeur));
    expect(erreurs, valeur).toEqual([]);
    expect(cours[0].poseDesCartes, valeur).toBe(valeur);
  }
});

it('pose_des_cartes_absente_le_cours_n_en_porte_pas', () => {
  const { cours, erreurs } = analyserContenus(exempleDeCours());
  expect(erreurs).toEqual([]);
  expect(cours[0]).not.toHaveProperty('poseDesCartes');
});

it('pose_des_cartes_une_troisieme_valeur_est_refusee_en_francais', () => {
  const { erreurs } = analyserContenus(avecPose('orale'));
  expect(erreurs).toHaveLength(1);
  expect(erreurs[0]).toMatchObject({ fichier: COURS, lieu: 'pose_des_cartes' });
  expect(erreurs[0].message).toBe('Attendu « ecrite » ou « retournee ».');
});
