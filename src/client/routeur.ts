/*
 * Le routeur du client, écrit à la main, sans dépendance. `route` lit un chemin (pur, testé),
 * `naviguer` change l'adresse sans recharger la page, `useChemin` fait redessiner l'application
 * quand l'adresse change, par un lien du client ou par le bouton « retour ».
 */
import { useEffect, useState } from 'preact/hooks';
import type { Onglet } from '../domaine/cours/prepare.js';

export type Route =
  | { ecran: 'accueil' }
  | { ecran: 'compte' }
  | { ecran: 'cours'; cours: string; onglet: Onglet }
  | { ecran: 'connexion' }
  | { ecran: 'invitation'; jeton: string }
  | { ecran: 'lien'; jeton: string }
  | { ecran: 'appareils' }
  | { ecran: 'admin' }
  | { ecran: 'confidentialite' };

/**
 * Les onglets qui ont leur chemin, `/cours/<id>/<onglet>` ; l'aperçu est `/cours/<id>`. La table
 * les nomme tous : un onglet nouveau qui n'y serait pas fait échouer `pnpm types`.
 */
const ONGLETS_A_CHEMIN: ReadonlySet<string> = new Set(
  Object.keys({
    cartes: true,
    quiz: true,
    mots: true,
    schemas: true,
    textes: true,
    exercices: true,
    feuilles: true,
    examen: true,
    progression: true,
  } satisfies Record<Exclude<Onglet, 'apercu'>, true>),
);

/**
 * L'écran d'un chemin. La requête, le fragment et la barre finale sont ignorés ; tout chemin
 * inconnu mène à l'accueil. Dans un cours, un onglet inconnu mène à son aperçu (décision 20).
 */
export function route(chemin: string): Route {
  const [sansRequete = ''] = chemin.split(/[?#]/, 1);
  const segments = sansRequete.split('/').filter((segment) => segment !== '');
  const [premier, second, troisieme, ...reste] = segments;

  if (premier === undefined || reste.length > 0) {
    return { ecran: 'accueil' };
  }
  if (premier === 'cours' && second !== undefined) {
    const onglet =
      troisieme !== undefined && ONGLETS_A_CHEMIN.has(troisieme) ? (troisieme as Onglet) : 'apercu';
    return { ecran: 'cours', cours: second, onglet };
  }
  if (troisieme !== undefined) {
    return { ecran: 'accueil' };
  }
  if (second === undefined) {
    switch (premier) {
      case 'compte':
        return { ecran: 'compte' };
      case 'connexion':
        return { ecran: 'connexion' };
      case 'appareils':
        return { ecran: 'appareils' };
      case 'admin':
        return { ecran: 'admin' };
      case 'confidentialite':
        return { ecran: 'confidentialite' };
    }
  } else if (premier === 'invitation' || premier === 'lien') {
    return { ecran: premier, jeton: second };
  }
  return { ecran: 'accueil' };
}

/**
 * Le chemin d'un cours : `/cours/<id>` pour l'aperçu, `/cours/<id>/<onglet>` sinon. L'identifiant
 * d'un cours n'a que des chiffres et des minuscules (format du contenu) : il va tel quel dans le
 * chemin, comme `route` le relit.
 */
export function cheminDuCours(cours: string, onglet: Onglet = 'apercu'): string {
  return onglet === 'apercu' ? `/cours/${cours}` : `/cours/${cours}/${onglet}`;
}

/** Où mène l'accueil (`/`) : au cours s'il n'y en a qu'un, au compte sinon (décisions 4 et 20). */
export function destinationDeLAccueil(cours: readonly { id: string }[]): string {
  const [seul] = cours;
  return cours.length === 1 && seul !== undefined ? cheminDuCours(seul.id) : '/compte';
}

/** Ce que l'on sait du visiteur : `inconnu` tant que `GET /api/moi` n'a pas répondu. */
export type Visiteur = 'inconnu' | 'anonyme' | 'connecte' | 'proprietaire';

/**
 * Où renvoyer le visiteur depuis cet écran, ou `undefined` s'il reste. L'accueil, le compte, les
 * cours, les appareils et l'administration demandent une session ; l'administration, de plus, le
 * rôle de propriétaire (pour une autre personne, l'API répondrait 404). Une personne connectée n'a
 * rien à faire sur l'écran de connexion. Les écrans d'invitation et de lien restent ouverts à
 * tous : les ouvrir pendant qu'une session existe la remplace, côté serveur. La notice de
 * confidentialité aussi : elle se lit avant de créer un compte (1e-D15).
 */
export function redirection(ecran: Route, visiteur: Visiteur): string | undefined {
  if (visiteur === 'inconnu') {
    return undefined;
  }
  const connecte = visiteur !== 'anonyme';
  switch (ecran.ecran) {
    case 'accueil':
    case 'compte':
    case 'cours':
    case 'appareils':
      return connecte ? undefined : '/connexion';
    case 'admin':
      if (visiteur === 'proprietaire') {
        return undefined;
      }
      return connecte ? '/' : '/connexion';
    case 'connexion':
      return connecte ? '/' : undefined;
    case 'invitation':
    case 'lien':
    case 'confidentialite':
      return undefined;
  }
}

const abonnes = new Set<() => void>();

/**
 * Va à `chemin` sans recharger la page : une entrée de plus dans l'historique, ou, avec
 * `remplacer`, à la place de l'entrée courante (une redirection n'est pas une étape que le bouton
 * « retour » doit retrouver). Aller là où l'on est ne crée pas de doublon dans l'historique.
 */
export function naviguer(chemin: string, options: { remplacer?: boolean } = {}): void {
  const courant = location.pathname + location.search + location.hash;
  if (options.remplacer || chemin === courant) {
    history.replaceState(null, '', chemin);
  } else {
    history.pushState(null, '', chemin);
    window.scrollTo(0, 0);
  }
  for (const abonne of [...abonnes]) {
    abonne();
  }
}

/**
 * Charge `chemin` entièrement, à la place de l'entrée courante de l'historique : la page repart de
 * zéro, sans rien garder en mémoire de la précédente, et le service worker s'enregistre de nouveau
 * (`main.tsx`, au chargement). C'est ce que fait la déconnexion, qui l'a désinscrit.
 */
export function rechargerSur(chemin: string): void {
  location.replace(chemin);
}

/**
 * Appelle `abonne` à chaque changement d'adresse : après chaque `naviguer`, et à chaque `popstate`
 * (le bouton « retour »). Rend le retrait. C'est aussi le moment « navigation » de la mise à jour
 * de l'application (`mise-a-jour.ts`, 2a-D2).
 */
export function surNavigation(abonne: () => void): () => void {
  abonnes.add(abonne);
  window.addEventListener('popstate', abonne);
  return () => {
    abonnes.delete(abonne);
    window.removeEventListener('popstate', abonne);
  };
}

/** Le chemin courant, tenu à jour à chaque navigation. */
export function useChemin(): string {
  const [chemin, setChemin] = useState(() => location.pathname);

  useEffect(() => {
    const maj = () => setChemin(location.pathname);
    const retirer = surNavigation(maj);
    // Une navigation a pu avoir lieu entre le premier rendu et cet effet.
    maj();
    return retirer;
  }, []);

  return chemin;
}
