/*
 * Le cours d'exemple du dépôt (`exemple-contenu/`), préparé comme le client le prépare, pour les
 * tests des outils de mémoire. Un réglage `memoire` peut remplacer celui du manifeste. Inventé, aucune
 * donnée réelle (invariant 7). Exclu de la construction, comme tout `*.fixture.ts`.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ReglagesMemoire } from '../../domaine/contenu/modele.js';
import { type CoursPrepare, preparerCours } from '../../domaine/cours/prepare.js';
import { versCoursServi } from '../../domaine/cours/servi.js';
import { hasardDeterministe } from '../../domaine/hasard.js';
import type { Evenement, ModeDeReponse } from '../../domaine/journal/evenement.js';
import { posablesDuCours } from '../../domaine/seances/heute.js';
import { chargerContenus } from '../../serveur/contenus/chargeur.js';
import { reponseInventee } from './ecrire-journal.fixture.js';

export const DOSSIER_EXEMPLE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  'exemple-contenu',
);

/** Le cours d'exemple, sans réglage de mémoire (Leitner), ou avec `memoire`. */
export function coursDExemple(memoire?: ReglagesMemoire): CoursPrepare {
  const [cours] = chargerContenus(DOSSIER_EXEMPLE).cours;
  if (cours === undefined) throw new Error("le cours d'exemple est introuvable");
  const { memoire: _ignore, ...sansMemoire } = cours;
  return preparerCours(
    versCoursServi(memoire === undefined ? sansMemoire : { ...sansMemoire, memoire }),
  );
}

/** Les identifiants des unités qui se posent seules, dans l'ordre du cours. */
export function idsDesPosables(cours: CoursPrepare): string[] {
  return posablesDuCours(cours).map((posable) => posable.id);
}

export interface OptionsDeJournalDeCours {
  /** Le premier jour, `AAAA-MM-JJ`. */
  debut: string;
  jours: number;
  /** Les réponses de chaque jour : une par unité du cours, tour à tour, dans son ordre. */
  parJour: number;
  graine: number;
  /** Fait varier les identifiants d'une personne à l'autre. */
  personne?: number;
}

const MODES_TOURNANTS: (ModeDeReponse | undefined)[] = [
  'retournee',
  'saisie',
  'choix',
  undefined,
  'association',
];
const JUSTES_SUR_DIX = 8;

/**
 * Un journal inventé sur les unités du cours : `parJour` réponses par jour pendant `jours` jours, une
 * unité après l'autre, juste huit fois sur dix (d'un hasard à graine), avec un mode qui tourne.
 */
export function journalDeCours(cours: CoursPrepare, options: OptionsDeJournalDeCours): Evenement[] {
  const ids = idsDesPosables(cours);
  const hasard = hasardDeterministe(options.graine);
  const debut = Date.UTC(
    Number(options.debut.slice(0, 4)),
    Number(options.debut.slice(5, 7)) - 1,
    Number(options.debut.slice(8, 10)),
    10,
  );
  const evenements: Evenement[] = [];
  let rang = (options.personne ?? 0) * 1_000_000;
  for (let jour = 0; jour < options.jours; jour++) {
    for (let n = 0; n < options.parJour; n++) {
      rang += 1;
      const instant = debut + jour * 86_400_000 + n * 20_000;
      const unite = ids[(jour * options.parJour + n) % ids.length] ?? ids[0] ?? '';
      evenements.push(
        reponseInventee(
          instant,
          rang,
          unite,
          hasard() * 10 < JUSTES_SUR_DIX,
          cours.cours.id,
          MODES_TOURNANTS[rang % MODES_TOURNANTS.length],
        ),
      );
    }
  }
  return evenements;
}
