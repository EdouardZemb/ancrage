import { expect, test } from 'vitest';
import { chapitresAAjuster, garderLesCartes, modulesDeCartes } from './cartes-a-ajuster.js';
import { coursDExemple } from './cours-exemple.fixture.js';
import { reponseInventee } from './ecrire-journal.fixture.js';

const parChapitre = coursDExemple({
  algorithme: 'par-chapitre',
  retention: 0.9,
  chapitres: ['n0sq3hfm'],
});
const sansChapitres = coursDExemple({ algorithme: 'fsrs', retention: 0.9 });
const [PREMIER = '', SECOND = '', TROISIEME = ''] = modulesDeCartes(parChapitre);

test('les_modules_de_cartes_sont_ceux_du_cours', () => {
  expect(modulesDeCartes(parChapitre)).toHaveLength(3);
  expect(new Set(parChapitre.unites.map((unite) => unite.module))).toEqual(
    new Set(modulesDeCartes(parChapitre)),
  );
});

test('sans_chapitre_demande_un_cours_par_chapitre_apprend_sur_ses_chapitres_fsrs', () => {
  expect(chapitresAAjuster(parChapitre, [])).toEqual({ chapitres: new Set(['n0sq3hfm']) });
});

test('sans_chapitre_demande_un_cours_en_fsrs_apprend_sur_tout_le_cours', () => {
  // En `fsrs`, l'ordonnanceur applique FSRS à toutes les unités, pas aux seules cartes : l'ajustement
  // lit ce que le rejeu lit.
  expect(chapitresAAjuster(sansChapitres, [])).toEqual({ chapitres: null });
});

test('sans_chapitre_demande_un_cours_en_leitner_apprend_sur_toutes_les_cartes', () => {
  const tous = { chapitres: new Set([PREMIER, SECOND, TROISIEME]) };
  expect(chapitresAAjuster(coursDExemple({ algorithme: 'leitner', retention: 0.9 }), [])).toEqual(
    tous,
  );
  // Sans `memoire` : de même.
  expect(chapitresAAjuster(coursDExemple(), [])).toEqual(tous);
});

test('un_chapitre_demande_l_emporte_meme_en_fsrs', () => {
  expect(chapitresAAjuster(sansChapitres, [SECOND])).toEqual({ chapitres: new Set([SECOND]) });
});

test('tout_le_cours_garde_toutes_les_reponses_sans_rien_ecarter', () => {
  const reponse = (rang: number, unite: string) =>
    reponseInventee(Date.UTC(2026, 0, 1, 10, rang), rang, unite, true, sansChapitres.cours.id);
  const journal = [reponse(1, 'mot00000'), reponse(2, 'c1000001')];
  const resultat = garderLesCartes([journal], sansChapitres, null);
  expect(resultat.ecartees).toBe(0);
  expect(resultat.journaux[0]).toHaveLength(2);
});

test('les_chapitres_demandes_l_emportent_et_un_chapitre_inconnu_est_rendu', () => {
  expect(chapitresAAjuster(parChapitre, [SECOND, TROISIEME])).toEqual({
    chapitres: new Set([SECOND, TROISIEME]),
  });
  expect(chapitresAAjuster(parChapitre, [SECOND, 'zzzzzzzz'])).toEqual({ inconnu: 'zzzzzzzz' });
  // Un module qui n'est pas un module de cartes est inconnu aussi.
  const autre = parChapitre.cours.modules.find((module) => module.type !== 'cartes');
  expect(autre).toBeDefined();
  expect(chapitresAAjuster(parChapitre, [autre?.id ?? ''])).toEqual({ inconnu: autre?.id });
});

test('les_reponses_hors_des_chapitres_choisis_sont_ecartees_et_comptees', () => {
  const duModule = (module: string) =>
    parChapitre.unites.find((unite) => unite.module === module)?.id ?? '';
  const reponse = (rang: number, unite: string) =>
    reponseInventee(Date.UTC(2026, 0, 1, 10, rang), rang, unite, true, parChapitre.cours.id);
  const journal = [
    reponse(1, duModule(PREMIER)),
    reponse(2, duModule(SECOND)),
    reponse(3, duModule(SECOND)),
    reponse(4, 'mot00000'),
  ];
  const resultat = garderLesCartes([journal, []], parChapitre, new Set([PREMIER]));
  expect(resultat.ecartees).toBe(3);
  expect(resultat.journaux.map((j) => j.length)).toEqual([1, 0]);
});
