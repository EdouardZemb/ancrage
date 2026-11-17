import { useMemo } from 'preact/hooks';
import type { Planning } from '../../domaine/contenu/modele.js';
import { memoireDuCours } from '../../domaine/cours/servi.js';
import { departDuPlanning, planningDuCours } from '../../domaine/seances/planning.js';
import { useCours } from './contexte-cours.js';

/**
 * Le planning lu du cours, son départ et l'examen de sa mémoire, que « Heute » et le Lernplan se
 * partagent. Le départ relit tout le journal : il ne se refait que si le journal ou le jour
 * change. Sans planning, le départ est aujourd'hui.
 */
export function usePlanningDuCours(): {
  planning: Planning | undefined;
  depart: string;
  examen: string | undefined;
} {
  const { cours, evenements, aujourdhui } = useCours();
  const planning = useMemo(() => planningDuCours(cours.cours), [cours]);
  const depart = useMemo(
    () => (planning === undefined ? aujourdhui : departDuPlanning(evenements, aujourdhui)),
    [planning, evenements, aujourdhui],
  );
  const examen = useMemo(() => memoireDuCours(cours.cours)?.examen, [cours]);
  return { planning, depart, examen };
}
