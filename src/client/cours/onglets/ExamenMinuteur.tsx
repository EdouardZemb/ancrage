/*
 * Le chrono de « Prüfung » : le temps restant avant l'échéance, redessiné chaque seconde (il quitte
 * `Examen.tsx`, 2b-D6).
 */
import { useEffect, useRef, useState } from 'preact/hooks';

/** Sous cette durée restante, le chrono passe en rouge (H:2003). */
const MS_DU_DERNIER_STADE = 60_000;

/** `fmt` (H:2000) : le temps restant en `m:ss`, jamais négatif. */
function dureeRestante(ms: number): string {
  const secondes = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(secondes / 60)}:${String(secondes % 60).padStart(2, '0')}`;
}

/**
 * Le chrono (`startTick`, H:2001-2011) : le temps restant avant `echeance`, redessiné chaque
 * seconde. Une échéance passée, à l'affichage comme au tic, remet l'examen. Il ne redessine que
 * lui-même : la saisie d'une question n'est pas touchée.
 */
export function Minuteur(props: { echeance: number; remettre(): void }) {
  const { echeance } = props;
  const [, redessiner] = useState(0);
  // Le `remettre` du dernier rendu : celui qui voit les réponses d'à présent.
  const remettre = useRef(props.remettre);
  remettre.current = props.remettre;

  useEffect(() => {
    if (Date.now() >= echeance) {
      remettre.current();
      return;
    }
    const tic = setInterval(() => {
      if (Date.now() >= echeance) remettre.current();
      else redessiner((n) => n + 1);
    }, 1000);
    return () => clearInterval(tic);
  }, [echeance]);

  const restant = echeance - Date.now();
  return (
    <span class={restant < MS_DU_DERNIER_STADE ? 'timer low' : 'timer'}>
      {dureeRestante(restant)}
    </span>
  );
}
