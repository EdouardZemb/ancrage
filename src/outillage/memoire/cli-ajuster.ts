import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ajuster, MINIMUM_DE_REVUES, type Qualite } from './ajuster.js';
import { chapitresAAjuster, garderLesCartes } from './cartes-a-ajuster.js';
import { lireCours } from './lire-cours.js';
import { lireJournaux, messageDeBaseIllisible } from './lire-journaux.js';

/*
 * `pnpm memoire:ajuster --base <copie.sqlite> --cours <id> --contenu <dossier> [--chapitre <module de
 * cartes>]…` : ajuste les 21 poids de FSRS-6 sur les journaux d'un cours, lus dans une copie de la
 * base, et écrit le bloc à coller dans le manifeste, puis la qualité de la prédiction avant et
 * après. Un outil du poste, hors de l'image (M3).
 *
 * Il n'apprend que sur les réponses aux cartes que FSRS planifiera : celles des `--chapitre` donnés ;
 * sinon celles de `chapitres` du manifeste s'il est en `par-chapitre` ; sinon celles de tous les
 * modules de cartes du cours. Le seuil de 1 000 révisions et la qualité se calculent sur ce filtre.
 *
 * Codes : 0 ajusté ; 2 moins de 1 000 révisions exploitables, aucun paramètre écrit ; 64 usage (dont
 * un `--chapitre` qui n'est pas un module de cartes du cours) ; 1 base ou contenu illisible, ou base
 * en mode WAL. Rien de ce qui nomme une personne n'est lu jusqu'ici, donc rien ne s'écrit.
 */

const SORTIE_OK = 0;
const SORTIE_ERREUR = 1;
const SORTIE_TROP_PEU = 2;
const SORTIE_USAGE = 64;

const USAGE =
  'usage : pnpm memoire:ajuster --base <copie.sqlite> --cours <identifiant du cours> --contenu <dossier> [--chapitre <identifiant d’un module de cartes>]…';

export interface Sortie {
  out: (ligne: string) => void;
  err: (ligne: string) => void;
}

const pourcent = (part: number): string => `${(part * 100).toFixed(1)} %`;

function ecrireQualite(titre: string, qualite: Qualite, sortie: Sortie): void {
  sortie.out(`${titre} : perte logarithmique ${qualite.perte.toFixed(4)}`);
  sortie.out('  tranche prédite    révisions   prédite    observée');
  for (const { de, a, revues, predite, observee } of qualite.tranches) {
    const tranche = `${de} à ${a} %`.padEnd(16);
    const detail =
      revues === 0
        ? '-          -'
        : `${pourcent(predite).padStart(7)}    ${pourcent(observee).padStart(7)}`;
    sortie.out(`  ${tranche}${String(revues).padStart(9)}   ${detail}`);
  }
}

/** Lance la commande ; rend le code de sortie. Ne lève jamais. */
export async function executer(argv: readonly string[], sortie: Sortie): Promise<number> {
  let valeurs: { base?: string; cours?: string; contenu?: string; chapitre?: string[] };
  try {
    const lus = parseArgs({
      args: [...argv],
      options: {
        base: { type: 'string' },
        cours: { type: 'string' },
        contenu: { type: 'string' },
        chapitre: { type: 'string', multiple: true },
      },
      allowPositionals: false,
      strict: true,
    });
    valeurs = lus.values;
  } catch {
    sortie.err(USAGE);
    return SORTIE_USAGE;
  }
  const { base, cours, contenu, chapitre = [] } = valeurs;
  if (!base || !cours || !contenu) {
    sortie.err(USAGE);
    return SORTIE_USAGE;
  }

  const prepare = lireCours(contenu, cours);
  if (prepare === undefined) {
    sortie.err('contenu illisible, ou cours introuvable dans ce contenu');
    return SORTIE_ERREUR;
  }
  const choisis = chapitresAAjuster(prepare, chapitre);
  if ('inconnu' in choisis) {
    sortie.err(`--chapitre ${choisis.inconnu} n’est pas un module de cartes de ce cours`);
    sortie.err(USAGE);
    return SORTIE_USAGE;
  }

  let lus: ReturnType<typeof lireJournaux>['journaux'];
  try {
    lus = lireJournaux(base, cours).journaux;
  } catch (erreur) {
    // Le message de la bibliothèque n'est pas repris : la commande ne dit que ce qu'elle sait.
    sortie.err(messageDeBaseIllisible(erreur, base));
    return SORTIE_ERREUR;
  }
  const { journaux, ecartees } = garderLesCartes(lus, prepare, choisis.chapitres);

  let ajustement: Awaited<ReturnType<typeof ajuster>>;
  try {
    ajustement = await ajuster(journaux);
  } catch (erreur) {
    sortie.err(`ajustement impossible : ${erreur instanceof Error ? erreur.message : 'erreur'}`);
    return SORTIE_ERREUR;
  }
  if (!ajustement.ajuste) {
    sortie.err(
      `${ajustement.revues} révisions exploitables, moins de ${MINIMUM_DE_REVUES} : aucun paramètre écrit (${ecartees} réponse(s) écartée(s))`,
    );
    return SORTIE_TROP_PEU;
  }

  sortie.out(
    '# À coller dans la clé `memoire` du manifeste du cours (docs/format-des-contenus.md)',
  );
  sortie.out(`parametres: [${ajustement.parametres.map((poids) => poids.toFixed(4)).join(', ')}]`);
  sortie.out('');
  sortie.out(`${ajustement.revues} révisions exploitables, tous comptes confondus.`);
  sortie.out(
    `Appris sur les cartes de ${choisis.chapitres.size} module(s) ; ${ecartees} réponse(s) écartée(s) (autres modules, mots, points, exercices, fiches).`,
  );
  sortie.out('');
  ecrireQualite('Avant (poids par défaut)', ajustement.avant, sortie);
  sortie.out('');
  ecrireQualite('Après (poids ajustés)', ajustement.apres, sortie);
  return SORTIE_OK;
}

// Lancé directement (`pnpm memoire:ajuster`) : le code de sortie se fixe sans `process.exit`, pour que
// la sortie standard soit vidée avant la fin du processus.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  process.exitCode = await executer(process.argv.slice(2), {
    out: (ligne) => process.stdout.write(`${ligne}\n`),
    err: (ligne) => process.stderr.write(`${ligne}\n`),
  });
}
