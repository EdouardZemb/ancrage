/*
 * La notice de l'instance sur l'appareil (S1-D8) : ses valeurs viennent de `GET /api/notice`, et
 * leur dernière copie est rangée dans le magasin `etat` d'IndexedDB, sous la clé `notice`. Le
 * service worker ne voit jamais `/api/*` (2a-R8), et rien de l'API n'entre dans un cache
 * (décision 11) : c'est cette copie qui rend la notice lisible hors ligne. La déconnexion l'efface
 * avec le reste (`viderSaufLesFiles`).
 */
import { CLES_DE_NOTICE, type ValeursDeNotice } from '../domaine/notice.js';
import type { BaseLocale } from './stockage/base-locale.js';

const CLE = 'notice';

function estUnObjet(valeur: unknown): valeur is Record<string, unknown> {
  return typeof valeur === 'object' && valeur !== null && !Array.isArray(valeur);
}

/** Les valeurs d'une langue : un texte pour chaque clé que le gabarit attend. */
function estUnDictionnaire(valeur: unknown): valeur is Record<string, string> {
  return estUnObjet(valeur) && CLES_DE_NOTICE.every((cle) => typeof valeur[cle] === 'string');
}

/**
 * Une réponse qui a la forme des valeurs : une date, les textes du gabarit en français et en
 * allemand, et des liens. Le serveur les a validées au démarrage ; une autre forme (un serveur d'une
 * autre version, une réponse tronquée) n'est ni rangée ni affichée.
 */
function estUneNotice(valeur: unknown): valeur is ValeursDeNotice {
  if (!estUnObjet(valeur)) return false;
  const { date, valeurs, liens } = valeur;
  return (
    typeof date === 'string' &&
    estUnObjet(valeurs) &&
    estUnDictionnaire(valeurs.fr) &&
    estUnDictionnaire(valeurs.de) &&
    Array.isArray(liens) &&
    liens.every(
      (lien) =>
        estUnObjet(lien) && typeof lien.texte === 'string' && typeof lien.cible === 'string',
    )
  );
}

/**
 * La dernière copie de la notice sur l'appareil, ou `undefined`. Une copie d'une autre forme n'est
 * pas relue : rangée par une version dont le gabarit attendait d'autres clés, elle ferait lever la
 * composition (un trou sans valeur), et l'écran dit alors la phrase hors ligne (S1-D9).
 */
export async function lireNoticeLocale(base: BaseLocale): Promise<ValeursDeNotice | undefined> {
  const lue = await base.get('etat', CLE);
  return lue?.cle === CLE && estUneNotice(lue.valeur) ? lue.valeur : undefined;
}

/**
 * Lit la notice sur le serveur. Une réponse valide est rangée sur l'appareil, et rendue : le serveur
 * fait foi, sa réponse remplace toujours la copie. Sans réseau, ou si le serveur ne la rend pas (un
 * serveur d'avant la route, par exemple), c'est la copie qui est rendue, ou `undefined` s'il n'y en
 * a pas. Sans base (IndexedDB indisponible), rien n'est rangé ni relu. Ne lève jamais.
 */
export async function chargerNotice(
  base: BaseLocale | undefined,
  recuperer: typeof fetch = fetch,
): Promise<ValeursDeNotice | undefined> {
  const copie = async () =>
    base === undefined ? undefined : await lireNoticeLocale(base).catch(() => undefined);
  let lue: unknown;
  try {
    const reponse = await recuperer('/api/notice');
    if (!reponse.ok) return await copie();
    lue = await reponse.json();
  } catch {
    return await copie();
  }
  if (!estUneNotice(lue)) return await copie();
  // Ne pas pouvoir la ranger n'empêche pas de l'afficher.
  await base?.put('etat', { cle: CLE, valeur: lue }).catch(() => {});
  return lue;
}
