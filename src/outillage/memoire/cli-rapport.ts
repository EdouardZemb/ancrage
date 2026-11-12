import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { type CoursPrepare, preparerCours } from '../../domaine/cours/prepare.js';
import { memoireDuCours, versCoursServi } from '../../domaine/cours/servi.js';
import type { Evenement } from '../../domaine/journal/evenement.js';
import { chargerContenus } from '../../serveur/contenus/chargeur.js';
import { lireJournalDe, lireJournaux } from './lire-journaux.js';
import { estActive, PERSONNES_ACTIVES_MINIMUM } from './mesures.js';
import { construireRapport } from './rapport.js';

/*
 * `pnpm memoire:rapport --base <copie.sqlite> --cours <id> --contenu <dossier> --sortie <fichier.html>
 * [--personne <identifiant> --accord <JJ/MM/AAAA>] [--jusquau <AAAA-MM-JJ>] [--ecraser]` : écrit le
 * rapport de suivi d'un cours, une page HTML autonome et privée, d'après une copie de la base. Un
 * outil du poste, hors de l'image (M3).
 *
 * Sans `--personne`, le rapport est d'ensemble : tous les journaux du cours, et rien par personne.
 * Avec `--personne`, il décrit la progression d'une personne : la date de l'accord, que le responsable
 * déclare, est obligatoire et le rapport l'imprime ; l'outil ne peut pas la contrôler.
 *
 * Codes : 0 écrit ; 64 usage (une option manquante ou mal formée, un accord sans date, une sortie dans
 * un dépôt git, un fichier qui existerait déjà sans `--ecraser`) ; 1 base, contenu, cours ou personne
 * illisible ou inconnu. Rien ne s'écrit sur un code différent de 0, et aucun message ne répète un
 * identifiant de personne.
 */

const SORTIE_OK = 0;
const SORTIE_ERREUR = 1;
const SORTIE_USAGE = 64;

const USAGE =
  'usage : pnpm memoire:rapport --base <copie.sqlite> --cours <identifiant du cours> --contenu <dossier> --sortie <fichier.html> [--personne <identifiant> --accord <JJ/MM/AAAA>] [--jusquau <AAAA-MM-JJ>] [--ecraser]';

export interface Sortie {
  out: (ligne: string) => void;
  err: (ligne: string) => void;
}

/** Ce que la commande lit de son contexte : le jour du rapport, que les tests fixent. */
export interface Contexte {
  aujourdhui?: string;
}

