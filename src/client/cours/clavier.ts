/*
 * Les raccourcis clavier d'un onglet (H:2238-2258) : une touche, un geste. Le prototype écoutait la
 * fenêtre et laissait la saisie tranquille ; `useTouches` fait de même, pour un onglet à la fois.
 */
import { useEffect, useRef } from 'preact/hooks';

/** Les cibles qui gardent leurs touches : on y tape, on y choisit. */
const CIBLES_DE_SAISIE = new Set(['INPUT', 'SELECT', 'TEXTAREA']);
/** Les cibles que le navigateur active lui-même par Espace ou Enter : un bouton, un lien. */
const CIBLES_D_ACTIVATION = new Set(['BUTTON', 'A']);
const TOUCHES_D_ACTIVATION = new Set([' ', 'Enter']);

/**
 * Appelle le gestionnaire de la touche pressée (`KeyboardEvent.key`, par exemple `' '`, `'Enter'`
 * ou `'1'`) et lui retire son effet du navigateur : l'espace ne fait plus défiler la page.
 *
 * Elle n'écoute que si `actif`, et laisse la touche au navigateur quand :
 * - la cible est un champ de saisie, une liste ou une zone de texte ;
 * - une touche de commande est tenue (Ctrl+1 change d'onglet du navigateur) ; la majuscule reste
 *   permise, car sur un clavier AZERTY les chiffres s'obtiennent avec elle ;
 * - Espace ou Enter tombent sur un bouton ou un lien, que le navigateur active lui-même : la carte
 *   du cours, un `div` de rôle bouton, n'a pas cette activation et reste gérée, comme les chiffres.
 *
 * Une touche gérée mais répétée parce qu'on la tient n'a pas d'effet du navigateur non plus
 * (l'espace tenue ne fait pas défiler la page), sans relancer l'action : une réponse par pression.
 *
 * Les gestionnaires du dernier rendu servent, sans rouvrir l'écoute à chaque rendu. L'écoute se
 * retire au démontage.
 */
export function useTouches(touches: Record<string, () => void>, actif: boolean): void {
  const courantes = useRef(touches);
  courantes.current = touches;

  useEffect(() => {
    if (!actif) return;
    const ecouter = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const cible = e.target;
      if (cible instanceof Element) {
        if (CIBLES_DE_SAISIE.has(cible.tagName)) return;
        if (TOUCHES_D_ACTIVATION.has(e.key) && CIBLES_D_ACTIVATION.has(cible.tagName)) return;
      }
      if (!Object.hasOwn(courantes.current, e.key)) return;
      e.preventDefault();
      if (!e.repeat) courantes.current[e.key]();
    };
    window.addEventListener('keydown', ecouter);
    return () => window.removeEventListener('keydown', ecouter);
  }, [actif]);
}
