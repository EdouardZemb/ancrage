import { estIdentifiant, REGLE_IDENTIFIANT } from './identifiants.js';
import type { SegmentDeTexte } from './modele.js';

/** Un jeton s'écrit `[[forme|sens|identifiant]]`. */
const JETON = /\[\[([^|\]]+)\|([^|\]]+)\|([^|\]]+)\]\]/g;

/**
 * Découpe un texte annoté comme `parseReport` du prototype : un segment de texte avant chaque
 * jeton, même vide, puis un segment de texte final. Les erreurs signalent un identifiant de jeton
 * mal formé, ou un `[[` ou un `]]` resté hors d'un jeton.
 */
export function analyserTexte(texte: string): { segments: SegmentDeTexte[]; erreurs: string[] } {
  const segments: SegmentDeTexte[] = [];
  const erreurs: string[] = [];
  let fin = 0;
  let rang = 0;

  for (const trouve of texte.matchAll(JETON)) {
    const [jeton, forme, sens, id] = trouve;
    segments.push({ texte: texte.slice(fin, trouve.index) });
    segments.push({ jeton: { id, forme, sens } });
    if (!estIdentifiant(id)) {
      erreurs.push(`jetons[${rang}] : identifiant mal formé, attendu ${REGLE_IDENTIFIANT}.`);
    }
    fin = trouve.index + jeton.length;
    rang++;
  }
  segments.push({ texte: texte.slice(fin) });

  if (segments.some((s) => 'texte' in s && (s.texte.includes('[[') || s.texte.includes(']]')))) {
    erreurs.push("Marquage cassé : « [[ » ou « ]] » hors d'un jeton [[forme|sens|identifiant]].");
  }

  return { segments, erreurs };
}
