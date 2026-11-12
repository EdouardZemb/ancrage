import { expect, it } from 'vitest';
import { CHAPITRE_1, CHAPITRE_2, coursServiDeTest } from '../../domaine/cours/cours.fixture.js';
import { preparerCours } from '../../domaine/cours/prepare.js';
import { reponseDeTest } from '../../domaine/evenements.fixture.js';
import { etatsDesUnites } from '../../domaine/progression/etat.js';
import { etatsFsrs } from '../../domaine/progression/fsrs.js';
import { ordonnanceurDuCours } from './ordonnanceur-du-cours.js';

/** Un cours de test dont le premier chapitre seul est en FSRS. */
function coursParChapitre() {
  return preparerCours({
    ...coursServiDeTest(),
    memoire: { algorithme: 'par-chapitre', retention: 0.9, chapitres: [CHAPITRE_1] },
  });
}

it('un cours par chapitre : les cartes du chapitre nommé, dans les deux sens, suivent FSRS', () => {
  const cours = coursParChapitre();
  const du = (module: string) => cours.unites.filter((unite) => unite.module === module);
  const [directe, inverse] = [du(CHAPITRE_1)[0], du(CHAPITRE_1).find((u) => u.sens === 'inverse')];
  const autre = du(CHAPITRE_2)[0];
  expect(directe && inverse && autre).toBeTruthy();
  const unites = [directe?.id ?? '', inverse?.id ?? '', autre?.id ?? '', 'mot-quelconque'];
  const journal = unites.flatMap((unite, rang) =>
    [0, 1, 3].map((jour, passage) =>
      reponseDeTest(rang * 10 + passage + 1, unite, passage !== 1, `2026-03-0${2 + jour}`),
    ),
  );
  const etats = ordonnanceurDuCours(cours)(journal);
  const fsrs = etatsFsrs(journal, { retention: 0.9 });
  const leitner = etatsDesUnites(journal, cours.cours.leitner);
  expect(etats.get(unites[0] ?? '')).toEqual(fsrs.get(unites[0] ?? ''));
  expect(etats.get(unites[1] ?? '')).toEqual(fsrs.get(unites[1] ?? ''));
  expect(etats.get(unites[2] ?? '')).toEqual(leitner.get(unites[2] ?? ''));
  expect(etats.get('mot-quelconque')).toEqual(leitner.get('mot-quelconque'));
  expect(fsrs.get(unites[0] ?? '')).not.toEqual(leitner.get(unites[0] ?? ''));
});

it('un cours sans réglage de mémoire reste en Leitner', () => {
  const cours = preparerCours(coursServiDeTest());
  const unite = cours.unites[0]?.id ?? '';
  const journal = [
    reponseDeTest(1, unite, true, '2026-03-02'),
    reponseDeTest(2, unite, true, '2026-03-03'),
  ];
  expect(ordonnanceurDuCours(cours)(journal)).toEqual(etatsDesUnites(journal, cours.cours.leitner));
});