/** Un jour du calendrier, `AAAA-MM-JJ` : un 31 février est refusé. */
function estUnJour(texte: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texte)) return false;
  const date = new Date(`${texte}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === texte;
}

/** `JJ/MM/AAAA` en `AAAA-MM-JJ`, ou `undefined` si ce n'est pas un jour du calendrier. */
function accordEnJour(accord: string): string | undefined {
  const lu = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(accord);
  if (lu === null) return undefined;
  const jour = `${lu[3]}-${lu[2]}-${lu[1]}`;
  return estUnJour(jour) ? jour : undefined;
}

/** Un `.git` (dossier ou fichier, celui d'un worktree) au dossier ou à l'un de ses parents. */
function estDansUnDepot(fichier: string): boolean {
  let dossier = path.dirname(path.resolve(fichier));
  for (;;) {
    if (fs.existsSync(path.join(dossier, '.git'))) return true;
    const parent = path.dirname(dossier);
    if (parent === dossier) return false;
    dossier = parent;
  }
}

function lireCours(dossier: string, id: string): CoursPrepare | undefined {
  const lu = chargerContenus(dossier);
  if (lu.erreurs.length > 0) return undefined;
  const cours = lu.cours.find((candidat) => candidat.id === id);
  return cours === undefined ? undefined : preparerCours(versCoursServi(cours));
}

/** Lance la commande ; rend le code de sortie. Ne lève jamais. */
export async function executer(
  argv: readonly string[],
  sortie: Sortie,
  contexte: Contexte = {},
): Promise<number> {
  const usage = (message?: string): number => {
    if (message !== undefined) sortie.err(message);
    sortie.err(USAGE);
    return SORTIE_USAGE;
  };
  let valeurs: {
    base?: string;
    cours?: string;
    contenu?: string;
    sortie?: string;
    personne?: string;
    accord?: string;
    jusquau?: string;
    ecraser?: boolean;
  };
  try {
    valeurs = parseArgs({
      args: [...argv],
      options: {
        base: { type: 'string' },
        cours: { type: 'string' },
        contenu: { type: 'string' },
        sortie: { type: 'string' },
        personne: { type: 'string' },
        accord: { type: 'string' },
        jusquau: { type: 'string' },
        ecraser: { type: 'boolean' },
      },
      allowPositionals: false,
      strict: true,
    }).values;
  } catch {
    return usage();
  }
  const { base, cours: idDuCours, contenu, sortie: fichier, personne, accord, jusquau } = valeurs;
  if (!base || !idDuCours || !contenu || !fichier) return usage();

  const aujourdhui = contexte.aujourdhui ?? new Date().toISOString().slice(0, 10);
  if ((personne === undefined) !== (accord === undefined)) {
    return usage(
      personne === undefined
        ? '--accord n’a de sens qu’avec --personne'
        : 'un rapport de personne demande la date de l’accord : --accord <JJ/MM/AAAA>',
    );
  }
  if (personne === '' || (accord !== undefined && accordEnJour(accord) === undefined)) {
    return usage('la date de l’accord doit être un jour du calendrier, JJ/MM/AAAA');
  }
  if (accord !== undefined && (accordEnJour(accord) ?? '') > aujourdhui) {
    return usage('la date de l’accord ne peut pas être dans le futur');
  }
  if (jusquau !== undefined && !estUnJour(jusquau)) {
    return usage('--jusquau doit être un jour du calendrier, AAAA-MM-JJ');
  }
  if (estDansUnDepot(fichier)) {
    return usage('la sortie serait dans un dépôt git : le rapport est privé, il se pose ailleurs');
  }
  if (!fs.existsSync(path.dirname(path.resolve(fichier)))) {
    return usage('le dossier de la sortie n’existe pas');
  }
  if (fs.existsSync(fichier) && valeurs.ecraser !== true) {
    return usage('la sortie existe déjà : --ecraser pour la remplacer');
  }

  const cours = lireCours(contenu, idDuCours);
  if (cours === undefined) {
    sortie.err('contenu illisible, ou cours introuvable dans ce contenu');
    return SORTIE_ERREUR;
  }

  let journaux: readonly (readonly Evenement[])[];
  try {
    if (personne === undefined) {
      journaux = lireJournaux(base, idDuCours).journaux;
    } else {
      const journal = lireJournalDe(base, idDuCours, personne);
      if (journal.length === 0) {
        sortie.err('personne inconnue dans ce cours : aucun rapport écrit');
        return SORTIE_ERREUR;
      }
      journaux = [journal];
    }
  } catch {
    // Le message de la bibliothèque n'est pas repris : la commande ne dit que ce qu'elle sait.
    sortie.err(`base illisible : ${base}`);
    return SORTIE_ERREUR;
  }

  const examen = jusquau ?? memoireDuCours(cours.cours)?.examen;
  const html = construireRapport({
    cours,
    journaux,
    ...(accord === undefined ? {} : { accord }),
    aujourdhui,
    ...(examen === undefined ? {} : { jusquau: examen }),
  });
  try {
    fs.writeFileSync(fichier, html, { flag: valeurs.ecraser === true ? 'w' : 'wx' });
  } catch {
    sortie.err(`sortie impossible à écrire : ${fichier}`);
    return SORTIE_ERREUR;
  }
  if (personne !== undefined) {
    sortie.out('Rapport d’une personne écrit.');
  } else if (journaux.filter((journal) => estActive(journal)).length < PERSONNES_ACTIVES_MINIMUM) {
    sortie.out(
      'Rapport d’ensemble écrit : moins de trois personnes actives, il s’arrête aux totaux.',
    );
  } else {
    sortie.out('Rapport d’ensemble écrit.');
  }
  sortie.out(`Fichier : ${fichier}`);
  sortie.out(
    'Document privé : le poser hors de tout dépôt, ne pas le joindre à une conversation, l’effacer après lecture.',
  );
  return SORTIE_OK;
}

// jscpd:ignore-start — le lancement d'une commande du poste, le même que celui de cli-ajuster.ts
// Lancé directement (`pnpm memoire:rapport`) : le code de sortie se fixe sans `process.exit`, pour que
// la sortie standard soit vidée avant la fin du processus.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await executer(process.argv.slice(2), {
    out: (ligne) => process.stdout.write(`${ligne}\n`),
    err: (ligne) => process.stderr.write(`${ligne}\n`),
  });
}
// jscpd:ignore-end
