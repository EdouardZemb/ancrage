/*
 * La notice de confidentialité, séparée en deux (S1-D7) : son texte, un gabarit qui vit avec le
 * code (`notice-gabarit.ts`), et les valeurs de l'instance, écrites dans le `notice.yaml` de son
 * contenu. Le gabarit porte des trous `{cle}`, que `composerNotice` remplit.
 *
 * Ce module ne dépend ni du client ni du serveur : le client et la CLI de contenu l'importent tous
 * deux.
 */

/** Une partie de la notice : son titre, puis sa liste à puces, puis ses paragraphes. */
export interface SectionNotice {
  titre: string;
  paragraphes?: string[];
  liste?: string[];
}

/** La notice dans une langue. */
export interface Notice {
  titre: string;
  /**
   * La première phrase. Le gabarit la porte sans date : `noticeComposee` (`notice-gabarit.ts`) y
   * ajoute la phrase de la version.
   */
  introduction: string;
  sections: SectionNotice[];
}

/**
 * Les clés des valeurs d'une instance, dans l'ordre de la notice (S1-D7). Les six premières
 * remplacent une chaîne entière, un paragraphe ou une puce ; les quatre dernières, un fragment
 * d'une phrase du gabarit.
 */
export const CLES_DE_NOTICE = [
  'responsable',
  'lieu_du_serveur',
  'tiers_tunnel',
  'tiers_sauvegardes',
  'transferts',
  'qui_ne_voit_pas',
  'sauvegarde_distante',
  'tunnel',
  'delai_reponse',
  'autorites',
] as const;

/** Les valeurs de la notice d'une instance, telles que `notice.yaml` les donne et l'API les rend. */
export interface ValeursDeNotice {
  /** `AAAA-MM-JJ` : le dernier changement des valeurs. */
  date: string;
  /** Pour chaque langue, une valeur par clé de `CLES_DE_NOTICE`. */
  valeurs: Record<'fr' | 'de', Record<string, string>>;
  /** Les adresses du texte que l'écran rend cliquables, et leur cible (`https://` ou `mailto:`). */
  liens: { texte: string; cible: string }[];
}

/**
 * Une cible de lien qui s'ouvre sans risque : une page en `https://`, ou une adresse en `mailto:`.
 * Rien d'autre ne s'ouvre. Le schéma de `notice.yaml` la refuse, et l'écran n'en fait pas un lien.
 */
export function estUneCibleAdmise(cible: string): boolean {
  return cible.startsWith('https://') || cible.startsWith('mailto:');
}

/** Un trou du gabarit : `{cle}`, sans accolade à l'intérieur. */
const TROU = /\{([^{}]+)\}/g;

/** Les trous de `texte`, remplis en une seule passe : une valeur insérée n'est jamais relue. */
function remplir(texte: string, valeurs: Record<string, string>): string {
  return texte.replace(TROU, (_trou, cle: string) => {
    if (!Object.hasOwn(valeurs, cle)) {
      throw new Error(`trou inconnu dans le gabarit de la notice : {${cle}}`);
    }
    return valeurs[cle];
  });
}

/** Les textes de `textes`, remplis ; ceux qui restent vides (ou faits d'espaces) disparaissent. */
function remplirSansVides(textes: readonly string[], valeurs: Record<string, string>): string[] {
  return textes.map((texte) => remplir(texte, valeurs)).filter((texte) => texte.trim() !== '');
}

/**
 * La notice du gabarit, dont chaque trou est rempli par sa valeur. L'ordre des clés du gabarit est
 * gardé. Une puce ou un paragraphe qui reste vide disparaît, et une liste qui ne garde rien aussi.
 * Un trou sans valeur lève une erreur.
 */
export function composerNotice(gabarit: Notice, valeurs: Record<string, string>): Notice {
  return {
    titre: remplir(gabarit.titre, valeurs),
    introduction: remplir(gabarit.introduction, valeurs),
    sections: gabarit.sections.map((section) => {
      const composee: SectionNotice = { titre: remplir(section.titre, valeurs) };
      // Les listes, dans l'ordre de leurs clés : le titre seul est un texte.
      for (const [cle, textes] of Object.entries(section)) {
        if (!Array.isArray(textes)) continue;
        const remplis = remplirSansVides(textes, valeurs);
        if (remplis.length > 0) composee[cle as 'paragraphes' | 'liste'] = remplis;
      }
      return composee;
    }),
  };
}

/**
 * La date que la notice affiche : la plus récente de la version du code (`NOTICE_VERSION`) et de
 * celle des valeurs. Deux dates `AAAA-MM-JJ` se rangent comme deux textes.
 */
export function dateAffichee(versionDuCode: string, dateDesValeurs: string): string {
  return [versionDuCode, dateDesValeurs].sort()[1];
}
